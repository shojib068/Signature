import { useEffect, useRef, type ReactNode } from 'react';
import type { PageSize } from '../../../shared/types';
import type { PDFDocumentProxy } from '../services/pdfjs';

// Safari refuses canvases much larger than this; above it, render at lower resolution.
const MAX_CANVAS_SIDE = 4096;
const RENDER_DELAY_MS = 80;

interface PageViewProps {
  pdf: PDFDocumentProxy | null;
  pageIndex: number;
  size: PageSize;
  zoom: number;
  /** Close to the viewport: render (or re-render at the current zoom). */
  active: boolean;
  /** Far from the viewport: release the canvas to save memory. */
  release: boolean;
  children?: ReactNode;
}

export function PageView({ pdf, pageIndex, size, zoom, active, release, children }: PageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renderedZoom = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !pdf || !active || renderedZoom.current === zoom) return;

    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    // Short delay so a burst of zoom changes renders once; the old canvas stretches meanwhile.
    const timer = window.setTimeout(async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(zoom * dpr, MAX_CANVAS_SIDE / base.width, MAX_CANVAS_SIDE / base.height);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) return;

        const renderTask = page.render({ canvas, canvasContext, viewport });
        task = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        host.replaceChildren(canvas);
        renderedZoom.current = zoom;
      } catch {
        // Cancelled render or a damaged page: keep whatever was shown before.
      }
    }, RENDER_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, pageIndex, zoom, active]);

  useEffect(() => {
    if (!release || !hostRef.current) return;
    hostRef.current.replaceChildren();
    renderedZoom.current = null;
  }, [release]);

  return (
    <div
      className="page"
      data-page-index={pageIndex}
      style={{ width: size.width * zoom, height: size.height * zoom }}
      aria-label={`Page ${pageIndex + 1}`}
      role="group"
    >
      <div className="page-canvas" ref={hostRef} aria-hidden="true" />
      {children}
    </div>
  );
}
