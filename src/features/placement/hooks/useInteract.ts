import { useEffect, useRef, type RefObject } from 'react';
import interact from 'interactjs';
import { MIN_WIDTH_PT } from '../services/geometry';

export interface DropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Options {
  zoom: number;
  /** Called once per gesture with the element's final on-screen rectangle. */
  onCommit: (rect: DropRect) => void;
}

/**
 * Drag anywhere in the document and resize from the corners with a fixed aspect ratio.
 * While a gesture runs only CSS is touched; state changes once, at the end, so React
 * re-renders once per gesture instead of on every pointer move.
 */
export function useInteract(ref: RefObject<HTMLElement | null>, { zoom, onCommit }: Options) {
  const latest = useRef({ zoom, onCommit });
  latest.current = { zoom, onCommit };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let dx = 0;
    let dy = 0;
    let saved = { width: '', height: '' };
    const start = () => {
      saved = { width: el.style.width, height: el.style.height };
      el.classList.add('is-dragging');
    };
    // Put back React's styles; the commit re-renders with the new values if they changed.
    const reset = () => {
      dx = 0;
      dy = 0;
      el.style.transform = '';
      el.style.width = saved.width;
      el.style.height = saved.height;
      el.classList.remove('is-dragging');
    };
    const commit = () => {
      const r = el.getBoundingClientRect();
      reset();
      latest.current.onCommit({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    const pagesRoot = el.closest<HTMLElement>('[data-pages-root]') ?? 'parent';
    const scroller = el.closest<HTMLElement>('.viewer') ?? window;

    const interactable = interact(el)
      .draggable({
        ignoreFrom: '.placed-delete',
        autoScroll: { container: scroller, margin: 48 },
        modifiers: [interact.modifiers.restrictRect({ restriction: pagesRoot })],
        listeners: {
          start,
          move(event) {
            dx += event.dx;
            dy += event.dy;
            el.style.transform = `translate(${dx}px, ${dy}px)`;
          },
          end: commit,
        },
      })
      .resizable({
        edges: { left: '.h-l', right: '.h-r', top: '.h-t', bottom: '.h-b' },
        modifiers: [
          interact.modifiers.aspectRatio({
            ratio: 'preserve',
            modifiers: [
              interact.modifiers.restrictEdges({ outer: 'parent' }),
              interact.modifiers.restrictSize({ min: { width: MIN_WIDTH_PT * zoom, height: 1 } }),
            ],
          }),
        ],
        listeners: {
          start,
          move(event) {
            dx += event.deltaRect?.left ?? 0;
            dy += event.deltaRect?.top ?? 0;
            el.style.width = `${event.rect.width}px`;
            el.style.height = `${event.rect.height}px`;
            el.style.transform = `translate(${dx}px, ${dy}px)`;
          },
          end: commit,
        },
      })
      .styleCursor(false);

    return () => interactable.unset();
    // Re-created on zoom so the minimum size tracks it; the element itself never changes.
  }, [ref, zoom]);
}
