import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { findTopLevelParagraphs } from '../../../shared/docx/wordXml';
import type { PageSize, Placement, Signature } from '../../../shared/types';
import { STYLES_XML, TINY_PNG, buildDocx, para } from '../../../test/fixtures';
import { anchorParagraph, insertDocxAnchors } from './insertDocxAnchors';

const sig = (id: string): Signature => ({ id, source: 'image', png: TINY_PNG, previewUrl: '', naturalWidth: 3, naturalHeight: 1 });
const A4: PageSize = { width: 595.3, height: 841.9, rotation: 0 };
const placement = (patch: Partial<Placement>): Placement => ({
  id: 'p', signatureId: 'a', pageIndex: 0, x: 400, y: 700, width: 150, height: 50, ...patch,
});

async function run(placements: Placement[], map: number[], body = para('one') + para('two') + '<w:p/>') {
  const docx = await buildDocx(body.replace('<w:r>', '<w:r><w:drawing><wp:inline xmlns:wp="x"><wp:docPr id="5" name="x"/></wp:inline></w:drawing></w:r><w:r>'));
  const result = await insertDocxAnchors(docx, placements, [sig('a'), sig('b')], map, [A4, A4, A4]);
  const zip = await JSZip.loadAsync(result.bytes);
  const read = (name: string) => zip.file(name)!.async('string');
  return { result, zip, doc: await read('word/document.xml'), rels: await read('word/_rels/document.xml.rels'), types: await read('[Content_Types].xml'), read };
}

describe('anchorParagraph', () => {
  it('uses the first paragraph that starts on the page', () => {
    expect(anchorParagraph([0, 0, 1, 1, 3], 1)).toEqual({ paragraphIndex: 2, fallback: false });
  });
  it('falls back to the last paragraph that started earlier', () => {
    expect(anchorParagraph([0, 0, 1, 1, 3], 2)).toEqual({ paragraphIndex: 3, fallback: true });
  });
});

describe('insertDocxAnchors', () => {
  it('adds media, a unique relationship and the PNG content type', async () => {
    const { zip, rels, types } = await run([placement({})], [0, 0, 1]);
    expect(zip.file('word/media/signature_1.png')).toBeTruthy();
    expect(rels).toContain('Id="rIdSig1"');
    expect(rels).toContain('Target="media/signature_1.png"');
    expect(rels).toContain('Id="rId1"');
    expect(types).toContain('<Default Extension="png" ContentType="image/png"/>');
  });

  it('writes page-relative EMU offsets and extent (FR-15)', async () => {
    const { doc } = await run([placement({ x: 400, y: 700, width: 150, height: 50 })], [0, 0, 1]);
    expect(doc).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>5080000</wp:posOffset></wp:positionH>');
    expect(doc).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>8890000</wp:posOffset></wp:positionV>');
    expect(doc).toContain('<wp:extent cx="1905000" cy="635000"/>');
  });

  it('anchors in the first paragraph of the target page, after existing drawing ids', async () => {
    const { doc } = await run([placement({ pageIndex: 1 })], [0, 0, 1]);
    const spans = findTopLevelParagraphs(doc);
    expect(doc.slice(spans[2].start, spans[2].end)).toContain('rIdSig1');
    expect(doc.slice(spans[0].start, spans[1].end)).not.toContain('rIdSig1');
    expect(doc).toContain('<wp:docPr id="6" name="Signature 1"/>');
  });

  it('declares the drawing namespaces it uses', async () => {
    const { doc } = await run([placement({})], [0, 0, 1]);
    for (const prefix of ['wp', 'a', 'pic', 'r']) expect(doc).toContain(`xmlns:${prefix}="`);
  });

  it('reuses one media file per signature and keeps ids unique', async () => {
    const { zip, doc } = await run(
      [placement({ id: '1' }), placement({ id: '2', pageIndex: 1 }), placement({ id: '3', signatureId: 'b' })],
      [0, 0, 1],
    );
    expect(Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith('word/media/'))).toHaveLength(2);
    const ids = [...doc.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('warns when the page has no paragraph start', async () => {
    const { result } = await run([placement({ pageIndex: 2 })], [0, 0, 1]);
    expect(result.warnings.map((w) => w.code)).toEqual(['DOCX_ANCHOR_FALLBACK']);
  });

  it('leaves every other part byte-identical (FR-16)', async () => {
    const { read } = await run([placement({})], [0, 0, 1]);
    expect(await read('word/styles.xml')).toBe(STYLES_XML);
  });
});
