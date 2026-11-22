// Walks over the office's floor plan, never through a wall. The office is a hallway with rooms on
// both sides: rooms above it are open along their hallway edge; rooms below it put their back wall
// on the hallway and are entered through that wall's door. A walk between two areas is: out of the
// first area (across its open edge, or through its door), along the middle of the hallway, and
// into the second the same way. A walk inside one area is a straight line. Pure data, no Pixi.
import type { Point } from "../office/slot";
import type { Area, Slot, World as Floor } from "../office/world";

export type { Point };

/** World pixels per second: an unhurried stroll, a crossing of a big office is capped at 9 s. */
export const WALK_SPEED = 170;
/** Shortest and longest walk the director asks for. */
export const MIN_WALK_MS = 600;
export const MAX_WALK_MS = 9_000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where an area meets the hallway: a point on its floor just inside, and one in the hallway. */
function gate(floor: Floor, area: Area, near: number): [Point, Point] {
	const mid = floor.hallway.y + floor.hallway.h / 2;
	if (area.band === "top") {
		// Open along the hallway edge: cross it straight down from wherever the walker is.
		const x = clamp(near, area.rect.x + 30, area.rect.x + area.rect.w - 30);
		return [{ x, y: area.rect.y + area.rect.h - 22 }, { x, y: mid }];
	}
	const door = area.wall.find((w) => w.kind === "door");
	const x = door ? door.rect.x + door.rect.w / 2 : area.rect.x + area.rect.w / 2;
	return [{ x, y: area.floorY + 26 }, { x, y: mid }];
}

/** The points of a walk from `from` (in area `fromArea`) to `to` (in area `toArea`). */
export function pathBetween(floor: Floor, fromArea: string | undefined, from: Point, toArea: string | undefined, to: Point): Point[] {
	const a = floor.areas.find((x) => x.id === fromArea);
	const b = floor.areas.find((x) => x.id === toArea);
	if (!a || !b || a.id === b.id) return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
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

/** Where a walker is `ms` into a walk of `total` ms along `points`, and which way it faces. */
export function along(points: Point[], ms: number, total: number): { x: number; y: number; facing: 1 | -1 } {
	if (points.length === 0) return { x: 0, y: 0, facing: 1 };
	const len = pathLength(points);
	let d = total <= 0 ? len : clamp(ms / total, 0, 1) * len;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1]!;
		const b = points[i]!;
		const seg = Math.hypot(b.x - a.x, b.y - a.y);
		if (d <= seg || i === points.length - 1) {
			const t = seg > 0 ? Math.min(1, d / seg) : 1;
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, facing: b.x < a.x ? -1 : 1 };
		}
		d -= seg;
	}
	const last = points[points.length - 1]!;
	return { x: last.x, y: last.y, facing: 1 };
}

/** A slot to stand in at a point: depth follows the feet, as everywhere in the office. */
export const slotAt = (p: Point, facing: 1 | -1 = 1): Slot => ({ x: p.x, y: p.y, depth: p.y, facing });
