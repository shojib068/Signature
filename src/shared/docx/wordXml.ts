/**
 * Minimal WordprocessingML helpers that edit `word/document.xml` by splicing strings.
 *
 * Splicing (instead of DOMParser + XMLSerializer) leaves every byte we don't touch
 * exactly as it was (FR-16), and works the same in the browser and in Node tests.
 */

export const W_MAIN_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const HELPER_BOOKMARK_PREFIX = 'sigp_';

/**
 * Matches a helper destination name as it comes out of the PDF. LibreOffice hex-escapes
 * non-alphanumerics in destination names, so `sigp_12` arrives as `sigp5F12`.
 */
const HELPER_DEST = /^sigp(?:_|5F)(\d+)$/;

/** Paragraph index for a helper destination name, or null for any other name. */
export function helperDestIndex(name: string): number | null {
  const m = HELPER_DEST.exec(name);
  return m ? Number(m[1]) : null;
}

export interface ParagraphSpan {
  /** Index of the `<` of the paragraph's open tag. */
  start: number;
  /** Index just after the paragraph's last character (its close tag or self-closing tag). */
  end: number;
  selfClosing: boolean;
  /** Where leading content goes: after `</w:pPr>` when pPr is the first child, else after the open tag. */
  contentStart: number;
  /** Index of the `<` of `</w:p>`; equals `start` for a self-closing paragraph. */
  closeTagStart: number;
}

// Comments, CDATA, PIs and doctype are matched so their contents are skipped.
// Attribute values are matched as whole quoted strings, so a `>` inside a value is safe.
const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;

/** The prefix bound to the WordprocessingML namespace; Word always uses `w`, but don't assume it. */
export function mainPrefix(xml: string): string {
  const match = new RegExp(`xmlns:([\\w.-]+)\\s*=\\s*["']${escapeRegExp(W_MAIN_NS)}["']`).exec(xml);
  return match ? match[1] : 'w';
}

/**
 * Top-level `w:body/w:p` elements in document order. Paragraphs in tables, text boxes
 * and other containers are skipped: floating images anchored there are positioned
 * relative to the container, not the page (tech spec §6.4).
 */
export function findTopLevelParagraphs(xml: string): ParagraphSpan[] {
  const p = mainPrefix(xml);
  const P = `${p}:p`;
  const PPR = `${p}:pPr`;
  const BODY = `${p}:body`;

  const spans: ParagraphSpan[] = [];
  const stack: string[] = [];
  let current: { start: number; contentStart: number } | null = null;
  let awaitingFirstChild = false;
  let insidePPr = false;

  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(xml); m; m = TOKEN.exec(xml)) {
    const name = m[2];
    if (name === undefined) continue;

    const tagStart = m.index;
    const tagEnd = m.index + m[0].length;
    const isClose = m[1] === '/';
    const isSelfClosing = m[4] === '/';

    if (isClose) {
      stack.pop();
      if (current && insidePPr && name === PPR && stack.length === 3) {
        current.contentStart = tagEnd;
        insidePPr = false;
      }
      if (current && name === P && stack.length === 2) {
        spans.push({ start: current.start, end: tagEnd, selfClosing: false, contentStart: current.contentStart, closeTagStart: tagStart });
        current = null;
      }
      continue;
    }

    const parentIsBody = stack.length === 2 && stack[1] === BODY;
    if (parentIsBody && name === P) {
      if (isSelfClosing) {
        spans.push({ start: tagStart, end: tagEnd, selfClosing: true, contentStart: tagEnd, closeTagStart: tagStart });
      } else {
        current = { start: tagStart, contentStart: tagEnd };
        awaitingFirstChild = true;
      }
    } else if (current && stack.length === 3 && awaitingFirstChild) {
      awaitingFirstChild = false;
      if (name === PPR) {
        if (isSelfClosing) current.contentStart = tagEnd;
        else insidePPr = true;
      }
    }

    if (!isSelfClosing) stack.push(name);
  }

  return spans;
}

export interface ParagraphInsert {
  /** XML placed first in the paragraph, after its pPr. */
  start?: string;
  /** XML placed last in the paragraph, before `</w:p>`. */
  end?: string;
}

/** Inserts XML into chosen paragraphs (keyed by paragraph index). Self-closing paragraphs are expanded. */
export function insertIntoParagraphs(xml: string, spans: ParagraphSpan[], inserts: Map<number, ParagraphInsert>): string {
  const p = mainPrefix(xml);
  const parts: string[] = [];
  let cursor = 0;

  spans.forEach((span, index) => {
    const insert = inserts.get(index);
    if (!insert) return;
    const head = insert.start ?? '';
    const tail = insert.end ?? '';

    if (span.selfClosing) {
      const openTag = xml.slice(span.start, span.end).replace(/\s*\/>$/, '>');
      parts.push(xml.slice(cursor, span.start), openTag, head, tail, `</${p}:p>`);
      cursor = span.end;
      return;
    }
    parts.push(xml.slice(cursor, span.contentStart), head, xml.slice(span.contentStart, span.closeTagStart), tail);
    cursor = span.closeTagStart;
  });

  parts.push(xml.slice(cursor));
  return parts.join('');
}

/**
 * Adds an empty `sigp_{n}` bookmark at the start of every top-level paragraph.
 * LibreOffice turns these into PDF named destinations, which tell the client the
 * page on which each paragraph starts (tech spec §6.4). Only used on a throwaway copy.
 */
export function injectParagraphBookmarks(xml: string): string {
  const p = mainPrefix(xml);
  const spans = findTopLevelParagraphs(xml);
  const base = maxNumericId(xml, p) + 1;

  const inserts = new Map<number, ParagraphInsert>();
  spans.forEach((_, n) => {
    const id = base + n;
    inserts.set(n, {
      start: `<${p}:bookmarkStart ${p}:id="${id}" ${p}:name="${HELPER_BOOKMARK_PREFIX}${n}"/><${p}:bookmarkEnd ${p}:id="${id}"/>`,
    });
  });
  return insertIntoParagraphs(xml, spans, inserts);
}

/** Largest `w:id="N"` in the part, so new ids never collide with bookmarks, comments or revisions. */
export function maxNumericId(xml: string, prefix = mainPrefix(xml)): number {
  const re = new RegExp(`\\s${escapeRegExp(prefix)}:id\\s*=\\s*["'](-?\\d+)["']`, 'g');
  let max = 0;
  for (let m = re.exec(xml); m; m = re.exec(xml)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Distinct section page widths in points (`w:pgSz/@w:w` is in twips). */
export function sectionPageWidthsPt(xml: string): number[] {
  const p = escapeRegExp(mainPrefix(xml));
  const re = new RegExp(`<${p}:pgSz\\b[^>]*?\\s${p}:w\\s*=\\s*["'](\\d+)["']`, 'g');
  const widths = new Set<number>();
  for (let m = re.exec(xml); m; m = re.exec(xml)) widths.add(Number(m[1]) / 20);
  return [...widths];
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
