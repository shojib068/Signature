import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { looksEncrypted } from './looksEncrypted';

const enc = (s: string) => new TextEncoder().encode(s);

describe('looksEncrypted', () => {
  it('spots an /Encrypt reference or dictionary in the trailer', () => {
    expect(looksEncrypted(enc('%PDF-1.4\n...trailer<</Root 1 0 R/Encrypt 5 0 R>>\n%%EOF'))).toBe(true);
    expect(looksEncrypted(enc('%PDF-1.4\n...trailer<</Root 1 0 R/Encrypt<</Filter/Standard>>>>\n%%EOF'))).toBe(true);
  });

  it('is false for an ordinary PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(looksEncrypted(await doc.save())).toBe(false);
  });
});
