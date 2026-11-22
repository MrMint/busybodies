// The paper pass over a room, baked into its cached layer with the theme's drawing (so it is free
// per frame): floors as materials (carpet tiles, planks), a rug or a painted work zone under the
// desks, the walls' shadow on the floor from the phase's light, a hand-cut wobble on the shell's
// outline, the view out of each window, faint paper grain, and the room's name painted at its
// threshold in the hallway (a vinyl decal, or a stencil in the factory) instead of a floating tab.
import { Container, FillPattern, Graphics } from "pixi.js";
import { type Phase, SHADOW } from "./daylight";
import { drawOutlook, type SunSpot } from "./outlook";
import { INK, grainTexture, hash, noise, text, wobblyRect } from "./paper";
import type { SceneLight } from "../theme/types";
import type { Area, Rect } from "./world";

/** How far a room's name sits from its edge, into the hallway, and how much room it may take. */
export const DECAL = { gap: 9, pad: 22 } as const;

export interface Dressing {
	light: SceneLight;
	phase: Phase;
	/** The room's name as the theme says it. */
	name: string;
	sun?: SunSpot;
}

/** Everything the paper pass adds to a room, as children of its container `c`, after the theme's. */
export function dressRoom(c: Container, a: Area, d: Dressing): void {
	const { light, phase } = d;
	const seed = hash(a.id);
	const floor = { x: a.rect.x + 13, y: a.floorY, w: a.rect.w - 26, h: a.rect.y + a.rect.h - a.floorY - 3 };
	const g = new Graphics();
	c.addChild(g);

	// The floor's material.
	const mat = light.floors[a.kind] ?? "none";
	if (mat === "carpet") carpet(g, floor, seed);
	else if (mat === "planks") planks(g, floor, seed);

	// Under the desks: a rug, or a painted zone.
	if ((a.kind === "project" || a.kind === "vacant") && a.cells.length) {
		const xs = a.cells.map((r) => r.x);
		const ys = a.cells.map((r) => r.y);
		const r = { x: Math.min(...xs) + 10, y: Math.min(...ys) + 10, w: Math.max(...xs) - Math.min(...xs) + a.cells[0]!.w - 20, h: Math.max(...ys) - Math.min(...ys) + a.cells[0]!.h - 20 };
		if (light.cluster === "rug") rug(g, r, seed);
		else zone(g, r);
	}

	// The walls' shadow on the floor: the back wall's along its foot, a side wall's when the sun is
	// low on that side. Two stacked bands, like layers of paper.
	const s = SHADOW[phase];
	for (const k of [1, 2]) {
		g.rect(floor.x, floor.y, floor.w, Math.abs(s.y) * k + 2);
		if (s.x > 0) g.rect(floor.x, floor.y, s.x * k, floor.h);
		if (s.x < 0) g.rect(floor.x + floor.w + s.x * k, floor.y, -s.x * k, floor.h);
	}
	g.fill({ color: INK, alpha: 0.05 });

	// The views out.
	for (const w of a.wall) if (w.kind === "window") drawOutlook(g, w.rect, light, phase, d.sun);

	// A hand-cut edge on the shell: a wobbly line over the theme's straight one, so its weight varies.
	const pts = wobblyRect({ x: a.rect.x + 2.5, y: a.rect.y + 2.5, w: a.rect.w - 5, h: a.rect.h - 5 }, seed);
	g.poly(pts, true).stroke({ width: 2.2, color: INK, join: "round" });

	// Paper grain over all of it.
	const grain = new Graphics();
	grain.rect(a.rect.x, a.rect.y, a.rect.w, a.rect.h).fill(new FillPattern(grainTexture(), "repeat"));
	grain.alpha = 0.4;
	c.addChild(grain);

	c.addChild(decal(a, d));
}

/** Carpet tiles: a faint grid, every other tile a shade off. */
function carpet(g: Graphics, f: Rect, seed: number): void {
	const s = 48;
	for (let y = f.y + 12, j = 0; y < f.y + f.h; y += s, j++) {
		for (let x = f.x, i = 0; x < f.x + f.w; x += s, i++) {
			if ((i + j + seed) % 2) g.rect(x, y, Math.min(s, f.x + f.w - x), Math.min(s, f.y + f.h - y));
		}
	}
	g.fill({ color: INK, alpha: 0.03 });
	for (let x = f.x + s; x < f.x + f.w; x += s) g.rect(x, f.y + 12, 1, f.h - 12);
	for (let y = f.y + 12 + s; y < f.y + f.h; y += s) g.rect(f.x, y, f.w, 1);
	g.fill({ color: INK, alpha: 0.045 });
}

/** Planks: long boards across the room, their joints staggered. */
function planks(g: Graphics, f: Rect, seed: number): void {
	const h = 30;
	for (let y = f.y + 12, j = 0; y < f.y + f.h; y += h, j++) {
		g.rect(f.x, y, f.w, 1.5);
		// Long boards: a joint every 260 px or so, never lined up with the row before.
		const off = noise(seed % 997, j, 41) * 260;
		for (let x = f.x + off; x < f.x + f.w - 10; x += 260) g.rect(x, y, 1.5, Math.min(h, f.y + f.h - y));
	}
	g.fill({ color: INK, alpha: 0.055 });
}

/** A rug under the desks: a lighter sheet with a border, a little crooked. */
function rug(g: Graphics, r: Rect, seed: number): void {
	const pts = wobblyRect(r, seed + 3, 1.2, 60);
	g.poly(pts, true).fill({ color: 0xffffff, alpha: 0.2 }).stroke({ width: 2, color: INK, alpha: 0.14 });
	g.roundRect(r.x + 9, r.y + 9, r.w - 18, r.h - 18, 6).stroke({ width: 3, color: 0xffffff, alpha: 0.38 });
}

/** A work zone painted round the desks: a dashed safety line. */
function zone(g: Graphics, r: Rect): void {
	const dash = 18;
	const gap = 10;
	const run = (x0: number, y0: number, x1: number, y1: number) => {
		const len = Math.hypot(x1 - x0, y1 - y0);
		for (let t = 0; t < len; t += dash + gap) {
			const a = t / len;
			const b = Math.min(1, (t + dash) / len);
			g.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
		}
	};
	run(r.x, r.y, r.x + r.w, r.y);
	run(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
	run(r.x + r.w, r.y + r.h, r.x, r.y + r.h);
	run(r.x, r.y + r.h, r.x, r.y);
	g.stroke({ width: 4, color: 0xffc928, alpha: 0.85, cap: "butt" });
}

/**
 * The room's name, painted in the hallway at its threshold: under a room above the hallway, over
 * one below. The office's is a vinyl decal with a little arrow into the room; the factory's a
 * stencil, in capitals, on a patch of bare floor. It shrinks to fit the room's width.
 */
function decal(a: Area, d: Dressing): Container {
	const { size, colour, stencil } = d.light.decal;
	const words = stencil ? d.name.toUpperCase() : d.name;
	const t = text(words, size, { fontWeight: "800", fill: colour, letterSpacing: stencil ? 3 : 0.5 });
	const room = a.rect.w - DECAL.pad * 2 - (stencil ? 0 : size);
	if (t.width > room) t.scale.set(room / t.width);
	const above = a.band === "top";
	const y = above ? a.rect.y + a.rect.h + DECAL.gap : a.rect.y - DECAL.gap - t.height;
	const x = a.rect.x + DECAL.pad + (stencil ? 0 : size * 0.9);
	t.position.set(x, y);
	const g = new Graphics();
	if (stencil) {
		// Bare floor under the stencil, and its corner marks.
		g.rect(x - 8, y - 3, t.width + 16, t.height + 6).fill(0xd8d5ce);
		const c = 7;
		const b = { x: x - 8, y: y - 3, w: t.width + 16, h: t.height + 6 };
		g.moveTo(b.x, b.y + c).lineTo(b.x, b.y).lineTo(b.x + c, b.y);
		g.moveTo(b.x + b.w - c, b.y).lineTo(b.x + b.w, b.y).lineTo(b.x + b.w, b.y + c);
		g.moveTo(b.x + b.w, b.y + b.h - c).lineTo(b.x + b.w, b.y + b.h).lineTo(b.x + b.w - c, b.y + b.h);
		g.moveTo(b.x + c, b.y + b.h).lineTo(b.x, b.y + b.h).lineTo(b.x, b.y + b.h - c);
		g.stroke({ width: 2.5, color: colour, alpha: 0.7 });
		t.alpha = 0.82;
	} else {
		// A small arrow into the room, then the name.
		const ax = a.rect.x + DECAL.pad + size * 0.3;
		const ay = y + t.height / 2;
		const s = size * 0.3;
		g.poly(above ? [ax - s, ay + s * 0.5, ax + s, ay + s * 0.5, ax, ay - s * 0.9] : [ax - s, ay - s * 0.5, ax + s, ay - s * 0.5, ax, ay + s * 0.9]).fill({ color: colour, alpha: 0.75 });
		t.alpha = 0.78;
	}
	const c = new Container({ label: "decal" });
	c.addChild(g, t);
	return c;
}
