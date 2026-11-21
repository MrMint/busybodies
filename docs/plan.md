# Build plan

From the placeholder scene to the designed office (`design/README.md`). Every milestone ships on
its own, keeps the frame budgets green (`bun test e2e/`), and is checked through the inspector
before anyone looks at pixels.

## The world model, first

One mapping decides most of the build. It has to exist before the rig and the office can meet:

| Snapshot | World |
|---|---|
| A project (repository) | A room off the hallway; busier projects get more rows of desks |
| A session | A desk in its project's room, with the session's lead at it |
| A subagent | A crew member near its parent's desk; deeper agents sit closer and smaller |
| A side session | A desk in the same room, next to the one that started it |
| busy / idle / stalled / finished | Frantic work / a slacking habit / a cobweb / a walk to the kitchen, then out the door |
| A review running | The reviewer takes the diff to the meeting room |
| Waiting on you | The yellow paddle, a pulsing room and a top pill (needs a capture signal, see S4) |

`src/scene/director.ts` turns snapshot changes into world changes (who walks where, who starts
which pose) so drawing code never reads the snapshot itself. The director is pure and
unit-tested: snapshot in, world events out.

## Streams

Three streams can run in parallel from the start; they touch different folders. Each one owns a
brief in `docs/briefs/` with acceptance checks an agent can run.

**S1. The mochi rig** (`src/scene/rig/`)
- Parts as separate sprites in a container, drawn procedurally once and baked into an atlas at
  startup. Springs between frames, for the smoothness the design was chosen for.
- The part vocabulary: 12 faces, arms, feet, props, effects, and 7 role costumes.
- Poses ported from `Acting`, redrawn in mochi. Typing; 7 slacking habits; waiting on you; a
  failed test; PR opened; handing over to a new subagent; asleep; stalled; done; thinking hard;
  celebrating with a teammate; grumpy at a long build.
- Tools: a pose sheet (every pose's frames in one image) and a text dump of each frame's
  parameters, so a new pose can be reviewed by reading. The small tween and spring helper lives
  here too.
- Done when the pose sheet matches `Acting` in mochi, the inspector reports each character's pose
  and frame, and e2e holds the budgets with 200 characters on screen.

**S2. The open-floor office** (`src/scene/office/`)
- A layout generator, from the world model: rooms sized by their crew, the hallway, lobby,
  kitchen, meeting room and nap pod. Furniture and signs are drawn procedurally.
- Static layers (floors, walls, furniture) cached as textures, so only characters and bubbles
  redraw. This is the main cut to the busy-scene cost measured in `docs/decisions.md`.
- Depth sorting by y. Camera stops (whole office, room, desk), with the frame rate raised during
  a move only.
- Done when `?demo` draws `FloorBusy`'s day with placeholder characters, the camera moves between
  stops, and the profiler shows busy cost below today's numbers.

**S3. Richer capture** (`src/watcher/`)
- New signals from records the files already hold:
  - tool durations (a long build)
  - failed shell commands and test runs
  - PR links
  - cost
  - retries of the same command
- Waiting on you: an opt-in hook installer for the agent tool's `Notification` event, writing to
  a small file the watcher reads, plus whatever the desktop index shows.
- Done when each signal is in the `Snapshot` contract with invented-data unit tests, and
  `tools/watch-tree.ts` shows it live.

**After those, one stream at a time:**

- **S4. The director and acting** (`src/scene/director.ts`)
  - Wire S1 and S2 to the snapshot. Walks between rooms, handovers, reviews in the meeting room,
    and leaving through the door.
- **S5. Sass**
  - The line bank moves from `design/generators/r3.py` into typed data.
  - Trigger detectors run on snapshot changes. A bubble scheduler takes turns, and long lines
    show only when zoomed in.
  - Signs and tallies are driven by counters, and background gags by idle time (the wilting
    plant).
- **S6. Polish and ship**
  - The compact floating window, a tray icon and an app icon.
  - A release build, a README GIF, and the first tagged release.

## Instrumentation, alongside

Following `docs/instrumentation.md`. The pose sheet and text dump land with S1. Deterministic
screenshots land with S2: named scene states compared against `design/renders/`. Record,
anonymize and replay land with S3, so real busy days become fixtures for S4 and S5. The HUD and
metrics log come before S6.

## How the work runs

- Each stream works in its own git worktree of this repo, on a branch, and lands through a pull
  request. CI must be green and the private-data scan clean.
- A stream checks its work in this order: unit tests, inspector queries, e2e budgets, and only
  then screenshots.
- `docs/decisions.md` gets an entry for every choice that a later stream would otherwise have to
  re-derive.
