/** Luminance at or above this becomes fully transparent. */
export const WHITE_CUTOFF = 235;
/** Luminance at or below this keeps its original alpha. Between the two, alpha ramps (soft edge, no halo). */
export const INK_CUTOFF = 200;

/**
 * Makes white paper transparent while keeping ink (FR-8). Works on RGBA pixel data
 * and returns a new array; the input is not modified.
 */
export function removeWhiteBackground(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  const span = WHITE_CUTOFF - INK_CUTOFF;

  for (let i = 0; i < out.length; i += 4) {
    const luminance = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    if (luminance >= WHITE_CUTOFF) {
      out[i + 3] = 0;
    } else if (luminance > INK_CUTOFF) {
      out[i + 3] = Math.round((out[i + 3] * (WHITE_CUTOFF - luminance)) / span);
    }
  }
  return out;
}
