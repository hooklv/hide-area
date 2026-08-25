/**
 * Two stacked canvases over one photo: the base canvas draws the image, the
 * overlay canvas draws masks, polygons and handles.
 *
 * Coordinates: everything the caller passes in or receives is IMAGE SPACE
 * (pixels of the downscaled photo). Screen space (CSS pixels inside the
 * container) never leaves this module except through imageToScreen(), which
 * overlay painters use to place their strokes.
 */

const HIT_RADIUS = 24;   // CSS px, finger-sized
const TAP_SLOP = 10;     // CSS px of movement still counted as a tap
const TAP_MS = 700;
const MAX_ZOOM = 12;

export class CanvasView {
  constructor({ container, base, overlay }) {
    this.container = container;
    this.base = base;
    this.overlay = overlay;
    this.baseCtx = base.getContext('2d');
    this.overlayCtx = overlay.getContext('2d');
    this.source = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.scale = 1;
    this.fitScale = 1;
    this.tx = 0;
    this.ty = 0;
    this.dpr = 1;
    this.drawOverlay = null;
    this.interaction = {};
    this.loupePoint = null;
    this.loupeScreen = null;
    this.pointers = new Map();
    this.dragIndex = -1;
    this.pinch = null;
    this.gesture = null;
    this._bind();
    this._observer = new ResizeObserver(() => this.resize());
    this._observer.observe(container);
  }

  _bind() {
    const el = this.overlay;
    el.addEventListener('pointerdown', (e) => this._onDown(e));
    el.addEventListener('pointermove', (e) => this._onMove(e));
    el.addEventListener('pointerup', (e) => this._onUp(e));
    el.addEventListener('pointercancel', (e) => this._onUp(e));
    el.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
  }

  /** @param {HTMLCanvasElement|ImageBitmap} source the downscaled photo */
  setImage(source) {
    this.source = source;
    this.imageWidth = source.width;
    this.imageHeight = source.height;
    this.resize();
    this.fit();
  }

  setDrawOverlay(fn) {
    this.drawOverlay = fn;
    this.render();
  }

  /**
   * @param {{getHandles?:()=>{x:number,y:number}[], onHandleMove?:Function,
   *          onHandleDown?:Function, onHandleUp?:Function, onTap?:Function,
   *          loupe?:boolean}} config
   */
  setInteraction(config) {
    this.interaction = config || {};
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const c of [this.base, this.overlay]) {
      c.width = Math.round(rect.width * this.dpr);
      c.height = Math.round(rect.height * this.dpr);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }
    this.viewWidth = rect.width;
    this.viewHeight = rect.height;
    if (this.imageWidth) {
      this.fitScale = Math.min(rect.width / this.imageWidth, rect.height / this.imageHeight);
      if (this.scale < this.fitScale) this.scale = this.fitScale;
      this._clamp();
      this.render();
    }
  }

  fit() {
    if (!this.imageWidth || !this.viewWidth) return;
    this.fitScale = Math.min(this.viewWidth / this.imageWidth, this.viewHeight / this.imageHeight);
    this.scale = this.fitScale;
    this.tx = (this.viewWidth - this.imageWidth * this.scale) / 2;
    this.ty = (this.viewHeight - this.imageHeight * this.scale) / 2;
    this.render();
  }

  _clamp() {
    const w = this.imageWidth * this.scale;
    const h = this.imageHeight * this.scale;
    this.tx = w <= this.viewWidth ? (this.viewWidth - w) / 2 : Math.min(0, Math.max(this.viewWidth - w, this.tx));
    this.ty = h <= this.viewHeight ? (this.viewHeight - h) / 2 : Math.min(0, Math.max(this.viewHeight - h, this.ty));
  }

  /** image space -> screen space (CSS px inside the container) */
  imageToScreen(p) {
    return { x: p.x * this.scale + this.tx, y: p.y * this.scale + this.ty };
  }

  /** screen space -> image space */
  screenToImage(p) {
    return { x: (p.x - this.tx) / this.scale, y: (p.y - this.ty) / this.scale };
  }

  _eventPoint(e) {
    const rect = this.overlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  zoomAt(screenPoint, factor) {
    const next = Math.max(this.fitScale, Math.min(this.fitScale * MAX_ZOOM, this.scale * factor));
    const k = next / this.scale;
    this.tx = screenPoint.x - (screenPoint.x - this.tx) * k;
    this.ty = screenPoint.y - (screenPoint.y - this.ty) * k;
    this.scale = next;
    this._clamp();
    this.render();
  }

  _hitHandle(screenPoint) {
    const handles = this.interaction.getHandles ? this.interaction.getHandles() : null;
    if (!handles || !handles.length) return -1;
    let best = -1;
    let bestDist = HIT_RADIUS;
    for (let i = 0; i < handles.length; i++) {
      const s = this.imageToScreen(handles[i]);
      const d = Math.hypot(s.x - screenPoint.x, s.y - screenPoint.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  _onDown(e) {
    this.overlay.setPointerCapture(e.pointerId);
    const p = this._eventPoint(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      this.dragIndex = -1;
      this.loupePoint = null;
      this.gesture = null;
      this.render();
      return;
    }
    if (this.pointers.size > 2) return;
    const index = this._hitHandle(p);
    this.gesture = { start: p, last: p, moved: false, time: performance.now(), id: e.pointerId };
    if (index >= 0) {
      this.dragIndex = index;
      const handles = this.interaction.getHandles();
      this.loupePoint = handles[index];
      this.loupeScreen = p;
      this.interaction.onHandleDown?.(index);
      this.render();
    }
  }

  _onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this._eventPoint(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinch.dist > 0) {
        const next = Math.max(this.fitScale, Math.min(this.fitScale * MAX_ZOOM, this.scale * (dist / this.pinch.dist)));
        const k = next / this.scale;
        this.tx = mid.x - (mid.x - this.tx) * k + (mid.x - this.pinch.mid.x);
        this.ty = mid.y - (mid.y - this.ty) * k + (mid.y - this.pinch.mid.y);
        this.scale = next;
        this._clamp();
        this.render();
      }
      this.pinch = { dist, mid };
      return;
    }

    if (!this.gesture || this.gesture.id !== e.pointerId) return;
    const dx = p.x - this.gesture.last.x;
    const dy = p.y - this.gesture.last.y;
    if (Math.hypot(p.x - this.gesture.start.x, p.y - this.gesture.start.y) > TAP_SLOP) this.gesture.moved = true;
    this.gesture.last = p;

    if (this.dragIndex >= 0) {
      const img = this.screenToImage(p);
      img.x = Math.max(0, Math.min(this.imageWidth, img.x));
      img.y = Math.max(0, Math.min(this.imageHeight, img.y));
      this.interaction.onHandleMove?.(this.dragIndex, img);
      this.loupePoint = img;
      this.loupeScreen = p;
      this.render();
      return;
    }
    if (this.gesture.moved) {
      this.tx += dx;
      this.ty += dy;
      this._clamp();
      this.render();
    }
  }

  _onUp(e) {
    const p = this._eventPoint(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;

    if (this.dragIndex >= 0) {
      this.interaction.onHandleUp?.(this.dragIndex);
      this.dragIndex = -1;
      this.loupePoint = null;
      this.gesture = null;
      this.render();
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.id !== e.pointerId) return;
    const isTap = !g.moved && performance.now() - g.time < TAP_MS && this.pointers.size === 0;
    if (isTap && this.interaction.onTap) {
      const img = this.screenToImage(p);
      if (img.x >= 0 && img.y >= 0 && img.x <= this.imageWidth && img.y <= this.imageHeight) {
        this.interaction.onTap(img);
      }
    }
  }

  _onWheel(e) {
    if (!this.source) return;
    e.preventDefault();
    this.zoomAt(this._eventPoint(e), Math.exp(-e.deltaY * 0.002));
  }

  /** Run a painter with the overlay context transformed into image space. */
  withImageTransform(ctx, fn) {
    ctx.save();
    ctx.translate(this.tx, this.ty);
    ctx.scale(this.scale, this.scale);
    fn(ctx);
    ctx.restore();
  }

  render() {
    if (!this.source || !this.viewWidth) return;
    const b = this.baseCtx;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.clearRect(0, 0, this.viewWidth, this.viewHeight);
    b.imageSmoothingQuality = 'high';
    this.withImageTransform(b, (ctx) => ctx.drawImage(this.source, 0, 0));

    const o = this.overlayCtx;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    o.clearRect(0, 0, this.viewWidth, this.viewHeight);
    this.drawOverlay?.(o, this);
  }
}
