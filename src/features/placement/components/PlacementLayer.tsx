import type { PageSize, Placement, Signature } from '../../../shared/types';
import { PlacedSignature } from './PlacedSignature';

interface PlacementLayerProps {
  pageIndex: number;
  zoom: number;
  pageSizes: PageSize[];
  placements: Placement[];
  signatures: Signature[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Placement>) => void;
  onRemove: (id: string) => void;
}

export function PlacementLayer({ pageIndex, placements, signatures, ...rest }: PlacementLayerProps) {
  const onPage = placements.filter((p) => p.pageIndex === pageIndex);
  return (
    <div className="placement-layer">
      {onPage.map((placement) => {
        const signature = signatures.find((s) => s.id === placement.signatureId);
        if (!signature) return null;
        return (
          <PlacedSignature
            key={placement.id}
            placement={placement}
            signature={signature}
            zoom={rest.zoom}
            pageSizes={rest.pageSizes}
            selected={rest.selectedId === placement.id}
            onSelect={rest.onSelect}
            onChange={rest.onChange}
            onRemove={rest.onRemove}
          />
        );
      })}
    </div>
  );
}
