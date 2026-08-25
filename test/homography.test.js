import { describe, it, expect } from 'vitest';
import {
  computeHomography, applyHomography, transformPoints, scaleAt, orderQuad,
  a4TargetFor, calibrateA4, mat3Multiply, mat3Inverse, quadSides,
} from '../src/lib/homography.js';

const P = (x, y) => ({ x, y });
const unit = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];

describe('computeHomography', () => {
  it('recovers a pure scale + translation', () => {
    const dst = unit.map((p) => P(p.x * 10 + 3, p.y * 10 - 4));
    const H = computeHomography(unit, dst);
    for (let i = 0; i < 4; i++) {
      const q = applyHomography(H, unit[i]);
      expect(q.x).toBeCloseTo(dst[i].x, 9);
      expect(q.y).toBeCloseTo(dst[i].y, 9);
    }
    const mid = applyHomography(H, P(0.5, 0.5));
    expect(mid.x).toBeCloseTo(8, 9);
    expect(mid.y).toBeCloseTo(1, 9);
  });

  it('round-trips a known projective transform', () => {
    const K = new Float64Array([1.7, 0.4, 120, -0.3, 2.1, -45, 0.0007, -0.0004, 1]);
    const src = [P(10, 20), P(900, 40), P(870, 1400), P(60, 1500)];
    const dst = transformPoints(K, src);
    const H = computeHomography(src, dst);
    const probes = [P(0, 0), P(500, 700), P(1234, 56), P(-30, 400)];
    for (const p of probes) {
      const a = applyHomography(K, p);
      const b = applyHomography(H, p);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
    }
  });

  it('inverts back to the source points', () => {
    const src = [P(120, 300), P(1500, 260), P(1610, 1200), P(80, 1310)];
    const dst = [P(0, 0), P(297, 0), P(297, 210), P(0, 210)];
    const H = computeHomography(src, dst);
    const Hinv = mat3Inverse(H);
    for (const p of src) {
      const back = applyHomography(Hinv, applyHomography(H, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
    const I = mat3Multiply(H, Hinv);
    for (let k = 0; k < 9; k++) expect(I[k] / I[8]).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][k], 6);
  });

  it('returns null for degenerate (collinear) input', () => {
    const H = computeHomography([P(0, 0), P(1, 1), P(2, 2), P(3, 3)], unit);
    expect(H).toBeNull();
  });
});

describe('scaleAt', () => {
  it('reports the local unit ratio of a pure scale', () => {
    const H = computeHomography(unit, unit.map((p) => P(p.x * 4, p.y * 4)));
    expect(scaleAt(H, P(0.5, 0.5))).toBeCloseTo(4, 9);
  });

  it('gives mm per px for an A4 sheet seen head-on', () => {
    // sheet spans 594 px across its 297 mm side -> 0.5 mm/px
    const src = [P(100, 100), P(694, 100), P(694, 520), P(100, 520)];
    const H = computeHomography(src, [P(0, 0), P(297, 0), P(297, 210), P(0, 210)]);
    expect(scaleAt(H, P(400, 300))).toBeCloseTo(0.5, 9);
  });
});

describe('orderQuad', () => {
  it('produces the same ring whatever the tap order', () => {
    const corners = [P(100, 120), P(900, 100), P(940, 700), P(80, 660)];
    const orders = [[0, 1, 2, 3], [2, 0, 3, 1], [3, 2, 1, 0], [1, 3, 0, 2]];
    const rings = orders.map((o) => orderQuad(o.map((i) => corners[i])));
    for (const ring of rings) expect(ring).toEqual(rings[0]);
    expect(rings[0][0]).toEqual(P(100, 120)); // nearest the image origin comes first
  });

  it('never produces a self-crossing quad', () => {
    const pts = [P(0, 0), P(10, 10), P(10, 0), P(0, 10)];
    const ring = orderQuad(pts);
    const sides = quadSides(ring);
    // a bow-tie would give two diagonals of length ~14.1; a proper quad has 4 sides of 10
    for (const s of sides) expect(s).toBeCloseTo(10, 9);
  });
});

describe('a4TargetFor', () => {
  it('maps the longer image edge to 297 mm', () => {
    const landscape = a4TargetFor([P(0, 0), P(600, 0), P(600, 400), P(0, 400)]);
    expect(landscape.width).toBe(297);
    expect(landscape.height).toBe(210);
    const portrait = a4TargetFor([P(0, 0), P(400, 0), P(400, 600), P(0, 600)]);
    expect(portrait.width).toBe(210);
    expect(portrait.height).toBe(297);
  });

  it('flags a square-looking quad as ambiguous', () => {
    expect(a4TargetFor([P(0, 0), P(500, 0), P(500, 500), P(0, 500)]).ambiguity).toBeCloseTo(1, 9);
  });
});

describe('calibrateA4', () => {
  it('accepts a clean sheet and reports mm per px', () => {
    const taps = [P(694, 520), P(100, 100), P(100, 520), P(694, 100)]; // scrambled
    const cal = calibrateA4(taps);
    expect(cal.ok).toBe(true);
    expect(cal.error).toBeNull();
    expect(cal.maxErrorPct).toBeLessThan(1e-6);
    expect(cal.mmPerPx).toBeCloseTo(0.5, 6);
    expect(cal.sidesMm.map(Math.round)).toEqual([297, 210, 297, 210]);
  });

  it('rejects degenerate taps', () => {
    expect(calibrateA4([P(0, 0), P(1, 1), P(2, 2), P(3, 3)]).ok).toBe(false);
    expect(calibrateA4([P(0, 0), P(1, 0), P(1, 1)]).ok).toBe(false);
    expect(calibrateA4([P(0, 0), P(2, 0), P(2, 2), P(0, 2)]).ok).toBe(false); // corners too close
  });

  it('warns with the A4 pixel span when the sheet is small in frame', () => {
    const cal = calibrateA4([P(0, 0), P(299, 0), P(299, 211), P(0, 211)]);
    expect(cal.ok).toBe(true);
    expect(cal.warnings.join(' ')).toMatch(/299 px/);
  });
});
