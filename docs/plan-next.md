# The next level: a living office

The first plan (`docs/plan.md`) took the placeholder scene to the designed office; the busy-crew
work (PR #13) made a release crew act out its tools. This plan is the next step: the office should
feel **hectic when the work is hectic**, carry **real numbers** a person can read at a glance, and
be built so the office is **one theme of several** (a factory next).

Every stream here ships on its own, keeps the frame budgets green (`bun test e2e/`), stays
deterministic (no `Math.random`), and is checked through the inspector before pixels.

## Principles (carried over, and new)

- **Every movement means something.** A trip is a tool change, a queue is real contention, a pile
  is a real number. No ambient wandering that isn't backed by a signal; the idle habits are the
  only exception, and they already exist.
- **Acting is hands and props, not squash** (decided in PR #13). New stations come with the props
  and arm angles to use them.
- **Numbers become things, not dials.** Context is a paper pile, lines changed are bricks, files
  are folders. A number only becomes text where a thing can't say it (a sign, a name card, the
  inspector).
- **Only counts and kinds leave the watcher.** File paths, file text, commands and prompts stay in
  the watcher, as they do today (`CommandKind` is the precedent). The scene sees "12 files, +340
  −80 lines", never which files.
- **The director speaks in theme-neutral words.** It says "go to the *reference* station" or "the
  context pile is 70% full"; the theme decides that's a filing cabinet and a stack of paper (or a
  parts shelf and a hopper, in the factory).
- **Render on demand still holds.** Walks run at 30 fps, not 60 (see Stream C). Idle makes zero
  frames.

## Stream A: richer capture, round two (`src/watcher/`)

New snapshot fields, all optional, all parsed defensively, each from records the transcripts
already hold. Unit-tested from invented fixtures, as S3 was.

| Field | From | Notes |
|---|---|---|
| `Session.model`, `Agent.model` (already for agents) | `message.model` on assistant records | A short family name (`fable`, `opus`, `sonnet`, `haiku`, or `other`) leaves the watcher; the full id stays. Plain text only, no vendor marks (AGENTS.md). |
| `Session.context` `{ used, window?, at }` | the last request's `usage`: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` | `window` from a small table by model family and the 1M marker when present; unknown model: no window, no meter. Reset after a compaction boundary. |
| `Session.changes`, `Agent.changes` `{ files, added, removed }` | `Edit`/`MultiEdit` inputs (`old_string`/`new_string` line counts), `Write` (`content` lines), `NotebookEdit` | Files is a count of distinct paths, hashed in the watcher. Approximate by design: an Edit's line delta, not a diff. |
| `Session.todos` `{ pending, active, done }` | the latest `TodoWrite` input | Counts only, never the text. |
| `Session.tools` `{ calls, errors }` per minute | `tool_use` / `tool_result` with `is_error` | Drives the "heat" in Stream C. |
| `Session.waiting.reason` (exists) | | Already: permission, question, plan. |

Done when the fields show in `tools/watch-tree.ts`, the replay fixture round-trips them, and
`anonymize.ts` keeps them honest (counts pass, nothing else).

## Stream B: metrics in the office (`src/scene/director/`, `office/`, `rig/`)

What each number becomes. The office theme's things are named; the director only passes numbers.

| Signal | In the office | Reads as |
|---|---|---|
| Context fullness | An **in-tray pile** on the lead's desk that grows from a few sheets to a teetering stack; past 80% papers slide off and the lead sweats; at 95% it's buried to the eyebrows. A compaction is the lead **feeding the pile into a shredder** (replaces the stretch). | "This one's nearly out of room" |
| Model | The **desk's name card** gets the family as a second line; and a small **pace trait**: haiku crews walk and type a touch quicker, opus a touch steadier. Never a judgement of quality, never a logo. | "That's the opus session" |
| Lines changed | The **brick tower** counts lines (log scale: a brick per ~20 lines, a course per ~100) instead of edits; removed lines are bricks carried *away* to a skip. | "This one has written a lot" |
| Files touched | **Folders in a filing cabinet** beside the desk: a drawer per ~10 files, open drawers bulging. | "It's touched a lot of files" |
| Todo progress | A **wall planner** in the room with sticky notes in three columns; a note moves across when a todo completes (a crew member walks it over). | "4 of 9 done" |
| Waiting on you | Beyond the paddle and the pulse: the waiting lead **walks to the human's door** (a new "your office" by the lobby) and **queues with a ticket**; the queue is ordered by wait; a bell rings once. The top pill stays. | "Three people are at your door" |
| Cost | The coffee cups already exist; add a **mug pile** on the desk (the sass engine has a `mugs` place waiting). | "This one has had a lot of coffee" |
| Test health | The room's "days since a test broke" sign exists; add a **red/green lamp** on each desk from the last test result. | "Red right now" |
| Heat (tool calls per minute) | The pace in Stream C: walk speed, run cooldowns, rush state. | "It's flat out" |

Done when each mapping has a director unit test (number in, thing state out), a `?demo` beat, and
a shoot state in `tools/shoot.ts`.

## Stream C: hectic, purposeful movement (`src/scene/director/`, `office/`, `rig/`)

**Stations and trips.** Each project room gets a strip of shared stations (in free cells, else
along the back wall). A busy crew member whose work kind changes, and holds, walks to the station
for it, works there, and walks back to its bench when it edits again.

| Work kind | Station (office theme) | At the station |
|---|---|---|
| read | **Filing cabinet** | pulls a folder, flips through it |
| search | **Card catalogue** | thumbs through drawers of cards |
| shell (build) | **Copier** | feeds pages; a long build is a **paper jam** (the grumpy pose kicks the copier) |
| test | **QA stamp desk** | stamps sheets green or red; a red test is a red stamp, then the thumb |
| web | **Phone / fax** | on the phone, or a fax curling out |
| edit | the crew member's own **bench** | as now |
| PR opened | **Outbox / mail cart** | the lead walks the envelope out |
| compaction | **Shredder** | the lead feeds the in-tray in |

Rules:
- A trip only when the new kind holds (the 6 s hold, maybe longer for a far station), so a 1 s
  Read never sends anyone across the room.
- **Queues are real**: one user per station; the next waits beside it, tapping its foot. Two
  stations of a kind in a big room.
- **Pace follows heat**: walk speed from stroll to jog to run by tool calls per minute and how
  recently it wrote; brick-run cooldown shrinks as the edit rate climbs; past a threshold the room
  goes into **rush** (sweat, papers flying, the lead's rounds become dashes to whoever is red).
- **Dodges**: two walkers whose paths cross at the same moment sidestep (a short offset in the
  path), decided by the director from both paths.
- **Hand-offs**: a crew member back from the filing cabinet hands a folder to the next one who
  needs to read (a two-hander), instead of both making the trip.

**The frame budget.** Today any walk raises the cap to 60 fps. With constant traffic a busy room
would sit at 60 and fail the "busy ≤ 30 fps" e2e rightly. Walks drop to 30 fps; only camera moves
get 60. Check: a busy room with six walkers holds 30, and idle still makes zero frames. Run
`tools/profile.sh` busy before and after (the CPU profile deferred since 0.1.0 is due anyway).

## Stream D: themes (`src/scene/theme/`, new)

The office is a theme; the factory is the next. A theme is data and painters, not logic:

- **Vocabulary**: what each station kind, desk, room and common area is called and drawn as
  (`reference` → filing cabinet / parts shelf; `build` → copier / press; `context` → in-tray /
  hopper; `tower` → bricks / pallets).
- **Painters**: furniture, stations and props, baked into the atlas as today.
- **Costumes and props per role**: builders keep hard hats in the office; in the factory everyone
  is a robot variant (same rig, different parts).
- **Lines**: a theme can add sass lines; the voice rules stay.

Steps: (1) move the office's furniture and station painters behind a `Theme` interface with no
visual change (a screenshot diff via `tools/shoot.ts --check` proves it); (2) the director's
station kinds become theme-neutral names; (3) a `?theme=factory` stub with conveyor belts (tool
calls ride the belt as parts), robot crews, a hopper for context, a press for builds, a loading
dock for PRs; (4) the tray menu picks the theme. Looks (paper, pixel, putty in `design/boards`)
are a separate axis from themes and stay out of scope.

## Stream E: the rig for all of this (`src/scene/rig/`)

New props and poses for each station: folder flip, card thumb, copier feed and kick, stamp
(green, red), phone, shredder feed, envelope carry, ticket hold and bell, in-tray pile states,
sweat and paper effects for rush. Hands and props, per the PR #13 rule, with arm angles solved
against each station's prop position (as `WORK` in `theme.ts` does for benches). A pose sheet
cell per new pose, and `docs/rig/` regenerated.

## Order and parallel work

```
Wave 1 (parallel, separate folders)
  A  capture round two ............ src/watcher/            (no scene changes)
  C  stations + trips + pace ...... director/, office/       (office theme, hard-coded first)
  E1 station props and poses ...... rig/                     (agreed pose names first, as for carry/place)

Wave 2 (needs A)
  B  metrics in the office ........ director/, office/, rig/
  C2 rush, dodges, hand-offs

Wave 3 (needs B and C settled)
  D  theme seam, then the factory stub
```

Each wave lands as its own PR with a changeset. Before any agent starts, the shared contract (pose
names, station kinds, snapshot field names) is written into the code as types, as the
`walkPose`/`carry`/`place` contract was for PR #13, so parallel agents don't collide.

## Risks

- **Clutter.** Piles, cabinets, planners, stations, queues and towers in one room can bury the
  characters. Each addition gets a look at room zoom and office zoom; things that don't read at
  office zoom stay off it (show them only zoomed in, like the task tags).
- **Snapshot rate.** Tools change faster than snapshots arrive; trips must be driven by held kinds,
  never by single calls, or the room becomes noise.
- **Context windows.** The window per model isn't in the transcript; a wrong table makes a wrong
  meter. Unknown → no meter, and the table is one small file to update.
- **Honesty of line counts.** An Edit's line delta is not a diff; the tower says "a lot" vs "a
  little", which is all it should claim.
- **CPU.** More walkers and more animated props: the busy profile must be re-measured on a quiet
  machine before release.

## Decided with the owner (after wave 1)

1. **Waiting sessions go to "your office"**, a new common room beside the lobby: a door with
   YOU on it, a ticket machine, a NOW SERVING sign, and a queue of waiting leads holding numbered
   tickets in the order they started waiting. The first one in rings the bell. Answering one
   sends it back to its desk; the queue shuffles up. It's the most visible place for the thing
   that most needs a human, and a queue at a door reads at office zoom.
2. **Model pace traits: yes, and be opinionated.** Each family gets a personality: haiku zippy
   (quick steps, quick hands, a little scattered), sonnet brisk and steady, opus deliberate (slower
   steps, longer looks, a pause before acting), fable flamboyant (extra flourishes). Plain text on
   the name card, never a logo.
3. **The tower counts lines, runs count edits.** A brick per ~20 lines added (log-ish past 200, so
   a big rewrite doesn't fill the room), removed lines carried away to a skip. Brick runs still go
   on edits, so the run frequency stays a measure of activity and the tower of output.
4. **Themes keep the mochis.** Every theme is the same cast in different outfits with different
   tools; the factory adds giant robot arms that help (lifting, welding, passing parts) rather
   than robot characters.
