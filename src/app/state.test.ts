import { describe, expect, it } from 'vitest';
import type { LoadedDocument, Placement, Signature } from '../shared/types';
import { initialState, reducer, type AppState } from './state';

const sig = (id: string) => ({ id, source: 'draw', png: new Uint8Array(), previewUrl: '', naturalWidth: 3, naturalHeight: 1 }) as Signature;
const placement = (id: string, signatureId: string): Placement => ({ id, signatureId, pageIndex: 0, x: 0, y: 0, width: 30, height: 10 });

function withSignatures(): AppState {
  let s = reducer(initialState, { type: 'SIGNATURE_ADDED', signature: sig('a') });
  s = reducer(s, { type: 'SIGNATURE_ADDED', signature: sig('b') });
  return s;
}

describe('reducer', () => {
  it('places the same signature many times (FR-12)', () => {
    let s = withSignatures();
    s = reducer(s, { type: 'PLACEMENT_ADDED', placement: placement('1', 'a') });
    s = reducer(s, { type: 'PLACEMENT_ADDED', placement: placement('2', 'a') });
    s = reducer(s, { type: 'PLACEMENT_ADDED', placement: placement('3', 'b') });
    expect(s.placements.map((p) => p.signatureId)).toEqual(['a', 'a', 'b']);
    expect(s.selectedPlacementId).toBe('3');
  });

  it('removing a signature removes its placements and clears a stale selection', () => {
    let s = withSignatures();
    s = reducer(s, { type: 'PLACEMENT_ADDED', placement: placement('1', 'a') });
    s = reducer(s, { type: 'PLACEMENT_ADDED', placement: placement('2', 'b') });
    s = reducer(s, { type: 'SELECT', id: '1' });
    s = reducer(s, { type: 'SIGNATURE_REMOVED', id: 'a' });
    expect(s.placements.map((p) => p.id)).toEqual(['2']);
    expect(s.selectedPlacementId).toBeNull();
  });

  it('updates a placement without letting the patch change its id', () => {
    let s = reducer(withSignatures(), { type: 'PLACEMENT_ADDED', placement: placement('1', 'a') });
    s = reducer(s, { type: 'PLACEMENT_UPDATED', id: '1', patch: { x: 50, pageIndex: 2, id: 'evil' } });
    expect(s.placements[0]).toMatchObject({ id: '1', x: 50, pageIndex: 2 });
  });

  it('a new document clears placements but keeps signatures', () => {
    let s = reducer(withSignatures(), { type: 'PLACEMENT_ADDED', placement: placement('1', 'a') });
    s = reducer(s, { type: 'DOC_LOADED', doc: {} as LoadedDocument });
    expect(s.placements).toEqual([]);
    expect(s.signatures).toHaveLength(2);
  });
});
