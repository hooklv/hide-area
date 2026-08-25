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

**Why:** manual tracing carries a systematic inward bias of roughly 3 to 5% on a full-screen trace, because the finger hides the edge. Colour thresholding fails whenever hide and floor are similar in tone, which is the common warehouse case. SAM produces a mask from one tap and the edit step keeps a human in the loop.

**Cost accepted:** a roughly 40 MB one-time model download and a multi-second embedding step per photo.

## 4. SlimSAM over full SAM, Transformers.js over raw onnxruntime-web

**Decision:** `Xenova/slimsam-77-uniform` through Transformers.js.

**Why:** SlimSAM compresses SAM from 637M to 5.5M parameters at comparable quality, which is what makes a phone download acceptable. Transformers.js provides the processor, the WebGPU to WASM fallback and postprocessing without hand-writing the ONNX plumbing.

## 5. Plain JS homography, no OpenCV.js

**Decision:** DLT for four point correspondences, written by hand in `src/lib/homography.js`.

**Why:** OpenCV.js is several megabytes to deliver the equivalent of about thirty lines of linear algebra, on top of an already heavy model download. The hand-written version is fully unit tested.

## 6. Crack-following contour tracing, not Moore neighbour tracing

**Decision:** trace the boundary along pixel edges rather than pixel centres.

**Why:** centre-based tracing systematically underestimates area by roughly 0.2 to 0.5%, because it encloses less than the mask's true pixel area. Crack following encloses exactly the mask area. This was a deliberate deviation from the original spec text.

## 7. Holes are not subtracted

**Decision:** trace the outer contour only. A hole in the hide is counted as hide.

**Why:** MVP scope. Adding hole handling means detecting interior contours, deciding which are real holes versus segmentation noise, and giving the user a way to confirm each one. Not worth it before the basic flow is validated.

**Revisit when:** the trader reports that hides with real holes are common enough to matter commercially.

## 8. fp32 weights on both WebGPU and WASM

**Context:** masks came back as brightness-correlated speckle noise at 79 to 83% reported confidence. Reduced precision on WebGPU was the leading hypothesis.

**Finding:** a forced backend comparison on the same image produced identical logits, candidate and pixel count on WASM and WebGPU once fp32 was pinned. Precision was not the cause. The actual bug was in mask interpretation, see entry 9.

**Decision:** keep fp32 pinned on both backends anyway.

**Why:** reduced precision is a known cause of collapsed SAM logits, the measured cost of fp32 on this model is acceptable, and the failure mode it would produce is silent. Any move to a quantized dtype must be re-validated on a real photo.

## 9. Explicit candidate selection then threshold, in that order

**Context:** the original code postprocessed first and treated any nonzero numeric value as foreground, which turned weak signed logits into noise shaped like the image brightness gradient.

**Decision:** call `post_process_masks` with `binarize: false`, select the candidate with the highest `iou_score`, then threshold that single channel at `logit > 0`.

**Why:** it makes channel selection, resolution and threshold behaviour explicit and inspectable. The previous path could not be reasoned about from the code.

## 10. Exact version pin on @huggingface/transformers

**Decision:** `3.7.6` with no caret.

**Why:** the worker calls `processor.reshape_input_points` and `image_processor.add_input_labels` directly instead of routing points through `processor(image, { input_points })`. This avoids re-running image preprocessing on every tap, but it depends on internals that are not part of the stable public API. A minor release could change prompt point scaling silently, and the symptom would be a plausible-looking mask in the wrong place.

## 11. Single downscaled image space, capped at 2000 px

**Decision:** after decode, the downscaled canvas is the only image representation. The original resolution is discarded.

**Why:** one coordinate space for taps, prompts, masks, contours and vertices removes an entire class of conversion bugs. 2000 px on the long side is roughly 3 mm per pixel on a full cowhide, which is below the mask edge error, so the cap costs nothing in accuracy while keeping memory and inference time manageable on a phone.
