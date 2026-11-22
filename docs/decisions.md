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
from `?sheet`. `?crowd=200` (and `&idle`) is the load test the e2e budgets run against.

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
