export const WEBGPU_UNSAFE_KEY = 'hide-area:webgpu-unsafe:v1';

export function chooseBackendCandidates({ requestedBackend, unsafeWebGpu, forceWasm = false }) {
  if (forceWasm) return ['wasm'];
  if (requestedBackend === 'webgpu') return ['webgpu'];
  if (requestedBackend) return [requestedBackend];
  return unsafeWebGpu ? ['wasm'] : ['webgpu', 'wasm'];
}

export function initialBackendRequest(search, unsafeWebGpu) {
  const forcedWebGpu = new URLSearchParams(search).get('backend') === 'webgpu';
  return {
    forcedWebGpu,
    unsafeWebGpu: forcedWebGpu ? null : unsafeWebGpu,
  };
}