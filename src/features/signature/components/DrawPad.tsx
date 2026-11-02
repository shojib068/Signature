import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { toAppError, type AppError } from '../../../shared/errors';
import { processSignatureCanvas, type PngResult } from '../services/canvasImage';

const INKS = [
  { name: 'Black', value: '#111111' },
  { name: 'Blue', value: '#1d3fbf' },
] as const;

const PAD_OPTIONS = { minWidth: 0.8, maxWidth: 2.6, velocityFilterWeight: 0.6 };
/** Export resolution relative to CSS px, so the signature stays sharp when enlarged. */
const EXPORT_RATIO = 3;

interface DrawPadProps {
  onCreate: (result: PngResult) => void;
  onError: (error: AppError) => void;
}

export function DrawPad({ onCreate, onError }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [ink, setInk] = useState<string>(INKS[0].value);
  const [isEmpty, setIsEmpty] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { ...PAD_OPTIONS, penColor: INKS[0].value });
    padRef.current = pad;
    const onEnd = () => setIsEmpty(pad.isEmpty());
    pad.addEventListener('endStroke', onEnd);

    // Keep strokes when the pad changes size (rotation, window resize).
    const fit = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.fromData(data);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      pad.removeEventListener('endStroke', onEnd);
      pad.off();
      padRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (padRef.current) padRef.current.penColor = ink;
  }, [ink]);

  const undo = () => {
    const pad = padRef.current;
    if (!pad) return;
    pad.fromData(pad.toData().slice(0, -1));
    setIsEmpty(pad.isEmpty());
  };

  const clear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
  };

  const create = async () => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas || pad.isEmpty()) return;
    setBusy(true);
    try {
      const off = document.createElement('canvas');
      off.width = canvas.offsetWidth * EXPORT_RATIO;
      off.height = canvas.offsetHeight * EXPORT_RATIO;
      const offPad = new SignaturePad(off, PAD_OPTIONS);
      off.getContext('2d')?.scale(EXPORT_RATIO, EXPORT_RATIO);
      offPad.fromData(pad.toData());
      offPad.off();
      onCreate(await processSignatureCanvas(off, { removeBackground: false }));
      clear();
    } catch (error) {
      onError(toAppError(error, 'BAD_SIGNATURE_IMAGE'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="draw-pad">
      <div className="pad-surface">
        <canvas ref={canvasRef} className="pad-canvas" aria-label="Signature drawing area. Draw with mouse, finger or stylus." />
        <div className="pad-baseline" aria-hidden="true">
          <span>×</span>
        </div>
        {isEmpty && <p className="pad-hint" aria-hidden="true">Sign above the line</p>}
      </div>

      <div className="pad-controls">
        <fieldset className="ink-picker">
          <legend className="sr-only">Ink colour</legend>
          {INKS.map((option) => (
            <label key={option.value} className="ink-option" title={option.name}>
              <input
                type="radio"
                name="ink"
                value={option.value}
                checked={ink === option.value}
                onChange={() => setInk(option.value)}
              />
              <span className="ink-swatch" style={{ background: option.value }} />
              <span className="sr-only">{option.name}</span>
            </label>
          ))}
        </fieldset>
        <div className="pad-actions">
          <button type="button" className="text-button" onClick={undo} disabled={isEmpty}>
            Undo stroke
          </button>
          <button type="button" className="text-button" onClick={clear} disabled={isEmpty}>
            Clear
          </button>
        </div>
      </div>

      <div className="dialog-footer">
        <button type="button" className="primary-button" onClick={create} disabled={isEmpty || busy}>
          Add signature
        </button>
      </div>
    </div>
  );
}
