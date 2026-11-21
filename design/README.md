# Design

The source of the look, from three rounds of design pilots. Everything here is invented: the
projects, sessions and people on the boards are made up. The boards are a CSS stand-in for the
real scene; the app draws with PixiJS.

## What was chosen

- **Office: the open floor** (`FloorBusy`, `FloorRoom`). Projects are rooms off a hallway, with
  rows of desks, a lobby, a kitchen (coffee queue, water cooler), a meeting room for reviews, a
  nap pod, plants, windows, whiteboards and signs. The camera moves between fixed stops: the
  whole office, a room, a desk.
- **Characters: mochi-shaped cut-paper puppets.** About 18 separate parts that spring between
  poses, with seven role costumes (lead, builder, scout, explorer, reviewer, verifier, designer),
  twelve faces, and seven ways of slacking off. `Shapes` records the body-shape comparison and
  what mochi costs: arms start wide of the face, there's no chest (roles read from hats and
  props), and hats stretch.
- **Voice: affectionate roast, never mean to the human, nothing crude.** `Lines` is the line
  bank: 81 lines in 16 trigger groups, each marked as said, thought or sign. Its structured
  source is `BANK` in `generators/r3.py`.

## Files

| Path | What |
|---|---|
| `boards/FloorBusy.dc.html`, `FloorRoom.dc.html` | The chosen office in mochi, busy day and a zoomed room, with the jokes |
| `boards/Lines.dc.html` | The line bank, by trigger |
| `boards/Shapes.dc.html` | The body-shape comparison; mochi chosen |
| `boards/Cast.dc.html`, `Acting.dc.html` | The cast and acted poses: waiting on you, a failed test, PR opened, spawning a subagent, asleep, a rare variant, thinking hard, celebrating, grumpy at a long build. **Still the round-2 body**; redraw in mochi when building the rig |
| `boards/rig.css` | The rig contract: a frame is `{ eyes, brows, mouth, armL, armR, feet, body, props, fx }`, and a pose is timed frames plus trigger, rarity and allowed lines |
| `boards/Side*.dc.html` | Layout 1, the cutaway: not chosen |
| `boards/Paper*`, `Pixel*`, `Putty*` | Round 1's three styles. Cut paper won, then became mochi |
| `boards/*.css`, `canvas.json` | The boards' styles and the design canvas's layout |
| `generators/` | The Python that writes the boards (`gen2.py`, `office.py`, `r3.py`), and `shot.sh` for headless Chrome renders |
| `renders/` | Stills of the main boards, for reading without a browser. They're frozen at the start of each animation |

To regenerate: `python3 generators/gen2.py` writes `boards/` and a `preview/` folder (gitignored)
that `generators/shot.sh <board> <w> <h>` renders to `renders/`.

## Known gaps

- Cast and acted poses use the round-2 body, and mochi's hand-to-face poses aren't tuned.
- In the kitchen zoom, one name tag overlaps an agent in the queue.
- Motion was only ever seen as stills: the wobble, springs, walkers and bubble timing are
  unchecked.
