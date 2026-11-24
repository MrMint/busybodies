# Restructure plan

The moves from [`architecture-review.md`](architecture-review.md), as an ordered list of small
mechanical commits. **Start once #37 (sound removed) has merged.** Every QA PR is in, and with sound gone the plan
has no audio steps. Run the steps on one branch, one at a time. Every step
moves code without changing what it does.

## Status (2026-11-23): run, with these left open

The restructure PR ran the steps below one commit each, with tsc, the unit tests, Biome and knip
after every one, and e2e plus a three-theme screenshot diff at the end. What changed from the
plan as written:

- **R0 ran last**, after the moves, so the moves stay readable and the format commit is the one
  listed in `.git-blame-ignore-revs`. CI now runs `biome ci` with the formatter on.
- **R5 is narrower.** `watcher/read.ts` holds `obj`, `str`, `num`, `count` and `optional`, and the
  copies point at it. The other guards in `ledger.ts` are one-offs and stay inline.
- **R4's `MIN`**: only the three duplicate `MIN = 60_000` constants moved; tuning values written
  as `60_000` stay in their tuning objects. `office/light.ts mix` clamps, so it stays apart from
  `shared/colour.ts mix`.
- **R11**: `world/stations.ts` still imports `WorkKind` from `director/work.ts` (type only).
- **R15 and R20: no single `ThemePack`.** A pack holding both painters (Pixi) and words and lines
  (read by the Pixi-free director and sass) would pull Pixi into the Pixi-free layers. Each theme
  is one folder instead, and the four registries keyed by `ThemeId` stay, each typed
  `Record<ThemeId, …>` so a missing theme fails tsc.
- **R22 covered all three themes** (palette, room, furniture, stage, outside per theme), and
  **R26a–g** split `direct.ts`'s helpers into `director/direct/`.

**Left open**, each needing more than a move, so each is its own PR:

- **R14**: the office stops reading the snapshot (a small logic change, with tests).
- **R19**: rewordings out of `sass/lines.ts` into each theme's lines (changes how banks are built;
  snapshot each theme's bank first).
- **R21**: the theme kit. The duplicated painters differ in literal geometry (`-70`, `-38`, `150`
  against `DESK_TOP = -60`), so merging them is a pixel-checked change, not a move.
- **R23 (rest), R24, R25, R26b (the `direct()` phases)**: `bakeryTheme`, `factoryTheme`,
  `officeTheme`, `paperTheme`, the `Office` class and `direct()` are each one function or class
  whose parts share closure or instance state. Splitting them means a refactor with its own
  review, not a cut.

## Rules for every step


- One step, one commit, and the commit message names the step (`R3: move theme ids to src/themes/ids.ts`).
- A move is `git mv` plus import rewrites, nothing else, so `git log --follow` and blame keep
  working. A split creates new files from cut-and-paste and leaves the old file as the
  assembler. Don't edit logic in the same commit.
- After each step: `hutch pm exec -- tsc --noEmit`, `bun test test/`, `hutch run lint`,
  `hutch run knip`. After any step that touches `src/scene/` or `src/mainview/`:
  `hutch pm exec -- vite build && bun test e2e/`, and
  `tools/shoot.ts` for all three themes, then `tools/shot-diff.ts` against the run from before
  the step. The diff must be empty: these steps change no pixels.
- If a step's diff grows beyond moves and imports, stop and split it.
- Update the `AGENTS.md` Layout table in the same commit as the move it describes.

## Phase 0: baseline

- **R0. Format all.** `hutch run format`, then commit the result alone. Add its SHA to a new
  `.git-blame-ignore-revs`. Switch CI's lint step from `biome ci --formatter-enabled=false` to
  `biome ci`. Expect about 110 files and +7.2k/−2.5k lines at width 160 (re-measure on the day).
- **R1. Baseline screenshots.** Run `tools/shoot.ts --theme office|factory|bakery` and keep the
  output outside the repo. Every later step diffs against it.

## Phase 1: cleanup in place (no moves)

- **R2. Biome fixes.** `biome lint --write` for unused imports, optional chains, `import type`
  and `const`. Hand-fix `lastAtOf` (delete it), the unused parameters (prefix them with `_`),
  `shared/rpc.ts {}`, and the two shadowed globals (`tools/shoot.ts`, `test/sass.test.ts`). Then promote those rules from `warn` to `error` in `biome.json`.
- **R3. Dead exports.** Delete the truly unused functions (review §5, after rechecking each one
  with `knip`). Drop `export` from file-local helpers. Delete the unused barrel re-exports in
  `scene/rig/index.ts`, `scene/director.ts` and `scene/theme/index.ts`, keeping only the names
  something imports. Then add `exports,types` to knip's failing set in CI.
- **R4. Shared helpers.** Add `src/shared/hash.ts` (the string hashes, each under its own name),
  `src/shared/time.ts` (`SEC`, `MIN`, `HOUR`) and `src/shared/colour.ts` (`mix`). Point every copy
  at them, one helper per commit if the diff is large. Make `sameStop` one export from
  `office/camera.ts`, `crewSize` one export from `office/placement.ts`, `poseMs` one export
  from `rig/poses.ts`, `optional` one export from `watcher/read.ts` (R5), and `flat` one export
  from `watcher/model.ts` as `allSessions`.
- **R5. Watcher read helpers.** Add `src/watcher/read.ts` (`str`, `num`, `count`, `obj`, `arr`,
  `optional`). Rewrite the guards in `ledger.ts`, `snapshot.ts` and `anonymize.ts` to use it.
  `test/` must pass unchanged. This is the only step that touches logic lines, so keep it
  separate.
- **R6. Rename the same-name-different-meaning pairs.** `signs.ts mugsFor` → `mugsForIdle`,
  `signs.ts localDay` → `dayLabel`, `rig/player.ts mix` →
  `mixHash`.

## Phase 2: layers

- **R7. Theme ids to the bottom.** `git mv src/scene/theme/id.ts src/themes/ids.ts` (the new
  folder starts here), and rewrite the imports in `bun/`, `sass/`, `rig/` and `mainview/`.
  `scene/theme/index.ts` re-exports from the new path for now.
- **R8. Roles below shared.** `shared/diary.ts` needs only `roleFor`. Either move `roleFor` and
  `Role` into `src/shared/roles.ts`, with `rig/roles.ts` re-exporting it, or pass the role into
  the diary. Prefer the move.
- **R9. The scene contract.** Create `src/scene/contract.ts`. Move the types that director and
  drawing share (`DeskProps`, `Tray`, `Lamp`, `PlannerRow` from `director/metrics.ts`; `Mood`,
  `Cue`, `Walk`, `Who`, `Point` from `office/slot.ts`; `StoryView` from `office/decor.ts`) into
  it, and re-export them from their old homes for one step. **R9b**: point the importers at
  `contract.ts` and drop the re-exports.
- **R10. The floor plan gets its own folder.** `git mv` the Pixi-free half of `office/` to
  `src/scene/world/`: `world.ts` (rename the export `World` → `Floor`; every importer already
  calls it that), `layout.ts`, `placement.ts`, `camera.ts`, `daylight.ts`, `staging.ts`,
  `propspots.ts`, `rigpoints.ts`, `crate.ts`, `decor-plan.ts`. Split this into two commits
  (geometry, then the rest) if the import rewrite is noisy.
- **R11. Stations and paths below the drawing.** `director/stations.ts` → `scene/world/stations.ts`.
  It's a names-only contract that `world.ts`, `rig/reach.ts` and `rig/sheet.ts` need.
  `director/paths.ts` → `scene/world/paths.ts`: `along`, `heading` and `lookMs` are walk geometry
  that the rig uses too.
- **R12. Rig data apart from rig drawing.** `git mv` `poses.ts`, `frame.ts`, `vocab.ts`,
  `roles.ts`, `gaze.ts`, `motion.ts`, `reach.ts`, `player.ts`, `life.ts` and `pack.ts` into
  `src/scene/rig/data/`. The director imports only from there.
- **R13. Enforce the layers.** Extend the `biome.json` override: add `scene/world/**` and
  `scene/rig/data/**` to the Pixi-free list, and ban `src/scene/**` from `src/shared/**` and
  `src/bun/**` (apart from `src/themes/ids.ts`). Use `noRestrictedImports` `patterns`.
- **R14. Office stops reading the snapshot.** Have the director add the four facts that
  `Office.show()` reads off the snapshot (running builds, desk cards, label counts, session
  order) to its `World`, and have the office take that instead. It's a small logic change, so give
  it its own PR with tests rather than putting it in this series.

## Phase 3: one folder per theme

- **R15. The pack interface.** Add `src/themes/pack.ts` with `ThemePack` (review §2) and
  `src/themes/index.ts` with `THEME_PACKS` built from today's registries (`THEMES`, `RIGS`,
  `WORDS`, `BANKS`). Add a test that `Object.keys(THEME_PACKS)` equals `THEME_IDS`. The old
  registries stay and read from the packs.
- **R16–R18. Move each theme** (one commit per theme, office first since it's the default):
  - `git mv scene/theme/<id>.ts themes/<id>/scene.ts`
  - `git mv scene/rig/<id>.ts themes/<id>/rig.ts`
  - `git mv scene/sass/lines-<id>.ts themes/<id>/lines.ts` (office: cut the `office: true` lines
    out of `sass/lines.ts` in a follow-up, not in the move)
  - cut `<ID>_WORDS` out of `scene/theme/words.ts` into `themes/<id>/words.ts`
  - factory also: `theme/factory-staging.ts`, `theme/arm.ts`, `theme/armplan.ts` → `themes/factory/`
  - add `themes/<id>/index.ts` exporting the pack
- **R19. Rewordings out of the shared lines.** Turn each `themed: { factory, bakery }` in
  `sass/lines.ts` into an entry in that theme's `lines.ts` `reword` map, and make `bank.ts`
  apply it. `test/sass*.test.ts` must give the same banks per theme, so add a snapshot of each
  theme's bank before this step.
- **R20. Retire the old registries.** `scene/theme/index.ts`, `rig/themes.ts`, `words.ts WORDS`
  and `bank.ts BANKS` now read through `themePack(id)`. Delete the ones nothing imports. The
  seam's shared code stays in `scene/theme/`: `types.ts`, `build.ts`, and `kit.ts` (R21).
- **R21. The theme kit.** Move the duplicated painters (review §4) into `scene/theme/kit.ts`:
  the desk/bench body with named `DESK` geometry, `ST_L`/`ST_R` (next to `world.ts DESK_TOP`, and
  reconcile `DESK_TOP = -60` with the painted top while you're there), `WOOD`, `rugOf`, the room
  `shell` skeleton, `conveyor(colours)` for belt/slats/rollers, `hazard`, and a planner that
  takes a style (folding in bakery's `orderBoard`). One painter per commit, each diffed by
  screenshot.

## Phase 4: split the large files

Each split cuts named functions into sibling files and leaves the old file as the assembler.
Do them in this order, smallest risk first.

- **R22. `themes/bakery/scene.ts`** → `palette.ts`, `pastries.ts`, `room.ts`, `desk.ts`,
  `furniture.ts`, `stage.ts`, `outside.ts`, `scene.ts`. Then do the same for factory and office.
- **R23. `themes/bakery/rig.ts`** → `rig/geometry.ts`, `rig/outfits.ts`, `rig/kit.ts`, `rig.ts`.
  Factory and office the same where they're over ~600 lines.
- **R24. `rig/theme.ts`** → `rig/paper/palette.ts`, `ink.ts`, and painters by layer (`body`,
  `face`, `arms`, `props`, `stations`, `effects`), each `Record<part, Painter>` that
  `paperTheme()` merges. `test/rig.test.ts` and the pose sheet must be unchanged
  (`tools/pose-sheet.ts`, diffed).
- **R25. `office/office.ts`** → `bake.ts`, `desk.ts`, `bubbles.ts`, `labels.ts` as internal
  modules. `Office` stays the one class.
- **R26. `director/direct.ts`** → `direct/specs.ts`, `places.ts`, `choice.ts`, `handoff-mail.ts`,
  `builds.ts`, `cue.ts`. Then, as a separate step, **R26b**: break the ~610-line `direct()` into
  named phases it calls in order. The director tests and replayed fixtures must give
  byte-identical events, so add a fixture-replay snapshot of `direct()` output before R26 if
  there isn't one.

## After

- Update the `AGENTS.md` Architecture section with the final folder names.
- Add a `docs/decisions.md` entry: "2026-xx-xx: the restructure".
- Adding a fourth theme should now take one folder plus one line each in `themes/ids.ts` and
  `themes/index.ts`. Check that by writing the decisions entry as a "how to add a theme"
  checklist.
