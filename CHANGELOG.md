# busybodies

## 0.8.0

### Minor Changes

- f968585: Delight, round two: a treat appears on the desk when a room's fifth or tenth PR of the day goes up, or a session crosses a thousand lines changed (a cake in the office, a frosted hex-nut doughnut in the factory, a croquembouche in the patisserie). Desks idle for days gather a cobweb. A very long call now dozes off at the station it went to, on hold at the phone. Plum hands land on their keyboard, sheets and tools at every size, and the closer look draws less often.
- d4fdd1d: Delight, round one: a character's context fills its body out like a plum (and a compaction deflates it); zoomed into a room, each subagent shows what it is doing and its task, and a session's crew stand on a team-coloured ring; click one to poke it and open its card; rain on a red streak, a sunbeam when tests go green, dozing on very long calls, crew who finish together cheer, new hires bud in, and a PR is a team photo. Try ?demo, or ?demo=plum for every size. The README's GIF is re-recorded to show it.

## 0.7.0

### Minor Changes

- e7c3f5e: Busybodies is silent now: sound is gone, and the menu and Settings no longer have a Sound switch. Calm office stays, and a Sound choice saved by an earlier version is simply ignored.
- 600c988: The bakery shows its crew again: an empty bakery, or a floor with a wide gap above the hallway, used to draw nobody at all. The Pixel and Night looks are gone (a saved one opens the usual scene), and Settings has a cleaner sliders button in the top bar.

### Patch Changes

- 8c267c8: The scene costs less to run: about a quarter less CPU busy and a third less on a quiet office with life on, with the same pixels. Things that blink or swap no longer make the whole office rebuild its drawing.
- d39e60b: The factory and bakery demos write their room signs in their own words, not the office's.
- 24b6c16: Quitting is clean on every path: the tray's Quit, ⌘Q (the app now has a menu), the Dock's Quit and logging out all stop the watcher, save the diary and exit within half a second. Closing the office window keeps Busybodies in the menu bar and takes its Dock icon away; clicking the Dock icon or opening the app again brings the office back. The office no longer freezes when one of the agent's session files holds an unexpected value, and it keeps watching when the agent's folder is removed and comes back.

## 0.6.0

### Minor Changes

- bc21864: Looks: pick Plain, Pixel or Night in the settings cog or the tray's Look menu. Pixel draws the office at a quarter of the resolution and blows it up into crisp, chunky pixels; Night keeps the office after hours, lamps on and the moon up, whatever the clock says.
- bc21864: A third theme, The Line: the office as a restaurant kitchen. The crew works in chef whites (a tall toque and headset for the lead, bandanas for the line cooks), todos hang as tickets on the rail, context fills the mise tray, tests are tasted, reviews happen at the pass, a PR goes out as a plate under a cloche, and waiting on you rings Service!. Pick it from the tray's Theme menu or the settings cog.
- 33820c4: The bakery gets the new look: its bakers wear their sweets as accessories (a tall toque, a gingham bow with a baguette through it, a cappuccino balanced on a flat cap, a lollipop cap, a cupcake hat, a tiny tiered cake on a headband) with one small brooch each, so their faces and colours show. At the benches you can see the head baker's whole face, the tills are smaller and lighter, rooms have pale checkered floors with the project's colour on the walls, and the empty corner is a café terrace with umbrellas and lollipop planters. Pose titles and a few lines use bakery words, and idle bakers sip cappuccinos, sneak macarons, lick the cake fork and nap on flour sacks.
- bc21864: Themes own their staging. In the factory each row of a bay is a production line: a belt across the floor with the crew along it, the foreman up in a booth, tool calls riding the belt as parts while the crew hold a kind of work, and PR crates riding the hallway's conveyor to the dock. Each theme has its own ambient life on the life clock (the office: steam off the coffee, a ceiling fan, the copier's light; the factory: a beacon while a build runs, steam vents, weld sparks) that holds still in calm mode, and the factory's crew have their own idle habits: sitting on oil drums, cards on a pallet, kicking the vending machine.
- bc21864: Come back to the office after a while away and the lobby board says what happened while you were out; at dusk it shows the day's ledger.
- ec522e2: The office fits your setup, not just ours. The agent tool's own subagents get proper costumes, and a generic one dresses for the task it was given: a search or research job scouts, a review goes to the meeting room, a test run verifies. Worktrees join their repository's room wherever the folder lives, and sessions show their git branch without the desktop app.
- bc21864: Rooms collect decor through the week: a framed PR on the wall for each merge, a pennant for each day the project came in, a gold star for each red streak fixed.
- bc21864: The office remembers. A small local diary keeps each day's counts and kinds (no project names, titles or paths) next to your settings. A merged PR's reply lands in the room's outbox and its lead walks over to fetch it, carries it back and celebrates; a red test streak that goes green gets a little flourish while the crew look up; and a long session is waved off by the room as it leaves.
- 3909d3f: A new look for the crew: bigger, glossier faces with wide-set eyes, and office outfits worn as accessories (a headset and a loud tie for the lead, a pencil behind the ear and a forgotten sticky note for builders, an eyeshade and pocket protector for the verifier, and more), with the app and menu-bar icons redrawn to match. At the desks you can always see the lead's whole face, and the crew stand in a tidy row in their own room instead of piling up. The office's tools look like office things (a stapler, a crank pencil sharpener, letter trays), and pose titles and the crew's lines use each theme's own words. Rooms have pale floors with the project's colour on the walls, a patio where a bare block used to be, a livelier yard with a path, and a furnished corner office.
- 33820c4: The Bakery theme is now a patisserie gone completely over the top: candy-stripe wallpaper and checkerboard floors in each room's colour, scalloped awnings and fairy lights, glass cases of croissants and cakes, a deck oven glowing in every room, a café with a big steaming espresso machine and a cake cabinet stacked to the ceiling, macaron poufs, and a giant cupcake to nap in. Pastries ride a conveyor down the hallway, a finished PR's cake box rides it to the pick-up hatch, the tasting table's cake turns on its stand, sprinkles drift round the cupcake and marquee bulbs chase round "Order up!". The words follow: orders, batches, BAKING and BOXED on the order board, the day's bake at closing.
- 33820c4: The bakery's crew dress the part: a head baker in the tallest toque, a bread baker in a gingham headscarf, a barista in a flat cap, a candy-maker with a lollipop in their cap, a pâtissier in a puffed toque, a taster wearing a cupcake, and a cake decorator with a tiny tiered cake on a headband. They roll dough, crank a stand mixer, stack dripping layer cakes, pipe icing and torch crème brûlée; the stations are a deck oven of croissants, a proofing drawer, a tasting table, a display counter and a tray of pastries piled to the ceiling, and the confetti is sprinkles.
- bc21864: Regulars: the same project and role come back as the same character every day, sometimes in glasses, and once you've seen them on two days their name shows on the desk card or task tag.
- 33820c4: Polish in the office and the factory. An idle foreman up in its booth now slacks where you can see it: binoculars on the line, a brew, a call, hands behind the head. A PR's crate goes from just where the robot arm sets it down, down the chute and onto the hallway's belt. A merged PR's frame goes up on the wall as its lead gets back to the desk with the reply. Regulars wear more than glasses (a flower, earrings, freckles, a pin, a plaster), and no two on the floor share a name. The kitchen's mug wall hangs clear of the coffee machine and its steam, a fluorescent tube in every office room flickers now and then, and every factory press has a pilot lamp.
- 33820c4: The voice speaks the theme's language. In the factory the crew talks hard hats, the belt, crates and quotas; in the bakery it's proofing, half-baked loaves, glaze, macarons and one more espresso shot, and the wall signs and fridge notes follow suit, so the office's jokes stay in the office. The compact window's room tiles now use the theme's names for each area, and with sound on the bakery has its own quiet room tone: a warm oven hum, now and then a hiss of steam from the espresso machine, and once in a while the little bell over the shop door.

### Patch Changes

- bc21864: A quiet office with life on now draws at 30 frames a second, the same as acting, so blinks, glances and idle habits move as smoothly as everything else.
- bc21864: The kitchen's mug wall hangs clear of the ceiling light and the room's painted name, and the pose names no longer mention hammers and bricks in every theme.
- 41a18a1: A big crew no longer hides the next desk's tower, and the factory's lines keep their crew spaced out instead of piled on each other. The office's tape dispenser is bigger and easier to read, posters make room for the corner plant, and the foreman's office in the factory now has a locker corner. The app icon keeps the sparkle in its eyes at the smallest sizes, and the busy menu-bar face has room around its mouth.
- bc21864: The compact window is a little taller (440 by 340), so the room it cuts to fills more of it.

## 0.5.0

### Minor Changes

- d8be887: The cast notices each other and you: crew look at the teammate whose test went red (the nearest first), the lead and the one it checks on look at each other, waiting leads watch your door, a teammate looks up and raises a hand as a folder arrives, a big crew stands in a staggered arc facing its lead, finished agents pair up for coffee, and when you come back to the office after a while the idle ones look up at you and one waves.
- d8be887: Walks now have a start, a turn and a stop: the cast looks where it is going before setting off, eases in and out, turns through the front and rounds corners. Long loops break their rhythm now and then (the typist stops to read, the builder checks the nail), idle habits keep a gentle rhythm while the office is on screen, opus considers and sonnet nods before acting, and a wait at your office gets visibly worse the longer you leave it.
- d8be887: Sound, off until you turn it on in the menu bar: a desk bell when someone waits on you, a stamp for a green test, a sad two-note for a red one, a rustle for a compaction, a chime for a PR and the copier's grind on a long build, over a quiet room tone, all made in code. The menu also gets Calm office, which stills the idle cast and the sound.
- d8be887: The office is never a still photo while you watch it: everyone blinks and glances around now and then. When the window is off screen (minimized, hidden, behind other windows, or the screen is locked) it draws nothing at all. Calm mode (the system's reduce-motion setting) keeps a quiet office perfectly still.
- d8be887: Compact mode is a live camera: it cuts to the room where something just happened (someone waiting on you, a red test, a PR, a rush, a compaction, a buried in-tray, a feud with the copier), holds it about 20 seconds, and otherwise rests on the busiest room. A strip of room tiles under the picture shows which rooms are busy, rushed or waiting on you; click one to keep the camera there.
- d8be887: The office theme goes full office: the cast dresses as an over-the-top corporate crew (a boss in a loud tie and headset, builders with their tie flung over a shoulder and a pencil behind the ear, an intern with a lanyard, a fleece-vested strategist with a laser pointer, a cardiganed reviewer with glasses on a chain, an accountant in a green visor, a designer in a black turtleneck), builders staple sheafs with a giant stapler and stack reams and binders instead of hammering nails and laying bricks, and the rooms get motivational posters, cubicle walls with family photos, ficus plants, fluorescent panels, a water cooler with paper cones and a mug wall. The factory keeps its construction gear.
- d8be887: The office now has a time of day: morning light through the windows, flat noon, amber late afternoon, dusk and a lamp-lit night, with warm desk lamps that come on as sessions start, the room you zoom into lit like a stage, a flickering light in a room in a rush, windows that look out on a skyline with drifting clouds, a lawn and yard round the building, paper shadows and grain, and room names painted at each room's door instead of floating tabs.

## 0.4.0

### Minor Changes

- e0d5e79: A settings cog in the office's top bar opens a Settings sheet, starting with the theme (Office or Factory). The choice is saved and both windows switch, as from the tray menu. The top bar now fits narrow windows.

## 0.3.0

### Minor Changes

- 8978561: The office gets busy: each project room has a copier, a QA stamp desk, a filing cabinet and a card catalogue, and the crew walk over to use them for builds, tests, reads and searches, queue when one is taken, and hurry when the work is hot. The watcher now also reads each session's model family, how full its context is, files and lines changed, todo progress and tool call rate.
- cc9caa7: The crew acts out the busy office: the lead buried behind a teetering in-tray, a ticket and a bell at your door, sticky notes walked to the planner, a real run when it's hectic, the PR envelope carried proudly, a running feud with a jammed copier, a little flourish, and folders handed from one crew member to another.
- 2daad3a: The factory's rig: with ?theme=factory the crew wear factory gear (hard hats, a hi-vis vest, a headlamp, knee pads, safety glasses, a welding visor) and work a stamping press, parts bins, a gauge, a crusher and a loading-dock pallet.
- 2daad3a: Themes: pick Office or Factory from the tray's Theme menu (saved, and both windows switch at once). The factory is the same crew in workshop bays with a conveyor aisle, presses, gauge benches, parts racks, a loading dock, a QA booth, a break room with a vending machine and the foreman's office, and a giant robot arm in each bay that lifts every new crate onto the crew's build and the PR's crate onto the dock.
- cc9caa7: Busy rooms turn hectic: a very hot session puts its room in a rush (runs with papers flying, quicker trips and brick runs, the lead dashing to whoever is red or queued), walkers sidestep each other, a folder is handed over instead of a second trip, a long build feuds with the copier, and the strip gains a phone and an outbox the lead walks each PR to.
- cc9caa7: Metrics become things in the office: each lead's in-tray fills with its context (buried past 95%, fed to the room's shredder on a compaction), the crew tower counts lines added, a skip fills with removed lines, filing drawers with files touched, mugs with cost, and a lamp shows the last test. A wall planner tracks todos, with notes walked over as they're done. Sessions waiting on you queue with numbered tickets in a new 'your office' by the lobby. Model families walk and act with their own personality and name themselves on the desk card.

## 0.2.0

### Minor Changes

- 8ef27a8: Busy crews come alive: builders act out the tool they're using with real props, carry bricks to a tower that grows on the desk, look up when a teammate's test goes red, and spread out so their work shows. The lead walks rounds, and the crew talks shop.

## 0.1.0

The first release: see [the release notes](docs/release-notes/0.1.0.md).
