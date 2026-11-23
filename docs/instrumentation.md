# Instrumentation plan

Two goals, served by the same tools: knowing what the app costs, and letting an agent build the
scene quickly, cheaply and with evidence. The rule behind every item is **an agent should be able
to check its work with a command or a short query, not by asking a human to look**. Screenshots
are the expensive fallback.

The first profiling pass showed why this matters. An idle scene cost about 5% of a core in two
processes. Pixi's global tickers were running 120 animation frames a second, and nothing in the
code showed it. A test that counts animation frames would have caught it on day one.

## What exists

| Tool | What it gives |
|---|---|
| `bun tools/watch-tree.ts` | The watcher's live tree, with rebuild count, build time, CPU and memory |
| `bun tools/fake-home.ts` | A synthetic agent home with a set number of sessions, agents, busy share and tool-call rate |
| `tools/profile.sh` | Launches the app against a fake home and reports CPU for the Bun and WebContent processes |
| `?demo`, `?demo=idle` | An invented office (busy, or after hours) that runs in any browser through Vite |
| `?demo=release` | A lead and six builders on a release: tools change, a test goes red, one finishes, the PR goes up (frozen with `&frozen`) |
| `?blank`, `?blank&norpc` | The app without the scene, to separate Electrobun's own cost from ours |
| `BUSYBODIES_SCENE_QUERY` | Passes any of these modes to the app's window |
| `window.__busybodies` | The inspector (dev builds, or `?inspect`): snapshot, characters, frame counters, `freeze()` and `step(n)`, the office `layout()`, `camera()` and `goTo(stop)`, and the sign slots |
| `bun test e2e/` | Frame budgets in headless Chrome, in CI: idle makes zero frames, busy renders at 30 fps or less, camera moves run at 60 only while moving, and a frozen scene steps identically |
| `bun tools/shoot.ts` | Named scene states (fixture, camera stop, size) to PNGs plus a contact sheet, from a frozen clock; `--check` renders each twice and fails on any difference |
| `bun tools/record-gif.ts` | The README's GIF, stepped from the frozen demo; the text it draws is scanned for private data first |
| `?demo=stock` | Someone else's setup: only the agent tool's own subagent types, terminal sessions, branches from git |
| `?demo=empty`, `?demo=nohome`, `?compact`, `?about` | The empty office, "no coding agent found", the compact window's scene, and the About screen |
| `?frozen` | Starts the scene with its clock stopped; only the inspector's `step(n)` moves it |

## Planned, in order

Items 1 (the inspector), 2 (frame-budget tests) and 5 (deterministic screenshots) are built; see
above.

3. **A perf HUD (`?hud`, or a key).** Shows fps, renders per second, draw calls, display-object
   and texture counts, snapshot rate, the watcher's build time (p50/p95) and file events per
   second, RPC payload size, and both processes' memory. The Bun side reports its numbers over
   RPC.
4. **Metrics as NDJSON.** Both processes append one line every few seconds to a local log. Then
   `tools/profile.sh` can report from the app's own numbers rather than `ps`, and a run can be
   compared with the last one. Budgets live in a checked-in file, and the profiler fails when one
   is exceeded.
5. **Deterministic screenshots, `bun tools/shoot.ts`.** It renders named scene states (fixture,
   frame, size) to PNGs plus one contact sheet, with seeded randomness and a frozen clock, so two
   runs give identical images and a visual diff means a real change.
6. **Pose sheets and text dumps for the character rig.** Every pose's frames go in one sheet, and
   each frame's parameter object prints as text. An agent reviews a new pose by reading, at a
   fraction of a screenshot's cost.
7. **Record, anonymize, replay.** `tools/record.ts` captures a live snapshot timeline and replaces
   every title, path, branch and id with invented names (deterministic, so the structure
   survives). `?replay=<fixture>&speed=8` plays it back. Real busy days become shareable fixtures,
   and `scan-private` checks them on the way in.
   *Landed with S3:* `bun tools/record.ts --out fixtures/<name>.ndjson [--drop-idle]`, then
   `?replay=<name>&speed=8[&loop]`. `fixtures/busy-release.ndjson` is the first one, and
   `e2e/replay.test.ts` plays it.
8. **Dev menu in the app.** Toggle the HUD, switch fixtures, reload the scene, and open the
   metrics log.

Hooks (the agent tool's `Notification` event) are a capture feature, not instrumentation. They
come with "waiting on you".
