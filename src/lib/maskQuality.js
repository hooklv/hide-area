/**
 * Two different jobs, deliberately separated.
 *
 * Rejection: masks whose gross geometry is characteristic of failed inference.
 * A plausible-looking wrong number is worse than a visible failure.
 *
 * Warning: masks that are believable but split. `maskToPolygon` keeps only the
 * largest connected component, so every other piece is silently dropped from
 * the measured area. That is a real loss of area on a real object, not noise,
 * and the operator is the only one who can judge whether it matters.
 */

import { MM2_PER_DM2 } from './area.js';

export const COVERAGE_MIN = 0.001;
export const COVERAGE_MAX = 0.9;
// A mask scattered into this many pieces, none of which dominates, is noise.
export const NOISE_COMPONENT_COUNT = 32;
export const NOISE_LARGEST_SHARE = 0.8;
// Below this share, what maskToPolygon discards is worth telling the operator.
export const INTACT_LARGEST_SHARE = 0.95;

export function assessMaskQuality(mask, width, height) {
  const totalPixels = width * height;
  let foregroundPixels = 0;
  for (let index = 0; index < totalPixels; index++) foregroundPixels += mask[index] ? 1 : 0;

  const coverage = foregroundPixels / totalPixels;
  if (coverage < COVERAGE_MIN || coverage > COVERAGE_MAX) {
    return {
      ok: false,
      reason: `Mask coverage ${(coverage * 100).toFixed(2)}% is outside the plausible 0.1%-90% range.`,
      coverage,
      foregroundPixels,
      componentCount: 0,
      largestComponentPixels: 0,
      largestComponentShare: 0,
      discardedPixels: 0,
      fragmented: false,
    };
  }

  const visited = new Uint8Array(totalPixels);
  const stack = new Int32Array(totalPixels);
  let componentCount = 0;
  let largestComponentPixels = 0;
  for (let seed = 0; seed < totalPixels; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    componentCount++;
    let componentPixels = 0;
    let top = 0;
    stack[top++] = seed;
    visited[seed] = 1;
    while (top) {
      const index = stack[--top];
      componentPixels++;
      const x = index % width;
      const y = (index / width) | 0;
      const visit = (next) => {
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          stack[top++] = next;
        }
      };
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    largestComponentPixels = Math.max(largestComponentPixels, componentPixels);
  }

  const largestComponentShare = largestComponentPixels / foregroundPixels;
  const discardedPixels = foregroundPixels - largestComponentPixels;
  const measured = {
    coverage,
    foregroundPixels,
    componentCount,
    largestComponentPixels,
    largestComponentShare,
    discardedPixels,
  };

  if (componentCount > NOISE_COMPONENT_COUNT && largestComponentShare < NOISE_LARGEST_SHARE) {
    return {
      ok: false,
      reason: `Mask is fragmented across ${componentCount} components; its largest contains only ${(largestComponentShare * 100).toFixed(1)}% of foreground pixels.`,
      ...measured,
      fragmented: true,
    };
  }

  // Accepted, but say so when the discarded pieces are not negligible.
  return { ok: true, ...measured, fragmented: largestComponentShare < INTACT_LARGEST_SHARE };
}

/**
 * What the operator loses to the discarded pieces, in dm^2 where the scale is
 * known. mmPerPx is a local scale, so the figure is approximate and is worded
 * that way; it is enough to decide whether the split matters.
 * @returns {string|null} null when the mask is intact enough to say nothing
 */
export function fragmentationWarning(quality, mmPerPx) {
  if (!quality?.fragmented) return null;
  const outside = 1 - quality.largestComponentShare;
  if (Number.isFinite(mmPerPx) && mmPerPx > 0) {
    const dm2 = (quality.discardedPixels * mmPerPx * mmPerPx) / MM2_PER_DM2;
    const shown = dm2 < 0.05 ? 'under 0.1' : dm2.toFixed(1);
    return `Mask is split: about ${shown} dm² outside the largest piece is not measured.`;
  }
  return `Mask is split: about ${(outside * 100).toFixed(0)}% of it lies outside the largest piece and is not measured.`;
}
