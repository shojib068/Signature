import { useEffect, useRef, useState } from 'react';
import { toAppError, type AppError } from '../../../shared/errors';
import { toArrayBuffer } from '../../../shared/bytes';
import { decodeToCanvas, processSignatureCanvas, validateSignatureImage, type PngResult } from '../services/canvasImage';

interface ImageUploadProps {
  onCreate: (result: PngResult) => void;
  onError: (error: AppError) => void;
}

interface Preview {
  result: PngResult;
  url: string;
}

export function ImageUpload({ onCreate, onError }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ canvas: HTMLCanvasElement; url: string } | null>(null);
  const [keepBackground, setKeepBackground] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoke object URLs we created once they're replaced or the panel closes.
  useEffect(() => {
    if (source) return () => URL.revokeObjectURL(source.url);
  }, [source]);
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    processSignatureCanvas(source.canvas, { removeBackground: !keepBackground })
      .then((result) => {
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([toArrayBuffer(result.png)], { type: 'image/png' }));
        setPreview({ result, url });
      })
      .catch((error: unknown) => !cancelled && onError(toAppError(error, 'BAD_SIGNATURE_IMAGE')));
    return () => {
      cancelled = true;
    };
  }, [source, keepBackground, onError]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await validateSignatureImage(file);
      const canvas = await decodeToCanvas(file);
      setPreview(null);
      setSource({ canvas, url: URL.createObjectURL(file) });
    } catch (error) {
      onError(toAppError(error, 'BAD_SIGNATURE_IMAGE'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="image-upload">
      {!source ? (
        <label className="image-drop">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <strong>Choose a photo or scan of your signature</strong>
          <span>PNG or JPG, up to 5 MB. Sign on plain white paper for the cleanest result.</span>
        </label>
      ) : (
        <>
          <div className="compare">
            <figure>
              <div className="checker">
                <img src={source.url} alt="Your uploaded image" />
              </div>
              <figcaption>Original</figcaption>
            </figure>
            <figure>
              <div className="checker">{preview && <img src={preview.url} alt="Signature as it will be placed" />}</div>
              <figcaption>{keepBackground ? 'Cropped' : 'Background removed'}</figcaption>
            </figure>
          </div>
          <div className="pad-controls">
            <label className="checkbox">
              <input type="checkbox" checked={keepBackground} onChange={(e) => setKeepBackground(e.target.checked)} />
              Keep original background
            </label>
            <label className="text-button">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              Choose another image
            </label>
          </div>
        </>
      )}

      <div className="dialog-footer">
        <button
          type="button"
          className="primary-button"
          disabled={!preview || busy}
          onClick={() => {
            if (!preview) return;
            onCreate(preview.result);
            setSource(null);
            setPreview(null);
          }}
        >
          Add signature
        </button>
      </div>
    </div>
  );
}
