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

Highest priority. This track is what reaches the goal. In order:

### 1. Build stamp

Done. A reported number can be tied to the code that produced it.

### 2. Contour vertex count

The outline produces 150 vertices on a plain A4 rectangle, and on the device
they cluster into dense groups along the straight edges while long stretches
elsewhere carry none. Dragging a single vertex to correct an edge is
impractical with a finger, and correcting the edge is exactly what the user
will need to do on a real hide.

Scope: roughly even vertex spacing along the contour, and a total count a
person can actually work with on a phone.

Do not tune the simplification tolerance against the A4 test photo alone. A
hide outline has curvature a rectangle does not, so a tolerance that looks
right on a rectangle says little about the shape this is for. Final tuning
waits for a real hide photo.

### 3. Session list

With copy and CSV export.

### 4. Claimed area comparison

New information about the user changes what this app is for. The buyer's real
problem is that hides arrive stamped with a supplier's area figure, and when
the hide goes on a cutting plotter the figure turns out to be too high for the
layout to fit. He needs the discrepancy, not just the number.

Design constraint, and this is a decision, not an option to weigh: one flow,
not two modes. Claimed area is an optional field, because the user often learns
the claimed figure after measuring, when he looks at the tag.

- On the Area step, below the three unit cards, add one "Claimed area" input,
  empty by default.
- When it holds a value, show the difference in dm² and as a percentage.
- When it is empty, the screen behaves exactly as it does today.
- In the session list, the difference column is empty for entries measured
  without a claimed figure.
- No colour coding and no threshold yet. The user has not told us what
  discrepancy is worth disputing, and inventing a threshold would put a number
  in front of him that we made up.

### 5. Hand the app to the friend for a real batch

### 6. Decide on persistence from his feedback

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

**Why this track's priority rose.** Our mask sits slightly outside the true
edge, so the app overstates area. Once the app is used to check a supplier's
claimed figure, that is the worst direction the error could run in: an
overstated measurement understates the shortfall the user is trying to prove.
The size of that bias on a hide-sized object has never been measured.

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
