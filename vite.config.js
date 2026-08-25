import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths keep the app portable across static hosts.
  base: './',
  // Pre-bundle the worker dependency to avoid a reload that discards the photo.
  optimizeDeps: { include: ['@huggingface/transformers'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
  server: { host: true },
});
