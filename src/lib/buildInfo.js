/**
 * Build identity, injected by Vite `define` (see vite.config.js).
 *
 * The app goes to one user who reports results by message. Without this, a
 * report of "it showed 3.9" cannot be tied to the code that showed it. The
 * values are resolved at build time because there is no backend to ask and no
 * git metadata in the browser.
 *
 * The `typeof` guards keep the module usable when nothing defined these: a
 * checkout with no git metadata still builds, and falls back to a placeholder
 * that reads as a placeholder rather than as a commit.
 */

const UNKNOWN = 'unknown';

export const BUILD_SHA = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : UNKNOWN;
export const BUILD_SHA_SHORT = typeof __BUILD_SHA_SHORT__ === 'string' ? __BUILD_SHA_SHORT__ : UNKNOWN;
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : UNKNOWN;
