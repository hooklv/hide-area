# Accuracy

What this app can and cannot promise, and how to verify it.

## Error budget

Three independent sources, in descending order of impact.

**1. The hide is not flat.** Folds, curled edges and a raised centre all lower the measured area, and no software step compensates for this. On an unflattened hide this dominates everything else and can easily exceed 5%. It is a handling discipline problem, not a code problem.

**2. Reference sheet not in the plane of the hide.** The homography assumes the A4 sheet and the hide lie in one plane. A sheet resting on top of a thick hide sits a centimetre or two above the floor plane and biases the scale. Place the sheet beside the hide on the same surface, not on the hide.

**3. Mask edge and outline.** Mask edge error is a few pixels. On a whole cowhide at roughly 3 mm per pixel that is on the order of a centimetre along the boundary. Area error is approximately mean edge offset multiplied by perimeter, so shapes with a long perimeter relative to area (crocodile hides with legs and tail) pay more for the same edge error than a compact cowhide does.

Polygon simplification to 100 to 300 vertices contributes tenths of a percent and can be ignored against the above.

**Not an error source, despite appearances:** the 1% calibration tolerance shown after the corner taps. It reprojects the same four points used to solve the homography, so it verifies numerics only. It says nothing about whether the taps landed on the real corners.

## What has been verified

Synthetic projective camera tests in `test/pipeline.test.js` cover calibration through measured area at 0°, 15° and 30° tilt, including A4 and larger sheets, ellipse area, and the full raster mask to contour to millimetres path. Worst observed deviation: 0.45%.

That closes the mathematics. It does not close photo decode, real camera geometry, tap precision, model inference on a phone, or segmentation quality on real material. Those need the physical tests below.

## Physical test protocol

Record every run in the log at the bottom of this file. A test with no recorded number did not happen.

| # | Setup | Expected | What it proves |
|---|---|---|---|
| 1 | Two A4 sheets side by side on a contrasting floor. Calibrate on one, measure the other. | 0.0623 m² | Whole pipeline end to end |
| 2 | Four A4 sheets taped into a 420 x 594 mm rectangle. Calibrate on a separate loose A4. | 0.2494 m² | Accuracy when the object is much larger than the reference, which is the real hide case |
| 3 | Repeat test 2 with the camera at roughly 30° from vertical. | 0.2494 m² | Homography actually removes perspective |
| 4 | Cut an irregular wavy shape from the test 2 rectangle. Measure each removed piece with a ruler and subtract. | 0.2494 m² minus removed | Complex contour with concavities, closest proxy to a hide |
| 5 | Large soft object: spread sheet, yoga mat, leather jacket laid flat. | Unknown | Segmentation behaviour on real material and at 2 m plus scale, not accuracy |
| 6 | Real hide photographed by the trader, alongside his current measurement. | His figure | The only real validation |

Tests 1 to 4 give a stated error figure. Test 5 answers whether SAM takes a fabric edge cleanly and how long embedding takes on the phone. Test 6 is the only one that can confirm the app is commercially usable.

Run each test three times rather than once. A single reading cannot separate systematic bias from tap scatter.

## Shooting guidance for the trader

- Lay the hide flat and smooth the edges. This matters more than anything in the app.
- Contrasting background. A brown hide on a brown concrete floor is the worst case for segmentation.
- A4 sheet flat on the same surface beside the hide, fully visible, not folded, not overlapping the hide.
- Shoot from as close to directly overhead as practical. Tilt is corrected, but less tilt means fewer pixels wasted on foreshortening.
- Whole hide in frame. A cowhide at 4 to 5 m² needs roughly 2.5 to 3 m of height or a wide lens.
- Avoid a hard shadow under the raised edge of the hide, which the model can read as part of the object.

## How to report a number

Report to three significant figures at most, for example 4.12 m². The method does not support more. State the error range alongside it once tests 1 to 4 produce one, for example "4.12 m², typical error within 2 to 3% when the hide lies flat".

Industrial photocell machines reach 0.2 to 0.5%. Do not imply this app is in that class.

## Results log

| Date | Test | Device and backend | Expected | Measured | Deviation | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |
