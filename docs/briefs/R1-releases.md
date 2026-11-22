# R1: releases people can download and run

Make Busybodies installable by someone who isn't us, unsigned for now. Read first: `AGENTS.md`,
`docs/plan.md`, `docs/decisions.md`, `README.md`, `electrobun.config.ts` and `hutch.config.ts`,
plus Electrobun's docs on building, the updater, and code signing.

## Decided

- **Ship unsigned first.** No Apple Developer account yet. Leave signing and notarization as
  workflow steps that run only when their secrets exist, so adding them later is configuration
  only.
- **The main install path is a one-line script** that people can read first:
  `curl -fsSL https://raw.githubusercontent.com/MrMint/busybodies/main/install.sh | sh`. Files
  fetched by `curl` aren't quarantined, so Gatekeeper doesn't block the app.
- **Building from source is the second path.** The browser `.dmg` route is documented honestly,
  including the System Settings → Privacy & Security → Open Anyway step. Verify the current
  macOS steps; don't trust anyone's memory, including this brief's.
- **Apple Silicon only for now.** On Intel, the script says so plainly and exits.

## You own

`.github/workflows/release.yml` (new), `install.sh` (new, at the repo root), the build, icon and
updater settings in `electrobun.config.ts`, the updater wiring in `src/bun/`, app icon assets,
the README's install section, and decisions entries. Don't change `src/scene/`, `src/watcher/` or
`src/mainview/`: other streams own them.

## Build

1. **Release workflow.** On a pushed `v*` tag, build on an Apple Silicon macOS runner with
   Hutch, the same way CI's e2e job installs it. Produce the app archive (and a `.dmg` if
   Electrobun makes one), a `SHA256SUMS` file, and a GitHub Release with them attached. Also
   support a manual run that produces a **draft** release, for testing.
2. **Launchability check.** Apple Silicon won't run binaries with no signature at all. Confirm
   the built app carries at least an ad-hoc signature (`codesign -dv`), and make the workflow
   fail if it doesn't. Then prove the app launches from a fresh download on this machine: run the
   install script, open the app, and see the window.
3. **`install.sh`.** POSIX `sh`, short enough to read in a minute. It finds the latest release,
   downloads the archive, verifies it against `SHA256SUMS` (refusing on a mismatch), and installs
   to `/Applications`, or `~/Applications` if that isn't writable. It prints where the app went
   and how to uninstall. It accepts a version argument, never needs `sudo`, and never touches the
   user's agent settings.
4. **Updater.** Wire Electrobun's updater to GitHub Releases. Test one real update, from one
   draft or pre-release build to a newer one, and record whether macOS quarantines the update
   and whether the updated app still launches.
5. **App icon.** A mochi face, drawn procedurally to match the characters. It replaces the
   missing `icon.iconset` the build warns about.
6. **README.** Install (the script first, then from source, then the `.dmg` with its extra
   step), uninstall, and what the app reads: the agent tool's local files, read-only, and never
   sent anywhere.

## Done when

- A manual workflow run produces a **draft** release whose archive installs with `install.sh` on
  this Mac and launches. Put the evidence in the PR (the workflow run link, the install output,
  and a note that the window opened).
- An update from one test build to a newer one works, or the PR explains exactly why it doesn't
  yet.
- `docs/decisions.md` records the release layout, the checksum scheme, the updater's behaviour
  unsigned, and what adding signing later involves (secrets, steps, cost).

## Rules

Follow `AGENTS.md`. Publishing a release is public and outward-facing: **only draft releases or
pre-releases for testing, and never publish a normal release or push a `v*` tag without the
owner's say-so** (ask through the lead session). Delete test drafts when you're done. Work in your
own worktree on a branch named `r1-releases`, and land through a PR with CI green. Don't push to
`main`, and don't merge your own PR.
