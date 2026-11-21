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
  titles and people. No real usernames, home paths, or transcript text. This repo is meant to be
  public.
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
- **Check types before you call it done:** `hutch pm exec -- tsc --noEmit`. Vite builds do not
  type-check.

## Layout

| Path | What |
|---|---|
| `src/bun/` | The Electrobun main process: windows, and later the watcher |
| `src/mainview/` | The scene, drawn with PixiJS in the webview |
| `docs/decisions.md` | Why things are the way they are |
| `docs/research/` | Feasibility research (dated, with sources) |
| `.claude/skills/pixijs/` | The vendored official PixiJS skill (MIT) |
| `tools/` | Repo scripts |
