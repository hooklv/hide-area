/**
 * Homography between the two coordinate spaces of this app.
 *
 * Two spaces exist, and only two:
 *   image space — pixels of the downscaled photo (longest side 2000 px), origin
 *                 top-left, y down. Every tap, handle and polygon vertex lives here.
 *   world space — millimetres on the floor plane, origin at the first A4 corner.
 *                 Only areas and the mm/px readout are read out of this space.
 *
 * A homography H maps image space -> world space. Matrices are row-major
 * Float64Array(9): [h11 h12 h13 h21 h22 h23 h31 h32 h33].
 */

export const A4_LONG_MM = 297;
export const A4_SHORT_MM = 210;

/** Solve A x = b for a dense n x n system (Gauss-Jordan, partial pivoting).
 *  @param {number[][]} a n x n, mutated
 *  @param {number[]} b length n, mutated
 *  @returns {number[]|null} x, or null if the system is singular */
export function solveLinearSystem(a, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tr = a[pivot]; a[pivot] = a[col]; a[col] = tr;
      const tb = b[pivot]; b[pivot] = b[col]; b[col] = tb;
    }
    const d = a[col][col];
    for (let k = col; k < n; k++) a[col][k] /= d;
    b[col] /= d;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = a[row][col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) a[row][k] -= f * a[col][k];
      b[row] -= f * b[col];
    }
  }
  return b;
}

/** @returns {Float64Array} A * B, both row-major 3x3 */
export function mat3Multiply(A, B) {
  const M = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      M[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    }
  }
  return M;
}

/** @returns {Float64Array|null} inverse of a row-major 3x3 */
export function mat3Inverse(M) {
  const [a, b, c, d, e, f, g, h, i] = M;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const inv = new Float64Array([
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ]);
  for (let k = 0; k < 9; k++) inv[k] /= det;
  return inv;
}

/** Similarity transform that centres points on the origin at mean distance sqrt(2).
 *  Improves the conditioning of the DLT system (Hartley normalisation). */
function normalizePoints(points) {
  const n = points.length;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let dist = 0;
  for (const p of points) dist += Math.hypot(p.x - cx, p.y - cy);
  dist /= n;
  const s = dist > 1e-12 ? Math.SQRT2 / dist : 1;
  const T = new Float64Array([s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]);
  return { T, points: points.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })) };
}

/**
 * Homography from 4 point correspondences (DLT with h33 fixed to 1).
 * @param {{x:number,y:number}[]} src 4 points in the source space
 * @param {{x:number,y:number}[]} dst 4 matching points in the target space
 * @returns {Float64Array|null} row-major 3x3 mapping src -> dst, null if degenerate
 */
export function computeHomography(src, dst) {
  if (src.length !== 4 || dst.length !== 4) throw new Error('computeHomography needs exactly 4 points');
  const ns = normalizePoints(src);
  const nd = normalizePoints(dst);
  const a = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = ns.points[i];
    const { x: X, y: Y } = nd.points[i];
    a.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    a.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solveLinearSystem(a, b);
  if (!h) return null;
  const Hn = new Float64Array([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
  const invTd = mat3Inverse(nd.T);
  if (!invTd) return null;
  const H = mat3Multiply(invTd, mat3Multiply(Hn, ns.T));
  if (Math.abs(H[8]) > 1e-12) {
    for (let k = 0; k < 9; k++) H[k] /= H[8];
  }
  return H;
}

/** @param {{x:number,y:number}} p @returns {{x:number,y:number}} p mapped through H */
export function applyHomography(H, p) {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN };
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/** @returns {{x:number,y:number}[]} every point mapped through H */
export function transformPoints(H, points) {
  return points.map((p) => applyHomography(H, p));
}

/** Local scale of H at a point: how many target units one source unit covers there.
 *  For an image->mm homography this is millimetres per pixel at that pixel. */
export function scaleAt(H, p) {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return NaN;
  const nx = H[0] * p.x + H[1] * p.y + H[2];
  const ny = H[3] * p.x + H[4] * p.y + H[5];
  const dxdx = (H[0] * w - nx * H[6]) / (w * w);
  const dxdy = (H[1] * w - nx * H[7]) / (w * w);
  const dydx = (H[3] * w - ny * H[6]) / (w * w);
  const dydy = (H[4] * w - ny * H[7]) / (w * w);
  return Math.sqrt(Math.abs(dxdx * dydy - dxdy * dydx));
}

/** Order 4 taps into a non self-intersecting quad: sorted by angle around the
 *  centroid, then rotated so the corner nearest the image origin comes first.
 *  @param {{x:number,y:number}[]} points 4 taps in image space, any order
 *  @returns {{x:number,y:number}[]} the same 4 points, consistently ordered */
export function orderQuad(points) {
  if (points.length !== 4) throw new Error('orderQuad needs exactly 4 points');
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  const sorted = points
    .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((u) => u.p);
  let first = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = sorted[i].x * sorted[i].x + sorted[i].y * sorted[i].y;
    if (d < best) { best = d; first = i; }
  }
  return [sorted[first], sorted[(first + 1) % 4], sorted[(first + 2) % 4], sorted[(first + 3) % 4]];
}

/** Side lengths of a quad, edge i running from point i to point i+1. */
export function quadSides(quad) {
  return quad.map((p, i) => {
    const q = quad[(i + 1) % 4];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
}

/** The A4 rectangle in mm matching the orientation of an ordered image-space quad.
 *  The 90 degree ambiguity (sheet lying portrait or landscape) is resolved by
 *  which pair of opposite edges is longer in the image; either choice yields the
 *  same area, so a near-tie is harmless.
 *  @returns {{corners:{x:number,y:number}[], width:number, height:number, ambiguity:number}}
 *    corners in mm, matching quad point for point. */
export function a4TargetFor(quad) {
  const s = quadSides(quad);
  const edgeA = (s[0] + s[2]) / 2; // edges quad[0]-quad[1] and quad[2]-quad[3]
  const edgeB = (s[1] + s[3]) / 2; // edges quad[1]-quad[2] and quad[3]-quad[0]
  const aIsLong = edgeA >= edgeB;
  const width = aIsLong ? A4_LONG_MM : A4_SHORT_MM;
  const height = aIsLong ? A4_SHORT_MM : A4_LONG_MM;
  const longer = Math.max(edgeA, edgeB);
  const shorter = Math.min(edgeA, edgeB);
  return {
    corners: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    width,
    height,
    // 1 = perfectly ambiguous square-looking quad, ~0.71 = a clean A4 aspect
    ambiguity: shorter / longer,
  };
}

/**
 * Full A4 calibration from 4 taps.
 * @param {{x:number,y:number}[]} taps 4 corners of the sheet in image space, any order
 * @param {{tolerance?:number}} [opts] allowed relative error on the reprojected sheet
 * @returns {{ok:boolean, H:Float64Array|null, quad:*, target:*, mmPerPx:number,
 *             sidesMm:number[], maxErrorPct:number, warnings:string[], error:string|null}}
 */
export function calibrateA4(taps, opts = {}) {
  const tolerance = opts.tolerance ?? 0.01;
  const warnings = [];
  const fail = (error) => ({
    ok: false, H: null, quad: null, target: null, mmPerPx: NaN,
    sidesMm: [], maxErrorPct: NaN, warnings, error,
  });
  if (!taps || taps.length !== 4) return fail('Tap all four corners of the sheet.');

  const quad = orderQuad(taps);
  const sidesPx = quadSides(quad);
  if (Math.min(...sidesPx) < 8) return fail('Corners are too close together. Spread them to the sheet corners.');

  const target = a4TargetFor(quad);
  const H = computeHomography(quad, target.corners);
  if (!H) return fail('Those four points are degenerate. Re-place the corners.');

  // Reproject: the warped sheet must come back as 210 x 297 mm.
  const backMm = transformPoints(H, quad);
  const sidesMm = quadSides(backMm);
  const expected = [target.width, target.height, target.width, target.height];
  let maxErrorPct = 0;
  for (let i = 0; i < 4; i++) {
    maxErrorPct = Math.max(maxErrorPct, Math.abs(sidesMm[i] - expected[i]) / expected[i] * 100);
  }
  if (!Number.isFinite(maxErrorPct) || maxErrorPct > tolerance * 100) {
    return fail(`Calibration is off by ${maxErrorPct.toFixed(1)}%. Re-place the corners.`);
  }

  const centroid = {
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
  };
  const mmPerPx = scaleAt(H, centroid);

  if (target.ambiguity > 0.92) warnings.push('The sheet looks almost square in the photo; check the corners.');
  const sheetPx = Math.max(...sidesPx);
  if (sheetPx < 300) warnings.push(`The A4 sheet is only ${Math.round(sheetPx)} px across in the photo. Move closer and keep it larger in frame.`);

  return { ok: true, H, quad, target, mmPerPx, sidesMm, maxErrorPct, warnings, error: null };
}
