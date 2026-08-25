/**
 * Main-thread handle on the SAM worker: model load, one embedding per photo,
 * and interactive mask decodes. All coordinates are image space.
 */

export class SamSession {
  /** @param {{debug?:boolean,onStatus?:(s:{stage:string, progress?:number, device?:string, dtype?:string})=>void,onLog?:(source:string,message:string,data?:unknown)=>void}} [opts] */
  constructor(opts = {}) {
    this.debug = opts.debug === true;
    this.onStatus = opts.onStatus || (() => {});
    this.onLog = opts.onLog || (() => {});
    this.worker = new Worker(new URL('./samWorker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.backend = null;
    this.closed = false;
    this.startedAt = performance.now();
    this.embedded = null;   // promise for the current photo's embedding
    this.queue = Promise.resolve();
    if (this.debug) console.debug('[SAM phase]', { phase: 'worker-created', ms: 0 });
    this.onLog('main', '[SAM phase]', { phase: 'worker-created', ms: 0 });
    this.worker.addEventListener('message', (event) => this._onMessage(event.data));
    this.worker.addEventListener('error', (event) => {
      this._fail(new Error(event.message || 'Worker failed'));
    });
  }

  _fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pending.clear();
    this.backend = null;
    this.embedded = null;
    this.queue = Promise.resolve();
    this.onLog('main', 'worker failed', String(error?.message || error));
    this.worker.terminate();
  }

  _onMessage(msg) {
    if (msg.type === 'status') {
      const phase = { ...msg, ms: Math.round(performance.now() - this.startedAt) };
      if (this.debug) console.debug('[SAM phase]', phase);
      this.onLog('worker', '[SAM phase]', phase);
      this.onStatus(msg);
      return;
    }
    if (msg.type === 'log') {
      this.onLog('worker', msg.message, msg.data);
      return;
    }
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    clearTimeout(entry.timeout);
    if (msg.type === 'error') entry.reject(new Error(msg.message));
    else if (msg.type === 'ready') entry.resolve(msg.backend);
    else entry.resolve(msg.payload);
  }

  _send(type, body, transfer) {
    if (this.closed) return Promise.reject(new Error('SAM worker is not available. Retry to create a new session.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeoutMs = type === 'decode' ? 30000 : 120000;
      const timeout = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        const error = new Error(`SAM ${type} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        this.onLog('main', 'RPC timeout', { phase: type, waitedMs: timeoutMs });
        this._fail(error);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ type, id, ...body }, transfer || []);
    });
  }

  /** Load the model (downloads on first run) and report the active backend. */
  async init() {
    if (!this.backend) this.backend = await this._send('init', { search: window.location.search });
    return this.backend;
  }

  /**
   * Compute and cache the image embedding. Called once per photo; prompt point
   * changes never reach this.
   * @param {ImageData} imageData the downscaled photo
   */
  setImage(imageData) {
    const sourceBytes = imageData.data.byteLength;
    const copy = new Uint8ClampedArray(imageData.data); // detached into the worker
    if (this.debug) console.debug('[SAM phase]', { phase: 'image-transfer', byteLength: copy.byteLength, sourceBytes, sourceDetached: sourceBytes === 0 });
    this.onLog('main', '[SAM phase]', { phase: 'image-transfer', byteLength: copy.byteLength, sourceBytes, sourceDetached: sourceBytes === 0 });
    this.embedded = this._send(
      'embed',
      { image: { data: copy.buffer, width: imageData.width, height: imageData.height } },
      [copy.buffer],
    ).then((res) => {
      if (this.debug) console.debug('[SAM phase]', { phase: 'embedding-finished', ms: res.ms });
      this.backend = res.backend || this.backend;
      return res;
    });
    return this.embedded;
  }

  /**
   * Run the mask decoder against the cached embedding.
   * @param {{x:number,y:number,label:number}[]} points image space
  * @returns {Promise<{mask:Uint8Array,width:number,height:number,score:number,ms:number,debug:object}>}
   */
  decode(points) {
    const run = async () => {
      if (!this.embedded) throw new Error('No image is loaded');
      await this.embedded;
      return this._send('decode', { points });
    };
    // Serialise decodes so overlapping taps cannot interleave in the worker.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  terminate() {
    this._fail(new Error('SAM worker was terminated'));
  }
}
