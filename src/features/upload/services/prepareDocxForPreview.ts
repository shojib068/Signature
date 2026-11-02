import { injectParagraphBookmarks } from '../../../shared/docx/wordXml';
import { AppError } from '../../../shared/errors';

/**
 * Returns a copy of the DOCX with helper bookmarks added, for the preview conversion only.
 * The original bytes are not touched (FR-16).
 */
export async function prepareDocxForPreview(docx: Uint8Array): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(docx);
  } catch (error) {
    throw new AppError('CORRUPT_FILE', error);
  }
  const part = zip.file('word/document.xml');
  if (!part) throw new AppError('UNSUPPORTED_TYPE');

  zip.file('word/document.xml', injectParagraphBookmarks(await part.async('string')));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
