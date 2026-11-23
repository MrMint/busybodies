# Sound brief

How Busybodies should sound, as a whole. It's a draft: the open questions at the end are answered
by ear in the sound lab, and the answers move into `docs/decisions.md`.

## What it's for

Sound is opt-in, and it plays for hours beside someone's work. So it has two jobs, in this order:

1. **Tell you something without making you look**: someone is waiting on you, something finished,
   something broke.
2. **Make the office feel alive and cute** while it's quiet: little creatures pottering about.

Everything else is a failure mode: anything that grates on the hundredth hearing, competes with
music or a call, or sounds like people talking in the room.

## Principles

- **Mochis are creatures, not people.** They squeak, burble and babble; they don't talk to you. The
  bubble carries the joke, and the voice carries the feeling.
- **Never the same thing twice in a row.** An always-on app's enemy is repetition. Prefer sounds
  that are made fresh each time (babble from syllables, earcons varied from the event's id) over
  recordings played whole.
- **The important things are rare and clear; everything else is texture.** At most one voice in
  front at a time, and a key beat is never hidden under chatter.
- **Quiet by default.** The whole mix sits well under anything else on the machine; turning the
  volume up should make it pleasant, not busy.
- **You hear what you see.** A sound comes from a character or a thing on screen, panned to its room,
  louder when the camera is in that room.

## Layers, from the back

| Layer | What | When | How loud |
|---|---|---|---|
| Room | The theme's bed: hum and typing, the belt's clack, the oven and the shop door (sound.ts), or a recorded loop (tools/ambience.ts) | Always, while live | Lowest; dips under a voice in front |
| Work | The main body: every busy character's work in its theme's palette (office: key taps, page flips, a card riffle, the stapler, a rubber stamp, a phone burble, a sheaf dropped, the shredder; the factory's rivets, press and gauge; the bakery's whisk, jar lids, oven door and spoon). On a soft pulse (16ths, 96 bpm calm to 120 in a rush), pitched ones in the key, at most 3 a step (4 zoomed), the room in view first and clear, the rest through the wall, taking turns (mainview/worksound.ts) | Whenever anyone works; more and quicker the busier it is | The loudest layer after the earcons |
| Crowd | A distant murmur of the office at work: a few talkers chatting on and off from the syllable banks, muffled and mostly room; more talkers and shorter pauses the busier it is | Always, in the babble modes; fades in and out over seconds | Under everything but the room; dips under a key beat |
| Murmur | Babble for the ordinary said bubbles of the room the camera is zoomed into (zoomed out, the crowd stands in) | A few every 10 s at most, one whole phrase each | Well under the front, never on top of each other |
| Earcons | The bell, chime, stamp, two-note red, rustle, grind | On their events, rate-limited | Clear, short |
| Front voice | A key beat: waiting on you, done, back to work | One at a time, at most 3 a minute | The loudest voice; the room dips |

## The voice: the current candidate

From the office auditions (2026-11-23): stock voices read as adults until pitched up about 6
semitones, and only the "cartoon" delivery on Gemini 3.8 got there (14 voices kept, none in the
plain or "small" deliveries). Babble still felt closer to a crowd of mochis than words. So:

- **Babble first, made from real cartoon voices.** Each kept voice records a little mochi-speak
  ("Mumu? Mu-mupa?"); the app cuts it into syllables (tools/voice-grains.ts) and strings new babble
  from them for every line (sass/voiced.ts `grainPlan`), in the character's own voice and pitch,
  rising at a question, falling at a full stop. It's endless and never repeats, and it costs a few
  hundred KB.
- **Words only where they earn it**, if at all: a short voiced reaction on a key beat ("Ta-da!",
  "Hm?") is the next step up; full spoken lines are the last, and likeliest to tire.
- **The synthesised babble** (the first cut) stays as the fallback: lines with nothing recorded, a
  clip that won't decode.

**Work is the body; voices are seasoning (owner, 2026-11-23).** The office should mostly sound
like the work happening, getting busier and more hectic as more agents run in parallel; voices
are a small part of it. So key beats sit at about half a clip's level and the crowd well under the
work.

**Background, not foreground (owner, 2026-11-23).** It should feel like a background hum of
everyone working: intentional, never cut off, never on top of you. So a phrase is always whole
(stopped at a word, the last syllable trailing off over about 120 ms), key beats sit in the crowd
rather than over it, and individual babble comes only from the room you're looking at.

## The sound lab

`?demo&sound&lab` adds a timeline of its own (crew chatter every few seconds, a key beat every 20
to 35) and a panel to switch, live:

- **mode**: synth babble, syllables, + reactions, + full lines (`?voice=` sets the first)
- **murmur** on or off (zoomed room only), and the front, murmur, **work** and **crowd** levels
- **smooth syllables**, **shape voices** and **room**: before and after for the blend pass
- **pitch** on top of the theme's
- **key beat now**, and a log of what played and how

With `bun tools/voice.ts listen` running, add `&voicebase=http://127.0.0.1:4477/lab/` and your kept
audition takes play as if they had shipped (nothing is copied into the app). Through Vite:

    bun x vite
    open "http://localhost:5173/?demo&sound&lab&voice=syllables&voicebase=http://127.0.0.1:4477/lab/"

Click the panel once to let the browser start audio.

## Open questions, for the lab

Listen to each mode for a few minutes, with the whole office and zoomed into a room, then answer:

1. **Babble or words?** Syllables only, syllables with voiced reactions on key beats, or words?
2. **Murmur:** does the crowd make it feel alive, or is it noise? How many a minute feel right?
3. **Pitch:** is +6 semitones the mochi, or is it a chipmunk? Does it want to differ by role or size?
4. **One voice per character** (now: each character keeps its own voice by its id), or does a
   shared mochi voice read better?
5. **Themes:** should the factory's mochis be gruffer and lower, and the bakery's sweeter? Same pool
   with a different pitch and delivery, or their own auditions?
6. **The room under it all:** does the synth bed still fit next to real voices, or do we want
   recorded loops (CC0) now?

When they're answered: write the decisions, record what was chosen for every theme, ship it, and
make that mode the default.
