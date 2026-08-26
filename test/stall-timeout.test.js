import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withStallTimeout } from '../src/lib/stallTimeout.js';

const IDLE_MS = 60000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withStallTimeout', () => {
  it('rejects when nothing happens for the whole window', async () => {
    const { result } = withStallTimeout(new Promise(() => {}), 'model load', IDLE_MS);
    const settled = expect(result).rejects.toThrow('SAM model load stalled: no progress for 60 seconds');

    await vi.advanceTimersByTimeAsync(IDLE_MS);

    await settled;
  });

  it('survives a download far longer than the window while progress keeps arriving', async () => {
    // 40 MB at 300 kB/s is about 133 s: healthy on mobile data, and more than
    // twice the stall window, so this is the case a fixed ceiling used to kill.
    let done = null;
    const { result, bump } = withStallTimeout(new Promise((resolve) => { done = resolve; }), 'model load', IDLE_MS);
    let rejected = false;
    result.catch(() => { rejected = true; });

    for (let elapsed = 0; elapsed < 133000; elapsed += 1000) {
      await vi.advanceTimersByTimeAsync(1000);
      bump();
    }
    expect(rejected).toBe(false);

    done('wasm');
    await expect(result).resolves.toBe('wasm');
  });

  it('rejects a window after the last sign of life, not after the first', async () => {
    const { result, bump } = withStallTimeout(new Promise(() => {}), 'model load', IDLE_MS);
    const settled = expect(result).rejects.toThrow('stalled');

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000);
    bump();
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000);
    // The original deadline has passed; the bumped one has not.
    let rejected = false;
    result.catch(() => { rejected = true; });
    await Promise.resolve();
    expect(rejected).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('leaves no timer armed once the work settles', async () => {
    const { result, bump } = withStallTimeout(Promise.resolve('wasm'), 'model load', IDLE_MS);
    await expect(result).resolves.toBe('wasm');

    bump(); // a late progress event must not arm a timer on finished work
    expect(vi.getTimerCount()).toBe(0);
  });
});
