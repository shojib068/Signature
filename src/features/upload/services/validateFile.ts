import { AppError } from '../../../shared/errors';
import { MAGIC, readHead, startsWith } from '../../../shared/bytes';
import { MAX_FILE_BYTES } from '../../../shared/units';
import type { DocKind } from '../../../shared/types';

/**
 * Decides the document type from its content. Extension and MIME type are ignored
 * because browsers report DOCX MIME types inconsistently (tech spec §5.1).
 */
export async function validateFile(file: Blob): Promise<DocKind> {
  if (file.size > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE');

  const head = await readHead(file);
  if (startsWith(head, MAGIC.pdf)) return 'pdf';
  if (!startsWith(head, MAGIC.zip)) throw new AppError('UNSUPPORTED_TYPE');

  // A zip that isn't a Word document (.xlsx, .pptx, plain .zip) has no word/document.xml.
  const { default: JSZip } = await import('jszip');
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    if (zip.file('word/document.xml')) return 'docx';
  } catch {
    // Unreadable archive: fall through to the same message as any other wrong type.
  }
  throw new AppError('UNSUPPORTED_TYPE');
}
