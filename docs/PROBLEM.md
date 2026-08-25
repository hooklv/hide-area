# The problem

Why this app exists, who it is for, what it competes with, and exactly how it is used. Written so that a person joining the project, or the author six months from now, can judge whether a proposed change helps or hurts.

## The trade

Leather hides are sold by area, not by piece and not by weight. A hide comes off the animal in whatever shape the animal was: an irregular outline with legs, neck, belly flaps, and on a crocodile also a tail. No two are the same. There is no length times width to fall back on, because there is no rectangle.

Area is therefore the unit of the transaction. Price per square metre (or square decimetre, or square foot, depending on the market and the size of the animal) multiplied by the measured area gives the price of that hide. If the measurement is wrong by three percent, the price is wrong by three percent, on every hide, in every deal.

## Who this is for

A small trader who buys and resells hides: cowhide, crocodile, and others. He works out of a warehouse, not a tannery. He has a phone. He does not have a measuring machine and will not buy one.

He is not the same user as a tannery. A tannery measures thousands of hides a month and its measurement is an industrial process step. He measures a delivery at a time and his measurement is a commercial argument with the person on the other side of the deal.

## How this is done today, at every scale

All existing methods sample the same question across a known grid: is there hide here or not. They differ only in what does the sampling and how controlled the conditions are.

**Mechanical pin-wheel machines.** A row of spring-loaded wheels across a conveyor. Each wheel turns only while hide passes beneath it; the summed rotation is proportional to area. Still described in the industry's international code of practice. The hide is fed in flat and unwrinkled, and the machine is calibrated regularly with templates of known area.

**Electronic photocell machines.** The mainstream today. Same conveyor, but a line of photocells instead of wheels. Each cell records covered or not covered and emits pulses, each pulse representing a fixed unit of area, typically one square centimetre. Accuracy is better than 0.5 percent, typically 0.2 percent. Many machines carry an operator-set correction percentage to compensate for the shortfall caused by wrinkles that cannot be fully removed in a single pass. Made by GER Elettronica and Selin Projects in Italy, Sivagami in India, Demaksan in Turkey, and a number of Chinese manufacturers, in separate versions for wet blue and finished leather.

**Camera and laser systems.** The newest generation, and conceptually identical to this app, only fixed in place: a camera above a conveyor and image processing below it. Modern systems from GER Elettronica also measure thickness, colour and weight and grade hides by defect.

**A person with a tape measure, or an estimate by eye.** What a small trader actually does. Slow, unrepeatable, and easy to argue with.

The important conclusion: a phone photo with a scale reference is not a worse method than the machines, it is the same method with a different sampling device, pixels instead of photocells. The difference is not the physics. The difference is control of conditions. A machine guarantees a flat hide and fixed geometry. A phone guarantees neither, and that gap is where all the real error lives.

## What was rejected, and why

**Buying an industrial machine.** Thousands of euros and a conveyor's worth of floor space for a trader who measures a delivery at a time. Not proportionate.

**A generic photo measurement app, such as ImageMeter.** This is the serious alternative and it should not be dismissed. It calibrates from a reference object, corrects perspective, and measures areas in the image. It costs a one-off licence fee and exists today.

It leaves one thing undone: the operator traces the irregular outline by finger, for every hide. That is the whole cost, and it is also the whole opportunity. The only thing worth building is the part the generic tools do not do, which is turning the outline into a single tap.

If it turns out that finger tracing is tolerable in practice, this project is not justified and the honest answer is ImageMeter. That verdict has not been reached yet, because the trader has not been asked to try it.

**AR measurement via ARCore or LiDAR.** Tracing an irregular outline with points in AR is worse than doing it on a photo, and accuracy is lower for a flat object. Also restricts the app to specific hardware.

## What this app is

A phone web page. The user photographs a hide with an A4 sheet lying flat beside it, taps the four corners of the sheet, taps the hide once, checks the outline, and reads the area.

Everything runs in the browser on the device. No backend, no accounts, no upload. Two consequences follow: the trader's inventory never becomes someone else's data, and the app costs nothing to run and cannot be switched off by a service shutting down.

The four corners of the A4 sheet give a homography, which converts image pixels into millimetres on the floor plane and removes perspective distortion, so the camera does not have to be perfectly overhead. The single tap on the hide is a prompt to a segmentation model (SlimSAM, running client-side), which returns the mask of the object under the finger. The mask is traced to a polygon, the polygon is transformed into millimetres, and its area is computed. The polygon vertices remain draggable, so the human stays in the loop.

## The user flow, in full

### Setting up, once per shift

**Choose a working area.** A flat patch of floor with a plain surface that contrasts with the hides. Brown hides on brown concrete is the worst case for segmentation. A cheap plain sheet or tarpaulin thrown down solves more than any amount of software tuning.

**Clear it.** Pallets, boxes and feet in frame all give the model something else to latch onto.

**Have a stack of A4 sheets.** One sheet gets creased or dirty; keep spares.

**Open the app once and let the model load before starting.** The first load downloads roughly 40 MB. After that it is fast.

### Per hide

**1. Lay the hide flat.** Spread the edges, smooth the folds by hand. This step, done by a human with no feedback from the app, dominates the accuracy of the result. A curled edge is a shortfall that nobody will notice later.

**2. Place the A4 sheet beside the hide,** flat on the same floor, fully visible, not folded, not overlapping the hide. Not on top of the hide: a sheet resting on thick leather sits a centimetre or two above the floor plane and biases the scale.

**3. Photograph from above.** The whole hide and the whole A4 sheet in frame. Keep the A4 as large in the photo as practical; the app warns when its long edge is under 300 pixels. A cowhide at four to five square metres needs two and a half to three metres of height, or a stepladder, or a mezzanine. Tilt is corrected by the homography, but less tilt wastes fewer pixels on foreshortening.

**Shoot straight down; keep the A4 near the hide and the frame centre.**

**4. Tap the four corners of the sheet.** Order does not matter.

**5. Tap once inside the hide.** Wait a few seconds while the model builds the image embedding. The mask appears as a translucent overlay.

**6. Correct the mask if needed.** If it grabbed something extra (a shadow, the edge of the tarpaulin, a neighbouring hide), switch to Remove and tap the extra part. If it missed a piece, stay on Add and tap the missing piece.

**7. Check the outline** and drag vertices where it went wrong.

**8. Record the area.** The app currently stores nothing, so this is manual. (See `MEASUREMENT-LOG.md` for the planned session log.)

### Throughput

Laying out and photographing dominates the time. The app itself adds roughly ten seconds per hide on a mid-range Android: about seven seconds for the embedding, under half a second per tap after that. The bottleneck is hands, not the phone.

### Mixed deliveries

The app does not distinguish species and has no per-animal mode. The practical differences are physical. Crocodile hides are small enough to shoot from standing height, but legs and tail give a long perimeter relative to area, so the same edge error costs a larger percentage. Cowhides are simple in outline but large, and need height. Sorting the delivery by size, and shooting all the small ones from one position before setting up for the large ones, saves more time than anything in the software.

## Where the error actually comes from

In descending order of impact.

**1. The hide is not flat.** Folds, curled edges and a raised centre all lower the measured area, and no software step compensates. On an unflattened hide this dominates everything else and can easily exceed five percent. Industrial machines have the same problem, which is why many of them carry an operator-set correction percentage.

**2. The reference sheet is not in the plane of the hide.** The homography assumes both lie in one plane. A sheet on top of a thick hide biases the scale for the entire measurement.

**3. Mask edge and outline.** Mask edge error is a few pixels. On a whole cowhide at roughly three millimetres per pixel that is on the order of a centimetre along the boundary. Area error is approximately mean edge offset multiplied by perimeter, which is why long-perimeter hides pay more for the same edge quality.

**4. Polygon simplification.** Tenths of a percent at the vertex counts used. Ignorable against the above.

Not an error source despite appearances: the one percent calibration tolerance shown after the corner taps. It reprojects the same four points used to solve the homography, so it verifies arithmetic, not whether the taps landed on the real corners.

The synthetic pipeline tests reach 0.45 percent, which closes the mathematics and says nothing about any of the four items above. Only physical tests produce a number that can honestly be quoted.

## Known limitations, stated plainly

- **Holes are not subtracted.** A hole in the hide counts as hide. Deliberate for now.
- **Wrinkles are not compensated.** The app cannot see what is folded under.
- **Nothing is stored.** Every result must be written down by hand.
- **One hide at a time.** No batch processing.
- **First load downloads roughly 40 MB.**
- **Accuracy is a few percent, not a few tenths of a percent.** Industrial photocell machines reach 0.2 to 0.5 percent. This app is not in that class and must not be presented as if it were.

## What success looks like

Not a percentage. The test is a comparison: the trader measures three hides with the app and with whatever he does today, and the two figures are compared. If the app's figure is close enough that the other side of the deal would accept it, and getting it is faster and less irritating than his current method, the app is worth keeping. If not, it is not, regardless of how good the mathematics is.

That test has not been run yet. Everything in this repository up to this point is preparation for it.
