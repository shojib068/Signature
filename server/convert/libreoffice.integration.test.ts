/**
 * End-to-end checks against a real LibreOffice. Skipped when soffice isn't installed;
 * run them in the Docker image (see README) to verify the DOCX paths.
 */
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareDocxForPreview } from '../../src/features/upload/services/prepareDocxForPreview.ts';
import { insertDocxAnchors } from '../../src/features/export/services/insertDocxAnchors.ts';
import { buildDocx, para, TINY_PNG } from '../../src/test/fixtures.ts';
import { createLibreOfficeConverter, findSoffice, JOB_DIR_PREFIX, type Converter } from './libreoffice.ts';

const soffice = await findSoffice();

async function openWithPdfjs(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

const BREAK = '<w:pageBreakBefore/>';
// p0 p1 on page 1; p2 p3 on page 2; p4 on page 3.
const BODY = para('Paragraph zero') + para('Paragraph one') + para('Paragraph two', BREAK) + para('Paragraph three') + para('Paragraph four', BREAK);

describe.skipIf(!soffice)('LibreOffice conversion', () => {
  let converter: Converter;
  beforeAll(async () => {
    converter = await createLibreOfficeConverter();
  }, 120_000);

  it('turns sigp_* bookmarks into named destinations that give the paragraph → page map', async () => {
    const docx = await buildDocx(BODY);
    const pdfBytes = await converter.convert(Buffer.from(await prepareDocxForPreview(docx)), 'docx-to-pdf');
    const pdf = await openWithPdfjs(new Uint8Array(pdfBytes));
    expect(pdf.numPages).toBe(3);

    const { buildParagraphPageMap } = await import('../../src/features/viewer/services/paragraphPageMap.ts');
    expect(await buildParagraphPageMap(pdf)).toEqual([0, 0, 1, 1, 2]);

    const leftovers = (await readdir(tmpdir())).filter((n) => n.startsWith(JOB_DIR_PREFIX));
    expect(leftovers).toEqual([]);
  }, 60_000);

  it('places a DOCX → DOCX signature at the same spot on the right page (FR-15)', async () => {
    const docx = await buildDocx(BODY);
    const signature = { id: 's', source: 'draw' as const, png: TINY_PNG, previewUrl: '', naturalWidth: 3, naturalHeight: 1 };
    const placement = { id: 'p', signatureId: 's', pageIndex: 1, x: 400, y: 700, width: 150, height: 50 };
    const page = { width: 595.3, height: 841.9, rotation: 0 as const };
    const { bytes } = await insertDocxAnchors(docx, [placement], [signature], [0, 0, 1, 1, 2], [page, page, page]);

    // Render the signed DOCX and find where the image is painted.
    const pdf = await openWithPdfjs(new Uint8Array(await converter.convert(Buffer.from(bytes), 'docx-to-pdf')));
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const found: Array<{ page: number; x: number; y: number; w: number; h: number }> = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pageProxy = await pdf.getPage(i);
      const ops = await pageProxy.getOperatorList();
      const stack: number[][] = [];
      let ctm = [1, 0, 0, 1, 0, 0];
      ops.fnArray.forEach((fn, k) => {
        if (fn === pdfjs.OPS.save) stack.push(ctm);
        else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === pdfjs.OPS.transform) ctm = multiply(ctm, ops.argsArray[k] as number[]);
        else if (fn === pdfjs.OPS.paintImageXObject) {
          const height = pageProxy.view[3];
          found.push({ page: i - 1, x: ctm[4], y: height - (ctm[5] + ctm[3]), w: ctm[0], h: ctm[3] });
        }
      });
    }
    expect(found).toHaveLength(1);
    const [img] = found;
    expect(img.page).toBe(1);
    expect(Math.abs(img.x - 400)).toBeLessThan(1);
    expect(Math.abs(img.y - 700)).toBeLessThan(1);
    expect(Math.abs(img.w - 150)).toBeLessThan(1);
    expect(Math.abs(img.h - 50)).toBeLessThan(1);
  }, 60_000);

  it('converts a PDF to DOCX', async () => {
    const docx = await buildDocx(BODY);
    const pdfBytes = await converter.convert(Buffer.from(docx), 'docx-to-pdf');
    const out = await converter.convert(pdfBytes, 'pdf-to-docx');
    expect(out.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }, 60_000);
});

function multiply(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
