// Hand-offs and the outbox (plan-next stream C, wave 2): two errands that end in someone else's hands.
//
// A hand-off: a crew member coming back from the filing cabinet (or the card catalogue) passes its
// folder to a teammate whose work is about to send it to the same station, instead of both making the
// trip. The giver walks to the taker and plays `handOff`'s lead part; the taker, at its own spot,
// plays the partner part when the giver gets there; then the giver walks home, and the taker skips
// its trip for as long as that stretch of work lasts.
//
// The outbox: when a session opens a PR, its lead walks the envelope to the room's outbox
// (`envelopeCarry`), drops it in (`mailDrop`), walks back and celebrates.
import type { Slot } from "../office/world";
import { HANDOFF as RIG_HANDOFF, PUPPET_HEIGHT } from "../rig/reach";
import type { StationKind } from "./stations";

export const HANDOFF = {
	/** The stations whose errand is a folder that can be passed on. */
	kinds: ["reference", "search"] as StationKind[],
	pose: "handOff",
	/** The giver stands this far in front of the taker, facing it, in rig units: the rig's own
	 * staging (`HANDOFF.slot` in rig/reach.ts), so the taker's `at-s2` step leaves an arm's-length
	 * pass. About 150 px for a 58 px crew member. */
	gap: RIG_HANDOFF.slot,
} as const;

export const MAIL = {
	walkPose: "envelopeCarry",
	pose: "mailDrop",
} as const;

/** A hand-off under way, kept in the world by the giver's key. */
export interface HandOff {
	giver: string;
	taker: string;
	kind: StationKind;
	/** The giver sets off. */
	since: number;
	/** The giver gets there: the two-hander starts. */
	meets: number;
	/** Both parts are over: the giver walks home. */
	done: number;
	/** The giver's crew spot. */
	home: string;
}

/** A lead's walk to the outbox, kept in the world by session id. */
export interface Mail {
	key: string;
	station: string;
	pr: number;
	/** Sets off with the envelope. */
	since: number;
	/** The envelope is in: the walk back starts. */
	drops: number;
	/** The walk back starts (the first direction after `drops`). */
	returns?: number;
	/** Back at the desk: the celebration starts (set when the walk back starts). */
	back?: number;
	/** The teammate it celebrates with, if any. */
	mate?: string;
}

/** A teammate who might take the folder: its key, its session, the station kind its work wants
 * now (if any), and when that work started. */
export interface Taker {
	key: string;
	session: string;
	kind?: StationKind;
	since: number;
}

/** Who takes a giver's folder: the teammate whose work for that station started first. */
export function pickTaker(giver: { key: string; session: string; kind: StationKind }, takers: Taker[], taken: Set<string>): string | undefined {
	if (!HANDOFF.kinds.includes(giver.kind)) return undefined;
	return takers
		.filter((t) => t.key !== giver.key && t.session === giver.session && t.kind === giver.kind && !taken.has(t.key))
		.sort((a, b) => a.since - b.since || (a.key < b.key ? -1 : 1))[0]?.key;
}

/** Where the giver stands: in front of the taker, facing it. */
export function handOffSlot(taker: Slot, size: number): Slot {
	const gap = Math.round((HANDOFF.gap * size) / PUPPET_HEIGHT);
	const x = taker.x + taker.facing * gap;
	const y = taker.y + 2;
	return { x, y, depth: y, facing: taker.facing === 1 ? -1 : 1 };
}
