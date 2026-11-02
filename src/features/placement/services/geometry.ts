import type { PageSize, Placement, Signature } from '../../../shared/types';

export const DEFAULT_WIDTH_PT = 150;
export const MIN_WIDTH_PT = 20;
/** A new signature never takes more than this share of the page in either direction. */
const MAX_DEFAULT_SHARE = 0.8;

export const pxToPt = (px: number, zoom: number) => px / zoom;
export const ptToPx = (pt: number, zoom: number) => pt * zoom;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Keeps the box on the page: shrinks it (keeping aspect ratio) if it is larger than
 * the page, then moves it inside. Never makes it smaller than MIN_WIDTH_PT unless the
 * page itself is narrower.
 */
export function clampToPage<T extends Box>(box: T, page: Pick<PageSize, 'width' | 'height'>): T {
  const aspect = box.height / box.width;
  let width = Math.max(box.width, Math.min(MIN_WIDTH_PT, page.width));
  width = Math.min(width, page.width, page.height / aspect);
  const height = width * aspect;
  const x = Math.min(Math.max(box.x, 0), page.width - width);
  const y = Math.min(Math.max(box.y, 0), page.height - height);
  return { ...box, x, y, width, height };
}

/** A new placement centred on the page, 150 pt wide (tech spec §5.4). */
export function defaultPlacement(
  signature: Pick<Signature, 'id' | 'naturalWidth' | 'naturalHeight'>,
  pageIndex: number,
  page: Pick<PageSize, 'width' | 'height'>,
  id: string,
): Placement {
  const aspect = signature.naturalHeight / signature.naturalWidth;
  const width = Math.min(DEFAULT_WIDTH_PT, page.width * MAX_DEFAULT_SHARE, (page.height * MAX_DEFAULT_SHARE) / aspect);
  const height = width * aspect;
  return clampToPage(
    {
      id,
      signatureId: signature.id,
      pageIndex,
      x: (page.width - width) / 2,
      y: (page.height - height) / 2,
      width,
      height,
    },
    page,
  );
}

/**
 * Converts an on-screen rectangle (CSS px) into a box in points relative to the page
 * it was dropped on. Height is derived from width so the aspect ratio stays exact (FR-10).
 */
export function screenRectToPagePt(
  rect: Box,
  pageRect: Pick<Box, 'x' | 'y'>,
  zoom: number,
  aspect: number,
  page: Pick<PageSize, 'width' | 'height'>,
): Box {
  const width = pxToPt(rect.width, zoom);
  return clampToPage(
    {
      x: pxToPt(rect.x - pageRect.x, zoom),
      y: pxToPt(rect.y - pageRect.y, zoom),
      width,
      height: width * aspect,
    },
    page,
  );
}

/** Index of the page whose rectangle contains the point, or else the vertically nearest one. */
export function pageAtPoint(pageRects: Box[], px: number, py: number): number {
  let nearest = 0;
  let nearestDistance = Infinity;
  pageRects.forEach((r, i) => {
    const dx = px < r.x ? r.x - px : px > r.x + r.width ? px - (r.x + r.width) : 0;
    const dy = py < r.y ? r.y - py : py > r.y + r.height ? py - (r.y + r.height) : 0;
    const distance = Math.hypot(dx, dy);
    if (distance < nearestDistance) {
      nearest = i;
      nearestDistance = distance;
    }
  });
  return nearest;
}
