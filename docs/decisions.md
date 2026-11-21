# Decisions

Each entry: what was decided, and why. Newest last.

## 2026-11-21: feasibility

**Capture by reading local files, with hooks optional.** The agent tool already keeps everything
the scene needs on disk: a registry of live sessions (with busy/idle status), append-only
transcripts, per-subagent metadata (role, parent, depth), and the desktop app's session index
(titles, branches, lineage). Watching these files costs near-zero CPU, and tailing transcripts
reads only the newly appended bytes. The formats are internal and change between versions, so
parsing is defensive and ignores unknown records. Hooks, the documented interface, are an
opt-in for instant "started a tool" and "needs you" signals.

**Desktop app on Electrobun, not a web page or Electron.** It is a Bun main process with the
system webview (WKWebView on macOS), and is MIT-licensed. It supports full-screen, always-on-top
and transparent windows, a tray icon, typed RPC and an updater. Risks: it is young, and the
floating window's click-through has open issues (see `docs/research/runtime.md`). Full-screen is
the primary mode; a small floating window is optional.

**Hutch is the build tool.** Electrobun 2 builds through Hutch, which manages the toolchain and
writes `hutch.lock`. The installer adds `~/.hutch/bin` to the shell's PATH.

## 2026-11-21: rendering

**PixiJS v8, driven directly, on WebGL2, rendering on demand.** Pixi is a fast 2D scene graph
with sprites, particles and filters, and agents write it well with the official skill.
`@pixi/react` gets only maintenance releases and does not suit a scene of hundreds of
per-frame sprites. Pixi's docs call WebGPU experimental, and in WKWebView it needs macOS 26
while Electrobun supports macOS 14.

**Vendor the official PixiJS skill into `.claude/skills/pixijs/`.** Every agent in the repo gets
it without installing anything, and it is pinned to our PixiJS version. It is MIT, synced from
`pixijs/pixijs-skills` by `tools/sync-pixijs-skill.sh`.

## 2026-11-21: characters and art

**Characters are a pose rig, not tweens.** A frame is a small parameter object drawn from a part
vocabulary (eyes, brows, mouth, arms, feet, body, props, effects). A pose is a timed sequence of
frames, with metadata: which event triggers it, how rare it is, which lines it may say.
Expressiveness comes from acted poses (waiting on you, a failed test, a PR celebration, handing
work to a new subagent, napping). Generic motion (squash, springs, particles, speech bubbles)
sits on top. A theme swaps the part art and never the poses.

**Art is our own work or CC0.** No CC-BY-SA, GPL or LPC art, because share-alike clashes with an
MIT repo. Spine is out: its runtime is not free software, and its rigs are authored in a GUI.
Raw AI-generated sprite sheets are deferred: frame-to-frame consistency is weak, and unedited
output has no US copyright protection, so it can't be reliably licensed.

**No GSAP.** It is free, but its licence carves out tools that compete with Webflow, and the
wording is vague. A small in-house ease/spring helper avoids that.

**Sass is canned lines, for now.** Written lines are triggered by real events: free, instant,
and private. AI-written commentary may come later as an opt-in.

## 2026-11-21: visual direction

Three style pilots: pixel art, cut paper, and clay stop-motion. **Cut paper won**, for its smooth,
springy motion. The asks for the next round: make it much cuter and more expressive, and make the
world an office you can walk around in, with depth, rooms and furniture, where characters work
frantically when busy and slack off comically when idle. Pixel art read as too pixely and not
cute enough; clay was not liked.
