import { useEffect, useState } from 'react';
import { openPdf, type PDFDocumentProxy } from '../services/pdfjs';

export function usePdfDocument(bytes: Uint8Array): PDFDocumentProxy | null {
  const [state, setState] = useState<{ bytes: Uint8Array; pdf: PDFDocumentProxy } | null>(null);

  useEffect(() => {
    let cancelled = false;
    openPdf(bytes)
      .then((pdf) => {
        if (!cancelled) setState({ bytes, pdf });
      })
      .catch(() => undefined); // Upload already reported open errors.
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  return state?.bytes === bytes ? state.pdf : null;
}
