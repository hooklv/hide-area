import { describe, it, expect } from 'vitest';
import { largestComponent, traceOuterContour, simplifyToBudget, maskToPolygon } from '../src/lib/contour.js';
import { polygonArea } from '../src/lib/area.js';

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

describe('simplifyToBudget', () => {
  it('leaves small polygons alone', () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];
    expect(simplifyToBudget(pts).points).toHaveLength(3);
  });

  it('collapses a staircase ring into the vertex budget', () => {
    const m = fillDisc(blank(700, 700), 350, 350, 300);
    const comp = largestComponent(m.mask, m.width, m.height);
    const ring = traceOuterContour(comp.mask, m.width, m.height, comp.start);
    expect(ring.length).toBeGreaterThan(2000);
    const out = simplifyToBudget(ring, { minVertices: 100, maxVertices: 300 });
    expect(out.points.length).toBeLessThanOrEqual(300);
    expect(out.points.length).toBeGreaterThanOrEqual(100);
    // simplification must not distort the area by more than half a percent
    expect(Math.abs(polygonArea(out.points) / polygonArea(ring) - 1)).toBeLessThan(0.005);
  });
});

describe('maskToPolygon', () => {
  it('returns a simplified rectangle', () => {
    const m = fillRect(blank(200, 200), 20, 30, 120, 90);
    const poly = maskToPolygon(m.mask, m.width, m.height);
    expect(poly.pixelCount).toBe(120 * 90);
    expect(polygonArea(poly.points)).toBeCloseTo(120 * 90, 6);
    expect(poly.points.length).toBe(4);
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
