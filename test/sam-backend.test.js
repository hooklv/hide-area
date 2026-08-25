import { describe, expect, it } from 'vitest';
import { chooseBackendCandidates, initialBackendRequest, planGpuFallback, WEBGPU_UNSAFE_KEY } from '../src/lib/samBackend.js';
import { SamSession } from '../src/lib/sam.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

class FakeWorker {
  constructor(onPost) {
    this.onPost = onPost;
    this.listeners = new Map();
    this.messages = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    this.messages.push(message);
    this.onPost?.(message, this);
  }

  emit(message) {
    this.listeners.get('message')?.({ data: message });
  }

  terminate() {}
}

function sessionWith(worker, storage, search = '') {
  return new SamSession({ workerFactory: () => worker, storage, search });
}

describe('SAM backend fallback policy', () => {
  it('selects WASM after a latched GPU failure, even for a forced WebGPU diagnostic run', () => {
    expect(chooseBackendCandidates({ requestedBackend: 'webgpu', unsafeWebGpu: null })).toEqual(['webgpu', 'wasm']);
    expect(chooseBackendCandidates({ requestedBackend: 'webgpu', unsafeWebGpu: null, forceWasm: true })).toEqual(['wasm']);

    const fallback = planGpuFallback('decode');
    expect(fallback).toEqual({ backend: 'wasm', retryOperation: 'decode', discardGpuState: true });
  });

  it('persists a runtime GPU fault and passes it to the next session, which skips WebGPU', async () => {
    const storage = fakeStorage();
    const firstWorker = new FakeWorker((message, worker) => {
      if (message.type === 'init') worker.emit({ type: 'ready', id: message.id, backend: 'webgpu' });
    });
    const first = sessionWith(firstWorker, storage);
    await first.init();
    firstWorker.emit({
      type: 'status',
      stage: 'backend-fallback',
      persist: true,
      message: 'WebGPU failed: device lost',
      details: { availableStorageBufferBytes: 134217728 },
    });

    expect(JSON.parse(storage.getItem(WEBGPU_UNSAFE_KEY))).toMatchObject({
      reason: 'WebGPU failed: device lost',
      details: { availableStorageBufferBytes: 134217728 },
    });

    let attempted;
    const secondWorker = new FakeWorker((message, worker) => {
      if (message.type !== 'init') return;
      attempted = chooseBackendCandidates({ requestedBackend: null, unsafeWebGpu: message.unsafeWebGpu });
      worker.emit({ type: 'ready', id: message.id, backend: attempted[0] });
    });
    const second = sessionWith(secondWorker, storage);
    await expect(second.init()).resolves.toBe('wasm');
    expect(attempted).toEqual(['wasm']);
  });

  it('clears the marker for a forced WebGPU retry and still selects WASM after its fault', async () => {
    const storage = fakeStorage({ [WEBGPU_UNSAFE_KEY]: JSON.stringify({ reason: 'previous fault' }) });
    let initMessage;
    const worker = new FakeWorker((message, fakeWorker) => {
      if (message.type === 'init') {
        initMessage = message;
        fakeWorker.emit({ type: 'ready', id: message.id, backend: 'webgpu' });
      }
    });
    const session = sessionWith(worker, storage, '?backend=webgpu');

    await expect(session.init()).resolves.toBe('webgpu');
    expect(storage.getItem(WEBGPU_UNSAFE_KEY)).toBeNull();
    expect(initMessage.unsafeWebGpu).toBeNull();
    expect(chooseBackendCandidates({ requestedBackend: 'webgpu', unsafeWebGpu: null })).toEqual(['webgpu', 'wasm']);
    expect(chooseBackendCandidates({ requestedBackend: 'webgpu', unsafeWebGpu: null, forceWasm: true })).toEqual(['wasm']);
  });

  it('returns only the WASM result after an embedding or decode fallback', async () => {
    const storage = fakeStorage();
    const wasmDecodeMask = new Uint8Array([0, 1, 0, 1]);
    const worker = new FakeWorker((message, fakeWorker) => {
      if (message.type === 'init') {
        fakeWorker.emit({ type: 'ready', id: message.id, backend: 'webgpu' });
      } else if (message.type === 'embed') {
        fakeWorker.emit({ type: 'status', stage: 'backend-fallback', persist: true, message: 'WebGPU failed: embedding fault' });
        fakeWorker.emit({ type: 'done', id: message.id, payload: { backend: 'wasm', dtype: 'fp32', ms: 1 } });
      } else if (message.type === 'decode') {
        fakeWorker.emit({ type: 'status', stage: 'backend-fallback', persist: true, message: 'WebGPU failed: decode fault' });
        fakeWorker.emit({ type: 'done', id: message.id, payload: { backend: 'wasm', dtype: 'fp32', ms: 1, mask: wasmDecodeMask } });
      }
    });
    const session = sessionWith(worker, storage);
    await session.init();
    const embedded = await session.setImage({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    const decoded = await session.decode([{ x: 0, y: 0, label: 1 }]);

    expect(embedded.backend).toBe('wasm');
    expect(embedded.mask).toBeUndefined();
    expect(decoded.backend).toBe('wasm');
    expect(decoded.mask).toBe(wasmDecodeMask);
  });

  it('does not override a forced WebGPU retry with the stored marker', () => {
    const unsafe = { reason: 'previous fault' };
    expect(initialBackendRequest('?backend=webgpu', unsafe)).toEqual({ forcedWebGpu: true, unsafeWebGpu: null });
    expect(initialBackendRequest('', unsafe)).toEqual({ forcedWebGpu: false, unsafeWebGpu: unsafe });
  });
});