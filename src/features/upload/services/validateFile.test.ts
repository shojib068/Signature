import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocx } from '../../../test/fixtures';
import { validateFile } from './validateFile';

const blob = (bytes: Uint8Array | string) => new Blob([bytes as BlobPart]);

describe('validateFile', () => {
  it('detects PDF from its content regardless of name', async () => {
    await expect(validateFile(blob('%PDF-1.7\n...'))).resolves.toBe('pdf');
  });

  it('detects DOCX by the presence of word/document.xml', async () => {
    await expect(validateFile(blob(await buildDocx('<w:p/>')))).resolves.toBe('docx');
  });

  it('rejects other zip files such as .xlsx', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(validateFile(blob(bytes))).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('rejects unknown content and damaged zips', async () => {
    await expect(validateFile(blob('hello world'))).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
    await expect(validateFile(blob(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])))).rejects.toMatchObject({
      code: 'UNSUPPORTED_TYPE',
    });
  });

  it('rejects files over 20 MB before reading them', async () => {
    const big = { size: 20 * 1024 * 1024 + 1, slice: () => blob('%PDF-') } as unknown as Blob;
    await expect(validateFile(big)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('accepts exactly 20 MB', async () => {
    const edge = new Blob([new Uint8Array(20 * 1024 * 1024)]);
    const bytes = new Uint8Array(await edge.arrayBuffer());
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(validateFile(blob(bytes))).resolves.toBe('pdf');
  });
});
