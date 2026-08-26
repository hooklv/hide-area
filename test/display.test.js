import { describe, expect, it } from 'vitest';
import { formatConfidence } from '../src/ui/draw.js';

describe('formatConfidence', () => {
  it('never displays a confidence above 100%', () => {
    // SAM's iou_score is an unbounded regression output; the device produced 1.01.
    expect(formatConfidence(1.01)).toBe('100%');
    expect(formatConfidence(1.01, 1)).toBe('100.0%');
    expect(formatConfidence(4)).toBe('100%');
  });

  it('never displays a negative confidence', () => {
    expect(formatConfidence(-0.2)).toBe('0%');
  });

  it('formats an in-range score at the requested precision', () => {
    expect(formatConfidence(0.8734)).toBe('87%');
    expect(formatConfidence(0.8734, 1)).toBe('87.3%');
  });
});
