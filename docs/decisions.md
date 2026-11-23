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

**Release layout.** `.github/workflows/release.yml` builds on a `macos-15` runner and publishes a
release (a pre-release when the version has a `-`). Since 2026-11-22 only the changesets workflow
publishes, by calling it once the `v*` tag exists ("releases with Changesets", below); a manual
run makes a draft. The version reaches the app through `BUSYBODIES_VERSION` in
`electrobun.config.ts`. Each release holds:

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

**Wired through S4's seam** (`src/scene/sass/voice.ts`, `src/mainview/main.ts`). `Voice.run(snap,
now, view)` feeds the engine and draws through `Office.say(key, text, kind)`, using the director's
keys (`s:<session>`, `a:<session>:<agent>`). It takes each bubble down with `say(key, undefined)`
when its time is up. Sign lines go to `Office.setSign(id, {title, body})`: the first sentence is
the title, in capitals, and the rest is the body ("NOW SERVING: NOBODY" / "Your number: 1."). A
slot the office doesn't draw (the plant, the mugs, the desk note, the fridge, the ticker) is kept
in `Voice.dropped`, for the inspector and later art. A `leave` event from `Director.on` takes the
leaver's bubble down. The app's one wake timer now runs to the earlier of the director's wake and
the voice's. Bubbles are static, so each is one on-demand render going up and one coming down.
They never start the ticker. `?toolvoice` brings back the director's placeholder voice.

**A live office settles for 6 s before naps and waits talk** (`settleMs`). Events still speak at
once. Without that, opening the app on a sleepy office greets you with a burst of bubbles. A
frozen scene (shots, tests) settles at once, and `?settle=<ms>` sets it. The walk e2e holds the
voice back so its quiet window measures the walk alone. The voice has its own e2e: an idle office
talks with no ticker and no animation frames, at most two bubbles at office zoom. Clicking into a
room re-runs the voice at the zoom the camera is heading for, so the longer lines can show there.

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
change re-bakes only its own room. Labels over the live scene (room tabs, desk cards, bubbles) are
bitmap text from one shared glyph atlas, so they batch with the furniture and a bubble that
changes on every tool call uploads nothing.

**Draw calls are the budget to watch, and characters dominate it.** Counting WebGL draws per busy
frame in the FloorBusy demo: the placeholder office on main took 28; the new office with
vector-drawn placeholder characters took 69, 50 of them the characters (a stroked Graphics
doesn't batch). With each placeholder look (colour, size, mood) baked into a shared texture, a busy
frame is 22 draws, of which the whole office is about 19. The rig (S1) should keep characters
batchable the same way: parts from one atlas.

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

## 2026-11-21: the mochi rig (S1)

**A character is one `Puppet` of about 18 sprites from one shared atlas** (`src/scene/rig/`). Back
to front: shadow, chair, two legs, then the torso (body, costume front piece, two cheeks, a face
of two eyes, two brows and a mouth, something worn, the hat), a desk, then an upper layer that
shares the torso's transform (a parcel or sign held in front, and two arms of upper arm, forearm,
hand and held prop), and one effect. Arms ride their own layer so a desk can sit between the body
and the hands on its keyboard. The office (S2) turns the rig's own desk off with `desk: false`
when it draws real furniture. Feet up move the legs in front of the desk.

**Rig units.** The mochi body is 100 wide and 70 tall; the origin is the ground between the feet,
y down; angles are degrees, clockwise positive, as in the CSS boards they were ported from. A
puppet at `scale = size / 100` is `size` pixels wide. `ANCHORS` in `theme.ts` holds every
attachment point (eyes, brows, shoulders, legs, the body's `base` height). Shoulders sit out by
the cheeks, as `Shapes` warned; hats ride the torso, so they stretch with its squash.

**The atlas is painted at startup, not shipped as an image.** `Atlas.build(renderer, theme)` runs
every painter in the theme into a Graphics, shelf-packs them (tallest first, then by name, so the
layout is stable) into a strip 1024 rig units wide with 3 units of padding, and bakes the lot
with one `generateTexture` at 2 pixels per unit, with mipmaps for the whole-office zoom. Each part
is a sub-texture whose `defaultAnchor` puts the painter's own origin at the sprite's position, so
a painter draws in its part's natural space (a hat above the body's top, a prop above the hand)
and no offsets live anywhere else. One texture source means a crowd batches into a few draw
calls.

**Part names are `<layer>/<variant>`**, and the rig asks for nothing else:
`body/<role>`, `hand/<role>`, `hat/<role>` (plus `hat/lead-cup`), `front/<piece>` (tie, apron,
kerchief, straps, bowtie, badge, scarf), `wear/<thing>` (glasses, binoc), `eye/<eyes>`,
`mouth/<mouth>`, `held/<prop>`, `prop/<box|pls|desk|chair>`, `fx/<effect>`, and the singletons
`shadow`, `leg`, `arm/upper`, `arm/fore`, `brow`, `cheek`. The variant names are the vocabulary
in `vocab.ts`, the same words frames use.

**A theme reskins parts and never poses.** A `Theme` is a palette plus a painter per part name;
`paperTheme(palette)` is the only one so far. To reskin, supply other painters or colours for the
same names and rebuild the atlas. Frames, poses, springs and anchors don't change. Two parts are
painted white and tinted at runtime instead of baked per colour: the lead's tie and headset cup
take the project accent, and the cheeks take the frame's blush or pallor. Everything else bakes
its colour in.

**A frame is a parameter object; poses are written in the boards' token form.**
`parseFrame("e-wide al-up hr-trophy")` fills a complete `Frame` (`eyes, look, brows, cheeks,
mouth, armL, armR, feet, body, props {left, right, front, back, wear}, fx, spot`), anything not
named at rest, and throws on an unknown token so a typo fails the unit tests. Frame lengths are
in the boards' 130 ms beats. A pose adds its trigger, rarity (1/20 for the rare waiting pose),
lines, `loop` or `once`, the roles it suits, whether it is a slacking habit, and a partner part
for two-handers.

**Continuous parts spring, swapped parts pop.** Every numeric channel (shoulders, elbows, hands,
legs and lifts, body x/y/rotation/squash, where the face looks, brows, cheeks, a partner's spot)
chases its target on a damped spring: limbs bounce once, the body is softer and wobblier, the
face is quick. Textures that swap (eyes, mouth, held props, effects) pop in on a springy scale.
Springs integrate in fixed 1/240 s sub-steps, so the same elapsed time gives the same motion at
30 fps, 60 fps or in `step(n)`.

**Render on demand still holds with puppets.** A puppet reports `animating` while its pose has
frames to come or any spring is moving. `loop` poses (busy work, waiting, a long build) animate
until replaced; `once` poses play through, hold their last frame and settle. A character found
idle starts already mid-habit (`at: "end"`), so an idle office draws nothing; one that goes idle
while watched plays its habit once, then stops. The director (S4) decides when to replay a habit.

**Variation comes from the id.** `choosePose(trigger, id, role, n)` picks the role's own pose
when there is one, otherwise one of the trigger's poses by hash, and rolls the rare variant per
occurrence `n`. Loops start at a phase hashed from the id so a crowd doesn't type in step.
`roleFor(agentType)` maps the agent tool's free-text types onto the seven costumes.

**Review by reading first.** `bun tools/pose-dump.ts [pose]` prints every frame's non-rest
parameters; `bun tools/pose-sheet.ts` renders every pose's frames into `docs/rig/pose-sheet.png`
from `?sheet`. `?demo=crowd` (200 characters: 40 sessions of a lead and four crew) and
`?demo=crowd-idle` are the load test the e2e budgets run against.

**Measured cost of the rig.** Alternating `tools/profile.sh` runs on one machine, heavy load
(`--sessions 12 --agents 8 --busy 0.75 --rate 20`), % of one core, Bun / WebContent, with the
profiler reading the app's Bun process (not the launcher): `main` 7.1 / 16.7 and 6.9 / 12.4; the
rig 6.5 / 20.6 and 7.1 / 20.8. Idle with the rig: 0.4 / 0.0. The rig adds about 6 points of
WebContent when ~100 characters animate at once; Bun is unchanged, and an idle office still draws
nothing. In Chrome at 2x DPR, 200 mixed puppets take a median 1.9 ms per frame (0.5 ms of it
ticking), so most of the extra is drawing ~25 sprites per character instead of one placeholder
shape. Accepted for now; cuts for later: skip springs and transforms on settled puppets mid-loop,
lower the frame rate for characters far from the camera, and drop hidden parts from the tree.

**`freeze()` rewinds poses.** Freezing the inspector replays every character's current pose from
its first frame, settled, so `step(n)` gives the same frames however long the page ran first.
Slow CI renders a few real frames before a test can freeze.

**In the office, the rig is the character factory.** `rigCharacters(atlas)` implements S2's
`Character` slot (`src/scene/rig/character.ts`): a lead wears the lead costume, crew wear
`roleFor(role)`, the tint key picks the lead's accent, `size` is the height of a standing mochi
(85 rig units, ground to the top of the body), and `facing` mirrors the puppet. The office draws
the desks, so the rig's own stays off. `?placeholders` swaps S2's baked stand-ins back in, for A/B
profiling. The slot gains an optional `rewind()`, which the inspector's `freeze()` calls.

## 2026-11-21: the director (S4)

**The director is pure: `direct(prev, snap, now, floor) → { world, events, wake }`**
(`src/scene/director/direct.ts`). The brief's three arguments gained a fourth: the floor plan
for this snapshot (S2's layout), because spots and walks are positions on it. The world holds
one `Actor` per character: its named spot (`desk`, `crew:3`, `meeting:seat:0`,
`kitchen:queue:1`, `door`) and slot, its pose (and which half of a two-hander), whether that pose
is acted (a one-off, held until its frames run out) or standing (the mood's), any walk in
progress, and the signals it last saw. Events say what changed: `arrive`, `leave`, `walk`,
`pose`, `handover`, `review` start and end, `waiting` start and end. `wake` is the next time the
world changes with no new snapshot (an acted pose ends, a habit rotates, a build turns long, a
walker leaves the stage). The app sets a timer for it, not frames, so an idle office still costs
nothing between changes.

**Spots are sticky.** Leads stand at their desks. Crew keep their spot around the desk while they
stay. A running reviewer takes a meeting-room seat. Finished agents fill the kitchen queue, the
nap pod, the cooler, the rest of the queue and the sofas, in that order (S2's provisional order).
Each keeps its spot from one snapshot to the next, so an unrelated change moves nobody; a unit
test holds this.

**Signals map to poses, in priority order.**
- Stalled → the cobweb; finished → `done`; waiting on you → the paddle, with the rare "please?"
  rolled once per wait from the id and how many waits came before.
- Acted, on a new signal: a new hire → the handover, the boss leading and the hire playing the
  partner half; a PR opened → the celebration with the first busy teammate at the desk, else the
  solo PR pose; a failed command or test → the failed-test pose; a compaction → the stretch.
- Busy: a shell command running 20 minutes or more, the same command 3 times in a row, or an API
  retry in the last 5 minutes → grumpy; any other tool running 2 minutes or more → thinking hard;
  otherwise the role's own work (typing for leads, hammering for builders, and so on).
- Idle → one of the seven slacking habits: `HABITS[(hash(key) + turn) % 7]`, where `turn` counts
  10-minute spans since the character went idle.

On the first snapshot, only events from the last minute count as news. A character found idle,
stalled or done starts already played through and settled.

**Walks never cross a wall** (`src/scene/director/paths.ts`). Rooms above the hallway are open
along it; rooms below put their back wall on it, so a walk goes through that wall's door. A walk
between areas leaves its room, follows the middle of the hallway and enters the other room. A
walk inside a room is a straight line. Speed is 170 world pixels per second, between 0.6 and 9
seconds a walk. New sessions walk in from the lobby door. A new hire whose job is elsewhere (a
reviewer) starts at its desk and walks there. Anyone gone from the snapshot walks out through the
lobby door, then leaves the stage. The app raises the frame cap to 60 while anyone walks, as for
a camera move, and drops back to 30 (or to nothing) when walks end.

**The office takes a cast and characters take cues** (interfaces widened in
`src/scene/office/slot.ts`). `Office` gained a `cast(snapshot, floor) → Placed[]` option, which
replaces its provisional placement. `Placed` gained an optional `cue`, and `Character` gained
optional `act(cue)` and `moving`. A cue is a pose, which half of a two-hander, loops, start or
end, the spot's name, and maybe a walk (points, ms, exit, elapsed). The rig's character plays the
walk cycle (a new `walk` pose in the rig), faces the way it goes, keeps its own depth as it
moves, then plays the cued pose; it fades out at the end of an exit walk. Without a director, the
office behaves as before.

**The sass seam.** `Director.on(listener)` publishes every batch of events with the world.
`Office.say(key, text, kind)` draws a said or thought bubble over a character until it says
something else or `undefined`; bubbles follow walkers. Signs go through `Office.setSign` (S2).
The built-in voice (`placeholderVoice`) bubbles each busy lead's current tool, as the office did
before; S5 replaces it.

**Waiting on you is loud.** The waiting room's outline pulses yellow, and a yellow pill in the top
bar counts the sessions waiting. Both clear when the wait does. The pulse animates only while
someone waits, and the waiting pose loops then anyway.

**`?demo` plays a day.** The FloorBusy morning is followed by five beats a few seconds apart:
- a reviewer is hired and walks to the meeting room, and a session arrives
- a session waits on you while its verifier's test fails
- the release opens a PR and celebrates; a long-finished agent goes home
- the wait is answered, the review ends, and a session closes and its lead leaves
- a long build makes someone grumpy

`?demo=day-N&frozen` jumps to beat N for screenshots (`tools/shoot.ts` has a state per beat).
Frozen scenes and the named demos (`idle`, `one`, `thirty`, `crowd`) stay still, as before.

## 2026-11-21: polish (S6)

**Busybodies lives in the menu bar.** A tray icon shows the office's overall mood as a mochi face:
someone waiting on you, else busy, else all idle (`src/bun/mood.ts`, unit-tested). The faces are
template images (black on clear, eyes cut out) so macOS tints them for light and dark menu bars;
`tools/tray-icons.ts` draws them into `assets/tray/`, which the build copies into the bundle's
views. Its menu: a one-line summary, Show office, Compact mode, About, Quit. Closing the office
window no longer quits the app (`runtime.exitOnLastWindowClosed: false`); Show office opens it
again.

**Compact mode is a second window, not a resized first one.** It is frameless (`titleBarStyle:
"hidden"`), transparent, always on top and on every Space, 440 × 300 in the top-right corner of
the main display. It loads the same scene with `?compact`: a transparent background (the office's
dark base floats on the desktop), a slim top strip to drag it by (Electrobun's
`electrobun-webkit-app-region-drag` class), and buttons to open the full office or hide it. Both
windows get every snapshot. Turning compact mode on hides the office window, and turning it off
brings the office back. Toggle it from the tray or with ⌘⌥B. ⌘⇧B was the first idea, but it is
Chrome's bookmarks-bar shortcut, and a global shortcut would steal it.

**Empty states are never blank.** With no sessions, the office keeps its common areas, a "night
watch" naps in the lobby's pod (the office adds it when the cast is empty), and a paper sign says
nobody's in. When the agent's home folder doesn't exist, the sign says no coding agent was found,
names the folder it looked in, and mentions `BUSYBODIES_AGENT_HOME`. The webview asks the Bun
process for that (`status` on the RPC), and asks again whenever the office empties, since the
folder can appear later. `?demo=empty` and `?demo=nohome` show both.

**About says what is read and what leaves the machine,** in plain words: the agent's own local
files, read-only; nothing you're working on leaves; the only network request is the update check.
The tray, the top bar's "?" and `?about` open it.

**The README's GIF is recorded, not captured.** `tools/record-gif.ts` steps the frozen `?demo`
scene frame by frame through a camera tour, so it doesn't depend on the machine's speed, and
encodes it with ffmpeg (800 px, 12 fps, 128 colours: about 3 MB). Every text the frames draw goes
through `tools/scan-private.sh`, which now also takes a list of files, before the GIF is written.

## 2026-11-21: the full check and the 0.1.0 candidate (S6)

**The full suite passes** on main with every stream in: `tsc`, 144 unit tests and 25 e2e tests
before S6's step-5 fixes, then 26 e2e tests with the leak test below.

**A scene soak found a leak, now fixed.** `tools/soak-scene.ts` replays a recorded busy day
(`fixtures/busy-release`) on a loop at 8× in headless Chrome and samples the JS heap (after a
forced GC), live WebGL textures and characters every 30 s. Over 30 minutes the heap grew from 7
to 530 MB, about 15 MB a minute; a heap-snapshot diff showed WebGL buffers and their array data
piling up (732 buffers in 90 s). The cause: the office destroyed bubbles, labels, desk cards and
room tabs with `destroy({ children: true })`, which keeps each Graphics' own `GraphicsContext`
and its GPU buffers (the PixiJS skill warns about exactly this). Every office teardown now goes
through `drop()`, which adds `context: true`. After the fix, the same 30 minutes: heap 7.2 MB at
start, 15.3 MB at the end (+3.1 MB after a 5-minute warm-up, a slow drift worth watching),
textures flat at 43, 18,810 renders. An e2e test holds live WebGL buffers flat under replay; it
saw 58 new buffers in 12 s before the fix.

**The app soak shows no growth in the Bun process.** `tools/soak.sh 30` ran the dev app for 29
minutes against a fake home (8 sessions, 4 agents each, half busy, 5 tool calls a second, plus 20
writes a second to a dead project). The Bun process started at 105.5 MB, peaked at 117.1 MB and
ended at 78.9 MB. The webview's numbers from that run mean little: with the screen locked, macOS
stops drawing a hidden window (its WebContent used under a second of CPU), which is why the
scene soak runs in headless Chrome. The machine was loaded (load average 60–120 from another
project), so only memory was measured, not CPU.

**The CPU profile is deferred.** `tools/profile.sh` needs a quiet machine: the other project's
load drowns a few percent of one core. S6 waited from 20:07 to 22:07, checking every 10 minutes,
for a load average below 10. It read 96, 95, 123, 318, 371, 280, 267, 402, 217, 72, 34, 29 and
26, and never got there. The last trustworthy busy numbers are still S2's, from before S1–S5
landed: one clean pair at default load, main 5.4% Bun / 10.6% WebContent against the new office's
5.1% / 8.1%. Run `tools/profile.sh` idle and busy on a quiet machine before the next release, and
record the numbers here.

**Installing a release on this Mac.** The 0.1.0 draft (a manual run of the release workflow; no
tag) installed with `install.sh` from its downloaded assets (`BUSYBODIES_DOWNLOAD_URL`), the
checksum matched, and the app reported 0.1.0. Its first launch never started, though: the
launcher sat in `_dyld_start` with nothing logged. Two causes, one fixed:
- The app's bundle signature was invalid (Electrobun signs only the launcher, as R1 found for
  the `.dmg`). `tools/package-release.sh` now re-signs the install archive's app ad hoc too (the
  update bundle is left alone, since the updater checks its checksum). A copy re-signed on this
  Mac then launched at once.
- The installed copy still carries `com.apple.provenance` (it was unpacked by a process macOS
  tracks), and its ad-hoc signature was made on the CI runner, so Gatekeeper treats it as
  downloaded, unverified code: `spctl` says "rejected", and the first launch waits for the user
  to allow it. R1's test, installed from a Terminal, didn't hit this. Approving it is a security
  setting for the owner, not an agent; signing and notarization (configuration only, see
  "releases") would remove the step. Until then the README's "Open Anyway" steps apply to the
  script install too on some setups.

## 2026-11-22: releases with Changesets

**Changesets decides the version.** A PR that changes what users get adds a changeset
(`.changeset/*.md`: the bump and a line for the changelog). On each push to `main`,
`.github/workflows/changesets.yml` gathers the waiting changesets into one release PR,
"Version Packages", which bumps `package.json` and writes `CHANGELOG.md`. Merging it is the
release: with no changesets left, the workflow runs `changeset git-tag`, pushes `v<version>`, and
calls `release.yml` with `publish: true`, which builds that tag and publishes. The notes are the
install line plus that version's `CHANGELOG.md` entry. A pre-release is Changesets' pre mode
(`changeset pre enter beta`): its versions carry a `-`, so `release.yml` marks them pre-releases
and the updater skips them.

**Why a call, not a tag trigger.** A tag pushed with the workflow's own token starts no other
workflow, so `release.yml` no longer listens for tags; and a token that could start one would run
it twice. The changesets workflow passes its secrets on (`secrets: inherit`) for signing.

**The package is private.** `privatePackages` is on in `.changeset/config.json`, because
Changesets 3 skips private packages by default. Nothing goes to npm: the "publish" step only
tags.

**The status comment is advice, not a gate.** `.github/workflows/changeset-status.yml` comments
on each PR with what it would release. Docs-only and tooling-only PRs need no changeset, so a
missing one doesn't fail the PR. A fork's PR gets no comment (its token is read-only).

**The release PR comes from a GitHub App.** GitHub doesn't run workflows on a PR opened with the
default token, so the release PR's checks would never report. The changesets workflow instead
mints a token from a GitHub App installed only on this repository, with Contents and Pull
requests write. Its client ID is the `CHANGESETS_APP_CLIENT_ID` repository variable and its private
key the `CHANGESETS_APP_PRIVATE_KEY` secret. An App over a personal token: its key doesn't expire
(each run's token lasts an hour), the release PR, commits and tags carry a bot's name rather than
the owner's, and it isn't tied to a personal account. Without the variable the workflow falls back
to the default token, and the owner merges the release PR by bypassing the required checks, which
is safe because every change in it already passed CI on `main`. The repository must also allow
GitHub Actions to create pull requests (Settings → Actions → General).

## 2026-11-22: a busy crew

A release session with six builders looked like six copies of one loop: every busy builder fell
through to "the role's own work", hammering. The crew now acts out what it is doing, from signals
the snapshot already carries.

**Builders act out the tool in hand** (`src/scene/director/work.ts`). A running test is poking it
with a clipboard; any other running shell command is tinkering; Read and web fetches are reading
the blueprint; Grep, Glob and LS are rummaging with a magnifier; Edit and Write are hammering. A
new kind shows only after the last has held for 6 seconds, so a burst of tool calls doesn't
flicker the pose (a wake is booked for when the hold ends). Only builders, for now: the other
roles' own poses already say what they do. The new poses take the `working` trigger, so
`choosePose("busy", ...)` still gives a builder the hammer.

**Each busy loop runs at its own pace.** The puppet gained a tempo: frames run faster or slower,
springs keep real time. It is 1.25 when the character wrote in the last 15 seconds, 1 up to a
minute, 0.8 after, times a ±8% share from its id so a crew never falls into step (the loop phase
was already picked from the id). The cue carries the tempo, but its key doesn't, so a new pace
never restarts a pose.

**Bad news makes the crew look up.** A builder's red test plays `thumb` (it hits its thumb
mid-swing) instead of the failed-test pose, and every other busy crew member in the session
plays a short `glance`. A teammate finishing gets the same glance.

**The lead walks its rounds.** A busy lead with two or more busy crew around its desk, waiting on
them (a running Task or Agent call, or no tool call of its own for 15 seconds), spends 10 seconds
of every 40 standing just behind one of them, nodding (`inspect`), then walks back. Which crew
member, and where in the 40 seconds, comes from the lead's id and the clock, so it stays
deterministic. The walk is the director's ordinary spot change (`visit:<key>`).

**The crew's build grows on the desk.** A session with a builder, or with three or more crew, gets a
tower of bricks on its desk's left end, clear of the lead. It starts with a brick per busy crew
member (an office opened mid-release isn't bare), adds one per new edit seen (an Edit or Write
whose time differs from the last one counted, lead included), loses one to a red test (the
fallen brick lies at its foot until the next goes on), tops out at 30, and gets a flag when the
session has a PR. It is part of the desk's cached drawing and redraws only when it changes, so it
costs nothing between changes. Edits that land between two snapshots count once: the tower
measures activity, not an exact tally. The director now runs before the desks draw, so a desk
shows this snapshot's build.

**The crew talks shop.** A new sass trigger, `chatter`: a session with three or more busy crew,
busy in the last snapshot too (the hiring beat belongs to the big-crew line), gives one crew
member a line about every 75 seconds, picked from the session id and the time. It has the lowest
priority, so it never takes a slot from anything that matters.

**Zoomed into a desk, the crew's tasks show** as small tags under their feet (16 characters,
clipped). Only at the desk stop, where there is room to read them.

`?demo=release` plays all of this: six builders on six tools, edits landing every few seconds, a
red test at 15 s, a builder finishing at 24 s, the PR at 33 s. A two-builder "Hotfix: installer"
session shares the room, so brick runs show early (about 3, 6, 27 and 30 s).

**Acting is hands and tools, not squash.** The owner doesn't like animation that is mostly the
body squishing and stretching. Every pose was reworked so a limb and a prop do a recognisable job
with cause and effect: the hammer meets a nail on a sawhorse and the nail goes down a step per
strike; a blueprint unrolls, gets turned upside down and back; a wrench turns a nut a third per
stroke; a finger rocks a stack of bricks. The bodies `hop`, `stretch`, `low`, `squash` and `puff`
are gone (a walking step's rise, `bob`, replaced the hop), and a test holds every frame's body
scale within 5% of 1. Limb springs are stiff with almost no overshoot; a held tool trails the
swing a few degrees on its own `tool` feel. The work on the floor in front of a character is a
new part, `w-` (nails, a nut, a crate, a brick stack), in puppet space so it doesn't lean with
the body; its arm angles are solved against `WORK` in theme.ts, so moving a prop means solving
them again.

**Builders carry bricks to the build.** When a builder's new edit is counted, it may walk a brick
to the tower (`carry` as the cue's `walkPose`), set it on (`place`) and walk back; the brick
lands when `place` ends. One runner per session at a time, then a 20–28 s cooldown from the
session id. Every other edit (the lead's, other roles', a builder's during a run or cooldown)
adds its brick at once, so the tower still counts edits. A placed brick drops about 10 px and
settles; a red test tumbles the top brick off onto the desk. Both animate only while they move.

**The crew spreads out so its work shows.** The work on the floor sticks out about 40 px past a
character on the side it faces, and the old crew pattern (spots 60 px apart, ten around a desk)
hid nearly every bench behind a neighbour. Crew now stand in facing pairs, 124 px apart with their
work between them (`crewSpots` in office/world.ts): two pairs in the desk's own cell, then the free
cells it is lent. A free cell is lent to exactly one desk: the one it lies in front of, else the
one behind, else its left neighbour, else its right. A bare cell (its row has no desks) holds two
more pairs; a free desk's cell holds the two pairs in front of that desk. Past those, the old
tight pattern takes the overflow, so a very big crew still crowds. A crew spot keeps its name
when its cell is lent elsewhere or freed, so the director walks a crew member whose spot moved
even when the name is the same. The builder's brick lands on the tower when it leaves its hands
in `place` (the end of the last frame that shows it), and the tower's bricks are kraft shades,
the colour the builders carry.

## 2026-11-22: the living office, wave 1 (capture, stations, station acting)

The plan is `docs/plan-next.md`. Wave 1 ran as three parallel streams against a contract written
into code first (the snapshot fields in `model.ts`, the station kinds and pose names in
`director/stations.ts`, placeholder station poses), so they didn't collide.

**Richer capture, round two (stream A).** The ledger now fills `family`, `context`, `changes`,
`todos` and `tools` on sessions, and `family`, `changes` and `tools` on agents, from records the
transcripts already hold. Only counts and family names leave the watcher.
- `family` is mapped from `message.model` (the agent meta's `model` as a fallback); placeholder
  ids like `<synthetic>` are ignored, and the full id never leaves.
- `context.used` is the last response's input + cache-read + cache-creation tokens, read as text
  from the usage object on plain response records (no parse). The window comes from a small table
  in `src/watcher/models.ts` (1M for fable, opus and sonnet 4.6+ and haiku 5+; 200K for older
  models; 1M with a `[1m]` marker). An id the table can't place gets no window, so no meter: the
  window isn't in the transcript, and a wrong row makes a wrong meter. A compaction sets `used` to
  its `postTokens`, or clears it.
- `changes` counts distinct files (paths hashed in the watcher) and lines added and removed by
  successful edit calls, from the tool's own `structuredPatch` when the result has one, else
  estimated from the inputs (a Write over a seen file is a rewrite that removes what was last
  written there). It says "a lot" or "a little", not an exact diff. A session's numbers don't
  include its agents'.
- `todos` are status counts from the latest `TodoWrite`. `tools` counts calls and errored results
  in a trailing 60 s window by record time, so it decays through the 5 s poll.
- Measured on invented transcripts, the ledger reads as fast as before.

**Stations, trips and pace (stream C).** Each project room is 130 px wider, for a strip of shared
stations along its left wall: a copier, a QA stamp desk, a filing cabinet and a card catalogue.
They are counted from the hallway side, so adding or trimming desk rows never moves one; extras (a
second of a kind, one per four busy crew past the first four) only go on the far end while the
strip has room. The lamp left project rooms to make space.
- A busy crew member walks to the station for its work once that kind has held 6 s and is still
  the tool in hand (the copier and stamp desk only while a command is running), works there
  facing it at `STATION_REACH` scaled to its size, and walks back when it edits again.
- One user per station; up to two queue beside it (`queueWait`); the queue is served in the order
  it formed. Anyone who finds everything full stays at its bench.
- A long build at the copier kicks it; a red test at the stamp desk is a red stamp, then the thumb.
- Walks follow heat (`director/pace.ts`): a stroll, a jog (×1.3) for a write in the last 15 s or 8
  tool calls a minute, a run (×1.65) for 20 a minute or 8 with a recent write. The walk cycle steps
  at the same pace (`walkTempo` on the cue). The brick-run cooldown shrinks 3% per edit a minute
  above 4, to no less than 40%.
- **Walks run at 30 fps.** Only camera moves get 60, so a busy room full of traffic still holds
  the 30 fps budget; an e2e test holds a room with six walkers to it.

**The crew acts out the stations with hands and props (stream E1).** Each station pose reaches to
the station's working point (`STATION` in `src/scene/rig/reach.ts`, `STATION_REACH` in rig
units). The rig draws the parts the work moves at that point (the drawer that opens, the card
tray, the copier's lid, button, light, jam door and out-tray, the forms and their stamp marks, the
notepad, the outbox tray, the shredder's slot and pile), so every action shows its effect in the
same frame, while the office draws only the furniture's body, behind the character. The point is
about eye level for a mochi, so crew reach up (`bd-up`, a rise without scaling); it reads as small
crew at tall office counters. Arm angles are solved, not eyeballed: `solveArm` is the arm's
inverse kinematics, `REACH` records what each arm was solved for, and tests hold every one within
a unit of its point. Moving a station point or `STATION_REACH` means re-solving and pasting the
numbers into `ARMS`. A kick (`boot`) swings the leg out in front of the body so it reads.

Left for later: the web, outbox and shredder stations have poses but no furniture yet;
`copierKick` plays once and holds, so a long build shows one kick, not a running feud.

## 2026-11-22: the living office, wave 2 (metrics as things, hectic rooms, their acting)

Decided with the owner first (recorded in `docs/plan-next.md`): waiting sessions queue at a new
"your office"; model families get opinionated personalities (`director/traits.ts`); the tower
counts lines while brick runs count edits; themes keep the mochis. Wave 2 ran as three agents in
separate worktrees, merged here; where the branches met, the director's gait became one function
(the model's stride, then the heat's pace, then at least a run in a rush).

**Metrics as things (stream B).** The director turns the watcher's numbers into thing state in
theme-neutral words (`director/metrics.ts`); the office draws them (`office/props.ts`).
- Context is an in-tray at the rig's TRAY point: up to 16 sheets, sliding off past 80%; past 95%
  a busy lead plays `buried` and the rig draws that pile (the office hides its own).
- A compaction sends the lead with its pile to the room's shredder (one per room, against the
  right wall under the back wall, off the station strip) for two loops of `shred`.
- The tower counts lines added: a brick per 20, then six more per doubling past 200, capped at 30.
  Removed lines fill a skip; files touched fill filing drawers (one per ten); cups become mugs; the
  last test lights a red or green lamp. The small ones show only zoomed in.
- Todos are sticky notes on a wall planner over the station strip; a crew member (or the lead)
  walks each done note over (`stickyCarry`, `stickyPost`).
- Waiting leads queue at "your office", beside the lobby (the bottom band is now lobby, your office,
  kitchen), holding numbered tickets in the order their waits started; NOW SERVING shows the lowest,
  and the first one into an empty office rings the bell. The pulse and pill stay on the lead's room.
- Model families act out `traits.ts`: walk and pose pace, a beat before acting for deliberate
  models, fable's flourish; the family is plain text on the desk card.
- Props Graphics are forced into the batch, so a busy frame stays within 30 draws.

**Hectic rooms (stream C, wave 2).** A session's heat is its tool calls a minute (its own and its
running crew's) plus 2 per edit a minute. At 90 its room goes into rush, which ends below 60 and
never within 15 s of starting. In a rush every walk in the room is `rushRun` at a run, the hot
session's trips go after a 3 s hold, its brick-run cooldown halves, and its lead dashes for 6 s to
the newest red test, else to whoever has queued longest. Walks that start together in one area and
would come within 26 px are untangled: the later key sidesteps on the smallest detour that keeps
them apart (walks whose timing something else depends on keep their paths). A crew member back
from the filing cabinet or card catalogue walks its folder to a teammate whose work wants the same
station (`handOff`, at the rig's arm's-length distance, about 150 px for a 58 px crew member), and
that teammate skips the trip. A long build loops `copierFeud`. The strip gained a phone table (web)
and a mail cart (outbox) at a 52 px pitch, so six fit a two-row room; a PR is walked to the outbox
(`envelopeCarry`, `mailDrop`) before the celebration.

**Wave 2 acting (stream E, round two).** The placeholders became acting with hands and props: the
lead types behind a teetering in-tray, peers over it and loses its top sheet over the side; waiting
leads hold a numbered ticket, and the first in brings a flat palm down on a desk bell that dings; a
sticky note rides a fingertip to the planner and is pressed on with a thumb; the rush is a real run
with papers trailing; the PR's big envelope is carried proudly; a long build is a running feud with
a jammed copier (kick, spit sheet, toss, jabs); fable's flourish is a finger-gun. Each new working
point is a named constant in `rig/reach.ts` (TRAY, BELL, PLANNER, HANDOFF, AT.phoneBase), which the
office and director import rather than copy.

`?demo=release` now also buries the lead's in-tray by 9 s, compacts it to the shredder at 12 s,
walks todo notes to the planner, and sends two sessions to your office.

## 2026-11-22: the living office, wave 3 (the theme seam, the factory, arms that help)

The office's look and words now sit behind a `SceneTheme` (`src/scene/theme/`): colours, room
shells and wall items, a painter per furniture slot, desk props, the planner, the crew build's
piece and flag, the night watch, and the words (area names, default signs, NOW SERVING, the
planner's columns, the door plate). The layout and the director are unchanged; furniture kinds stay
slot names (`copier` is the build station's body in any theme), and areas keep the office's names
as their identity, so only the name tabs show a theme's words. The refactor was proved with
`tools/shoot.ts` shots before and after, diffed by `tools/shot-diff.ts`: pixel-identical except the
HTML waiting pill in the top bar, which differs between two runs of the same build anyway.

`?theme=factory` is the same cast in workshop bays, a conveyor aisle, a QA booth, a break room and
the foreman's office, with machines drawn as bodies under the rig's working points. Themes keep the
mochis (decided with the owner): `factoryTheme()` in `rig/factory.ts` repaints rig parts by name,
so every pose plays unchanged. The lead is a foreman in a white hard hat and a hi-vis vest, builders
wear striped hard hats and tool belts, scouts headlamps, explorers a harness and knee pads,
reviewers hairnets and safety glasses, verifiers a QA armband, designers a welding helmet flipped
up. The station parts the hands work become a stamping press, a parts bin, a bolt bin, a gauge
with pass/fail tags, a radio log, a loading-dock pallet, a crusher, a parts hopper and a shift bell,
each within a few rig units of the paper part, so the solved reaches still land (tested). Two parts
are factory-only (`leg/explorer`, `arm/upper/verifier`); the puppet uses them only when the atlas
has them.

Each bay has a robot arm on a rail at the back wall. It acts only on real events: it brings each
new piece to the crew build (the piece lands when it lets go) and lifts the PR's crate onto the
loading dock. It moves in short eased tweens and then stays still, so it costs frames only while
it moves; its plan is Pixi-free (`armplan.ts`) and unit-tested.

The tray's Theme menu saves the choice to `settings.json` in the app's data folder (new
`src/bun/settings.ts`) and switches both windows over RPC without a reload: a new rig atlas, the
office redrawn, signs the voice wrote kept. New windows open with `?theme=<saved>`, so the query
parameter stays the one entry point.

## 2026-11-22: lived in, wave 1 (off-screen freeze, life, calm mode)

Decided with the owner (recorded in `docs/plan-alive.md`): the frame budget's job is to cost
nothing when nobody is looking, not to keep a watched office still. **A hidden office makes zero
frames; a visible quiet office may live at up to 20 fps.** "Hidden" is WebKit's page visibility,
which covers a minimized window, one closed to the menu bar, another Space, a window fully covered
by others, and a locked screen (`src/mainview/visibility.ts`). Headless Chrome is always visible,
so the inspector's `setVisible()` fakes it for tests.

**Life** is an overlay on whatever pose plays: blinks (one in each ~4.6 s window, one in five a
double, 130 ms shut, only for open eyes) and glances (in about half of the 7.3 s windows, held 0.9
to 2.6 s, a few rig units). Both are pure functions of the character's id and its own life clock
(`src/scene/rig/life.ts`), and the clock moves only with ticks, so `freeze()`/`step(n)` give the
same frames on every load and `rewind()` restarts it. Life touches only the eye textures and the
look springs, never the body. `Puppet.gaze([x, y])` is the seam for directed looks: it replaces a
glance while set.

**Frame rates:** a camera move 60, acting (poses, walks, pulses, bricks, arms) 30, life alone 20
(`Office.acting` vs `Office.animating`). **Calm mode** (`?calm`, or the system's reduce-motion
setting) turns life off, and then a quiet office makes no frames, as before. The e2e tests that
hold "an idle office is silent" run in calm mode; new ones hold life at ≤ 20 fps and a hidden busy
office at zero renders.

Measure before the next release: `tools/profile.sh` idle with and without `?calm`, on a quiet
machine.

## 2026-11-22: lived in, wave 2, stream A (gaze and the social layer)

**The director points faces; the character does the geometry.** A cue now carries `lookAt`: another
actor's key, a world point, or the viewer. The character turns it into the face's slide in rig
units, from the direction between its eyes and the target's face in its own facing (`rig/gaze.ts`).
The vertical part counts for half (the floor is seen at an angle: lower on screen is nearer, not
below), the slide is clamped to the poses' own range (±5.5 sideways, 4.5 up, 5 down), and past 70%
of the side range the eyes go `side`. The aim replaces the pose's look and wins over life's glances;
a frame looking `downR` or `down` keeps its eyes on the work. The cast find each other through the
factory's map of characters by key, so a look follows a walker. The look isn't part of the cue's
key, so changing it never restarts a pose. While a walk starts, turns or plants (stream B), the
walk's own look wins.

**Who looks at whom** (`director/social.ts`, pure): a red test (or a teammate finishing) makes the
crew look at that teammate, rippling from the nearest (180 ms more per 60 px, capped at 1.5 s); the
foreman's round goes both ways; waiting leads watch the YOU door (not while ringing the bell); a
hand-off's taker looks up 1.5 s out and raises a hand (`handReady`) 520 ms before contact; pairs in a
two-hander or a celebration look at each other.

**Staging.** Crew beyond the spaced pairs stand in a loose arc in front of the desk facing the lead
(rows of six at a 34 px pitch, each row shifted half a place, the ends bent back 14 px); a spot
squarely behind another (within 16 × 24 px) moves to the nearest clear place, and a spot depends
only on the ones before it, so `crew:i` keeps its meaning. Finished crew in the kitchen's coffee
line pair up facing each other; only facing changes, so nobody walks for it.

**They notice you.** The director takes the viewer as an input (`View.back`). Back on screen after
45 s or more (not calm), idle leads and finished crew look up at you over three 260 ms slots, one
waves, and leads in your office's queue hold their tickets up; each return is noticed once per
actor. New poses: `lookUp`, `wave`, `ticketHigh`, `handReady`.

## 2026-11-22: lived in, wave 2, stream B (motion grammar)

**A walk has a start, a stride and a stop, inside its own ms.** For its first moment (200 ms, never
more than a fifth of the walk) the walker stays put, turns to face where it is going and looks
there; then the distance eases in over 150 ms, cruises, and eases out over 250 ms, arriving exactly
when `walk.ms` says, so bricks, folders and envelopes timed on arrival still land. Corners are
rounded by up to 18 px, inside the corner. The easing and rounding live in `director/paths.ts`
(`progress`, `pointAt`, `along`), so the director's `here()`, the dodges and the rig agree on where
everyone is; dodges sample the real paths, so the 26 px clearance is measured on the walk as drawn.

**Turns go through the front.** A change of direction is a 120 ms turn: the face comes round to the
front, the body flips at the midpoint, the face goes on to the new side, at path corners and when
arriving at a slot that faces the other way. On arrival the walker plants for a beat looking ahead.

**Loops break their own rhythm.** A looping pose may carry `beats`, variant passes exactly as long
as a pass, picked by `passBeat(id, pose, pass)` for a fifth to a third of passes, never the first
and never twice running (FNV-1a barely moves its top bits for a counting pass number, so the pick
runs through a finaliser). The typist stops to read with its chin on a hand, the builder checks its
work, the queuer rises to size up the one ahead.

**Idle habits live while life is on.** With life on, an idle character's habit rotates every one to
two minutes and plays again every 20 to 30 s, every change on a 5 s grid so a room of idlers wakes
the director together. Calm keeps the old rule (one habit, once, every ten minutes). The app
re-directs when life switches, so the change shows at once.

**Traits are acting, not latency.** Opus's pause is `consider` (eyes up, chin on a hand), sonnet's a
small `nod`, each exactly as long as the pause; haiku overlaps, its acted poses counting as over
160 ms early. Fable still just holds.

**Waiting gets worse.** At your office a lead goes from polite (`ticketPolite`) to tapping and
looking at the door after 45 s, to a sigh and a word with the one behind after two minutes (only
with someone behind), to a slump with the ticket drooping after five; each stage is a booked wake.

## 2026-11-22: lived in, wave 2, stream D (the office goes full office)

Decided with the owner: the construction gear is the factory's. The office's rig is its own theme,
`officeTheme()` in `rig/office.ts`, built on the paper rig and repainting parts by name as the
factory's does, so every pose plays unchanged; the factory still builds on the paper rig and keeps
the hammer, nails, sawhorse and bricks. Costumes are per theme through the part slots (`hat/*`,
`front/*`, `wear/*`).

Each office role reads at room zoom by hair or headwear: the boss's pompadour, headset and loud tie
(still the project's accent); builders' spiky hair, a pencil behind the ear and a tie flung over the
shoulder; the intern scout's ponytail and lanyard; the explorer's shades pushed up on gelled hair,
fleece vest and laser pointer; the reviewer's skewered bun, cardigan and glasses on a chain; the
verifier's green visor, pocket protector and sleeve garter (`arm/upper/verifier`); the designer's
beret, round glasses and black turtleneck (the one body repaint).

The work is paperwork on the same points: a giant stapler on a sheaf squashed and stapled a strike
at a time, on an in-tray stand; a crank pencil sharpener turned a third a stroke (a hole punch
doesn't turn, so it went in the banker's box); reams and binders for bricks; a green-bar printout
for the blueprint; a laser pointer for the torch. Tests hold every repaint within 6 rig units of the
paper part, so the solved reaches still land. The set: fluorescent panels, a motivational poster in
any bare stretch of back wall, a whiteboard flowchart, a cubicle wall with a family photo at each
desk's end, a ficus, a water cooler with paper cones, a mug wall in the kitchen, a recycling bin
for the skip, and a crew tower of reams and binders with a sticky-note flag; all baked, so the
draw-call budget is unchanged. Left: pose titles in poses.ts still speak of hammers and bricks.

## 2026-11-22: lived in, wave 2, stream E (compact becomes a live camera)

**Compact cuts between rooms instead of showing the whole office.** At 440 × 300 the whole office
made each character about 6 px; compact now frames one room at a time (about 22 px a character). A
pure shot picker (`director/shots.ts`) takes the director's events as news in a room, each room's
heat, whether anyone waits, a pinned room and the current shot, and returns a stop, a reason and a
hold. Priorities: waiting on you 100, red test 70, PR 60, rush 50, compaction 40, buried in-tray 30,
copier feud 20. News holds its room 20 s; between news the camera rests on your office while anyone
waits, else the busiest room, else the whole office.

**Hysteresis:** no cut within 5 s of the last; during a hold only news 15 or more points weightier
cuts away; news in the room on screen extends the hold without a cut; each room's news shows once;
a resting camera moves only after its own 20 s, to a room 1.5 times busier. The camera moves only on
a cut (650 ms at 60 fps); the hold's end is one more wake for the app's timer, so between cuts it
costs no frames. Off screen it collects news and never cuts; back on screen it cuts to the most
important thing. A strip of room tiles (DOM, 24 px) under the picture shows each room's state;
clicking one pins the camera there. The full office follows only with `?follow`.

## 2026-11-22: lived in, wave 2, stream F (sound, opt-in)

Sound is off by default. The tray's **Sound** and **Calm office** are checked items saved in
`settings.json` (only a literal `true` counts), reaching a new window as `&sound` / `&calm` and
later changes as the RPC message `settings`. Calm from settings ORs with reduced motion, and it
silences sound as well as stopping life. Earcons are synthesised in WebAudio from code (no samples,
nothing to license), vary only by a hash of the event id, and come from what the director already
says: a wait starting (a bell), a new fail (two notes down), a compaction (a paper rustle), a new PR
(a chime), a test trip that ends green (a stamp), a copier feud (a grind and a clunk). The first
world is a baseline, so opening onto a room that is already waiting doesn't ring. One of a kind per
4 s, 600 ms apart, at most 4 per 10 s, and the bell wins a tie. Pan follows the room's x on screen,
×1.6 zoomed into the room and ×0.5 in another. A quiet room tone per theme (office hum and keyboard
patter; factory drone and belt clack) runs from a timer, not animation frames, and only while live.
The AudioContext is made only once sound is on and the window visible, and suspends when hidden,
calm or off. Only the full office window plays sound. The tray menu is pure data (`bun/menu.ts`).
Left to check by ear in the app: levels, mix, and whether a tray toggle can start audio in
WKWebView before a click in the window.

## 2026-11-22: lived in, wave 2, stream C (light, material and labels)

**Light is baked, never animated.** Five phases from the local hour (morning 6–10, noon 10–15, late
afternoon 15–18, dusk 18–20, night; `office/daylight.ts`). `?hour=` pins one; otherwise a timer
re-lights the office as each phase starts. The light layer (`office/light.ts`) is a light map at 1/6
world resolution, multiplied over floor, furniture and cast: each area's ambient light for the
phase, vacant rooms and empty desks a shade darker, desk lamps (a pool appears when a session
starts), overhead light (round pools in the office, fluorescent strips per row in the factory).
Neighbouring rooms dim at a room or desk stop, so the focused room reads as a stage. Halos after
dark and sunlight patches under the windows are a few additive sprites where they fall. The map is
re-made only when its signature changes (phase, focus, layout, busy desks, occupied areas). A rush
room's flicker is the only moving light, on the life clock at the acting rate, only while life is
on. The pulse ring stays above the light so a waiting room shows at night. A theme supplies only
values (`SceneLight`), so the painters are untouched.

**The room's paper pass is baked with the room.** Floor material, a rug or work zone, the walls' sun
shadows, the view out of each window (sky bands, a skyline laid out by world x so neighbouring
windows agree, the sun in the east window in the morning and the west late in the day, the moon at
night), a hand-cut wobble on the shell, hash-generated grain and the room's painted name all go into
the room's cached texture; a room re-bakes on a phase change. Clouds are pane-sized sprites on the
life clock. Furniture casts stacked two-offset shadows in a layer under the depth layer. The lawn is
the renderer's background; the yard is baked sprites (many small vector shapes measured ~30% of a
software-rendered frame), with a little parallax on tree tops, so they move only with the camera.

**Fewer labels.** Floating room tabs cost 18 of the 29 WebGL draws in a busy frame. Room names are
painted in the hallway at each room's threshold (a vinyl decal with an arrow; a stencil in the
factory), and the room camera frames the threshold. Counts show as one pill for the focused room, at
room and desk stops; desk name cards only there too. Signs, whiteboards and frames hang between
`SIGN_TOP` and `SIGN_FOOT` (12 to 64 px down the back wall), clear of a back-row lead's head
(tested). A busy frame is now 13–17 draws in the office and 6–12 in the factory, at any hour.

## 2026-11-22: lived in, wave 2 merged

The six streams merged here in the order A, B, F, E, D, C, then main (#19, the settings cog). Where
they met: the walk's own looks (setting off, a turn, the plant) win over the director's `lookAt`
while they last; the director takes one options object (`{ life, view }`); coming back on screen
re-directs (life changes how habits run, the cast notices you, the compact camera starts over); the
settings sheet gained Sound and Calm office beside Theme, saved and synced with the tray through a
new `setToggles` RPC request. Every stream's e2e run was under a load average of 40 to 370 from the
others, where the unchanged base failed the same way; the suite was rerun here once the machine was
quiet.

## 2026-11-22: lived in, wave 3, stream I (story and continuity)

**A diary of counts and kinds, kept by the Bun process.** The office remembers through
`diary.json`, next to `settings.json` in the app's data folder (`src/bun/diary.ts`), never in the
repo. Per local day it holds counts (sessions, hires, PRs opened and merged, red test runs, red
streaks fixed, sessions finished and long ones, compactions), the same by project, the regulars who
came in, and marks that stop a restart counting the same thing twice. Nothing in it names anything:
a project is `p` plus a 32-bit FNV hash of its name, a regular is that hash and one of the rig's
seven costumes (never the agent tool's free-text agent type), a mark is a hash. `diaryOf` reads any
input back through a whitelist (kinds, `YYYY-MM-DD` days, hash-shaped keys), so a hand-edited or
torn file cannot carry text in. It keeps 21 days and at most 3000 marks a day (a busy day is a few
kilobytes); writes are a temp file renamed over the old one, held back 5 s so a busy office writes
it every few seconds at most, and flushed on exit. The pure part (`src/shared/diary.ts`) is shared:
the webview gets the diary over RPC (a `diary` request on load, a `diary` message whenever it
changes, sent just before the snapshot that changed it), and `?demo` keeps one in memory from its
own invented snapshots with the same code.

**Beats live in the director; decor lives on the walls.** The story's beats are pure, in
`director/story.ts`, with their memory in `World.story` so a replay tells the same story; direct.ts
calls in at a few marked places. A merged PR (the `prs[].state` the watcher already captured) sends
the lead to the room's outbox for the reply: it reaches in (`mailDrop`), carries it back
(`envelopeCarry`) and celebrates with a busy teammate, or waves to you alone. A red streak
(`DIARY.reds` = 2 red runs in a row, per character) going green earns a `flourish`, and the crew
look up at it through the same ripple a red test uses. A session that ran 90 minutes or more gets a
send-off when it ends: up to five characters standing in its room (then the lobby and kitchen) wave,
the nearest first, 260 ms apart, looking at it as it walks out. A PR or a test already in that state
when the office first sees it is history, not news. All of these reuse existing poses, so the rig and
its pose sheet are unchanged.

**"While you were out" and the day's ledger share the lobby's frame.** The director logs its beats
(12 hours, 200 entries). Coming back after a while away (the view now carries `since`, when the
window went, beside `back`), the counts between the two go up on the lobby's frame for 90 s. At dusk
and night the frame shows the day's ledger from the diary. Otherwise it keeps whatever it said; the
office restores it when the story lets go.

**Rooms collect decor through the week** (`office/decor.ts`, its own layer over the walls, redrawn
only when it changes, never per frame): a framed PR per merge this week in the gaps between the
back wall's items, a pennant per day the project came in over its planner, a gold star on its sign
per red streak fixed. Colours come from the theme's slab, lamp, glow, sky and lawn, and the words
from a table by theme id with the office's as the default, so a new theme draws it unchanged.

**Regulars are keyed by project and costume.** `regularsOf` gives each character
`<project key>:<role>:<n>` (n its place among the same costume in that project); `regularOf` picks a
short name and maybe glasses from the key alone, and the puppet takes the key as its id, so its loop
phases and variants are the regular's own day after day. The name shows on the lead's desk card and
on crew task tags only once the diary has seen that regular on two days.

**What is left.** The framed PR goes up when the diary hears of the merge, not when the lead gets
back with the reply. Regulars have only glasses for an accessory; more would need new parts in
every theme's rig painters. Send-off wavers interrupt busy work for one wave; a quieter office
might skip the busy ones.
