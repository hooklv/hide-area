# Accuracy

What this app can and cannot promise, and how to verify it.

## Error budget

The physical measurements in `MEASUREMENT-LOG.md` replace earlier assumed
software figures. They used a reference A4 beside the object on the same floor,
with no manual outline corrections.

**1. The hide is not flat.** Folds, curled edges and a raised centre all lower the measured area, and no software step compensates for this. On an unflattened hide this dominates everything else and can easily exceed 5%. It is a handling discipline problem, not a code problem. The physical tests used flat white paper, so they do not measure this error.

**2. Top-down calibration and measurement.** On the 24.91 dm2 flat rectangle, shot straight down with the A4 beside it, the mean measured area was 25.33 dm2: about **+1.7% over-measurement**. Treat this as about +2% for this tested setup. The repeated A4-object test measured 6.67 dm2 against 6.23 dm2, a **+7.1% bias**. Its earlier whole-dm2 display run had the same 6.67 dm2 mean: rounding added apparent spread but did not create this bias.

**3. Camera tilt.** This is the largest measured software-side error. The same 24.91 dm2 rectangle at about 30 degrees had a mean measured area of 27.00 dm2, or **+8.4%**. That is roughly **+7 percentage points beyond the top-down bias**. The homography is fitted on the small A4 patch and extrapolated across a much larger object; tilt makes that extrapolation diverge. Shoot straight down, and keep the reference near the object and near the centre of the frame.

**4. Corner-tap precision.** Across runs of the same scene, the reported scale varied from 0.837 to 0.910 mm/px, roughly 5% in length and 10% in area, while the object's pixel footprint stayed nearly constant. This is measured evidence that calibration taps, not the mask, drive the run-to-run spread. The flat rectangle's top-down runs span 4.0% of the reference area; the irregular figure spans 10.3%. The figure's mean was +6.8%, which is higher than the rectangle and remains unexplained.

**5. Mask edge and outline.** The physical tests used flat white paper, not real hide. The A4's +7.1% bias and the larger rectangle's +1.7% bias are consistent with, but do not directly measure, an approximately 4 mm uniform outward paper-mask boundary. A fixed boundary offset has a larger percentage effect on a small A4 than on the larger rectangle. This is a working explanation for the paper results, not a real-hide correction: do not add erosion or apply a percentage adjustment to a hide. The tests say nothing about segmentation quality on leather, including mask-edge error, shadows, background similarity or manual outline correction.

Polygon simplification to 100 to 300 vertices was not isolated by these tests. The earlier synthetic result is not a physical accuracy measurement.

**Not an error source, despite appearances:** the 1% calibration tolerance shown after the corner taps. It reprojects the same four points used to solve the homography, so it verifies numerics only. It says nothing about whether the taps landed on the real corners.

## What has been verified

Synthetic projective camera tests in `test/pipeline.test.js` cover calibration through measured area at 0°, 15° and 30° tilt, including A4 and larger sheets, ellipse area, and the full raster mask to contour to millimetres path. Worst observed deviation: 0.45%. That synthetic result contradicts the real 30-degree result of +8.4%; it verifies idealised mathematics only and must not be used as a physical accuracy claim.

The physical runs close neither segmentation on real hide nor hide flatness. They do establish top-down bias, tilt sensitivity and calibration-tap spread for this paper setup.

## Physical test protocol

The first four tests below have been run three times and are recorded in `MEASUREMENT-LOG.md`.

| # | Setup | Expected | What it proves |
|---|---|---|---|
| 1 | Two A4 sheets side by side on a contrasting floor. Calibrate on one, measure the other. | 0.0623 m² | Whole pipeline end to end; repeated one-decimal readings establish a +7.1% paper-object bias. |
| 2 | Four A4 sheets taped into a 420 x 594 mm rectangle. Calibrate on a separate loose A4. | 0.2494 m² | Top-down baseline when the object is much larger than the reference. |
| 3 | Cut an irregular wavy shape from the test 2 rectangle. Measure each removed piece with a ruler and subtract. | 0.2494 m² minus removed | Complex contour with concavities; the higher measured bias remains open. |
| 4 | Repeat test 2 with the camera at roughly 30° from vertical. | 0.2494 m² | Effect of perspective on the full physical workflow. |
| 5 | Large soft object: spread sheet, yoga mat, leather jacket laid flat. | Unknown | Segmentation behaviour on real material and at 2 m plus scale, not accuracy. |
| 6 | Real hide photographed by the trader, alongside his current measurement. | His figure | The only real validation of commercial usability. |

## Shooting guidance for the trader

- Lay the hide flat and smooth the edges. This matters more than anything in the app.
- Contrasting background. A brown hide on a brown concrete floor is the worst case for segmentation.
- A4 sheet flat on the same surface beside the hide, fully visible, not folded, not overlapping the hide.
- Shoot straight down; keep the reference near the hide and near the frame centre, not in a corner.
- Whole hide in frame. A cowhide at 4 to 5 m² needs roughly 2.5 to 3 m of height or a wide lens.
- Avoid a hard shadow under the raised edge of the hide, which the model can read as part of the object.

## How to report a number

Report to three significant figures at most, for example 4.12 m². The method does not support more. For a flat object shot straight down in the tested paper setup, the measured bias was about +2%; at about 30 degrees, it rose to +8.4%. Do not present either figure as an accuracy claim for real hide.

Industrial photocell machines reach 0.2 to 0.5%. Do not imply this app is in that class.

## Measured performance

Observed on Android 10, Chrome 151, with 8 GB RAM and 8 cores:

| Measure | Result |
|---|---|
| Backend | WASM (WebGPU rejected by the capability check) |
| Model load | 1.1 s with model files already cached |
| Embedding | 7.1 s per photo |
| Mask decode | 0.35 s per tap |

First-time model download on a cold device is not included in these figures and is roughly 40 MB. Embedding runs once per photo; mask decode runs on every tap. Other device and network performance figures are not yet measured.

## Measured physical runs

The 12 raw runs, device conditions and reference dimensions are recorded in
`MEASUREMENT-LOG.md`.

| Test | Mean (dm2) | Reference (dm2) | Bias | Spread | Interpretation |
|---|---:|---:|---:|---:|---|
| A4 object, top-down | 6.67 | 6.23 | +7.1% | 4.8% | Small-object paper bias; consistent with an inferred outward boundary offset. |
| 420 x 594 mm rectangle, top-down | 25.33 | 24.91 | +1.7% | 4.0% | Best top-down baseline. |
| Irregular figure, top-down | 20.67 | 19.35 | +6.8% | 10.3% | Higher bias remains open. |
| 420 x 594 mm rectangle, about 30 degrees | 27.00 | 24.91 | +8.4% | 8.0% | Tilt adds about 7 percentage points. |
| | | | | | | |
