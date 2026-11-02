import { escapeXmlAttr, findTopLevelParagraphs, insertIntoParagraphs, mainPrefix, sectionPageWidthsPt, type ParagraphInsert } from '../../../shared/docx/wordXml';
import { AppError, type AppWarning } from '../../../shared/errors';
import type { PageSize, Placement, Signature } from '../../../shared/types';
import { PT_TO_EMU } from '../../../shared/units';

const NS = {
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const BASE_RELATIVE_HEIGHT = 251659264;

export interface DocxAnchorResult {
  bytes: Uint8Array;
  warnings: AppWarning[];
}

export interface AnchorTarget {
  paragraphIndex: number;
  /** True when no paragraph starts on the page and an earlier one is used instead. */
  fallback: boolean;
}

/**
 * Picks the paragraph whose anchor puts a floating image on `pageIndex`: the first one
 * that starts on that page, or else the last one that started before it (tech spec §5.5).
 */
export function anchorParagraph(paragraphPageMap: number[], pageIndex: number): AnchorTarget | null {
  const first = paragraphPageMap.findIndex((page) => page === pageIndex);
  if (first >= 0) return { paragraphIndex: first, fallback: false };
  for (let i = paragraphPageMap.length - 1; i >= 0; i--) {
    if (paragraphPageMap[i] < pageIndex) return { paragraphIndex: i, fallback: true };
  }
  return paragraphPageMap.length > 0 ? { paragraphIndex: 0, fallback: true } : null;
}

const emu = (pt: number) => Math.round(pt * PT_TO_EMU);

/** DOCX → DOCX: inserts each signature as a page-relative floating image (FR-15, tech spec §6.3). */
export async function insertDocxAnchors(
  docxBytes: Uint8Array,
  placements: Placement[],
  signatures: Signature[],
  paragraphPageMap: number[],
  pageSizes: PageSize[],
): Promise<DocxAnchorResult> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(docxBytes);
  const documentPart = zip.file('word/document.xml');
  const relsPart = zip.file('word/_rels/document.xml.rels');
  const typesPart = zip.file('[Content_Types].xml');
  if (!documentPart || !typesPart) throw new AppError('CORRUPT_FILE');

  let documentXml = await documentPart.async('string');
  let relsXml = relsPart
    ? await relsPart.async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let typesXml = await typesPart.async('string');
  const warnings: AppWarning[] = [];

  // 1–2. One media file and one relationship per distinct signature used.
  const existingIds = new Set([...relsXml.matchAll(/\sId\s*=\s*"([^"]+)"/g)].map((m) => m[1]));
  const relIdFor = new Map<string, string>();
  let mediaCounter = 1;
  const newRels: string[] = [];
  for (const signatureId of new Set(placements.map((p) => p.signatureId))) {
    const signature = signatures.find((s) => s.id === signatureId);
    if (!signature) continue;
    while (zip.file(`word/media/signature_${mediaCounter}.png`)) mediaCounter++;
    const fileName = `signature_${mediaCounter}.png`;
    let relId = `rIdSig${mediaCounter}`;
    for (let k = 1; existingIds.has(relId); k++) relId = `rIdSig${mediaCounter}_${k}`;
    existingIds.add(relId);

    zip.file(`word/media/${fileName}`, signature.png);
    newRels.push(`<Relationship Id="${relId}" Type="${IMAGE_REL_TYPE}" Target="media/${fileName}"/>`);
    relIdFor.set(signatureId, relId);
    mediaCounter++;
  }
  relsXml = relsXml.replace(/<\/Relationships>\s*$/, `${newRels.join('')}</Relationships>`);

  // 3. PNG content type.
  if (!/<Default\s[^>]*Extension\s*=\s*"png"/i.test(typesXml)) {
    typesXml = typesXml.replace(/<\/Types>\s*$/, '<Default Extension="png" ContentType="image/png"/></Types>');
  }

  // 4. Anchors.
  const spans = findTopLevelParagraphs(documentXml);
  const map = paragraphPageMap.slice(0, spans.length);
  const p = mainPrefix(documentXml);
  let nextDocPrId = maxDocPrId(documentXml) + 1;
  const sectionWidths = sectionPageWidthsPt(documentXml);
  const inserts = new Map<number, ParagraphInsert>();

  placements.forEach((placement, k) => {
    const relId = relIdFor.get(placement.signatureId);
    if (!relId) return;
    const target = anchorParagraph(map, placement.pageIndex);
    if (!target) throw new AppError('EXPORT_FAILED');
    if (target.fallback) {
      warnings.push({
        code: 'DOCX_ANCHOR_FALLBACK',
        message: `A signature on page ${placement.pageIndex + 1} may shift slightly in Word because that page has no paragraph start.`,
      });
    }

    const box = scaleToSection(placement, pageSizes[placement.pageIndex], sectionWidths);
    const id = nextDocPrId++;
    const run = `<${p}:r><${p}:drawing>${anchorXml(box, id, relId, k)}</${p}:drawing></${p}:r>`;
    const slot = inserts.get(target.paragraphIndex) ?? {};
    // A run at the paragraph's start sits on the page where the paragraph starts. In the
    // fallback case the paragraph started earlier, so its end is closer to the target page.
    if (target.fallback) slot.end = (slot.end ?? '') + run;
    else slot.start = (slot.start ?? '') + run;
    inserts.set(target.paragraphIndex, slot);
  });
  documentXml = insertIntoParagraphs(documentXml, spans, inserts);

  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file('[Content_Types].xml', typesXml);

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, warnings: dedupe(warnings) };
}

/**
 * LibreOffice keeps the DOCX page size, but if the preview width differs from the
 * section width, scale so the signature lands at the same relative spot (tech spec §6.3).
 */
function scaleToSection(placement: Placement, page: PageSize | undefined, sectionWidths: number[]): Placement {
  if (!page || sectionWidths.length !== 1) return placement;
  const sectionWidth = sectionWidths[0];
  if (Math.abs(sectionWidth - page.width) <= 1) return placement;
  if (import.meta.env?.DEV) console.warn('DOCX page width differs from preview; scaling signature position.');
  const s = sectionWidth / page.width;
  return { ...placement, x: placement.x * s, y: placement.y * s, width: placement.width * s, height: placement.height * s };
}

function maxDocPrId(xml: string): number {
  let max = 0;
  for (const m of xml.matchAll(/:docPr\b[^>]*?\sid\s*=\s*"(\d+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export function anchorXml(box: Pick<Placement, 'x' | 'y' | 'width' | 'height'>, docPrId: number, relId: string, order: number): string {
  const cx = emu(box.width);
  const cy = emu(box.height);
  const name = `Signature ${order + 1}`;
  // Namespaces are declared on the elements that use them (as Word itself does for a: and
  // pic:), so the result is valid whatever the root element declares.
  return (
    `<wp:anchor xmlns:wp="${NS.wp}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${BASE_RELATIVE_HEIGHT + order}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.x)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.y)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapNone/>` +
    `<wp:docPr id="${docPrId}" name="${escapeXmlAttr(name)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}">` +
    `<pic:pic xmlns:pic="${NS.pic}">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="signature_${order + 1}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${NS.r}" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor>`
  );
}

function dedupe(warnings: AppWarning[]): AppWarning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => !seen.has(w.message) && seen.add(w.message));
}
