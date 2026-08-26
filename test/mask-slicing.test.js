/**
 * The decoder slices the winning mask channel out of pred_masks before
 * post_process_masks, instead of interpolating all three candidates to
 * 1024^2 and the full image size and then discarding two of them.
 *
 * That is only legitimate if it changes nothing. This runs both orders through
 * the installed @huggingface/transformers and compares the surviving channel.
 */
import { describe, expect, it } from 'vitest';
import { SamImageProcessor, Tensor } from '@huggingface/transformers';

const CANDIDATES = 3;
const LOW_RES = 8;
const BEST = 1;

function processor() {
  return new SamImageProcessor({
    image_mean: [0, 0, 0],
    image_std: [1, 1, 1],
    do_normalize: false,
    do_resize: false,
    do_rescale: false,
    do_pad: false,
    pad_size: { height: 32, width: 32 },
    size: { longest_edge: 32 },
  });
}

/** Logits shaped like the SAM decoder's output: (batch, points, candidates, h, w). */
function predMasks(seed = 1) {
  let value = seed;
  const random = () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return (value / 2147483648) * 10 - 5;
  };
  const data = Float32Array.from({ length: CANDIDATES * LOW_RES * LOW_RES }, random);
  return new Tensor('float32', data, [1, 1, CANDIDATES, LOW_RES, LOW_RES]);
}

describe('selecting the mask candidate before postprocessing', () => {
  it('produces bit-identical logits to selecting after', async () => {
    const image = processor();
    const pred = predMasks();
    const originalSizes = [[20, 14]];
    const reshapedSizes = [[24, 18]];

    const allChannels = await image.post_process_masks(pred, originalSizes, reshapedSizes, { binarize: false });
    const selectedFirst = await image.post_process_masks(
      pred.slice(null, null, [BEST, BEST + 1]), originalSizes, reshapedSizes, { binarize: false },
    );

    const [, count, height, width] = allChannels[0].dims;
    expect(count).toBe(CANDIDATES);
    expect(selectedFirst[0].dims).toEqual([1, 1, height, width]);

    const offset = BEST * height * width;
    let maxDifference = 0;
    for (let index = 0; index < height * width; index++) {
      maxDifference = Math.max(
        maxDifference,
        Math.abs(allChannels[0].data[offset + index] - selectedFirst[0].data[index]),
      );
    }
    // Bilinear interpolation is per-channel, so this is exact, not merely close.
    expect(maxDifference).toBe(0);
  });

  it('keeps the thresholded pixel set identical for every candidate', async () => {
    const image = processor();
    const pred = predMasks(7);
    const originalSizes = [[16, 16]];
    const reshapedSizes = [[32, 32]];

    const allChannels = await image.post_process_masks(pred, originalSizes, reshapedSizes, { binarize: false });
    const [, , height, width] = allChannels[0].dims;

    for (let candidate = 0; candidate < CANDIDATES; candidate++) {
      const one = await image.post_process_masks(
        pred.slice(null, null, [candidate, candidate + 1]), originalSizes, reshapedSizes, { binarize: false },
      );
      const offset = candidate * height * width;
      const fromAll = [];
      const fromOne = [];
      for (let index = 0; index < height * width; index++) {
        fromAll.push(allChannels[0].data[offset + index] > 0 ? 1 : 0);
        fromOne.push(one[0].data[index] > 0 ? 1 : 0);
      }
      expect(fromOne).toEqual(fromAll);
    }
  });
});
