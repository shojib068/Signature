import { newId, toArrayBuffer } from '../../../shared/bytes';
import type { Signature } from '../../../shared/types';
import type { PngResult } from './canvasImage';

export function createSignature(source: Signature['source'], result: PngResult): Signature {
  return {
    id: newId(),
    source,
    png: result.png,
    previewUrl: URL.createObjectURL(new Blob([toArrayBuffer(result.png)], { type: 'image/png' })),
    naturalWidth: result.width,
    naturalHeight: result.height,
  };
}

export function releaseSignature(signature: Signature): void {
  URL.revokeObjectURL(signature.previewUrl);
}
