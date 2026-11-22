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
}

type Row = [tokens: string, beats: number, say?: string];
const frames = (rows: Row[]): TimedFrame[] =>
	rows.map(([t, beats, say]) => ({ ...parseFrame(t), ms: beats * BEAT_MS, ...(say ? { say } : {}) }));

const pose = ({ partner, ...p }: Omit<Pose, "frames" | "partner"> & { frames: Row[]; partner?: { role: Role; frames: Row[] } }): Pose => ({
	...p,
	frames: frames(p.frames),
	...(partner ? { partner: { role: partner.role, frames: frames(partner.frames) } } : {}),
});

// Acting, not wobbling: the body doesn't squash, stretch or hop. Hands and tools do a job you can
// recognise, the eyes stay on the work (l-downR is the bench out front), and the work answers: a
// strike drives the nail (w-nail1 to w-nail3), a wrench turns the nut, a poke rocks the stack. The
// body moves only for the action (leaning in to look, recoiling from a blow, a step's rise).
// Long holds carry a one-beat blink (e-closed). Tool arms are solved onto theme.ts WORK.
export const POSES: Pose[] = [
	// Hard at it ----------------------------------------------------------------------------------
	pose({
		name: "typing", title: "Typing, frantic", trigger: "busy", rarity: 1, play: "loop",
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
	}),
	pose({
		// Edit/Write: a nail driven home in three strokes, checked, and the next one started. Each
		// strike lands on the head (ARMS.hit1-3), and on the beat after it the nail and the hammer go
		// down together.
		name: "hammer", title: "Hammering until it compiles", trigger: "busy", rarity: 1, play: "loop", roles: ["builder"],
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
	}),
	pose({
		name: "scouting", title: "Scouting with binoculars", trigger: "busy", rarity: 1, play: "loop", roles: ["scout"],
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
		name: "exploring", title: "Exploring with a torch", trigger: "busy", rarity: 1, play: "loop", roles: ["explorer"],
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
		name: "reviewing", title: "Reviewing, with notes", trigger: "busy", rarity: 1, play: "loop", roles: ["reviewer"],
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
		name: "verifying", title: "Verifying under the glass", trigger: "busy", rarity: 1, play: "loop", roles: ["verifier"],
		lines: ["Green. Allegedly."],
		frames: [
			["e-squint l-left b-one m-small hl-mag al-raise ar-hip bd-leanL", 3],
			["e-wide l-left b-up m-open hl-mag al-raise ar-hip bd-leanL", 2],
			["e-happy m-grin hl-mag al-low hr-ok ar-up", 3],
			["m-smirk hl-mag al-low hr-ok ar-raise", 3],
		],
	}),
	pose({
		name: "painting", title: "Moving it two pixels", trigger: "busy", rarity: 1, play: "loop", roles: ["designer"],
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
		name: "blueprint", title: "Reading the blueprint", trigger: "working", rarity: 1, play: "loop", roles: ["builder"],
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
		name: "rummage", title: "Looking for the right part", trigger: "working", rarity: 1, play: "loop", roles: ["builder"],
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
		name: "tinker", title: "Tinkering while it runs", trigger: "working", rarity: 1, play: "loop", roles: ["builder"],
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
		name: "poke", title: "Poking it to see if it holds", trigger: "working", rarity: 1, play: "loop", roles: ["builder"],
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
		name: "thumb", title: "Hammered the thumb", trigger: "test-failed", rarity: 1, play: "once", roles: ["builder"],
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
		name: "glance", title: "Glancing at a teammate", trigger: "reacting", rarity: 1, play: "once",
		lines: [],
		frames: [
			["l-right b-up m-small", 2],
			["e-side l-right b-one m-smirk bd-leanR", 4],
			["e-closed m-small", 1],
			["e-half m-flat", 3],
		],
	}),
	pose({
		// The lead leans in over the work, strokes its chin, points out the next thing, nods.
		name: "inspect", title: "Checking on the crew", trigger: "inspecting", rarity: 1, play: "loop", roles: ["lead"],
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

	// Slacking, obviously: seven habits ------------------------------------------------------------
	pose({
		name: "feetUp", title: "Feet up", trigger: "idle", rarity: 1, play: "once", habit: true,
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
		name: "faceDown", title: "Face down on the keys", trigger: "idle-long", rarity: 1, play: "once", habit: true,
		lines: ["zzz", "I was resting my context."],
		frames: [
			["e-closed m-drool bd-nap al-low ar-low fr-desk x-z1", 4],
			["e-closed m-small bd-nap al-low ar-low fr-desk x-z2", 4],
			["e-closed m-drool bd-nap al-low ar-low fr-desk x-z3", 4],
		],
	}),
	pose({
		name: "chairSpin", title: "Chair spin", trigger: "idle", rarity: 1, play: "once", habit: true,
		lines: ["Wheee. I mean: thinking."],
		frames: [
			["e-happy m-grin al-cheer ar-cheer f-kick bk-chair bd-tilt", 3],
			["e-shine b-up m-open al-up ar-up f-wide bk-chair bd-leanR", 3],
			["e-happy m-grin al-cheer ar-cheer f-kick bk-chair bd-leanL", 3],
			["e-half m-smirk al-low ar-low f-wide bk-chair", 3],
		],
	}),
	pose({
		name: "scrolling", title: "Scrolling", trigger: "idle", rarity: 1, play: "once", habit: true,
		lines: ["Researching. On my phone."],
		frames: [
			["e-half l-down b-flat m-flat hr-phone ar-phone al-hip", 5],
			["e-half l-down b-flat m-smirk hr-phone ar-phone al-hip", 3],
			["e-wide l-down b-up m-open hr-phone ar-phone al-face", 2],
			["e-happy l-right m-grin hr-phone ar-raise al-hip", 3],
		],
	}),
	pose({
		name: "waterCooler", title: "Water cooler", trigger: "idle", rarity: 1, play: "once", habit: true,
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
		name: "stretch", title: "The stretch", trigger: "idle", rarity: 1, play: "once", habit: true,
		lines: ["Hydrating my joints."],
		frames: [
			["e-half m-flat al-low ar-low", 3],
			["e-closed m-yawn al-cheer ar-cheer f-tip", 4],
			["e-half m-small al-head ar-hip", 3],
		],
	}),
	pose({
		name: "slowWalk", title: "The slow walk", trigger: "idle", rarity: 1, play: "once", habit: true,
		lines: ["Very busy. Carrying a paper."],
		frames: [
			["e-half l-right m-smirk hl-paper al-raise ar-low f-swingL", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-down f-swingR bd-bob", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-low f-swingL", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-down f-swingR bd-bob", 3],
		],
	}),

	// Acted --------------------------------------------------------------------------------------
	pose({
		name: "waiting", title: "Waiting on you", trigger: "waiting", rarity: 1, play: "loop",
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
		name: "waitingPlease", title: "Waiting, rare variant", trigger: "waiting", rarity: 1 / 20, play: "loop",
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
		name: "testFailed", title: "Failed test", trigger: "test-failed", rarity: 1, play: "once",
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
		name: "prOpened", title: "PR opened", trigger: "pr-opened", rarity: 1, play: "once",
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
		name: "handover", title: "Handing work to a new subagent", trigger: "subagent-spawned", rarity: 1, play: "once", roles: ["lead"],
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
		name: "asleep", title: "Asleep at the desk", trigger: "idle-long", rarity: 1, play: "once",
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
		name: "stalled", title: "Stalled, gathering cobwebs", trigger: "stalled", rarity: 1, play: "once",
		lines: ["Still here. Technically.", "Any minute now."],
		frames: [
			["e-half b-flat m-flat al-low ar-low", 4],
			["e-half b-flat m-pout al-low ar-low bd-slump x-dust", 4],
			["e-closed c-pale m-small al-down ar-down bd-slump x-cobweb", 8, "Still here. Technically."],
		],
	}),
	pose({
		name: "done", title: "Done", trigger: "finished", rarity: 1, play: "once",
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
		name: "thinking", title: "Thinking hard", trigger: "thinking", rarity: 1, play: "once",
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
		name: "celebrate", title: "Celebrating with a teammate", trigger: "subagent-green", rarity: 1, play: "once",
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
		name: "grumpy", title: "Grumpy at a 40-minute build", trigger: "long-build", rarity: 1, play: "loop",
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
		name: "walk", title: "Walking somewhere", trigger: "walking", rarity: 1, play: "loop",
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
		name: "carry", title: "Carrying a brick", trigger: "walking", rarity: 1, play: "loop", roles: ["builder"],
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
		name: "place", title: "Setting a brick on the build", trigger: "working", rarity: 1, play: "once", roles: ["builder"],
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
	// Station placeholders (plan-next stream C/E): the director plays these at shared equipment; the
	// rig pass replaces their frames. Each reaches to STATION_REACH (src/scene/director/stations.ts).
	...(
		[
			["fileFolder", "Flipping through a folder", "loop", ["l-right m-small hl-paper al-raise ar-point", 3], ["e-half l-right b-one m-small hl-paper al-raise ar-chin", 3]],
			["cardThumb", "Thumbing through the card catalogue", "loop", ["e-squint l-right m-small al-low ar-point", 2], ["e-squint l-right b-one m-blep al-low ar-poke", 2]],
			["copierFeed", "Feeding the copier", "loop", ["l-right m-small hl-paper al-raise ar-point", 3], ["e-half l-right m-small al-low ar-out", 3]],
			["copierKick", "Kicking the jammed copier", "once", ["e-squint b-angry m-frown al-hip ar-hip f-kick", 3], ["e-half b-flat m-pout al-cross ar-cross2", 4]],
			["stampGreen", "Stamping it approved", "loop", ["l-right m-small al-low ar-raise", 2], ["e-happy l-right m-grin al-low ar-point x-spark", 2]],
			["stampRed", "Stamping it rejected", "once", ["l-right b-angry m-flat al-low ar-raise", 2], ["e-squint b-angry m-frown al-low ar-point", 4]],
			["phone", "On the phone", "loop", ["l-right m-open hr-phone ar-phone al-hip", 4], ["e-half l-upR b-one m-small hr-phone ar-phone al-chin", 4]],
			["mailDrop", "Dropping the envelope in the outbox", "once", ["l-right m-small hl-paper al-raise ar-low", 3], ["e-happy m-grin al-low ar-hip", 3]],
			["shred", "Feeding the shredder", "loop", ["l-right m-small hl-paper al-raise ar-point", 3], ["e-closed l-right m-smirk al-low ar-out", 3]],
		] as [string, string, "loop" | "once", Row, Row][]
	).map(([name, title, play, ...rows]) => pose({ name, title, trigger: "working", rarity: 1, play, lines: [], frames: rows })),
	pose({
		name: "rest", title: "Standing about", trigger: "idle", rarity: 1, play: "once",
		lines: [],
		frames: [["", 1]],
	}),
];

export const POSE: Record<string, Pose> = Object.fromEntries(POSES.map((p) => [p.name, p]));

/** The slacking habits, in the Cast board's order. */
export const HABITS = POSES.filter((p) => p.habit);

/** How long one pass through a pose takes. */
export const duration = (frames: { ms: number }[]): number => frames.reduce((n, f) => n + f.ms, 0);
