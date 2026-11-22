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
