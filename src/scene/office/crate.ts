// A PR crate's ride (the factory's conveyor hall, office/staging.ts): the bay's robot arm lifts the
// crate off the crew build and sets it down on the bay's loading dock (theme/armplan.ts `ship`). The
// moment it lets go, this crate takes over just where it was set down: it sits a beat, drops down the
// dock's chute, pops up on the hallway's belt in line with the dock and rides the belt to the dock at
// the hallway's end. (The bay's dock is a room's depth from the hallway, through a wall, so it goes
// by chute rather than sliding across the room.) Pixi-free, so tests can walk it; ambient.ts draws
// it. Times are acting ms from when the PR was seen.
import { ease, lerp } from "../rig/motion";

export const CRATE = {
	/** No arm to say when (it had too much on): the crate shows up on the belt after this long. */
	delay: 2200,
	/** It sits where it was set down this long, drops into the chute over `drop`, and pops up on the
	 * belt over `pop`. */
	hold: 450,
	drop: 260,
	pop: 280,
	/** Its ride along the belt (px/s). */
	speed: 240,
	/** The whole ride at most this long, and faded out over the last of it at the dock. */
	maxMs: 8000,
	fade: 300,
	/** The arm carries it small (theme/arm.ts: 12 by 9, its middle in the gripper): it is set down
	 * at this scale, its base this far below the middle, and pops up on the belt at the belt's size. */
	armScale: 0.5,
	armHalf: 4.5,
} as const;

export interface Point {
	x: number;
	y: number;
}

/** A crate's ride: where it is set down (its base), the belt's top, and the dock's x. */
export interface CrateRide {
	from: Point;
	/** The hallway belt's surface (a crate's base rides on it). */
	beltY: number;
	dock: number;
	/** When it is set down: until then it is in the arm's gripper and this one doesn't show. */
	delay: number;
	/** From being set down to gone at the dock. */
	ms: number;
	/** Its size where it is set down (the arm's crate is smaller than the belt's). */
	scale: number;
	/** Set down by the arm (it sits and drops down the chute), or put straight on the belt. */
	chute: boolean;
}

const lead = (r: Pick<CrateRide, "chute">) => (r.chute ? CRATE.hold + CRATE.drop + CRATE.pop : CRATE.pop);

/** A crate set down by the arm at `from` (its base) on its way to the `dock`, `delay` ms from now
 * (the arm's release). Without an arm (`delay` undefined), it pops up on the belt at `from.x` after
 * CRATE.delay. */
export function crateRide(from: Point, beltY: number, dock: number, delay?: number): CrateRide {
	const chute = delay !== undefined;
	const ride = (Math.max(0, dock - from.x) / CRATE.speed) * 1000;
	return { from, beltY, dock, delay: delay ?? CRATE.delay, ms: Math.min(CRATE.maxMs, lead({ chute }) + ride), scale: chute ? CRATE.armScale : 1, chute };
}

/** Where the crate is (its base) `t` ms after the PR was seen. */
export function crateAt(r: CrateRide, t: number): { x: number; y: number; scale: number; visible: boolean; alpha: number } {
	const u = t - r.delay;
	const out = Math.max(0, Math.min(1, (r.ms - u) / CRATE.fade));
	if (u < 0) return { x: r.from.x, y: r.from.y, scale: r.scale, visible: false, alpha: 1 };
	if (r.chute && u < CRATE.hold) return { x: r.from.x, y: r.from.y, scale: r.scale, visible: true, alpha: 1 };
	if (r.chute && u < CRATE.hold + CRATE.drop) {
		// Down the chute: it sinks into the dock and is gone.
		const k = ease.inOut((u - CRATE.hold) / CRATE.drop);
		return { x: r.from.x, y: r.from.y + 6 * k, scale: r.scale * (1 - 0.3 * k), visible: true, alpha: 1 - k };
	}
	const popAt = r.chute ? CRATE.hold + CRATE.drop : 0;
	if (u < popAt + CRATE.pop) {
		// Up on the belt, in line with the dock: it grows to the belt's size as it comes.
		const k = ease.out((u - popAt) / CRATE.pop);
		return { x: r.from.x, y: r.beltY, scale: lerp(Math.min(r.scale, 0.7), 1, k), visible: true, alpha: Math.min(k, out) };
	}
	const k = Math.min(1, (u - popAt - CRATE.pop) / Math.max(1, r.ms - popAt - CRATE.pop));
	return { x: lerp(r.from.x, r.dock, k), y: r.beltY, scale: 1, visible: true, alpha: out };
}
