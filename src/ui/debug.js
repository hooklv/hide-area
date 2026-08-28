import { BUILD_SHA, BUILD_TIME } from '../lib/buildInfo.js';

function stringify(value) {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export class DebugLog {
  constructor() {
    this.enabled = new URL(window.location.href).searchParams.get('debug') === '1';
    this.lines = [];
    if (!this.enabled) return;
    this._mount();
    // First line, before anything else: every log that reaches the maintainer
    // has to say which build produced it.
    this.log('main', 'build', { sha: BUILD_SHA, builtAt: BUILD_TIME });
    this.log('main', 'session', {
      userAgent: navigator.userAgent,
      gpu: 'gpu' in navigator,
      deviceMemory: navigator.deviceMemory ?? 'unavailable',
      hardwareConcurrency: navigator.hardwareConcurrency ?? 'unavailable',
    });
    this._captureConsole();
    window.addEventListener('error', (event) => this.log('main', 'window.onerror', event.message || event.error));
    window.addEventListener('unhandledrejection', (event) => this.log('main', 'unhandledrejection', event.reason));
  }

  _mount() {
    const panel = document.createElement('details');
    panel.className = 'debug-log';
    panel.innerHTML = `
      <summary>Debug log</summary>
      <button type="button" class="debug-copy">Copy all</button>
      <pre class="debug-lines" aria-live="polite"></pre>
    `;
    document.body.append(panel);
    this.linesEl = panel.querySelector('.debug-lines');
    panel.querySelector('.debug-copy').onclick = async () => {
      const text = this.lines.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        this.log('main', 'log copied');
      } catch (error) {
        this.log('main', 'copy failed', error);
      }
    };
  }

  _captureConsole() {
    for (const level of ['warn', 'error']) {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        this.log('main', `console.${level}`, args.map(stringify).join(' '));
        original(...args);
      };
    }
  }

  log(source, message, data) {
    if (!this.enabled) return;
    const detail = stringify(data);
    const line = `${new Date().toISOString()} [${source}] ${message}${detail ? ` ${detail}` : ''}`;
    this.lines.push(line);
    this.linesEl.textContent = this.lines.join('\n');
    this.linesEl.scrollTop = this.linesEl.scrollHeight;
  }
}