import { describe, expect, it } from 'vitest';
import { removeWhiteBackground } from './removeWhiteBackground';
import { findInkBounds, fitWidth } from './trimCanvas';

const pixel = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);

describe('removeWhiteBackground', () => {
  it('makes white transparent', () => {
    expect(removeWhiteBackground(pixel(255, 255, 255))[3]).toBe(0);
    expect(removeWhiteBackground(pixel(240, 240, 240))[3]).toBe(0);
  });

  it('keeps ink unchanged', () => {
    expect([...removeWhiteBackground(pixel(20, 30, 120))]).toEqual([20, 30, 120, 255]);
    expect(removeWhiteBackground(pixel(200, 200, 200))[3]).toBe(255);
  });

  it('ramps alpha between the two cut-offs', () => {
    expect(removeWhiteBackground(pixel(217.5, 217.5, 217.5))[3]).toBeCloseTo(128, -1);
    expect(removeWhiteBackground(pixel(230, 230, 230, 100))[3]).toBe(Math.round((100 * 5) / 35));
  });

  it('does not modify its input', () => {
    const input = pixel(255, 255, 255);
    removeWhiteBackground(input);
    expect(input[3]).toBe(255);
  });
});

describe('findInkBounds', () => {
  it('returns the padded box around visible pixels', () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    data[(3 * w + 4) * 4 + 3] = 255;
    data[(6 * w + 7) * 4 + 3] = 255;
    expect(findInkBounds(data, w, h, 1)).toEqual({ x: 3, y: 2, width: 6, height: 6 });
  });

  it('returns null for an empty image', () => {
    expect(findInkBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});

describe('fitWidth', () => {
  it('downscales to the max width and never upscales', () => {
    expect(fitWidth(2400, 600, 1200)).toEqual({ width: 1200, height: 300 });
    expect(fitWidth(300, 100, 1200)).toEqual({ width: 300, height: 100 });
  });
});
