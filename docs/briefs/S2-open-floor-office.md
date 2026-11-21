# S2: the open-floor office

Build the office the characters live in: the open floor the owner chose. Read first:
`AGENTS.md`, `docs/plan.md` (especially "The world model"), `design/README.md`, and the boards
`design/boards/FloorBusy.dc.html` and `FloorRoom.dc.html` (or their stills in `design/renders/`).
Use the vendored PixiJS skill before writing Pixi code.

## You own

`src/scene/office/` (new), the layout's world model types, its tests, and the screenshot tool
below. Don't change `src/watcher/` or `src/scene/rig/`. Use simple placeholder characters (the
current `Busybody` is fine) until the rig lands; keep the interface between office and character
narrow (a slot with a position, a depth and a facing), so the rig can drop in.

## Build

1. **World model and layout.** From a `Snapshot`, compute the world:
   - **Rooms:** each project is a room off a hallway, sized by its crew, so a busy project gets
     two or three rows of desks.
   - **Desks:** each session is a desk with a slot for its lead, and slots for its crew nearby.
   - **Common areas:** a lobby, a kitchen (coffee machine with a queue, water cooler), a meeting
     room, and a nap pod.

   The layout must be stable: a new session must not reshuffle everyone else. It must also handle
   1 to about 30 sessions.
2. **Furniture and dressing.** Desks with screens (lit when busy), chairs, plants, windows,
   whiteboards, signs and the fridge. Draw them procedurally in the cut-paper style of the boards.
   Leave named sign and whiteboard slots for S5's sass to fill.
3. **Performance.** Cache the static layers (floor, walls, furniture) as textures, so a busy
   frame redraws only characters, bubbles and lit screens. Sort depth by y; people in front may
   cover people behind, as the design accepts.
4. **Camera.** Stops for the whole office, a room, and a desk. Click a room to zoom to it, and
   add keys for "whole office" and "next room". Moves are smooth and raise the frame rate only
   while moving. Drag and wheel are optional.
5. **Screenshots.** `tools/shoot.ts` renders named scene states (a fixture, a camera stop, a
   size) to PNGs plus one contact sheet, with a frozen clock so two runs match.
6. **Demo.** Grow `src/mainview/demo.ts` (or add a fixture) into `FloorBusy`'s invented day, with
   several projects, a big release crew, idle rooms and a kitchen queue.

## Done when

- `?demo` draws the open floor recognisably like `FloorBusy`, with the camera stops working. Put
  a contact sheet from `tools/shoot.ts` in your PR.
- Unit tests cover layout stability (adding or removing a session moves no other desk) and
  scaling from 1 to 30 sessions.
- e2e budgets still pass. `tools/profile.sh` busy numbers are below the ones recorded in
  `docs/decisions.md` (first profile); report them in the PR.
- `docs/decisions.md` records the layout rules and the office-to-character slot interface.

## Rules

Follow `AGENTS.md`. Work in your own worktree on a branch named `s2-open-floor-office` and land
through a pull request with CI green. Don't push to `main`, and don't merge your own PR.
