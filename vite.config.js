import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The app is used in a warehouse and reported back by message: "it showed 3.9".
// Stamping the commit in at build time is what makes that report attributable.
// A checkout without git metadata (a tarball, a fresh copy) must still build.
const UNKNOWN = 'unknown';

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim() || UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

const buildSha = gitSha();

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
  // Build identity, read through src/lib/buildInfo.js. Resolved here rather
  // than at runtime: the app has no backend to ask.
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_SHA_SHORT__: JSON.stringify(buildSha === UNKNOWN ? UNKNOWN : buildSha.slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  worker: { format: 'es' },
  server: { host: true },
  plugins: [selfHostOrtWasm()],
});
