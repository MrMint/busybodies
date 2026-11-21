# S3: richer capture

Give the scene the events its jokes and acting need. The watcher sees sessions, agents, state
and the last tool call today; the design needs more. Read first: `AGENTS.md`, `docs/plan.md`,
`docs/decisions.md` (the watcher spike and the gaps it lists), `src/watcher/` and
`test/watcher.test.ts`, and the line bank's trigger groups in `design/generators/r3.py` (`BANK`),
which list the events the sass reacts to.

## You own

`src/watcher/` and its tests, `tools/watch-tree.ts`, and new tools for hooks and recording. Don't
change the scene (`src/mainview/`, `src/scene/`) beyond the shared types in
`src/watcher/model.ts`.

## Build

1. **Signals from records the transcripts already hold.** Find each in real files on this
   machine; never copy real content into the repo. Signals:
   - the running tool and how long it has run (a 40-minute build)
   - failed shell commands and test runs (exit codes, a failure count in a row)
   - retries of the same command
   - PRs opened (the transcript has PR-link records)
   - cost so far (cost-state records)
   - compaction

   Add each to the `Snapshot` contract with clear names and units.
2. **Waiting on you.** The most important signal, and missing today.
   - Add an opt-in installer (`tools/hooks.ts install|uninstall|status`) that adds a small
     `Notification` hook (and whichever other hook events help) to the user's agent settings.
   - The hook must never block the agent: it appends one line to a small file under the agent
     home, and the watcher reads that file.
   - Use whatever the desktop app's session index shows as a fallback.
   - Make install and uninstall exact and reversible, and back up the settings file first.
   - **Never run the installer against the owner's real settings yourself.** Test it against a
     temp home.
3. **Record, anonymize, replay** (`docs/instrumentation.md` item 7).
   - `tools/record.ts` captures the live snapshot timeline to NDJSON, replacing every title,
     path, branch, id and task text with invented names. Make it deterministic, so the structure
     survives.
   - `?replay=<fixture>&speed=8` plays a recording in the scene.
   - Check fixtures with `tools/scan-private.sh` before they're committed. Add one short
     anonymized fixture of a busy release, and read every line of it before committing.
4. **Narrow the watch.** File events from projects with no live session shouldn't trigger
   rebuilds (`docs/decisions.md` lists this gap).

## Done when

- Each new signal has invented-data unit tests in the temp-home style of `test/watcher.test.ts`,
  and `tools/watch-tree.ts` shows it live.
- The hook installer round-trips against a temp settings file: install, status, then uninstall
  leaves it byte-identical. It never blocks: the hook exits 0 within 50 ms even if the file is
  unwritable.
- A recorded fixture replays in `?demo`'s scene, and the scan is clean.
- The watcher's cost doesn't regress (`tools/fake-home.ts` plus `tools/profile.sh`); report the
  numbers in the PR.
- `docs/decisions.md` records each signal's source and its known unreliability.

## Rules

Follow `AGENTS.md`. Above all, the watcher only reads, and real session data never lands in the
repo. Work in your own worktree on a branch named `s3-richer-capture` and land through a pull
request with CI green. Don't push to `main`, and don't merge your own PR.
