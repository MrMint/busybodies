// Idle habits (plan-alive stream B). An idle character slacks off in one of the seven habits
// (rig/poses.ts HABITS), or in the theme's own (office/staging.ts `habits`: the factory's crew sit on
// oil drums, play cards on a pallet, kick the vending machine), picked from its id. With life on (the window on screen, not calm), the
// habit rotates every minute or two and plays again every 20 to 30 s, so a quiet office keeps a
// gentle rhythm: a burst, a rest, a burst. In calm mode it is what it always was: one habit, played
// once, moving on every ten minutes. Pure: the same key and clock give the same habit, and every
// change lands on a 5 s grid of the clock, so a room of idlers wakes the director together.
import { hash, unit } from "../rig/player";
import { HABITS } from "../rig/poses";
import { MIN } from "../../shared/time";


export const HABIT = {
	/** Calm mode: the next habit this often after going idle. */
	calmRotateMs: 10 * MIN,
	/** Life on: each character's habit lasts somewhere in this range (on the grid)... */
	turnMs: [60_000, 120_000],
	/** ...and plays again this often within it. */
	replayMs: [20_000, 30_000],
	/** Every change lands on this grid of the clock. */
	gridMs: 5_000,
} as const;

/** A length from `range`, picked from the id, rounded to the grid. */
const pickMs = (key: string, salt: string, [lo, hi]: readonly [number, number]) =>
	Math.round((lo + unit(key, salt) * (hi - lo)) / HABIT.gridMs) * HABIT.gridMs;

export interface Habit {
	pose: string;
	/** When this play of it started, with life on (a replay restarts it). Undefined in calm mode:
	 * the same habit carries on from when it began. */
	since?: number;
	/** When the habit next changes or plays again. */
	wake: number;
}

const RIG_HABITS = HABITS.map((h) => h.name);

/** The habit an idle character (idle since `since`) is in at `now`, from the theme's `set` of
 * habits (pose names; none or empty: the rig's seven). */
export function habitAt(key: string, since: number, now: number, life: boolean, set?: readonly string[]): Habit {
	const names = set?.length ? set : RIG_HABITS;
	const n = names.length;
	if (!life) {
		const turn = Math.max(0, Math.floor((now - since) / HABIT.calmRotateMs));
		return { pose: names[(hash(key) + turn) % n]!, wake: since + (turn + 1) * HABIT.calmRotateMs };
	}
	const turnMs = pickMs(key, "habit-turn", HABIT.turnMs);
	const replayMs = pickMs(key, "habit-replay", HABIT.replayMs);
	// Phases on the grid, from the id, so neighbours don't all change at once.
	const phase = (hash(`${key}|habit-phase`) % (turnMs / HABIT.gridMs)) * HABIT.gridMs;
	const turn = Math.floor((now + phase) / turnMs);
	const turnStart = turn * turnMs - phase;
	const replays = Math.floor((now - turnStart) / replayMs);
	const replayStart = turnStart + replays * replayMs;
	const next = Math.min(turnStart + turnMs, replayStart + replayMs);
	return { pose: names[(hash(key) + turn) % n]!, since: Math.max(since, replayStart), wake: next };
}
