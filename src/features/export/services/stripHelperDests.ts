import { PDFArray, PDFDict, PDFHexString, PDFName, PDFString, type PDFDocument, type PDFObject } from 'pdf-lib';
import { helperDestIndex } from '../../../shared/docx/wordXml';

/**
 * Removes the `sigp_*` named destinations added for page mapping, so they never
 * reach the user's file (DOCX input → PDF output, tech spec §5.5).
 */
export function stripHelperDests(pdf: PDFDocument): void {
  const catalog = pdf.catalog;

  const dests = catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
  if (dests) {
    for (const key of dests.keys()) {
      if (helperDestIndex(key.decodeText()) !== null) dests.delete(key);
    }
  }

  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of('Dests'), PDFDict);
  if (tree) pruneNameTree(tree, pdf);
}

function pruneNameTree(node: PDFDict, pdf: PDFDocument): void {
  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) pruneNameTree(kid, pdf);
    }
  }

  const entries = node.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (!entries) return;

  const kept: PDFObject[] = [];
  const keptNames: PDFObject[] = [];
  for (let i = 0; i + 1 < entries.size(); i += 2) {
    const name = entries.get(i);
    const text = name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : '';
    if (helperDestIndex(text) !== null) continue;
    kept.push(name, entries.get(i + 1));
    keptNames.push(name);
  }
  node.set(PDFName.of('Names'), pdf.context.obj(kept));
  if (keptNames.length > 0 && node.has(PDFName.of('Limits'))) {
    node.set(PDFName.of('Limits'), pdf.context.obj([keptNames[0], keptNames[keptNames.length - 1]]));
  }
}
