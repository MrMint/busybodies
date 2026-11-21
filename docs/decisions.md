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

## 2026-11-21: richer capture (S3)

**A per-transcript ledger reads each transcript once, then only what was appended**
(`src/watcher/ledger.ts`). The first read of a transcript goes back at most 32 MB; a line over
8 MB is skipped. Plain response records are matched as text; only records that carry a signal are
parsed. A file that shrinks was replaced, and its ledger starts over. Each signal, its source, and
how far to trust it:

| Signal | `Snapshot` field | Source | Known unreliability |
|---|---|---|---|
| Running tool and how long | `running` (`since`, epoch ms) | The newest `tool_use` with no `tool_result` yet | A call cut off by a crash stays "running" until the next prompt or compaction clears it. A permission prompt also looks like a running call. Background shell commands return at once, so they never look long |
| Failed commands and tests | `commands.last`, `failStreak`, `failed`, `testsFailed` | Shell `tool_result`s: `is_error` plus an "Exit code N" prefix; the kind (`test`, `build`, `install`, `git`, `other`) is guessed from the command's text | Kinds are a regex guess. Refused, interrupted and backgrounded calls are not counted. Only the kind leaves the watcher, never the command text |
| Retries of the same command | `commands.repeats` | The same command text (whitespace aside) run again in a row | A retry with a changed flag counts as a new command |
| API retries | `apiRetry` | `system`/`api_error` records with `retryAttempt` | Cleared by the next response record |
| PRs opened | `prs` | `pr-link` records, merged with the desktop index's `prs` (which adds `state`) | Index-only PRs have no time |
| Cost | `cost.usd`, `cost.outputTokens` | `cost-state` records; output tokens summed from responses, once per request id | The tool writes `cost-state` when a session exits, so a live session shows its cost up to its last resume, or none. Tokens are live but only output, and only from what the ledger read |
| Compaction | `compactions` (`count`, `lastAt`, `trigger`) | `system`/`compact_boundary` records | Counted from the first read only: older compactions in a >32 MB transcript are missed. There is no record while a compaction runs, only when it ends |
| Waiting on you | `waiting` (`reason`, `since`, `source`) | The opt-in hook's `events.log`, else an open `AskUserQuestion`/`ExitPlanMode` call | See below |

**Waiting on you comes from an opt-in hook** (`tools/hooks.ts install|uninstall|status`). It
registers a 20-line shell script for `Notification`, `UserPromptSubmit` and `Stop`. The script
appends `<epoch s> <event> <session id> [kind]` to `<agent home>/busybodies/events.log`, with
no prompt text and no paths, and exits 0 whatever happens (measured well under 50 ms, even when
the file can't be written; the agent's own timeout caps it at 2 s). The file starts over past
256 KB at the end of a turn. A session is waiting when its newest hook event is a non-idle
`Notification` and its transcript hasn't been written since. The hook's clock has whole
seconds, so a write in the same second still counts as before. Install backs the settings file
up, and uninstall takes out only our entries. If nothing else changed in between, it puts back
the original bytes. Unverified: whether every `Notification` payload carries
`notification_type` (the script falls back to the message's wording), and whether the desktop
app's own permission UI fires the hook at all. The desktop index showed no reliable waiting flag:
`interruptedAwaitingPerson` was always null in the sample, so it isn't used.

**Without the hook, waiting shows only for questions and plans,** from the open tool call. A
permission prompt without the hook still looks like a running tool.

**The file watch is narrowed to live sessions.** Events under `projects/` count only in a folder
that holds a live transcript, and desktop index events only for a live session's id. New
sessions arrive through the registry first. Dropped events are counted in
`WatcherStats.ignoredEvents`.

**One stat per file per rebuild.** `FileCache.stat` takes a file's stats at most once between
sweeps, so the cache, the tail reads and the ledgers share them. Without that, the ledger's
extra stats made the watcher about 30% more expensive under the heavy fake home.

**Measured, watcher alone, 30 s windows against the fake home** (`main` vs this branch, % of one
core): heavy load (`--sessions 12 --agents 8 --busy 0.75 --rate 20`) 3.2–4.2% vs 3.6–3.9%, level
within noise. With 20 writes/s to a project with no live session (`--noise 20`): 2.1–2.5% vs
1.6–1.8%, with rebuilds down from 118 to 76 and ~560 events ignored. The first build reads each
live transcript in full (166 ms for 12 real sessions); later rebuilds took about 2 ms.

**Recordings are anonymized at write time** (`tools/record.ts`, `src/watcher/anonymize.ts`).
Raw snapshots are never written. Names come from fixed word lists, in order of first appearance,
so a recording is deterministic and keeps its structure. Times are shifted so it starts at
2030-01-07 09:00 UTC. MCP tool names become `mcp`, because they name the servers someone uses.
Custom agent roles get invented ones. `?replay=<name>&speed=8[&loop]` plays `fixtures/<name>.ndjson`
in the scene. Every time in a frame moves by the same amount, so durations stay as recorded.

**New `Snapshot` fields are optional,** so hand-built snapshots (the demo, the other streams'
tests) and older recordings still type-check.

## 2026-11-21: releases (R1)

**Unsigned Apple Silicon builds, installed by a script.** There's no Apple Developer account yet.
`install.sh` fetches the release with `curl`, which doesn't set the quarantine attribute, so
Gatekeeper never checks the app. Apple Silicon still refuses any binary with no signature at all,
and Electrobun's build gives every binary an ad-hoc one (Bun's own is Developer ID signed);
`tools/package-release.sh` fails the release if any Mach-O in the bundle is unsigned. Intel isn't
built: the script says so and exits.

**Release layout.** A pushed `v*` tag runs `.github/workflows/release.yml` on a `macos-15` runner
and publishes a release (a pre-release when the version has a `-`). Any other run, including a
manual one, makes a draft, so only a tag can publish. The version comes from the tag and reaches
the app through `BUSYBODIES_VERSION` in `electrobun.config.ts`. Each release holds:

| File | For |
|---|---|
| `Busybodies-macos-arm64.tar.gz` | `install.sh`. Plain gzip, because macOS's `tar` can't read zstd without Homebrew's `zstd` |
| `Busybodies-macos-arm64.dmg` | A browser download. Electrobun's self-extracting wrapper app |
| `stable-macos-arm64-update.json`, `-checksum.json`, `-Busybodies.app.tar.zst` | The updater. Electrobun fixes these names |
| `SHA256SUMS` | `shasum -a 256` of every file above |

The asset names carry no version, so `releases/latest/download/<name>` always resolves, for the
script and the updater alike, without the GitHub API or its rate limit.

**Checksums.** `install.sh` downloads `SHA256SUMS` from the same release and refuses an archive
whose line doesn't match. This catches a broken or swapped download, not a compromised release:
the sums sit next to the files they cover. Signing is what would cover that.

**The updater follows the latest GitHub Release.** `release.baseUrl` is
`https://github.com/MrMint/busybodies/releases/latest/download`, which skips drafts and
pre-releases, so testers on a pre-release don't drag everyone else along.
`src/bun/updates.ts` checks 30 s after launch and every 6 hours, downloads, and applies (the app
restarts; it only shows a scene, so nothing is lost). Dev builds never update, and
`BUSYBODIES_NO_UPDATE=1` turns it off. Delta patches are off (`generatePatch: false`): a full
update is ~32 MB, and patches would add a file per previous version to keep in step.

**Tested unsigned, on macOS 27.0.1, from GitHub.** Build 0.0.3-test.1 was installed with
`install.sh` from a draft, with its update URL pointed at a temporary pre-release holding
0.0.3-test.2. 34 s after launch it had downloaded the update, replaced itself in
`/Applications` and relaunched as 0.0.3-test.2 with its window open. Electrobun follows GitHub's
redirects to the asset host. Neither the installed nor the updated app carried
`com.apple.quarantine`, so Gatekeeper never re-checks an update. What it fetches:
`<baseUrl>/stable-macos-arm64-update.json`, then `-checksum.json`, then the `.tar.zst`, each
with a cache-busting query.

**The `.dmg`'s app is re-signed ad hoc.** Electrobun signs only the launcher binary, which
leaves the bundle's signature invalid ("code has no resources but signature indicates they must
be present"). Downloaded through a browser, macOS then calls the app **damaged** and offers only
Move to Trash, with no Open Anyway. `tools/package-release.sh` re-signs the `.dmg`'s wrapper
app with `codesign --deep --sign -` (and checks it with `--strict`), so `spctl` gives a plain
"rejected" and the app gets the normal unverified-developer block that Open Anyway clears. The
install archive and the update bundle are left as Electrobun built them: they're never
quarantined, and re-signing the update bundle would change the checksum the updater checks.

**Adding signing later is configuration only.** The workflow's signing and notarization steps
run only when their secrets exist:

- Signing: `MACOS_CERTIFICATE` (a base64 Developer ID Application `.p12`),
  `MACOS_CERTIFICATE_PASSWORD`, and `MACOS_DEVELOPER_ID` (the identity, e.g.
  `Developer ID Application: Name (TEAMID)`). The workflow imports it into a temporary keychain
  and sets `BUSYBODIES_CODESIGN=1` and `ELECTROBUN_DEVELOPER_ID`.
- Notarization, on top: an App Store Connect API key as `APPLE_API_KEY` (the `.p8` text),
  `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`, passed to Electrobun as `ELECTROBUN_APPLEAPIKEY*`.
- Cost: the Apple Developer Program, US$99 a year. Then the `.dmg` opens without the extra step,
  and the README's Open Anyway note can go.

## 2026-11-21: sass (S5)

**The line bank is typed data in `src/scene/sass/lines.ts`.** The board's 81 lines are kept word
for word, with their kind, speaker role and timing note. A unit test parses
`design/boards/Lines.dc.html` and checks the count and every line against it, so the two can't
drift. A board line with a name, number or time in it ("PR #219. Frame it.") becomes a template
(`PR #{n}. Frame it.`) and keeps the board's wording in `boardText`. 108 new lines make 189, with
at least 5 for each of the 22 triggers. A line whose placeholder has no value isn't used.

**Detectors are pure: `detect(prev, snap, now)`.** Events (a PR opened, a test going red, a hire)
fire once, on the change. On the first snapshot only events from the last minute count, so
opening the app doesn't replay the day. States (a wait, a long build, a nap, a stall) fire on
every call while they hold, with a magnitude in minutes or a count, and a key that stays the same
for the whole state. A session that vanishes while busy counts as a crash. "Finished, still open"
is a session idle with a PR up. A busy-to-idle change alone is just a turn ending. Cost is in
coffee cups: $8 a cup from the tool's cost record, or 100k output tokens a cup when there's none.

**Escalation is by tier.** A line's `min` and `max` bound the trigger's magnitude. The scheduler
picks only from the highest tier still on offer, so a wait moves on from "Whenever you are
ready." to "No rush. Some rush." at 2 minutes. A state is said again when it crosses a tier, or
after 8 quiet minutes.

**The scheduler takes turns.** It allows at most 2, 3 or 4 bubbles on screen as the camera zooms
in. New bubbles start 1.5 s apart, and each character keeps 45 s between its own. The same
character never says the same line within the hour, and nobody repeats a line within 10 minutes.
Repeats count by line, not by filled text. Lines over 30 characters show only from zoom 1.2 up,
or in the room the camera is on. Each choice hashes the seed, the trigger key and the time, so a
replay is the same every time. Nothing runs a timer: `Sass.nextWake(now)` says when to call
`tick` (a bubble ends, a queued line's turn comes, a wait reaches its next tier). It's undefined
when nothing is due, so an idle office with no bubbles up can sleep.

**Signs: triggers put sign lines up, and counters take the slot back.** A trigger's sign holds its
slot for 2 minutes. After that, the counters own the room whiteboard ("Days since a test broke",
or the fail streak from 3), the room sign (the PR tally), and the kitchen sign (green builds
today). Room idle time drives the plant (`fresh`, `droopy` from 15 min, `wilting` from 30) and
the mug pile (one mug per 10 min, up to 6). These go out as `sign(slot, state)` too. The fridge
note is about the most pressing thing: the longest wait, then a long build, a fail streak, deep
scouts, a stall, late-night work, a finished session left open, then a long nap. Its minutes are
rounded to 5, so it doesn't change every minute. Slot names follow the office:
`room:<project>:sign|board|desk|plant|mugs`, `meeting:*`, `kitchen:sign`, `fridge`, `ticker`. The
wiring maps the props the office doesn't draw yet, or drops them.

**`tools/sass-dump.ts` replays a fixture and prints who said what, in UTC,** so the voice can be
reviewed by reading. `--zoom 0.4` shows what the whole-office view would show.
## 2026-11-21: the open-floor office (S2)

**The floor plan is stable by memory, not by formula.** `FloorPlan` (`src/scene/office/layout.ts`)
remembers which room each project has and which desk each session has, and folds each snapshot
into that. Adding or removing a session never moves anyone else; unit tests replay random days of
arrivals and departures to hold this. The rules:
- A hallway runs left to right at y = 0. Rooms sit in two bands, above and below it, anchored at
  the hallway: a room above grows upward, one below grows downward. A room gaining a row of desks
  moves no one, in it or next to it.
- The common areas come first in each band: the meeting room above; the lobby (with the nap pod)
  and the kitchen below. They had to come first: anything placed after a project room would move
  when the room before it was built.
- A new project takes a vacant room it fits in, or a new room at the end of the shorter band. Its
  width (2 to 4 desk columns, about √n for n sessions) is fixed when it arrives, so rooms never
  slide along the hallway. A busy project grows rows instead: two or three for a normal day, eight
  for 30 sessions in one project.
- A session takes the first free desk, row by row from the hallway side. A side session takes the
  free desk nearest the one that started it. Freed desks are not compacted; empty back rows are
  trimmed (never below two). A room whose last session ends becomes vacant ("for lease") until a
  new project needs one its size.
- Sizes, in world pixels, follow the FloorBusy board: a desk cell is 220 × 170, the back wall 110,
  the hallway 130. A two-row room is 460 tall.

The cost: the office grows wider with projects (about 3.3:1 for 30 sessions over 10 projects), and
a project that vanishes and returns may get a different room. A long day with many short-lived
projects leaves vacant rooms, which new projects reuse.

**Office to character: a slot, and nothing else** (`src/scene/office/slot.ts`). The office
decides where everyone stands and hands each character a `Slot`: feet position `x, y` in world
pixels, a `depth` (draw order; the feet's y unless a spot says otherwise, like the nap pod's
window), and a `facing` (1 right, -1 left). It also hands over a `Who`: key, lead or crew, role,
mood, size and a colour key. A `Character` is a view (a Container the office adds to its
depth-sorted layer), `update(who)`, `place(slot)`, `tick(dt)`, `animating`, `inspect()` and
`destroy()`. The office never draws a body and the character never reads the snapshot. The
placeholder Busybody implements it (`src/mainview/placeholder.ts`); the rig (S1) replaces it by
passing its own `CharacterFactory` to the `Office`.

**Who stands where is provisional** (`src/scene/office/placement.ts`), until the director (S4)
owns it: leads at their desks; running and stalled agents around the desk (keeping their spot
while they stay); a running reviewer in the meeting room; finished agents in the coffee queue,
then the nap pod, the water cooler and the sofas.

**Static layers are cached, at the camera's scale.** Each room's floor, walls and wall items are
one cached texture (`cacheAsTexture`), and the hallway is cached in 640-pixel chunks. Furniture is
drawn once per kind and baked into a texture that every desk, chair and plant shares, so they
batch. Desks, furniture and characters share one container sorted by depth (zIndex = feet y), so
people in front cover people and desks behind them. When the camera settles at a new stop,
everything baked is re-baked at the new scale (in steps: 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8 times
the device resolution, and never over 4096 pixels a side), so a zoomed-in desk stays sharp. A sign
change re-bakes only its own room.

**The camera has three stops**, the whole office, a room and a desk, with smooth moves between
them (650 ms, eased, zooming in log space). Click a room to zoom to it, then a desk in it to zoom
to the desk; click outside the rooms (or press Escape, 0 or Home) for the whole office; n / → and
p / ← step through the rooms in reading order. A move raises the frame cap to 60 fps for its
length only, and an idle office goes back to zero frames when it ends. Clicks are resolved against
the layout data from one stage listener, so nothing in the scene is hit-tested.

**Sign slots are named** (`<area id>:sign`, `:board`, `:frame`, for example
`room:lanternfish:board` or `kitchen:sign`), and take `{ title, body }` through
`Office.setSign` (also on the inspector). The common areas have default lines from the line bank;
the sass engine (S5) writes the rest.
