# Decisions

Why this project is built the way it is. Append new entries at the bottom. Do not silently reverse an entry: add a new one that supersedes it.

## 1. Build the app at all, rather than using ImageMeter

**Considered:** ImageMeter (calibrate from a reference object, trace an area manually, handles perspective, one-off paid licence), AR measurement apps on ARCore, industrial tannery hardware.

**Decision:** build a purpose-made web app.

**Why:** the generic apps solve measurement but leave the operator tracing an irregular contour by finger for every hide. The only thing worth building is the part they do not do, which is single-tap segmentation. If tracing turns out to be tolerable in practice, this project is not justified and ImageMeter is the honest answer.

**Status:** provisional. Not yet validated against the trader's actual throughput.

## 2. A4 sheet as scale reference, not an ArUco marker

**Considered:** printed ArUco marker with automatic detection, LiDAR on iPhone Pro, known-size object.

**Decision:** plain A4, four corners tapped manually.

**Why:** the operator always has A4. A marker means printing, carrying and not losing it, plus an aruco module that the standard OpenCV.js build does not ship. LiDAR is overkill for a flat object and limits the app to one hardware family. Four taps cost a few seconds once per photo.

**Open:** automatic A4 detection is a plausible v2 once the flow is proven, and would remove the largest remaining source of user error after hide flatness.

## 3. SAM segmentation as the primary tool, manual tracing as correction only

**Considered:** manual finger tracing with zoom and a loupe, colour threshold segmentation, magnetic lasso via Canny edge detection, SAM.

**Decision:** single tap to SAM, editable vertices afterwards.

**Why:** manual tracing is expected to be error-prone because the finger obscures the edge, and colour thresholding is unsuitable when hide and floor have similar tones. SAM produces a mask from one tap and the edit step keeps a human in the loop. The size of any tracing bias must be established with field measurements rather than inferred from this source tree.

**Cost accepted:** model delivery and an image-embedding step per photo. Download size and timing are operational measurements and must be rechecked on representative phones and networks.

## 4. SlimSAM over full SAM, Transformers.js over raw onnxruntime-web

**Decision:** `Xenova/slimsam-77-uniform` through Transformers.js.

**Why:** SlimSAM is selected to keep the model practical for phone delivery, while Transformers.js provides the processor, WebGPU/WASM backend handling, and postprocessing without hand-writing ONNX plumbing. Parameter counts, download size, and quality comparisons are external model measurements and should be recorded with their source when used for a release decision.

## 5. Plain JS homography, no OpenCV.js

**Decision:** DLT for four point correspondences, written by hand in `src/lib/homography.js`.

**Why:** OpenCV.js would add a substantial browser dependency for functionality already implemented in the tested homography/calibration module. This module deliberately includes normalization, matrix operations, point ordering, calibration validation, and local-scale calculation; it is not merely a thirty-line substitute.

## 6. Crack-following contour tracing, not Moore neighbour tracing

**Decision:** trace the boundary along pixel edges rather than pixel centres.

**Why:** the raw crack-following ring encloses the foreground component's pixel area, which matches the binary-mask representation. Any numerical comparison with centre-based tracing, including the size of its bias, requires a separately recorded measurement. This was a deliberate deviation from the original spec text.

## 7. Holes are not subtracted

**Decision:** trace the outer contour only. A hole in the hide is counted as hide.

**Why:** MVP scope. Adding hole handling means detecting interior contours, deciding which are real holes versus segmentation noise, and giving the user a way to confirm each one. Not worth it before the basic flow is validated.

**Revisit when:** the trader reports that hides with real holes are common enough to matter commercially.

## 8. fp32 weights on both WebGPU and WASM

**Context:** a prior debugging investigation reported brightness-correlated speckle noise and considered reduced WebGPU precision as a possible cause. The source tree alone cannot reproduce or establish that incident.

**Finding:** the prior investigation concluded that a forced backend comparison produced matching logits, candidate selection, and pixel count after fp32 was pinned, and that mask interpretation was the relevant defect. Preserve the conclusion as history, but repeat that comparison on a representative real photo before relying on it for a future dtype change.

**Decision:** keep fp32 pinned on both backends anyway.

**Why:** fp32 is the documented, implemented baseline and avoids introducing a silent mask-quality change without evidence. Any move to a quantized dtype must be measured and validated on a real photo.

## 9. Explicit candidate selection then threshold, in that order

**Context:** a prior implementation reportedly postprocessed before selecting a candidate and treated nonzero values as foreground. This decision records the replacement contract; the behavior of the previous implementation is historical context.

**Decision:** call `post_process_masks` with `binarize: false`, select the candidate with the highest `iou_score`, then threshold that single channel at `logit > 0`.

**Why:** it makes channel selection, resolution and threshold behaviour explicit and inspectable. The previous path could not be reasoned about from the code.

## 10. Exact version pin on @huggingface/transformers

**Decision:** `3.7.6` with no caret.

**Why:** the worker calls `processor.reshape_input_points` and `image_processor.add_input_labels` directly instead of routing points through `processor(image, { input_points })`, avoiding image preprocessing on every tap. Treat these calls as version-sensitive integration points: upgrade only after validating prompt coordinates and masks on a real photo.

## 11. Single downscaled image space, capped at 2000 px

**Decision:** after decode, the downscaled canvas is the only image representation. The original resolution is discarded.

**Why:** one coordinate space for taps, prompts, masks, contours and vertices removes an entire class of conversion bugs. The 2000 px cap bounds memory and inference input size; its physical pixel scale and any effect on measurement accuracy must be confirmed from representative hides and photos.

## 12. WebGPU is gated on adapter storage-buffer limits, not enabled by default on mobile

**Context:** on a real Android device (Chrome 151, Android 10, 8 GB RAM), the app selected WebGPU, ran the vision encoder, and reported success, but the resulting masks were brightness-correlated noise with a high IoU score. The device log showed repeated WebGPU validation errors during embedding:

```
Binding size (805306368) of [Buffer] is larger than the maximum storage buffer binding size (134217728)
While validating [BindGroupDescriptor "MatMul"] / "Add" / "Softmax"
```

The device caps `maxStorageBufferBindingSize` at 128 MB; SlimSAM's vision encoder requests 768 MB. The compute passes failed, embedding still completed, and the corrupted embedding propagated silently through mask selection, contour extraction and area calculation. Desktop has a higher cap, which is why it never reproduced there and why the synthetic browser tests passed throughout.

**Decision:** check `adapter.limits.maxStorageBufferBindingSize` before selecting WebGPU and fall back to WASM when it is insufficient, request the adapter's highest supported limit when creating the device, treat any WebGPU `uncapturederror` or device loss during embedding or decode as a failed operation, and validate the produced mask for plausibility before showing it.

**Why it matters beyond this one device:** the real defect was not the GPU limit, it was that the pipeline reported success on corrupted data. In a measuring tool, a plausible-looking wrong number is worse than a visible failure. Any future change that makes an inference failure non-fatal reintroduces this class of bug.

## 13. Validate mask quality after segmentation

**Decision:** reject a segmentation mask when coverage is below 0.1%, above 90%, or when it has more than 32 components and the largest component contains less than 80% of the foreground.

**Why:** this prevents obviously implausible masks from being converted into an outline and measurement after an inference failure. These thresholds are provisional and tuned against one real photo; further real-photo validation is not yet measured.

## 14. Lint for undeclared identifiers, and test the worker module itself

**Context:** `samWorker.js` returned `{ backend, dtype, fallbackReason }` at the end of
`embed()`, but `fallbackReason` was never declared in that module. ES modules are strict
mode, so reading it threw a `ReferenceError` the moment an embedding *succeeded* — on every
backend, in normal mode as well as forced mode. It shipped to production and broke every
measurement on the device: the phone log ended with
`worker request failed {"type":"embed","error":"fallbackReason is not defined"}` and the UI
showed `Model failed: fallbackReason is not defined`. No mask could be produced at all.

Nothing in the repository could have caught it. No test loaded `samWorker.js`: every SAM
test drove a `FakeWorker` emitting canned `done` messages, so the worker's own success paths
had zero coverage, including the recovery test's replacement-worker embed. An undeclared
identifier is valid syntax, so the Vite build emitted it without complaint, and
`check:bundle` only scans for unresolved bare imports. There was no linter.

**Decision:** two guards.

1. ESLint with exactly two rules, `no-undef` and `no-unused-vars`, wired into the deploy
   workflow next to `npm test`. No `eslint:recommended`, no stylistic rules, no formatter,
   no Prettier. This config exists to catch undeclared identifiers, not to have opinions
   about code.
2. `test/sam-worker.test.js`, which loads the real worker module with a stubbed worker
   global scope and a mocked Transformers.js, and drives `init` -> `embed` -> `decode`
   asserting the posted payloads — including a successful embed in the forced-WASM
   replacement worker, which is the exact path the device was on when it failed.

**Why:** the defect class here is not "a bug slipped through", it is "an entire file was
unreachable by the test suite while the build stayed green". A mocked worker test cannot
validate inference quality, and is not meant to; real segmentation validation stays a
browser check on a real photo. What it does validate is the worker's protocol and payload
contract, which is what broke.

**Cost accepted:** one devDependency and a CI step. Both guards were verified against the
unfixed code before the fix landed: lint reported `'fallbackReason' is not defined` at
`samWorker.js:255`, and all four new tests failed, three reproducing
`fallbackReason is not defined` and one reproducing `[object GPUValidationError]`.
