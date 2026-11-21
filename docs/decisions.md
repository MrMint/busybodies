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

## 2026-11-21: watcher spike

**The watcher works on file reads alone, and costs almost nothing.** Over 60 s of live data (9
sessions, two of them busy, one with a running subagent), it used 0.53% of one core and 41 MB.
Each rebuild took about 3 ms. There were 58 rebuilds, and only 2 changes reached listeners.

How it reads:
- The session registry gives liveness (checked against the process id), busy/idle and the title.
- The transcript's tail gives the last tool call. It is matched as text, because one record can
  be megabytes. The tail grows from 64 KB to 4 MB until a call appears.
- Subagent metadata gives role, task, model, depth and parent. Nesting comes from
  `parentAgentId`.
- The desktop index gives branch and lineage (`spawnedFrom`, `forkedFromSessionId`).

Every read is cached by mtime.

**Agents have four statuses:** running; stalled (unfinished, with a quiet transcript for 30 min);
finished; stopped. Finished and stopped agents linger for 2 min, so the scene can show them
leaving. Stalled agents are dropped after 2 h of quiet. Agents are sorted by id, so the order
stays stable.

**Gaps the files don't cover yet:** "waiting on you" (a permission prompt or a question) shows up
only as idle. The desktop index has hints, and the `Notification` hook is the reliable signal.
Rebuilds also fire on every transcript write in any project; narrowing the watch to live
sessions' folders would cut them.

## 2026-11-21: watcher in the app

**The Bun process owns the watcher and pushes snapshots to the scene over Electrobun's typed RPC**
(`src/shared/rpc.ts`). The scene asks for the current snapshot when it loads, and gets a
`snapshot` message on every change. It keeps characters by id between snapshots, and runs the
frame loop only while someone is busy.

**`?demo` loads an invented snapshot instead of the watcher** (`src/mainview/demo.ts`). The scene
then runs in any browser through Vite, which is how agents can check scene work without real
sessions. This is the seed of the fixture-replay harness.

**Measured in the dev app:** the Bun process used about 5% of one core and 177 MB over 20 s while
two sessions were busy. That compares with 0.5% for the watcher alone. Profile this before
calling it cheap. The scene runs at the display's full frame rate whenever anyone is busy; a
lower rate for ambient motion is an easy cut.

## 2026-11-21: first profile

**An idle scene cost ~5% of a core in Bun and ~4% in the webview, because of Pixi's global
tickers.** `Ticker.shared` and `Ticker.system` each run a 60 fps requestAnimationFrame loop from
load, even with the app's ticker stopped. The cost shows up in the Bun process too, because the
native window, and its compositing, lives there. Both tickers are now stopped at startup. Idle
dropped to 0.4% (Bun) and 0.1% (webview), the same as a blank page.

**Ambient motion is capped at 30 fps** (`app.ticker.maxFPS`). The display ran the loop at
120 Hz.

**Measured on a fake home, after the fixes:** busy scenes cost about 2.5–3.3% in Bun and
4.5–8.3% in the webview. The placeholder scene re-renders the whole canvas every frame. The real
scene should cache static rooms and redraw only what moves. How it was measured:
`tools/profile.sh` against `tools/fake-home.ts`. The Electrobun runtime plus the watcher and RPC
cost 0.3% (`BUSYBODIES_SCENE_QUERY=blank`).

The plan for measuring from here on is `docs/instrumentation.md`.

## 2026-11-21: office layout and body shape

**The office is the open floor (round-2 layout F).** Rooms have depth, so a busy project fills
several rows of desks, and a hallway and lobby make it feel walked through. The cost is that
people in front can hide people behind, and a very large day needs a second floor or a longer
hallway.

**Characters are mochi-shaped.** Soft, squishy round bodies on the jointed cut-paper puppet rig,
picked over gumdrop, bean, chibi and pear in a side-by-side comparison. The next design round
also pushes the sass much further: sarcastic bubbles tied to real events, office signage and
background gags, and characters reacting to each other.
