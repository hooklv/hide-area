# Roadmap

The only planning document this project has. It replaces the ad hoc lists that
were being carried in chat. Everything not written here is not planned.

## Goal

A leather trader measures a real batch of hides with this app and the resulting
number goes onto an invoice. That is the whole point. Every item below is
subordinate to it: a change earns its place only by moving a real measurement
closer to being trusted on a real document, and anything that does not is
either parked or not done at all.

## Done when

He has measured 15 to 20 hides in one session, exported the list, and told us
whether the accuracy is good enough.

## Track A — to the user

Highest priority. This track is what reaches the goal.

- Build stamp, so a reported number can be tied to the code that produced it.
- Session list, with copy and CSV export.
- Hand the app to the friend for a real batch.
- Decide on persistence from his feedback.

## Track B — accuracy

Runs in parallel with track A and touches no code. These are physical
measurements, recorded in `docs/MEASUREMENT-LOG.md`.

- Repeat the A4 self test three to four times, tapping the calibration corners
  in a different order each time.
- Then the laminated or cardboard backed sheet experiment.

**Open conflict.** A self test on 2026-08-28 measured an A4 sheet at roughly
-1%, while `docs/ACCURACY.md` records a +7.1% bias for an object of that size.
Both cannot be right. That conflict is the reason for the repeats: until it is
resolved, the recorded bias figure is not something to build on.

## Track C — hygiene

Only while track A is waiting on the friend. Nothing here is a reason to delay
track A.

- `jsconfig.json` with `checkJs`.
- A browser smoke test, which `AGENTS.md` already calls the authoritative
  check.

## Parked

Not rejected, not scheduled. One line each on why it is not being done now.

- **Offline service worker.** The model already persists itself in Cache
  Storage; caching the app shell as well only starts paying off once the app is
  in repeated daily use, which is past the goal above.
- **Polygon self intersection check.** Vertex dragging in step 4 can in
  principle produce a ring whose shoelace area is wrong, but no such result has
  been reported, so a guard written now would be guessing at both the trigger
  and the fix.
- **Automatic A4 corner detection.** `DECISIONS.md` 2 already calls this a
  plausible v2 once the flow is proven, and the flow is not proven yet.
