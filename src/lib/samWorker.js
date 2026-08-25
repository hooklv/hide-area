/**
 * SAM inference, off the main thread.
 *
 * Protocol (main -> worker):  {type:'init'} | {type:'embed', id, image} | {type:'decode', id, points}
 * Protocol (worker -> main):  {type:'status'} | {type:'ready'} | {type:'done', id} | {type:'error', id}
 *
 * Points arrive in image space (pixels of the downscaled photo); the SAM
 * processor rescales them to the model's input size via reshape_input_points.
 */

import { assessMaskQuality } from './maskQuality.js';

const MODEL_ID = 'Xenova/slimsam-77-uniform';
// The SlimSAM vision encoder requested this binding size on a real Android
// device (WebGPU validation error: Binding size 805306368); keep this in sync
// with a measured model requirement rather than assuming a generic GPU limit.
const REQUIRED_STORAGE_BUFFER_BYTES = 805306368;
let SamModel;
let AutoProcessor;
let RawImage;
let requestedBackend = null;
let debugEnabled = false;
let modelCacheMiss = false;

let model = null;
let processor = null;
let backend = null;
let dtype = null;
let inputs = null;      // processor output for the current photo
let embeddings = null;  // cached image embeddings for the current photo
let imageSize = null;   // { width, height } in image space
let loading = null;
let webgpu = null;
let gpuFailure = null;

const post = (msg, transfer) => self.postMessage(msg, transfer || []);
const stringify = (value) => {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};
const log = (message, data) => {
  if (debugEnabled) post({ type: 'log', message, data });
};

function isModelRequest(url) {
  return typeof url === 'string'
    && url.startsWith('https://huggingface.co/')
    && url.includes(`/${MODEL_ID}/resolve/`);
}

function reportGpuFailure(error) {
  if (gpuFailure) return;
  gpuFailure = error instanceof Error ? error : new Error(String(error));
  model = null;
  embeddings = null;
  const message = `WebGPU failed: ${gpuFailure.message}`;
  log('WebGPU fatal error', message);
  post({ type: 'status', stage: 'error', message });
}

function throwIfGpuFailed() {
  if (gpuFailure) throw gpuFailure;
}

async function getWebGpu() {
  if (webgpu) return webgpu;
  if (!('gpu' in navigator)) return { supported: false, reason: 'navigator.gpu is unavailable' };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { supported: false, reason: 'No WebGPU adapter is available' };
  const available = adapter.limits.maxStorageBufferBindingSize;
  const supported = available >= REQUIRED_STORAGE_BUFFER_BYTES;
  const details = { requiredStorageBufferBytes: REQUIRED_STORAGE_BUFFER_BYTES, availableStorageBufferBytes: available };
  if (!supported) {
    const reason = `maxStorageBufferBindingSize ${available} is below the ${REQUIRED_STORAGE_BUFFER_BYTES} bytes required by SlimSAM`;
    log('WebGPU capability insufficient', { ...details, reason, forced: requestedBackend === 'webgpu' });
    post({ type: 'status', stage: 'warning', message: `WebGPU unavailable: ${reason}` });
    if (requestedBackend !== 'webgpu') return { supported, reason, ...details };
  }
  // Request the adapter's highest storage-binding limit. Transformers.js 3.7.6
  // forwards session_options to ONNX Runtime, which accepts this GPUDevice.
  const device = await adapter.requestDevice(supported
    ? { requiredLimits: { maxStorageBufferBindingSize: available } }
    : undefined);
  device.addEventListener('uncapturederror', (event) => reportGpuFailure(event.error));
  device.lost.then((info) => reportGpuFailure(new Error(`WebGPU device lost: ${info.message || info.reason || 'unknown reason'}`)));
  webgpu = { supported, device, ...details };
  log('WebGPU device configured', { ...details, requestedStorageBufferBytes: supported ? available : 'default', forced: requestedBackend === 'webgpu' });
  return webgpu;
}

log('worker module entry');

let transformers;
async function loadTransformers() {
  if (transformers) return transformers;
  try {
    transformers = await import('@huggingface/transformers');
    ({ SamModel, AutoProcessor, RawImage } = transformers);
    transformers.env.allowLocalModels = false;
    // Transformers.js stores successful model responses in Cache Storage.
    transformers.env.useBrowserCache = true;
    // This must be set before a session is created or Transformers.js falls
    // back to jsDelivr for its ONNX Runtime sidecar files.
    transformers.env.backends.onnx.wasm.wasmPaths = new URL(/* @vite-ignore */ './ort/', import.meta.url).href;
    return transformers;
  } catch (error) {
    log('transformers import failed', String(error?.message || error));
    throw error;
  }
}

const nativeFetch = self.fetch.bind(self);
self.fetch = async (...args) => {
  const request = args[0];
  const url = typeof request === 'string' ? request : request?.url;
  if (!modelCacheMiss && isModelRequest(url)) {
    modelCacheMiss = true;
    post({ type: 'status', stage: 'model-cache', hit: false });
  }
  log('model request started', { url });
  try {
    const response = await nativeFetch(...args);
    log('model request completed', { url: response.url || url, status: response.status, ok: response.ok });
    return response;
  } catch (error) {
    log('model request failed', { url, error: String(error?.message || error) });
    throw error;
  }
};

for (const level of ['warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    log(`console.${level}`, args.map(stringify).join(' '));
    original(...args);
  };
}
self.addEventListener('error', (event) => log('worker.onerror', event.message || event.error));
self.addEventListener('unhandledrejection', (event) => log('worker unhandledrejection', event.reason));

function progressReporter() {
  const files = new Map();
  return (data) => {
    if (data.status === 'progress' && data.file) {
      files.set(data.file, Math.min(100, data.progress || 0));
      let sum = 0;
      for (const v of files.values()) sum += v;
      if (modelCacheMiss) post({ type: 'status', stage: 'download', progress: Math.round(sum / files.size) });
      log('model download progress', { file: data.file, progress: Math.round(data.progress || 0) });
    } else if (data.status === 'done' && data.file) {
      files.set(data.file, 100);
      log('model download complete', { file: data.file });
    }
  };
}

function withTimeout(promise, stage, timeoutMs = 120000) {
  let timeout;
  const limit = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`SAM ${stage} timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timeout));
}

async function loadModel() {
  if (model) return backend;
  await loadTransformers();
  const progress_callback = progressReporter();
  post({ type: 'status', stage: 'phase', phase: 'model-load-started' });
  processor = await withTimeout(AutoProcessor.from_pretrained(MODEL_ID), 'processor load');
  // Pin WebGPU to fp32: reduced precision model weights can collapse SAM logits.
  const candidates = requestedBackend ? [requestedBackend] : ['webgpu', 'wasm'];
  let lastError = null;
  for (const device of candidates) {
    if (device === 'webgpu') {
      const capability = await getWebGpu();
      if (!capability.supported && requestedBackend !== 'webgpu') continue;
      if (!capability.device) {
        lastError = new Error(capability.reason || 'No WebGPU device is available');
        continue;
      }
    }
    const options = {
      device,
      dtype: 'fp32',
      ...(device === 'webgpu' ? { session_options: { executionProviders: [{ name: 'webgpu', device: webgpu.device }] } } : {}),
    };
    try {
      post({ type: 'status', stage: 'load', device: options.device, dtype: options.dtype });
      model = await withTimeout(SamModel.from_pretrained(MODEL_ID, { ...options, progress_callback }), 'model load');
      throwIfGpuFailed();
      backend = options.device;
      dtype = options.dtype;
      if (!modelCacheMiss) post({ type: 'status', stage: 'model-cache', hit: true });
      post({ type: 'status', stage: 'phase', phase: 'model-load-finished', backend, dtype });
      return backend;
    } catch (err) {
      lastError = err;
      model = null;
    }
  }
  throw lastError || new Error('No inference backend available');
}

async function load() {
  if (model) return backend;
  if (!loading) {
    loading = loadModel().catch((error) => {
      model = null;
      processor = null;
      backend = null;
      throw error;
    }).finally(() => { loading = null; });
  }
  return loading;
}

async function embed(image) {
  await load();
  throwIfGpuFailed();
  post({ type: 'status', stage: 'phase', phase: 'image-transferred', byteLength: image.data.byteLength, detached: image.data.byteLength === 0 });
  post({ type: 'status', stage: 'phase', phase: 'embedding-started' });
  const raw = new RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4).rgb();
  imageSize = { width: image.width, height: image.height };
  inputs = await processor(raw);
  embeddings = await model.get_image_embeddings(inputs);
  if (webgpu?.device) await webgpu.device.queue.onSubmittedWorkDone();
  throwIfGpuFailed();
  post({ type: 'status', stage: 'phase', phase: 'embedding-finished' });
  return { backend, dtype };
}

/** @param {{x:number,y:number,label:number}[]} points image space, label 1 = add, 0 = remove */
async function decode(points) {
  if (!embeddings) throw new Error('Image embedding is not ready');
  throwIfGpuFailed();
  post({ type: 'status', stage: 'phase', phase: 'decode-started' });
  const coords = [points.map((p) => [p.x, p.y])];
  const labels = [points.map((p) => p.label)];
  const input_points = processor.reshape_input_points(coords, inputs.original_sizes, inputs.reshaped_input_sizes);
  const input_labels = processor.image_processor.add_input_labels(labels, input_points);

  const outputs = await model({ ...embeddings, input_points, input_labels });
  if (webgpu?.device) await webgpu.device.queue.onSubmittedWorkDone();
  throwIfGpuFailed();
  const masks = await processor.post_process_masks(
    outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes, { binarize: false },
  );
  const tensor = masks[0];
  const [, count, height, width] = tensor.dims;
  const scores = outputs.iou_scores.data;
  let best = 0;
  for (let i = 1; i < count; i++) if (scores[i] > scores[best]) best = i;

  const src = tensor.data;
  const offset = best * height * width;
  const mask = new Uint8Array(height * width);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let pixelCount = 0;
  for (let i = 0; i < mask.length; i++) {
    const logit = src[offset + i];
    min = Math.min(min, logit);
    max = Math.max(max, logit);
    sum += logit;
    // SAM mask logits use zero as the foreground boundary.
    if (logit > 0) { mask[i] = 1; pixelCount++; }
  }
  const promptTensor = Array.from(input_points.data);
  const debug = {
    rawLogits: { min, max, mean: sum / mask.length },
    selectedMaskIndex: best,
    selectedIouScore: scores[best],
    pixelCount,
    imageSize,
    originalSize: inputs.original_sizes[0],
    reshapedInputSize: inputs.reshaped_input_sizes[0],
    tappedPoints: points.map(({ x, y, label }) => ({ x, y, label })),
    modelPoints: promptTensor,
    modelLabels: Array.from(input_labels.data, Number),
  };
  const quality = assessMaskQuality(mask, width, height);
  debug.quality = quality;
  if (!quality.ok) {
    log('SAM mask rejected', { ...quality, selectedMaskIndex: best, selectedIouScore: scores[best] });
    throw new Error(`Segmentation failed: ${quality.reason} Retry with another prompt or use WASM.`);
  }
  if (debugEnabled) console.debug('[SAM decode diagnostics]', debug);
  post({ type: 'status', stage: 'phase', phase: 'decode-finished' });
  return {
    payload: {
      mask,
      width,
      height,
      score: scores[best],
      backend,
      dtype,
      debug,
    },
    transfer: [mask.buffer],
  };
}

self.addEventListener('message', async (event) => {
  const { type, id, ...rest } = event.data;
  try {
    if (type === 'init') {
      requestedBackend = new URLSearchParams(rest.search).get('backend');
      debugEnabled = new URLSearchParams(rest.search).get('debug') === '1';
      if (requestedBackend && !['wasm', 'webgpu'].includes(requestedBackend)) {
        throw new Error(`Unsupported backend '${requestedBackend}'. Use wasm or webgpu.`);
      }
      const device = await load();
      post({ type: 'ready', id, backend: device });
    } else if (type === 'embed') {
      const started = performance.now();
      const result = await embed(rest.image);
      post({ type: 'done', id, payload: { ...result, ms: Math.round(performance.now() - started) } });
    } else if (type === 'decode') {
      const started = performance.now();
      const { payload, transfer } = await decode(rest.points);
      post({ type: 'done', id, payload: { ...payload, ms: Math.round(performance.now() - started) } }, transfer);
    }
  } catch (err) {
    log('worker request failed', { type, id, error: String(err?.message || err) });
    post({ type: 'error', id, message: String(err?.message || err) });
  }
});
