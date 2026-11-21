# S6: polish and ship

Get Busybodies ready for its first public release. Read first: `AGENTS.md`, `docs/plan.md`,
`docs/decisions.md`, `docs/briefs/R1-releases.md` and R1's entries, `README.md`, and the scene
as it stands after S4 and S5.

## You own

The compact floating window and tray icon (`src/bun/`, plus a mode in `src/mainview/`), the
README, `docs/` media, the release notes draft, and decisions entries. Fix small bugs anywhere
you find them, and list each fix in the PR.

## Build

1. **Compact mode.** A small, always-on-top, frameless window showing one room or a summary
   strip. Make it transparent if Electrobun supports that cleanly. Toggle it from the tray icon
   and a keyboard shortcut. The full-screen office stays the default.
2. **Tray icon.** A mochi face that shows the overall mood: busy, all idle, someone waiting on
   you. Its menu has Show office, Compact mode, About, and Quit.
3. **First-run and empty states.** No sessions running: an empty office with a sign and a
   sleeping character, never a blank window. No agent home found: say so plainly. Add a short
   About screen that says what the app reads, read-only, and that nothing leaves the machine.
4. **README.** Lead with a GIF or short video recorded from `?demo` (invented data only), then
   install (R1's script), what it shows, what it reads, privacy, and how to build. Keep it short.
5. **A full check.** Run the whole suite, `tools/profile.sh` for idle and busy, and a 30-minute
   soak with `tools/fake-home.ts --noise` that watches memory growth. Fix what you find, and
   record the numbers in `docs/decisions.md`.
6. **Release candidate.** Bump the version to `0.1.0`. Run R1's release workflow manually for a
   **draft** release, install it with `install.sh` on this Mac, launch it, and record the
   evidence in the PR. Draft the release notes in `docs/release-notes/0.1.0.md`.

## Done when

The PR has the GIF, the soak and profile numbers, and the draft-release install evidence. CI is
green, and the private-data scan is clean on the GIF's source frames too.

## Rules

Follow `AGENTS.md`. **Never publish a normal release or push a `v*` tag**; the owner does that.
Delete any extra test drafts, keeping only the 0.1.0 draft. Work in your own worktree on a
branch named `s6-polish` and land through a PR with CI green. Don't push to `main`, and don't
merge your own PR.
