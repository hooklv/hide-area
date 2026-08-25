import { describe, it, expect } from 'vitest';
import {
  signedArea, polygonArea, polygonPerimeter, convertArea, formatArea, SQFT_PER_M2,
} from '../src/lib/area.js';

const square = (s) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];

describe('shoelace', () => {
  it('measures a unit square', () => {
    expect(polygonArea(square(1))).toBeCloseTo(1, 12);
  });

  it('measures a 3-4-5 triangle', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }])).toBeCloseTo(6, 12);
  });

  it('measures an A4 sheet in mm', () => {
    const a4 = [{ x: 0, y: 0 }, { x: 297, y: 0 }, { x: 297, y: 210 }, { x: 0, y: 210 }];
    expect(polygonArea(a4)).toBeCloseTo(62370, 9);
    expect(convertArea(polygonArea(a4)).m2).toBeCloseTo(0.06237, 6);
  });

  it('flips sign with winding but keeps magnitude', () => {
    const cw = square(2);
    const ccw = [...cw].reverse();
    expect(signedArea(cw)).toBeCloseTo(-signedArea(ccw), 12);
    expect(polygonArea(cw)).toBeCloseTo(polygonArea(ccw), 12);
  });

  it('approximates a circle from a fine polygon', () => {
    const pts = Array.from({ length: 2048 }, (_, i) => {
      const t = (i / 2048) * Math.PI * 2;
      return { x: 5 * Math.cos(t), y: 5 * Math.sin(t) };
    });
    expect(polygonArea(pts)).toBeCloseTo(Math.PI * 25, 3);
    expect(polygonPerimeter(pts)).toBeCloseTo(2 * Math.PI * 5, 3);
  });

  it('returns zero for degenerate input', () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(0);
  });
});

describe('units', () => {
  it('converts mm^2 to m^2, dm^2 and sq ft', () => {
    const a = convertArea(1e6);
    expect(a.m2).toBe(1);
    expect(a.dm2).toBe(100);
    expect(a.sqft).toBeCloseTo(SQFT_PER_M2, 10);
  });

  it('formats at the precision the UI shows', () => {
    const f = formatArea(62370);
    expect(f.m2).toBe('0.06');
    expect(f.dm2).toBe('6.2');
    expect(f.sqft).toBe('0.7');
  });

  it('formats a full hide', () => {
    const f = formatArea(4.85e6);
    expect(f.m2).toBe('4.85');
    expect(f.dm2).toBe('485.0');
    expect(f.sqft).toBe('52.2');
  });
});
