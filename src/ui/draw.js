/** Small canvas helpers shared by the steps. All arguments are screen space (CSS px). */

export function strokePolygon(ctx, points, { close = true, color = '#72e08a', width = 2, fill = null, dash = null } = {}) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (dash) ctx.setLineDash(dash);
  ctx.lineWidth = width + 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

export function drawHandle(ctx, p, { radius = 8, color = '#72e08a', label = null, active = false } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius + (active ? 3 : 0), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  if (label !== null) {
    ctx.fillStyle = '#10241a';
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label), p.x, p.y + 0.5);
  }
  ctx.restore();
}

export function drawDot(ctx, p, { radius = 5, color = '#72e08a' } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  ctx.restore();
}

/** Point prompt marker: + for add, - for remove. */
export function drawPrompt(ctx, p, label) {
  const color = label ? '#72e08a' : '#f07070';
  drawDot(ctx, p, { radius: 9, color });
  ctx.save();
  ctx.strokeStyle = '#10241a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
  if (label) { ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); }
  ctx.stroke();
  ctx.restore();
}

export function drawLabel(ctx, p, text) {
  ctx.save();
  ctx.font = '600 12px -apple-system, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  const h = 22;
  const x = Math.round(p.x - w / 2);
  const y = Math.round(p.y - h / 2);
  ctx.fillStyle = 'rgba(17,18,20,0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#eef0f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
}

/** Paint a binary mask into a reusable canvas, tinted for overlay use. */
export function maskToCanvas(mask, width, height, canvas, rgb = [114, 224, 138]) {
  const c = canvas && canvas.width === width && canvas.height === height ? canvas : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(width, height);
  const data = img.data;
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    if (mask[i]) {
      data[j] = rgb[0];
      data[j + 1] = rgb[1];
      data[j + 2] = rgb[2];
      data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
