// The contract between the director and the drawing: what the director hands the scene (who
// stands where, in what mood, doing what, and what each desk shows). Types only, so the director
// stays Pixi-free and drawing code never imports the director's implementation.
import type { Role } from "../shared/roles";
import type { LookAt } from "./rig/data/gaze";
import type { Plump } from "./rig/data/plump";

export type Mood = "busy" | "idle" | "stalled" | "done";

/** Who stands in a slot. Everything a character needs to choose its look and pose. */
export interface Who {
	/** Stable for the character's life: "s:<session id>" or "a:<session id>:<agent id>". */
	key: string;
	kind: "lead" | "crew";
	/** The agent's role ("scout", "reviewer", ...), or "lead". */
	role: string;
	/** The costume, when whoever placed it already chose one (rig/data/roles.ts `roleFor`). */
	look?: Role;
	mood: Mood;
	/** Height in world pixels. */
	size: number;
	/** A key to pick a colour from, so one project's leads match: the project, or the role. */
	tint: string;
	/** Optional: the regular it is (rig/data/roles.ts `regularOf`): the same face, accessory and name for
	 * the same project and role, every day. */
	regular?: string;
	/** How full its context is, worn as its body (rig/data/plump.ts). Absent: the plain mochi. */
	plump?: Plump;
	/** Weather over its head (director/weather.ts): rain on a red streak, sun when it goes green. */
	weather?: "rain" | "sun";
}

/** A point in world pixels. */
export interface Point {
	x: number;
	y: number;
}

/** A walk: the points to follow, how long it takes, and whether the walker leaves at the end. */
export interface Walk {
	path: Point[];
	ms: number;
	/** Fade out at the end: the character is leaving through the door. */
	exit?: boolean;
	/** How far into the walk it already is, in ms (a cue sent mid-walk). */
	elapsed?: number;
}

/**
 * What the director (S4) asks a character to do: a pose, and maybe a walk to get there first. A
 * character that understands cues implements `act`; one that doesn't just stands at its slot.
 */
export interface Cue {
	/** Changes whenever the character must start over: a new pose, or the same pose again. */
	key: string;
	pose: string;
	/** Which part of a two-hander. */
	as: "lead" | "partner";
	/** Passes before holding the last frame; Infinity loops. */
	loops: number;
	/** `end`: start already played through (a character found mid-habit). */
	at: "start" | "end";
	/** Where it stands, by name: `desk`, `crew:3`, `meeting:seat:0`, `kitchen:queue:1`, `door`. */
	spot: string;
	walk?: Walk;
	/** How fast the pose's frames run (1 is as written). Changing it alone doesn't restart the pose. */
	tempo?: number;
	/** The pose played while walking (default `walk`): `carry` takes a brick to the crew's build. */
	walkPose?: string;
	/** How fast the walk's steps run, matching its pace (a jog 1.3, a run 1.65; pace.ts). The walk's
	 * `ms` already covers the ground at that pace. */
	walkTempo?: number;
	/** What to look at while the pose plays (rig/data/gaze.ts): another character's key, a world point
	 * (the YOU door), or `{ viewer: true }`, out of the screen. The character turns it into a look
	 * against its own facing; a frame with eyes on the work wins. Changing it alone doesn't restart
	 * the pose. */
	lookAt?: LookAt;
}

/** The in-tray on the lead's desk. */
export interface Tray {
	/** Sheets on the pile: at least one while anything is in context. */
	sheets: number;
	/** Sheets slid off the pile onto the desk (0 below 80%). */
	spill: number;
	/** Past 95%: the lead is buried to the eyebrows. */
	buried: boolean;
	/** The lead has taken the pile to the shredder: the tray is empty until it's back. */
	out?: boolean;
	/** The lead is playing `buried`: the rig draws the tray and pile, so the office draws none. */
	rig?: boolean;
}

export type Lamp = "green" | "red";

export interface DeskProps {
	tray?: Tray;
	/** The model family, as a word for the name card's last line. */
	word?: string;
	drawers?: Drawers;
	/** The skip of removed lines: 0 (none) to 5. */
	skip: number;
	mugs: number;
	lamp?: Lamp;
	/** A milestone treat on the desk for a while (director/treats.ts). */
	treat?: Milestone;
	/** A cobweb on a desk idle for days (director/cobwebs.ts), and which corner it hangs in. */
	cobweb?: WebCorner;
}

/** What a desk's treat celebrates: the room's fifth or tenth PR today, or 1,000 lines changed. */
export type Milestone = "prs5" | "prs10" | "lines";

/** Where a desk's cobweb hangs: the screen's top left or top right corner, or the desk front's
 * bottom left corner. */
export type WebCorner = "screenL" | "screenR" | "desk";

/** One session's notes on its room's planner, by column. */
export interface PlannerRow {
	session: string;
	pending: number;
	active: number;
	done: number;
}

/** The filing drawers beside the desk. */
export interface Drawers {
	/** Drawers in the cabinet: one per ~10 files, at least one once a file is touched. */
	drawers: number;
	/** How many of them are full: those bulge open. */
	full: number;
}

/** A glyph the office paints on a "doing" chip (director/doing.ts). */
export type DoingIcon = "read" | "search" | "edit" | "run" | "test" | "web" | "hire" | "plan" | "ask" | "tool" | "idle" | "wait" | "done";

/** What a character is doing right now, for the closer camera stops: a glyph, a short verb, and
 * when the call in progress started. */
export interface Doing {
	icon: DoingIcon;
	/** "reading", "editing", "running tests". */
	word: string;
	/** When the call in progress started, if one is. */
	since?: number;
	/** The call has run long enough to say how long. */
	long: boolean;
}
