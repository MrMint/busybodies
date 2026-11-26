// Cobwebs on long-idle desks: a desk whose session has sat idle for days gathers a cobweb in a
// corner of its screen or desk. Pixi-free: the director says which corner (from the session's id,
// so it is always the same one), the office paints it static, in the style of the rig's own
// cobweb (rig/data/web.ts).
import type { Session } from "../../watcher/model";
import type { WebCorner } from "../contract";
import { fnv1a } from "../../shared/hash";
import { MIN } from "../../shared/time";

const CORNERS: readonly WebCorner[] = ["screenR", "screenL", "desk"];

const DAY = 24 * 60 * MIN;

export const COBWEB = {
	/** Days idle before a desk gathers a cobweb. */
	days: 2,
} as const;

/** The cobweb on a session's desk, if it has sat idle long enough (and isn't waiting on you). */
export function cobwebFor(s: Pick<Session, "id" | "state" | "stateSince" | "waiting">, now: number): WebCorner | undefined {
	if (s.state !== "idle" || s.waiting) return undefined;
	if (now - s.stateSince < COBWEB.days * DAY) return undefined;
	return CORNERS[fnv1a(s.id) % CORNERS.length];
}

/** When a desk idle since `since` gathers its cobweb. */
export const cobwebAt = (since: number): number => since + COBWEB.days * DAY;
