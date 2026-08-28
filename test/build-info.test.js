/**
 * The build stamp is only useful if the Vite `define` wiring actually resolves.
 * Vitest reads the same vite.config.js, so this exercises the real defines.
 */
import { describe, expect, it } from 'vitest';
import { BUILD_SHA, BUILD_SHA_SHORT, BUILD_TIME } from '../src/lib/buildInfo.js';

describe('build info', () => {
  it('resolves every field to a non-empty string', () => {
    for (const value of [BUILD_SHA, BUILD_SHA_SHORT, BUILD_TIME]) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('is either a real commit or a placeholder that reads as one', () => {
    if (BUILD_SHA === 'unknown') {
      // A checkout without git metadata must still build and run.
      expect(BUILD_SHA_SHORT).toBe('unknown');
      return;
    }
    expect(BUILD_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(BUILD_SHA_SHORT).toBe(BUILD_SHA.slice(0, 7));
  });

  it('stamps a parseable build timestamp', () => {
    if (BUILD_TIME === 'unknown') return;
    expect(Number.isNaN(Date.parse(BUILD_TIME))).toBe(false);
  });
});
