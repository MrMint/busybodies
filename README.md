# Busybodies

A desktop app that turns your AI coding agents into a little office full of busybodies. Every
running coding-agent session gets a desk, every subagent it spawns gets a tiny colleague, and you
can watch them work frantically, slack off shamelessly, and wave at you when they need you.

Early days: the app currently opens a window with a placeholder scene.

## Run it

Busybodies is built on [Electrobun](https://electrobun.dev) (a Bun main process, with the UI drawn
in the system webview) and [PixiJS](https://pixijs.com). Electrobun's build tool is
[Hutch](https://docs.electrobun.dev/electrobun/guides/hutch/).

```bash
hutch install      # dependencies, from hutch.lock
hutch run dev      # build and open the app, rebuilding on change
hutch run dev:hmr  # the same, with Vite hot reload for the scene
hutch run build    # a release build
```

## How it works

- **Capture.** A watcher in the Bun process reads the agent tool's local session files
  (session registry, transcripts and subagent metadata) and keeps a live tree of sessions and
  agents. It is passive: nothing is injected into the agents. Hooks can be added for instant
  signals.
- **Scene.** PixiJS draws the office on WebGL2, and renders only while something moves.
- **Characters.** Characters are posed from a part vocabulary (eyes, brows, mouth, arms, feet,
  props), and a pose is a timed sequence of those frames.
- **Themes.** A theme reskins the parts. It never changes the poses.

[`docs/decisions.md`](docs/decisions.md) records why things are the way they are.
[`docs/research/`](docs/research/) holds the feasibility research behind them.

## Contributing

Agents and humans start at [`AGENTS.md`](AGENTS.md).
