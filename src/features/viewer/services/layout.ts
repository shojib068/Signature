import type { PageSize } from '../../../shared/types';

/** Space around and between pages, in CSS px. Shared by the DOM layout and the scroll math. */
export const PAGE_GAP = 16;
export const PAGE_PADDING = 24;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const EPS = 0.001;
  if (direction > 0) return ZOOM_STEPS.find((s) => s > zoom + EPS) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - EPS) ?? ZOOM_MIN;
}

/** Top offset of every page inside the scroll content, in px. */
export function pageTops(sizes: PageSize[], zoom: number): number[] {
  const tops: number[] = [];
  let y = PAGE_PADDING;
  for (const size of sizes) {
    tops.push(y);
    y += size.height * zoom + PAGE_GAP;
  }
  return tops;
}

/** The page that covers most of the visible band [top, bottom]. */
export function mostVisiblePage(sizes: PageSize[], zoom: number, top: number, bottom: number): number {
  const tops = pageTops(sizes, zoom);
  let best = 0;
  let bestOverlap = -1;
  tops.forEach((pageTop, i) => {
    const pageBottom = pageTop + sizes[i].height * zoom;
    const overlap = Math.min(bottom, pageBottom) - Math.max(top, pageTop);
    if (overlap > bestOverlap) {
      best = i;
      bestOverlap = overlap;
    }
  });
  return best;
}

/** Pages overlapping [top, bottom]; used to render only what's near the viewport. */
export function pagesInBand(sizes: PageSize[], zoom: number, top: number, bottom: number): Set<number> {
  const result = new Set<number>();
  pageTops(sizes, zoom).forEach((pageTop, i) => {
    if (pageTop < bottom && pageTop + sizes[i].height * zoom > top) result.add(i);
  });
  return result;
}

export function fitWidthZoom(sizes: PageSize[], containerWidth: number): number {
  const widest = Math.max(...sizes.map((s) => s.width), 1);
  return clampZoom((containerWidth - PAGE_PADDING * 2) / widest);
}
