import { describe, expect, it } from 'vitest';
import type { PageSize } from '../../../shared/types';
import { PAGE_GAP, PAGE_PADDING, fitWidthZoom, mostVisiblePage, nextZoomStep, pageTops, pagesInBand } from './layout';
import { paragraphMapFromEntries } from './paragraphPageMap';

const page = (height = 100): PageSize => ({ width: 100, height, rotation: 0 });

describe('paragraphMapFromEntries', () => {
  it('builds a dense map and fills gaps from the previous paragraph', () => {
    expect(paragraphMapFromEntries([[0, 0], [1, 0], [3, 2], [4, 3]])).toEqual([0, 0, 0, 2, 3]);
    expect(paragraphMapFromEntries([])).toEqual([]);
  });
});

describe('layout', () => {
  const sizes = [page(), page(), page()];
  it('computes page tops from padding and gaps', () => {
    expect(pageTops(sizes, 2)).toEqual([PAGE_PADDING, PAGE_PADDING + 200 + PAGE_GAP, PAGE_PADDING + 400 + 2 * PAGE_GAP]);
  });
  it('finds the most visible page and the pages near the viewport', () => {
    const tops = pageTops(sizes, 1);
    expect(mostVisiblePage(sizes, 1, tops[1] - 10, tops[1] + 90)).toBe(1);
    expect([...pagesInBand(sizes, 1, tops[2] + 1, tops[2] + 50)]).toEqual([2]);
  });
  it('steps zoom through the fixed levels', () => {
    expect(nextZoomStep(1, 1)).toBe(1.25);
    expect(nextZoomStep(1.1, -1)).toBe(1);
    expect(nextZoomStep(3, 1)).toBe(3);
  });
  it('fits the widest page into the container', () => {
    expect(fitWidthZoom([page()], 100 * 1.5 + PAGE_PADDING * 2)).toBeCloseTo(1.5);
  });
});
