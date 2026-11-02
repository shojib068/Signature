import { describe, expect, it } from 'vitest';
import { toPdfSpace, viewToPdfPoint, visibleBox } from './toPdfSpace';

const A4 = { x0: 0, y0: 0, x1: 595.28, y1: 841.89 };

describe('toPdfSpace', () => {
  it('matches the tech spec worked example (A4, no rotation)', () => {
    const r = toPdfSpace({ x: 400, y: 700, width: 150, height: 50 }, A4, 0);
    expect(r.x).toBeCloseTo(400);
    expect(r.y).toBeCloseTo(91.89);
    expect(r.rotate).toBe(0);
  });

  it('honours an offset crop box', () => {
    const r = toPdfSpace({ x: 10, y: 20, width: 30, height: 40 }, { x0: 50, y0: 60, x1: 650, y1: 860 }, 0);
    expect([r.x, r.y]).toEqual([60, 860 - 60]);
  });

  // For each rotation, the image corners after pdf-lib's rotation must land exactly on the
  // view-space box when mapped back through the viewer's rotation.
  it.each([0, 90, 180, 270] as const)('places the image over the box at /Rotate %s', (rotation) => {
    const box = { x: 100, y: 200, width: 150, height: 50 };
    const r = toPdfSpace(box, A4, rotation);
    const rad = (r.rotate * Math.PI) / 180;
    const corner = (u: number, v: number): [number, number] => [
      r.x + u * Math.cos(rad) - v * Math.sin(rad),
      r.y + u * Math.sin(rad) + v * Math.cos(rad),
    ];
    const pdfCorners = [corner(0, 0), corner(r.width, 0), corner(0, r.height), corner(r.width, r.height)];
    const expected = [
      viewToPdfPoint(box.x, box.y + box.height, A4, rotation),
      viewToPdfPoint(box.x + box.width, box.y + box.height, A4, rotation),
      viewToPdfPoint(box.x, box.y, A4, rotation),
      viewToPdfPoint(box.x + box.width, box.y, A4, rotation),
    ];
    pdfCorners.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i][0], 6);
      expect(y).toBeCloseTo(expected[i][1], 6);
    });
  });

  it('maps view corners to the matching page corners for every rotation', () => {
    // Top-left of what the user sees.
    expect(viewToPdfPoint(0, 0, A4, 0)).toEqual([0, A4.y1]);
    expect(viewToPdfPoint(0, 0, A4, 90)).toEqual([0, 0]);
    expect(viewToPdfPoint(0, 0, A4, 180)).toEqual([A4.x1, 0]);
    expect(viewToPdfPoint(0, 0, A4, 270)).toEqual([A4.x1, A4.y1]);
  });
});

describe('visibleBox', () => {
  it('clips the crop box to the media box', () => {
    expect(visibleBox({ x: 0, y: 0, width: 600, height: 800 }, { x: -10, y: 100, width: 300, height: 900 })).toEqual({
      x0: 0,
      y0: 100,
      x1: 290,
      y1: 800,
    });
  });
});
