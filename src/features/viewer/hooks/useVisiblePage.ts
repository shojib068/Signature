import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { PageSize } from '../../../shared/types';
import { mostVisiblePage, pagesInBand } from '../services/layout';

export interface Visibility {
  current: number;
  /** Pages within one viewport height above or below the visible area. */
  near: Set<number>;
}

export function useVisiblePage(
  scrollerRef: RefObject<HTMLElement | null>,
  sizes: PageSize[],
  zoom: number,
): Visibility {
  const [visibility, setVisibility] = useState<Visibility>({ current: 0, near: new Set([0, 1]) });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const current = mostVisiblePage(sizes, zoom, top, bottom);
    const near = pagesInBand(sizes, zoom, top - el.clientHeight, bottom + el.clientHeight);
    setVisibility((prev) =>
      prev.current === current && sameSet(prev.near, near) ? prev : { current, near },
    );
  }, [scrollerRef, sizes, zoom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const resize = new ResizeObserver(onScroll);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      resize.disconnect();
    };
  }, [scrollerRef, measure]);

  return visibility;
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
