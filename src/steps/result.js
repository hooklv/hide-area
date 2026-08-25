/** Step 5: transform the outline into millimetres and report the area. */

import { transformPoints } from '../lib/homography.js';
import { polygonArea, formatArea } from '../lib/area.js';
import { strokePolygon } from '../ui/draw.js';

export const name = 'Area';
export const canEnter = (state) => !!state.review.polygon && !!state.calibration.result?.ok;

export function measure(state) {
  const mm = transformPoints(state.calibration.result.H, state.review.polygon);
  return { mm2: polygonArea(mm), formatted: formatArea(polygonArea(mm)) };
}

export function enter(app) {
  const { state, view } = app;
  const { mm2, formatted } = measure(state);
  state.result = { mm2 };

  const panel = app.setPanel(`
    <h2>5 · Area</h2>
    <div class="result">
      <div><b>${formatted.m2}</b><span>m²</span></div>
      <div><b>${formatted.dm2}</b><span>dm²</span></div>
      <div><b>${formatted.sqft}</b><span>sq ft</span></div>
    </div>
    <p class="hint">Outer contour only, ${state.review.polygon.length} vertices, scale ${state.calibration.result.mmPerPx.toFixed(3)} mm/px. Holes are not subtracted.</p>
    <div class="row">
      <button class="btn" id="back">Edit outline</button>
      <button class="btn primary wide" id="again">Measure another hide</button>
    </div>
  `);

  panel.querySelector('#back').onclick = () => app.goTo(4);
  panel.querySelector('#again').onclick = () => app.reset();

  view.setInteraction({});
  view.setDrawOverlay((ctx, v) => {
    strokePolygon(ctx, state.review.polygon.map((p) => v.imageToScreen(p)), {
      fill: 'rgba(114,224,138,0.18)', color: '#72e08a', width: 2,
    });
  });
  view.fit();
}
