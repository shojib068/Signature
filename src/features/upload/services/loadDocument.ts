import { buildParagraphPageMap, openPdf, readPageSizes } from '../../viewer';
import { docxToPdf } from '../../../shared/api/convertClient';
import type { DocKind, LoadedDocument } from '../../../shared/types';
import { AppError } from '../../../shared/errors';
import { looksEncrypted } from './looksEncrypted';
import { prepareDocxForPreview } from './prepareDocxForPreview';

export async function loadDocument(file: File, kind: DocKind): Promise<LoadedDocument> {
  const originalBytes = new Uint8Array(await file.arrayBuffer());

  if (kind === 'pdf') {
    // PDF.js opens owner-password PDFs fine, but they can't be re-saved; say so now, not at export.
    if (looksEncrypted(originalBytes)) throw new AppError('ENCRYPTED_PDF');
    const pdf = await openPdf(originalBytes);
    return { kind, fileName: file.name, originalBytes, previewPdf: originalBytes, pageSizes: await readPageSizes(pdf) };
  }

  const previewPdf = await docxToPdf(await prepareDocxForPreview(originalBytes));
  const pdf = await openPdf(previewPdf);
  const [pageSizes, paragraphPageMap] = await Promise.all([readPageSizes(pdf), buildParagraphPageMap(pdf)]);
  return { kind, fileName: file.name, originalBytes, previewPdf, pageSizes, paragraphPageMap };
}
