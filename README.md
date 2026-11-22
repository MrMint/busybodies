# Busybodies

A desktop app that turns your AI coding agents into a little office full of busybodies. Every
running coding-agent session gets a desk, every subagent it spawns gets a tiny colleague, and you
can watch them work frantically, slack off shamelessly, and wave at you when they need you.

Early days: the app shows your live sessions as rooms in a placeholder office, with each
session's agents gathered around its desk. Try `bun tools/watch-tree.ts` for the same tree in a
terminal, or open the scene with `?demo` to see an invented busy afternoon.

## Install

Busybodies runs on Apple Silicon Macs (macOS 14 or later). Builds aren't signed by Apple yet, so
the install script is the smooth way in.

**The install script.** Read it first if you like: [`install.sh`](install.sh) is about 70 lines.

```bash
curl -fsSL https://raw.githubusercontent.com/MrMint/busybodies/main/install.sh | sh
```

It downloads the latest release, checks it against the release's `SHA256SUMS`, and puts
`Busybodies.app` in `/Applications` (or `~/Applications` if that isn't writable). It never uses
`sudo`. Add a version to pin one: `... | sh -s -- 0.1.0`. Files fetched with `curl` aren't
quarantined, so macOS opens the app without a warning.

**From source.** Install [Hutch](https://docs.electrobun.dev/electrobun/guides/hutch/), then:

```bash
hutch install      # dependencies, from hutch.lock
hutch run dev      # build and open the app, rebuilding on change
hutch run dev:hmr  # the same, with Vite hot reload for the scene
hutch run build    # a release build, in build/ and artifacts/
```

**The `.dmg`.** Each [release](https://github.com/MrMint/busybodies/releases) also has
`Busybodies-macos-arm64.dmg`. A browser download is quarantined, and macOS blocks an app it
can't verify, so opening it takes one extra step:

1. Open the `.dmg` and drag Busybodies into Applications.
2. Open Busybodies. macOS says it can't verify the app is free of malware; click **Done**.
3. Open **System Settings → Privacy & Security**, scroll down to **Security**, and click
   **Open Anyway** next to the line about Busybodies. Confirm with your password or Touch ID.

After that it opens normally. If you'd rather skip this, use the install script, or clear the
quarantine flag yourself: `xattr -dr com.apple.quarantine /Applications/Busybodies.app`.

**Updates.** The app checks for a new release a little after launch and every 6 hours. When there
is one, it downloads it and restarts into it. Set `BUSYBODIES_NO_UPDATE=1` to turn that off.

**Uninstall.**

```bash
rm -rf /Applications/Busybodies.app ~/Library/Application\ Support/app.busybodies ~/Library/WebKit/app.busybodies
```

(Use `~/Applications/Busybodies.app` if that's where it went.)

**What it reads.** Busybodies reads your coding agent's local files (its session registry,
transcripts and subagent metadata), read-only. Nothing is sent anywhere: the only network
request the app makes is the update check against GitHub Releases. The optional hook
(`tools/hooks.ts`) is the one thing that writes to the agent's settings, and only when you
install it.

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
