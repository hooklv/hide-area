import { describe, it, expect } from 'vitest';
import { largestComponent, traceOuterContour, cornerIndices, resampleContour, maskToPolygon } from '../src/lib/contour.js';
import { polygonArea, polygonPerimeter } from '../src/lib/area.js';

/** Gap lengths between consecutive vertices of a closed ring, sorted ascending. */
function gaps(points) {
  return points
    .map((p, i) => {
      const q = points[(i + 1) % points.length];
      return Math.hypot(p.x - q.x, p.y - q.y);
    })
    .sort((a, b) => a - b);
}
/** How lumpy the spacing is: 1 is perfectly even, the old output scored 56. */
function spacingRatio(points) {
  const g = gaps(points);
  return g[g.length - 1] / g[Math.floor(g.length / 2)];
}
/** Distance from `point` to the nearest vertex of `points`. */
function nearest(point, points) {
  return Math.min(...points.map((p) => Math.hypot(p.x - point.x, p.y - point.y)));
}
function ringOf(m) {
  const comp = largestComponent(m.mask, m.width, m.height);
  return traceOuterContour(comp.mask, m.width, m.height, comp.start);
}

/** @returns {{mask:Uint8Array,width:number,height:number}} */
function blank(width, height) {
  return { mask: new Uint8Array(width * height), width, height };
}
function fillRect(m, x0, y0, w, h, v = 1) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.mask[y * m.width + x] = v;
  return m;
}
function fillDisc(m, cx, cy, r) {
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) m.mask[y * m.width + x] = 1;
    }
  }
  return m;
}
describe('largestComponent', () => {
  it('keeps the bigger blob and drops the smaller', () => {
    const m = blank(40, 30);
    fillRect(m, 2, 2, 5, 5);    // 25 px
    fillRect(m, 20, 10, 8, 9);  // 72 px
    const comp = largestComponent(m.mask, m.width, m.height);
    expect(comp.count).toBe(72);
    expect(comp.start).toEqual({ x: 20, y: 10 });
    expect(comp.mask[2 * 40 + 2]).toBe(0);
  });

  it('treats diagonal-only contact as separate components (4-connectivity)', () => {
    const m = blank(10, 10);
    fillRect(m, 1, 1, 2, 2);
    fillRect(m, 3, 3, 3, 3);
    expect(largestComponent(m.mask, m.width, m.height).count).toBe(9);
  });

  it('returns null for an empty mask', () => {
    const m = blank(8, 8);
    expect(largestComponent(m.mask, m.width, m.height)).toBeNull();
  });
});

describe('traceOuterContour', () => {
  const traceArea = (m) => {
    const comp = largestComponent(m.mask, m.width, m.height);
    const ring = traceOuterContour(comp.mask, m.width, m.height, comp.start);
    return { area: polygonArea(ring), ring, pixels: comp.count };
  };

  it('encloses exactly the pixel count of a rectangle', () => {
    const m = fillRect(blank(40, 30), 5, 4, 12, 7);
    const t = traceArea(m);
    expect(t.area).toBe(84);
    expect(t.pixels).toBe(84);
    expect(t.ring.length).toBe(2 * (12 + 7)); // one corner per crack step
  });

  it('encloses exactly the pixel count of an L shape', () => {
    const m = blank(40, 40);
    fillRect(m, 5, 5, 20, 6);
    fillRect(m, 5, 11, 6, 14);
    const t = traceArea(m);
    expect(t.area).toBe(t.pixels);
  });

  it('encloses exactly the pixel count of a disc', () => {
    const m = fillDisc(blank(80, 80), 40, 40, 25);
    const t = traceArea(m);
    expect(t.area).toBe(t.pixels);
    expect(t.pixels / (Math.PI * 25 * 25)).toBeCloseTo(1, 1);
  });

  it('ignores holes: the outer contour keeps the hole area', () => {
    const m = fillRect(blank(40, 40), 4, 4, 20, 20);
    fillRect(m, 10, 10, 5, 5, 0); // punch a hole
    const comp = largestComponent(m.mask, m.width, m.height);
    const ring = traceOuterContour(comp.mask, m.width, m.height, comp.start);
    expect(comp.count).toBe(400 - 25);
    expect(polygonArea(ring)).toBe(400);
  });

  it('handles a mask touching the image border', () => {
    const m = fillRect(blank(20, 20), 0, 0, 20, 20);
    const t = traceArea(m);
    expect(t.area).toBe(400);
    expect(t.ring.length).toBe(80);
  });
});

describe('cornerIndices', () => {
  it('finds the four corners of a rectangle and nothing else', () => {
    const ring = ringOf(fillRect(blank(200, 200), 20, 30, 120, 90));
    const corners = cornerIndices(ring, 5).map((i) => ring[i]);
    expect(corners).toHaveLength(4);
    expect(corners.map((p) => `${p.x},${p.y}`).sort()).toEqual(
      ['140,120', '140,30', '20,120', '20,30'],
    );
  });

  it('drops the ring start when the outline runs straight through it', () => {
    // The trace starts at the top-left pixel's upper-left crack corner, which on
    // this shape is the midpoint of the top edge, not a corner of it.
    const m = blank(200, 200);
    fillRect(m, 20, 40, 120, 80);
    fillRect(m, 60, 30, 40, 10); // a tab whose left edge the walk starts on
    const ring = ringOf(m);
    expect(ring[0]).toEqual({ x: 60, y: 30 });
    // at a tolerance far coarser than the tab, the start is not a corner
    expect(cornerIndices(ring, 30)).not.toContain(0);
  });

  it('returns indices in ring order', () => {
    const ring = ringOf(fillDisc(blank(200, 200), 100, 100, 60));
    const idx = cornerIndices(ring, 4);
    expect(idx.length).toBeGreaterThan(3);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });
});

describe('resampleContour', () => {
  it('spaces vertices evenly along a staircase ring, where Douglas-Peucker clusters them', () => {
    const ring = ringOf(fillDisc(blank(700, 700), 350, 350, 300));
    expect(ring.length).toBeGreaterThan(2000);
    const out = resampleContour(ring);
    const g = gaps(out.points);
    // no two vertices on top of each other, and no bare stretch
    expect(g[0]).toBeGreaterThan(out.spacing / 3);
    expect(g[g.length - 1]).toBeLessThan(out.spacing * 2);
    expect(spacingRatio(out.points)).toBeLessThan(1.6);
  });

  it('lands close to the vertex target', () => {
    const ring = ringOf(fillDisc(blank(700, 700), 350, 350, 300));
    for (const targetVertices of [30, 60, 100]) {
      const out = resampleContour(ring, { targetVertices });
      expect(out.points.length).toBeGreaterThanOrEqual(targetVertices - 8);
      expect(out.points.length).toBeLessThanOrEqual(targetVertices + 8);
    }
  });

  it('keeps the area of the ring it resamples', () => {
    const ring = ringOf(fillDisc(blank(700, 700), 350, 350, 300));
    const out = resampleContour(ring);
    expect(Math.abs(polygonArea(out.points) / polygonArea(ring) - 1)).toBeLessThan(0.005);
  });

  it('keeps every vertex on the traced ring, so the result stays inscribed', () => {
    const ring = ringOf(fillDisc(blank(400, 400), 200, 200, 150));
    const out = resampleContour(ring, { targetVertices: 40 });
    expect(polygonArea(out.points)).toBeLessThanOrEqual(polygonArea(ring));
  });

  it('pins genuine corners exactly', () => {
    const ring = ringOf(fillRect(blank(400, 300), 40, 50, 300, 200));
    const out = resampleContour(ring, { targetVertices: 40 });
    for (const corner of [{ x: 40, y: 50 }, { x: 340, y: 50 }, { x: 340, y: 250 }, { x: 40, y: 250 }]) {
      expect(nearest(corner, out.points)).toBe(0);
    }
  });

  it('pins the sharp point of a spike instead of rounding it off', () => {
    // a disc with a narrow triangular spike: the tip is the vertex that matters
    const m = blank(400, 400);
    fillDisc(m, 200, 240, 120);
    for (let y = 40; y < 130; y++) {
      const half = Math.max(1, Math.round((y - 40) / 3));
      for (let x = 200 - half; x <= 200 + half; x++) m.mask[y * m.width + x] = 1;
    }
    const ring = ringOf(m);
    const tip = ring.reduce((best, p) => (p.y < best.y ? p : best), ring[0]);
    expect(tip.y).toBe(40);
    const out = resampleContour(ring, { targetVertices: 40 });
    expect(nearest(tip, out.points)).toBe(0);
  });

  it('never packs vertices closer than the resolution of the ring itself', () => {
    const ring = ringOf(fillRect(blank(40, 40), 10, 10, 6, 5));
    expect(ring).toHaveLength(22);
    const out = resampleContour(ring, { targetVertices: 200 });
    expect(out.points.length).toBeLessThanOrEqual(ring.length);
    expect(gaps(out.points)[0]).toBeGreaterThanOrEqual(1);
  });

  it('caps the vertex count on an outline whose corners alone would flood it', () => {
    // a comb: every tooth is a genuine corner, far more of them than the budget
    const m = blank(600, 200);
    fillRect(m, 20, 120, 560, 40);
    for (let t = 0; t < 90; t++) fillRect(m, 20 + t * 6, 40, 3, 80);
    const ring = ringOf(m);
    const out = resampleContour(ring, { targetVertices: 60, maxVertices: 120 });
    expect(out.points.length).toBeLessThanOrEqual(120);
  });

  it('leaves a ring too short to resample alone', () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];
    expect(resampleContour(pts).points).toHaveLength(3);
  });
});

describe('maskToPolygon', () => {
  it('returns an evenly spaced rectangle that still has its corners', () => {
    const m = fillRect(blank(200, 200), 20, 30, 120, 90);
    const poly = maskToPolygon(m.mask, m.width, m.height);
    expect(poly.pixelCount).toBe(120 * 90);
    // vertices added along a straight edge are collinear, so area is untouched
    expect(polygonArea(poly.points)).toBeCloseTo(120 * 90, 6);
    expect(poly.points.length).toBeGreaterThanOrEqual(52);
    expect(poly.points.length).toBeLessThanOrEqual(68);
    expect(spacingRatio(poly.points)).toBeLessThan(1.6);
    for (const corner of [{ x: 20, y: 30 }, { x: 140, y: 30 }, { x: 140, y: 120 }, { x: 20, y: 120 }]) {
      expect(nearest(corner, poly.points)).toBe(0);
    }
    expect(poly.spacing).toBeCloseTo(polygonPerimeter(poly.points) / 60, 6);
  });

  it('ignores a second smaller shape in the mask', () => {
    const m = fillRect(blank(200, 200), 20, 20, 100, 100);
    fillRect(m, 150, 150, 20, 20);
    const poly = maskToPolygon(m.mask, m.width, m.height);
    expect(polygonArea(poly.points)).toBeCloseTo(10000, 6);
  });

  it('returns null when there is nothing to trace', () => {
    const m = blank(50, 50);
    expect(maskToPolygon(m.mask, m.width, m.height)).toBeNull();
    m.mask[10 * 50 + 10] = 1;
    expect(maskToPolygon(m.mask, m.width, m.height)).toBeNull();
  });
});
