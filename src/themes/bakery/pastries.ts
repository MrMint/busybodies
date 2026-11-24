// The bakery's pastry library: croissants to layer cakes, each drawn at a point and a size, used
// on the counters, in the windows and on the belt. Split out of scene.ts.
import type { Graphics } from "pixi.js";
import { INK } from "../../scene/office/paper";
import { CANDY, CHERRY, CHOC, CHOC_DARK, CRUST, CRUST_DARK, CRUST_LIGHT, DOUGH, IVORY, MINT, PINK } from "./palette";
import { thin } from "./scene";

/** An ellipse as a polygon, turned by `a`: for things lying at an angle (baguettes, horns). */
export function oval(cx: number, cy: number, rx: number, ry: number, a = 0, n = 18): number[] {
	const pts: number[] = [];
	const c = Math.cos(a);
	const s = Math.sin(a);
	for (let k = 0; k < n; k++) {
		const t = (k / n) * Math.PI * 2;
		const x = Math.cos(t) * rx;
		const y = Math.sin(t) * ry;
		pts.push(cx + x * c - y * s, cy + x * s + y * c);
	}
	return pts;
}

// --- Baked goods: small painters, each with its base centre at (x, y), `s` its scale ------------

export function croissant(g: Graphics, x: number, y: number, s = 1): void {
	const lw = Math.max(0.8, 1.2 * s);
	const seg = (dx: number, dy: number, rx: number, ry: number, a: number, col: number) =>
		g
			.poly(oval(x + dx * s, y + dy * s, rx * s, ry * s, a))
			.fill(col)
			.stroke(thin(lw));
	seg(-9, -2.6, 3, 2, 0.6, CRUST_DARK);
	seg(9, -2.6, 3, 2, -0.6, CRUST_DARK);
	seg(-5.6, -4, 4.2, 3.6, 0.35, CRUST);
	seg(5.6, -4, 4.2, 3.6, -0.35, CRUST);
	seg(0, -5, 4.8, 4.6, 0, CRUST_LIGHT);
	g.moveTo(x - 2 * s, y - 8 * s)
		.quadraticCurveTo(x, y - 7 * s, x + 2 * s, y - 8 * s)
		.stroke({ width: lw * 0.8, color: 0xffffff, alpha: 0.7 });
}

export function donut(g: Graphics, x: number, y: number, s = 1, icing = PINK, seed = 0): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.ellipse(x, y - 4 * s, 8 * s, 4.4 * s)
		.fill(DOUGH)
		.stroke(thin(lw));
	g.ellipse(x, y - 4.8 * s, 6.8 * s, 3.4 * s).fill(icing);
	g.ellipse(x, y - 4.8 * s, 2.2 * s, 1.1 * s)
		.fill(CRUST_DARK)
		.stroke(thin(lw * 0.8));
	for (let k = 0; k < 6; k++) {
		const a = (k / 6) * Math.PI * 2 + seed;
		const px = x + Math.cos(a) * 4.6 * s;
		const py = y - 4.8 * s + Math.sin(a) * 2.2 * s;
		g.rect(px - 0.9 * s, py - 0.4 * s, 1.8 * s, 0.9 * s).fill(CANDY[(k + seed) % CANDY.length] === icing ? 0xffffff : CANDY[(k + seed) % CANDY.length]!);
	}
}

export function macaron(g: Graphics, x: number, y: number, s = 1, shell = PINK): void {
	const lw = Math.max(0.8, 1.1 * s);
	g.roundRect(x - 6 * s, y - 4 * s, 12 * s, 4 * s, 2 * s)
		.fill(shell)
		.stroke(thin(lw));
	g.rect(x - 5.4 * s, y - 5.6 * s, 10.8 * s, 1.8 * s)
		.fill(IVORY)
		.stroke({ width: lw * 0.6, color: INK, alpha: 0.5 });
	g.roundRect(x - 6 * s, y - 10.4 * s, 12 * s, 5 * s, 2.5 * s)
		.fill(shell)
		.stroke(thin(lw));
	g.rect(x - 3.4 * s, y - 9.4 * s, 4 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.55 });
}

export function eclair(g: Graphics, x: number, y: number, s = 1, glaze = CHOC): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.roundRect(x - 10 * s, y - 6 * s, 20 * s, 6 * s, 3 * s)
		.fill(CRUST_LIGHT)
		.stroke(thin(lw));
	g.roundRect(x - 9.4 * s, y - 6.8 * s, 18.8 * s, 3.4 * s, 1.7 * s)
		.fill(glaze)
		.stroke(thin(lw * 0.7));
	g.moveTo(x - 7 * s, y - 5 * s);
	for (let k = 0; k < 6; k++) g.lineTo(x + (-5 + k * 2.4) * s, y - (k % 2 ? 6 : 4.6) * s);
	g.stroke({ width: lw * 0.7, color: 0xffffff, alpha: 0.85 });
}

export function cupcake(g: Graphics, x: number, y: number, s = 1, frost = PINK, wrap = MINT): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.poly([x - 6 * s, y - 7 * s, x + 6 * s, y - 7 * s, x + 4.6 * s, y, x - 4.6 * s, y])
		.fill(wrap)
		.stroke(thin(lw));
	for (let k = -2; k <= 2; k++) g.moveTo(x + k * 2.2 * s, y - 6.6 * s).lineTo(x + k * 1.7 * s, y - 0.4 * s);
	g.stroke({ width: lw * 0.6, color: INK, alpha: 0.35 });
	g.ellipse(x, y - 8.6 * s, 7 * s, 3 * s)
		.fill(frost)
		.stroke(thin(lw));
	g.ellipse(x, y - 11.2 * s, 5 * s, 2.6 * s)
		.fill(frost)
		.stroke(thin(lw));
	g.ellipse(x, y - 13.4 * s, 3 * s, 2 * s)
		.fill(frost)
		.stroke(thin(lw));
	g.circle(x + 0.6 * s, y - 16 * s, 1.9 * s)
		.fill(CHERRY)
		.stroke(thin(lw * 0.8));
}

export function loaf(g: Graphics, x: number, y: number, s = 1): void {
	const lw = Math.max(0.8, 1.3 * s);
	g.ellipse(x, y - 5 * s, 10 * s, 5.4 * s)
		.fill(CRUST)
		.stroke(thin(lw));
	for (let k = -1; k <= 1; k++) g.moveTo(x + (k * 5 - 2) * s, y - 7.6 * s).lineTo(x + (k * 5 + 2) * s, y - 3.8 * s);
	g.stroke({ width: lw * 0.9, color: CRUST_LIGHT });
	g.ellipse(x - 3 * s, y - 8 * s, 3 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.35 });
}

/** A baguette lying at angle `a`, centred at (x, y), `len` long. */
export function baguette(g: Graphics, x: number, y: number, len: number, a: number, s = 1): void {
	g.poly(oval(x, y, len / 2, 3.2 * s, a))
		.fill(CRUST)
		.stroke(thin(1.3 * s));
	const c = Math.cos(a);
	const sn = Math.sin(a);
	for (let k = -2; k <= 2; k++) {
		const t = (k * len) / 6;
		const px = x + t * c;
		const py = y + t * sn;
		g.moveTo(px - 2 * c + 1.4 * sn, py - 2 * sn - 1.4 * c).lineTo(px + 2 * c - 1.4 * sn, py + 2 * sn + 1.4 * c);
	}
	g.stroke({ width: 1.1 * s, color: CRUST_LIGHT });
}

export function painAuChocolat(g: Graphics, x: number, y: number, s = 1): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.roundRect(x - 7 * s, y - 7 * s, 14 * s, 7 * s, 2.6 * s)
		.fill(CRUST_LIGHT)
		.stroke(thin(lw));
	g.rect(x - 7 * s, y - 5 * s, 1.8 * s, 2 * s)
		.rect(x + 5.2 * s, y - 5 * s, 1.8 * s, 2 * s)
		.fill(CHOC_DARK);
	g.moveTo(x - 4 * s, y - 6.2 * s)
		.lineTo(x + 4 * s, y - 6.2 * s)
		.stroke({ width: lw * 0.8, color: CRUST });
}

/** A layer cake, `w` wide and `h` tall, its base centre at (x, y): sponge and cream in courses, a
 * frosted top, drips, a cherry or three. */
export function layerCake(g: Graphics, x: number, y: number, w: number, h: number, frost = PINK, sponge = 0xffe0a0, seed = 0): void {
	const lw = Math.max(1, w / 30);
	g.roundRect(x - w / 2, y - h, w, h, 3)
		.fill(sponge)
		.stroke(thin(lw));
	const courses = Math.max(2, Math.round(h / 8));
	for (let k = 1; k < courses; k++) g.rect(x - w / 2 + 0.5, y - h + (k * h) / courses - 1, w - 1, 2);
	g.fill({ color: k2(seed) ? CHOC : IVORY, alpha: 0.9 });
	// The frosting: a cap with drips down the side.
	g.roundRect(x - w / 2 - 1, y - h - 3, w + 2, 6, 3)
		.fill(frost)
		.stroke(thin(lw));
	for (let k = 0; k < 5; k++) {
		const dx = x - w / 2 + 2 + ((k + 0.5) * (w - 4)) / 5;
		g.roundRect(dx - 1.4, y - h + 1, 2.8, 3 + ((seed + k * 3) % 4) * 1.2, 1.4);
	}
	g.fill(frost);
	for (let k = 0; k < 3; k++) g.circle(x + (k - 1) * w * 0.28, y - h - 4, Math.max(1.4, w / 22));
	g.fill(CHERRY);
}

const k2 = (seed: number) => seed % 3 === 1;

/** A swirl lollipop on its stick: the candy's centre at (x, y), the stick down `stick` from it. */
export function lollipop(g: Graphics, x: number, y: number, r: number, stick: number, a = PINK, b = 0xffffff): void {
	g.rect(x - 1.2, y, 2.4, stick)
		.fill(0xffffff)
		.stroke(thin(1));
	g.circle(x, y, r)
		.fill(a)
		.stroke(thin(Math.max(1.2, r / 7)));
	g.moveTo(x, y);
	for (let k = 1; k <= 40; k++) {
		const t = (k / 40) * Math.PI * 5;
		const rr = (k / 40) * r * 0.86;
		g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
	}
	g.stroke({ width: Math.max(1, r * 0.22), color: b, cap: "round", join: "round" });
}

/** A cup of coffee on its saucer, a heart in the foam: its base centre at (x, y). */
export function cup(g: Graphics, x: number, y: number, s = 1, colour = 0xffffff): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.ellipse(x, y - 1 * s, 8 * s, 2 * s)
		.fill(colour)
		.stroke(thin(lw));
	g.poly([x - 5.5 * s, y - 8 * s, x + 5.5 * s, y - 8 * s, x + 4 * s, y - 1.6 * s, x - 4 * s, y - 1.6 * s])
		.fill(colour)
		.stroke(thin(lw));
	g.moveTo(x + 5 * s, y - 6.6 * s)
		.arc(x + 6.4 * s, y - 5 * s, 2 * s, -Math.PI / 2, Math.PI / 2)
		.stroke(thin(lw));
	g.ellipse(x, y - 8 * s, 5.5 * s, 1.6 * s)
		.fill(0xd9a46a)
		.stroke(thin(lw * 0.8));
	g.circle(x - 0.7 * s, y - 8.2 * s, 0.8 * s)
		.circle(x + 0.7 * s, y - 8.2 * s, 0.8 * s)
		.fill(0xfff6e6);
}
