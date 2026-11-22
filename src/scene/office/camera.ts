// The camera: fixed stops (the whole office, a room, a desk) and a smooth move between them. Pure
// math on a {scale, x, y} view, so the office can drive it from the ticker and tests can check it.
import type { Rect, World } from "./world";

export type Stop = { kind: "office" } | { kind: "room"; id: string } | { kind: "desk"; id: string };

/** Screen = world * scale + (x, y). */
export interface View {
	scale: number;
	x: number;
	y: number;
}

/** The part of the screen the world may use: everything below the top bar. */
export interface Viewport {
	x: number;
	y: number;
	w: number;
	h: number;
}

export const MOVE_MS = 650;
const MAX_SCALE = { office: 1.15, room: 2.4, desk: 4 } as const;

export function fit(r: Rect, vp: Viewport, maxScale: number, pad = 16): View {
	const scale = Math.min((vp.w - pad * 2) / r.w, (vp.h - pad * 2) / r.h, maxScale);
	return { scale, x: vp.x + vp.w / 2 - scale * (r.x + r.w / 2), y: vp.y + vp.h / 2 - scale * (r.y + r.h / 2) };
}

/** The world rectangle a stop frames, or undefined if its room or desk is gone. */
export function frame(world: World, stop: Stop): Rect | undefined {
	if (stop.kind === "office") {
		const b = world.bounds;
		return { x: b.x - 20, y: b.y - 50, w: b.w + 40, h: b.h + 70 };
	}
	if (stop.kind === "room") {
		const a = world.areas.find((r) => r.id === stop.id);
		// Leave room above for the name tab.
		return a && { x: a.rect.x - 10, y: a.rect.y - 50, w: a.rect.w + 20, h: a.rect.h + 60 };
	}
	const d = world.desks.get(stop.id);
	return d && { x: d.cell.x - 50, y: d.cell.y - 60, w: d.cell.w + 100, h: d.cell.h + 90 };
}

export function viewFor(world: World, stop: Stop, vp: Viewport): View | undefined {
	const r = frame(world, stop);
	return r && fit(r, vp, MAX_SCALE[stop.kind]);
}

/** Ease in and out, with no overshoot: the camera should feel steady. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Moves between views. The scale is interpolated in log space and the point under the screen's
 * centre follows, so a zoom feels even rather than lurching at the end.
 */
export class CameraMove {
	#from: View;
	#to: View;
	#t = 0;
	constructor(from: View, to: View, readonly ms = MOVE_MS) {
		this.#from = { ...from };
		this.#to = { ...to };
	}
	get done(): boolean {
		return this.#t >= 1;
	}
	get target(): View {
		return this.#to;
	}
	/** Advance by `ms` and return the view now. */
	step(ms: number, centre: { x: number; y: number }): View {
		this.#t = Math.min(1, this.#t + ms / this.ms);
		const k = ease(this.#t);
		const a = this.#from;
		const b = this.#to;
		const scale = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * k);
		// The world point at the screen centre, interpolated, then placed back at the centre.
		const wa = { x: (centre.x - a.x) / a.scale, y: (centre.y - a.y) / a.scale };
		const wb = { x: (centre.x - b.x) / b.scale, y: (centre.y - b.y) / b.scale };
		const wx = wa.x + (wb.x - wa.x) * k;
		const wy = wa.y + (wb.y - wa.y) * k;
		return { scale, x: centre.x - wx * scale, y: centre.y - wy * scale };
	}
}
