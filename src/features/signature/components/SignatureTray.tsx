import type { Signature } from '../../../shared/types';

interface SignatureTrayProps {
  signatures: Signature[];
  onPlace: (signature: Signature) => void;
  onRemove: (signature: Signature) => void;
  onNew: () => void;
}

export function SignatureTray({ signatures, onPlace, onRemove, onNew }: SignatureTrayProps) {
  return (
    <section className="tray" aria-labelledby="tray-title">
      <div className="tray-header">
        <h2 id="tray-title">Your signatures</h2>
        <button type="button" className="secondary-button" onClick={onNew}>
          New signature
        </button>
      </div>

      {signatures.length === 0 ? (
        <p className="tray-empty">Draw your signature or upload a picture of it. Then tap it to put it on the page.</p>
      ) : (
        <>
          <p className="tray-hint">Tap a signature to add it to the page you're viewing.</p>
          <ul className="tray-list">
            {signatures.map((signature, i) => (
              <li key={signature.id} className="tray-item">
                <button type="button" className="tray-place" onClick={() => onPlace(signature)}>
                  <img src={signature.previewUrl} alt="" />
                  <span className="sr-only">Place signature {i + 1} on the current page</span>
                </button>
                <button
                  type="button"
                  className="tray-remove"
                  onClick={() => onRemove(signature)}
                  aria-label={`Remove signature ${i + 1} and every copy of it on the document`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
