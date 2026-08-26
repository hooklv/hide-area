/**
 * A deadline that fires on silence rather than on elapsed time.
 *
 * The SlimSAM download is about 40 MB. On mobile data in a warehouse, 300 kB/s
 * is a healthy connection and still needs roughly 133 seconds, so any fixed
 * ceiling either kills working downloads or waits far too long on dead ones.
 * What actually distinguishes the two is whether bytes are still arriving.
 */

export const stallMessage = (stage, idleMs) =>
  `SAM ${stage} stalled: no progress for ${Math.round(idleMs / 1000)} seconds`;

/**
 * @param {Promise} promise the work to guard
 * @param {string} stage name used in the error message
 * @param {number} idleMs how long a silence has to last to count as a stall
 * @returns {{result: Promise, bump: () => void}} call bump() on every sign of life
 */
export function withStallTimeout(promise, stage, idleMs) {
  let timeout = null;
  let onStall = null;
  let settled = false;

  const stalled = new Promise((_, reject) => { onStall = reject; });
  const bump = () => {
    if (settled) return;
    clearTimeout(timeout);
    timeout = setTimeout(() => onStall(new Error(stallMessage(stage, idleMs))), idleMs);
  };

  bump();
  const result = Promise.race([promise, stalled]).finally(() => {
    settled = true;
    clearTimeout(timeout);
  });
  return { result, bump };
}
