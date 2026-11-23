# AGENTS.md

Rules for anyone (agent or human) changing this repo. Facts and reasons live in
[`docs/decisions.md`](docs/decisions.md).

## Before writing PixiJS code

Use the vendored skill at [`.claude/skills/pixijs/`](.claude/skills/pixijs/SKILL.md). It is the
official PixiJS skill, pinned to the PixiJS version in `package.json`. Follow its router: list the
topics your task touches and read those files before you write. Its pitfall list catches the
v7-era APIs that look right and silently draw the wrong thing. Update it only with
`tools/sync-pixijs-skill.sh`, together with the `pixi.js` version.

## Rules

- **Never commit real session data.** Fixtures and screenshots use invented projects, branches,
  titles and people. No real usernames, home paths, or transcript text. This repo is public, and a
  pushed object can't be taken back. `tools/scan-private.sh` enforces this in CI and as a pre-push
  hook: run `git config core.hooksPath .githooks` once per clone, and list your own username and
  real project names in a gitignored `.private-words` file.
- **No vendor branding in the art.** No logos, wordmarks or brand marks of any AI vendor. Model
  names as plain text labels are fine.
- **Art licences:** CC0 or our own work only. No CC-BY-SA, GPL or LPC art, and no raw
  AI-generated images. See `docs/decisions.md`.
- **Render on demand.** The ticker runs only while something animates. **Off screen** (WebKit's page
  visibility: minimized, hidden, another Space, covered, locked) the scene draws nothing at all.
  On screen, a quiet office may keep **life** going (blinks, glances, rotating habits, ambient
  props) at up to 30 fps, like acting; camera moves run at 60. **Calm mode** (`?calm`, the Calm office
  setting, or reduced motion) has no life, so a quiet calm office costs near-zero CPU. Anything new
  that moves on its own rides the life clock and stops when calm or hidden. Pixi's global tickers
  stay stopped: drive any `AnimatedSprite` from the app ticker. Check with
  `tools/profile.sh idle --busy 0 --rate 0`, with and without calm, and a frame's cost with
  `bun tools/bench.ts`.
- **Don't rebuild the world on a frame.** Pixi rebuilds a render group's draw list whenever a
  child's `visible` or `zIndex` changes. Anything that blinks or swaps often switches by alpha
  (alpha 0 draws nothing), and anything that sorts by its feet every frame uses `setDepth`
  (`src/scene/office/depth.ts`). `visible` is for what changes on a snapshot.
- **Drive PixiJS directly.** Use imperative scene code, not `@pixi/react`.
- **Use WebGL2.** Keep `preference: "webgl"`; WebGPU is opt-in later.
- **No GSAP.** Tweens and springs come from our own small helper.
- **The watcher only reads.** It never writes to the agent tool's files or changes its config.
  Hooks are opt-in, user-installed, and must never block the agent.
- **Check before you call it done:** `hutch pm exec -- tsc --noEmit` (Vite builds don't
  type-check), `bun test test/`, and for scene work `hutch pm exec -- vite build && bun test e2e/`.
  The e2e tests run the bundled scene in headless Chrome and hold the frame budgets: a hidden
  office and an idle calm one make zero animation frames, a living idle one stays at 30 fps or
  less, and a busy one renders at 30 fps or less.
- **Add a changeset with any PR that changes the app:** `hutch pm exec -- changeset add --minor
  busybodies -m "..."` (`--patch` for a fix), written for the release notes. Docs-only and
  tooling-only PRs skip it. Never edit `version` in `package.json` or `CHANGELOG.md` by hand, and
  never push a `v*` tag: merging the "Version Packages" PR releases (`.changeset/README.md`).
- **Check the scene as data before pixels.** In dev, or with `?inspect`, `window.__busybodies`
  exposes the snapshot, every character (mood, size, position, bounce), frame counters, and
  `freeze()`/`step(n)` on a frozen clock. Read it from the browser pane with `?demo` or
  `?demo=idle`, and use screenshots only for what data can't show. Keep the scene deterministic:
  derive any randomness from an id, never `Math.random()`.
- **Parse the agent tool's files defensively.** Its formats are internal and change between
  versions. Every field is optional, unknown records are skipped, and a torn write keeps the last
  good value.

## Architecture

Data flows one way: **watcher → snapshot → director → world → scene → app**. Each layer imports
only from the layers before it.

| Layer | Where | May import |
|---|---|---|
| snapshot | `src/watcher/model.ts`, the contract | nothing |
| watcher | `src/watcher/` | the snapshot, `node:*` |
| shared | `src/shared/`, code both processes run | the snapshot |
| director | `src/scene/director*`, `src/scene/sass/` | the above, plus the Pixi-free floor plan (`office/world.ts`, `layout.ts`, `placement.ts`, …) and rig data (`rig/poses.ts`, `roles.ts`, `player.ts`, …) |
| scene | `src/scene/office/`, `theme/`, `rig/` drawing | everything above |
| app | `src/mainview/` (webview), `src/bun/` (main process; Pixi-free, reads `theme/id.ts`) | everything above |

- **Pixi-free layers stay Pixi-free.** Watcher, shared, director and sass are plain data and
  logic, unit-tested without a browser. Biome fails CI on a `pixi.js` import there. Put new
  logic in a Pixi-free module that returns data, and keep the drawing side thin.
- **Drawing reads the director's `World`.** Scene code that needs to know about the snapshot
  gets it from the director's output.
- **Themes sit behind `SceneTheme`** (`theme/types.ts`) and the rig's `Theme`. They use the same
  director and the same cast. Theme-specific behaviour belongs in the theme's painters,
  `staging`, words or lines, keyed by `ThemeId`.
- Run `hutch run lint` (Biome) and `hutch run knip` (unused files and dependencies) before a PR.
  Biome's formatter isn't enforced yet, so leave formatting as you found it.

Known breaks and the planned restructure: [`docs/architecture-review.md`](docs/architecture-review.md)
and [`docs/restructure-plan.md`](docs/restructure-plan.md).

## Layout

| Path | What |
|---|---|
| `src/bun/` | The Electrobun main process: the office and compact windows, the tray, the app menu, updates, the way out on quit (`shutdown.ts`), the diary on disk (`diary.ts`; its counts-only model is `src/shared/diary.ts`) |
| `src/watcher/` | Capture: reads the agent tool's files into a `Snapshot` (`model.ts` is the contract) |
| `src/mainview/` | The webview's entry: app setup, the top bar, the inspector, demo days; on-screen visibility (`visibility.ts`), the compact camera (`shots.ts`), opt-in sound (`sound.ts`) |
| `src/scene/office/` | The open-floor office: floor plan, camera, cut-paper drawing, the character slot interface; light and time of day (`daylight.ts`, `light.ts`), windows and the yard (`outlook.ts`, `outside.ts`), the paper pass (`material.ts`); a theme's staging (`staging.ts`), ambient life (`ambient.ts`), the walls that remember (`decor.ts`) |
| `src/scene/theme/` | Scene themes (`?theme=`, the tray's Theme menu): the office's, the factory's and the bakery's (`bakery.ts`: a patisserie, a pastry conveyor down the hallway) look, words and staging behind a `SceneTheme`, and the factory's robot arms |
| `src/scene/rig/` | The mochi character rig: parts atlas, springs, frames, poses, and the office's character factory (`?sheet`, `?demo=crowd`); life (`life.ts`: blinks and glances), gaze (`gaze.ts`), the office's corporate cast (`office.ts`) and the Line's kitchen brigade (`kitchen.ts`) |
| `src/scene/director.ts`, `src/scene/director/` | The director: snapshot to world (spots, poses, walks) and events; the sass seam (`say`, `sign`); the story beats (`director/story.ts`) |
| `test/` | Unit tests (`bun test test/`). Fixtures are built in a temp folder from invented data |
| `e2e/` | Scene tests in headless Chrome (`bun test e2e/`) |
| `tools/watch-tree.ts` | Prints the live session/agent tree in a terminal |
| `tools/fake-home.ts`, `tools/profile.sh`, `tools/soak.sh` | Synthetic load (`--churn` for sessions coming and going), CPU per process under it, and memory over a long run (`SOAK_APP=` for a built app) |
| `tools/bench.ts` | A frame's cost per demo scene and theme in headless Chrome on the GPU, and where it goes (`--profile`) |
| `tools/shoot.ts`, `tools/shot-diff.ts` | Deterministic screenshots of named scene states (`--theme`), a contact sheet, and a pixel diff of two runs |
| `tools/record-gif.ts`, `tools/tray-icons.ts` | The README's GIF from `?demo`, and the menu-bar faces |
| `tools/pose-dump.ts`, `tools/pose-sheet.ts` | Every pose as text, and as one PNG (`docs/rig/pose-sheet.png`) |
| `docs/instrumentation.md` | How to measure and check the app, and what's planned |
| `docs/plan.md` | The build plan: world model, streams, how work lands |
| `design/` | The chosen look: boards, line bank, renders (`design/README.md`) |
| `docs/decisions.md` | Why things are the way they are |
| `docs/research/` | Feasibility research (dated, with sources) |
| `.claude/skills/pixijs/` | The vendored official PixiJS skill (MIT) |
| `.changeset/` | Changesets waiting for the next release, and its config |
| `.github/workflows/` | CI, the changesets release PR and status comment, and the release build |
| `tools/` | Repo scripts |
