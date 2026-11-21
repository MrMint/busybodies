# S1: the mochi rig

Build the character rig the office will be populated with: mochi-shaped cut-paper puppets that
act. Read first: `AGENTS.md`, `docs/plan.md`, `design/README.md`, the boards
`design/boards/Cast.dc.html`, `Acting.dc.html` and `Shapes.dc.html` (or their stills in
`design/renders/`), and `design/boards/rig.css` for the frame contract. Use the vendored PixiJS
skill before writing Pixi code.

## You own

`src/scene/rig/` (new), its tests, and any tools it needs under `tools/`. Do not change
`src/watcher/`, `src/scene/office/`, or the placeholder `src/mainview/office.ts` beyond what you
need to show your work.

## Build

1. **Parts.** A character is about 18 separate parts in a container: body, face layers, arms,
   feet, costume pieces and props. Draw them procedurally (Graphics or SVG) once at startup, and
   bake them into a texture atlas, so a crowd draws as sprites. The mochi body is soft and
   squishy. Mind the costs `Shapes` notes: arms start wide of the face, there's no chest (roles
   read from hats and props), and hats stretch.
2. **Vocabulary.** 12 faces (eyes, brows, mouth), arm and foot positions, and props. Add 7 role
   costumes: lead, builder, scout, explorer, reviewer, verifier, designer.
3. **Frames and poses.** A frame is a parameter object
   (`{ eyes, brows, mouth, armL, armR, feet, body, props, fx }`). A pose is timed frames plus
   metadata: trigger, rarity, and which lines it may say. Parts spring between frames, so motion
   stays smooth. The owner chose this style for its smoothness, so don't snap. Write a small
   in-house tween and spring helper (no GSAP).
4. **Poses**, ported from `Acting` and redrawn in mochi:
   - typing (frantic)
   - 7 slacking habits
   - waiting on you
   - a failed test
   - PR opened
   - handing work to a new subagent (two characters)
   - asleep, stalled (a cobweb), and done
   - thinking hard, celebrating with a teammate, and grumpy at a long build
   - one rare variant
5. **Review tools.** `tools/pose-sheet.ts` renders every pose's frames into one PNG (headless
   Chrome, as `e2e/` does). A text dump prints each frame's parameters, so a reviewer can read a
   pose instead of looking at it.
6. **Inspector.** Extend `window.__busybodies.entities()` with each character's role, pose and
   frame. Keep `step(n)` deterministic: derive any variation from the character's id.

## Done when

- The pose sheet shows every pose above in mochi, recognisably the `Acting` and `Cast` boards.
  Put the sheet in your PR.
- Unit tests cover pose timing, spring settling and frame interpolation.
- An e2e test with 200 characters on screen holds the existing budgets: zero frames when idle, at
  most 30 fps when busy. Report the profiler's numbers (`tools/profile.sh`) in the PR.
- `docs/decisions.md` has an entry for each choice a later stream needs: the atlas layout, part
  naming, and how a theme reskins parts.

## Rules

Follow `AGENTS.md`: invented data only, no vendor branding, no GSAP, no Pixi global tickers (drive
animation from the app ticker), render on demand. Work in your own worktree on a branch named
`s1-mochi-rig` and land through a pull request with CI green. Don't push to `main`, and don't
merge your own PR.
