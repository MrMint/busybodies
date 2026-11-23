// The words the sass module shares between its parts: what sets a line off, who says it, and
// where a sign goes. Pixi-free, so it runs in unit tests and the text dump.
import { ROLES, type Role, roleFor } from "../rig/roles";

/** What sets a line off. Each one has its own detector in `detect.ts` (or `signs.ts`). */
export const TRIGGERS = [
	"waiting", // stopped until the person answers; escalates with the wait
	"testFailed", // a test run went red; tiers by fail streak
	"retry", // the same command again; tiers by repeats
	"apiRetry", // the API call is being retried after an error
	"longBuild", // one shell command running 20 min or more
	"busy", // busy for a long stretch: the frantic lines
	"prOpened", // a pull request went up
	"review", // a reviewer finished a pass
	"hiring", // an agent spawned another; tiers by depth
	"bigCrew", // a lot of agents spawned at once
	"stalled", // no output for 5 min while still busy
	"idle", // nothing to do; feet up, then asleep
	"woken", // back to work after a long idle
	"compacting", // the session squeezed its memory
	"crashed", // the API gave up, or the session vanished mid-work
	"finished", // the work is done and the session is still open
	"paused", // an agent was stopped or sent home
	"coffeeQueue", // three or more finished agents at once
	"reaction", // a bystander reacts to a teammate
	"chatter", // a big crew talking shop while it works
	"bill", // cost milestones, in coffee cups
	"lateNight", // still busy late at night, by the local clock
	"fridge", // the one note in the dock: whatever most needs a human
] as const;
export type TriggerKind = (typeof TRIGGERS)[number];

export type LineKind = "said" | "thought" | "sign";

/** The rig's seven costumes (src/scene/rig/roles.ts), plus "anyone" for a line any character can say and "room" for signs. */
export { ROLES, roleFor, type Role };
export type Speaker = Role | "anyone" | "room";

/**
 * Where a sign goes. The first five are the office's named slots, relative to the project's room
 * (`room:<project>:sign`, `room:<project>:board`) or shared (`meeting:*`, `kitchen:sign`). The
 * rest are props the wiring maps to whatever draws them (the fridge dock, the event ticker, the
 * desk note, the plant, the mug pile), or drops.
 */
export type SignPlace =
	| "sign"
	| "board"
	| "meeting:sign"
	| "meeting:board"
	| "kitchen:sign"
	| "fridge"
	| "ticker"
	| "desk"
	| "plant"
	| "mugs";

/** Values a line's `{placeholders}` can take. A line whose placeholder has no value isn't used. */
export interface LineVars {
	/** A session's title. */
	name?: string;
	/** Whole minutes of whatever the trigger measures. */
	min?: number;
	/** A count: PR number, PRs today, days since, cups. */
	n?: number;
	/** A tally: PRs today. */
	count?: number;
	/** A local clock time, "13:52". */
	time?: string;
	/** A second clock time, a minute after `time`. */
	time2?: string;
}

/** One thing worth a line, found by `detect`. */
export interface Trigger {
	kind: TriggerKind;
	/** The character who'd say it: a session id for a lead, an agent id for crew. */
	who: string;
	/** The session it belongs to (a lead's own id). */
	session: string;
	/** The project's name: picks the room for signs and the zoom rule for long lines. */
	project: string;
	role: Role;
	/** How far along it is, in the trigger's unit: minutes, a count, a depth, cups. */
	magnitude: number;
	/**
	 * Identity of the thing, so the scheduler can tell a new event from the same ongoing state:
	 * "waiting:s1:1700000000000" stays the same for the whole wait.
	 */
	key: string;
	/** A state that holds (a wait, a long build) rather than a one-off event (a PR opened). */
	ongoing: boolean;
	/** Narrows the lines: a line with a tag is only used for a trigger with the same tag. */
	tag?: string;
	/** How many of each costume the session's crew has, for lines that name one (`Line.needs`). */
	crew?: Partial<Record<Role, number>>;
	vars: LineVars;
}

/** A small, fast, seeded hash (FNV-1a) for deterministic choices. */
export function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** A number in [0, 1) from a string, the same every time. */
export const unit = (s: string): number => hash(s) / 0x1_0000_0000;
