// Every pose, ported from the Acting and Cast boards (design/boards/Acting.dc.html, Cast.dc.html)
// and retuned for the mochi body. A pose is timed frames plus metadata: what triggers it, how rare
// it is, and which lines it may say. Frames are written in the boards' token form; see frame.ts.
import { parseFrame, type TimedFrame } from "./frame";
import type { Role } from "./roles";

/** The boards ticked every 130 ms; frame lengths here are in those beats. */
export const BEAT_MS = 130;

export type Trigger =
	| "busy"
	| "idle"
	| "idle-long"
	| "waiting"
	| "test-failed"
	| "pr-opened"
	| "subagent-spawned"
	| "stalled"
	| "finished"
	| "thinking"
	| "subagent-green"
	| "long-build"
	| "walking"
	| "working"
	| "reacting"
	| "inspecting";

export interface Pose {
	name: string;
	title: string;
	trigger: Trigger;
	/** How often it plays when its trigger fires: 1 is always, 1/20 is "one time in twenty". A rare
	 * pose replaces the common one for the same trigger. */
	rarity: number;
	/** Lines it may say (the bubble scheduler picks; S5). */
	lines: string[];
	/** `loop` repeats until something else plays; `once` plays through and holds its last frame, so
	 * the character settles and the scene stops rendering. */
	play: "loop" | "once";
	/** Roles the pose suits; omitted means any. */
	roles?: Role[];
	/** A slacking habit, for an idle character. */
	habit?: boolean;
	frames: TimedFrame[];
	/** The second character of a two-hander, timed alongside. */
	partner?: { role: Role; frames: TimedFrame[] };
	/**
	 * Breaking the metronome (plan-alive stream B): a looping pose's variant passes. Now and then
	 * (`share` of passes, picked from the id, the pose and the pass: player.ts passBeat) a pass
	 * plays one of these instead of `frames`. Each lasts exactly as long as `frames`, starts and
	 * ends where `frames` does (so the loop joins up), and is named for the sheet and the inspector.
	 */
	beats?: { share: number; passes: { name: string; frames: TimedFrame[] }[] };
}

type Row = [tokens: string, beats: number, say?: string];
const frames = (rows: Row[]): TimedFrame[] => rows.map(([t, beats, say]) => ({ ...parseFrame(t), ms: beats * BEAT_MS, ...(say ? { say } : {}) }));

type PoseRows = Omit<Pose, "frames" | "partner" | "beats"> & {
	frames: Row[];
	partner?: { role: Role; frames: Row[] };
	beats?: { share: number; passes: { name: string; frames: Row[] }[] };
};

const pose = ({ partner, beats, ...p }: PoseRows): Pose => ({
	...p,
	frames: frames(p.frames),
	...(partner ? { partner: { role: partner.role, frames: frames(partner.frames) } } : {}),
	...(beats ? { beats: { share: beats.share, passes: beats.passes.map((b) => ({ name: b.name, frames: frames(b.frames) })) } } : {}),
});

// Acting, not wobbling: the body doesn't squash, stretch or hop. Hands and tools do a job you can
// recognise, the eyes stay on the work (l-downR is the bench out front), and the work answers: a
// strike drives the nail (w-nail1 to w-nail3), a wrench turns the nut, a poke rocks the stack. The
// body moves only for the action (leaning in to look, recoiling from a blow, a step's rise).
// Long holds carry a one-beat blink (e-closed). Tool arms are solved onto theme.ts WORK.
export const POSES: Pose[] = [
	// Hard at it ----------------------------------------------------------------------------------
	pose({
		name: "typing",
		title: "Typing, frantic",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		lines: ["Typing.", "Do not talk to me."],
		frames: [
			["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
			["e-wide l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
			["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
			["e-closed l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
			["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
			["e-wide l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
			["e-wide l-right b-up m-open al-type2 ar-type2 fr-desk x-papers1", 2],
			["e-squint b-angry m-wobble al-type3 ar-type3 bd-fwd fr-desk x-papers2", 1],
			["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk x-sweat2", 1],
			["e-wide l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk", 1],
			["e-closed b-worry m-small hr-mug ar-sip al-type1 fr-desk", 3],
		],
		beats: {
			share: 0.22,
			passes: [
				{
					// Stops to read what it wrote: chin on a hand, eyes on the screen, a blink, an "ah", back at it.
					name: "read",
					frames: [
						["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
						["e-wide l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk", 1],
						["e-half l-right b-one m-pout al-type2 ar-chin fr-desk", 3],
						["e-closed l-right b-one m-pout al-type2 ar-chin fr-desk", 1],
						["e-half l-right b-one m-small al-type2 ar-chin fr-desk", 3],
						["e-wide l-down b-up m-small al-type2 ar-chin fr-desk", 1],
						["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
						["e-wide l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
						["e-wide l-down b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
						["e-wide l-down b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk", 1],
					],
				},
			],
		},
	}),
	pose({
		// Edit/Write: a nail driven home in three strokes, checked, and the next one started. Each
		// strike lands on the head (ARMS.hit1-3), and on the beat after it the nail and the hammer go
		// down together.
		name: "hammer",
		title: "Whacking it until it compiles",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		roles: ["builder"],
		lines: ["It compiles in my heart."],
		frames: [
			["l-downR b-flat m-flat hr-hammer ar-wind al-hip w-nail1", 2],
			["e-squint l-downR b-angry m-flat hr-hammer ar-hit1 al-hip w-nail1", 1],
			["e-squint l-downR b-angry m-flat hr-hammer ar-hit2 al-hip w-nail2 x-hit", 1],
			["l-downR b-flat m-small hr-hammer ar-wind al-hip w-nail2", 2],
			["e-squint l-downR b-angry m-flat hr-hammer ar-hit2 al-hip w-nail2", 1],
			["e-squint l-downR b-angry m-flat hr-hammer ar-hit3 al-hip w-nail3 x-hit", 1],
			["l-downR b-one m-small hr-hammer ar-wind al-hip w-nail3", 2],
			["e-squint l-downR b-angry m-blep hr-hammer ar-hit3 al-hip w-nail3", 1],
			["e-squint l-downR b-one m-blep hr-hammer ar-hit3 al-hip w-nail3 x-hit", 1],
			["e-half l-downR b-one m-small hr-hammer ar-sling al-hip bd-fwd w-nail3", 3],
			["e-closed l-downR m-small hr-hammer ar-sling al-hip bd-fwd w-nail3", 1],
			["e-happy m-grin hr-hammer ar-sling al-hip w-nail3", 2],
		],
		beats: {
			share: 0.25,
			passes: [
				{
					// One strike, then it stops to check the nail: hammer on the shoulder, a lean in and a
					// squint, a doubtful brow, a nod, and the last two strikes drive it home.
					name: "check",
					frames: [
						["l-downR b-flat m-flat hr-hammer ar-wind al-hip w-nail1", 2],
						["e-squint l-downR b-angry m-flat hr-hammer ar-hit1 al-hip w-nail1", 1],
						["e-squint l-downR b-angry m-flat hr-hammer ar-hit2 al-hip w-nail2 x-hit", 1],
						["e-half l-downR b-one m-pout hr-hammer ar-sling al-hip bd-fwd w-nail2", 3],
						["e-closed l-downR b-one m-pout hr-hammer ar-sling al-hip bd-fwd w-nail2", 1],
						["e-wide l-downR b-up m-small hr-hammer ar-sling al-hip bd-fwd w-nail2", 2],
						["e-half l-downR b-one m-flat hr-hammer ar-sling al-hip bd-nod w-nail2", 2],
						["l-downR b-flat m-small hr-hammer ar-wind al-hip w-nail2", 2],
						["e-squint l-downR b-angry m-flat hr-hammer ar-hit2 al-hip w-nail2", 1],
						["e-squint l-downR b-angry m-flat hr-hammer ar-hit3 al-hip w-nail3 x-hit", 1],
						["e-happy m-grin hr-hammer ar-sling al-hip w-nail3", 2],
					],
				},
			],
		},
	}),
	pose({
		name: "scouting",
		title: "Scouting with binoculars",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		roles: ["scout"],
		lines: ["Found it. Probably."],
		frames: [
			["a-binoc m-small al-face ar-face f-wide bd-leanL", 3],
			["a-binoc m-small al-face ar-face f-wide bd-leanR", 3],
			["e-wide b-up m-open hl-map al-raise ar-point l-right", 2],
			["e-half l-left b-one m-small hl-map al-raise ar-chin", 2],
			["e-shine b-up m-grin hl-map al-raise ar-point l-right f-tapR", 2],
		],
	}),
	pose({
		name: "exploring",
		title: "Exploring with a torch",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		roles: ["explorer"],
		lines: ["It's dark in node_modules."],
		frames: [
			["e-wide l-left b-up m-small hr-torch ar-raise al-low", 3],
			["e-wide l-right b-up m-open hr-torch ar-point al-low", 3],
			["e-closed l-right m-small hr-torch ar-point al-low", 1],
			["e-wide l-right b-up m-small hr-torch ar-point al-low bd-fwd", 2],
			["e-shine m-grin hr-torch ar-point al-low l-right bd-fwd", 2],
		],
	}),
	pose({
		name: "reviewing",
		title: "Reviewing, with notes",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		roles: ["reviewer"],
		lines: ["I have notes."],
		frames: [
			["e-half l-right b-one m-flat hl-clip al-low ar-point", 3],
			["e-squint b-angry m-small hl-clip al-low ar-chin", 3],
			["e-closed b-angry m-small hl-clip al-low ar-chin", 1],
			["e-wide l-right b-up m-open hl-clip al-low ar-point x-idea", 2],
			["m-smirk hl-clip al-low ar-hip", 2],
		],
	}),
	pose({
		name: "verifying",
		title: "Verifying under the glass",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		roles: ["verifier"],
		lines: ["Green. Allegedly."],
		frames: [
			["e-squint l-left b-one m-small hl-mag al-raise ar-hip bd-leanL", 3],
			["e-wide l-left b-up m-open hl-mag al-raise ar-hip bd-leanL", 2],
			["e-happy m-grin hl-mag al-low hr-ok ar-up", 3],
			["m-smirk hl-mag al-low hr-ok ar-raise", 3],
		],
	}),
	pose({
		name: "painting",
		title: "Moving it two pixels",
		trigger: "busy",
		rarity: 1,
		play: "loop",
		roles: ["designer"],
		lines: ["Two pixels. Trust me."],
		frames: [
			["e-squint l-right m-blep hr-brush ar-raise al-hip bd-leanR", 2],
			["e-squint l-right m-blep hr-brush ar-out al-hip bd-leanR", 2],
			["e-squint l-right m-blep hr-brush ar-raise al-hip bd-leanR", 2],
			["e-squint l-right m-blep hr-brush ar-out al-hip bd-leanR", 2],
			["e-half l-right b-one m-small hr-brush ar-low al-chin bd-back", 3],
			["e-shine l-right b-up m-grin hr-brush ar-raise al-hip", 2],
		],
	}),

	// A builder's work, by the tool it is using (the director picks; src/scene/director/work.ts) -----
	pose({
		// Read: unroll the plan, trace it with a finger, turn it the wrong way round and back, nod,
		// roll it up.
		name: "blueprint",
		title: "Reading the blueprint",
		trigger: "working",
		rarity: 1,
		play: "loop",
		roles: ["builder"],
		lines: ["Measure twice. Read once."],
		frames: [
			["l-down m-small fr-roll al-sheet ar-sheet", 2],
			["e-wide l-down b-up m-small fr-plan al-sheet ar-sheet", 2],
			["l-down b-one m-small fr-plan al-sheet ar-trace1", 3],
			["l-downR b-one m-small fr-plan al-sheet ar-trace2", 3],
			["e-closed l-downR m-small fr-plan al-sheet ar-trace2", 1],
			["l-down b-worry m-pout fr-plan2 al-sheet ar-sheet bd-tilt", 3],
			["e-wide l-down b-up m-open fr-plan al-sheet ar-sheet", 2],
			["e-half l-down b-one m-small fr-plan al-sheet ar-trace1", 3],
			["e-happy m-grin fr-plan al-sheet ar-sheet", 2],
			["l-down m-small fr-roll al-sheet ar-sheet", 2],
		],
	}),
	pose({
		// Grep/Glob: dig in the parts crate, hold one up to the eye, wrong one, dig again, found it.
		name: "rummage",
		title: "Looking for the right part",
		trigger: "working",
		rarity: 1,
		play: "loop",
		roles: ["builder"],
		lines: ["It was here a minute ago."],
		frames: [
			["l-downR b-one m-small ar-dig al-hip bd-leanR w-crate", 3],
			["e-squint l-downR b-one m-blep ar-lift al-hip bd-leanR w-crate", 1],
			["e-squint l-downR b-one m-blep ar-dig al-hip bd-leanR w-crate", 2],
			["l-right b-up m-small hr-bolt ar-eye al-hip w-crate", 3],
			["e-half l-right b-flat m-flat hr-bolt ar-eye al-hip w-crate", 2],
			["e-half l-downR b-flat m-flat ar-dig al-hip bd-leanR w-crate", 2],
			["e-squint l-downR b-one m-blep ar-lift al-hip bd-leanR w-crate", 1],
			["e-squint l-downR b-one m-blep ar-dig al-hip bd-leanR w-crate", 2],
			["e-wide l-right b-up m-open hr-gear ar-eye al-hip w-crate x-idea", 3],
			["e-happy m-grin hr-gear ar-eye al-hip w-crate", 2],
		],
	}),
	pose({
		// A shell command running: a wrench on the machine's nut, a third of a turn a stroke, and a
		// look up at the command now and then.
		name: "tinker",
		title: "Tinkering while it runs",
		trigger: "working",
		rarity: 1,
		play: "loop",
		roles: ["builder"],
		lines: ["Tighten. Untighten. Tighten."],
		frames: [
			["l-downR b-flat m-blep hr-wrench ar-wr1 al-hip w-nut1", 2],
			["e-squint l-downR b-one m-blep hr-wrench ar-wr2 al-hip w-nut2", 2],
			["e-squint l-downR b-one m-blep hr-wrench ar-wr3 al-hip w-nut3", 2],
			["l-downR b-flat m-small hr-wrench ar-wr1 al-hip w-nut1", 2],
			["e-squint l-downR b-one m-blep hr-wrench ar-wr2 al-hip w-nut2", 2],
			["e-squint l-downR b-one m-blep hr-wrench ar-wr3 al-hip w-nut3", 2],
			["l-upR b-one m-small hr-wrench ar-low al-hip w-nut3", 3],
			["e-closed l-upR m-small hr-wrench ar-low al-hip w-nut3", 1],
			["e-half l-upR b-flat m-flat hr-wrench ar-low al-hip w-nut3", 2],
		],
	}),
	pose({
		// A test run: push the stack, watch it rock, it holds, tick the clipboard.
		name: "poke",
		title: "Poking it to see if it holds",
		trigger: "working",
		rarity: 1,
		play: "loop",
		roles: ["builder"],
		lines: ["If it wobbles, it's a feature."],
		frames: [
			["l-downR b-one m-small hl-clip al-low ar-draw w-stack", 2],
			["e-squint l-downR b-one m-flat hl-clip al-low ar-poke w-stack", 1],
			["e-wide l-downR b-up m-small hl-clip al-low ar-draw w-stackR", 1],
			["e-wide l-downR b-up m-small hl-clip al-low ar-draw w-stackL", 1],
			["e-wide l-downR b-worry m-small hl-clip al-low ar-draw w-stackR", 1],
			["l-downR b-one m-small hl-clip al-low ar-draw w-stack", 2],
			["e-closed l-downR m-small hl-clip al-low ar-draw w-stack", 1],
			["e-half l-left b-flat m-small hl-clip al-raise ar-draw w-stack", 3],
			["e-happy m-grin hl-clip al-raise ar-draw w-stack", 2],
		],
	}),
	pose({
		// A red test: the strike goes crooked, the nail folds, the hammer flies off, and the stung
		// hand gets flapped and blown on.
		name: "thumb",
		title: "Whacked the thumb",
		trigger: "test-failed",
		rarity: 1,
		play: "once",
		roles: ["builder"],
		lines: ["Ow. The test hit me."],
		frames: [
			["l-downR b-flat m-flat hr-hammer ar-wind al-hip w-nail1", 2],
			["e-squint l-downR b-angry m-flat hr-hammer ar-hit1 al-hip w-nail1", 1],
			["e-wide l-downR b-up m-open ar-flap1 al-out bd-back w-bent x-hit", 2],
			["e-tear b-worry m-shout ar-flap2 al-out bd-back w-bent x-sweat1", 1],
			["e-tear b-worry m-wobble ar-flap1 al-low w-bent x-sweat2", 1],
			["e-tear b-worry m-wobble ar-flap2 al-low w-bent x-sweat1", 1],
			["e-tear b-worry m-wobble ar-flap1 al-low w-bent", 1],
			["e-tear l-right b-worry m-small ar-face al-low w-bent", 3],
			["e-half l-downR b-flat m-pout ar-hip al-hip w-bent", 5, "Ow. The test hit me."],
		],
	}),
	pose({
		name: "glance",
		title: "Glancing at a teammate",
		trigger: "reacting",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-up m-small", 2],
			["e-side l-right b-one m-smirk bd-leanR", 4],
			["e-closed m-small", 1],
			["e-half m-flat", 3],
		],
	}),
	// Model traits as acting (plan-alive stream B; director/traits.ts): what a character does in the
	// beat before it acts.
	pose({
		// A deliberate model: eyes up, chin on a hand, a slow blink, then it acts.
		name: "consider",
		title: "Considering it first",
		trigger: "reacting",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["e-half l-upR b-one m-small al-low ar-chin", 2],
			["e-closed l-upR b-one m-pout al-low ar-chin", 1],
			["e-half l-upR b-one m-pout al-low ar-chin", 2],
		],
	}),
	pose({
		// A quick model's go-ahead: a small nod, and on with it.
		name: "nod",
		title: "A small nod",
		trigger: "reacting",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-up m-small bd-nod", 1],
			["e-happy l-right m-small", 1],
		],
	}),
	pose({
		// The lead leans in over the work, strokes its chin, points out the next thing, nods.
		name: "inspect",
		title: "Checking on the crew",
		trigger: "inspecting",
		rarity: 1,
		play: "loop",
		roles: ["lead"],
		lines: ["Looks great. Do it again."],
		frames: [
			["l-downR b-one m-small al-hip ar-hip bd-fwd", 3],
			["e-half l-downR b-one m-pout al-hip ar-chin bd-fwd", 3],
			["e-closed l-downR m-pout al-hip ar-chin bd-fwd", 1],
			["l-right b-up m-small al-hip ar-point", 3],
			["e-happy m-grin al-hip ar-hip", 2],
			["e-half l-left m-smirk al-hip ar-hip", 3],
		],
	}),

	// Noticing (plan-alive stream A): the director points these at someone with the cue's `lookAt`
	// (rig/data/gaze.ts), so the looks below are only what shows without one.
	pose({
		// Back on screen after a while away: an idle character looks up at you, pleased.
		name: "lookUp",
		title: "Noticing you",
		trigger: "reacting",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["e-wide l-up b-up m-small", 2],
			["e-shine l-up b-up m-grin", 7],
			["e-closed l-up b-up m-grin", 1],
			["e-shine l-up b-up m-grin", 5],
			["e-half m-smirk", 3],
		],
	}),
	pose({
		// One of them waves.
		name: "wave",
		title: "Waving at you",
		trigger: "reacting",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["e-wide l-up b-up m-open ar-raise", 2],
			["e-happy l-up b-up m-grin ar-wave1", 2],
			["e-happy l-up b-up m-grin ar-wave2", 2],
			["e-happy l-up b-up m-grin ar-wave1", 2],
			["e-happy l-up b-up m-grin ar-wave2", 2],
			["e-happy l-up b-up m-grin ar-wave1", 2],
			["e-shine l-up m-grin ar-low", 3],
			["e-half m-smirk", 3],
		],
	}),
	pose({
		// Waiting at your door when you come back: the ticket goes up high, on tiptoe, then back down.
		name: "ticketHigh",
		title: "Holding the ticket up for you",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["e-wide l-up b-up m-open hr-ticket ar-raise al-hip", 2],
			["e-shine l-up b-up m-grin hr-ticket ar-up al-hip f-tip", 6],
			["e-shine l-up b-up m-grin hr-ticket ar-hi al-hip f-tip", 2],
			["e-shine l-up b-up m-grin hr-ticket ar-up al-hip f-tip", 6],
			["e-closed l-up b-up m-grin hr-ticket ar-up al-hip f-tip", 1],
			["e-wide l-up b-up m-small hr-ticket ar-up al-hip f-tip", 6],
			["l-right m-flat hr-ticket ar-low al-hip", 2],
		],
	}),
	pose({
		// A hand-off's taker, as the folder arrives: it looks up and raises a hand to take it.
		name: "handReady",
		title: "Ready to take the folder",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["e-wide l-right b-up m-small al-low ar-low", 1],
			["l-right b-up m-open al-low ar-offer", 3],
		],
	}),

	// Slacking, obviously: seven habits ------------------------------------------------------------
	pose({
		name: "feetUp",
		title: "Feet up",
		trigger: "idle",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["Strategic pause."],
		frames: [
			["e-half m-smirk bd-back f-up hl-plane al-wave1 ar-head fr-desk", 4],
			["e-squint m-blep bd-back f-up hl-plane al-ham1 ar-head fr-desk", 2],
			["e-happy m-open bd-back f-up al-throw2 ar-head fr-desk x-papers1", 2],
			["e-wide l-left b-up m-small bd-back f-up al-low ar-head fr-desk", 4],
			["e-half m-yawn bd-back f-up al-low ar-head fr-desk", 3],
		],
	}),
	pose({
		name: "faceDown",
		title: "Face down on the keys",
		trigger: "idle-long",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["zzz", "I was resting my context."],
		frames: [
			["e-closed m-drool bd-nap al-low ar-low fr-desk x-z1", 4],
			["e-closed m-small bd-nap al-low ar-low fr-desk x-z2", 4],
			["e-closed m-drool bd-nap al-low ar-low fr-desk x-z3", 4],
		],
	}),
	pose({
		name: "chairSpin",
		title: "Chair spin",
		trigger: "idle",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["Wheee. I mean: thinking."],
		frames: [
			["e-happy m-grin al-cheer ar-cheer f-kick bk-chair bd-tilt", 3],
			["e-shine b-up m-open al-up ar-up f-wide bk-chair bd-leanR", 3],
			["e-happy m-grin al-cheer ar-cheer f-kick bk-chair bd-leanL", 3],
			["e-half m-smirk al-low ar-low f-wide bk-chair", 3],
		],
	}),
	pose({
		name: "scrolling",
		title: "Scrolling",
		trigger: "idle",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["Researching. On my phone."],
		frames: [
			["e-half l-down b-flat m-flat hr-phone ar-phone al-hip", 5],
			["e-half l-down b-flat m-smirk hr-phone ar-phone al-hip", 3],
			["e-wide l-down b-up m-open hr-phone ar-phone al-face", 2],
			["e-happy l-right m-grin hr-phone ar-raise al-hip", 3],
		],
	}),
	pose({
		name: "waterCooler",
		title: "Water cooler",
		trigger: "idle",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["So anyway, the human said 'quick fix'."],
		frames: [
			["l-left b-up m-open hl-mug al-raise ar-out", 2],
			["l-left m-grin hl-mug al-raise ar-hip", 2],
			["l-left e-closed m-small hl-mug al-sip ar-hip", 3],
			["l-left e-half b-one m-pout hl-mug al-raise ar-shrug", 3],
			["l-left e-happy m-shout hl-mug al-raise ar-hip bd-back", 3],
		],
	}),
	pose({
		name: "stretch",
		title: "The stretch",
		trigger: "idle",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["Hydrating my joints."],
		frames: [
			["e-half m-flat al-low ar-low", 3],
			["e-closed m-yawn al-cheer ar-cheer f-tip", 4],
			["e-half m-small al-head ar-hip", 3],
		],
	}),
	pose({
		name: "slowWalk",
		title: "The slow walk",
		trigger: "idle",
		rarity: 1,
		play: "once",
		habit: true,
		lines: ["Very busy. Carrying a paper."],
		frames: [
			["e-half l-right m-smirk hl-paper al-raise ar-low f-swingL", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-down f-swingR bd-bob", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-low f-swingL", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-down f-swingR bd-bob", 3],
		],
	}),

	// The factory's own habits (themes/factory/scene.ts FACTORY_STAGING): played by name from the theme's
	// habit rotation (director/habits.ts), never by the idle trigger, so the office keeps its seven.
	pose({
		name: "drumSit",
		title: "Sitting on an oil drum",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Supervising. The drum."],
		frames: [
			["e-half m-smirk bd-back bk-drum f-wide al-low ar-head", 4],
			["e-half l-left m-small bd-back bk-drum f-kick al-low ar-head", 3],
			["e-closed m-yawn bd-back bk-drum f-wide al-head ar-head", 4],
			["e-half m-smirk bd-back bk-drum f-kick al-low ar-head", 3],
		],
	}),
	pose({
		name: "palletCards",
		title: "Cards on a pallet",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Gin. Again."],
		frames: [
			["e-half l-downR b-flat m-flat hl-hand al-raise ar-low w-pallet", 4],
			["e-squint l-downR b-one m-smirk hl-hand al-raise ar-low w-pallet", 3],
			["e-wide l-downR b-up m-grin hl-hand al-raise ar-throw2 w-palletSlap", 2],
			["e-happy l-right m-grin hl-hand al-raise ar-hip w-palletSlap", 3],
		],
	}),
	pose({
		name: "vendingKick",
		title: "Kicking the vending machine",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["It owes me a snack."],
		frames: [
			["e-squint l-right b-angry m-flat al-hip ar-hip w-vending", 4],
			["e-squint l-right b-angry m-shout al-hip ar-out f-boot w-vendingRock x-hit", 2],
			["e-half l-right b-angry m-pout al-hip ar-hip w-vending", 3],
			["e-wide l-downR b-up m-open al-hip ar-low w-vendingDrop", 2],
			["e-happy l-downR m-grin al-hip ar-cheer w-vendingDrop", 3],
		],
	}),

	// The foreman's booth habits (themes/factory/staging.ts `leadHabits`): up in the booth, its bench
	// and screen come to the foreman's chin, so these play at head height (binoculars, a phone at the
	// ear, hands behind the head, a mug at the lips), looking out over the line. Played by name,
	// never by the idle trigger.
	pose({
		name: "boothMug",
		title: "A brew over the line",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Quality control. Of the tea."],
		frames: [
			["e-half l-downR m-small hl-mug al-raise ar-hip", 4],
			["e-closed m-small hl-mug al-sip ar-hip", 3],
			["e-happy l-downR m-grin hl-mug al-raise ar-hip", 3],
			["e-half l-right b-one m-flat hl-mug al-raise ar-point", 3],
			["e-half l-downR m-smirk hl-mug al-raise ar-hip", 3],
		],
	}),
	pose({
		name: "boothWatch",
		title: "Keeping an eye on the line",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Nobody move. I mean: keep moving."],
		frames: [
			["a-binoc m-small al-face ar-face bd-leanL", 4],
			["a-binoc m-flat al-face ar-face", 2],
			["a-binoc m-small al-face ar-face bd-leanR", 4],
			["e-wide b-up m-open al-face ar-face bd-leanR", 2],
			["e-happy l-downR m-grin al-low ar-wave1", 3],
		],
	}),
	pose({
		name: "boothLean",
		title: "Hands behind the head",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["The line runs itself. I made sure."],
		frames: [
			["e-half m-smirk al-head ar-head", 5],
			["e-closed m-yawn al-head ar-head f-tip", 3],
			["e-half l-downR m-small al-head ar-head", 4],
			["e-wide l-downR b-up m-small al-low ar-head", 2],
		],
	}),
	pose({
		name: "boothCall",
		title: "On the booth phone",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Yes. Yes. It's on the belt."],
		frames: [
			["e-half l-upR b-one m-small hl-receiver al-ear ar-head", 4],
			["l-upR b-up m-open hl-receiver al-ear ar-wave1 bd-nod", 2],
			["e-squint l-right b-flat m-flat hl-receiver al-ear ar-head", 3],
			["e-happy l-upR m-grin hl-receiver al-ear ar-wave2 bd-nod", 2],
			["e-half l-right m-smirk hl-receiver al-ear ar-head", 3],
		],
	}),

	// The bakery's own habits (themes/bakery/scene.ts BAKERY_STAGING): played by name from the theme's habit
	// rotation, never by the idle trigger. The bakery's rig paints the mug as a cappuccino, the bolt
	// as a macaron, the stamp as a cake fork with a morsel on it, and the drum as a flour sack.
	pose({
		name: "cappuccinoSip",
		title: "Sipping a cappuccino",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Foam first. Feelings later."],
		frames: [
			["e-half l-left m-small hl-mug al-raise ar-hip", 3],
			["e-closed m-small hl-mug al-sip ar-hip", 4],
			["e-happy m-grin hl-mug al-raise ar-hip c-blush", 3],
			["e-closed m-small hl-mug al-sip ar-hip bd-back", 3],
			["e-half l-right b-one m-smirk hl-mug al-raise ar-hip", 3],
		],
	}),
	pose({
		name: "macaronSneak",
		title: "Sneaking a macaron",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Nobody saw that. Nobody count them."],
		frames: [
			["e-half l-left b-flat m-flat hr-bolt ar-raise al-hip", 3],
			["e-half l-right b-flat m-flat hr-bolt ar-raise al-hip", 3],
			["e-closed b-up m-open hr-bolt ar-sip al-hip", 2],
			["e-happy m-grin ar-low al-hip c-blush", 3],
			["e-wide l-left b-up m-small ar-low al-hip", 2],
		],
	}),
	pose({
		name: "forkLick",
		title: "Licking the cake fork",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["Tasting is part of the job."],
		frames: [
			["e-half l-right m-small hr-stamp ar-raise al-hip", 3],
			["e-closed m-open hr-stamp ar-sip al-hip", 3],
			["e-happy m-grin hr-stamp ar-raise al-hip c-blush", 3],
			["e-closed m-small hr-stamp ar-sip al-hip bd-back", 3],
			["e-shine m-grin hr-stamp ar-raise al-cheer", 3],
		],
	}),
	pose({
		name: "flourNap",
		title: "Napping on a flour sack",
		trigger: "idle",
		rarity: 0,
		play: "once",
		lines: ["zzz", "Five minutes. Then croissants."],
		frames: [
			["e-half m-yawn bd-back bk-drum f-wide al-head ar-head", 3],
			["e-closed m-small bd-back bk-drum f-wide al-head ar-head x-z1", 4],
			["e-closed m-drool bd-back bk-drum f-kick al-head ar-head x-z2", 4],
			["e-closed m-small bd-back bk-drum f-wide al-head ar-head x-z3", 4],
		],
	}),

	// Acted --------------------------------------------------------------------------------------
	pose({
		name: "waiting",
		title: "Waiting on you",
		trigger: "waiting",
		rarity: 1,
		play: "loop",
		lines: ["Whenever you are ready.", "No rush. Some rush."],
		frames: [
			["m-flat hr-sign ar-up al-hip", 3],
			["m-flat hr-sign ar-up al-hip f-tapR", 2],
			["e-closed m-flat hr-sign ar-up al-hip", 2],
			["m-flat hr-sign ar-up al-hip f-tapR", 2],
			["b-up m-small hr-sign ar-wave1 al-hip", 1],
			["b-up m-small hr-sign ar-wave2 al-hip", 1],
			["b-up m-small hr-sign ar-wave1 al-hip", 1],
			["b-up m-small hr-sign ar-wave2 al-hip", 1],
			["e-half l-right b-one m-pout hr-sign ar-up al-hip f-tapR", 4],
			["e-shine b-up c-blush m-grin hr-sign ar-cheer al-wave1", 6, "Whenever you are ready."],
		],
	}),
	pose({
		name: "waitingPlease",
		title: "Waiting, rare variant",
		trigger: "waiting",
		rarity: 1 / 20,
		play: "loop",
		lines: ["I will name a variable after you."],
		frames: [
			["e-tear b-worry m-wobble fr-pls al-hi ar-hi bd-tilt", 3],
			["e-tear b-worry m-small fr-pls al-hi ar-hi bd-leanL", 2],
			["e-tear b-worry m-wobble fr-pls al-hi ar-hi bd-leanR", 2],
			["e-tear b-worry m-small fr-pls al-hi ar-hi bd-leanL", 2],
			["e-shine b-worry c-blush m-small fr-pls al-hi ar-hi f-tip", 6, "I will name a variable after you."],
		],
	}),
	pose({
		// Reads the result under the glass, recoils, hands to the head, looks again, and sulks.
		name: "testFailed",
		title: "Failed test",
		trigger: "test-failed",
		rarity: 1,
		play: "once",
		lines: ["It passed on my machine.", "Again."],
		frames: [
			["l-left b-one m-small hl-mag al-raise", 2],
			["e-wide l-left b-up m-open hl-mag al-raise bd-back", 2],
			["e-wide b-worry m-wobble al-head ar-head x-sweat1", 2],
			["e-wide l-left b-worry m-wobble al-head ar-head x-sweat2", 2],
			["e-tear b-worry m-wobble al-palm ar-low x-sweat1", 5, "It passed on my machine."],
			["e-half b-angry m-flat al-cross ar-cross2", 5, "Again."],
		],
	}),
	pose({
		name: "prOpened",
		title: "PR opened",
		trigger: "pr-opened",
		rarity: 1,
		play: "once",
		lines: ["PR #219. Frame it.", "Ship it before it changes its mind."],
		frames: [
			["e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf1", 2],
			["e-shine b-up m-grin hr-trophy ar-up al-cheer f-runR x-conf2", 2],
			["e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf3", 2],
			["e-happy m-shout hr-trophy ar-up al-cheer f-tip x-conf1", 2],
			["e-star b-up c-blush m-grin hr-trophy ar-up al-hip f-kick x-conf2", 6, "PR #219. Frame it."],
		],
	}),
	pose({
		name: "handover",
		title: "Handing work to a new subagent",
		trigger: "subagent-spawned",
		rarity: 1,
		play: "once",
		roles: ["lead"],
		lines: ["One job. Find saveDraft.", "Bring it back in one piece."],
		frames: [
			["l-right m-small fr-box al-hold ar-hold", 3],
			["e-happy l-right m-grin fr-box al-hold ar-hold bd-leanR", 2],
			["l-right m-open al-low ar-point bd-leanR", 4, "One job. Find saveDraft."],
			["e-happy m-grin al-hip ar-wave1", 1],
			["e-happy m-grin al-hip ar-wave2", 1],
			["e-happy m-grin al-hip ar-wave1", 1],
			["e-happy m-grin al-hip ar-wave2", 1],
			["e-half l-right m-smirk al-hip ar-hip", 5, "Bring it back in one piece."],
		],
		partner: {
			role: "scout",
			frames: [
				["at-off", 3],
				["at-s1 e-shine l-left b-up m-open al-hold ar-hold", 2],
				["at-s1 l-left m-small fr-box al-hold ar-hold", 4],
				["at-s2 b-angry m-flat fr-box al-hold ar-hold f-runL bd-leanR", 1],
				["at-s2 b-angry m-flat fr-box al-hold ar-hold f-runR bd-leanR", 1],
				["at-s3 b-angry m-flat fr-box al-hold ar-hold f-runL bd-leanR", 1],
				["at-s3 b-angry m-flat fr-box al-hold ar-hold f-runR bd-leanR x-dust", 1],
				["at-s3 a-binoc m-small al-face ar-face f-wide", 5],
			],
		},
	}),
	pose({
		name: "asleep",
		title: "Asleep at the desk",
		trigger: "idle-long",
		rarity: 1,
		play: "once",
		lines: ["zzz", "I was resting my context."],
		frames: [
			["e-half m-small al-type1 ar-type2 fr-desk", 2],
			["e-closed m-yawn al-cheer ar-cheer fr-desk", 3],
			["e-closed m-small al-low ar-low bd-slump fr-desk x-z1", 3],
			["e-closed m-drool al-low ar-low bd-nap fr-desk x-z2", 4],
			["e-closed m-drool al-low ar-low bd-nap fr-desk x-z3", 5],
			["e-wide b-up m-open al-out ar-out bd-back fr-desk x-pop", 2],
			["e-half l-right c-blush m-small al-type1 ar-type2 fr-desk", 5, "I was resting my context."],
		],
	}),
	pose({
		name: "stalled",
		title: "Stalled, gathering cobwebs",
		trigger: "stalled",
		rarity: 1,
		play: "once",
		lines: ["Still here. Technically.", "Any minute now."],
		frames: [
			["e-half b-flat m-flat al-low ar-low", 4],
			["e-half b-flat m-pout al-low ar-low bd-slump x-dust", 4],
			["e-closed c-pale m-small al-down ar-down bd-slump x-cobweb", 8, "Still here. Technically."],
		],
	}),
	pose({
		name: "done",
		title: "Done",
		trigger: "finished",
		rarity: 1,
		play: "once",
		lines: ["Done. You're welcome.", "Clocking out."],
		frames: [
			["e-wide b-up m-open al-out ar-out", 2],
			["e-happy m-grin al-cheer ar-cheer f-tip x-spark", 3],
			["e-happy m-shout al-cheer ar-cheer f-runL x-conf1", 2, "Done. You're welcome."],
			["e-closed c-blush m-smirk hr-mug ar-sip al-hip", 4],
			["e-happy c-blush m-smirk hr-mug ar-raise al-hip f-swingL", 4],
		],
	}),
	pose({
		name: "thinking",
		title: "Thinking hard",
		trigger: "thinking",
		rarity: 1,
		play: "once",
		lines: ["Hm.", "What if we just deleted it."],
		frames: [
			["e-half l-upR b-one m-small hl-clip al-low ar-chin x-think1", 2],
			["e-half l-upR b-one m-small hl-clip al-low ar-chin x-think2", 2],
			["e-half l-upR b-one m-pout hl-clip al-low ar-chin bd-tilt x-think3", 4, "Hm."],
			["e-squint b-angry m-flat hl-clip al-low ar-head x-think3", 3],
			["e-wide b-up m-open hl-clip al-low ar-up x-idea", 2],
			["e-star b-up m-grin hl-clip al-low ar-point x-idea", 6, "What if we just deleted it."],
		],
	}),
	pose({
		name: "celebrate",
		title: "Celebrating with a teammate",
		trigger: "subagent-green",
		rarity: 1,
		play: "once",
		lines: ["Green. Nobody touch anything."],
		frames: [
			["e-wide l-right b-up m-open", 2],
			["e-shine m-grin al-cheer ar-cheer f-tip x-conf1", 2],
			["e-happy l-right m-shout al-hip ar-five bd-leanR", 2],
			["e-happy l-right m-shout al-hip ar-five bd-leanR x-spark", 2],
			["e-happy m-grin hl-pom hr-pom al-wave1 ar-wave2 f-runL x-conf2", 1],
			["e-happy m-grin hl-pom hr-pom al-wave2 ar-wave1 f-runR x-conf3", 1],
			["e-happy m-grin hl-pom hr-pom al-wave1 ar-wave2 f-runL x-conf1", 1],
			["e-happy m-grin hl-pom hr-pom al-wave2 ar-wave1 f-runR x-conf2", 1],
			["e-half m-smirk al-hip ar-hip", 6, "Green. Nobody touch anything."],
		],
		partner: {
			role: "verifier",
			frames: [
				["at-s2 e-wide l-left b-up m-open hr-ok ar-up", 2],
				["at-s2 e-shine m-grin hr-ok ar-cheer al-cheer f-tip", 2],
				["at-s2 e-happy l-left m-shout hr-ok ar-raise al-five bd-leanL", 2],
				["at-s2 e-happy l-left m-shout hr-ok ar-raise al-five bd-leanL", 2],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave2 ar-wave1 f-runR", 1],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave1 ar-wave2 f-runL", 1],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave2 ar-wave1 f-runR", 1],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave1 ar-wave2 f-runL", 1],
				["at-s2 e-closed c-blush m-grin hr-ok ar-raise al-hip", 6],
			],
		},
	}),
	pose({
		name: "grumpy",
		title: "Grumpy at a 40-minute build",
		trigger: "long-build",
		rarity: 1,
		play: "loop",
		lines: ["Forty minutes. I have aged.", "It is fine. I love waiting."],
		frames: [
			["e-half b-flat m-pout al-cross ar-cross2 f-tapR x-clock1", 2],
			["e-half b-flat m-pout al-cross ar-cross2 x-clock2", 2],
			["e-half b-flat m-pout al-cross ar-cross2 f-tapR x-clock3", 2],
			["e-closed b-flat m-pout al-cross ar-cross2 x-clock4", 2],
			["e-half l-upR b-angry m-flat al-cross ar-cross2 f-tapR x-clock1", 3],
			["e-closed b-angry m-frown al-cross ar-cross2 f-tapR x-steam1", 2],
			["e-squint l-upR b-angry m-shout al-low ar-point x-steam2", 2],
			["e-closed b-flat m-flat hr-mug ar-sip al-hip", 4],
			["e-half b-one m-pout hr-mug ar-raise al-hip", 6, "Forty minutes. I have aged."],
		],
	}),
	pose({
		name: "walk",
		title: "Walking somewhere",
		trigger: "walking",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right f-swingL al-low ar-down", 2],
			["l-right f-swingR al-down ar-low bd-bob", 2],
		],
	}),
	// The brick run: the director walks a builder to the crew's build with `carry` as the cue's
	// walkPose, then plays `place` there (facing the tower, which stands up and to the right). The
	// brick rides on the palm at the leading shoulder; at the build the palm sets it down out front
	// and up (theme WORK.brick), lets go and pats it. The last frame has empty hands and holds: the
	// office puts the brick on the tower the moment `place` ends.
	pose({
		name: "carry",
		title: "Carrying a piece over",
		trigger: "walking",
		rarity: 1,
		play: "loop",
		roles: ["builder"],
		lines: [],
		frames: [
			["l-right b-one m-small hr-brick ar-shoulder al-low f-swingL", 2],
			["l-right b-one m-small hr-brick ar-shoulder al-down f-swingR bd-bob", 2],
			["l-right b-one m-small hr-brick ar-shoulder al-low f-swingL", 2],
			["l-right b-one m-small hr-brick ar-shoulder al-down f-swingR bd-bob", 1],
			["e-closed l-right b-one m-small hr-brick ar-shoulder al-down f-swingR bd-bob", 1],
		],
	}),
	pose({
		name: "place",
		title: "Adding a piece to the build",
		trigger: "working",
		rarity: 1,
		play: "once",
		roles: ["builder"],
		lines: [],
		frames: [
			["l-right b-one m-small hr-brick ar-shoulder al-low", 1],
			["l-right b-one m-small hr-brick ar-set al-low", 2],
			["l-right b-flat m-small ar-pat2 al-low w-brick", 1],
			["e-squint l-right m-small ar-pat1 al-low w-brick", 1],
			["l-right m-small ar-pat2 al-low w-brick", 1],
			["e-squint l-right m-small ar-pat1 al-low w-brick", 1],
			["e-happy l-right m-grin ar-pat2 al-low w-brick", 2],
			// Hands off: the office draws the brick onto its tower as this pose ends.
			["e-happy m-grin ar-hip al-hip", 2],
		],
	}),
	// At the stations (src/scene/world/stations.ts STATION_POSE). The director stands the crew
	// member STATION_REACH from the station's working point, facing it; the office draws the
	// furniture's body and the rig the parts the hands move (w-cabinet, w-copier...), so the drawer
	// opens, the lid lifts and the form takes the mark in the rig's own frames. The working point is
	// about eye level for a mochi, so it reaches up (bd-up) and looks across (l-right). Arms are
	// solved onto the station's points: reach.ts REACH, checked by the tests.
	pose({
		// Read: pull the top drawer, walk the tabs, draw a folder up, open it and read, turn a page,
		// find it, and put it back and push the drawer shut.
		name: "fileFolder",
		title: "Flipping through a folder",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right b-one m-small al-low ar-grip w-cabinet", 2],
			["e-squint l-right b-flat m-blep al-low ar-pull bd-leanL w-drawer", 2],
			["l-right b-one m-small al-low ar-tab1 bd-up w-drawer", 2],
			["e-squint l-right b-one m-blep al-low ar-tab2 bd-up w-drawer", 1],
			["e-squint l-right b-one m-blep al-low ar-tab1 bd-up w-drawer", 1],
			["e-wide l-right b-up m-small al-low ar-tab2 bd-up w-drawer", 1],
			["l-upR b-up m-small al-low hr-folder ar-fetch bd-up w-drawerGap", 2],
			["l-down b-one m-small fr-folder al-sheet ar-sheet w-drawerGap", 3],
			["e-closed l-down m-small fr-folder al-sheet ar-sheet w-drawerGap", 1],
			["e-half l-down b-one m-small fr-folderT al-sheet ar-flip w-drawerGap", 2],
			["l-down b-up m-small fr-folder2 al-sheet ar-sheet w-drawerGap", 3],
			["e-happy l-down m-grin fr-folder2 al-sheet ar-sheet w-drawerGap", 1],
			["l-right b-flat m-small al-low hr-folder ar-tab2 bd-up w-drawerGap", 2],
			["l-right m-small al-low ar-pull bd-leanL w-drawer", 1],
			["e-happy l-right m-grin al-low ar-grip w-cabinet", 2],
		],
	}),
	pose({
		// Search: a fingertip walks the cards, flicking them forward, stops, pulls one up to squint at,
		// it's not the one, back it goes, and on through the cards.
		name: "cardThumb",
		title: "Thumbing through the card catalogue",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right b-one m-small al-low ar-card1 bd-up w-cards", 2],
			["e-squint l-right b-one m-blep al-low ar-card2 bd-up w-cardsA", 1],
			["e-squint l-right b-one m-blep al-low ar-card3 bd-up w-cardsB", 1],
			["e-squint l-right b-one m-small al-low ar-card2 bd-up w-cardsA", 1],
			["e-squint l-right b-one m-blep al-low ar-card3 bd-up w-cardsB", 1],
			["e-wide l-right b-up m-small al-low ar-card3 bd-up w-cardsB", 1],
			["l-upR b-up m-small al-low hr-card ar-card w-cardsGap", 2],
			["e-squint l-upR b-angry m-pout al-chin hr-card ar-card w-cardsGap", 3],
			["e-closed l-upR b-angry m-pout al-chin hr-card ar-card w-cardsGap", 1],
			["e-half l-upR b-flat m-flat al-chin hr-card ar-card w-cardsGap", 2],
			["l-right b-flat m-small al-low hr-card ar-card3 bd-up w-cardsGap", 1],
			["l-right b-one m-small al-low ar-card3 bd-up w-cards", 2],
		],
	}),
	pose({
		// A build: lift the lid with the original in hand, lay it on the glass, shut the lid, press
		// start, the scan light runs, and copies come out into the tray.
		name: "copierFeed",
		title: "Feeding the copier",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right b-one m-small al-low hr-paper ar-under w-copier", 2],
			["e-squint l-right b-one m-blep al-low hr-paper ar-lid bd-up w-lidHalf", 1],
			["l-right b-up m-small al-low hr-paper ar-lay bd-up w-lidUp", 2],
			["l-right b-one m-small al-low ar-flat bd-up w-lidSheet", 2],
			["l-right b-flat m-small al-low ar-shut w-copier", 1],
			["e-squint l-right b-one m-small al-low ar-press w-copier", 1],
			["e-wide l-right b-up m-small al-low ar-press w-scan", 1],
			["l-right b-one m-small al-hip ar-hip w-copy1", 2],
			["e-closed l-right m-small al-hip ar-hip w-scan", 1],
			["l-right b-one m-small al-hip ar-hip w-copy1", 2],
			["e-happy l-right m-grin al-hip ar-hip w-copy2", 3],
		],
	}),
	pose({
		// A failed build: start does nothing but a red light. Open the jam door, tug out the
		// crumpled sheet, shut it, press again: still red. A kick, and a glare.
		name: "copierKick",
		title: "Kicking the jammed copier",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-one m-small al-low ar-press w-copier", 1],
			["e-wide l-right b-up m-open al-low ar-press w-jam", 2],
			["e-squint l-downR b-one m-flat al-low ar-door w-jam", 1],
			["e-squint l-downR b-one m-flat al-low ar-door w-door", 1],
			["e-squint l-downR b-angry m-blep al-low ar-tug1 w-door", 1],
			["e-squint l-downR b-angry m-shout al-out ar-tug2 bd-leanL w-doorTug", 2],
			["e-wide l-right b-up m-open al-low hr-crumple ar-card w-doorOpen", 2],
			["e-half l-right b-flat m-flat al-low ar-door w-jammed", 1],
			["e-half l-right b-flat m-flat al-low ar-press w-jammed", 2],
			["e-squint l-right b-angry m-shout al-out ar-hip f-boot bd-leanL w-kicked", 2],
			["e-squint l-right b-angry m-frown al-hip ar-hip w-jammed", 2],
			["e-half l-right b-angry m-frown al-cross ar-cross2 w-jammed", 6],
		],
	}),
	pose({
		// A green test: ink the stamp, swing it over, press, and the form takes a green mark (the
		// rubber comes away dry); then push it onto the done pile, the next form under it.
		name: "stampGreen",
		title: "Stamping it approved",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right b-one m-small al-low hr-stamp ar-st1 bd-up w-forms", 2],
			["e-squint l-right b-one m-blep al-low hr-stamp ar-ink bd-up w-forms", 1],
			["l-right b-one m-small al-low hr-stampG ar-st1 bd-up w-forms", 1],
			["l-right b-flat m-small al-low hr-stampG ar-st2 bd-up w-forms", 1],
			["e-squint l-right b-angry m-flat al-low hr-stampG ar-stamp bd-up w-forms", 1],
			["e-wide l-right b-up m-small al-low hr-stamp ar-st2 bd-up w-formsOk", 2],
			["e-happy l-right m-grin al-low hr-stamp ar-push1 bd-up w-formsOk", 1],
			["e-happy l-right m-grin al-low hr-stamp ar-push2 bd-up w-formsSlid", 2],
		],
	}),
	pose({
		// A red test: the same stroke from the red pad, a red cross on the form, and a long sigh.
		name: "stampRed",
		title: "Stamping it rejected",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-flat m-flat al-low hr-stamp ar-st1 bd-up w-formsR", 2],
			["e-squint l-right b-flat m-flat al-low hr-stamp ar-ink bd-up w-formsR", 1],
			["l-right b-worry m-flat al-low hr-stampR ar-st2 bd-up w-formsR", 2],
			["e-squint l-right b-angry m-frown al-low hr-stampR ar-stamp bd-up w-formsR", 1],
			["e-half l-right b-worry m-flat al-low hr-stamp ar-st2 bd-up w-formsNo", 2],
			["e-closed b-worry m-small al-low hr-stamp ar-low w-formsNo x-sigh", 3],
			["e-half l-right b-worry m-pout al-low hr-stamp ar-low w-formsNo", 4],
		],
	}),
	pose({
		// A web fetch: the receiver at the ear, listening and nodding, jotting a bit at a time on the
		// notepad (each bit appears where the pencil went), and the full page flipped over.
		name: "phone",
		title: "On the phone",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-half l-upR b-one m-small hl-receiver al-ear hr-pencil ar-low w-note0", 3],
			["l-upR b-up m-small hl-receiver al-ear hr-pencil ar-low bd-nod w-note0", 1],
			["l-upR b-up m-small hl-receiver al-ear hr-pencil ar-low w-note0", 1],
			["l-upR b-up m-small hl-receiver al-ear hr-pencil ar-low bd-nod w-note0", 1],
			["l-right b-one m-open hl-receiver al-ear hr-pencil ar-low w-note0", 2],
			["e-squint l-right b-one m-blep hl-receiver al-ear hr-pencil ar-jot1 bd-up w-note0", 1],
			["e-squint l-right b-one m-blep hl-receiver al-ear hr-pencil ar-jot2 bd-up w-note1", 1],
			["e-squint l-right b-one m-blep hl-receiver al-ear hr-pencil ar-jot3 bd-up w-note2", 1],
			["l-upR b-up m-small hl-receiver al-ear hr-pencil ar-low bd-nod w-note2", 1],
			["e-closed l-upR m-small hl-receiver al-ear hr-pencil ar-low w-note2", 1],
			["l-upR b-up m-small hl-receiver al-ear hr-pencil ar-low w-note2", 1],
			["e-squint l-right b-one m-blep hl-receiver al-ear hr-pencil ar-jot3 bd-up w-note3", 1],
			["e-happy l-right m-grin hl-receiver al-ear hr-pencil ar-jot1 bd-up w-noteFlip", 2],
		],
	}),
	pose({
		// The PR: an envelope held up, over the outbox, let go; it drops into the tray. Dust off the
		// hands, hands on hips. Ends settled.
		name: "mailDrop",
		title: "Dropping the envelope in the outbox",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			// Arriving from envelopeCarry: the big envelope still held up in both hands, then gripped
			// in one (the same envelope, its airmail edge and red seal) and held out over the tray.
			["e-happy l-right b-up m-grin fr-bigEnvelope al-present ar-present w-outbox", 1],
			["l-right b-one m-small al-low hr-envelope ar-card w-outbox", 2],
			["l-right b-one m-small al-low hr-envelope ar-post w-outbox", 2],
			["e-wide l-downR b-up m-small al-low ar-let w-mail1", 1],
			["l-downR b-up m-small al-low ar-let w-mail2", 2],
			["e-happy m-grin al-brushHi ar-brushLo w-mail2 x-dusty", 1],
			["e-happy m-grin al-brushLo ar-brushHi w-mail2 x-dusty", 1],
			["e-happy m-grin al-brushHi ar-brushLo w-mail2 x-dusty", 1],
			["e-happy m-grin al-brushLo ar-brushHi w-mail2", 1],
			["e-half m-smirk al-hip ar-hip w-mail2", 4],
		],
	}),
	pose({
		// Cleaning up: slide the top sheet off the pile, stand it in the slot, and lower it as the
		// shredder buzzes and eats it, a sheet at a time.
		name: "shred",
		title: "Feeding the shredder",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right b-one m-small al-low ar-pick bd-up w-shred", 2],
			["l-right b-one m-small al-low hr-slip ar-slide bd-up w-shred4", 1],
			["l-right b-one m-small al-low hr-feed1 ar-feed1 bd-up w-shred4", 1],
			["e-squint l-right b-flat m-blep al-low hr-feed2 ar-feed2 bd-up w-shredBuzz", 1],
			["e-squint l-right b-flat m-blep al-low hr-feed3 ar-feed3 bd-up w-shredBuzz", 1],
			["e-closed l-right m-smirk al-low ar-feed3 bd-up w-shredBuzz", 1],
			["e-half l-right b-flat m-smirk al-low ar-low w-shred4", 2],
		],
	}),
	pose({
		// Waiting in line at a busy station. The queue stands close (two to a station, the one behind
		// drawn in front), so everything reads on the forward side and up top: the clipboard in the
		// forward hand under the chin, a foot tapping, and a rise onto the toes to see over the one
		// ahead (a rise clears its head; a lean would only push into it).
		name: "queueWait",
		title: "Waiting in line",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-half l-downR b-flat m-flat hr-clipF ar-check al-low", 3],
			["e-half l-downR b-flat m-flat hr-clipF ar-check al-low f-tapR", 1],
			["e-half l-downR b-flat m-flat hr-clipF ar-check al-low", 1],
			["e-half l-downR b-flat m-flat hr-clipF ar-check al-low f-tapR", 1],
			["e-closed l-downR b-flat m-flat hr-clipF ar-check al-low", 1],
			["l-upR b-one m-pout hr-clipF ar-low al-hip bd-peer f-tip", 3],
			["e-side l-upR b-one m-pout hr-clipF ar-low al-hip bd-peer f-tip", 2],
			["e-half b-flat m-flat hr-clipF ar-low al-hip f-tapR", 1],
			["e-half b-flat m-flat hr-clipF ar-low al-hip x-sigh", 2],
		],
		beats: {
			share: 0.3,
			passes: [
				{
					// Sizes up the one ahead: up on its toes, a long side-eye at them, back down, a sigh.
					name: "ahead",
					frames: [
						["e-half l-downR b-flat m-flat hr-clipF ar-check al-low", 3],
						["l-right b-up m-small hr-clipF ar-low al-hip bd-peer f-tip", 2],
						["e-side l-right b-one m-pout hr-clipF ar-low al-hip bd-peer f-tip", 3],
						["e-closed l-right b-one m-pout hr-clipF ar-low al-hip bd-peer f-tip", 1],
						["e-half l-right b-flat m-flat hr-clipF ar-low al-hip f-tapR", 1],
						["e-half l-right b-flat m-flat hr-clipF ar-low al-hip", 1],
						["e-half l-right b-flat m-flat hr-clipF ar-low al-hip f-tapR", 1],
						["e-half l-downR b-flat m-pout hr-clipF ar-check al-low x-sigh", 3],
					],
				},
			],
		},
	}),
	// Wave 2 (plan-next streams B and C2; the director plays these by name). Names, triggers and
	// play modes are the contract; the working points are reach.ts TRAY, BELL, PLANNER and HANDOFF.
	pose({
		// Context nearly full: the lead types in bursts behind a teetering in-tray (w-tray4, reach.ts
		// TRAY). The typing rocks the pile; it stops, rises on its toes to peer over and steadies the
		// top with a palm; types again; the top sheet skids off, a grab misses, and it goes over the
		// side. Sweat throughout. The pile is back to full on the loop: the in-tray keeps filling.
		name: "buried",
		title: "Buried under the in-tray",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-wide l-down b-worry m-flat al-type1 ar-type3 fr-desk w-tray4 x-sweat1", 1],
			["e-wide l-down b-worry m-flat al-type3 ar-type1 fr-desk w-tray4R", 1],
			["e-wide l-down b-worry m-flat al-type1 ar-type3 fr-desk w-tray4", 1],
			["e-closed l-down b-worry m-flat al-type3 ar-type1 fr-desk w-tray4L x-sweat2", 1],
			["e-wide l-down b-worry m-flat al-type1 ar-type3 fr-desk w-tray4", 1],
			["e-wide l-upR b-worry m-small al-type2 ar-type2 fr-desk w-tray4R", 2],
			["e-wide l-upR b-up m-small al-type2 ar-steady bd-peer f-tip fr-desk w-tray4", 3],
			["e-half l-upR b-worry m-flat al-type2 ar-steady bd-peer f-tip fr-desk w-tray4 x-sweat1", 2],
			["e-squint l-down b-angry m-flat al-type1 ar-type3 fr-desk w-tray4", 1],
			["e-squint l-down b-angry m-flat al-type3 ar-type1 fr-desk w-tray4R", 1],
			["e-wide l-right b-up m-open al-type1 ar-type3 fr-desk w-traySlide", 1],
			["e-wide l-right b-up m-open al-type2 ar-catch bd-peer fr-desk w-trayDrop", 2],
			["e-closed l-right b-worry m-wobble al-type2 ar-catch bd-peer fr-desk w-trayDrop x-sweat2", 1],
			["e-half l-down b-worry m-flat al-type1 ar-type3 fr-desk w-tray4", 1],
		],
	}),
	pose({
		// In line at your door, a numbered ticket in hand: a foot tapping, a look up at the NOW
		// SERVING sign (up and to the right), not yet; the ticket checked under the chin, a sigh, and
		// the foot again. No furniture of its own, so it plays at any door.
		name: "ticketWait",
		title: "Waiting at your door with a ticket",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right m-flat hr-ticket ar-low al-hip", 3],
			["l-right m-flat hr-ticket ar-low al-hip f-tapR", 1],
			["l-right m-flat hr-ticket ar-low al-hip", 1],
			["l-right m-flat hr-ticket ar-low al-hip f-tapR", 1],
			["e-wide l-upR b-up m-small hr-ticket ar-low al-hip", 3],
			["e-half l-upR b-flat m-flat hr-ticket ar-low al-hip", 2],
			["l-down b-one m-small hr-ticket ar-check al-hip", 3],
			["e-closed l-down b-one m-small hr-ticket ar-check al-hip", 1],
			["e-half l-down b-flat m-pout hr-ticket ar-check al-hip", 2],
			["e-half l-right b-flat m-flat hr-ticket ar-low al-hip x-sigh", 3],
			["e-half l-right b-flat m-flat hr-ticket ar-low al-hip f-tapR", 1],
			["e-half l-right b-flat m-flat hr-ticket ar-low al-hip", 1],
			["e-half l-right b-flat m-flat hr-ticket ar-low al-hip f-tapR", 1],
		],
	}),
	// Waiting gets worse the longer you leave it (plan-alive stream B; director/errands.ts
	// WAITING): polite, then ticketWait (the door, the foot), then a sigh and a word with the one
	// behind, then a slump with the ticket drooping. The line runs down and to the left of the
	// counter, so the one behind is on the walker's left.
	pose({
		// Just arrived: the ticket held up under the chin, a small smile, a hopeful look at the sign.
		name: "ticketPolite",
		title: "Waiting politely with a ticket",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-right m-small hr-ticket ar-check al-low", 5],
			["e-closed l-right m-small hr-ticket ar-check al-low", 1],
			["l-right m-small hr-ticket ar-check al-low", 3],
			["e-happy l-upR b-up m-small hr-ticket ar-check al-low", 3],
			["l-right c-blush m-small hr-ticket ar-check al-low", 4],
		],
	}),
	pose({
		// A while in: a sigh, then it turns to the one behind with an open hand ("can you believe"),
		// a shrug, a smirk, and back to facing the front with the foot going.
		name: "ticketChat",
		title: "Sighing to the one behind",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-half l-right b-flat m-flat hr-ticket ar-low al-hip x-sigh", 3],
			["e-side l-left b-one m-open hr-ticket ar-low al-out", 2],
			["e-side l-left b-one m-small hr-ticket ar-low al-shrug", 2],
			["e-side l-left b-up m-open hr-ticket ar-low al-out", 2],
			["e-closed l-left b-one m-smirk hr-ticket ar-low al-hip", 1],
			["e-half l-right b-flat m-pout hr-ticket ar-low al-hip f-tapR", 2],
			["e-half l-right b-flat m-pout hr-ticket ar-low al-hip", 2],
		],
	}),
	pose({
		// Left far too long: slumped, the ticket drooping from a limp wrist, a glance up at the sign
		// now and then, nothing.
		name: "ticketSlump",
		title: "Slumped in line, ticket drooping",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-half l-down b-worry m-pout hr-ticket ar-droop al-low bd-slump", 6],
			["e-closed l-down b-worry m-pout hr-ticket ar-droop al-low bd-slump", 2],
			["e-half l-right b-worry m-flat hr-ticket ar-droop al-low bd-slump x-sigh", 4],
			["e-half l-upR b-worry m-pout hr-ticket ar-low al-low bd-slump", 3],
			["e-half l-down b-worry m-pout hr-ticket ar-droop al-low bd-slump", 5],
		],
	}),
	pose({
		// First in line rings the bell on your desk (w-bell at reach.ts BELL): the flat palm raised
		// over it, brought down on the plunger (it goes down, the bell rings, "ding!"), lifted while
		// it hums, and the ringer settles, ticket still in the other hand.
		name: "bellRing",
		title: "Ringing the bell on your desk",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-one m-small hl-ticket al-low ar-low w-bell", 2],
			["e-squint l-right b-one m-blep hl-ticket al-low ar-poise w-bell", 2],
			["e-squint l-right b-angry m-flat hl-ticket al-low ar-ring w-bellDing x-ding", 1],
			["e-wide l-right b-up m-small hl-ticket al-low ar-ring w-bellDing x-ding", 2],
			["e-happy l-right m-grin hl-ticket al-low ar-poise w-bellHum x-ding", 2],
			["e-happy l-right m-grin hl-ticket al-low ar-hip w-bellHum", 2],
			["e-half l-right m-smirk hl-ticket al-low ar-hip w-bell", 5],
		],
	}),
	pose({
		// A walk pose (the cue's walkPose): a sticky note carried up on a fingertip like something
		// precious, eyes on it, its free end lifting in the breeze on each step.
		name: "stickyCarry",
		title: "Carrying a sticky note",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["l-upR b-up m-small hr-sticky ar-tipUp al-low f-swingL", 2],
			["l-upR b-up m-small hr-stickyFlap ar-tipUp al-down f-swingR bd-bob", 2],
			["l-upR b-up m-small hr-sticky ar-tipUp al-low f-swingL", 2],
			["l-upR b-up m-small hr-stickyFlap ar-tipUp al-down f-swingR bd-bob", 1],
			["e-closed l-upR b-up m-small hr-stickyFlap ar-tipUp al-down f-swingR bd-bob", 1],
		],
	}),
	pose({
		// At the wall planner (reach.ts PLANNER, up and in front): up on the toes, the palm presses the
		// note on (it leaves the finger for the wall), the thumb smooths its top edge there and back,
		// a step back to look, a nod. Ends with empty hands; the note stays on the planner (w-stickyOn
		// until the pose changes, then the office's planner shows it).
		name: "stickyPost",
		title: "Posting a sticky note on the planner",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-upR b-up m-small hr-sticky ar-tipUp al-low", 2],
			["e-squint l-upR b-one m-blep ar-stick al-low bd-reach f-tip w-stickyOn", 2],
			["e-squint l-upR b-flat m-blep ar-smooth1 al-low bd-reach f-tip w-stickyOn", 1],
			["e-squint l-upR b-flat m-blep ar-smooth2 al-low bd-reach f-tip w-stickyOn", 1],
			["e-squint l-upR b-flat m-blep ar-smooth1 al-low bd-reach f-tip w-stickyOn", 1],
			["e-squint l-upR b-flat m-blep ar-smooth2 al-low bd-reach f-tip w-stickyOn", 1],
			["e-wide l-upR b-up m-small al-low ar-low bd-stepBack f-swingR w-stickyOn", 2],
			["e-half l-upR b-one m-small al-hip ar-hip bd-stepBack w-stickyOn", 2],
			["e-happy l-upR m-grin al-hip ar-hip bd-nod w-stickyOn", 1],
			["e-happy l-upR m-grin al-hip ar-hip w-stickyOn", 1],
			["e-happy m-grin al-hip ar-hip bd-nod w-stickyOn", 1],
			["e-half m-smirk al-hip ar-hip w-stickyOn", 4],
		],
	}),
	pose({
		// A walk pose for the rush: a real run. Long strides with the free leg tucked through, the
		// arms pumping against the legs, leaning in from the hips (a turn, never a scale) and rising
		// in the float between strides; sweat flung back and papers peeling off behind. A beat a frame,
		// so at the run's walkTempo (1.65) it steps every 80 ms; twelve frames so the three-step trail
		// lines up with the four-frame stride.
		name: "rushRun",
		title: "Running, papers flying",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: Array.from({ length: 12 }, (_, i): Row => {
			const step = i % 4;
			const legs = ["strideL", "passL", "strideR", "passR"][step];
			const arms = step < 2 ? "al-pumpDown ar-pumpUp" : "al-pumpUp ar-pumpDown";
			const body = step % 2 ? "bd-dashUp" : "bd-dash";
			const eyes = i === 7 ? "e-squint" : "e-wide";
			return [`${eyes} l-right b-worry m-open ${arms} f-${legs} ${body} x-rush${(i % 3) + 1}`, 1];
		}),
	}),
	pose({
		// A walk pose: the PR's big envelope held up in front by both sides, chin up, a springy step
		// (the free knee lifted, the body rising off the standing leg).
		name: "envelopeCarry",
		title: "Carrying the PR envelope",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-happy l-right b-up m-grin fr-bigEnvelope al-present ar-present f-swingL", 2],
			["e-happy l-upR b-up m-grin fr-bigEnvelope al-present ar-present f-kneeR bd-bob", 2],
			["e-happy l-right b-up m-grin fr-bigEnvelope al-present ar-present f-swingR", 2],
			["e-happy l-upR b-up m-grin fr-bigEnvelope al-present ar-present f-kneeL bd-bob", 1],
			["e-closed l-upR b-up m-grin fr-bigEnvelope al-present ar-present f-kneeL bd-bob", 1],
		],
	}),
	pose({
		// A long build at the copier, as a running feud (the copier drawn jammed throughout, w-jammed),
		// starting on the kick: the kick spits a crumpled corner out of the jam door; pluck it out,
		// glare at it, toss it over the shoulder; arms crossed, glaring, a foot tapping, a huff; jab
		// the button, jab, jab (it sinks and the red light flashes, nothing else); steam; and the
		// glare that leads into the next kick.
		name: "copierFeud",
		title: "A running feud with the copier",
		trigger: "working",
		rarity: 1,
		play: "loop",
		lines: [],
		frames: [
			["e-squint l-right b-angry m-shout al-out ar-hip f-boot bd-leanL w-kicked", 2],
			["e-wide l-right b-up m-open al-low ar-hip w-kickSpit", 2],
			["e-squint l-downR b-angry m-flat al-low ar-pluck w-jam", 1],
			["e-squint l-downR b-angry m-flat al-low hr-crumple ar-pluck w-jammed", 1],
			["e-squint l-right b-angry m-pout al-low hr-crumple ar-card w-jammed", 3],
			["e-half b-flat m-smirk al-low ar-toss w-jammed x-toss", 2],
			["e-half l-right b-angry m-frown al-cross ar-cross2 w-jammed", 2],
			["e-half l-right b-angry m-frown al-cross ar-cross2 w-jammed", 3],
			["e-half l-right b-angry m-frown al-cross ar-cross2 f-tapR w-jammed", 1],
			["e-half l-right b-angry m-frown al-cross ar-cross2 w-jammed", 1],
			["e-half l-right b-angry m-frown al-cross ar-cross2 f-tapR w-jammed", 1],
			["e-closed l-right b-angry m-frown al-cross ar-cross2 w-jammed x-sigh", 2],
			["e-squint l-right b-angry m-flat al-low ar-press w-jabbed", 1],
			["e-squint l-right b-angry m-flat al-low ar-jab0 w-jammed", 1],
			["e-squint l-right b-angry m-blep al-low ar-press w-jabbed", 1],
			["e-squint l-right b-angry m-blep al-low ar-jab0 w-jammed", 1],
			["e-squint l-right b-angry m-shout al-low ar-press w-jabbed x-steam1", 1],
			["e-half l-right b-angry m-frown al-low ar-hip w-jammed x-steam2", 2],
		],
	}),
	pose({
		// A signature move after finishing something (a flamboyant model's trait): a finger-gun drawn,
		// fired (the hand kicks up, a spark at the tip), blown on, holstered. One gesture, then settled.
		name: "flourish",
		title: "A little flourish",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-one m-smirk al-hip ar-hip", 1],
			["e-side l-right b-one m-smirk al-hip hr-finger ar-point", 2],
			["e-squint l-right b-one m-grin al-hip hr-finger ar-recoil x-pew", 1],
			["e-happy l-right m-grin al-hip hr-finger ar-recoil", 1],
			["e-closed m-small al-hip hr-finger ar-blow x-sigh", 2],
			["e-happy c-blush m-smirk al-hip ar-hip", 4],
		],
	}),
	pose({
		// A two-hander: the giver holds a folder out at arm's length; the taker (its own character,
		// standing reach.ts HANDOFF.slot in front of the giver and facing it) steps in (at-s2, to
		// HANDOFF.gap), reaches and takes the far edge, both hold it a beat, the giver lets go, and
		// the taker tucks it under its arm and nods. Each
		// part is written in its own space (both look right, toward the other); the folder is drawn
		// by whoever holds it and sits in the same place for both.
		name: "handOff",
		title: "Handing a folder to a teammate",
		trigger: "working",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [
			["l-right b-one m-small hr-folderOut ar-offerIn al-low", 2],
			["l-right b-up m-small hr-folderOut ar-offer al-low", 2],
			["e-happy l-right m-grin hr-folderOut ar-offer al-low", 3],
			["l-right b-up m-small ar-offer al-low", 1],
			["e-happy l-right m-grin ar-hip al-hip", 2],
			["e-happy l-right m-grin ar-hip al-hip bd-nod", 1],
			["e-half l-right m-smirk ar-hip al-hip", 3],
		],
		partner: {
			role: "builder",
			frames: [
				["l-right b-up m-small al-low ar-low", 2],
				["at-s2 l-right b-up m-open al-low ar-reachOut f-swingL", 2],
				["at-s2 e-happy l-right m-grin al-low ar-offer", 3],
				["at-s2 l-right b-one m-small al-low hr-folderOut ar-offer", 1],
				["at-s2 l-down b-one m-small al-low hr-folderTuck ar-tuck", 2],
				["at-s2 e-happy m-grin al-low hr-folderTuck ar-tuck bd-nod", 1],
				["at-s2 e-happy m-grin al-low hr-folderTuck ar-tuck", 1],
				["at-s2 e-happy m-grin al-low hr-folderTuck ar-tuck bd-nod", 1],
				["at-s2 e-half m-smirk al-low hr-folderTuck ar-tuck", 1],
			],
		},
	}),
	pose({
		name: "rest",
		title: "Standing about",
		trigger: "idle",
		rarity: 1,
		play: "once",
		lines: [],
		frames: [["", 1]],
	}),
];

export const POSE: Record<string, Pose> = Object.fromEntries(POSES.map((p) => [p.name, p]));

/** The slacking habits, in the Cast board's order. */
export const HABITS = POSES.filter((p) => p.habit);

/** How long one pass through a pose takes. */
export const duration = (frames: { ms: number }[]): number => frames.reduce((n, f) => n + f.ms, 0);

/** How long one pass through a pose takes for its lead, or for its partner (0 for an unknown pose). */
export const poseMs = (name: string, as: "lead" | "partner" = "lead") => {
	const p = POSE[name];
	return p ? duration(as === "partner" && p.partner ? p.partner.frames : p.frames) : 0;
};
