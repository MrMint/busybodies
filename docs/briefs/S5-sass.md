# S5: sass

Give the office its voice: the affectionate roast. Read first: `AGENTS.md`, `design/README.md`
("Voice"), `design/boards/Lines.dc.html`, the `BANK` in `design/generators/r3.py`,
`docs/plan.md`, and `src/watcher/model.ts` (the `Snapshot` contract, including S3's signals).

## You own

`src/scene/sass/` (new), its tests, and decisions entries. S4 is building the director in
parallel (`src/scene/director.ts`). It will export an event stream, `say(slotId, text, kind)`
and `sign(slotName, text)`. Build against the `Snapshot` and those three names. Don't edit S4's
files until S4 has merged; then rebase and do the wiring yourself as the last step.

## Build

1. **The line bank as typed data.** Move all 81 lines from `BANK` into
   `src/scene/sass/lines.ts`, keeping trigger, kind (said, thought, sign), speaker role and the
   timing note (for example "lead · 10 min"). Add a script or test that checks the count
   against the board, so the two can't drift. Then write more lines in the same voice, going
   for the "over the top" brief: frantic busy characters, comically lazy idle ones. Aim for at
   least 150 lines, and at least 5 for every trigger. **Voice rules:** affectionate, never mean
   to the human, nothing crude, no real people or products, and no vendor names.
2. **Trigger detectors, pure.** `detect(prev: Snapshot | undefined, snap: Snapshot, now) →
   Trigger[]`. Cover every group in the bank, plus the S3 signals:
   - waiting on you, escalating with the wait
   - a failed test, and a fail streak
   - retries
   - a long build
   - a PR opened
   - compaction
   - cost milestones
   - idle a long time
   - a big crew spawned
   - a stall
   - someone finished
   - late at night (from the local clock)
3. **The scheduler.** Takes turns so the room isn't a wall of bubbles. At most N bubbles on
   screen, scaled by camera zoom, with long lines shown only when zoomed into a room. It keeps a
   per-character cooldown, never repeats a line within a window, and escalates waiting-on-you
   lines by wait time. It's deterministic with a seed.
4. **Signs and gags.** Counters drive the signs and whiteboard slots: "days since a failed
   test", a PR tally, and the coffee count. Idle time drives background gags, such as the
   wilting plant and a pile of mugs. Expose these as `sign(slotName, text)` calls.
5. **Wiring.** After S4 merges, rebase and connect the detectors and scheduler to S4's seam.

## Done when

- Unit tests cover each detector with invented snapshots, the scheduler's limits and cooldowns,
  and the bank's count check.
- A text dump tool (`tools/sass-dump.ts`) replays a fixture and prints who said what, when, so the
  voice can be reviewed by reading.
- After wiring: e2e budgets still pass (bubbles must not keep the loop running when everyone is
  idle and no bubble is animating), and a contact sheet from `tools/shoot.ts` shows bubbles and
  signs.

## Rules

Follow `AGENTS.md`. Work in your own worktree on a branch named `s5-sass` and land through a PR
with CI green. Don't push to `main`, and don't merge your own PR.
