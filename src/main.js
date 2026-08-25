/**
 * Stepper state machine and screen wiring.
 *
 * The app keeps exactly one image space (pixels of the downscaled photo, longest
 * side 2000) and one world space (millimetres on the floor plane). Steps read
 * and write `state` and paint through the shared CanvasView.
 */

import { CanvasView } from './ui/canvasView.js';
import { DebugLog } from './ui/debug.js';
import { SamSession } from './lib/sam.js';
import * as photo from './steps/photo.js';
import * as calibrate from './steps/calibrate.js';
import * as segment from './steps/segment.js';
import * as review from './steps/review.js';
import * as result from './steps/result.js';

const STEPS = [photo, calibrate, segment, review, result];

function initialState() {
  return {
    step: 1,
    imageId: 0,
    image: null, // { canvas, imageData, width, height }
    calibration: { taps: [], result: null },
    segment: { points: [], mode: 1, mask: null, version: 0, ready: false, embeddedFor: -1, backend: null },
    review: { polygon: null, fromVersion: -1, pixelCount: 0 },
    result: null,
  };
}

const stage = document.getElementById('stage');
const stepsEl = document.getElementById('steps');
const panelEl = document.getElementById('panel');
const emptyEl = document.getElementById('stage-empty');
const debug = new DebugLog();

const state = initialState();
const view = new CanvasView({
  container: stage,
  base: document.getElementById('photo'),
  overlay: document.getElementById('overlay'),
});

let samSession = null;

const app = {
  state,
  view,
  debug,
  onSamStatus: null,

  setPanel(html) {
    panelEl.innerHTML = html;
    panelEl.scrollTop = 0;
    return panelEl;
  },

  sam() {
    if (!samSession) {
      samSession = new SamSession({
        debug: debug.enabled,
        onStatus: (msg) => app.onSamStatus?.(msg),
        onLog: (source, message, data) => debug.log(source, message, data),
      });
    }
    return samSession;
  },

  resetSam() {
    samSession?.terminate();
    samSession = null;
  },

  setImage(image) {
    debug.log('main', 'image decoded', {
      decodedWidth: image.decodedWidth,
      decodedHeight: image.decodedHeight,
      downscaledWidth: image.width,
      downscaledHeight: image.height,
      byteLength: image.imageData.data.byteLength,
    });
    Object.assign(state, {
      image,
      imageId: state.imageId + 1,
      calibration: { taps: [], result: null },
      segment: { points: [], mode: 1, mask: null, version: state.segment.version + 1, ready: false, embeddedFor: -1, backend: state.segment.backend },
      review: { polygon: null, fromVersion: -1, pixelCount: 0 },
      result: null,
    });
    emptyEl.hidden = true;
    view.setImage(image.canvas);
  },

  reset() {
    const keepBackend = state.segment.backend;
    Object.assign(state, initialState());
    state.segment.backend = keepBackend;
    emptyEl.hidden = false;
    view.source = null;
    view.setDrawOverlay(null);
    const ctx = view.baseCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.base.width, view.base.height);
    view.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    view.overlayCtx.clearRect(0, 0, view.overlay.width, view.overlay.height);
    app.goTo(1);
  },

  goTo(n) {
    const target = STEPS[n - 1];
    if (!target || !target.canEnter(state)) return;
    STEPS[state.step - 1]?.leave?.(app);
    state.step = n;
    view.setInteraction({});
    view.setDrawOverlay(null);
    renderSteps();
    target.enter(app);
  },
};

function renderSteps() {
  stepsEl.innerHTML = '';
  STEPS.forEach((step, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = `${i + 1} · ${step.name}`;
    btn.disabled = !step.canEnter(state);
    if (state.step === i + 1) {
      btn.setAttribute('aria-current', 'step');
      requestAnimationFrame(() => btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
    else if (i + 1 < state.step) btn.classList.add('done');
    btn.onclick = () => app.goTo(i + 1);
    li.append(btn);
    stepsEl.append(li);
  });
}

// Debug handle for the manual test checklist in the README (dev builds only).
if (import.meta.env.DEV) window.hideApp = app;

window.addEventListener('resize', () => view.resize());
renderSteps();
STEPS[0].enter(app);
