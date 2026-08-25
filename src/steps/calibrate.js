/** Step 2: tap the four A4 corners and solve the image px -> mm homography. */

import { calibrateA4, orderQuad } from '../lib/homography.js';
import { drawHandle, strokePolygon, drawLabel } from '../ui/draw.js';
import { drawLoupe } from '../ui/loupe.js';

export const name = 'Calibrate';
export const canEnter = (state) => !!state.image;

function recompute(state) {
  const taps = state.calibration.taps;
  state.calibration.result = taps.length === 4 ? calibrateA4(taps) : null;
}

export function enter(app) {
  const { state, view } = app;
  const panel = app.setPanel(`
    <h2>2 · Calibrate on the A4 sheet</h2>
    <p>Tap the four corners of the sheet, in any order. Drag a corner to correct it — the loupe shows what is under your finger.</p>
    <p class="status" id="status"></p>
    <div class="row">
      <button class="btn" id="reset">Reset corners</button>
      <button class="btn" id="fit">Fit photo</button>
      <button class="btn primary wide" id="next" disabled>Next: segment</button>
    </div>
  `);

  const status = panel.querySelector('#status');
  const next = panel.querySelector('#next');

  function refresh() {
    const taps = state.calibration.taps;
    const res = state.calibration.result;
    if (taps.length < 4) {
      status.className = 'status';
      status.textContent = `${taps.length} of 4 corners placed.`;
      next.disabled = true;
    } else if (!res.ok) {
      status.className = 'status bad';
      status.textContent = res.error;
      next.disabled = true;
    } else {
      const warn = res.warnings.length ? ` ${res.warnings.join(' ')}` : '';
      status.className = res.warnings.length ? 'status warn' : 'status ok';
      status.textContent = `Scale ${res.mmPerPx.toFixed(3)} mm/px · sheet reprojects to ${Math.round(res.target.width)} × ${Math.round(res.target.height)} mm (error ${res.maxErrorPct.toFixed(2)}%).${warn}`;
      next.disabled = false;
    }
    view.render();
  }

  panel.querySelector('#reset').onclick = () => {
    state.calibration.taps = [];
    state.calibration.result = null;
    refresh();
  };
  panel.querySelector('#fit').onclick = () => view.fit();
  next.onclick = () => app.goTo(3);

  view.setInteraction({
    getHandles: () => state.calibration.taps,
    onTap: (p) => {
      if (state.calibration.taps.length >= 4) return;
      state.calibration.taps.push(p);
      recompute(state);
      refresh();
    },
    onHandleMove: (index, p) => {
      state.calibration.taps[index] = p;
      recompute(state);
      refresh();
    },
  });

  view.setDrawOverlay((ctx, v) => {
    const taps = state.calibration.taps;
    const res = state.calibration.result;
    const ring = taps.length === 4 ? (res?.ok ? res.quad : orderQuad(taps)) : taps;
    const screen = ring.map((p) => v.imageToScreen(p));
    if (screen.length >= 2) {
      strokePolygon(ctx, screen, {
        close: screen.length === 4,
        color: res && !res.ok ? '#f07070' : '#72e08a',
        fill: screen.length === 4 ? 'rgba(114,224,138,0.12)' : null,
        dash: screen.length === 4 ? null : [6, 5],
      });
    }
    taps.forEach((p, i) => drawHandle(ctx, v.imageToScreen(p), { label: i + 1, active: v.dragIndex === i }));
    if (res?.ok) {
      // below the sheet, so the readout never covers the corners being placed
      const cx = screen.reduce((a, p) => a + p.x / screen.length, 0);
      const bottom = Math.max(...screen.map((p) => p.y));
      drawLabel(ctx, { x: cx, y: Math.min(bottom + 24, v.viewHeight - 16) }, `${res.mmPerPx.toFixed(3)} mm/px`);
    }
    drawLoupe(ctx, { view: v, imagePoint: v.loupePoint, screenPoint: v.loupeScreen });
  });

  recompute(state);
  refresh();
}
