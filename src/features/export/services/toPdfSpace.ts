import type { PageSize } from '../../../shared/types';

export interface ViewBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Counter-clockwise degrees for pdf-lib's `rotate`. */
  rotate: number;
}

/**
 * Maps a point in the rotated, top-left-origin page view (what the user sees, in pt)
 * to PDF user space. Matches PDF.js' viewport at scale 1 (tech spec §6.2).
 */
export function viewToPdfPoint(vx: number, vy: number, box: ViewBox, rotation: PageSize['rotation']): [number, number] {
  switch (rotation) {
    case 90:
      return [box.x0 + vy, box.y0 + vx];
    case 180:
      return [box.x1 - vx, box.y0 + vy];
    case 270:
      return [box.x1 - vy, box.y1 - vx];
    default:
      return [box.x0 + vx, box.y1 - vy];
  }
}

/**
 * The image's visual bottom-left corner becomes its origin in pdf-lib, and it is rotated
 * by the page's /Rotate so it reads upright in any viewer.
 */
export function toPdfSpace(
  box: { x: number; y: number; width: number; height: number },
  viewBox: ViewBox,
  rotation: PageSize['rotation'],
): PdfImagePlacement {
  const [x, y] = viewToPdfPoint(box.x, box.y + box.height, viewBox, rotation);
  return { x, y, width: box.width, height: box.height, rotate: rotation };
}

/** PDF.js shows the CropBox clipped to the MediaBox; use the same box. */
export function visibleBox(
  media: { x: number; y: number; width: number; height: number },
  crop: { x: number; y: number; width: number; height: number },
): ViewBox {
  const norm = (r: typeof media) => ({
    x0: Math.min(r.x, r.x + r.width),
    y0: Math.min(r.y, r.y + r.height),
    x1: Math.max(r.x, r.x + r.width),
    y1: Math.max(r.y, r.y + r.height),
  });
  const m = norm(media);
  const c = norm(crop);
  const box = { x0: Math.max(m.x0, c.x0), y0: Math.max(m.y0, c.y0), x1: Math.min(m.x1, c.x1), y1: Math.min(m.y1, c.y1) };
  return box.x1 > box.x0 && box.y1 > box.y0 ? box : m;
}
