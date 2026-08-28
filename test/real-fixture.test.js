import { describe, expect, it } from 'vitest';
import { RawImage } from '@huggingface/transformers';
import { loadA4OnFloorFixture } from './fixtures/load.js';
import { calibrateA4, transformPoints } from '../src/lib/homography.js';
import { maskToPolygon } from '../src/lib/contour.js';
import { convertArea, polygonArea } from '../src/lib/area.js';

const maskUrl = new URL('./fixtures/a4-on-floor-mask.png', import.meta.url);

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe('real EXIF A4 fixture', () => {
  it('normalizes orientation and scales canonical points into the app runtime space', async () => {
    const { imageData, metadata } = await loadA4OnFloorFixture();
    expect(imageData.width).toBe(1500);
    expect(imageData.height).toBe(2000);
    expect(metadata.runtimeSpace).toMatchObject({ width: 1500, height: 2000, scaleX: 0.5, scaleY: 0.5 });
    expect(metadata.a4Corners[0]).toMatchObject({ corner: 'top-left', x: 512.465, y: 785.995 });
    expect(metadata.prompt).toMatchObject({ x: 750, y: 1125 });
  });

  it('measures the browser-generated fixture mask and rejects a noise mask', async () => {
    const { metadata } = await loadA4OnFloorFixture();
    const source = await RawImage.fromURL(maskUrl.pathname);
    const mask = new Uint8Array(source.width * source.height);
    for (let index = 0; index < mask.length; index++) mask[index] = source.data[index * source.channels] > 0 ? 1 : 0;

    const calibration = calibrateA4(metadata.a4Corners);
    expect(calibration.ok).toBe(true);
    const contour = maskToPolygon(mask, source.width, source.height);
    expect(contour).not.toBeNull();
    const measuredM2 = convertArea(polygonArea(transformPoints(calibration.H, contour.points))).m2;
    expect(Math.abs(measuredM2 / metadata.expectedAreaM2 - 1)).toBeLessThan(0.02);

    let sheetPixels = 0;
    let coveredPixels = 0;
    let outsidePixels = 0;
    let outsideMaskPixels = 0;
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const selected = mask[y * source.width + x] === 1;
        if (pointInPolygon({ x: x + 0.5, y: y + 0.5 }, metadata.a4Corners)) {
          sheetPixels++;
          if (selected) coveredPixels++;
        } else {
          outsidePixels++;
          if (selected) outsideMaskPixels++;
        }
      }
    }
    expect(coveredPixels / sheetPixels).toBeGreaterThanOrEqual(0.9);
    expect(outsideMaskPixels / outsidePixels).toBeLessThan(0.05);
  });

  it('produces an outline a finger can edit: evenly spaced, and few enough to work with', async () => {
    const source = await RawImage.fromURL(maskUrl.pathname);
    const mask = new Uint8Array(source.width * source.height);
    for (let index = 0; index < mask.length; index++) mask[index] = source.data[index * source.channels] > 0 ? 1 : 0;

    const contour = maskToPolygon(mask, source.width, source.height);
    expect(contour.points.length).toBeGreaterThanOrEqual(40);
    expect(contour.points.length).toBeLessThanOrEqual(80);

    const gaps = contour.points
      .map((point, index) => {
        const next = contour.points[(index + 1) % contour.points.length];
        return Math.hypot(point.x - next.x, point.y - next.y);
      })
      .sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    // The Douglas-Peucker output this replaced scored 56 here: half its vertices
    // sat one pixel apart while other stretches of the same edge ran 112 px bare.
    expect(gaps[gaps.length - 1] / median).toBeLessThan(3);
    expect(gaps[0]).toBeGreaterThan(1);
  });
});
