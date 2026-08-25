/**
 * SAM inference, off the main thread.
 *
 * Protocol (main -> worker):  {type:'init'} | {type:'embed', id, image} | {type:'decode', id, points}
 * Protocol (worker -> main):  {type:'status'} | {type:'ready'} | {type:'done', id} | {type:'error', id}
 *
 * Points arrive in image space (pixels of the downscaled photo); the SAM
 * processor rescales them to the model's input size via reshape_input_points.
 */

import { SamModel, AutoProcessor, RawImage, Tensor, env } from '@huggingface/transformers';

env.allowLocalModels = false; // this app has no bundled model directory

const MODEL_ID = 'Xenova/slimsam-77-uniform';

let model = null;
let processor = null;
let backend = null;
let inputs = null;      // processor output for the current photo
let embeddings = null;  // cached image embeddings for the current photo
let imageSize = null;   // { width, height } in image space

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

function progressReporter() {
  const files = new Map();
  return (data) => {
    if (data.status === 'progress' && data.file) {
      files.set(data.file, Math.min(100, data.progress || 0));
      let sum = 0;
      for (const v of files.values()) sum += v;
      post({ type: 'status', stage: 'download', progress: Math.round(sum / files.size) });
    } else if (data.status === 'done' && data.file) {
      files.set(data.file, 100);
    }
  };
}

async function load() {
  if (model) return backend;
  const progress_callback = progressReporter();
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  // Try WebGPU first, fall back to WASM transparently. Device defaults decide
  // the dtype, so we only request weights the model repo actually publishes.
  const attempts = [
    { device: 'webgpu' },
    { device: 'wasm' },
    { device: 'wasm', dtype: 'q8' },
  ];
  let lastError = null;
  for (const options of attempts) {
    if (options.device === 'webgpu' && !('gpu' in navigator)) continue;
    try {
      post({ type: 'status', stage: 'load', device: options.device });
      model = await SamModel.from_pretrained(MODEL_ID, { ...options, progress_callback });
      backend = options.device;
      return backend;
    } catch (err) {
      lastError = err;
      model = null;
    }
  }
  throw lastError || new Error('No inference backend available');
}

async function embed(image) {
  await load();
  const raw = new RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4).rgb();
  imageSize = { width: image.width, height: image.height };
  inputs = await processor(raw);
  embeddings = await model.get_image_embeddings(inputs);
  return { backend };
}

/** @param {{x:number,y:number,label:number}[]} points image space, label 1 = add, 0 = remove */
async function decode(points) {
  if (!embeddings) throw new Error('Image embedding is not ready');
  const coords = [points.map((p) => [p.x, p.y])];
  const labels = [points.map((p) => p.label)];
  const input_points = processor.reshape_input_points(coords, inputs.original_sizes, inputs.reshaped_input_sizes);
  const input_labels = processor.image_processor.add_input_labels(labels, input_points);

  const outputs = await model({ ...embeddings, input_points, input_labels });
  const masks = await processor.post_process_masks(
    outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes,
  );
  const tensor = masks[0];
  const [, count, height, width] = tensor.dims;
  const scores = outputs.iou_scores.data;
  let best = 0;
  for (let i = 1; i < count; i++) if (scores[i] > scores[best]) best = i;

  const src = tensor.data;
  const offset = best * height * width;
  const mask = new Uint8Array(height * width);
  for (let i = 0; i < mask.length; i++) mask[i] = src[offset + i] ? 1 : 0;
  return { payload: { mask, width, height, score: scores[best] }, transfer: [mask.buffer] };
}

self.addEventListener('message', async (event) => {
  const { type, id, ...rest } = event.data;
  try {
    if (type === 'init') {
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
    post({ type: 'error', id, message: String(err?.message || err) });
  }
});
