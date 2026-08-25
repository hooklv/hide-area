# Measurement log

Record each physical accuracy run here. Complete all three repetitions before
summarising a test in `ACCURACY.md`.

| Date | Test | Repetition | Device and backend | Reference / object | Expected area (m2) | Measured area (m2) | Deviation (%) | Photo conditions and notes |
|---|---|---:|---|---|---:|---:|---:|---|
| | A4 on A4 | 1 | | | 0.06237 | | | |
| | A4 on A4 | 2 | | | 0.06237 | | | |
| | A4 on A4 | 3 | | | 0.06237 | | | |
| | 420 x 594 mm rectangle | 1 | | | 0.24948 | | | |
| | 420 x 594 mm rectangle | 2 | | | 0.24948 | | | |
| | 420 x 594 mm rectangle | 3 | | | 0.24948 | | | |
| | Irregular cut shape | 1 | | | | | | |
| | Irregular cut shape | 2 | | | | | | |
| | Irregular cut shape | 3 | | | | | | |
| | 420 x 594 mm rectangle at 30 degrees | 1 | | | 0.24948 | | | |
| | 420 x 594 mm rectangle at 30 degrees | 2 | | | 0.24948 | | | |
| | 420 x 594 mm rectangle at 30 degrees | 3 | | | 0.24948 | | | |


## Run 1 — 2026-08-25, home, wooden floor, artificial light

Device: Android, Chrome. Build: pre-Block-3.
Display limitation: dm2 shown as integers, so every value below carries
+/- 0.5 dm2 of display rounding. On test 1 that is +/- 8%, which makes
test 1 unusable at this precision.

Reference sheet: A4, 297 x 210 mm, placed beside the object on the same floor.
Glued jig measured at 59.3 x 42.0 cm = 24.91 dm2.
Cut pieces measured after cutting: A 20.1 x 20.1 /2 = 2.02, B 20.3 x 15.1 /2
= 1.53, C 20.1 x 10.0 = 2.01. Figure reference = 24.91 - 5.56 = 19.35 dm2.

| Test | Rep | Object | Tilt | Measured dm2 | Reference dm2 | mm/px | Vertices | A4 long edge, px (est.) |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | A4 | 0 | 6  | 6.23  | 0.747 | 102 | 398 |
| 1 | 2 | A4 | 0 | 7  | 6.23  | 0.793 | 92  | 375 |
| 1 | 3 | A4 | 0 | 7  | 6.23  | 0.810 | 100 | 367 |
| 2 | 1 | jig | 0 | 25 | 24.91 | 0.878 | 196 | 338 |
| 2 | 2 | jig | 0 | 25 | 24.91 | 0.837 | 204 | 355 |
| 2 | 3 | jig | 0 | 26 | 24.91 | 0.888 | 240 | 334 |
| 3 | 1 | figure | 0 | 20 | 19.35 | 0.858 | 133 | 346 |
| 3 | 2 | figure | 0 | 22 | 19.35 | 0.903 | 126 | 329 |
| 3 | 3 | figure | 0 | 20 | 19.35 | 0.861 | 113 | 345 |
| 4 | 1 | jig | ~30 | 26 | 24.91 | 0.880 | 196 | 337 |
| 4 | 2 | jig | ~30 | 28 | 24.91 | 0.899 | 212 | 330 |
| 4 | 3 | jig | ~30 | 27 | 24.91 | 0.910 | 194 | 326 |

Summary

| Test | Mean | Bias | Spread (max-min, % of reference) |
|---|---|---|---|
| 1 | 6.67  | +7.1% | 16.0% (rounding-dominated, not usable) |
| 2 | 25.33 | +1.7% | 4.0% |
| 3 | 20.67 | +6.8% | 10.3% |
| 4 | 27.00 | +8.4% | 8.0% |

Notes
- No manual outline corrections were made in any run.
- The notch on the test 3 figure was traced by the contour in all three runs.
- The A4 long edge stayed between roughly 326 and 398 px, so the 300 px
  framing warning did not fire in any run.
- Test 3 was shot from directly above, same as test 2. Its higher bias is
  not explained by the perimeter effect alone and remains open.