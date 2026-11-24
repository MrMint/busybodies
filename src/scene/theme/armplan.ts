// The factory's robot arm, as plain motion (plan-next stream D; the owner's "giant robot arms that
// help"). One per project bay, riding a rail along the foot of the back wall. It acts only on real
// events: when a piece lands on a crew build it brings the piece over and sets it on; when a session
// opens a PR it lifts the PR's crate off the build onto the bay's loading dock. Each job is a short
// run of tweened moves (rig/motion.ts's easing, no GSAP), then it is still: it costs frames only
// while it moves. Pixi-free and deterministic, so tests can step it; theme/arm.ts draws it.
import { ease, lerp } from "../rig/motion";

export interface Point {
	x: number;
	y: number;
}

/** Where the arm is: its carriage on the rail, its wrist, how closed the gripper is, and whether it
 * holds something. */
export interface ArmPose {
	base: number;
	wrist: Point;
	/** 0 open, 1 closed. */
	grip: number;
	holding: boolean;
}

/** The arm's sizes and pace, in world px and ms. */
export const ARM = {
	/** The rail: this far above the floor's back edge (factory.ts draws it there). */
	rail: 6,
	/** The shoulder: this far above the rail, on the carriage. */
	shoulder: 12,
	/** The upper arm's length; the forearm telescopes to reach. */
	upper: 70,
	/** The resting carriage, in from the bay's left wall (over the station strip). */
	restX: 74,
	/** The resting wrist, from the shoulder: tucked in, just over the rail. */
	restWrist: { x: 38, y: 14 },
	/** The carried piece's middle, below the wrist. */
	hold: 10,
	/** How far above a spot the wrist comes in before it lowers. */
	above: 30,
	/** Lowering or lifting at a spot, and closing or opening the gripper. */
	dip: 200,
	/** A move along the bay: this long plus `perPx` per px travelled, at most `maxTravel`. */
	travel: 380,
	perPx: 0.9,
	maxTravel: 1100,
	/** Jobs that may wait while one runs; past that, a piece lands without the arm. */
	queue: 2,
} as const;

interface Key {
	at: number;
	pose: ArmPose;
}

export interface ArmJob {
	kind: "place" | "ship";
	keys: Key[];
	/** When, from the job's start, the piece leaves the gripper. */
	release: number;
	ms: number;
}

export class ArmPlan {
	/** Where the rail runs, and where the carriage parks. */
	readonly railY: number;
	readonly rest: ArmPose;
	#jobs: ArmJob[] = [];
	#t = 0;
	#pose: ArmPose;

	constructor(
		readonly left: number,
		floorY: number,
	) {
		this.railY = floorY - ARM.rail;
		const base = left + ARM.restX;
		this.rest = { base, wrist: { x: base + ARM.restWrist.x, y: this.shoulderY + ARM.restWrist.y }, grip: 0.4, holding: false };
		this.#pose = this.rest;
	}

	get shoulderY(): number {
		return this.railY - ARM.shoulder;
	}

	get pose(): ArmPose {
		return this.#pose;
	}

	/** True while it has a move to make. */
	get moving(): boolean {
		return this.#jobs.length > 0;
	}

	/** The job running now and the ones waiting, for the inspector and tests. */
	get jobs(): { kind: ArmJob["kind"]; t: number; ms: number }[] {
		return this.#jobs.map((j, i) => ({ kind: j.kind, t: i === 0 ? Math.round(this.#t) : 0, ms: j.ms }));
	}

	/** Bring a piece over and set it on at `at` (the piece's middle). Returns how long until it
	 * leaves the gripper, or undefined if the arm has too much on (the piece lands without it). */
	place(at: Point): number | undefined {
		return this.#add(this.#placeJob(at));
	}

	/** Lift the crate at `from` onto the dock at `to` (the crate's middle at each). */
	ship(from: Point, to: Point): number | undefined {
		return this.#add(this.#shipJob(from, to));
	}

	/** Back to the start of the job in hand (the inspector's freeze). */
	rewind(): void {
		this.#t = 0;
		this.#pose = this.#jobs[0] ? poseAt(this.#jobs[0], 0) : this.rest;
	}

	/** Move on `ms`. Returns true if the pose changed. */
	step(ms: number): boolean {
		if (!this.#jobs.length) return false;
		this.#t += ms;
		while (this.#jobs.length && this.#t >= this.#jobs[0]!.ms) {
			this.#t -= this.#jobs[0]!.ms;
			this.#jobs.shift();
		}
		if (!this.#jobs.length) this.#t = 0;
		this.#pose = this.#jobs[0] ? poseAt(this.#jobs[0], this.#t) : this.rest;
		return true;
	}

	#add(job: ArmJob): number | undefined {
		if (this.#jobs.length > ARM.queue) return undefined;
		// It starts once the jobs ahead are done: its release is that far off.
		const ahead = this.#jobs.reduce((ms, j) => ms + j.ms, 0) - this.#t;
		this.#jobs.push(job);
		if (this.#jobs.length === 1) this.#pose = poseAt(job, 0);
		return ahead + job.release;
	}

	#travel(from: number, to: number): number {
		return Math.min(ARM.maxTravel, ARM.travel + Math.abs(to - from) * ARM.perPx);
	}

	/** The carriage stands a little left of what it reaches for, so the arm leans in. */
	#baseFor(x: number): number {
		return x - 46;
	}

	#placeJob(at: Point): ArmJob {
		const r = this.rest;
		const wrist = { x: at.x, y: at.y - ARM.hold };
		const above = { x: wrist.x, y: wrist.y - ARM.above };
		const base = this.#baseFor(at.x);
		const go = this.#travel(r.base, base);
		const keys: Key[] = [];
		let t = 0;
		const key = (dt: number, pose: ArmPose) => keys.push({ at: (t += dt), pose });
		key(0, { ...r, grip: 1, holding: true });
		key(go, { base, wrist: above, grip: 1, holding: true });
		key(ARM.dip, { base, wrist, grip: 1, holding: true });
		const release = t;
		key(ARM.dip * 0.6, { base, wrist, grip: 0, holding: false });
		key(ARM.dip, { base, wrist: above, grip: 0, holding: false });
		key(go, r);
		return { kind: "place", keys, release, ms: t };
	}

	#shipJob(from: Point, to: Point): ArmJob {
		const r = this.rest;
		const w1 = { x: from.x, y: from.y - ARM.hold };
		const a1 = { x: w1.x, y: w1.y - ARM.above };
		const w2 = { x: to.x, y: to.y - ARM.hold };
		const a2 = { x: w2.x, y: w2.y - ARM.above };
		const b1 = this.#baseFor(from.x);
		const b2 = this.#baseFor(to.x);
		const keys: Key[] = [];
		let t = 0;
		const key = (dt: number, pose: ArmPose) => keys.push({ at: (t += dt), pose });
		key(0, r);
		key(this.#travel(r.base, b1), { base: b1, wrist: a1, grip: 0, holding: false });
		key(ARM.dip, { base: b1, wrist: w1, grip: 0, holding: false });
		key(ARM.dip * 0.6, { base: b1, wrist: w1, grip: 1, holding: true });
		key(ARM.dip, { base: b1, wrist: a1, grip: 1, holding: true });
		key(this.#travel(b1, b2), { base: b2, wrist: a2, grip: 1, holding: true });
		key(ARM.dip, { base: b2, wrist: w2, grip: 1, holding: true });
		const release = t;
		key(ARM.dip * 0.6, { base: b2, wrist: w2, grip: 0, holding: false });
		key(ARM.dip, { base: b2, wrist: a2, grip: 0, holding: false });
		key(this.#travel(b2, r.base), r);
		return { kind: "ship", keys, release, ms: t };
	}
}

/** A job's pose `t` ms in: eased between its keys. What it holds changes as it leaves a key: it lets go
 * the moment it is past the release. */
function poseAt(job: ArmJob, t: number): ArmPose {
	const keys = job.keys;
	if (t <= keys[0]!.at) return keys[0]!.pose;
	for (let i = 1; i < keys.length; i++) {
		const a = keys[i - 1]!;
		const b = keys[i]!;
		if (t <= b.at) {
			const u = ease.inOut(b.at > a.at ? (t - a.at) / (b.at - a.at) : 1);
			return {
				base: lerp(a.pose.base, b.pose.base, u),
				wrist: { x: lerp(a.pose.wrist.x, b.pose.wrist.x, u), y: lerp(a.pose.wrist.y, b.pose.wrist.y, u) },
				grip: lerp(a.pose.grip, b.pose.grip, u),
				holding: b.pose.holding,
			};
		}
	}
	return keys[keys.length - 1]!.pose;
}

/**
 * The arm's joints for a pose: the upper arm from the shoulder, its elbow bent up toward the wall,
 * and the forearm telescoping to the wrist (so a short arm can reach the far desks). Angles are in
 * radians from +x.
 */
export function solve(shoulder: Point, wrist: Point): { upper: number; elbow: Point; fore: number; length: number } {
	const dx = wrist.x - shoulder.x;
	const dy = wrist.y - shoulder.y;
	const d = Math.max(32, Math.hypot(dx, dy));
	const L1 = ARM.upper;
	// The forearm takes what the upper arm can't, so the elbow always has a bend to it.
	const L2 = Math.max(40, d - L1 * 0.5);
	const toWrist = Math.atan2(dy, dx);
	const cos = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
	// Bend the elbow to the side that keeps it up, toward the wall.
	const a1 = toWrist + (Math.cos(toWrist) >= 0 ? -1 : 1) * Math.acos(cos);
	const elbow = { x: shoulder.x + Math.cos(a1) * L1, y: shoulder.y + Math.sin(a1) * L1 };
	const fore = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
	return { upper: a1, elbow, fore, length: Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y) };
}
