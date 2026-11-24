// Walks over the office's floor plan, never through a wall. The office is a hallway with rooms on
// both sides: rooms above it are open along their hallway edge; rooms below it put their back wall
// on the hallway and are entered through that wall's door. A walk between two areas is: out of the
// first area (across its open edge, or through its door), along the middle of the hallway, and
// into the second the same way. A walk inside one area is a straight line. Pure data, no Pixi.
import type { Point } from "../contract";
import type { Area, Floor } from "./world";

export type { Point };

/** World pixels per second: an unhurried stroll, a crossing of a big office is capped at 9 s. */
const WALK_SPEED = 170;
/** Shortest and longest walk the director asks for. */
const MIN_WALK_MS = 600;
const MAX_WALK_MS = 9_000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where an area meets the hallway: a point on its floor just inside, and one in the hallway. */
function gate(floor: Floor, area: Area, near: number): [Point, Point] {
	const mid = floor.hallway.y + floor.hallway.h / 2;
	if (area.band === "top") {
		// Open along the hallway edge: cross it straight down from wherever the walker is.
		const x = clamp(near, area.rect.x + 30, area.rect.x + area.rect.w - 30);
		return [
			{ x, y: area.rect.y + area.rect.h - 22 },
			{ x, y: mid },
		];
	}
	const door = area.wall.find((w) => w.kind === "door");
	const x = door ? door.rect.x + door.rect.w / 2 : area.rect.x + area.rect.w / 2;
	return [
		{ x, y: area.floorY + 26 },
		{ x, y: mid },
	];
}

/** The points of a walk from `from` (in area `fromArea`) to `to` (in area `toArea`). */
export function pathBetween(floor: Floor, fromArea: string | undefined, from: Point, toArea: string | undefined, to: Point): Point[] {
	const a = floor.areas.find((x) => x.id === fromArea);
	const b = floor.areas.find((x) => x.id === toArea);
	if (!a || !b || a.id === b.id)
		return [
			{ x: from.x, y: from.y },
			{ x: to.x, y: to.y },
		];
	const [aIn, aHall] = gate(floor, a, from.x);
	const [bIn, bHall] = gate(floor, b, to.x);
	return dedupe([{ x: from.x, y: from.y }, aIn, aHall, bHall, bIn, { x: to.x, y: to.y }]);
}

function dedupe(points: Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) out.push({ x: Math.round(p.x), y: Math.round(p.y) });
	}
	return out;
}

export const pathLength = (points: Point[]): number => points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);

/** How long a walk along `points` takes, at `speed` times the stroll (a jog, a run: pace.ts). */
export const walkMs = (points: Point[], speed = 1): number =>
	Math.round(clamp((pathLength(points) / (WALK_SPEED * speed)) * 1000, MIN_WALK_MS / speed, MAX_WALK_MS / speed));

/**
 * How a walk spends its time (plan-alive stream B): a start, a stride and a stop, all inside the
 * walk's own `ms`, so anything timed on the arrival (a brick, a folder, an envelope) still holds.
 * For the first `lookMs` the feet stay put while the walker looks where it is going; then the
 * distance eases in over `inMs`, cruises, and eases out over `outMs`. A short walk shrinks each
 * part in proportion.
 */
export const GAIT = {
	lookMs: 200,
	/** The look never takes more than this share of a walk. */
	lookShare: 0.2,
	inMs: 150,
	outMs: 250,
	/** The eases take at most this share of the moving time between them. */
	easeShare: 0.8,
	/** How far before and after a corner the path bends round it, at most (px). */
	corner: 18,
} as const;

/** How long a walk of `total` ms stands still first, looking at where it is going. */
export const lookMs = (total: number): number => Math.max(0, Math.min(GAIT.lookMs, total * GAIT.lookShare));

/**
 * The share of the distance covered `ms` into a walk of `total` ms: 0 through the look, then a
 * trapezoid of speed (ease in, cruise, ease out) that reaches exactly 1 at `total`.
 */
export function progress(ms: number, total: number): number {
	if (total <= 0) return 1;
	const look = lookMs(total);
	const move = total - look;
	if (move <= 0) return ms >= total ? 1 : 0;
	const t = clamp(ms - look, 0, move);
	const k = Math.min(1, (move * GAIT.easeShare) / (GAIT.inMs + GAIT.outMs));
	const a = GAIT.inMs * k;
	const b = GAIT.outMs * k;
	// The cruising speed that covers the whole distance in `move` with both eases.
	const v = 1 / (move - (a + b) / 2);
	if (t < a) return (v * t * t) / (2 * a);
	if (t <= move - b) return v * (a / 2 + (t - a));
	const r = move - t;
	return clamp(1 - (v * r * r) / (2 * b), 0, 1);
}

type Dir = { x: number; y: number };

/** A quadratic curve round corner `c`, from `rr` px before it (coming in along `din`) to `rr` px
 * after it (going out along `dout`), at `s` in [0, 1]; and the direction of travel there. */
function bend(c: Point, rr: number, din: Dir, dout: Dir, s: number) {
	const p0 = { x: c.x - din.x * rr, y: c.y - din.y * rr };
	const p2 = { x: c.x + dout.x * rr, y: c.y + dout.y * rr };
	const q = 1 - s;
	const tx = 2 * q * (c.x - p0.x) + 2 * s * (p2.x - c.x);
	const ty = 2 * q * (c.y - p0.y) + 2 * s * (p2.y - c.y);
	const tl = Math.hypot(tx, ty) || 1;
	return { x: q * q * p0.x + 2 * q * s * c.x + s * s * p2.x, y: q * q * p0.y + 2 * q * s * c.y + s * s * p2.y, dx: tx / tl, dy: ty / tl };
}

/**
 * The point `d` px along a polyline, with each inner corner rounded by a curve over up to
 * GAIT.corner px either side of it (never more than half of either segment), and the unit
 * direction of travel there. The curve stays inside the triangle of the corner's two segments, so
 * it never cuts through a wall the straight path didn't.
 */
export function pointAt(points: Point[], d: number): { x: number; y: number; dx: number; dy: number } {
	const n = points.length;
	if (n === 0) return { x: 0, y: 0, dx: 0, dy: 0 };
	const segs: number[] = [];
	for (let i = 1; i < n; i++) segs.push(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
	const dir = (i: number): Dir => {
		const l = segs[i]!;
		return l > 0 ? { x: (points[i + 1]!.x - points[i]!.x) / l, y: (points[i + 1]!.y - points[i]!.y) / l } : { x: 0, y: 0 };
	};
	/** How much of the corner at points[i] is rounded off (none at the ends). */
	const round = (i: number) => (i <= 0 || i >= n - 1 ? 0 : Math.min(GAIT.corner, segs[i - 1]! / 2, segs[i]! / 2));
	let left = clamp(
		d,
		0,
		segs.reduce((x, y) => x + y, 0),
	);
	for (let i = 0; i < segs.length; i++) {
		const seg = segs[i]!;
		if (left <= seg || i === segs.length - 1) {
			const at = Math.min(left, seg);
			const u = dir(i);
			const rEnd = round(i + 1);
			const rStart = round(i);
			if (rEnd > 0 && at > seg - rEnd) return bend(points[i + 1]!, rEnd, u, dir(i + 1), (at - (seg - rEnd)) / (2 * rEnd));
			if (rStart > 0 && at < rStart) return bend(points[i]!, rStart, dir(i - 1), u, (rStart + at) / (2 * rStart));
			return { x: points[i]!.x + u.x * at, y: points[i]!.y + u.y * at, dx: u.x, dy: u.y };
		}
		left -= seg;
	}
	return { x: points[n - 1]!.x, y: points[n - 1]!.y, dx: 0, dy: 0 };
}

/** Where a walker is `ms` into a walk of `total` ms along `points` (eased, corners rounded), which
 * way it faces, and its direction of travel there. */
export function along(points: Point[], ms: number, total: number): { x: number; y: number; facing: 1 | -1; dx: number; dy: number } {
	if (points.length === 0) return { x: 0, y: 0, facing: 1, dx: 0, dy: 0 };
	const p = pointAt(points, progress(ms, total) * pathLength(points));
	return { ...p, facing: p.dx < 0 ? -1 : 1 };
}

/** Where a walk first heads: the direction of its first stretch that goes anywhere. */
export function heading(points: Point[]): Dir {
	for (let i = 1; i < points.length; i++) {
		const x = points[i]!.x - points[0]!.x;
		const y = points[i]!.y - points[0]!.y;
		const l = Math.hypot(x, y);
		if (l > 1) return { x: x / l, y: y / l };
	}
	return { x: 0, y: 0 };
}
