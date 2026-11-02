import { AppError } from '../../../shared/errors';
import { MAGIC, readHead, startsWith } from '../../../shared/bytes';
import { MAX_SIGNATURE_IMAGE_BYTES } from '../../../shared/units';
import { removeWhiteBackground } from './removeWhiteBackground';
import { findInkBounds, fitWidth } from './trimCanvas';

export const MAX_SIGNATURE_WIDTH = 1200;

export interface PngResult {
  png: Uint8Array;
  width: number;
  height: number;
}

export async function validateSignatureImage(file: Blob): Promise<void> {
  if (file.size > MAX_SIGNATURE_IMAGE_BYTES) throw new AppError('BAD_SIGNATURE_IMAGE');
  const head = await readHead(file, 4);
  if (!startsWith(head, MAGIC.png) && !startsWith(head, MAGIC.jpeg)) throw new AppError('BAD_SIGNATURE_IMAGE');
}

/** Draws the image onto a canvas at its natural size. Falls back to <img> where createImageBitmap is missing. */
export async function decodeToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  try {
    const source = await decode(file);
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
    if ('close' in source) source.close();
    return canvas;
  } catch (error) {
    throw new AppError('BAD_SIGNATURE_IMAGE', error);
  }
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Optional background removal, then trim to the ink and cap the width (tech spec §5.3). */
export async function processSignatureCanvas(
  source: HTMLCanvasElement,
  options: { removeBackground: boolean },
): Promise<PngResult> {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new AppError('BAD_SIGNATURE_IMAGE');

  const image = ctx.getImageData(0, 0, source.width, source.height);
  const pixels = options.removeBackground ? removeWhiteBackground(image.data) : image.data;
  const bounds = findInkBounds(pixels, source.width, source.height) ?? {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
  };

  const cleaned = document.createElement('canvas');
  cleaned.width = source.width;
  cleaned.height = source.height;
  // ImageData needs a plain ArrayBuffer-backed array.
  cleaned.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), source.width, source.height), 0, 0);

  const size = fitWidth(bounds.width, bounds.height, MAX_SIGNATURE_WIDTH);
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new AppError('BAD_SIGNATURE_IMAGE');
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(cleaned, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, size.width, size.height);

  return { png: await canvasToPng(out), width: size.width, height: size.height };
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new AppError('BAD_SIGNATURE_IMAGE'));
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}
