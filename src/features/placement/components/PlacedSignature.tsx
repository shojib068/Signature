import { useRef } from 'react';
import type { PageSize, Placement, Signature } from '../../../shared/types';
import { useInteract, type DropRect } from '../hooks/useInteract';
import { pageAtPoint, ptToPx, screenRectToPagePt } from '../services/geometry';

interface PlacedSignatureProps {
  placement: Placement;
  signature: Signature;
  zoom: number;
  pageSizes: PageSize[];
  selected: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Placement>) => void;
  onRemove: (id: string) => void;
}

const HANDLES = [
  { key: 'nw', className: 'h-t h-l' },
  { key: 'ne', className: 'h-t h-r' },
  { key: 'sw', className: 'h-b h-l' },
  { key: 'se', className: 'h-b h-r' },
];

export function PlacedSignature({ placement, signature, zoom, pageSizes, selected, onSelect, onChange, onRemove }: PlacedSignatureProps) {
  const ref = useRef<HTMLDivElement>(null);

  const commit = (rect: DropRect) => {
    // The drop target is whichever page the signature's centre ended up over (cross-page move).
    const pages = [...document.querySelectorAll<HTMLElement>('[data-page-index]')];
    const pageRects = pages.map((p) => toBox(p.getBoundingClientRect()));
    const target = pageAtPoint(pageRects, rect.x + rect.width / 2, rect.y + rect.height / 2);
    const pageIndex = Number(pages[target]?.dataset.pageIndex ?? placement.pageIndex);
    const pageRect = pageRects[target] ?? rect;
    const aspect = signature.naturalHeight / signature.naturalWidth;
    const box = screenRectToPagePt(rect, pageRect, zoom, aspect, pageSizes[pageIndex]);
    onChange(placement.id, { pageIndex, ...box });
    onSelect(placement.id);
  };

  useInteract(ref, { zoom, onCommit: commit });

  return (
    <div
      ref={ref}
      className="placed-signature"
      data-selected={selected || undefined}
      tabIndex={0}
      role="img"
      aria-label={`Signature on page ${placement.pageIndex + 1}. Drag to move. Arrow keys nudge, Delete removes.`}
      style={{
        left: ptToPx(placement.x, zoom),
        top: ptToPx(placement.y, zoom),
        width: ptToPx(placement.width, zoom),
        height: ptToPx(placement.height, zoom),
      }}
      onPointerDown={() => onSelect(placement.id)}
      onFocus={() => onSelect(placement.id)}
    >
      <img src={signature.previewUrl} alt="" draggable={false} />
      {selected && (
        <>
          {HANDLES.map((h) => (
            <span key={h.key} className={`handle handle-${h.key} ${h.className}`} aria-hidden="true" />
          ))}
          <button
            type="button"
            className="placed-delete"
            aria-label="Remove this signature from the page"
            onClick={() => onRemove(placement.id)}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}

function toBox(r: DOMRect) {
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
