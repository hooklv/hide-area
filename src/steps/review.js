/** Step 4: mask -> polygon, then vertex editing over the photo. */

import { maskToPolygon } from '../lib/contour.js';
import { strokePolygon, drawDot } from '../ui/draw.js';
import { drawLoupe } from '../ui/loupe.js';

export const name = 'Outline';
export const canEnter = (state) => !!state.segment.mask;

function trace(state) {
  const { data, width, height } = state.segment.mask;
  // Vertex count and spacing are the contour module's rule, not this step's.
  const poly = maskToPolygon(data, width, height);
  state.review.polygon = poly ? poly.points : null;
  state.review.fromVersion = state.segment.version;
  state.review.pixelCount = poly ? poly.pixelCount : 0;
  return poly;
}

export function enter(app) {
  const { state, view } = app;
  const panel = app.setPanel(`
    <h2>4 · Review the outline</h2>
    <p>Drag any vertex to correct the edge. Pinch or scroll to zoom, drag the photo to pan.</p>
    <p class="hint">Holes inside the hide are not subtracted in this version.</p>
    <p class="status" id="status">Tracing outline…</p>
    <div class="row">
      <button class="btn" id="reset">Reset outline</button>
      <button class="btn" id="fit">Fit photo</button>
      <button class="btn primary wide" id="next" disabled>Show area</button>
    </div>
  `);

  const status = panel.querySelector('#status');
  const next = panel.querySelector('#next');

  function refresh() {
    const poly = state.review.polygon;
    if (!poly) {
      status.className = 'status bad';
      status.textContent = 'Nothing to outline. Go back and add a point on the hide.';
      next.disabled = true;
    } else {
      status.className = 'status ok';
      status.textContent = `${poly.length} vertices.`;
      next.disabled = false;
    }
    view.render();
  }

  panel.querySelector('#reset').onclick = () => { trace(state); refresh(); };
  panel.querySelector('#fit').onclick = () => view.fit();
  next.onclick = () => app.goTo(5);

  view.setInteraction({
    getHandles: () => state.review.polygon || [],
    onHandleMove: (index, p) => {
      state.review.polygon[index] = p;
      view.render();
    },
  });

  view.setDrawOverlay((ctx, v) => {
    const poly = state.review.polygon;
    if (!poly) return;
    const screen = poly.map((p) => v.imageToScreen(p));
    strokePolygon(ctx, screen, { fill: 'rgba(114,224,138,0.14)', color: '#72e08a', width: 2 });
    // Handles get bigger as you zoom in, so a dense outline stays tappable.
    const r = Math.max(2, Math.min(7, 1.5 + v.scale * 4));
    screen.forEach((p, i) => drawDot(ctx, p, { radius: v.dragIndex === i ? r + 3 : r }));
    drawLoupe(ctx, {
      view: v,
      imagePoint: v.loupePoint,
      screenPoint: v.loupeScreen,
      decorate: (c) => {
        c.beginPath();
        poly.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.strokeStyle = '#72e08a';
        c.stroke();
      },
    });
  });

  if (state.review.fromVersion !== state.segment.version || !state.review.polygon) {
    view.render();
    // let the panel paint before the trace blocks for a few tens of ms
    setTimeout(() => { trace(state); refresh(); }, 0);
  } else {
    refresh();
  }
}
