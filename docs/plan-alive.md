# Lived in: the plan after the living office

The living office (`docs/plan-next.md`) made the scene honest and busy: stations, trips, metrics
as things, rush, themes. Watching it, something was still missing. **It animates when something
happens, but it doesn't feel lived in.** It read like a diagram that acts on cue, not a place where
these mochis spend their day. Five causes:

1. **Nothing moves between events.** Render on demand made a quiet office a still photo.
2. **The cast doesn't see each other.** Gaze is baked into each pose (`l-right` is "forward"), crew
   stand in rows facing one way, the foreman's round is one-sided, nobody looks at the teammate
   whose test went red.
3. **Motion is mechanical.** Walks are constant speed in straight lines with an instant mirror flip
   and a dead stop; loops repeat identically for hours (`typing` every 1.69 s); idle habits play a
   2 s burst, then freeze for ten minutes.
4. **The world is flat.** No light, windows show nothing, no time of day, furniture has no contact
   shadows, "cut paper" reads as clean vector, and labels crowd the acting.
5. **Themes change the paint, not the place.** The factory is the office's floor plan in grey, and
   the office's own cast wears hard hats and hammers nails: the builder metaphor leaks out of the
   factory.

Three ideation passes (acting, world, the viewer's experience) fed this plan; their reports are
summarised in the streams below.

## Decided with the owner

- **Freeze off screen, live on screen.** The scene draws nothing while its window is off screen
  (minimized, closed to the menu bar, on another Space, fully covered, screen locked: WebKit's page
  visibility). While visible, the cast may keep a low frame rate of life going. This replaces "an
  idle office makes zero frames": now **a hidden office makes zero frames**, a visible quiet office
  lives at **≤ 20 fps**, acting stays at ≤ 30 and camera moves at 60. **Calm mode** (`?calm`, the
  system's reduced motion, and a tray toggle) brings back zero idle frames.
- **The office theme goes full office.** No hard hats, aprons, sawhorses or bricks in the office:
  an over-the-top corporate cast and set. The factory keeps the construction gear; that is where it
  belongs.
- **Still no squash.** Life, gaze and motion are eyes, hands, feet, props and timing.

## Wave 1: the foundation (landed in this branch)

- `src/mainview/visibility.ts`: page visibility, with `force()` for tests. Hidden stops the ticker
  and skips renders; coming back redraws.
- `src/scene/rig/life.ts`: blinks (one per ~4.6 s window, one in five a double, 130 ms) and glances
  (now and then, 0.9 to 2.6 s, a few rig units) as a pure function of id and a life clock, so
  `freeze()`/`step(n)` stay deterministic. The puppet layers it on any pose (eyes and look only).
- `Puppet.life`, `Puppet.gaze([x, y])` (rig units added to the pose's look, in the puppet's own
  facing; wins over a glance), `Character.life`/`alive`, `Office.life`, `Office.acting` (everything
  but life) vs `Office.animating` (life included). `main.ts` picks 60 / 30 / 20 fps from those.
- The inspector's `counters()` reports `visible` and `life`; `setVisible(false|true)` fakes it.
- e2e: calm mode holds the old zero-frame tests; new tests hold life at ≤ 20 fps and a hidden busy
  office at zero renders.

## Wave 2: six streams in parallel

**Landed** (merged in this branch; see the wave 2 entries in `docs/decisions.md`). What each
stream left is listed there and folded into wave 3 below.

Each stream is one agent in its own worktree, branched from wave 1, landing back here. File
ownership is listed so the streams don't collide; where two must touch a file, each keeps to its
named region. Every stream: deterministic, checked through `window.__busybodies` before pixels,
`tsc`, `bun test test/`, `vite build && bun test e2e/`, a decisions entry, and a changeset.

### A. Gaze and the social layer

Owns `src/scene/rig/puppet.ts` (gaze), `Cue.lookAt` in `office/slot.ts`, the gaze half of
`rig/character.ts` (not walking), and the reaction and round branches of `director/direct.ts`;
`office/world.ts` crew spots.

- World-point gaze: the director puts `lookAt` (an actor key or a world point) on a cue; the
  character turns it into rig units against its facing and clamps it; past ~70% of the side range
  the eyes go `side`. A frame that asks for eyes on the work (`l-downR`) wins over gaze.
- Wire what exists to real targets: the red-test `glance` looks at the failer, in a ripple from the
  nearest (+180 ms per 60 px); the foreman's round both ways (the crew member looks up at the
  lead); waiting leads look at the YOU door; hand-offs: the taker looks up when the giver is 1.5 s
  out and raises a hand before contact.
- Staging so acting shows: overlapping crew re-stagger and the rear one faces the front one; a crew
  stands in a loose arc facing its lead; finished agents in the kitchen pair up facing each other.
- **They notice you:** coming back on screen after a while away, idle characters glance up at the
  viewer (a `look` at the camera) and one waves; waiting leads hold their tickets higher. Driven by
  visibility, passed into the director as an input like `view`.

### B. Motion grammar

Owns walking in `rig/character.ts` (`along`, `#walkTo`, `place`), `director/paths.ts`,
`rig/player.ts`, loop variants in `rig/poses.ts`, `director/beats.ts`, `director/traits.ts`, and the
habit rotation in `director/direct.ts`.

- Walks with a start, a turn and a stop: the look goes to the destination 200 ms before the feet
  move; distance eases in (150 ms) and out (250 ms) inside the same `walk.ms` (brick, hand-off and
  mail timings hold); a 120 ms front-facing turn instead of a mirror flip; corners rounded; a
  one-beat plant on arrival, then a look at the job. Re-check the dodge's 26 px clearance.
- Break the metronome: a looping pose may carry `beats` (variant passes) that a pass picks from
  `hash(id, pose, pass)`: the typist stops to read with a chin on a hand, the hammerer checks the
  nail, the queuer checks the one ahead. `frameAt` becomes pass-aware; determinism holds.
- Idle habits while life is on: habits rotate every minute or two and loop gently instead of a 2 s
  burst and a ten-minute freeze; in calm mode, today's behaviour.
- Model traits as acting, not latency: opus's pause is a `consider` beat (look up, chin on hand);
  haiku overlaps the next pose a touch; sonnet a small nod.
- Waiting gets worse the longer you leave it: polite, then looks at the door and taps a foot, then
  sighs and chats to the one behind, then slumps with the ticket drooping. Booked wakes, so no
  frames in between.

### C. Light, material and labels

Owns `office/office.ts` layers (a new `#light` layer, labels), `office/paper.ts`,
`office/layout.ts` wall rects, `office/camera.ts`, the `light` field in `theme/types.ts`, and light
values added to `theme/office.ts` and `theme/factory.ts` (values only; D owns their painters).

- A light layer with time of day: four or five phases from the local hour (morning low light
  through the windows, flat noon, amber late afternoon, night from the PaperNight board), re-baked
  only when the phase changes. Busy desks sit in warm lamp pools; empty desks and vacant rooms go
  darker; lamps come on desk by desk as sessions start. A rush flickers a room's overhead light.
- Focus light: at a room or desk stop, neighbouring rooms dim, so the focused one reads as a stage.
- Windows that look out: sky, a skyline, sun or moon, slow clouds on the life clock; the lawn
  becomes the building's outside with a little parallax.
- A paper pass: a stacked offset shadow under furniture and walls (direction from the sun), a faint
  code-generated grain, slightly wobbly room shells, floors as materials (planks, carpet tiles, a
  rug under each cluster). All baked: free per frame.
- Fewer labels: room names painted onto the room (a vinyl decal over the door; a stencil in the
  factory) rather than floating tabs; desk cards and counts only at room and desk stops; signs
  clear of head height; fix the tab-over-planner and heads-over-sign-text collisions.

### D. The office goes full office

Owns the office side of `rig/theme.ts` (part painters), `rig/roles.ts` costumes per theme, and the
furniture and wall-item painters in `theme/office.ts`.

- A corporate cast, by role: the lead in a tie with a headset (as now, louder); builders with rolled
  sleeves, a tie flung over the shoulder, a pencil behind the ear; scouts with a lanyard and a
  clipboard; explorers in a fleece vest with a laser pointer; reviewers in a cardigan with reading
  glasses on a chain; verifiers in a green accountant's visor with sleeve garters; designers in a
  black turtleneck. Costumes become per theme (the factory keeps its gear).
- The work repainted by part name, as the factory does, so every pose plays unchanged and the
  solved reaches still land (tested): the hammer becomes a giant stapler, nails a sheaf being
  stapled, the sawhorse an in-tray stand, bricks reams of paper and binders, the crew tower a
  teetering binder stack, the skip a recycling bin, the wrench a hole punch.
- Over-the-top set dressing: motivational posters, cubicle partitions with family photos, a
  ficus, fluorescent ceiling panels, a water cooler with a paper cone dispenser, a "you don't have
  to be busy to work here" mug wall, a whiteboard of arrows. Within the clutter budget: things that
  don't read at office zoom show only zoomed in.

### E. Compact becomes a live camera

Owns `src/mainview/` camera direction for compact (`hud.ts`, `main.ts` compact branch) and a new
pure shot picker (e.g. `src/scene/director/shots.ts`).

- Compact mode cuts between rooms at a readable zoom, to whatever just happened (a PR, a red test,
  a buried in-tray, a copier feud), and holds ~20 s; when someone waits on you it cuts to the queue
  at your office. A strip of tiny room tiles under the picture is tinted by state; clicking one pins
  that room. The camera moves only on a cut.
- The shot picker is pure (events, heat, waiting in; a stop and a hold out) and unit-tested.

### F. Sound, opt-in, and the settings it needs

Owns a new `src/mainview/sound.ts`, `src/bun/settings.ts`, `src/bun/tray.ts`, `src/shared/rpc.ts`.

- Earcons for real events, synthesised in WebAudio from code (no samples, no licences): the bell
  for waiting on you, a stamp thunk for a green test, a rustle for a compaction, a chime for a PR,
  the copier's grind on a long build. Variation from the event id; at most one per kind every few
  seconds; panned by the room's screen x; louder zoomed in. A quiet room tone per theme, scaled by
  heat.
- Off by default. The tray gets **Sound** and **Calm office** toggles, saved in `settings.json` and
  sent to both windows like the theme. The AudioContext suspends while hidden.

## Wave 3: the bigger moves

**Landed** as four streams (G staging, H the Line, I story, J looks), merged in that order; see the
wave 3 entries in `docs/decisions.md`. The Line was picked over the Allotment: the floor plan and
the light both lean on walls. What's left is under "After wave 3" below.

- **Themes own their staging.** A layout grammar from the theme: the factory's bays become lines
  with a belt across the floor, crew along it, the foreman up in a booth, tool calls riding the belt
  as parts (only while a kind is held), PR crates down the hallway conveyor to the dock. Per-theme
  ambient life (office: steam off the coffee, a ceiling fan, the printer's light; factory: a beacon
  while a build runs, steam vents, weld sparks) and per-theme idle habits (sitting on oil drums,
  cards on a pallet, kicking the vending machine).
- **A third theme** that proves the seam: "The Line", a restaurant kitchen (sessions as stations,
  tool calls as tickets on the rail, context as the mise tray, tests as tasting, review at the pass,
  a PR as a plate out of the pass, waiting on you as "Service!"), or "The Allotment" (no walls at
  all: plots under open sky).
- **Story and continuity** (needs a local diary of counts and kinds only): payoff for a merged PR
  (the reply envelope, a framed PR on the wall; `prs[].state` is captured and unused), the
  redemption beat when a red streak goes green, send-offs for long sessions, "while you were out"
  headlines on the lobby board, regulars you recognise (the same face, accessory and short name per
  project and role), rooms that collect decor through the week, the day's ledger at closing.
- **Looks as render passes**: pixel as a quarter-resolution render upscaled nearest; night is the
  light layer's night phase.

## After wave 3

- **The sass voice doesn't know the theme.** Its lines and wall signs are the office's in every
  theme ("Out of office. In the office." on the Line's wall). Give `sass/lines.ts` per-theme lines,
  the way `ThemeWords` and `StoryWords` do.
- The compact strip's tiles name areas by the office's words in every theme; sound plays the office
  hum in the kitchen.
- The factory's idle foreman plays habits inside the booth, half hidden; the PR crate starts mid-bay
  instead of following the arm's crate; ambient life only in the kitchen, copiers and hallway.
- Story: the framed PR goes up when the diary hears of the merge, not when the reply reaches the
  lead; glasses are the only regular accessory; 28 regular names can collide.
- The mug wall still sits partly under the kitchen's painted name (no room to move it further).
- **Life runs at 30 fps for now** (the owner, after comparing 10 and 20 by eye: both read choppy).
  Push on the visuals first; one **performance pass** over all of it comes once the look settles.
  Its starting points: life costs frames, not characters (stream J's profile); the 100 ms beat grid
  is in place, so a lower rate (`?lifefps=`) still shows every blink; render only the rooms on
  camera; skip springs on settled puppets.
- Rerun the full e2e suite and `tools/profile.sh` on a quiet machine: every wave 3 stream and the
  merge ran under a load average of 35 to 80, where Chrome times out.

## Wave 4

- **K: the bakery's world.** The Line became the bakery, repainted as a patisserie gone over the
  top (`theme/bakery.ts`): candy-stripe wallpaper, scalloped awnings and fairy lights, checkerboard
  floors in each room's own pastel; a pastry case, a sweet shelf, a deck oven, a tasting stand, an
  order phone and a pick-up shelf under the stations' slots; a café with an espresso machine, a cake
  cabinet and macaron poufs; a giant cupcake in the shop front to nap in. It stages desks and a
  `conveyor` hall: pastries ride the hallway's belt (`parade`), a PR's cake box rides it to the
  pick-up hatch. Its own ambient life (`office/ambient.ts`): oven windows flickering, marquee bulbs
  chasing round "Order up!", a cake turning on the tasting table, sprinkles drifting round the
  cupcake, steam off the espresso machine. Its words (`BAKERY_WORDS`, `BAKERY_STORY`) are orders,
  batches and boxes. Its habits are the rig's for now: the bakery's own (sipping a cappuccino,
  licking the frosting spoon, sneaking a macaron, napping on a flour sack) wait on rig poses.

## Risks

- **CPU while visible.** Life at 20 fps on a full office is not free. Measure `tools/profile.sh` on
  a quiet machine with life on and calm on; if life costs more than a few percent, quantise beats
  to a shared grid so blinks share frames, or run life only in the rooms the camera shows.
- **Clutter.** Set dressing, light pools, decals and props in one room can bury the cast. Every
  addition gets a look at office zoom, room zoom and in compact.
- **Merge seams.** Six streams; A and B both touch `character.ts` and `direct.ts`, C and D both
  touch `theme/office.ts`. Each keeps to its region; merge in the order D, C, A, B, F, E.
