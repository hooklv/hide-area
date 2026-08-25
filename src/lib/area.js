/**
 * Polygon area and unit conversion.
 *
 * Every function here is unit-agnostic: it returns area in the square of
 * whatever unit its input points use. The app feeds it world-space points
 * (millimetres), so the result is mm^2.
 */

export const SQFT_PER_M2 = 10.7639;
export const MM2_PER_M2 = 1e6;
export const MM2_PER_DM2 = 1e4;

/** Signed area of a simple polygon (shoelace). Sign follows the winding.
 *  @param {{x:number,y:number}[]} points
 *  @returns {number} area in input units squared */
export function signedArea(points) {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    sum += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return sum / 2;
}

/** Absolute area of a simple polygon, winding-independent. */
export function polygonArea(points) {
  return Math.abs(signedArea(points));
}

/** Perimeter of a closed polygon, in input units. */
export function polygonPerimeter(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    sum += Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
  }
  return sum;
}

/** @param {number} mm2 @returns {{mm2:number,dm2:number,m2:number,sqft:number}} */
export function convertArea(mm2) {
  const m2 = mm2 / MM2_PER_M2;
  return { mm2, dm2: mm2 / MM2_PER_DM2, m2, sqft: m2 * SQFT_PER_M2 };
}

/** Display strings at the precision the UI shows: m^2 and dm^2 one decimal,
 *  sq ft one decimal. */
export function formatArea(mm2) {
  const a = convertArea(mm2);
  return {
    m2: a.m2.toFixed(2),
    dm2: a.dm2.toFixed(1),
    sqft: a.sqft.toFixed(1),
    raw: a,
  };
}
