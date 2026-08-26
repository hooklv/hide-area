// Correctness only. No stylistic rules, no formatter: this config exists to
// catch undeclared identifiers before they reach a phone (see DECISIONS 14).

const browserGlobals = {
  console: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  window: 'readonly',
  localStorage: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  requestAnimationFrame: 'readonly',
  createImageBitmap: 'readonly',
  Worker: 'readonly',
  Image: 'readonly',
  ImageData: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  DOMMatrix: 'readonly',
  File: 'readonly',
  ResizeObserver: 'readonly',
};

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  globalThis: 'readonly',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Available in every one of these environments: main thread, worker, Node.
      globals: {
        globalThis: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: browserGlobals },
  },
  {
    // The SAM worker runs off the main thread: no window, no document.
    files: ['src/lib/samWorker.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        self: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...nodeGlobals, ...browserGlobals } },
  },
];
