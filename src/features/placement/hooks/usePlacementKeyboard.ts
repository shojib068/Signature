import { useEffect, useRef } from 'react';

interface Handlers {
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Delete/Backspace removes, arrows nudge 1 pt (10 pt with Shift), Escape deselects (FR-11). */
export function usePlacementKeyboard(active: boolean, handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      const arrow = ARROWS[event.key];
      if (arrow) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        latest.current.onNudge(arrow[0] * step, arrow[1] * step);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        latest.current.onDelete();
      } else if (event.key === 'Escape') {
        latest.current.onDeselect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
