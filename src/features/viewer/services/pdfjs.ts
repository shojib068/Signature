import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AppError } from '../../../shared/errors';
import type { PageSize } from '../../../shared/types';

export type { PDFDocumentProxy };

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

// Loaded on first use so the upload screen doesn't pay for PDF.js.
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
}

// One open document at a time: the upload step and the viewer share the same parse.
interface CacheEntry {
  bytes: Uint8Array;
  promise: Promise<PDFDocumentProxy>;
  destroy: () => void;
}
let cache: CacheEntry | null = null;

export function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  if (cache?.bytes === bytes) return cache.promise;
  closePdf();

  let task: { destroy: () => Promise<void> } | null = null;
  let destroyed = false;
  const destroy = () => {
    destroyed = true;
    void task?.destroy().catch(() => undefined);
  };

  const promise = loadPdfjs().then(async (pdfjs) => {
    if (destroyed) throw new AppError('CORRUPT_FILE');
    const loadingTask = pdfjs.getDocument({
        // PDF.js transfers the buffer to its worker; pass a copy so our bytes stay usable.
        data: bytes.slice(),
        cMapUrl: `${ASSET_BASE}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
        wasmUrl: `${ASSET_BASE}wasm/`,
        iccUrl: `${ASSET_BASE}iccs/`,
      });
    task = loadingTask;
    try {
      return await loadingTask.promise;
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      throw new AppError(name === 'PasswordException' ? 'ENCRYPTED_PDF' : 'CORRUPT_FILE', error);
    }
  });
  cache = { bytes, promise, destroy };
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

export function closePdf(): void {
  cache?.destroy();
  cache = null;
}

export async function readPageSizes(pdf: PDFDocumentProxy): Promise<PageSize[]> {
  const sizes: PageSize[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { width, height } = page.getViewport({ scale: 1 });
    sizes.push({ width, height, rotation: normalizeRotation(page.rotate) });
  }
  return sizes;
}

export function normalizeRotation(degrees: number): PageSize['rotation'] {
  const r = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return r as PageSize['rotation'];
}
