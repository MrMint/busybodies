# Architecture review (2026-11-23)

A read of `src/` at `c8f2f81` (0.6.0), brought up to date after the QA PRs #30, #31, #33, #34 and
#35 merged (sound, polish, robustness, theme parity, performance): 115 files, about 29k lines.
Voice (#32) is still open; where it changes the picture, this review says so. It covers how the layers really
depend on each other, where theme code lives, which files do more than one job, what is
duplicated, and what tooling now checks. The moves it proposes are in
[`restructure-plan.md`](restructure-plan.md). They run after voice (#32) and this PR have merged.

Words used here: a **module** is anything with an interface and an implementation. A **seam** is
where a module's interface lives. A module is **deep** when a small interface hides a lot of
behaviour.

## 1. The layers as they are

The pipeline from `docs/plan.md`, with the folders that hold each stage:

| Stage | Where | Pixi? | Reads |
|---|---|---|---|
| watcher | `src/watcher/` | no | the agent tool's files, `node:*` |
| snapshot | `src/watcher/model.ts` | no | nothing: it is the contract |
| shared | `src/shared/` | no | `model.ts` (and, wrongly, `scene/rig/roles`) |
| director | `src/scene/director.ts`, `src/scene/director/`, `src/scene/sass/` | no | snapshot, the floor plan, pose data |
| world (floor plan) | `office/world.ts`, `layout.ts`, `placement.ts`, `camera.ts`, `daylight.ts`, `staging.ts`, `propspots.ts`, `rigpoints.ts`, `crate.ts`, `decor-plan.ts` | no | snapshot, theme words |
| rig data | `rig/poses.ts`, `frame.ts`, `vocab.ts`, `roles.ts`, `gaze.ts`, `motion.ts`, `reach.ts`, `player.ts`, `life.ts`, `pack.ts` | no | each other |
| scene (drawing) | `office/office.ts`, `ambient.ts`, `light.ts`, `outside.ts`, `paper.ts`, …; `theme/*`; `rig/theme.ts`, `rig/<theme>.ts`, `atlas.ts`, `puppet.ts`, `character.ts` | yes | everything above |
| render (app) | `src/mainview/` | yes | everything; it wires the director to the office |
| main process | `src/bun/` | no | watcher, shared, `scene/theme/id` |

The rule in practice is that **director, sass, watcher and shared never import `pixi.js`**, and
nothing in them does today. That rule is the one worth keeping and enforcing.

The folders don't follow that rule, though. `office/` and `rig/` each mix a Pixi-free data half
with a drawing half, so the import graph *looks* tangled even where it isn't:

- `scene/director → scene/office` (24 imports) and `→ scene/rig` (17). Almost all of them go to
  the Pixi-free halves (`world.ts` 13, `rig/player.ts` 6, `poses.ts` 4, `roles.ts` 4). The three
  that reach drawing files are type-only: `Mood`, `Cue`, `Walk`, `Who` and `Point` from
  `office/slot.ts`, and `StoryView` from `office/decor.ts`.
- `scene/office ↔ scene/theme` is a real cycle. Theme painters import `office/paper.ts`,
  `world.ts`, `propspots.ts`, `staging.ts` and `light.ts` (`mix`). `office/office.ts` imports
  `theme/office.ts` (`NIGHT_WATCH` and the default theme), `theme/arm.ts` and `theme/build.ts`.
  `theme/types.ts`, the seam itself, imports four `office/` modules.
- `scene/rig/character.ts → director/paths.ts` (`along`, `heading`, `lookMs`), and
  `rig/reach.ts`, `rig/sheet.ts → director/stations.ts`. Here drawing reaches back into the
  director for walk geometry and station names.
- `scene/office/{props,office}.ts`, `theme/*.ts → director/metrics.ts` for types (`DeskProps`,
  `Tray`, `Lamp`, `PlannerRow`). Those types belong to the contract between director and scene.
  They shouldn't live in the director's implementation file.
- `scene/office/world.ts → director/stations.ts` (`STATION_REACH`). The floor plan depends on
  the director.
- `shared/diary.ts → scene/rig/roles.ts` (`roleFor`). `shared/` is meant to sit below both
  processes, but it depends on scene code. It works only because `roles.ts` happens to be
  Pixi-free.
- `bun/{index,menu,tray,settings}.ts → scene/theme/id.ts`. The main process reads a scene file.
  It is Pixi-free, but it belongs in `shared/`.
- `scene/office/office.ts`, `layout.ts`, `placement.ts → watcher/model` (`Session`,
  `Snapshot`). `docs/plan.md` says "drawing code never reads the snapshot itself", but
  `Office.show(snapshot, …)` takes the whole snapshot. It walks sessions for running builds
  (`buildRunning`), desk cards (`deskCard`) and labels. These are facts the director could hand
  over in its `World`.

Two different things are both called `World`: `director/types.ts World` (actors, runs, builds)
and `office/world.ts World` (the floor plan). Every file that needs both imports one of them as
`Floor`. That alias is the floor plan's real name.

**Proposed layers** (each imports only from the rows above it):

```
watcher/model.ts                    the contract
watcher/            shared/         capture, and code used by both processes (theme ids live here)
scene/world/                        the floor plan and its geometry: Pixi-free (today's office/ data half)
scene/rig/data/     (or rig/ data)  poses, frames, roles, vocab, reach: Pixi-free
scene/director/     scene/sass/     snapshot + floor + poses → World and events: Pixi-free
scene/contract.ts                   what the director hands the scene (DeskProps, Tray, Lamp, Mood, Cue, Walk…)
themes/<id>/                        painters, rig repaints, words, lines, sound bed, behind ThemePack
scene/office/       scene/rig/      the drawing: Office, Puppet, Atlas, light, ambient
mainview/           bun/            the apps
```

## 2. Theme code is scattered

Adding a fourth theme today touches at least these, by hand:

| What | Where | How it's keyed |
|---|---|---|
| the id | `scene/theme/id.ts THEME_IDS` | tuple |
| room, hall and furniture painters, light, stage painters | `scene/theme/<id>.ts` (962 / 889 / 1380 lines) | `SceneTheme` const |
| the registry | `scene/theme/index.ts THEMES` | `Record<ThemeId, SceneTheme>` |
| staging | `theme/factory-staging.ts`; bakery's sits inside `theme/bakery.ts`; office's is `office/staging.ts DEFAULT_STAGING` | `SceneTheme.staging` |
| robot arms | `theme/arm.ts`, `theme/armplan.ts` (factory only) | `SceneTheme.arms: boolean` |
| rig repaints | `scene/rig/<id>.ts` (551 / 857 / 1334 lines) over `rig/theme.ts paperTheme` (1425) | `rig/themes.ts RIGS` |
| words | `scene/theme/words.ts`, all three in one file | `WORDS: Record<ThemeId, …>` |
| sass lines | `sass/lines-factory.ts`, `lines-bakery.ts`; the office's are the base `lines.ts` | `sass/bank.ts BANKS` |
| reworded shared lines | inline `themed: { factory: "…", bakery: "…" }` on lines in `sass/lines.ts` | per line |
| sound bed | `mainview/sound.ts BEDS`, read by `roomBed(theme, …)` | `Record<ThemeId, …>` (since #30) |
| sound beats | `Sound`'s scheduler loop: `if (theme === "bakery") … else if (theme === "factory") … else`, with `bakeryBeat`, `clack`, `key` | branches |
| voices and room loops (#32) | `public/voice/manifest.json themes`, `public/ambience/sources.json`, generated by `tools/voice.ts` and `tools/ambience.ts`; read by `mainview/speech.ts` | data keyed by theme id |
| pose words | `theme/words.ts poseWords` | per theme |
| tests, shots | `test/theme*.test.ts`, `e2e/theme.test.ts`, `tools/shoot.ts --theme` | loops over `THEME_IDS` (good) |

That is five code registries (`THEMES`, `RIGS`, `WORDS`, `BANKS`, `BEDS`), one set of branches
(the beats), and, with voice, two data files keyed by theme. There are also three naming patterns (`theme/<id>.ts`, `rig/<id>.ts`, `lines-<id>.ts`). The `SceneTheme` seam is
good: two real adapters behind it, now three, and it is a deep interface. The trouble is that
it covers only the floor. The rig, the words, the lines and the sound each have their own seam
with its own registry. The voice and ambience manifests are generated data and can stay data. A
pack doesn't need to own them, but a test should check that their theme keys are all in
`THEME_IDS`.

**Proposal: one folder per theme behind one `ThemePack`.**

```
src/themes/
  ids.ts              THEME_IDS, ThemeId, themeId(): Pixi-free, read by bun/ and shared/
  pack.ts             interface ThemePack (below), and the seam's shared kit (see §4)
  index.ts            THEME_PACKS: Record<ThemeId, () => ThemePack>; themePack(id)
  office/
    index.ts          export const OFFICE: ThemePack
    scene.ts          today's theme/office.ts (the SceneTheme)
    rig.ts            today's rig/office.ts
    words.ts          OFFICE_WORDS
    lines.ts          the office-only lines (today's `office: true` lines in sass/lines.ts)
    sound.ts          the office's bed (its `BEDS` entry) and typing beat
  factory/
    index.ts, scene.ts, rig.ts, words.ts, lines.ts, sound.ts
    staging.ts        today's theme/factory-staging.ts
    arm.ts, armplan.ts
  bakery/
    index.ts, scene.ts (split, §3), rig.ts (split, §3), words.ts, lines.ts, sound.ts, staging.ts
```

```ts
// src/themes/pack.ts
export interface ThemePack {
	id: ThemeId;
	scene: SceneTheme;              // painters, light, staging, stage painters: as today
	rig: () => RigTheme;            // today's rigTheme(id)
	words: ThemeWords;
	sass: { own: Line[]; reword?: Record<string, string> }; // replaces BANKS and inline `themed`
	sound: { bed: Bed; beat: BeatFn };                       // replaces BEDS and the scheduler's branches
}
```

Adding a theme then means adding a folder, plus one line in `ids.ts` and one in `index.ts`. A
test asserts the two agree; the test exists in spirit today (`test/theme*.test.ts` loops
`THEME_IDS`). The ids file has to stay separate and Pixi-free, because `src/bun/` reads it and
must not load painters.

What stays shared and doesn't move into theme folders: `scene/theme/build.ts` (the stacking every
theme uses), `rig/theme.ts paperTheme` (the base every rig repaints, renamed `rig/paper.ts`), and
`sass/lines.ts` (the shared lines). The `themed:` rewordings move out of the shared lines into
each theme's `lines.ts` as `reword`, keyed by the shared line's text or a new short id. Then
`lines.ts` stops naming themes at all.

Bundle size isn't a reason to avoid this. Today every theme is already bundled (`THEMES` imports
all three eagerly). A `() => ThemePack` registry keeps the option of lazy `import()` later.

## 3. Large files that mix jobs

| File | Lines | Jobs mixed | Proposed split |
|---|---|---|---|
| `scene/director/direct.ts` | 1486 | `direct()` is one ~610-line function (349–958), plus specs, spot assignment, standing/acted choices, hand-offs, mail, trips, foreman visits, brick runs, builds, cues, ripples | `direct/specs.ts` (Spec, `specs`, traits, gait), `direct/places.ts` (`assign`, `commonSpots`, `doorPlace`, `OUT_ORDER`), `direct/choice.ts` (`standing`, `acted`, `poseMs`), `direct/handoff-mail.ts` (`handOffsFor`, `mailFor`, `celebratesMail`), `direct/builds.ts` (`brickRun`, `buildsFor`, `foremanVisits`), `direct/cue.ts` (`here`, `cueFor`). Then break `direct()` into named phases that it calls in order. `direct.ts` keeps `direct`, `RULES` and `DirectOptions` |
| `scene/rig/theme.ts` | 1425 | the palette, shared drawing helpers (`line`, `text`, `mochiPath`, `rotRect`, `burstAt`, `sparkle`), and `paperTheme()`, one ~1190-line function holding every part painter | `rig/paper/palette.ts`, `rig/paper/ink.ts` (helpers), and `paperTheme` split by layer: `body.ts`, `face.ts`, `arms.ts`, `props.ts`, `stations.ts`, `effects.ts`. Each exports `Record<partName, Painter>`, and `paperTheme` merges them |
| `scene/office/office.ts` | 1390 | layer setup, camera and stops, baking and re-baking textures, clouds, story decor, desks and their props, bubbles, labels, brick tweens, light | `office/bake.ts` (`Baked`, `#bake`, `#rebake`, `#targetRes`), `office/desk.ts` (`#desk`, `deskCard`, brick moves `setDown`/`tumble`/`moveBrick`), `office/bubbles.ts` (`bubble`, `setBubble`, `say`), `office/labels.ts`. `Office` stays the one class: these become internal modules it calls |
| `scene/theme/bakery.ts` | 1380 | ~30 colour constants, a pastry library (`croissant`…`cup`, exported only for itself), shell and room, desk props, a ~350-line `furniture()` switch, cake build, order board, light, stage, staging, patio | `themes/bakery/palette.ts`, `pastries.ts`, `room.ts`, `desk.ts`, `furniture.ts`, `stage.ts`, `outside.ts`, `scene.ts` (assembles `BAKERY_THEME`) |
| `scene/rig/bakery.ts` | 1334 | sweet accessories, clip and band geometry, repaints | `themes/bakery/rig/geometry.ts` (`clipConvex`, `bands`, `drips`, `sprinkles`, `gloss`), `rig/outfits.ts`, `rig/kit.ts` (station repaints), `rig.ts` |
| `scene/rig/poses.ts` | 1284 | data only: `POSES` and three helpers | Not mixed. Split by trigger family (typing, habits, waiting, events, stations) only if merges keep colliding. It's cheap to leave as is |
| `scene/theme/factory.ts`, `office.ts` | 889, 962 | same shape as bakery, at less risk | Same split as bakery, done in the same folder move |
| `mainview/sound.ts` | 806 | the pure rules (`LIMITS`, `Gate`, `Voices`, `vary`, `seq`, `hashId`, `loudness`, `panFor`, `zoomedArea`, `heatOf`), the Web Audio graph (`masterChain`, `makeNoise`, the kit), earcons and their levels, `Ears`, three theme beds and three beats | Voice (#32) adds `mainview/speech.ts` (about 300 lines), which imports `hashId`, `seq`, `loudness`, `panFor` and `zoomedArea` from `sound.ts`. That shared use is the seam. Make a `mainview/audio/` folder: `plan.ts` (the pure rules, which both players use), `graph.ts` (master chain, noise, kit), `sound.ts` (earcons), `speech.ts`. The beds and beats move to `themes/<id>/sound.ts` |
| `scene/office/ambient.ts`, `world.ts` | 734, 711 | OK. `world.ts` is the floor plan's whole vocabulary, so it can stay one file | none |

## 4. Duplication

Across the three themes:

- **`mix(a, b, t)`, colour lerp**, defined six times: `office/light.ts` (exported),
  `theme/factory.ts`, `theme/bakery.ts`, `rig/factory.ts`, `rig/bakery.ts` (and `rig/player.ts`
  has a different `mix(h)`, a hash mixer, under the same name). One `ink.ts mix`.
- **Station extents `ST_L = -24`, `ST_R = 24`**, defined three times, in each `theme/<id>.ts`.
  They are the rig's working point and belong next to `world.ts DESK_TOP`/`STATION`.
- **The desk/bench body**: `bench(g, w = 150, …, back = -70)` in factory and bakery, and
  `desk(g, front, top, w = 150, back = -70)` in office. Each theme file has 9–13 literal `-70`,
  `-38` and `150` (the desk's back, top surface and width), and `world.ts DESK_TOP = -60` says
  something else again. Name them once: `DESK = { w: 150, back: -70, top: -38 }`.
- **`WOOD = 0xd9a066`, `WOOD_TOP = 0xf0c48a`**, in all three theme files.
- **`rugOf(a)`** in office and bakery. **`shell()`** (room walls and floor) in factory and
  bakery, with the same skeleton as office's `roomShell`.
- **Stage painters `belt`, `slats`, `rollers`**: factory's and bakery's have the same geometry
  and different colours. They could become one `conveyor(colours)` in the theme kit.
- **`hazard()` stripes**: `theme/factory.ts` and `rig/factory.ts`, with different step defaults.
- Planner: `plannerOf(r, rows, board, columns)` in `theme/office.ts` is already shared by the
  factory (`jobBoard`). Bakery's `orderBoard` is a copy that isn't. It belongs in the kit.

Elsewhere:

- **`hash(s)`**, four times: `office/paper.ts`, `mainview/placeholder.ts` (same body),
  `rig/player.ts`, `sass/types.ts` (different bodies). Also `sound.ts hashId`, which voice's
  `speech.ts` reuses, and voice's `sass/voiced.ts` uses `sass/types.ts hash`. The scene's
  determinism rule depends on these. Two different string hashes are fine. Four, with two under
  one name, is a trap: one `shared/hash.ts` with named variants.
- **`sameStop(a, b)`**: byte-identical in `mainview/shots.ts` and `director/shots.ts`. Export it
  from `office/camera.ts` next to `Stop`.
- **`crewSize(depth)`**: identical in `director/direct.ts` and `office/placement.ts`. Its numbers
  (40, 58, 8) decide character sizes in both places, and they will drift.
- **`poseMs`**: three versions (`direct.ts`, `story.ts`, `errands.ts`). Make one in `rig/poses.ts`
  next to `duration`.
- **`MIN = 60_000`**: three times (`direct.ts`, `habits.ts`, `sass/detect.ts`, which exports it).
  Add a `shared/time.ts` with `SEC`, `MIN`, `HOUR`.
- **`mugsFor`**: two different functions under one name. `director/metrics.ts` uses
  `METRICS.maxMugs` and cups, `sass/signs.ts` uses `6` and idle minutes. **`localDay`**: two
  definitions with different output formats (`shared/diary.ts`, `sass/signs.ts`). **`heatOf`**:
  two different functions (`director/rush.ts`, `mainview/sound.ts`). Rename so each name means
  one thing.
- **`optional(key, value)`**: identical in `watcher/snapshot.ts` and `watcher/ledger.ts`.
- **`clamp`**: three times, two different signatures.
- **`flat(sessions)`**, the session-tree flatten: six copies (`bun/mood.ts`, `mainview/hud.ts`,
  `mainview/shell.ts`, `director/shots.ts`, `office/office.ts`, `shared/diary.ts`). Put it in
  `watcher/model.ts` as `allSessions(snap)`.

## 5. Magic numbers, types, dead code

### Numbers to name

- Desk geometry, as above (`-70`, `-38`, `150`, `±24`, and `DESK_TOP = -60`, which doesn't match
  the `-70..-38` desk top the theme headers describe). This is the highest-value one: the rig's
  solved reaches depend on these points.
- `crewSize` (40, 58, 8). `mugsFor` in `signs.ts` (6, 10). `roomBounds` in `office.ts` (70, 140).
- `office.ts`'s `STEPS`, `MAX_TEXTURE = 4096` and `HALL_CHUNK = 640` are already named. Good.
  Most modules already gather their tuning into one `RULES`/`METRICS`/`SHOTS`/`LIMITS` object,
  and new tuning should follow that pattern.

### Types that could be tighter

- **Station ids as strings.** `mainview/sound.ts` parses them with `station.split(":").at(-2)`,
  `rig/roles.ts` does `key.split(":")[1] as Role`. Make an id a branded string built and parsed
  in one place (`director/stations.ts stationId()`/`parseStation()`), or carry
  `{ area, kind, n }` on the actor.
- **Work kinds as `string`.** `StagePainters.part(g, kind: string)`, `bakery.ts PARADE`, and
  `Office.arms` jobs `kind: string` are really `WorkKind` (`director/work.ts`).
- `shared/rpc.ts` uses `{}` as a type twice (Biome `noBannedTypes`). Use `Record<string, never>`.
- `Office.show(snapshot)` gets the whole snapshot when it needs about four facts (see §1).
- The watcher casts `as Record<string, unknown>` and `as { x?: unknown }` about 15 times in
  `ledger.ts`. See §7 for a helper that removes most of them.
- There are only 2 `any` and 5 `as unknown` in `src/`. Type discipline is good overall.

### Dead code (knip, Biome)

knip finds **no unused files and no unused dependencies**. It finds **132 unused exports and
31 unused exported types**. The merges removed three (`look.ts`, gone with the pixel and night
looks) and added four (`sound.ts` `roomBed`, `masterChain`, `makeNoise` and `MASTER`, which only
`sound.ts` uses, and which voice doesn't use either). Most are one of:

- **Barrel re-exports nobody uses.** `scene/rig/index.ts` (≈25 names), `scene/director.ts`
  (`direct`, `RULES`, `here`, `cueFor`, `pathBetween`, `walkMs`, `WALK_SPEED`, types),
  `scene/theme/index.ts` (`THEME_IDS`, `DEFAULT_THEME`). The barrels are shallow: everyone
  imports the files directly. Delete the barrels, or make them the only door. Don't keep both.
- **`export` on file-local helpers.** The bakery pastry library (`croissant` … `cup`, 11
  functions), `BAKERY_LIGHT`/`FACTORY_LIGHT`/`OFFICE_LIGHT`, `*_STAGE`, `*_STAGING`, `LAWN`,
  `SLAB`, `HALL_FLOOR`, and the four `sound.ts` names above. These are harmless, but they make every helper look like part of the
  interface. Drop the `export` keyword.
- **Truly unused.** `director/metrics.ts contextShare`, `deskState`, `planners`, `agentsOf`,
  `familyWord`; `office/layout.ts yardsOf`; `office/paper.ts nameTab`; `director/dodge.ts
  sidestep`; `watcher/snapshot.ts isAlive`; `watcher/git.ts gitdirOf`, `branchOf`;
  `shared/diary.ts shortHash`, `lastDays`; `mainview/demo.ts demoSnapshot`, `asleep`. Check
  each against the open QA PRs before deleting, since one of them may be about to use it.

Biome's lint (with the house-style rules switched off; see §8) reports 28 warnings: 5 groups of
unused imports (`direct.ts`, `decor-plan.ts`, `office.ts`, `theme/factory.ts`,
`test/director.test.ts`), unused `lastAtOf` in `direct.ts:958`, 8 optional chains (one in the
new `office/depth.ts`), 6 unused parameters, 2 `{}` types, 2 type-only imports, 2 names that
shadow a global (`tools/shoot.ts`, `test/sass.test.ts`), 1 lone block and 1 `let` to `const`. All are safe fixes:
`biome lint --write` fixes most of them.

## 6. Patterns to adopt, and what not to pull in

**Adopt:**

- **Pure core, imperative shell.** It's already the house pattern (`direct()`, `nextShot()`,
  `newsFrom()`, `bakeryBeat()`, sound's `Gate` and `loudness`), and it is why 448 unit tests run in a few seconds
  without a browser. Keep new logic in Pixi-free modules that return data, with a thin Pixi or Web Audio
  side that applies it.
- **One registry per seam, keyed by `ThemeId`, checked by a test** (§2). Today there are five.
- **A tuning object per module** (`RULES`, `METRICS`, `SHOTS`, `LIMITS`). Put new magic numbers
  there, not inline.
- **Contract files that name their consumers**: `watcher/model.ts`, `director/stations.ts` ("the
  contract between the director, the office and the rig: names only"). Do the same for
  `scene/contract.ts` (§1), so drawing code imports types from there and not from
  `director/metrics.ts`.
- **Lint for layer rules.** This PR already uses Biome's `noRestrictedImports` in an override
  to ban `pixi.js` in `watcher/`, `shared/`, `scene/director*` and `scene/sass/`, enforced in
  CI. Once the folders in §1 exist, extend it: add `scene/world/` and the rig's data folder to the
  Pixi-free list, ban `scene/**` from `shared/` and `bun/`, and ban `themes/*/` from importing
  each other.

**Don't pull in:**

- **valibot / zod for the watcher** (§7).
- **An ECS** (bitecs, miniplex). The director's `World` is already a plain data snapshot that's
  rebuilt every call, and an ECS would replace a pure function with a mutable store.
- **A DI container or event bus.** Constructors take their dependencies (`OfficeOptions`,
  `SoundHost`) and that's enough.
- **GSAP, @pixi/react, @pixi/ui, pixi-viewport.** `AGENTS.md` rules out the first two. The camera
  (`office/camera.ts`) and tweens (`rig/motion.ts`) are small and tuned to the render-on-demand
  rule.
- **A monorepo or packages split.** Folders and lint rules give the same boundaries without a
  build graph.
- **ESLint + Prettier alongside Biome.** One tool. Biome has no type-aware rules. `tsc --noEmit`
  covers types, and that's enough here.

## 7. Watcher parsing: valibot?

The guards are real and repetitive, but almost all of them live in one file. `ledger.ts` has
about 40 of the form `typeof x === "string" ? x : undefined`,
`typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0` (written twice: `ledger.ts
tok`, `anonymize.ts n`) and `(x && typeof x === "object" ? x : {}) as {…}`. `snapshot.ts` has a
handful, and `models.ts`, `replay.ts` and `files.ts` a couple each.

valibot doesn't fit, for three reasons:

1. **The rule is per field.** "Every field optional, unknown records skipped, a torn write
   keeps the last good value." In valibot that's `v.optional(v.fallback(v.string(), undefined))`
   on every field of every record shape, nested for `message.content[]` blocks. The schemas
   would be longer than the guards, and they'd describe a format we don't own and that changes
   between versions.
2. **The hot path parses by text first.** `Ledger.line()` checks `line.includes('"tool_use"')`
   before it parses, and counts tokens from response records without parsing them at all
   (`#tokens`). A schema can't help there, and a per-record schema pass on megabyte transcripts
   costs CPU in the one place `tools/profile.sh` watches.
3. **It's a second runtime dependency** for a project that has kept exactly one (`pixi.js`).

**Recommendation:** a ~20-line `src/watcher/read.ts` with `str(v)`, `num(v)` (finite),
`count(v)` (finite, ≥ 0), `obj(v): Record<string, unknown>`, `arr(v): unknown[]`, and the shared
`optional(key, value)`. It replaces the casts and the two copies of `tok`/`n`. It's a mechanical
change, best done in its own commit. The robustness PR (#33) has landed, so nothing open is
editing these files now.

## 8. Tooling added in this PR

- **Biome 2.6.6** (`biome.json`): tabs, double quotes, semicolons, trailing commas, line width
  160. **Lint is enforced in CI** (`biome ci --formatter-enabled=false`). It uses Biome's
  recommended preset, minus the rules that fight this codebase's deliberate idioms:
  `noNonNullAssertion` (1,441 hits, mostly `arr[i]!` and `map.get(k)!` on reads the code knows
  are present),
  `noCommaOperator`, `noAssignInExpressions` (`(m[k] ??= []).push`),
  `useIterableCallbackReturn` and `noVoidTypeReturn` (`forEach((x) => set.add(x))`,
  `return this.#tokens(line)`), and `useDomNodeTextContent`. The 26 real findings in §5 are
  warnings for now. Promote them to errors once the cleanup commit lands. An override makes any
  `pixi.js` import in the Pixi-free layers an error (§6).
- **The formatter is configured but not enforced.** The code is hand-wrapped, so any formatter
  rewraps a lot of it:

  | line width | files changed | lines +/− |
  |---|---|---|
  | 100 | 156 | +19,074 / −4,642 |
  | 120 | 138 | +12,133 / −3,331 |
  | **160 (chosen)** | **113** | **+7,327 / −2,510** |
  | 320 | 93 | +5,419 / −2,653 |

  Even at the widest setting it touches 93 of 173 files, mostly by joining hand-split arrow
  bodies and splitting long object literals. The heaviest are `rig/bakery.ts` (861 lines),
  `theme/bakery.ts` (667), `rig/theme.ts` (570), `rig/factory.ts` (531) and `rig/poses.ts` (481):
  the theme files, where most theme work happens. So it waits for a single **format-all
  commit**, run after voice (#32) and this PR merge and before the restructure moves, with its SHA added to
  `.git-blame-ignore-revs`. After that, CI switches to plain `biome ci .`.
- **knip 6.44.2** (`knip.json`). CI fails on unused files, dependencies, unlisted dependencies
  and unresolved imports (all zero today). It reports unused exports and types without failing
  (163 today, §5). Once the barrels and stray `export`s are cleaned up, add `exports,types` to
  the failing set.
- Scripts: `hutch run lint`, `hutch run format`, `hutch run knip`.
