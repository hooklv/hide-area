/** Step 3: SAM point prompts. The image embedding is computed once per photo. */

import { drawLabel, drawPrompt, maskToCanvas } from '../ui/draw.js';

export const name = 'Segment';
export const canEnter = (state) => !!state.calibration.result?.ok;

// Rebuilding the tinted mask bitmap costs a full-image ImageData pass, so it is
// cached against the mask version and reused across pan/zoom frames.
const maskCache = { version: -1, canvas: null };

export function enter(app) {
  const { state, view } = app;
  const panel = app.setPanel(`
    <h2>3 · Tap the hide</h2>
    <p>Tap on the hide to select it. Switch to Remove and tap anything the mask grabbed by mistake.</p>
    <div class="progress" id="bar" hidden><i style="width:0%"></i></div>
    <p class="status" id="status">Preparing image…</p>
    <button class="btn wide" id="retry" hidden>Retry model</button>
    <div class="row">
      <div class="toggle" id="mode">
        <button data-label="1" aria-pressed="true">Add area</button>
        <button data-label="0" aria-pressed="false">Remove area</button>
      </div>
      <button class="btn" id="reset">Reset points</button>
    </div>
    <div class="row">
      <button class="btn primary wide" id="next" disabled>Next: review outline</button>
    </div>
  `);

  const status = panel.querySelector('#status');
  const bar = panel.querySelector('#bar');
  const fill = bar.querySelector('i');
  const next = panel.querySelector('#next');
  const retry = panel.querySelector('#retry');
  const modeButtons = [...panel.querySelectorAll('#mode button')];
  const entryImageId = state.imageId;
  const entryId = (app.segmentEntryId || 0) + 1;
  app.segmentEntryId = entryId;
  const isCurrent = () => app.segmentEntryId === entryId && state.step === 3 && state.imageId === entryImageId;

  const setStatus = (text, kind = '') => { status.className = `status ${kind}`.trim(); status.textContent = text; };

  modeButtons.forEach((btn) => {
    btn.onclick = () => {
      state.segment.mode = Number(btn.dataset.label);
      modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.label) === state.segment.mode)));
    };
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.label) === state.segment.mode));
  });

  panel.querySelector('#reset').onclick = () => {
    state.segment.points = [];
    state.segment.mask = null;
    state.segment.debug = null;
    state.segment.version++;
    next.disabled = true;
    setStatus('Points cleared. Tap the hide.');
    view.render();
  };
  next.onclick = () => app.goTo(4);

  app.onSamStatus = (msg) => {
    if (!isCurrent()) return;
    if (msg.stage === 'download') {
      bar.hidden = false;
      fill.style.width = `${msg.progress}%`;
      setStatus(`Downloading the model, one time only… ${msg.progress}%`);
    } else if (msg.stage === 'load') {
      setStatus(`Starting the model on ${msg.device} (${msg.dtype})…`);
    } else if (msg.stage === 'warning') {
      setStatus(msg.message, 'bad');
    } else if (msg.stage === 'error') {
      state.segment.ready = false;
      setStatus(msg.message, 'bad');
      retry.hidden = false;
    } else if (msg.stage === 'phase') {
      console.debug('[SAM phase]', msg);
    }
  };

  view.setInteraction({
    onTap: (p) => {
      if (!state.segment.ready) return;
      state.segment.points.push({ x: p.x, y: p.y, label: state.segment.mode });
      view.render();
      run();
    },
  });

  view.setDrawOverlay((ctx, v) => {
    const seg = state.segment;
    if (seg.mask) {
      if (maskCache.version !== seg.version) {
        maskCache.canvas = maskToCanvas(seg.mask.data, seg.mask.width, seg.mask.height, maskCache.canvas);
        maskCache.version = seg.version;
      }
      ctx.save();
      ctx.globalAlpha = 0.45;
      v.withImageTransform(ctx, (c) => c.drawImage(maskCache.canvas, 0, 0));
      ctx.restore();
    }
    seg.points.forEach((p) => drawPrompt(ctx, v.imageToScreen(p), p.label));
    if (seg.debug) {
      const { rawLogits, selectedMaskIndex, selectedIouScore, pixelCount } = seg.debug;
      drawLabel(ctx, { x: 168, y: 18 },
        `logits ${rawLogits.min.toFixed(3)}..${rawLogits.max.toFixed(3)} avg ${rawLogits.mean.toFixed(3)} | mask ${selectedMaskIndex} IoU ${(selectedIouScore * 100).toFixed(1)}% | ${pixelCount} px`);
    }
  });

  let busy = false;
  let queued = false;
  async function run() {
    if (busy) { queued = true; return; }
    const points = state.segment.points;
    if (!points.length) return;
    busy = true;
    setStatus('Segmenting…');
    try {
      const out = await app.sam().decode(points.map((p) => ({ x: p.x, y: p.y, label: p.label })));
      if (!isCurrent()) return;
      state.segment.mask = { data: out.mask, width: out.width, height: out.height };
      state.segment.debug = out.debug;
      state.segment.version++;
      next.disabled = false;
      state.segment.backend = out.backend || state.segment.backend;
      setStatus(`Mask updated in ${out.ms} ms · ${state.segment.backend} (${out.dtype}) · confidence ${(out.score * 100).toFixed(0)}%`, 'ok');
      view.render();
    } catch (err) {
      if (!isCurrent()) return;
      setStatus(String(err.message || err), 'bad');
      retry.hidden = false;
    } finally {
      busy = false;
      if (queued) { queued = false; run(); }
    }
  }

  async function prepare({ resetWorker = false } = {}) {
    retry.hidden = true;
    next.disabled = true;
    state.segment.ready = false;
    if (resetWorker) {
      app.resetSam();
      state.segment.embeddedFor = -1;
      state.segment.mask = null;
    }
    try {
      const sam = app.sam();
      state.segment.backend = await sam.init();
      if (!isCurrent()) return;
      bar.hidden = true;
      if (state.segment.embeddedFor !== state.imageId) {
        setStatus(`Preparing image on ${state.segment.backend}…`);
        const res = await sam.setImage(state.image.imageData);
        if (!isCurrent()) return;
        state.segment.embeddedFor = state.imageId;
        state.segment.backend = res.backend || state.segment.backend;
        setStatus(`Ready in ${res.ms} ms on ${state.segment.backend}. Tap the hide.`, 'ok');
      } else {
        setStatus(`Ready on ${state.segment.backend}. Tap the hide.`, 'ok');
      }
      state.segment.ready = true;
      if (state.segment.points.length && !state.segment.mask) run();
      else if (state.segment.mask) next.disabled = false;
    } catch (err) {
      if (!isCurrent()) return;
      setStatus(`Model failed: ${err.message || err}`, 'bad');
      retry.hidden = false;
    }
  }

  retry.onclick = () => prepare({ resetWorker: true });
  prepare();

  view.render();
}

export function leave(app) {
  app.segmentEntryId = (app.segmentEntryId || 0) + 1;
  app.onSamStatus = null;
}
