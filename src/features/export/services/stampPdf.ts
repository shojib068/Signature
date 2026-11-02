import { AppError } from '../../../shared/errors';
import type { PageSize, Placement, Signature } from '../../../shared/types';
import { toPdfSpace, visibleBox } from './toPdfSpace';

interface StampOptions {
  /** DOCX input only: drop the helper destinations used for page mapping. */
  stripHelperDests?: boolean;
}

/**
 * Draws each placed signature onto a copy of the PDF. Existing content streams are kept
 * as they are and wrapped in q/Q; the signatures go in a new stream (FR-15, FR-16).
 */
export async function stampPdf(
  bytes: Uint8Array,
  placements: Placement[],
  signatures: Signature[],
  options: StampOptions = {},
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');

  let pdf;
  try {
    // ignoreEncryption is never used: it produces broken output.
    pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    // pdf-lib ships ES5 classes, so `instanceof EncryptedPDFError` is unreliable; its message is stable.
    const encrypted = /is encrypted/i.test((error as Error | null)?.message ?? '');
    throw new AppError(encrypted ? 'ENCRYPTED_PDF' : 'CORRUPT_FILE', error);
  }

  if (options.stripHelperDests) {
    const { stripHelperDests } = await import('./stripHelperDests');
    stripHelperDests(pdf);
  }

  const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  for (const placement of placements) {
    const signature = signatures.find((s) => s.id === placement.signatureId);
    if (!signature) continue;

    let image = embedded.get(signature.id);
    if (!image) {
      image = await pdf.embedPng(signature.png);
      embedded.set(signature.id, image);
    }

    const page = pdf.getPage(placement.pageIndex);
    const box = visibleBox(page.getMediaBox(), page.getCropBox());
    const rotation = normalizeRotation(page.getRotation().angle);
    const target = toPdfSpace(placement, box, rotation);
    page.drawImage(image, { x: target.x, y: target.y, width: target.width, height: target.height, rotate: degrees(target.rotate) });
  }

  return pdf.save();
}

function normalizeRotation(angle: number): PageSize['rotation'] {
  return ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as PageSize['rotation'];
}

/** PDFs with digital signatures lose their validity when rewritten; warn the user first. */
export async function hasDigitalSignatures(bytes: Uint8Array): Promise<boolean> {
  const { PDFDocument, PDFDict, PDFName, PDFNumber } = await import('pdf-lib');
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const form = pdf.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    const flags = form?.lookupMaybe(PDFName.of('SigFlags'), PDFNumber);
    return (flags?.asNumber() ?? 0) > 0;
  } catch {
    return false;
  }
}
