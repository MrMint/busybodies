# S4: the director and acting

Wire the mochi rig (S1, `src/scene/rig/`) and the open-floor office (S2, `src/scene/office/`) to
the live snapshot, so the office acts out what the sessions are doing. Read first: `AGENTS.md`,
`docs/plan.md` ("The world model"), `docs/decisions.md` (every S1, S2 and S3 entry), the
boards `design/boards/FloorBusy.dc.html` and `Acting.dc.html` (or `design/renders/`), and the
code of both streams. Use the vendored PixiJS skill before writing Pixi code.

## You own

`src/scene/director.ts` (new) and anything under `src/scene/director/`, the glue in
`src/mainview/` that replaces the placeholder office, its tests, and decisions entries. Change
`src/scene/rig/` and `src/scene/office/` only to fix a bug or widen an interface, and say so in
the PR. Don't change `src/watcher/`. S5 (sass) is building `src/scene/sass/` in parallel: leave
it alone, and leave a narrow seam for it (below).

## Build

1. **The director, pure.** `direct(prev: World | undefined, snap: Snapshot, now: number) →
   { world: World, events: WorldEvent[] }`. The world says who sits where and in which pose. The
   events say what changed: arrive, leave, walk to, start a pose, hand over, start or end a
   review, start or stop waiting on you. There's no Pixi in it. Unit-test it with invented
   snapshots, including the S3 signals (a long build, a failed test, retries, PR opened, waiting
   on you, compaction, stalled).
2. **Choosing poses.** Map each agent's state and signals to the rig's poses:
   - busy → typing, or thinking hard during a long tool run
   - idle → one of the 7 slacking habits, chosen deterministically from the id hash and
     rotated slowly
   - a failed test or command → the failed-test pose
   - a long build → grumpy
   - a PR opened → the PR celebration, with a teammate if one is near
   - spawning a subagent → the handover
   - waiting on you → the paddle, plus the room's pulse and the top pill
   - stalled → the cobweb
   - finished → walk to the kitchen, then out the door

   Rare variants use the rig's rarity, seeded so the same run looks the same.
3. **Movement.** Walking between slots (desk, kitchen queue, meeting room, door) along the
   office's hallway, not through walls; a simple path over the layout's graph is enough. Raise the
   frame rate only while someone walks, then let the scene go idle again.
4. **The sass seam.** Export the event stream and a `say(slotId, text, kind)` hook that draws a
   speech or thought bubble anchored to a character, and a `sign(slotName, text)` hook for the
   office's named sign and whiteboard slots. S5 fills these in. Ship them with a tiny built-in
   placeholder (the tool name in a bubble, as today) so the scene is complete without S5.
5. **Demo and replay.** `?demo` plays the invented busy day through the director, with arrivals,
   a review in the meeting room, a waiting-on-you moment and people leaving. S3's record and
   replay should drive it too: replaying a fixture through the director is the main test.

## Done when

- Unit tests cover the director: stability (an unrelated change moves no one), every signal
  mapping above, and a full fixture replay yielding a deterministic event list.
- The inspector reports each character's slot, pose and current walk.
- e2e budgets pass with the real scene: idle makes 0 frames, busy stays under budget, and the
  loop stops once walks end. `tools/profile.sh` numbers go in the PR, against S2's.
- A contact sheet from `tools/shoot.ts` of the demo day goes in the PR.

## Rules

Follow `AGENTS.md`. Work in your own worktree on a branch named `s4-director` and land through a
PR with CI green. Don't push to `main`, and don't merge your own PR. Before using
`tools/profile.sh`, take the shared profile lock, and remove it only if it names you.
