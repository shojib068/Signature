import { pdfToDocx } from '../../../shared/api/convertClient';
import { toArrayBuffer } from '../../../shared/bytes';
import { AppError, toAppError, type AppWarning } from '../../../shared/errors';
import type { ExportFormat, LoadedDocument, Placement, Signature } from '../../../shared/types';
import { MIME, outputFileName } from './download';
import { insertDocxAnchors } from './insertDocxAnchors';
import { stampPdf } from './stampPdf';

export interface ExportResult {
  blob: Blob;
  fileName: string;
  warnings: AppWarning[];
}

/** Runs the export path for this input → output pair (tech spec §2.2). */
export async function exportDocument(
  doc: LoadedDocument,
  placements: Placement[],
  signatures: Signature[],
  format: ExportFormat,
): Promise<ExportResult> {
  try {
    const { bytes, warnings } = await produce(doc, placements, signatures, format);
    return {
      blob: new Blob([toArrayBuffer(bytes)], { type: MIME[format] }),
      fileName: outputFileName(doc.fileName, format),
      warnings,
    };
  } catch (error) {
    throw toAppError(error, 'EXPORT_FAILED');
  }
}

async function produce(
  doc: LoadedDocument,
  placements: Placement[],
  signatures: Signature[],
  format: ExportFormat,
): Promise<{ bytes: Uint8Array; warnings: AppWarning[] }> {
  if (doc.kind === 'pdf' && format === 'pdf') {
    return { bytes: await stampPdf(doc.originalBytes, placements, signatures), warnings: [] };
  }
  if (doc.kind === 'docx' && format === 'pdf') {
    return { bytes: await stampPdf(doc.previewPdf, placements, signatures, { stripHelperDests: true }), warnings: [] };
  }
  if (doc.kind === 'pdf' && format === 'docx') {
    // Stamp first, then convert: the signature reaches Word as an ordinary image (D5).
    const signed = await stampPdf(doc.originalBytes, placements, signatures);
    return { bytes: await pdfToDocx(signed), warnings: [] };
  }
  if (!doc.paragraphPageMap) throw new AppError('EXPORT_FAILED');
  return insertDocxAnchors(doc.originalBytes, placements, signatures, doc.paragraphPageMap, doc.pageSizes);
}
