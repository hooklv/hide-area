/**
 * Magnifier shown while a handle is dragged: a zoomed circular inset offset
 * from the finger, so the corner being placed stays visible.
 * Draws in screen space (CSS px) on the overlay context.
 */

const RADIUS = 56;
const ZOOM = 3;
const OFFSET = 86;

/**
 * @param {CanvasRenderingContext2D} ctx overlay context, screen space
 * @param {{view:*, imagePoint:{x:number,y:number}, screenPoint:{x:number,y:number},
 *          decorate?:(ctx:CanvasRenderingContext2D)=>void}} opts
 *   imagePoint is the point under the finger in image space; decorate paints
 *   extra content inside the loupe using the same image-space transform.
 */
export function drawLoupe(ctx, { view, imagePoint, screenPoint, decorate }) {
  if (!imagePoint || !screenPoint || !view.source) return;
  let cx = screenPoint.x;
  let cy = screenPoint.y - OFFSET;
  if (cy - RADIUS < 6) cy = screenPoint.y + OFFSET;
  cx = Math.max(RADIUS + 6, Math.min(view.viewWidth - RADIUS - 6, cx));
  cy = Math.max(RADIUS + 6, Math.min(view.viewHeight - RADIUS - 6, cy));

  const k = view.scale * ZOOM;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.clip();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(-imagePoint.x, -imagePoint.y);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(view.source, 0, 0);
  if (decorate) {
    ctx.lineWidth = 1.5 / k;
    decorate(ctx);
  }
  ctx.restore();
  // crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 12);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
