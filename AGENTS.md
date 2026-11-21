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
- **Render on demand.** The ticker runs only while something animates. A scene where nothing is
  happening must cost near-zero CPU. Pixi's global tickers stay stopped: drive any
  `AnimatedSprite` from the app ticker. Check with `tools/profile.sh idle --busy 0 --rate 0`.
- **Drive PixiJS directly.** Use imperative scene code, not `@pixi/react`.
- **Use WebGL2.** Keep `preference: "webgl"`; WebGPU is opt-in later.
- **No GSAP.** Tweens and springs come from our own small helper.
- **The watcher only reads.** It never writes to the agent tool's files or changes its config.
  Hooks are opt-in, user-installed, and must never block the agent.
- **Check before you call it done:** `hutch pm exec -- tsc --noEmit` (Vite builds don't
  type-check), `bun test test/`, and for scene work `hutch pm exec -- vite build && bun test e2e/`.
  The e2e tests run the bundled scene in headless Chrome and hold the frame budgets: an idle
  office makes zero animation frames, and a busy one renders at 30 fps or less.
- **Check the scene as data before pixels.** In dev, or with `?inspect`, `window.__busybodies`
  exposes the snapshot, every character (mood, size, position, bounce), frame counters, and
  `freeze()`/`step(n)` on a frozen clock. Read it from the browser pane with `?demo` or
  `?demo=idle`, and use screenshots only for what data can't show. Keep the scene deterministic:
  derive any randomness from an id, never `Math.random()`.
- **Parse the agent tool's files defensively.** Its formats are internal and change between
  versions. Every field is optional, unknown records are skipped, and a torn write keeps the last
  good value.

## Layout

| Path | What |
|---|---|
| `src/bun/` | The Electrobun main process: windows |
| `src/watcher/` | Capture: reads the agent tool's files into a `Snapshot` (`model.ts` is the contract) |
| `src/mainview/` | The scene, drawn with PixiJS in the webview |
| `test/` | Unit tests (`bun test test/`). Fixtures are built in a temp folder from invented data |
| `e2e/` | Scene tests in headless Chrome (`bun test e2e/`) |
| `tools/watch-tree.ts` | Prints the live session/agent tree in a terminal |
| `tools/fake-home.ts`, `tools/profile.sh` | Synthetic load, and CPU per process under it |
| `docs/instrumentation.md` | How to measure and check the app, and what's planned |
| `docs/plan.md` | The build plan: world model, streams, how work lands |
| `design/` | The chosen look: boards, line bank, renders (`design/README.md`) |
| `docs/decisions.md` | Why things are the way they are |
| `docs/research/` | Feasibility research (dated, with sources) |
| `.claude/skills/pixijs/` | The vendored official PixiJS skill (MIT) |
| `tools/` | Repo scripts |
