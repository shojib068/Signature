import { useRef, useState, type DragEvent } from 'react';

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  busy: boolean;
  /** False on a static-only deployment with no conversion server: PDF only. */
  acceptsWord: boolean;
}

export function UploadDropzone({ onFile, busy, acceptsWord }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  };

  return (
    <div
      className="dropzone"
      data-dragging={dragging || undefined}
      data-busy={busy || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="dropzone-lines" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="dropzone-sign">
        <p className="dropzone-title">
          {busy ? 'Opening your document…' : dragging ? 'Drop it here' : 'Drop a document to sign'}
        </p>
        <div className="sign-line" aria-hidden="true">
          <span className="sign-x">×</span>
        </div>
        <div className="dropzone-actions">
          <button type="button" className="primary-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose a file
          </button>
          <span className="dropzone-meta">{acceptsWord ? 'PDF or Word (.docx)' : 'PDF'}, up to 20 MB</span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={acceptsWord ? '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '.pdf,application/pdf'}
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
