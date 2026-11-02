import { PDFDocument, PDFRawStream, decodePDFRawStream, degrees, type PDFArray, type PDFRef } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { TINY_PNG } from '../../../test/fixtures';
import type { Placement, Signature } from '../../../shared/types';
import { stampPdf } from './stampPdf';
import { stripHelperDests } from './stripHelperDests';

const signature: Signature = { id: 's1', source: 'draw', png: TINY_PNG, previewUrl: '', naturalWidth: 3, naturalHeight: 1 };
const place = (patch: Partial<Placement>): Placement => ({
  id: 'p1', signatureId: 's1', pageIndex: 0, x: 400, y: 700, width: 150, height: 50, ...patch,
});

async function makePdf(setup?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  // Leaves the CTM scaled on purpose: the stamp must not inherit it.
  page.pushOperators();
  page.drawText('Original content', { x: 50, y: 800, size: 12 });
  setup?.(doc);
  return doc.save();
}

function streamText(doc: PDFDocument, ref: PDFRef): string {
  const stream = doc.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return '';
  return new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
}

/** The translate (`1 0 0 1 x y cm`) pdf-lib emits right before drawing the image. */
function imageTranslate(doc: PDFDocument, pageIndex: number): [number, number] {
  const page = doc.getPage(pageIndex);
  const refs = (page.node.Contents() as PDFArray | undefined)?.asArray() ?? [];
  for (const ref of refs) {
    const text = streamText(doc, ref as PDFRef);
    if (!text.includes(' Do')) continue;
    const m = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm/.exec(text);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  throw new Error('no image drawn');
}

describe('stampPdf', () => {
  it('draws the signature at the placed position, within ±1 pt (FR-15)', async () => {
    const out = await PDFDocument.load(await stampPdf(await makePdf(), [place({})], [signature]));
    const [x, y] = imageTranslate(out, 0);
    expect(Math.abs(x - 400)).toBeLessThan(1);
    expect(Math.abs(y - 91.89)).toBeLessThan(1);
  });

  it('keeps every original content stream byte-for-byte (FR-16)', async () => {
    const original = await makePdf();
    const before = await PDFDocument.load(original);
    const originalRefs = (before.getPage(0).node.Contents() as PDFArray).asArray() as PDFRef[];
    const originalBytes = originalRefs.map((ref) => (before.context.lookup(ref) as PDFRawStream).contents);

    const after = await PDFDocument.load(await stampPdf(original, [place({})], [signature]));
    originalRefs.forEach((ref, i) => {
      expect((after.context.lookup(ref) as PDFRawStream).contents).toEqual(originalBytes[i]);
    });
  });

  it('embeds a signature once even when it is placed several times (FR-12)', async () => {
    const out = await stampPdf(await makePdf((d) => d.addPage()), [place({}), place({ id: 'p2', pageIndex: 1 })], [signature]);
    const doc = await PDFDocument.load(out);
    const images = doc.context
      .enumerateIndirectObjects()
      .filter(([, obj]) => obj instanceof PDFRawStream && obj.dict.toString().includes('/Subtype /Image'))
      // An RGBA PNG becomes a colour image plus its alpha mask; count the colour images.
      .filter(([, obj]) => (obj as PDFRawStream).dict.toString().includes('/SMask'));
    expect(images).toHaveLength(1);
    expect(imageTranslate(doc, 1)).toBeTruthy();
  });

  it('accounts for page rotation', async () => {
    const pdf = await makePdf((d) => d.getPage(0).setRotation(degrees(90)));
    const out = await PDFDocument.load(await stampPdf(pdf, [place({ x: 100, y: 200 })], [signature]));
    // /Rotate 90: anchor = (x0 + y + h, y0 + x).
    const [x, y] = imageTranslate(out, 0);
    expect(x).toBeCloseTo(250, 3);
    expect(y).toBeCloseTo(100, 3);
  });

  it('rejects encrypted PDFs with a clear code', async () => {
    const encrypted = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R/Encrypt<</Filter/Standard>>>>\n%%EOF',
    );
    await expect(stampPdf(encrypted, [], [])).rejects.toMatchObject({ code: 'ENCRYPTED_PDF' });
  });
});

describe('stripHelperDests', () => {
  it('removes sigp_* named destinations and keeps the rest', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const dest = doc.context.obj([page.ref, 'XYZ', 0, 0, 0]);
    const { PDFString, PDFName } = await import('pdf-lib');
    const names = doc.context.obj({
      Dests: doc.context.obj({
        Names: [PDFString.of('keep_me'), dest, PDFString.of('sigp_0'), dest, PDFString.of('sigp5F1'), dest],
      }),
    });
    doc.catalog.set(PDFName.of('Names'), names);
    doc.catalog.set(PDFName.of('Dests'), doc.context.obj({ sigp_9: dest, other: dest }));

    stripHelperDests(doc);
    const reloaded = await PDFDocument.load(await doc.save());
    const text = new TextDecoder('latin1').decode(await reloaded.save({ useObjectStreams: false }));
    expect(text).not.toContain('sigp');
    expect(text).toContain('keep_me');
    expect(text).toContain('/other');
  });
});
