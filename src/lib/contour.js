/**
 * Binary mask -> polygon, in image space (pixels of the downscaled photo).
 *
 * The trace follows the cracks between pixels rather than pixel centres, so the
 * traced polygon encloses exactly the foreground pixels: its shoelace area
 * equals the foreground pixel count, with no half-pixel bias. Corner (x, y) of
 * the crack grid sits at image-space position (x, y); pixel (x, y) covers
 * [x, x+1] x [y, y+1].
 */

import simplify from 'simplify-js';

const DIRS = [
  { dx: 1, dy: 0 },  // 0 right
  { dx: 0, dy: 1 },  // 1 down
  { dx: -1, dy: 0 }, // 2 left
  { dx: 0, dy: -1 }, // 3 up
];

/**
 * Largest 4-connected foreground component of a binary mask.
 * @param {Uint8Array|Uint8ClampedArray} mask row-major, non-zero = foreground
 * @param {number} width @param {number} height
 * @returns {{mask:Uint8Array,count:number,start:{x:number,y:number}}|null}
 *   a mask holding only that component, its pixel count, and the topmost-leftmost pixel
 */
export function largestComponent(mask, width, height) {
  const n = width * height;
  const labels = new Int32Array(n); // 0 = background or not yet visited
  const stack = new Int32Array(n);
  let label = 0;
  let bestLabel = 0;
  let bestCount = 0;
  let bestSeed = -1;
  for (let seed = 0; seed < n; seed++) {
    if (!mask[seed] || labels[seed]) continue;
    label++;
    let top = 0;
    stack[top++] = seed;
    labels[seed] = label;
    let count = 0;
    while (top > 0) {
      const idx = stack[--top];
      count++;
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x > 0 && mask[idx - 1] && !labels[idx - 1]) { labels[idx - 1] = label; stack[top++] = idx - 1; }
      if (x < width - 1 && mask[idx + 1] && !labels[idx + 1]) { labels[idx + 1] = label; stack[top++] = idx + 1; }
      if (y > 0 && mask[idx - width] && !labels[idx - width]) { labels[idx - width] = label; stack[top++] = idx - width; }
      if (y < height - 1 && mask[idx + width] && !labels[idx + width]) { labels[idx + width] = label; stack[top++] = idx + width; }
    }
    if (count > bestCount) { bestCount = count; bestLabel = label; bestSeed = seed; }
  }
  if (!bestLabel) return null;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (labels[i] === bestLabel) out[i] = 1;
  // The seed is the first pixel of the component in raster order, i.e. its
  // topmost-leftmost pixel: the corner above-left of it is always a boundary corner.
  return { mask: out, count: bestCount, start: { x: bestSeed % width, y: (bestSeed / width) | 0 } };
}

/**
 * Trace the outer boundary of a single-component mask, walking crack edges with
 * the foreground kept on the right. Holes are ignored by construction.
 * @returns {{x:number,y:number}[]} closed ring of crack-grid corners, image space
 */
export function traceOuterContour(mask, width, height, start) {
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x] ? 1 : 0);
  // A move is legal when the pixel on the right of the direction of travel is
  // foreground and the pixel on its left is background.
  const legal = (x, y, dir) => {
    switch (dir) {
      case 0: return at(x, y) === 1 && at(x, y - 1) === 0;          // right: below fg, above bg
      case 1: return at(x - 1, y) === 1 && at(x, y) === 0;          // down: left fg, right bg
      case 2: return at(x - 1, y - 1) === 1 && at(x - 1, y) === 0;  // left: above fg, below bg
      default: return at(x, y - 1) === 1 && at(x - 1, y - 1) === 0; // up: right fg, left bg
    }
  };
  const sx = start.x;
  const sy = start.y;
  const points = [];
  let x = sx;
  let y = sy;
  let dir = 0;
  const limit = 4 * (width + 1) * (height + 1) + 16;
  for (let step = 0; step < limit; step++) {
    points.push({ x, y });
    let next = -1;
    // Prefer turning left, then straight, then right, then back: keeps the walk
    // hugging the outside of the component at diagonal pinch points.
    for (const turn of [3, 0, 1, 2]) {
      const cand = (dir + turn) % 4;
      if (legal(x, y, cand)) { next = cand; break; }
    }
    if (next < 0) break; // single isolated pixel or corrupt mask
    dir = next;
    x += DIRS[dir].dx;
    y += DIRS[dir].dy;
    if (x === sx && y === sy) break;
  }
  return points;
}

/**
 * Douglas-Peucker simplification tuned to a vertex budget: the tolerance is
 * searched so the result lands inside [minVertices, maxVertices] where possible.
 * @returns {{points:{x:number,y:number}[], tolerance:number}}
 */
export function simplifyToBudget(points, { minVertices = 100, maxVertices = 300, closed = true } = {}) {
  // Douglas-Peucker pins the endpoints of the polyline it is given. Closing the
  // ring first makes it pin the ring's start corner instead of inventing a
  // spurious extra vertex next to it.
  const run = (tol) => {
    if (!closed) return simplify(points, tol, true);
    const out = simplify([...points, points[0]], tol, true);
    const last = out[out.length - 1];
    if (out.length > 1 && last.x === out[0].x && last.y === out[0].y) out.pop();
    return out;
  };
  if (points.length <= maxVertices) return { points: run(0), tolerance: 0 };
  let lo = 0.05;
  let hi = 64;
  let best = run(hi);
  let bestTol = hi;
  for (let i = 0; i < 24 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    const out = run(mid);
    if (out.length > maxVertices) {
      lo = mid;
    } else {
      best = out;
      bestTol = mid;
      if (out.length >= minVertices) break;
      hi = mid;
    }
  }
  return { points: best, tolerance: bestTol };
}

/**
 * Binary mask -> simplified outer polygon in image space.
 * @param {Uint8Array|Uint8ClampedArray} mask row-major, non-zero = foreground
 * @param {number} width @param {number} height
 * @returns {{points:{x:number,y:number}[], pixelCount:number, tolerance:number}|null}
 */
export function maskToPolygon(mask, width, height, opts = {}) {
  const comp = largestComponent(mask, width, height);
  if (!comp || comp.count < 4) return null;
  const ring = traceOuterContour(comp.mask, width, height, comp.start);
  if (ring.length < 4) return null;
  const { points, tolerance } = simplifyToBudget(ring, opts);
  if (points.length < 3) return null;
  return { points, pixelCount: comp.count, tolerance };
}
