// Outside the office: the patio, its planters, parasols and benches. Split out of scene.ts.
import type { Graphics } from "pixi.js";
import { INK, SHADOW, line, noise } from "../../scene/office/paper";
import type { Band, Rect } from "../../scene/world/world";
import { BLOOMS, SLAB, STONE } from "./palette";

/** A gap in the footprint as a small paved patio: pale stone flags, a bench, planters in the
 * corners; whatever its size, with as much as fits. Drawn in world coordinates, baked. */
export function patio(g: Graphics, r: Rect, _band: Band): void {
	const p = { x: r.x + 7, y: r.y + 7, w: r.w - 14, h: r.h - 14 };
	if (p.w < 18 || p.h < 18) return;
	g.roundRect(p.x, p.y, p.w, p.h, 8).fill(STONE);
	// Flags: rows of slabs, every other row's joints half a slab over, a few a shade off (from
	// the place's position, so the same every load).
	const fh = 26;
	const fw = 42;
	const seed = Math.round(r.x + r.y * 3);
	for (let y = p.y, j = 0; y < p.y + p.h - 6; y += fh, j++) {
		for (let x = p.x - (j % 2 ? fw / 2 : 0), i = 0; x < p.x + p.w - 6; x += fw, i++) {
			if (noise(i, j, seed) > 0.14) continue;
			const x0 = Math.max(p.x + 3, x + 2);
			const x1 = Math.min(p.x + p.w - 3, x + fw - 2);
			if (x1 - x0 > 8) g.rect(x0, y + 3, x1 - x0, Math.min(fh, p.y + p.h - y) - 6);
		}
	}
	g.fill({ color: 0xddd5c2 });
	for (let y = p.y + fh; y < p.y + p.h - 4; y += fh) g.rect(p.x + 3, y, p.w - 6, 1.5);
	for (let y = p.y, j = 0; y < p.y + p.h - 4; y += fh, j++) {
		for (let x = p.x + (j % 2 ? fw / 2 : fw); x < p.x + p.w - 6; x += fw) g.rect(x, y + 2, 1.5, Math.min(fh, p.y + p.h - y) - 4);
	}
	g.fill({ color: INK, alpha: 0.09 });
	g.roundRect(p.x, p.y, p.w, p.h, 8).stroke({ width: 3, color: INK, alpha: 0.45 });
	// What stands on it, back to front.
	const things: [number, () => void][] = [];
	const corner = p.w >= 48 && p.h >= 64;
	if (corner) {
		things.push([p.y + 50, () => planter(g, p.x + 26, p.y + 50, 0)]);
		things.push([p.y + p.h - 10, () => planter(g, p.x + p.w - 26, p.y + p.h - 10, 1)]);
	}
	if (p.w >= 150 && p.h >= 150) {
		things.push([p.y + 50, () => planter(g, p.x + p.w - 26, p.y + 50, 2)]);
		things.push([p.y + p.h - 10, () => planter(g, p.x + 26, p.y + p.h - 10, 3)]);
	}
	const wide = p.w >= 200 && p.h >= 200;
	if (p.w >= 80 && p.h >= 150) {
		const bw = Math.min(120, p.w - 22);
		const bx = wide ? p.x + p.w * 0.64 : p.x + p.w / 2;
		things.push([p.y + p.h * 0.62, () => bench(g, bx, p.y + p.h * 0.62, bw)]);
	}
	// Room for more: a table under a parasol, with a chair either side.
	if (wide) things.push([p.y + p.h * 0.4, () => parasol(g, p.x + p.w * 0.3, p.y + p.h * 0.4)]);
	else if (!corner) things.push([p.y + p.h - 6, () => planter(g, p.x + p.w / 2, p.y + p.h - 6, 0)]);
	for (const [, draw] of things.sort((a, b) => a[0] - b[0])) draw();
}

/** A wooden planter box with a round shrub and a few flowers, its base's centre at (x, y). */
function planter(g: Graphics, x: number, y: number, k: number): void {
	g.setTransform(1.25, 0, 0, 1.25, x - x * 1.25, y - y * 1.25);
	g.ellipse(x + 3, y + 1, 21, 5).fill(SHADOW);
	g.circle(x - 9, y - 26, 11)
		.circle(x + 8, y - 28, 12)
		.circle(x, y - 36, 11)
		.fill(INK);
	g.circle(x - 9, y - 26, 9.5)
		.circle(x + 8, y - 28, 10.5)
		.circle(x, y - 36, 9.5)
		.fill(k % 2 ? 0x47c97f : 0x3fb874);
	g.circle(x - 4, y - 36, 3.4).fill({ color: 0xffffff, alpha: 0.22 });
	for (let i = 0; i < 4; i++)
		g.circle(x - 10 + i * 7, y - 30 - (i % 2) * 7, 2.4)
			.fill(BLOOMS[(k + i) % BLOOMS.length]!)
			.stroke({ width: 1, color: INK });
	g.roundRect(x - 17, y - 20, 34, 20, 3)
		.fill(0xd9a066)
		.stroke(line(2.5));
	g.moveTo(x - 17, y - 13)
		.lineTo(x + 17, y - 13)
		.stroke({ width: 1.2, color: INK, alpha: 0.4 });
	g.setTransform(1, 0, 0, 1, 0, 0);
}

/** A round café table under a striped parasol, a chair either side, its foot's centre at (x, y). */
function parasol(g: Graphics, x: number, y: number): void {
	g.ellipse(x + 5, y + 2, 34, 7).fill(SHADOW);
	for (const side of [-1, 1]) {
		const cx = x + side * 26;
		g.roundRect(cx - 8, y - 30, 16, 14, 4)
			.fill(0x8fc8ff)
			.stroke(line(2));
		g.rect(cx - 7, y - 16, 3, 16)
			.rect(cx + 4, y - 16, 3, 16)
			.fill(SLAB);
	}
	g.rect(x - 1.5, y - 74, 3, 74).fill(SLAB);
	g.ellipse(x, y - 24, 17, 5)
		.fill(0xffffff)
		.stroke(line(2.2));
	g.moveTo(x - 36, y - 66)
		.quadraticCurveTo(x, y - 98, x + 36, y - 66)
		.closePath()
		.fill(0xffffff)
		.stroke(line(2.5));
	g.moveTo(x - 12, y - 66)
		.quadraticCurveTo(x - 6, y - 90, x, y - 82)
		.quadraticCurveTo(x + 6, y - 90, x + 12, y - 66)
		.closePath()
		.fill(0xff8fa3);
	g.moveTo(x - 36, y - 66)
		.quadraticCurveTo(x, y - 98, x + 36, y - 66)
		.stroke(line(2.5));
}

/** A park bench seen from the front: slatted back and seat on dark iron legs, centred at (x, y). */
function bench(g: Graphics, x: number, y: number, w: number): void {
	g.ellipse(x + 4, y + 1, w / 2 + 2, 6).fill(SHADOW);
	g.roundRect(x - w / 2 + 6, y - 30, 5, 30, 2)
		.roundRect(x + w / 2 - 11, y - 30, 5, 30, 2)
		.fill(SLAB);
	g.roundRect(x - w / 2, y - 40, w, 8, 3)
		.roundRect(x - w / 2, y - 29, w, 8, 3)
		.fill(0xc98a55)
		.stroke(line(2));
	g.roundRect(x - w / 2 - 3, y - 17, w + 6, 8, 3)
		.fill(0xd9a066)
		.stroke(line(2.2));
}
