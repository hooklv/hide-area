# AGENTS.md

Instructions for AI agents working in this repository. Read this before changing anything.

## What this project is

A client-only web app that measures the surface area of an irregular leather hide from a single photo. The user photographs the hide with an A4 sheet lying flat in the same plane, taps the four corners of the sheet to establish scale, taps the hide to segment it, reviews the outline, and reads the area in m², dm² and sq ft.

Everything runs in the browser. The application has no backend, accounts, analytics, or application-level photo upload. Keep it that way. Model assets are resolved by Transformers.js; do not add application network calls beyond that model delivery path.

Product assumption: one leather trader on a mid-range Android phone, in a warehouse, over mobile data. Optimise for that, not for desktop.

## Stack

Vite, vanilla JS ES modules, no framework. Transformers.js `3.7.6` (exact pin) with `Xenova/slimsam-77-uniform`. `simplify-js` for polygon reduction. Vitest for tests. Deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` on push to `main`.

No React, no OpenCV.js, no TypeScript migration, no state management library. Adding any of these needs an explicit decision recorded in `docs/DECISIONS.md`.

## Architecture

Five step modules driven by a state machine in `src/main.js`. Shared mutable state comes from `initialState()`.

| Step | Module | Owns |
|---|---|---|
| 1 Photo | `src/steps/photo.js` | File input, EXIF-aware decode, downscale to max 2000 px longest side |
| 2 Calibrate | `src/steps/calibrate.js` | Four A4 corner taps, calls `calibrateA4()` |
| 3 Segment | `src/steps/segment.js` | Prompt points, SAM session, mask overlay |
| 4 Review | `src/steps/review.js` | Mask to editable polygon, vertex editing |
| 5 Result | `src/steps/result.js` | Polygon to mm, area, formatting |

Libraries in `src/lib/`: `area.js` (shoelace, units), `contour.js` (largest component, crack tracing, simplification), `homography.js` (A4 calibration, projective transforms), `sam.js` (worker RPC wrapper), `samWorker.js` (model load, embedding, decode).

UI in `src/ui/`: `canvasView.js` (two canvases, pan/zoom, coordinate conversion), `draw.js`, `loupe.js`.

Thread split: the worker (`samWorker.js`) does model load, preprocessing, embedding, decode, postprocess, candidate selection and thresholding. Everything else is main thread.

## Coordinate spaces

There are two application-level spaces and two display representations. Confusing them is the most likely way to break this app silently.

1. **Downscaled image space.** The single runtime image representation. Taps, A4 corners, SAM prompts, masks, contours and editable vertices all live here. Origin top left, y down. The original full-resolution image is not retained after decode.
2. **Rectified millimetres.** Floor plane, produced by `applyHomography(H, p)`.
3. CSS screen coordinates: `CanvasView.imageToScreen()` and `screenToImage()`.
4. Canvas backing pixels: handled inside `CanvasView.render()` via `setTransform(dpr, ...)`, DPR capped at 2.5.

`H` maps image pixels to millimetres. Not the reverse. `mat3Inverse(H)` exists and is tested but the runtime UI does not use a rectified view.

## Invariants

Do not break these without saying so explicitly and updating this file.

**Image**
- `loadImageFile()` caps the longest dimension at 2000 px. Every downstream consumer assumes that shared space.
- Orientation is applied at decode time via `imageOrientation: 'from-image'`. Fallback paths do not normalise orientation in application code.
- Replacing the photo increments `state.imageId`, clears calibration, segmentation, review and result state, and sets `state.segment.embeddedFor` to `-1` so the next photo is embedded again.

**Calibration**
- A4 taps may arrive in any order. `orderQuad()` must return a non self intersecting ring starting nearest the image origin. `a4TargetFor()` matches apparent long edges to 297 mm.
- The 1% calibration tolerance reprojects the same four points used to solve `H`. It is a numerical sanity check, not a measure of physical accuracy. Never present it to the user as an accuracy figure.

**Segmentation**
- The model loads as `fp32` on both WebGPU and WASM. Keep this dtype unless a real-photo validation demonstrates a replacement preserves mask quality.
- `post_process_masks` is called with `binarize: false`. The candidate is selected by maximum `iou_score`, then thresholded at `logit > 0` on that selected channel only. Never threshold before selection, never blend candidates, never treat a nonzero postprocessed value as foreground.
- One embedding per photo, cached in the worker. `state.imageId`, `state.segment.embeddedFor`, worker `embeddings` and worker `inputs` must stay aligned. Adding or removing prompt points must not trigger re-embedding.
- Decode requests stay serialised through `SamSession.queue`.
- `maskCache` in `segment.js` is keyed by `state.segment.version`. Any mask mutation must increment that version or the overlay goes stale.
- `review.js` regenerates the editable polygon when its `fromVersion` differs from `state.segment.version`. Vertex dragging edits only the review polygon; it does not mutate the SAM mask.

**Contour**
- `maskToPolygon()` keeps the largest 4-connected component, traces the outer boundary only, and discards holes by design.
- Tracing follows pixel-edge cracks, not pixel centres. The raw crack-edge ring encloses the foreground component's pixel area; do not replace it with centre-based tracing without validating the area behavior.
- Simplification targets 100 to 300 vertices. The final area measures the simplified editable polygon, not the raw mask.

**Config**
- `base: './'` keeps the build portable across static host subpaths.
- `build.target: 'esnext'` permits modern browser output.
- `server.host: true` allows development-server access from devices on the local network.
- `optimizeDeps.include: ['@huggingface/transformers']` pre-bundles the inference dependency to avoid development-time dependency churn while a photo is in progress.
- `worker.format: 'es'` keeps the SAM worker an ES module.
- `@huggingface/transformers` is pinned exactly to `3.7.6`. The worker calls `processor.reshape_input_points` and `image_processor.add_input_labels` directly, so do not add a caret or update the package without validating prompt scaling on a real photo.
- `samWorker.js` sets `env.allowLocalModels = false`; this app does not bundle a local model directory. Its `init` message carries supported inference flags to the worker.

## Commands

```
npm install
npm run dev              # local dev server
npm run dev -- --host    # reachable from a phone on the same Wi-Fi
npm test                 # vitest run, currently 71 tests
npm run test:watch       # Vitest watch mode
npm run build            # production bundle to dist, under 1 s
npm run check:bundle     # build and reject unresolved bare imports in emitted JavaScript
npm run lint             # eslint, no-undef and no-unused-vars only
npm run preview          # serve the built bundle
```

`npm run lint && npm test && npm run check:bundle` is the repository verification gate. Run all three before reporting a task complete, and report the actual output rather than an assumption.

## Debug flags

`?backend=wasm` and `?backend=webgpu` force the inference backend for like-for-like comparison on the same photo. Invalid values throw. Without the parameter the worker tries WebGPU when `navigator.gpu` is available, then falls back to WASM.

`?debug=1` enables the on-screen, collapsible diagnostic log for phone-only failures. It records device capabilities, image dimensions, worker phases, model request outcomes, progress, console warnings/errors, and unhandled errors; its Copy all button produces a plain-text report. It must remain absent without the flag.

Segmentation diagnostics (logit min/max/mean, selected candidate index, IoU score, thresholded pixel count, prompt coordinates before and after transform) are written to the console under `[SAM decode diagnostics]` and drawn as a canvas overlay.

## Real-photo fixture

`test/fixtures/a4-on-floor.jpeg` is the canonical real-phone segmentation fixture: it has EXIF `upper-right` orientation, canonical A4 metadata in orientation-normalized decoded space, and must replace generated rectangles in browser reproductions. `load.js` asserts its 3000 x 4000 portrait decode and returns coordinates scaled to the actual runtime image; Vitest verifies geometry and the stored browser-generated mask, while browser automation remains the authoritative real SAM inference check.

All browser verification of segmentation must run against `npm run preview` served from a subpath, never `npm run dev`.

## What not to do

- Do not add a backend, a database, telemetry, or any network call beyond the model download from the Hugging Face CDN.
- Do not change the five step flow or renumber the steps without being asked.
- Do not rewrite working modules for style. This project has one maintainer and no appetite for churn.
- Do not add dependencies to solve something that is thirty lines of plain JS. Homography and contour tracing are deliberately hand written.
- Do not tune the model, retrain, swap to a larger SAM variant, or add a second model without measuring the download size and phone decode time first.
- Do not present a computed number to the user with more precision than the method supports. See `docs/ACCURACY.md`.
- Do not claim a segmentation fix works based only on a synthetic test image. Validate it on a representative real photo as well.

## When you are unsure

State the uncertainty. Do not invent an explanation for code you did not read, do not assert a library API exists without checking `node_modules`, and do not report a test as passing without running it. Listing what you found before changing anything is always the right first move on a diagnostic task.
