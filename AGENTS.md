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
  happening must cost near-zero CPU.
- **Drive PixiJS directly.** Use imperative scene code, not `@pixi/react`.
- **Use WebGL2.** Keep `preference: "webgl"`; WebGPU is opt-in later.
- **No GSAP.** Tweens and springs come from our own small helper.
- **The watcher only reads.** It never writes to the agent tool's files or changes its config.
  Hooks are opt-in, user-installed, and must never block the agent.
- **Check before you call it done:** `bun test` and `hutch pm exec -- tsc --noEmit`. Vite builds
  do not type-check.
- **Parse the agent tool's files defensively.** Its formats are internal and change between
  versions. Every field is optional, unknown records are skipped, and a torn write keeps the last
  good value.

## Layout

| Path | What |
|---|---|
| `src/bun/` | The Electrobun main process: windows |
| `src/watcher/` | Capture: reads the agent tool's files into a `Snapshot` (`model.ts` is the contract) |
| `src/mainview/` | The scene, drawn with PixiJS in the webview |
| `test/` | `bun test`. Fixtures are built in a temp folder from invented data |
| `tools/watch-tree.ts` | Prints the live session/agent tree in a terminal |
| `docs/decisions.md` | Why things are the way they are |
| `docs/research/` | Feasibility research (dated, with sources) |
| `.claude/skills/pixijs/` | The vendored official PixiJS skill (MIT) |
| `tools/` | Repo scripts |
