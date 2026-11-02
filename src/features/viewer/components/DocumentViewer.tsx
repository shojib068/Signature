import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type Ref } from 'react';
import type { PageSize } from '../../../shared/types';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { useVisiblePage } from '../hooks/useVisiblePage';
import { PAGE_GAP, PAGE_PADDING, clampZoom, fitWidthZoom, pageTops } from '../services/layout';
import { PageView } from './PageView';

/** Pages further than this from the current page drop their canvas (Safari memory). */
const KEEP_DISTANCE = 5;

export interface DocumentViewerHandle {
  scrollToPage: (pageIndex: number) => void;
  fitWidth: () => number;
}

interface DocumentViewerProps {
  pdfBytes: Uint8Array;
  pageSizes: PageSize[];
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onCurrentPageChange: (pageIndex: number) => void;
  /** Overlay drawn on top of each page, same size as the page. */
  renderOverlay?: (pageIndex: number) => ReactNode;
  /** Clicking empty desk space (not a page overlay item). */
  onBackgroundPointerDown?: () => void;
  ref?: Ref<DocumentViewerHandle>;
}

export function DocumentViewer({
  pdfBytes,
  pageSizes,
  zoom,
  onZoomChange,
  onCurrentPageChange,
  renderOverlay,
  onBackgroundPointerDown,
  ref,
}: DocumentViewerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pdf = usePdfDocument(pdfBytes);
  const { current, near } = useVisiblePage(scrollerRef, pageSizes, zoom);

  // Where the reader is, as (page, fraction of that page), so zoom keeps their place.
  const anchor = useRef({ page: 0, fraction: 0 });
  const lastZoom = useRef(zoom);

  useImperativeHandle(ref, () => ({
    scrollToPage(pageIndex) {
      const el = scrollerRef.current;
      if (!el) return;
      const tops = pageTops(pageSizes, zoom);
      el.scrollTo({ top: tops[pageIndex] - PAGE_PADDING / 2, behavior: 'smooth' });
    },
    fitWidth() {
      return fitWidthZoom(pageSizes, scrollerRef.current?.clientWidth ?? 800);
    },
  }), [pageSizes, zoom]);

  useEffect(() => onCurrentPageChange(current), [current, onCurrentPageChange]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const tops = pageTops(pageSizes, lastZoom.current);
      let index = 0;
      while (index + 1 < tops.length && tops[index + 1] <= el.scrollTop + 1) index++;
      const height = pageSizes[index].height * lastZoom.current + PAGE_GAP;
      anchor.current = { page: index, fraction: (el.scrollTop - tops[index]) / height };
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pageSizes]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || lastZoom.current === zoom) return;
    const ratio = zoom / lastZoom.current;
    lastZoom.current = zoom;
    const { page, fraction } = anchor.current;
    const tops = pageTops(pageSizes, zoom);
    el.scrollTop = tops[page] + fraction * (pageSizes[page].height * zoom + PAGE_GAP);
    el.scrollLeft = el.scrollLeft * ratio;
  }, [zoom, pageSizes]);

  // Ctrl/⌘ + wheel, and trackpad pinch (reported as ctrl + wheel), zoom the document.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoomChange(clampZoom(zoomRef.current * Math.exp(-event.deltaY * 0.01)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onZoomChange]);

  return (
    <div
      className="viewer"
      ref={scrollerRef}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest('.placed-signature')) onBackgroundPointerDown?.();
      }}
    >
      <div className="viewer-pages" data-pages-root style={{ padding: PAGE_PADDING, gap: PAGE_GAP }}>
        {pageSizes.map((size, i) => (
          <PageView
            key={i}
            pdf={pdf}
            pageIndex={i}
            size={size}
            zoom={zoom}
            active={near.has(i)}
            release={!near.has(i) && Math.abs(i - current) > KEEP_DISTANCE}
          >
            {renderOverlay?.(i)}
          </PageView>
        ))}
      </div>
    </div>
  );
}
