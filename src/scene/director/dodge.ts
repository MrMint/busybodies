// Dodges: two walkers whose paths cross at about the same moment don't pass through each other; one
// sidesteps (plan-next stream C, wave 2). Decided by the director from both paths, so it is the same
// every time. Cheap: only walks that start this direction are checked, only against walkers in the
// same area, by sampling both paths over the time they share.
//
//   closest(a, b)        -> how near two walks come, and when
//   sidestep(walk, at, away, side) -> the walk with a short detour around the point it reaches at `at`
//   dodges(walkers, now) -> the new paths, by key, and who each one dodged
import { type Point, along, pathLength, progress } from "./paths";

export const DODGE = {
	/** Two walkers' feet nearer than this at the same moment would pass through each other. */
	near: 26,
	/** How far to the side the dodger steps. */
	side: 30,
	/** How much of its path the detour takes, centred where they'd meet. */
	span: 56,
	/** Sampling step along the shared time. */
	stepMs: 50,
} as const;

export interface TimedWalk {
	path: Point[];
	ms: number;
	since: number;
}

export interface Walker {
	key: string;
	area: string;
	walk: TimedWalk;
	/** May it change its path? Only walks starting now, whose timing nothing else depends on. */
	free: boolean;
}

/** The nearest two walks come while both are under way, and when (absolute ms). */
export function closest(a: TimedWalk, b: TimedWalk): { d: number; at: number } {
	const from = Math.max(a.since, b.since);
	const to = Math.min(a.since + a.ms, b.since + b.ms);
	let best = { d: Infinity, at: from };
	for (let t = from; t <= to; t += DODGE.stepMs) {
		const p = along(a.path, t - a.since, a.ms);
		const q = along(b.path, t - b.since, b.ms);
		const d = Math.hypot(p.x - q.x, p.y - q.y);
		if (d < best.d) best = { d, at: t };
	}
	return best;
}

/** The point `d` px along a path, and the direction of travel there. */
function pointAt(path: Point[], d: number): { p: Point; dir: Point; i: number } {
	let left = d;
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1]!;
		const b = path[i]!;
		const seg = Math.hypot(b.x - a.x, b.y - a.y);
		if (left <= seg || i === path.length - 1) {
			const t = seg > 0 ? Math.min(1, left / seg) : 0;
			return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: seg > 0 ? { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg } : { x: 1, y: 0 }, i };
		}
		left -= seg;
	}
	const last = path[path.length - 1]!;
	return { p: last, dir: { x: 1, y: 0 }, i: path.length - 1 };
}

/**
 * The walk with a detour: around the point it reaches at `at`, it steps `side` px off its line (over
 * `span` px of its path, the middle half of that fully aside), to the side away from `away` (or
 * toward it, with `flip`), then back. The walk keeps its speed, so it takes a little longer.
 * Undefined when the meeting point is too near either end to step aside.
 */
export function sidestep(w: TimedWalk, at: number, away: Point, side: number = DODGE.side, flip = false, span: number = DODGE.span): TimedWalk | undefined {
	const len = pathLength(w.path);
	// How far along it is then: walks ease in and out (paths.ts progress), so not a straight share.
	const d = progress(at - w.since, w.ms) * len;
	const half = span / 2;
	if (d < half || d > len - half) return undefined;
	const mid = pointAt(w.path, d);
	const n = { x: -mid.dir.y, y: mid.dir.x };
	const sign = (n.x * (mid.p.x - away.x) + n.y * (mid.p.y - away.y) >= 0 ? 1 : -1) * (flip ? -1 : 1);
	const a = pointAt(w.path, d - half);
	const b = pointAt(w.path, d + half);
	const aside = (k: number) => {
		const p = pointAt(w.path, d + k).p;
		return { x: Math.round(p.x + n.x * side * sign), y: Math.round(p.y + n.y * side * sign) };
	};
	const r = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) });
	const path = [...w.path.slice(0, a.i), r(a.p), aside(-half / 2), aside(half / 2), r(b.p), ...w.path.slice(b.i)];
	const ms = Math.round((w.ms * pathLength(path)) / Math.max(1, len));
	return { path, ms, since: w.since };
}

/** The detours tried, smallest first: [side, flip, span]. */
const TRIES: [number, boolean, number][] = [];
for (const span of [DODGE.span, DODGE.span * 2])
	for (const side of [DODGE.side, DODGE.side * 2]) for (const flip of [false, true]) TRIES.push([side, flip, span]);

/**
 * Who sidesteps whom. Each free walker, in key order, is checked against every other walker in its
 * area (with any path already changed this time); when they'd come within DODGE.near, it takes the
 * first detour that keeps them apart (smallest first: either side, then further, then longer), or
 * the best of them.
 */
export function dodges(walkers: Walker[]): Map<string, { walk: TimedWalk; from: string }> {
	const out = new Map<string, { walk: TimedWalk; from: string }>();
	const byArea = new Map<string, Walker[]>();
	for (const w of walkers) byArea.set(w.area, [...(byArea.get(w.area) ?? []), w]);
	for (const group of byArea.values()) {
		if (group.length < 2) continue;
		const walkOf = (w: Walker) => out.get(w.key)?.walk ?? w.walk;
		for (const me of [...group].filter((w) => w.free).sort((a, b) => (a.key < b.key ? -1 : 1))) {
			for (const other of group) {
				if (other.key === me.key) continue;
				const mine = walkOf(me);
				const theirs = walkOf(other);
				const meet = closest(mine, theirs);
				if (meet.d >= DODGE.near) continue;
				const q = along(theirs.path, meet.at - theirs.since, theirs.ms);
				let best: TimedWalk | undefined;
				let bestD = meet.d;
				for (const [side, flip, span] of TRIES) {
					const w = sidestep(mine, meet.at, q, side, flip, span);
					if (!w) continue;
					const d = closest(w, theirs).d;
					if (d > bestD) {
						best = w;
						bestD = d;
					}
					if (d >= DODGE.near) break;
				}
				if (best) out.set(me.key, { walk: best, from: other.key });
			}
		}
	}
	return out;
}
