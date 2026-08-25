/**
 * Main-thread handle on the SAM worker: model load, one embedding per photo,
 * and interactive mask decodes. All coordinates are image space.
 */

export class SamSession {
  /** @param {{onStatus?:(s:{stage:string, progress?:number, device?:string})=>void}} [opts] */
  constructor(opts = {}) {
    this.onStatus = opts.onStatus || (() => {});
    this.worker = new Worker(new URL('./samWorker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.backend = null;
    this.embedded = null;   // promise for the current photo's embedding
    this.queue = Promise.resolve();
    this.worker.addEventListener('message', (event) => this._onMessage(event.data));
    this.worker.addEventListener('error', (event) => {
      for (const { reject } of this.pending.values()) reject(new Error(event.message || 'Worker failed'));
      this.pending.clear();
    });
  }

  _onMessage(msg) {
    if (msg.type === 'status') { this.onStatus(msg); return; }
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    if (msg.type === 'error') entry.reject(new Error(msg.message));
    else if (msg.type === 'ready') entry.resolve(msg.backend);
    else entry.resolve(msg.payload);
  }

  _send(type, body, transfer) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...body }, transfer || []);
    });
  }

  /** Load the model (downloads on first run) and report the active backend. */
  async init() {
    if (!this.backend) this.backend = await this._send('init', {});
    return this.backend;
  }

  /**
   * Compute and cache the image embedding. Called once per photo; prompt point
   * changes never reach this.
   * @param {ImageData} imageData the downscaled photo
   */
  setImage(imageData) {
    const copy = new Uint8ClampedArray(imageData.data); // detached into the worker
    this.embedded = this._send(
      'embed',
      { image: { data: copy.buffer, width: imageData.width, height: imageData.height } },
      [copy.buffer],
    ).then((res) => {
      this.backend = res.backend || this.backend;
      return res;
    });
    return this.embedded;
  }

  /**
   * Run the mask decoder against the cached embedding.
   * @param {{x:number,y:number,label:number}[]} points image space
   * @returns {Promise<{mask:Uint8Array,width:number,height:number,score:number,ms:number}>}
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
    this.worker.terminate();
    this.pending.clear();
  }
}
