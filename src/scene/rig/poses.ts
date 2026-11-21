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
	| "long-build";

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

export const POSES: Pose[] = [
	// Hard at it ----------------------------------------------------------------------------------
	pose({
		name: "typing", title: "Typing, frantic", trigger: "busy", rarity: 1, play: "loop",
		lines: ["Typing.", "Do not talk to me."],
		frames: [
			["e-wide b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
			["e-wide b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
			["e-wide b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
			["e-wide b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
			["e-wide b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk", 1],
			["e-wide b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk x-sweat1", 1],
			["e-wide l-right b-up m-open al-type2 ar-type2 fr-desk x-papers1", 2],
			["e-squint b-angry m-wobble al-type3 ar-type3 bd-fwd fr-desk x-papers2", 1],
			["e-wide b-worry m-flat al-type1 ar-type3 bd-fwd fr-desk x-sweat2", 1],
			["e-wide b-worry m-flat al-type3 ar-type1 bd-fwd fr-desk", 1],
			["e-closed b-worry m-small hr-mug ar-sip al-type1 bd-tilt fr-desk", 3],
		],
	}),
	pose({
		name: "hammer", title: "Hammering until it compiles", trigger: "busy", rarity: 1, play: "loop", roles: ["builder"],
		lines: ["It compiles in my heart."],
		frames: [
			["e-squint b-angry m-flat hr-hammer ar-ham1 al-hip bd-stretch", 2],
			["e-wide m-open hr-hammer ar-ham2 al-hip bd-squash x-pop", 2],
			["e-squint b-angry m-flat hr-hammer ar-ham1 al-hip bd-stretch", 2],
			["e-wide m-open hr-hammer ar-ham2 al-hip bd-squash x-pop", 2],
			["e-squint b-angry m-flat hr-hammer ar-ham1 al-hip bd-stretch", 2],
			["e-wide m-open hr-hammer ar-ham2 al-hip bd-squash x-pop", 2],
			["e-closed m-open hr-hammer ar-low al-head bd-low x-sweat1", 3],
			["e-shine m-grin hr-hammer ar-cheer al-hip", 3],
		],
	}),
	pose({
		name: "scouting", title: "Scouting with binoculars", trigger: "busy", rarity: 1, play: "loop", roles: ["scout"],
		lines: ["Found it. Probably."],
		frames: [
			["a-binoc m-small al-face ar-face f-wide bd-leanL", 3],
			["a-binoc m-small al-face ar-face f-wide bd-leanR", 3],
			["e-wide b-up m-open hl-map al-raise ar-point l-right", 2],
			["e-shine m-grin hl-map al-cheer ar-hip bd-hop", 2],
		],
	}),
	pose({
		name: "exploring", title: "Exploring with a torch", trigger: "busy", rarity: 1, play: "loop", roles: ["explorer"],
		lines: ["It's dark in node_modules."],
		frames: [
			["e-wide l-left b-up m-small hr-torch ar-raise al-low", 3],
			["e-wide l-right b-up m-open hr-torch ar-point al-low", 3],
			["e-shine m-grin hr-torch ar-cheer al-cheer bd-hop", 2],
		],
	}),
	pose({
		name: "reviewing", title: "Reviewing, with notes", trigger: "busy", rarity: 1, play: "loop", roles: ["reviewer"],
		lines: ["I have notes."],
		frames: [
			["e-half l-right b-one m-flat hl-clip al-low ar-point", 3],
			["e-squint b-angry m-small hl-clip al-low ar-chin", 3],
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
			["e-happy m-grin hl-mag al-low hr-ok ar-up bd-hop", 3],
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
			["e-half b-one m-small hr-brush ar-low al-chin bd-back", 3],
			["e-shine b-up m-grin hr-brush ar-cheer al-cheer bd-hop", 2],
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
			["e-closed m-yawn al-cheer ar-cheer bd-stretch", 4],
			["e-half m-small al-head ar-hip", 3],
		],
	}),
	pose({
		name: "slowWalk", title: "The slow walk", trigger: "idle", rarity: 1, play: "once", habit: true,
		lines: ["Very busy. Carrying a paper."],
		frames: [
			["e-half l-right m-smirk hl-paper al-raise ar-low f-swingL", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-down f-swingR", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-low f-swingL", 3],
			["e-half l-right m-smirk hl-paper al-raise ar-down f-swingR", 3],
		],
	}),

	// Acted --------------------------------------------------------------------------------------
	pose({
		name: "waiting", title: "Waiting on you", trigger: "waiting", rarity: 1, play: "loop",
		lines: ["Whenever you are ready.", "No rush. Some rush."],
		frames: [
			["m-flat hr-sign ar-up al-hip", 3],
			["m-flat hr-sign ar-up al-hip f-tapR", 2],
			["m-flat hr-sign ar-up al-hip", 2],
			["m-flat hr-sign ar-up al-hip f-tapR", 2],
			["b-up m-small hr-sign ar-wave1 al-hip bd-leanR", 1],
			["b-up m-small hr-sign ar-wave2 al-hip bd-leanL", 1],
			["b-up m-small hr-sign ar-wave1 al-hip bd-leanR", 1],
			["b-up m-small hr-sign ar-wave2 al-hip bd-leanL", 1],
			["e-half l-right b-one m-pout hr-sign ar-up al-hip f-tapR", 4],
			["e-shine b-up c-blush m-grin hr-sign ar-cheer al-wave1 bd-hop", 6, "Whenever you are ready."],
		],
	}),
	pose({
		name: "waitingPlease", title: "Waiting, rare variant", trigger: "waiting", rarity: 1 / 20, play: "loop",
		lines: ["I will name a variable after you."],
		frames: [
			["e-tear b-worry m-wobble fr-pls al-hi ar-hi bd-low", 3],
			["e-tear b-worry m-small fr-pls al-hi ar-hi bd-leanL", 2],
			["e-tear b-worry m-wobble fr-pls al-hi ar-hi bd-leanR", 2],
			["e-tear b-worry m-small fr-pls al-hi ar-hi bd-leanL", 2],
			["e-shine b-worry c-blush m-small fr-pls al-hi ar-hi bd-stretch", 6, "I will name a variable after you."],
		],
	}),
	pose({
		name: "testFailed", title: "Failed test", trigger: "test-failed", rarity: 1, play: "once",
		lines: ["It passed on my machine.", "Again."],
		frames: [
			["e-wide b-up m-open hl-mag al-raise bd-stretch", 3],
			["e-wide b-worry m-wobble al-up ar-out bd-shakeL x-sweat1", 1],
			["e-wide b-worry m-wobble al-out ar-up bd-shakeR x-sweat2", 1],
			["e-wide b-worry m-wobble al-up ar-out bd-shakeL x-sweat1", 1],
			["e-wide b-worry m-wobble al-out ar-up bd-shakeR x-sweat2", 1],
			["e-wide b-worry m-wobble al-up ar-out bd-shakeL x-sweat1", 1],
			["e-wide b-worry m-wobble al-out ar-up bd-shakeR x-sweat2", 1],
			["e-tear b-worry m-wobble al-palm ar-low bd-low x-sweat1", 5, "It passed on my machine."],
			["b-angry m-flat al-hip ar-hip bd-puff", 5, "Again."],
		],
	}),
	pose({
		name: "prOpened", title: "PR opened", trigger: "pr-opened", rarity: 1, play: "once",
		lines: ["PR #219. Frame it.", "Ship it before it changes its mind."],
		frames: [
			["e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf1", 2],
			["e-shine b-up m-grin hr-trophy ar-up al-cheer f-runR bd-hop x-conf2", 2],
			["e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf3", 2],
			["e-happy m-shout hr-trophy ar-cheer al-cheer bd-hop x-conf1", 2],
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
				["at-s1 e-shine b-up m-open al-cheer ar-cheer bd-hop x-pop", 2],
				["at-s1 e-shine m-grin fr-box al-hold ar-hold bd-squash", 4],
				["at-s2 b-angry m-flat fr-box al-hold ar-hold f-runL bd-leanR", 1],
				["at-s2 b-angry m-flat fr-box al-hold ar-hold f-runR bd-hop", 1],
				["at-s3 b-angry m-flat fr-box al-hold ar-hold f-runL bd-leanR", 1],
				["at-s3 b-angry m-flat fr-box al-hold ar-hold f-runR bd-hop x-dust", 1],
				["at-s3 a-binoc m-small al-face ar-face f-wide", 5],
			],
		},
	}),
	pose({
		name: "asleep", title: "Asleep at the desk", trigger: "idle-long", rarity: 1, play: "once",
		lines: ["zzz", "I was resting my context."],
		frames: [
			["e-half m-small al-type1 ar-type2 fr-desk", 2],
			["e-closed m-yawn al-cheer ar-cheer bd-stretch fr-desk", 3],
			["e-closed m-small al-low ar-low bd-low fr-desk x-z1", 3],
			["e-closed m-drool al-low ar-low bd-nap fr-desk x-z2", 4],
			["e-closed m-drool al-low ar-low bd-nap fr-desk x-z3", 5],
			["e-wide b-up m-open al-out ar-out bd-stretch fr-desk x-pop", 2],
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
			["e-wide b-up m-open al-out ar-out bd-stretch", 2],
			["e-happy m-grin al-cheer ar-cheer bd-hop x-spark", 3],
			["e-happy m-shout al-cheer ar-cheer bd-hop x-conf1", 2, "Done. You're welcome."],
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
			["e-wide b-up m-open hl-clip al-out ar-out bd-stretch x-idea", 2],
			["e-star b-up m-grin hl-clip al-low ar-point bd-hop x-idea", 6, "What if we just deleted it."],
		],
	}),
	pose({
		name: "celebrate", title: "Celebrating with a teammate", trigger: "subagent-green", rarity: 1, play: "once",
		lines: ["Green. Nobody touch anything."],
		frames: [
			["e-wide l-right b-up m-open", 2],
			["e-shine m-grin al-cheer ar-cheer bd-hop x-conf1", 2],
			["e-happy l-right m-shout al-hip ar-five bd-leanR", 2],
			["e-happy l-right m-shout al-hip ar-five bd-leanR x-spark", 2],
			["e-happy m-grin hl-pom hr-pom al-wave1 ar-wave2 f-runL x-conf2", 1],
			["e-happy m-grin hl-pom hr-pom al-wave2 ar-wave1 f-runR bd-hop x-conf3", 1],
			["e-happy m-grin hl-pom hr-pom al-wave1 ar-wave2 f-runL x-conf1", 1],
			["e-happy m-grin hl-pom hr-pom al-wave2 ar-wave1 f-runR bd-hop x-conf2", 1],
			["e-half m-smirk al-hip ar-hip", 6, "Green. Nobody touch anything."],
		],
		partner: {
			role: "verifier",
			frames: [
				["at-s2 e-wide l-left b-up m-open hr-ok ar-up", 2],
				["at-s2 e-shine m-grin hr-ok ar-cheer al-cheer bd-hop", 2],
				["at-s2 e-happy l-left m-shout hr-ok ar-raise al-five bd-leanL", 2],
				["at-s2 e-happy l-left m-shout hr-ok ar-raise al-five bd-leanL", 2],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave2 ar-wave1 f-runR bd-hop", 1],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave1 ar-wave2 f-runL", 1],
				["at-s2 e-happy m-grin hl-pom hr-ok al-wave2 ar-wave1 f-runR bd-hop", 1],
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
			["e-half b-flat m-pout al-cross ar-cross2 x-clock4", 2],
			["e-half l-upR b-angry m-flat al-cross ar-cross2 f-tapR x-clock1", 3],
			["e-closed b-angry m-frown al-cross ar-cross2 bd-puff x-steam1", 2],
			["e-squint b-angry m-shout al-low ar-low bd-puff x-steam2", 2],
			["e-closed b-flat m-flat hr-mug ar-sip al-hip", 4],
			["e-half b-one m-pout hr-mug ar-raise al-hip", 6, "Forty minutes. I have aged."],
		],
	}),
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
