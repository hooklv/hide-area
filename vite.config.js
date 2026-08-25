import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ORT_ASSETS = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
];

function selfHostOrtWasm() {
  return {
    name: 'self-host-ort-wasm',
    async generateBundle() {
      await Promise.all(ORT_ASSETS.map(async (name) => {
        this.emitFile({
          type: 'asset',
          fileName: `assets/ort/${name}`,
          source: await readFile(resolve('node_modules/onnxruntime-web/dist', name)),
        });
      }));
    },
  };
}

export default defineConfig({
  // Relative asset paths keep the app portable across static hosts.
  base: './',
  // Pre-bundle the worker dependency to avoid a reload that discards the photo.
  optimizeDeps: { include: ['@huggingface/transformers'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
  server: { host: true },
  plugins: [selfHostOrtWasm()],
});
