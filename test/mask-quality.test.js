import { describe, expect, it } from 'vitest';
import { assessMaskQuality, fragmentationWarning } from '../src/lib/maskQuality.js';

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

  it('accepts a hide split in two by a shadow, but flags the discarded piece', () => {
    // The failure that costs area: two clean pieces, which the old
    // count > 32 conjunction could never see. maskToPolygon keeps only one.
    const mask = rectangle(100, 100, 10, 10, 60, 60);
    for (let y = 70; y < 90; y++) for (let x = 70; x < 90; x++) mask[y * 100 + x] = 1;

    const quality = assessMaskQuality(mask, 100, 100);

    expect(quality.ok).toBe(true);
    expect(quality.componentCount).toBe(2);
    expect(quality.fragmented).toBe(true);
    expect(quality.largestComponentPixels).toBe(2500);
    expect(quality.discardedPixels).toBe(400);
    expect(quality.largestComponentShare).toBeCloseTo(2500 / 2900);
  });

  it('does not flag a mask with only a speck detached', () => {
    const mask = rectangle(100, 100, 10, 10, 60, 60);
    mask[95 * 100 + 95] = 1;
    const quality = assessMaskQuality(mask, 100, 100);
    expect(quality.componentCount).toBe(2);
    expect(quality.fragmented).toBe(false);
    expect(quality.discardedPixels).toBe(1);
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

describe('fragmentationWarning', () => {
  const split = { fragmented: true, discardedPixels: 400, largestComponentShare: 2500 / 2900 };

  it('says nothing about an intact mask', () => {
    expect(fragmentationWarning({ fragmented: false, discardedPixels: 1 }, 0.8)).toBeNull();
    expect(fragmentationWarning(null, 0.8)).toBeNull();
  });

  it('states the discarded area in dm2 when the scale is known', () => {
    // 400 px at 2 mm/px is 1600 mm2, which is 0.16 dm2.
    expect(fragmentationWarning(split, 2)).toBe('Mask is split: about 0.2 dm² outside the largest piece is not measured.');
  });

  it('avoids reporting a rounded-down zero area', () => {
    expect(fragmentationWarning({ ...split, discardedPixels: 4 }, 0.5)).toContain('under 0.1 dm²');
  });

  it('falls back to a share when there is no calibration yet', () => {
    expect(fragmentationWarning(split, null)).toBe('Mask is split: about 14% of it lies outside the largest piece and is not measured.');
  });
});