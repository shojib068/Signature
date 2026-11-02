import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppError } from '../../../shared/errors';
import type { Signature } from '../../../shared/types';
import { createSignature } from '../services/createSignature';
import type { PngResult } from '../services/canvasImage';
import { DrawPad } from './DrawPad';
import { ImageUpload } from './ImageUpload';

interface SignatureDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (signature: Signature) => void;
}

type Tab = 'draw' | 'image';

export function SignatureDialog({ open, onClose, onCreate }: SignatureDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('draw');
  // Shown inside the dialog: a page-level banner would sit behind the modal backdrop.
  const [error, setError] = useState<AppError | null>(null);
  const onError = useCallback((e: AppError) => setError(e), []);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const create = (source: Signature['source']) => (result: PngResult) => {
    setError(null);
    onCreate(createSignature(source, result));
    onClose();
  };

  return (
    <dialog ref={ref} className="sheet signature-dialog" onClose={onClose} aria-labelledby="signature-dialog-title">
      <header className="dialog-header">
        <h2 id="signature-dialog-title">Create a signature</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'draw'} onClick={() => switchTab('draw')}>
          Draw
        </button>
        <button type="button" role="tab" aria-selected={tab === 'image'} onClick={() => switchTab('image')}>
          Upload image
        </button>
      </div>

      {error && (
        <p className="notice notice-error" role="alert">
          {error.userMessage}
        </p>
      )}

      {/* Mounted only while open so the pad sizes itself to the visible dialog. */}
      {open && (
        <div role="tabpanel">
          {tab === 'draw' ? (
            <DrawPad onCreate={create('draw')} onError={onError} />
          ) : (
            <ImageUpload onCreate={create('image')} onError={onError} />
          )}
        </div>
      )}
    </dialog>
  );
}
