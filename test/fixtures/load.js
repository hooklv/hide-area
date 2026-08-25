import { loadImageFile } from '../../src/steps/photo.js';

const FIXTURE_URL = new URL('./a4-on-floor.jpeg', import.meta.url);
const CANONICAL_WIDTH = 3000;
const CANONICAL_HEIGHT = 4000;

function imageDataFromRgba(data, width, height) {
  if (typeof ImageData !== 'undefined') return new ImageData(data, width, height);
  // Vitest only needs ImageData's data/width/height contract.
  return { data, width, height };
}

function rgbaFromRgb(data) {
  const rgba = new Uint8ClampedArray((data.length / 3) * 4);
  for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
    rgba[target] = data[source];
    rgba[target + 1] = data[source + 1];
    rgba[target + 2] = data[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
}

function downscaleRgba(imageData, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(imageData.width, imageData.height));
  const width = Math.max(1, Math.round(imageData.width * scale));
  const height = Math.max(1, Math.round(imageData.height * scale));
  if (width === imageData.width && height === imageData.height) return imageData;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(imageData.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(imageData.width - 1, Math.floor(x / scale));
      const source = (sourceY * imageData.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      data[target] = imageData.data[source];
      data[target + 1] = imageData.data[source + 1];
      data[target + 2] = imageData.data[source + 2];
      data[target + 3] = imageData.data[source + 3];
    }
  }
  return imageDataFromRgba(data, width, height);
}

function assertDecodedOrientation(width, height) {
  if (width !== CANONICAL_WIDTH || height !== CANONICAL_HEIGHT) {
    throw new Error(`A4 fixture EXIF orientation regression: expected ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}, got ${width}x${height}`);
  }
}

function scaleMetadata(metadata, width, height) {
  const scaleX = width / CANONICAL_WIDTH;
  const scaleY = height / CANONICAL_HEIGHT;
  const scale = (point) => ({ x: point.x * scaleX, y: point.y * scaleY });
  return {
    ...metadata,
    runtimeSpace: { width, height, scaleX, scaleY },
    a4Corners: metadata.a4Corners.map((point) => ({ ...point, ...scale(point) })),
    prompt: { ...metadata.prompt, ...scale(metadata.prompt) },
  };
}

async function loadMetadata() {
  if (typeof window !== 'undefined') {
    const response = await fetch(new URL('./a4-on-floor.json', import.meta.url));
    if (!response.ok) throw new Error(`Could not load fixture metadata (${response.status})`);
    return response.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(new URL('./a4-on-floor.json', import.meta.url), 'utf8'));
}

async function loadInBrowser(maxSide) {
  const response = await fetch(FIXTURE_URL);
  if (!response.ok) throw new Error(`Could not load fixture image (${response.status})`);
  const file = new File([await response.blob()], 'a4-on-floor.jpeg', { type: 'image/jpeg' });
  const decoded = await loadImageFile(file, Infinity);
  assertDecodedOrientation(decoded.width, decoded.height);
  return maxSide === Infinity ? decoded : loadImageFile(file, maxSide);
}

async function loadInNode(maxSide) {
  const { RawImage } = await import('@huggingface/transformers');
  const decoded = await RawImage.fromURL(FIXTURE_URL.pathname);
  assertDecodedOrientation(decoded.width, decoded.height);
  const imageData = downscaleRgba(
    imageDataFromRgba(rgbaFromRgb(decoded.data), decoded.width, decoded.height),
    maxSide,
  );
  return { imageData, width: imageData.width, height: imageData.height };
}

/**
 * Load the real EXIF-bearing fixture and return runtime-scaled canonical points.
 * Browser callers receive the same downscale behavior as the photo step; Node
 * callers receive orientation-normalized source pixels for deterministic tests.
 */
export async function loadA4OnFloorFixture({ maxSide = 2000 } = {}) {
  const metadata = await loadMetadata();
  const decoded = typeof window !== 'undefined'
    ? await loadInBrowser(maxSide)
    : await loadInNode(maxSide);
  return {
    imageData: decoded.imageData,
    metadata: scaleMetadata(metadata, decoded.width, decoded.height),
  };
}