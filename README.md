# Hide area

## What it does

Measures the surface area of an irregular leather hide from a single photo. An
A4 sheet provides scale reference. Processing is fully client-side; there is no
backend.

## How it works

Tap the four A4 corners to calculate a homography. SlimSAM segmentation runs in
the browser through Transformers.js. The app extracts a contour from the mask,
uses the shoelace formula for area, and reports m², dm², and sq ft.

## Setup and run

```bash
npm install
npm run dev
```

To test from a phone on the same Wi-Fi network:

```bash
npm run dev -- --host
```

## Build and deploy

Create a production bundle with:

```bash
npm run build
```

The bundle is written to `dist/`. The included GitHub Actions workflow deploys
it to GitHub Pages on each push to `main`.

## Testing

Run the unit suite with:

```bash
npm test
```

Manual accuracy checklist:

1. Measure one A4 sheet; expect 0.0623 m².
2. Measure four A4 sheets taped into a 420 x 594 mm rectangle; expect 0.2494 m².
3. Photograph that rectangle from roughly 30 degrees off-vertical and confirm the same result.
4. Cut an irregular shape from that rectangle, measure it, and compare it with the rectangle less the separately measured removed pieces.

## Known limitations

- Holes are not subtracted.
- A4 detection is manual.
- Wrinkles and folds are not compensated.
- The hide must lie flat.
- The first model download is roughly 40 MB.
