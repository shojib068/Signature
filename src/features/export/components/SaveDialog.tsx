import { useEffect, useRef, useState } from 'react';
import { toAppError, type AppError, type AppWarning } from '../../../shared/errors';
import type { ExportFormat, LoadedDocument, Placement, Signature } from '../../../shared/types';
import { downloadBlob } from '../services/download';
import { exportDocument } from '../services/exportDocument';
import { hasDigitalSignatures } from '../services/stampPdf';

interface SaveDialogProps {
  open: boolean;
  doc: LoadedDocument;
  placements: Placement[];
  signatures: Signature[];
  converterAvailable: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onSaved: (fileName: string, warnings: AppWarning[]) => void;
}

const FORMATS: Array<{ value: ExportFormat; label: string; detail: string }> = [
  { value: 'pdf', label: 'PDF', detail: 'Looks the same everywhere. Best for sending.' },
  { value: 'docx', label: 'Word (.docx)', detail: 'Keeps the document editable.' },
];

export function SaveDialog(props: SaveDialogProps) {
  const { open, doc, placements, signatures, converterAvailable, onClose, onBusyChange, onSaved } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<ExportFormat>(doc.kind);
  const [busy, setBusy] = useState(false);
  const [signedBefore, setSignedBefore] = useState(false);
  // Shown inside the dialog: a page-level banner would sit behind the modal backdrop.
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => setFormat(doc.kind), [doc]);

  useEffect(() => {
    if (!open || doc.kind !== 'pdf') return;
    let cancelled = false;
    hasDigitalSignatures(doc.originalBytes).then((value) => !cancelled && setSignedBefore(value));
    return () => {
      cancelled = true;
    };
  }, [open, doc]);

  // PDF → Word is the only path that needs the conversion server once the document is open.
  const needsServer = (f: ExportFormat) => doc.kind === 'pdf' && f === 'docx';
  const unavailable = (f: ExportFormat) => needsServer(f) && !converterAvailable;
  const unsigned = placements.length === 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    onBusyChange(true);
    try {
      const result = await exportDocument(doc, placements, signatures, format);
      downloadBlob(result.blob, result.fileName);
      onSaved(result.fileName, result.warnings);
      onClose();
    } catch (error) {
      setError(toAppError(error, 'EXPORT_FAILED'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="sheet save-dialog"
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      aria-labelledby="save-dialog-title"
    >
      <header className="dialog-header">
        <h2 id="save-dialog-title">Save signed document</h2>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
          ×
        </button>
      </header>

      <fieldset className="format-picker" disabled={busy}>
        <legend>Download as</legend>
        {FORMATS.map((option) => (
          <label key={option.value} className="format-option" data-disabled={unavailable(option.value) || undefined}>
            <input
              type="radio"
              name="format"
              value={option.value}
              checked={format === option.value}
              disabled={unavailable(option.value)}
              onChange={() => setFormat(option.value)}
            />
            <span className="format-text">
              <strong>{option.label}</strong>
              <span>{unavailable(option.value) ? "Not available on this site: Word conversion isn't set up." : option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {needsServer(format) && (
        <p className="notice">
          Word rebuilds the layout from the PDF, so spacing and fonts may differ slightly. Your signature keeps its
          position. This step sends the document to our converter, which deletes it right after.
        </p>
      )}
      {signedBefore && (
        <p className="notice notice-warn">
          This PDF already has a digital signature. Saving a new copy will make that digital signature show as invalid.
        </p>
      )}
      {unsigned && (
        <p className="notice notice-warn">You haven't placed a signature yet. You can still save an unsigned copy.</p>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error.userMessage}
        </p>
      )}

      <div className="dialog-footer">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={save} disabled={busy || unavailable(format)}>
          {busy ? 'Saving…' : unsigned ? 'Save unsigned copy' : 'Save and download'}
        </button>
      </div>
    </dialog>
  );
}
