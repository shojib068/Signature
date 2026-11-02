import { describe, expect, it } from 'vitest';
import { clampToPage, defaultPlacement, pageAtPoint, ptToPx, pxToPt, screenRectToPagePt } from './geometry';

const A4 = { width: 595.28, height: 841.89 };

describe('px ↔ pt', () => {
  it.each([0.5, 1, 1.5, 3])('round-trips at zoom %s', (zoom) => {
    expect(pxToPt(ptToPx(123.4, zoom), zoom)).toBeCloseTo(123.4, 10);
  });

  it('matches the tech spec worked example at 150%', () => {
    expect([400, 700, 150, 50].map((v) => ptToPx(v, 1.5))).toEqual([600, 1050, 225, 75]);
  });
});

describe('defaultPlacement', () => {
  it('is 150 pt wide, centred, with the signature aspect ratio', () => {
    const p = defaultPlacement({ id: 's', naturalWidth: 600, naturalHeight: 200 }, 2, A4, 'p');
    expect(p).toMatchObject({ id: 'p', signatureId: 's', pageIndex: 2, width: 150, height: 50 });
    expect(p.x).toBeCloseTo((A4.width - 150) / 2);
    expect(p.y).toBeCloseTo((A4.height - 50) / 2);
  });

  it('shrinks a very tall signature to fit the page', () => {
    const p = defaultPlacement({ id: 's', naturalWidth: 10, naturalHeight: 1000 }, 0, A4, 'p');
    expect(p.height).toBeLessThanOrEqual(A4.height + 1e-9);
    expect(p.height / p.width).toBeCloseTo(100);
  });
});

describe('clampToPage', () => {
  it('moves a box back inside the page', () => {
    expect(clampToPage({ x: -10, y: 900, width: 100, height: 20 }, A4)).toMatchObject({ x: 0, y: A4.height - 20 });
  });

  it('shrinks an oversized box keeping its aspect ratio', () => {
    const b = clampToPage({ x: 0, y: 0, width: 1000, height: 500 }, A4);
    expect(b.width).toBeCloseTo(A4.width);
    expect(b.height / b.width).toBeCloseTo(0.5);
  });

  it('enforces the minimum width', () => {
    const b = clampToPage({ x: 0, y: 0, width: 5, height: 1 }, A4);
    expect(b.width).toBe(20);
    expect(b.height).toBeCloseTo(4);
  });
});

describe('screenRectToPagePt', () => {
  it('converts a dropped rectangle to page points and keeps the exact aspect ratio', () => {
    const box = screenRectToPagePt({ x: 700, y: 1100, width: 225, height: 76 }, { x: 100, y: 50 }, 1.5, 1 / 3, A4);
    expect(box).toEqual({ x: 400, y: 700, width: 150, height: 50 });
  });
});

describe('pageAtPoint', () => {
  const pages = [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 0, y: 116, width: 100, height: 100 },
  ];
  it('finds the containing page, or the nearest one in the gap', () => {
    expect(pageAtPoint(pages, 50, 150)).toBe(1);
    expect(pageAtPoint(pages, 50, 105)).toBe(0);
    expect(pageAtPoint(pages, 50, 112)).toBe(1);
  });
});
