import { describe, it, expect } from 'vitest';
import { calibrateA4, transformPoints } from '../src/lib/homography.js';
import { maskToPolygon } from '../src/lib/contour.js';
import { polygonArea, convertArea } from '../src/lib/area.js';

/**
 * Synthetic camera: world millimetres on the floor plane (z = 0) -> image pixels.
 * Stands in for a real photo so the acceptance criteria can be checked as maths.
 * @param {number} tiltDeg 0 = straight overhead, 30 = shot from 30 degrees off-nadir
 */
function cameraHomography({ tiltDeg = 0, f = 1200, height = 1200, cx = 1000, cy = 750, aim = { x: 500, y: 500 } }) {
  const t = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // R = Rx(tilt) * flip, flip = diag(1,-1,-1) so tilt 0 looks straight down
  const R = [
    [1, 0, 0],
    [0, -cos, -sin],
    [0, -sin, cos],
  ];
  // pull the camera back along -y as it tilts so the target stays centred
  const C = { x: aim.x, y: aim.y - height * Math.tan(t), z: height };
  return (p) => {
    const d = [p.x - C.x, p.y - C.y, -C.z];
    const Xc = [
      R[0][0] * d[0] + R[0][1] * d[1] + R[0][2] * d[2],
      R[1][0] * d[0] + R[1][1] * d[1] + R[1][2] * d[2],
      R[2][0] * d[0] + R[2][1] * d[1] + R[2][2] * d[2],
    ];
    return { x: (f * Xc[0]) / Xc[2] + cx, y: (f * Xc[1]) / Xc[2] + cy };
  };
}

const IMG_W = 2000;
const IMG_H = 1500;

/** A4 lying on the floor with its long side along y, top-left corner at (x, y). */
function sheetWorld(x, y) {
  return [{ x, y }, { x: x + 210, y }, { x: x + 210, y: y + 297 }, { x, y: y + 297 }];
}

/** Rasterise an image-space polygon into a binary mask (even-odd rule, pixel centres). */
function rasterize(poly, width, height) {
  const mask = new Uint8Array(width * height);
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const p of poly) {
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(height - 1, Math.ceil(maxY));
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(width - 1, Math.ceil(maxX));
  for (let py = y0; py <= y1; py++) {
    const yc = py + 0.5;
    for (let px = x0; px <= x1; px++) {
      const xc = px + 0.5;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > yc) !== (b.y > yc) && xc < ((b.x - a.x) * (yc - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) mask[py * width + px] = 1;
    }
  }
  return mask;
}

const shuffle = (arr) => [arr[2], arr[0], arr[3], arr[1]];
const inFrame = (pts) => pts.every((p) => p.x > 0 && p.y > 0 && p.x < IMG_W && p.y < IMG_H);

describe('calibration + area, overhead and tilted', () => {
  for (const tiltDeg of [0, 15, 30]) {
    describe(`${tiltDeg} degrees off-nadir`, () => {
      const project = cameraHomography({ tiltDeg });
      const sheetPx = sheetWorld(300, 250).map(project);
      const cal = calibrateA4(shuffle(sheetPx));

      it('calibrates within the 1% reprojection tolerance', () => {
        expect(inFrame(sheetPx)).toBe(true);
        expect(cal.ok).toBe(true);
        expect(cal.maxErrorPct).toBeLessThan(1e-6);
        expect(cal.mmPerPx).toBeGreaterThan(0);
      });

      it('measures the sheet itself as 0.0623 m2 within 2% (acceptance criterion 1)', () => {
        const mm = transformPoints(cal.H, sheetPx);
        const m2 = convertArea(polygonArea(mm)).m2;
        expect(Math.abs(m2 / 0.06237 - 1)).toBeLessThan(0.02);
      });

      it('measures a second sheet elsewhere on the floor within 2%', () => {
        // scale must hold away from the calibration target, not only on it
        const other = sheetWorld(700, 600).map(project);
        expect(inFrame(other)).toBe(true);
        const m2 = convertArea(polygonArea(transformPoints(cal.H, other))).m2;
        expect(Math.abs(m2 / 0.06237 - 1)).toBeLessThan(0.02);
      });

      it('measures a hide-sized ellipse within 2%', () => {
        const a = 500, b = 320;
        const truth = (Math.PI * a * b) / 1e6;
        const ellipse = Array.from({ length: 512 }, (_, i) => {
          const t = (i / 512) * Math.PI * 2;
          return project({ x: 500 + a * Math.cos(t), y: 480 + b * Math.sin(t) });
        });
        expect(inFrame(ellipse)).toBe(true);
        const m2 = convertArea(polygonArea(transformPoints(cal.H, ellipse))).m2;
        expect(Math.abs(m2 / truth - 1)).toBeLessThan(0.02);
      });

      it('runs the whole mask -> contour -> mm pipeline within 2%', () => {
        const mask = rasterize(sheetPx, IMG_W, IMG_H);
        const poly = maskToPolygon(mask, IMG_W, IMG_H);
        expect(poly).not.toBeNull();
        const m2 = convertArea(polygonArea(transformPoints(cal.H, poly.points))).m2;
        expect(Math.abs(m2 / 0.06237 - 1)).toBeLessThan(0.02);
      });
    });
  }
});

describe('coordinate discipline', () => {
  it('maps the calibration corners onto the A4 rectangle itself', () => {
    const project = cameraHomography({ tiltDeg: 20 });
    const sheetPx = sheetWorld(300, 250).map(project);
    const cal = calibrateA4(sheetPx);
    const mm = transformPoints(cal.H, cal.quad);
    const xs = mm.map((p) => p.x);
    const ys = mm.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(cal.target.width, 6);
    expect(Math.max(...ys)).toBeCloseTo(cal.target.height, 6);
  });

  it('reports a plausible mm-per-pixel readout', () => {
    const project = cameraHomography({ tiltDeg: 0 });
    const cal = calibrateA4(sheetWorld(300, 250).map(project));
    // camera: f = 1200 px at 1200 mm -> 1 px per mm -> 1 mm per px
    expect(cal.mmPerPx).toBeCloseTo(1, 3);
  });

  it('keeps area stable under the 90 degree sheet-orientation ambiguity', () => {
    const project = cameraHomography({ tiltDeg: 10 });
    const px = sheetWorld(300, 250).map(project);
    const rotated = [px[1], px[2], px[3], px[0]];
    const a = calibrateA4(px);
    const b = calibrateA4(rotated);
    const target = sheetWorld(700, 600).map(project);
    const areaA = polygonArea(transformPoints(a.H, target));
    const areaB = polygonArea(transformPoints(b.H, target));
    expect(areaB / areaA).toBeCloseTo(1, 6);
  });
});
