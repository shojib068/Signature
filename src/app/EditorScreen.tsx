import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { SaveDialog } from '../features/export';
import { PlacementLayer, clampToPage, defaultPlacement, usePlacementKeyboard } from '../features/placement';
import { SignatureDialog, SignatureTray, releaseSignature } from '../features/signature';
import { DocumentViewer, ViewerToolbar, clampZoom, type DocumentViewerHandle } from '../features/viewer';
import { newId } from '../shared/bytes';
import type { AppWarning } from '../shared/errors';
import type { Placement, Signature } from '../shared/types';
import { ErrorBanner } from './ErrorBanner';
import { PenMark } from './LandingScreen';
import type { Action, AppState } from './state';

interface EditorScreenProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  banner: ReactNode;
  converterAvailable: boolean;
  onStartOver: () => void;
}

/** Opening zoom never exceeds this, so a narrow page isn't blown up on a wide screen. */
const MAX_INITIAL_ZOOM = 1.25;

export function EditorScreen({ state, dispatch, banner, converterAvailable, onStartOver }: EditorScreenProps) {
  const doc = state.doc!;
  const viewerRef = useRef<DocumentViewerHandle>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(state.signatures.length === 0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const setZoom = useCallback((zoom: number) => dispatch({ type: 'ZOOM', zoom: clampZoom(zoom) }), [dispatch]);

  // Open at "fit width" once the viewer has measured itself.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const fit = viewerRef.current?.fitWidth();
      if (fit) setZoom(Math.min(fit, MAX_INITIAL_ZOOM));
    });
    return () => cancelAnimationFrame(frame);
  }, [doc, setZoom]);

  // Leaving with placed signatures loses them; nothing is saved anywhere.
  useEffect(() => {
    if (state.placements.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.placements.length]);

  const place = useCallback(
    (signature: Signature) => {
      const page = Math.min(currentPage, doc.pageSizes.length - 1);
      dispatch({ type: 'PLACEMENT_ADDED', placement: defaultPlacement(signature, page, doc.pageSizes[page], newId()) });
    },
    [currentPage, doc.pageSizes, dispatch],
  );

  const selected = state.placements.find((p) => p.id === state.selectedPlacementId) ?? null;

  usePlacementKeyboard(selected !== null, {
    onNudge(dx, dy) {
      if (!selected) return;
      const moved = clampToPage({ ...selected, x: selected.x + dx, y: selected.y + dy }, doc.pageSizes[selected.pageIndex]);
      dispatch({ type: 'PLACEMENT_UPDATED', id: selected.id, patch: { x: moved.x, y: moved.y } });
    },
    onDelete: () => selected && dispatch({ type: 'PLACEMENT_REMOVED', id: selected.id }),
    onDeselect: () => dispatch({ type: 'SELECT', id: null }),
  });

  const select = useCallback((id: string | null) => dispatch({ type: 'SELECT', id }), [dispatch]);
  const update = useCallback(
    (id: string, patch: Partial<Placement>) => dispatch({ type: 'PLACEMENT_UPDATED', id, patch }),
    [dispatch],
  );
  const remove = useCallback((id: string) => dispatch({ type: 'PLACEMENT_REMOVED', id }), [dispatch]);

  const renderOverlay = (pageIndex: number) => (
    <PlacementLayer
      pageIndex={pageIndex}
      zoom={state.zoom}
      pageSizes={doc.pageSizes}
      placements={state.placements}
      signatures={state.signatures}
      selectedId={state.selectedPlacementId}
      onSelect={select}
      onChange={update}
      onRemove={remove}
    />
  );

  const goToPage = (pageIndex: number) => {
    const target = Math.min(doc.pageSizes.length - 1, Math.max(0, pageIndex));
    viewerRef.current?.scrollToPage(target);
  };

  const onSaved = (fileName: string, warnings: AppWarning[]) => {
    setNotice([`Downloaded ${fileName}.`, ...warnings.map((w) => w.message)].join(' '));
  };

  const busy = state.status === 'exporting';
  const count = state.placements.length;

  return (
    <div className="editor">
      <header className="editor-bar">
        <button type="button" className="brand-button" onClick={onStartOver} title="Close this document and start over">
          <PenMark />
          <span className="brand-text">Start over</span>
        </button>
        <p className="file-name" title={doc.fileName}>
          {doc.fileName}
        </p>
        <ViewerToolbar
          pageIndex={currentPage}
          pageCount={doc.pageSizes.length}
          zoom={state.zoom}
          onZoomChange={setZoom}
          onFitWidth={() => viewerRef.current && setZoom(viewerRef.current.fitWidth())}
          onGoToPage={goToPage}
        />
        <button type="button" className="primary-button save-button" onClick={() => setSaveDialogOpen(true)} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </header>

      {banner}
      {notice && <ErrorBanner tone="info" message={notice} onDismiss={() => setNotice(null)} />}

      <div className="editor-body">
        <aside className="tray-panel" aria-label="Signatures">
          <SignatureTray
            signatures={state.signatures}
            onPlace={place}
            onRemove={(signature) => {
              dispatch({ type: 'SIGNATURE_REMOVED', id: signature.id });
              releaseSignature(signature);
            }}
            onNew={() => setSignatureDialogOpen(true)}
          />
          <p className="placed-count" aria-live="polite">
            {count === 0 ? 'Nothing placed yet.' : `${count} signature${count === 1 ? '' : 's'} placed.`}
          </p>
        </aside>

        <main className="viewer-panel">
          <DocumentViewer
            ref={viewerRef}
            pdfBytes={doc.previewPdf}
            pageSizes={doc.pageSizes}
            zoom={state.zoom}
            onZoomChange={setZoom}
            onCurrentPageChange={setCurrentPage}
            renderOverlay={renderOverlay}
            onBackgroundPointerDown={() => select(null)}
          />
        </main>
      </div>

      <SignatureDialog
        open={signatureDialogOpen}
        onClose={() => setSignatureDialogOpen(false)}
        onCreate={(signature) => {
          dispatch({ type: 'SIGNATURE_ADDED', signature });
          // The first use of a new signature is almost always "put it on this page".
          place(signature);
        }}
      />

      <SaveDialog
        open={saveDialogOpen}
        doc={doc}
        placements={state.placements}
        signatures={state.signatures}
        converterAvailable={converterAvailable}
        onClose={() => setSaveDialogOpen(false)}
        onBusyChange={(b) => dispatch({ type: 'STATUS', status: b ? 'exporting' : 'idle' })}
        onSaved={onSaved}
      />
    </div>
  );
}
