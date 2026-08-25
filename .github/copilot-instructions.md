# Copilot instructions

Read `AGENTS.md` in the repository root before making any change. It is the single source of truth for this project's architecture, coordinate spaces, invariants, commands and constraints. Everything below is a summary of it, not a replacement.

Quick rules:

- Client-only Vite app, vanilla JS, no framework, no backend. Keep it that way.
- All taps, masks, contours and vertices live in one downscaled image space capped at 2000 px longest side.
- The SAM model must stay `fp32`. Candidate is chosen by max IoU score, then thresholded at `logit > 0` on that channel.
- `@huggingface/transformers` is pinned exactly. Do not add a caret.
- Verification gate: `npm test && npm run build`. Run both and report real output.
- Do not claim a segmentation fix works based on a synthetic image. Reproduce on a real photo.
