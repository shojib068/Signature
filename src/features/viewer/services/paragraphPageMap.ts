import { helperDestIndex } from '../../../shared/docx/wordXml';
import type { PDFDocumentProxy } from './pdfjs';

/**
 * Turns (paragraphIndex, pageIndex) pairs into a dense array. A paragraph LibreOffice
 * didn't export a destination for inherits the page of the paragraph before it.
 */
export function paragraphMapFromEntries(entries: Array<[number, number]>): number[] {
  if (entries.length === 0) return [];
  const length = Math.max(...entries.map(([n]) => n)) + 1;
  const sparse: Array<number | undefined> = new Array(length);
  for (const [n, page] of entries) sparse[n] = page;

  const map: number[] = [];
  let last = 0;
  for (let n = 0; n < length; n++) {
    last = sparse[n] ?? last;
    map.push(last);
  }
  return map;
}

/** Reads the `sigp_{n}` named destinations the conversion produced (tech spec §6.4). */
export async function buildParagraphPageMap(pdf: PDFDocumentProxy): Promise<number[]> {
  const raw: unknown = await pdf.getDestinations();
  const dests: Array<[string, unknown]> =
    raw instanceof Map ? [...raw.entries()] : Object.entries((raw ?? {}) as Record<string, unknown>);

  const entries = await Promise.all(
    dests.map(async ([name, dest]): Promise<[number, number] | null> => {
      const n = helperDestIndex(name);
      if (n === null) return null;
      const pageIndex = await destPageIndex(pdf, dest);
      return pageIndex === null ? null : [n, pageIndex];
    }),
  );
  return paragraphMapFromEntries(entries.filter((e): e is [number, number] => e !== null));
}

async function destPageIndex(pdf: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  if (!Array.isArray(dest) || dest.length === 0) return null;
  const target: unknown = dest[0];
  if (typeof target === 'number') return target;
  if (target && typeof target === 'object' && 'num' in target) {
    try {
      return await pdf.getPageIndex(target as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
    } catch {
      return null;
    }
  }
  return null;
}
