/**
 * Reject masks whose gross geometry is characteristic of failed inference.
 * The thresholds are intentionally broad: a valid hide may have small detached
 * regions, but a mostly full-frame or widely scattered mask is not reviewable.
 */
export function assessMaskQuality(mask, width, height) {
  const totalPixels = width * height;
  let foregroundPixels = 0;
  for (let index = 0; index < totalPixels; index++) foregroundPixels += mask[index] ? 1 : 0;

  const coverage = foregroundPixels / totalPixels;
  if (coverage < 0.001 || coverage > 0.9) {
    return {
      ok: false,
      reason: `Mask coverage ${(coverage * 100).toFixed(2)}% is outside the plausible 0.1%-90% range.`,
      coverage,
      foregroundPixels,
      componentCount: 0,
      largestComponentPixels: 0,
      largestComponentShare: 0,
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
  if (componentCount > 32 && largestComponentShare < 0.8) {
    return {
      ok: false,
      reason: `Mask is fragmented across ${componentCount} components; its largest contains only ${(largestComponentShare * 100).toFixed(1)}% of foreground pixels.`,
      coverage,
      foregroundPixels,
      componentCount,
      largestComponentPixels,
      largestComponentShare,
    };
  }
  return { ok: true, coverage, foregroundPixels, componentCount, largestComponentPixels, largestComponentShare };
}