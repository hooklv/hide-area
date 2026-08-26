/**
 * The only test that loads the real SAM worker module.
 *
 * Every other SAM test drives a FakeWorker that emits canned `done` messages,
 * so nothing exercised the worker's own success paths. A bare ReferenceError on
 * the embed completion path shipped that way (docs/DECISIONS.md, entry 14).
 *
 * Transformers.js is mocked: this asserts the worker's protocol and payloads,
 * not model quality. Real inference stays a browser check.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_STORAGE_BUFFER_BYTES = 805306368;
const WIDTH = 8;
const HEIGHT = 8;
const CANDIDATE_COUNT = 3;
const BEST_CANDIDATE = 1;
const BLOCK_PIXELS = 16;
// What the device actually reported, minus the [object GPUValidationError] wrapper.
const GPU_ERROR_TEXT = 'Binding size (805306368) of [Buffer] is larger than the maximum storage buffer binding size (134217728)';

/** Three candidate logit planes; only the best one carries a solid 4x4 block. */
function maskTensor() {
  const data = new Float32Array(CANDIDATE_COUNT * HEIGHT * WIDTH).fill(-4);
  const offset = BEST_CANDIDATE * HEIGHT * WIDTH;
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) data[offset + y * WIDTH + x] = 5;
  return { dims: [1, CANDIDATE_COUNT, HEIGHT, WIDTH], data };
}

function fakeTransformers() {
  const gpuDevice = {
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    lost: new Promise(() => {}),
    queue: { onSubmittedWorkDone: async () => {} },
  };
  const model = Object.assign(
    async () => ({ pred_masks: 'pred_masks', iou_scores: { data: [0.1, 0.9, 0.2] } }),
    { get_image_embeddings: async () => ({ image_embeddings: 'image_embeddings' }) },
  );
  const processor = Object.assign(
    async (image) => ({
      original_sizes: [[image.height, image.width]],
      reshaped_input_sizes: [[image.height, image.width]],
    }),
    {
      reshape_input_points: (points) => ({ data: points.flat(2) }),
      image_processor: { add_input_labels: (labels) => ({ data: labels.flat() }) },
      post_process_masks: async () => [maskTensor()],
    },
  );
  const loads = [];
  return {
    gpuDevice,
    loads,
    module: {
      SamModel: { from_pretrained: async (id, options) => { loads.push(options); return model; } },
      AutoProcessor: { from_pretrained: async () => processor },
      RawImage: class {
        constructor(data, width, height) { Object.assign(this, { data, width, height }); }
        rgb() { return this; }
      },
      env: {
        allowLocalModels: true,
        useBrowserCache: false,
        backends: { onnx: { wasm: {}, webgpu: { device: Promise.resolve(gpuDevice) } } },
      },
    },
  };
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalConsole = { warn: console.warn, error: console.error };

/** Boot a fresh worker module with a stubbed worker global scope. */
async function startWorker({ transformers, gpu = null }) {
  const posted = [];
  let onMessage = null;
  globalThis.self = {
    postMessage: (message) => posted.push(message),
    addEventListener: (type, listener) => { if (type === 'message') onMessage = listener; },
    fetch: async () => { throw new Error('the worker test never reaches the network'); },
  };
  Object.defineProperty(globalThis, 'navigator', { value: gpu ? { gpu } : {}, configurable: true });
  vi.resetModules();
  vi.doMock('@huggingface/transformers', () => transformers.module);
  await import('../src/lib/samWorker.js');
  return { posted, send: (message) => onMessage({ data: message }) };
}

afterEach(() => {
  vi.doUnmock('@huggingface/transformers');
  delete globalThis.self;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

const anImage = () => ({ data: new Uint8ClampedArray(WIDTH * HEIGHT * 4).buffer, width: WIDTH, height: HEIGHT });
const doneFor = (posted, id) => posted.find((message) => message.type === 'done' && message.id === id);
const errorsIn = (posted) => posted.filter((message) => message.type === 'error');

describe('SAM worker embed and decode payloads', () => {
  it('completes an embed in normal mode and reports no fallback reason', async () => {
    const transformers = fakeTransformers();
    const { posted, send } = await startWorker({ transformers });

    await send({ type: 'init', id: 1, search: '' });
    await send({ type: 'embed', id: 2, image: anImage() });

    expect(errorsIn(posted)).toEqual([]);
    expect(doneFor(posted, 2).payload).toMatchObject({ backend: 'wasm', dtype: 'fp32', fallbackReason: null });
  });

  it('completes an embed in the forced-WASM replacement worker and reports the fault that caused it', async () => {
    const transformers = fakeTransformers();
    const { posted, send } = await startWorker({ transformers });

    // Exactly what SamSession._recoverFromGpuFault sends to the replacement worker.
    await send({ type: 'init', id: 1, search: '?backend=webgpu', forceWasm: true, unsafeWebGpu: { reason: GPU_ERROR_TEXT } });
    await send({ type: 'embed', id: 2, image: anImage() });

    expect(errorsIn(posted)).toEqual([]);
    expect(doneFor(posted, 2).payload).toMatchObject({ backend: 'wasm', dtype: 'fp32', fallbackReason: GPU_ERROR_TEXT });
    expect(transformers.loads.map((options) => options.device)).toEqual(['wasm']);
  });

  it('decodes a mask after a fallback and carries the same backend detail', async () => {
    const transformers = fakeTransformers();
    const { posted, send } = await startWorker({ transformers });

    await send({ type: 'init', id: 1, search: '', forceWasm: true, unsafeWebGpu: { reason: GPU_ERROR_TEXT } });
    await send({ type: 'embed', id: 2, image: anImage() });
    await send({ type: 'decode', id: 3, points: [{ x: 4, y: 4, label: 1 }] });

    expect(errorsIn(posted)).toEqual([]);
    const { payload } = doneFor(posted, 3);
    expect(payload).toMatchObject({ backend: 'wasm', dtype: 'fp32', fallbackReason: GPU_ERROR_TEXT, width: WIDTH, height: HEIGHT });
    expect(payload.score).toBeCloseTo(0.9);
    expect(payload.debug.selectedMaskIndex).toBe(BEST_CANDIDATE);
    expect(payload.mask.reduce((sum, value) => sum + value, 0)).toBe(BLOCK_PIXELS);
  });
});

describe('SAM worker GPU fault reporting', () => {
  it('reports the GPU error message rather than the stringified error object', async () => {
    const transformers = fakeTransformers();
    const { posted, send } = await startWorker({
      transformers,
      gpu: { requestAdapter: async () => ({ limits: { maxStorageBufferBindingSize: REQUIRED_STORAGE_BUFFER_BYTES } }) },
    });

    await send({ type: 'init', id: 1, search: '' });

    // A GPUValidationError is not an Error subclass; String() on it is useless.
    const validationError = { message: GPU_ERROR_TEXT };
    Object.defineProperty(validationError, Symbol.toStringTag, { value: 'GPUValidationError' });
    expect(String(validationError)).toBe('[object GPUValidationError]');
    transformers.gpuDevice.listeners.get('uncapturederror')({ error: validationError });

    await send({ type: 'embed', id: 2, image: anImage() });

    const fault = posted.find((message) => message.type === 'gpu-fault');
    expect(fault.message).toBe(GPU_ERROR_TEXT);
    const fallback = posted.find((message) => message.type === 'status' && message.stage === 'backend-fallback');
    expect(fallback.details.reason).toBe(GPU_ERROR_TEXT);
    expect(fallback.persist).toBe(true);
  });

  it('says the capability check is being overridden when ?backend=webgpu forces it', async () => {
    const transformers = fakeTransformers();
    const { posted, send } = await startWorker({
      transformers,
      // The Android device from DECISIONS 12: 128 MB against the 768 MB SlimSAM wants.
      gpu: { requestAdapter: async () => ({ limits: { maxStorageBufferBindingSize: 134217728 } }) },
    });

    await send({ type: 'init', id: 1, search: '?backend=webgpu' });

    const warning = posted.find((message) => message.type === 'status' && message.stage === 'warning');
    expect(warning.message).toContain('?backend=webgpu is loading it anyway for diagnosis');
    expect(warning.message).not.toMatch(/^WebGPU unavailable/);
    // The override still loads WebGPU: the wording changed, the behaviour did not.
    expect(transformers.loads.map((options) => options.device)).toEqual(['webgpu']);
    expect(posted.find((message) => message.type === 'ready').backend).toBe('webgpu');
  });
});
