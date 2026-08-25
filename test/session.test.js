import { describe, expect, it } from 'vitest';
import { initialState, maskCacheKey, resetState, setImageState } from '../src/lib/session.js';

function image(name) {
  return { name, canvas: {}, imageData: {}, width: 100, height: 100 };
}

function expectInvalidated(state, expectedImageId, expectedVersion) {
  expect(state.imageId).toBe(expectedImageId);
  expect(state.segment.embeddedFor).toBe(-1);
  expect(state.segment.version).toBe(expectedVersion);
  expect(state.review.fromVersion).toBe(-1);
  expect(state.segment.mask).toBeNull();
}

describe('measurement session lifecycle', () => {
  it('invalidates every dependent value for a new photo', () => {
    const state = initialState();
    state.segment.backend = 'wasm';
    state.segment.embeddedFor = state.imageId;
    state.review.fromVersion = state.segment.version;
    const before = maskCacheKey(state);

    setImageState(state, image('first'));

    expectInvalidated(state, 1, 1);
    expect(state.segment.backend).toBe('wasm');
    expect(maskCacheKey(state)).not.toBe(before);
  });

  it('uses a new cache key when a photo is re-taken', () => {
    const state = initialState();
    setImageState(state, image('first'));
    state.segment.embeddedFor = state.imageId;
    state.review.fromVersion = state.segment.version;
    const firstKey = maskCacheKey(state);

    setImageState(state, image('retake'));

    expectInvalidated(state, 2, 2);
    expect(maskCacheKey(state)).not.toBe(firstKey);
  });

  it('resets lifecycle state without reusing the previous cache key', () => {
    const state = initialState();
    state.segment.backend = 'wasm';
    setImageState(state, image('first'));
    state.segment.embeddedFor = state.imageId;
    state.review.fromVersion = state.segment.version;
    const previousKey = maskCacheKey(state);

    resetState(state);
    setImageState(state, image('next'));

    expectInvalidated(state, 1, 1);
    expect(state.sessionId).toBe(1);
    expect(state.segment.backend).toBe('wasm');
    expect(maskCacheKey(state)).not.toBe(previousKey);
  });
});