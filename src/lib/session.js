/** Shared state transitions that invalidate a measurement. */

export function initialState() {
  return {
    step: 1,
    sessionId: 0,
    imageId: 0,
    image: null,
    calibration: { taps: [], result: null },
    segment: { points: [], mode: 1, mask: null, version: 0, ready: false, embeddedFor: -1, backend: null },
    review: { polygon: null, fromVersion: -1, pixelCount: 0 },
    result: null,
  };
}

export function setImageState(state, image) {
  Object.assign(state, {
    image,
    imageId: state.imageId + 1,
    calibration: { taps: [], result: null },
    segment: { points: [], mode: 1, mask: null, version: state.segment.version + 1, ready: false, embeddedFor: -1, backend: state.segment.backend },
    review: { polygon: null, fromVersion: -1, pixelCount: 0 },
    result: null,
  });
  return state;
}

export function resetState(state) {
  const keepBackend = state.segment.backend;
  const nextSessionId = state.sessionId + 1;
  Object.assign(state, initialState());
  state.sessionId = nextSessionId;
  state.segment.backend = keepBackend;
  return state;
}

export function maskCacheKey(state) {
  return `${state.sessionId}:${state.imageId}:${state.segment.version}`;
}