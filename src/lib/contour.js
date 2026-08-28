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

// One vertex every `perimeter / TARGET_VERTICES` of contour, which is what the
// operator actually drags. See AGENTS.md, Contour invariants, for the rule.
const TARGET_VERTICES = 60;
const MAX_VERTICES = 120;
// Never ask for vertices closer together than one crack-grid step: below that
// the resampling would invent points the traced ring does not contain.
const MIN_SPACING = 1;
// A deviation worth pinning is a quarter of the spacing between vertices. Any
// smaller and even spacing would put a vertex there anyway.
const CORNER_TOLERANCE_FRACTION = 0.25;

/** Perpendicular distance from p to the infinite line through a and b. */
function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

/**
 * Indices into `ring` of the vertices Douglas-Peucker keeps at `tolerance`:
 * the places where the outline genuinely turns. At the tolerances used here
 * (several pixels) these are corners and sharp points, not staircase noise.
 * @returns {number[]} strictly increasing ring indices
 */
export function cornerIndices(ring, tolerance) {
  const closed = [...ring, ring[0]];
  const kept = simplify(closed, tolerance, true);
  if (kept.length > 1) {
    const last = kept[kept.length - 1];
    if (last.x === kept[0].x && last.y === kept[0].y) kept.pop();
  }
  // Douglas-Peucker returns a subsequence of its input, in input order, so a
  // single forward scan recovers the indices. A ring that visits the same crack
  // corner twice (a diagonal pinch point) can match the earlier visit; that
  // moves an arc boundary, it does not break the ordering.
  const indices = [];
  for (let i = 0, k = 0; i < ring.length && k < kept.length; i++) {
    if (ring[i].x === kept[k].x && ring[i].y === kept[k].y) { indices.push(i); k++; }
  }
  // Douglas-Peucker pins the endpoints of the polyline it is given, so the
  // ring's arbitrary start corner always survives. Drop it when the outline
  // runs straight through it, or it anchors a corner that is not there.
  if (indices.length > 2 && indices[0] === 0
    && perpendicularDistance(ring[0], ring[indices[indices.length - 1]], ring[indices[1]]) <= tolerance) {
    indices.shift();
  }
  return indices;
}

/**
 * Resample a traced ring to vertices spaced evenly along the contour, with the
 * genuine corners pinned.
 *
 * Douglas-Peucker alone cannot do this. It keeps points by perpendicular
 * distance from a chord, so on a pixel staircase it is all-or-nothing at one
 * pixel: below that tolerance every single-pixel jog survives in a dense run,
 * above it the whole edge collapses to its endpoints. Vertex spacing is
 * therefore driven by arc length here, and Douglas-Peucker is used only at a
 * coarse tolerance to find the corners that the even spacing must not cross.
 *
 * Every emitted vertex lies on the traced ring, so the polygon stays inscribed
 * in it and the area moves only by the curvature each chord cuts off.
 *
 * @param {{x:number,y:number}[]} ring closed ring, first point not repeated
 * @returns {{points:{x:number,y:number}[], spacing:number, cornerTolerance:number}}
 */
export function resampleContour(ring, { targetVertices = TARGET_VERTICES, maxVertices = MAX_VERTICES } = {}) {
  const n = ring.length;
  const copy = () => ring.map((p) => ({ x: p.x, y: p.y }));
  if (n < 4) return { points: copy(), spacing: 0, cornerTolerance: 0 };

  const segment = new Float64Array(n);
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    segment[i] = Math.hypot(b.x - a.x, b.y - a.y);
    perimeter += segment[i];
  }
  if (!(perimeter > 0)) return { points: copy(), spacing: 0, cornerTolerance: 0 };

  const spacing = Math.max(perimeter / Math.max(3, targetVertices), MIN_SPACING);
  let cornerTolerance = spacing * CORNER_TOLERANCE_FRACTION;
  let corners = cornerIndices(ring, cornerTolerance);
  // An outline whose corners alone would fill the budget gets a coarser corner
  // test rather than an outline too dense to edit.
  for (let guard = 0; corners.length > maxVertices && guard < 24; guard++) {
    cornerTolerance *= 1.6;
    corners = cornerIndices(ring, cornerTolerance);
  }
  if (corners.length === 0) corners = [0];

  // Forward arc length between two ring indices, and the point that far along.
  const arcLength = (from, to) => {
    let length = 0;
    for (let i = from; i !== to; i = (i + 1) % n) length += segment[i];
    return length;
  };
  const pointAlong = (from, distance) => {
    let i = from;
    let left = distance;
    while (left > segment[i]) { left -= segment[i]; i = (i + 1) % n; }
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const t = segment[i] === 0 ? 0 : left / segment[i];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  const points = [];
  for (let c = 0; c < corners.length; c++) {
    const from = corners[c];
    const to = corners[(c + 1) % corners.length];
    points.push({ x: ring[from].x, y: ring[from].y });
    const length = corners.length === 1 ? perimeter : arcLength(from, to);
    // Each corner-to-corner arc carries whole steps of its own, so spacing is
    // even inside an arc and within a rounding of `spacing` between arcs.
    const parts = Math.max(1, Math.round(length / spacing));
    for (let k = 1; k < parts; k++) points.push(pointAlong(from, (length * k) / parts));
  }
  return { points, spacing, cornerTolerance };
}

/**
 * Binary mask -> evenly spaced editable outer polygon in image space.
 * @param {Uint8Array|Uint8ClampedArray} mask row-major, non-zero = foreground
 * @param {number} width @param {number} height
 * @returns {{points:{x:number,y:number}[], pixelCount:number, spacing:number}|null}
 */
export function maskToPolygon(mask, width, height, opts = {}) {
  const comp = largestComponent(mask, width, height);
  if (!comp || comp.count < 4) return null;
  const ring = traceOuterContour(comp.mask, width, height, comp.start);
  if (ring.length < 4) return null;
  const { points, spacing } = resampleContour(ring, opts);
  if (points.length < 3) return null;
  return { points, pixelCount: comp.count, spacing };
}
