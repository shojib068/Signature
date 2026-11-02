import { UploadDropzone } from '../features/upload';

interface LandingScreenProps {
  onFile: (file: File) => void;
  busy: boolean;
  acceptsWord: boolean;
}

export function LandingScreen({ onFile, busy, acceptsWord }: LandingScreenProps) {
  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="wordmark">
          <PenMark /> Free Document Signer
        </span>
      </header>

      <main className="landing-main">
        <div className="landing-copy">
          <h1>Sign a PDF or Word document in your browser.</h1>
          <p className="lede">
            Draw your signature or upload a picture of it, drop it where it belongs, and download the signed file. No
            account, no fee, no watermark.
          </p>
        </div>

        <UploadDropzone onFile={onFile} busy={busy} acceptsWord={acceptsWord} />

        <ol className="steps">
          <li>
            <strong>Open your document</strong>
            <span>{acceptsWord ? 'PDF or Word, up to 20 MB.' : 'PDF, up to 20 MB.'}</span>
          </li>
          <li>
            <strong>Make your signature</strong>
            <span>Draw it with a mouse, finger or stylus, or upload a photo. White paper is removed for you.</span>
          </li>
          <li>
            <strong>Place it</strong>
            <span>Drag it anywhere, resize it from the corners, add as many as you need.</span>
          </li>
          <li>
            <strong>Download</strong>
            <span>Save as PDF or Word. Your signature stays exactly where you put it.</span>
          </li>
        </ol>

        <section className="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">What happens to your file</h2>
          <p>
            PDFs are signed entirely on your device and never uploaded. Word files, and PDFs you save as Word, are
            converted on our server, then deleted as soon as the converted file is sent back. Nothing is stored, logged
            or tracked, and there are no accounts.
          </p>
        </section>
      </main>
    </div>
  );
}

export function PenMark() {
  return (
    <svg className="pen-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M2 17c3-1 4.5-6 6.5-6S9 16 11 16s3.5-4 5-4 1.5 2 3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
