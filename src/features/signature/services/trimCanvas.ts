export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of pixels with alpha above `threshold`, grown by `padding` and clipped
 * to the image. Returns null for an image with no ink.
 */
export function findInkBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  padding = 4,
  threshold = 8,
): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  return {
    x,
    y,
    width: Math.min(width, maxX + 1 + padding) - x,
    height: Math.min(height, maxY + 1 + padding) - y,
  };
}

/** Size that fits within `maxWidth` while keeping the aspect ratio; never upscales. */
export function fitWidth(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}
