import { useEffect, useState } from 'react';
import { nextZoomStep } from '../services/layout';

interface ViewerToolbarProps {
  pageIndex: number;
  pageCount: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onGoToPage: (pageIndex: number) => void;
}

export function ViewerToolbar({ pageIndex, pageCount, zoom, onZoomChange, onFitWidth, onGoToPage }: ViewerToolbarProps) {
  const [draft, setDraft] = useState(String(pageIndex + 1));
  useEffect(() => setDraft(String(pageIndex + 1)), [pageIndex]);

  const commitPage = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isNaN(n)) return setDraft(String(pageIndex + 1));
    const target = Math.min(pageCount, Math.max(1, n)) - 1;
    setDraft(String(target + 1));
    onGoToPage(target);
  };

  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="Document view">
      <div className="tool-group">
        <button
          type="button"
          className="icon-button"
          onClick={() => onGoToPage(pageIndex - 1)}
          disabled={pageIndex <= 0}
          aria-label="Previous page"
        >
          <Chevron direction="up" />
        </button>
        <label className="page-input">
          <span className="sr-only">Page number</span>
          <input
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPage}
            onKeyDown={(e) => e.key === 'Enter' && commitPage()}
            size={3}
          />
          <span aria-hidden="true">of {pageCount}</span>
        </label>
        <button
          type="button"
          className="icon-button"
          onClick={() => onGoToPage(pageIndex + 1)}
          disabled={pageIndex >= pageCount - 1}
          aria-label="Next page"
        >
          <Chevron direction="down" />
        </button>
      </div>

      <div className="tool-group">
        <button type="button" className="icon-button" onClick={() => onZoomChange(nextZoomStep(zoom, -1))} aria-label="Zoom out">
          −
        </button>
        <span className="zoom-readout" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-button" onClick={() => onZoomChange(nextZoomStep(zoom, 1))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="text-button" onClick={onFitWidth}>
          Fit width
        </button>
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={direction === 'up' ? 'M3 9l4-4 4 4' : 'M3 5l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
