// Pace: how fast a character walks, and how often its crew runs bricks, from how hot the work is
// (plan-next stream C). Pure and deterministic: tool rates from the snapshot when the watcher
// sends them, else how recently the character wrote, and the director's own count of edits.
//
//   paceOf(rate, lastAt, now)    -> stroll | jog | run, and its speed (a multiple of WALK_SPEED)
//   editRate(times, now)         -> edits in the last minute, from a build's recent edit times
//   runCooldown(session, rate)   -> the wait between brick runs: 20-28 s calm, down to 40% flat out
import { unit } from "../rig/player";
import type { ToolRate } from "../../watcher/model";
import { WORK } from "./work";

export type PaceName = "stroll" | "jog" | "run";

export const PACE = {
	/** Walk speed, as a multiple of WALK_SPEED (170 px/s). */
	speed: { stroll: 1, jog: 1.3, run: 1.65 } as Record<PaceName, number>,
	/** Tool calls a minute for a jog, and for a run. */
	jogPerMin: 8,
	runPerMin: 20,
	/** A write this recent counts as hot: at least a jog (and a run, with a jog's rate). */
	hotMs: WORK.hotMs,
} as const;

export interface Pace {
	name: PaceName;
	speed: number;
}

/** Tool calls a minute, from a snapshot rate. */
export const perMinute = (rate: ToolRate | undefined): number | undefined =>
	rate && rate.windowMs > 0 ? (rate.calls * 60_000) / rate.windowMs : undefined;

/**
 * How fast a character walks. With a tool rate: 20 calls a minute (or 8 and a recent write) is a
 * run, 8 or a recent write is a jog. Without one, a write in the last 15 s is a jog.
 */
export function paceOf(rate: ToolRate | undefined, lastAt: number | undefined, now: number): Pace {
	const hot = lastAt !== undefined && now - lastAt < PACE.hotMs;
	const pm = perMinute(rate);
	let name: PaceName = hot ? "jog" : "stroll";
	if (pm !== undefined) {
		if (pm >= PACE.runPerMin || (pm >= PACE.jogPerMin && hot)) name = "run";
		else if (pm >= PACE.jogPerMin) name = "jog";
	}
	return { name, speed: PACE.speed[name] };
}

export const RUNS = {
	/** After a run sets off, the session's next waits at least this long... */
	everyMs: 20_000,
	/** ...plus up to this much more, a share picked from the session's id... */
	jitterMs: 8_000,
	/** ...shrinking once edits come faster than this a minute... */
	calmPerMin: 4,
	/** ...by this much per extra edit a minute... */
	perEdit: 0.03,
	/** ...to no less than this share. */
	floor: 0.4,
	/** Edits remembered for the rate. */
	windowMs: 60_000,
} as const;

/** Edits in the last minute. */
export const editRate = (times: number[] | undefined, now: number): number => (times ?? []).filter((t) => t > now - RUNS.windowMs && t <= now).length;

/** How long a session waits between brick runs: 20-28 s (the same for its id), less when edits pour in. */
export function runCooldown(session: string, perMin = 0): number {
	const base = RUNS.everyMs + Math.floor(unit(session, "run") * RUNS.jitterMs);
	const share = Math.max(RUNS.floor, 1 - Math.max(0, perMin - RUNS.calmPerMin) * RUNS.perEdit);
	return Math.round(base * share);
}
