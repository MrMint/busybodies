// Outside the bakery: the patio, its lolly pots, the bistro tables and the chalkboard. Split
// out of scene.ts.
import type { Graphics } from "pixi.js";
import { INK, SHADOW, hash, line } from "../../scene/office/paper";
import type { Band, Rect } from "../../scene/world/world";
import { mix } from "../../shared/colour";
import { CANDY, CHALK, CHERRY, MARBLE, RASPBERRY, WOOD, WOOD_DARK } from "./palette";
import { cup, cupcake, lollipop } from "./pastries";
import { thin } from "./scene";
import { scallops } from "./room";

// --- The café terrace -------------------------------------------------------------------------

/** A gap in the footprint as the café's terrace: pale pink and cream tiles, bistro tables under
 * striped umbrellas, a chalkboard A-frame, striped pots of giant lollipops in the corners; whatever
 * its size, with as much as fits. Drawn in world coordinates, baked. */
export function patio(g: Graphics, r: Rect, _band: Band): void {
	const p = { x: r.x + 7, y: r.y + 7, w: r.w - 14, h: r.h - 14 };
	if (p.w < 18 || p.h < 18) return;
	g.roundRect(p.x, p.y, p.w, p.h, 8).fill(0xfff6ee);
	const s = 24;
	for (let j = 0, y = p.y; y < p.y + p.h - 2; y += s, j++)
		for (let i = 0, x = p.x; x < p.x + p.w - 2; x += s, i++)
			if ((i + j) % 2 === 0) g.rect(x + 1, y + 1, Math.min(s, p.x + p.w - x) - 2, Math.min(s, p.y + p.h - y) - 2);
	g.fill(0xfde3e6);
	g.roundRect(p.x, p.y, p.w, p.h, 8).stroke({ width: 3, color: INK, alpha: 0.45 });
	// From the place's position, so the same every load. A hash, never the coordinates themselves:
	// the top band's gaps sit above the hallway at negative y, and a negative seed picks no colour.
	const seed = hash(`patio:${r.x},${r.y}`);
	// What stands on it, back to front.
	const things: [number, () => void][] = [];
	const corner = p.w >= 48 && p.h >= 64;
	const big = p.w >= 150 && p.h >= 150;
	if (corner) {
		things.push([p.y + 50, () => lollyPot(g, p.x + 22, p.y + 50, seed)]);
		things.push([p.y + p.h - 8, () => lollyPot(g, p.x + p.w - 22, p.y + p.h - 8, seed + 1)]);
	}
	if (big) {
		things.push([p.y + 50, () => lollyPot(g, p.x + p.w - 22, p.y + 50, seed + 2)]);
		things.push([p.y + p.h - 8, () => chalkboard(g, p.x + 30, p.y + p.h - 8, seed)]);
	}
	// The tables, in a grid between the corners, each under its umbrella.
	const x0 = p.x + 52;
	const x1 = p.x + p.w - 52;
	const y0 = p.y + 104;
	const y1 = p.y + p.h - 26;
	const cols = Math.floor((x1 - x0) / 110) + 1;
	const rows = Math.floor((y1 - y0) / 130) + 1;
	if (x1 >= x0 && y1 >= y0) {
		for (let j = 0; j < rows; j++) {
			for (let i = 0; i < cols; i++) {
				const tx = cols > 1 ? x0 + ((x1 - x0) * i) / (cols - 1) : (x0 + x1) / 2;
				const ty = rows > 1 ? y0 + ((y1 - y0) * j) / (rows - 1) : (y0 + y1) / 2;
				const k = seed + i + j * 3;
				things.push([ty, () => bistro(g, tx + ((j % 2) * 18 - 9), ty, k)]);
			}
		}
	} else if (!corner) things.push([p.y + p.h - 6, () => lollyPot(g, p.x + p.w / 2, p.y + p.h - 6, seed)]);
	for (const [, draw] of things.sort((a, b) => a[0] - b[0])) draw();
}

/** A striped pot of three giant swirl lollipops at different heights, its base's centre at (x, y). */
function lollyPot(g: Graphics, x: number, y: number, k: number): void {
	g.ellipse(x + 3, y + 1, 17, 4.6).fill(SHADOW);
	const sticks: [number, number, number][] = [
		[-8, 40, 9],
		[7, 50, 10.5],
		[0, 30, 8],
	];
	sticks.forEach(([dx, hgt, rr], i) => lollipop(g, x + dx, y - 16 - hgt, rr, hgt, CANDY[(k + i) % CANDY.length]!, 0xffffff));
	g.poly([x - 15, y - 20, x + 15, y - 20, x + 11, y, x - 11, y])
		.fill(0xffffff)
		.stroke(thin(2.2));
	for (const dx of [-8, 0, 8])
		g.poly([x + dx - 2.4, y - 20, x + dx + 2.4, y - 20, x + dx * 0.73 + 1.8, y, x + dx * 0.73 - 1.8, y]).fill(CANDY[(k + 3) % CANDY.length]!);
	g.poly([x - 15, y - 20, x + 15, y - 20, x + 11, y, x - 11, y]).stroke(thin(2.2));
	g.roundRect(x - 16.5, y - 23, 33, 5, 2.4)
		.fill(0xffffff)
		.stroke(thin(1.8));
	// Sprinkles in the soil, for show.
	for (let i = 0; i < 5; i++) g.rect(x - 10 + i * 5, y - 22 + (i % 2), 2.6, 1.1).fill(CANDY[(k + i) % CANDY.length]!);
}

/** A round marble bistro table under a striped umbrella, a bent-wire chair either side, a cup and a
 * cake on it; its foot's centre at (x, y). */
function bistro(g: Graphics, x: number, y: number, k: number): void {
	const shade = CANDY[k % CANDY.length]!;
	g.ellipse(x + 5, y + 2, 38, 7).fill(SHADOW);
	for (const side of [-1, 1]) {
		const cx = x + side * 27;
		// The chair: a heart-shaped wire back over a round seat, thin legs.
		g.moveTo(cx, y - 24)
			.bezierCurveTo(cx - 14, y - 32, cx - 9, y - 46, cx, y - 38)
			.bezierCurveTo(cx + 9, y - 46, cx + 14, y - 32, cx, y - 24)
			.stroke({ width: 2.4, color: INK, join: "round" });
		g.moveTo(cx, y - 24)
			.bezierCurveTo(cx - 14, y - 32, cx - 9, y - 46, cx, y - 38)
			.bezierCurveTo(cx + 9, y - 46, cx + 14, y - 32, cx, y - 24)
			.stroke({ width: 1, color: 0xffffff, join: "round" });
		g.rect(cx - 7, y - 18, 2.4, 18)
			.rect(cx + 4.6, y - 18, 2.4, 18)
			.fill(INK);
		g.ellipse(cx, y - 19, 10, 3.6)
			.fill(mix(shade, 0xffffff, 0.3))
			.stroke(thin(1.8));
	}
	// The umbrella's pole, the table's foot and its marble top.
	g.rect(x - 1.5, y - 92, 3, 92).fill(INK);
	g.roundRect(x - 9, y - 3, 18, 4, 2).fill(INK);
	g.ellipse(x, y - 30, 19, 5)
		.fill(MARBLE)
		.stroke(thin(2.2));
	cup(g, x - 8, y - 32, 0.55);
	cupcake(g, x + 7, y - 31, 0.5, CANDY[(k + 2) % CANDY.length]!, CANDY[(k + 4) % CANDY.length]!);
	// The umbrella: white and its colour in panels, a scalloped valance, a cherry on the finial.
	const top = y - 112;
	const base = y - 84;
	g.moveTo(x - 44, base)
		.quadraticCurveTo(x - 30, top + 2, x, top)
		.quadraticCurveTo(x + 30, top + 2, x + 44, base)
		.closePath()
		.fill(0xffffff);
	for (const [a, b] of [
		[-44, -26],
		[-9, 9],
		[26, 44],
	] as const) {
		g.moveTo(x + a, base)
			.lineTo(x + a * 0.08, top + 1)
			.lineTo(x + b * 0.08, top + 1)
			.lineTo(x + b, base)
			.closePath()
			.fill(shade);
	}
	scallops(g, x - 44, x + 44, base, 4.9, [shade, 0xffffff], 1.4);
	g.moveTo(x - 44, base)
		.quadraticCurveTo(x - 30, top + 2, x, top)
		.quadraticCurveTo(x + 30, top + 2, x + 44, base)
		.closePath()
		.stroke(line(2.5));
	g.circle(x, top - 3, 3.4)
		.fill(CHERRY)
		.stroke(thin(1.4));
}

/** A chalkboard A-frame of the day's specials: chalk lines, a cupcake drawn in chalk, a heart; its
 * feet's centre at (x, y). */
function chalkboard(g: Graphics, x: number, y: number, k: number): void {
	g.ellipse(x + 3, y + 1, 18, 4).fill(SHADOW);
	g.moveTo(x - 15, y)
		.lineTo(x - 11, y - 48)
		.moveTo(x + 15, y)
		.lineTo(x + 11, y - 48)
		.stroke({ width: 4, color: WOOD_DARK, cap: "round" });
	g.roundRect(x - 14, y - 50, 28, 38, 3)
		.fill(WOOD)
		.stroke(thin(2));
	g.roundRect(x - 11, y - 47, 22, 32, 2).fill(CHALK);
	const chalk = { width: 1.2, color: 0xffffff, alpha: 0.85, cap: "round" as const };
	g.moveTo(x - 7, y - 42)
		.lineTo(x + 7, y - 42)
		.moveTo(x - 7, y - 37)
		.lineTo(x + 3, y - 37)
		.stroke(chalk);
	g.moveTo(x - 5, y - 21)
		.lineTo(x - 4, y - 27)
		.lineTo(x + 4, y - 27)
		.lineTo(x + 5, y - 21)
		.closePath()
		.stroke({ ...chalk, color: CANDY[k % CANDY.length]! });
	g.moveTo(x - 5, y - 27)
		.quadraticCurveTo(x, y - 36, x + 5, y - 27)
		.stroke({ ...chalk, color: 0xffd3e4 });
	g.circle(x + 7, y - 24, 1.2)
		.circle(x + 9, y - 24, 1.2)
		.fill({ color: RASPBERRY, alpha: 0.9 });
}
