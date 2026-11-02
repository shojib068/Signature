import type { AppError } from '../shared/errors';
import type { LoadedDocument, Placement, Signature } from '../shared/types';

export interface AppState {
  doc: LoadedDocument | null;
  /** A library: each signature can be placed many times (FR-12). */
  signatures: Signature[];
  placements: Placement[];
  selectedPlacementId: string | null;
  /** 0.5–3.0, display only. Never affects stored coordinates. */
  zoom: number;
  status: 'idle' | 'loading' | 'exporting';
  error: AppError | null;
}

export type Action =
  | { type: 'DOC_LOADED'; doc: LoadedDocument }
  | { type: 'RESET' }
  | { type: 'SIGNATURE_ADDED'; signature: Signature }
  | { type: 'SIGNATURE_REMOVED'; id: string }
  | { type: 'PLACEMENT_ADDED'; placement: Placement }
  | { type: 'PLACEMENT_UPDATED'; id: string; patch: Partial<Placement> }
  | { type: 'PLACEMENT_REMOVED'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'ZOOM'; zoom: number }
  | { type: 'STATUS'; status: AppState['status'] }
  | { type: 'ERROR'; error: AppError | null };

export const initialState: AppState = {
  doc: null,
  signatures: [],
  placements: [],
  selectedPlacementId: null,
  zoom: 1,
  status: 'idle',
  error: null,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'DOC_LOADED':
      // Signatures are kept so the same one can sign the next document too.
      return { ...state, doc: action.doc, placements: [], selectedPlacementId: null, status: 'idle', error: null };
    case 'RESET':
      return { ...state, doc: null, placements: [], selectedPlacementId: null, status: 'idle', error: null };
    case 'SIGNATURE_ADDED':
      return { ...state, signatures: [...state.signatures, action.signature] };
    case 'SIGNATURE_REMOVED': {
      const placements = state.placements.filter((p) => p.signatureId !== action.id);
      const selectedStillExists = placements.some((p) => p.id === state.selectedPlacementId);
      return {
        ...state,
        signatures: state.signatures.filter((s) => s.id !== action.id),
        placements,
        selectedPlacementId: selectedStillExists ? state.selectedPlacementId : null,
      };
    }
    case 'PLACEMENT_ADDED':
      return { ...state, placements: [...state.placements, action.placement], selectedPlacementId: action.placement.id };
    case 'PLACEMENT_UPDATED':
      return {
        ...state,
        placements: state.placements.map((p) => (p.id === action.id ? { ...p, ...action.patch, id: p.id } : p)),
      };
    case 'PLACEMENT_REMOVED':
      return {
        ...state,
        placements: state.placements.filter((p) => p.id !== action.id),
        selectedPlacementId: state.selectedPlacementId === action.id ? null : state.selectedPlacementId,
      };
    case 'SELECT':
      return state.selectedPlacementId === action.id ? state : { ...state, selectedPlacementId: action.id };
    case 'ZOOM':
      return { ...state, zoom: action.zoom };
    case 'STATUS':
      return { ...state, status: action.status };
    case 'ERROR':
      return { ...state, error: action.error, status: action.error ? 'idle' : state.status };
  }
}
