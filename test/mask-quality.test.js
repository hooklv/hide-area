import { describe, expect, it } from 'vitest';
import { assessMaskQuality } from '../src/lib/maskQuality.js';

function rectangle(width, height, x0, y0, x1, y1) {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * width + x] = 1;
  return mask;
}

describe('assessMaskQuality', () => {
  it('accepts a coherent, mid-sized mask', () => {
    const quality = assessMaskQuality(rectangle(100, 100, 20, 20, 80, 80), 100, 100);
    expect(quality.ok).toBe(true);
    expect(quality.coverage).toBe(0.36);
    expect(quality.componentCount).toBe(1);
  });

  it('rejects near-empty and near-full masks', () => {
    expect(assessMaskQuality(rectangle(100, 100, 0, 0, 1, 1), 100, 100).ok).toBe(false);
    expect(assessMaskQuality(rectangle(100, 100, 0, 0, 100, 100), 100, 100).ok).toBe(false);
  });

  it('rejects widely fragmented foreground', () => {
    const mask = new Uint8Array(100 * 100);
    for (let index = 0; index < 40; index++) {
      const x = (index % 10) * 10;
      const y = ((index / 10) | 0) * 20;
      for (let yy = y; yy < y + 5; yy++) for (let xx = x; xx < x + 5; xx++) mask[yy * 100 + xx] = 1;
    }
    const quality = assessMaskQuality(mask, 100, 100);
    expect(quality.ok).toBe(false);
    expect(quality.componentCount).toBe(40);
    expect(quality.largestComponentShare).toBeCloseTo(0.025);
  });
});