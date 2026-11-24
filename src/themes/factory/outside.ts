// Outside the factory: the yard, its pallets and drums. Split out of scene.ts.
import type { Graphics } from "pixi.js";
import { INK, RED, SHADOW, line, noise } from "../../scene/office/paper";
import type { Band, Rect } from "../../scene/world/world";
import { SAFETY, WOOD } from "./palette";

/** A gap in the footprint as the works' back yard: a concrete apron with its joints and a painted
 * walkway line, pallets of boxes in the corners and a couple of oil drums; as much as fits. */
export function yard(g: Graphics, r: Rect, _band: Band): void {
	const p = { x: r.x + 7, y: r.y + 7, w: r.w - 14, h: r.h - 14 };
	if (p.w < 18 || p.h < 18) return;
	g.roundRect(p.x, p.y, p.w, p.h, 6).fill(0xbfbab0);
	for (let x = p.x + 64; x < p.x + p.w - 8; x += 64) g.rect(x, p.y + 3, 2, p.h - 6);
	for (let y = p.y + 64; y < p.y + p.h - 8; y += 64) g.rect(p.x + 3, y, p.w - 6, 2);
	g.fill({ color: INK, alpha: 0.08 });
	// An oil stain, from the yard's place.
	const sx = p.x + p.w * (0.3 + noise(Math.round(r.x), Math.round(r.y), 61) * 0.4);
	const sy = p.y + p.h * (0.3 + noise(Math.round(r.x), Math.round(r.y), 62) * 0.4);
	g.ellipse(sx, sy, Math.min(22, p.w * 0.2), Math.min(9, p.h * 0.08)).fill({ color: INK, alpha: 0.1 });
	if (p.w >= 40) g.roundRect(p.x + 9, p.y + 9, p.w - 18, p.h - 18, 4).stroke({ width: 3, color: SAFETY, alpha: 0.8 });
	g.roundRect(p.x, p.y, p.w, p.h, 6).stroke({ width: 3, color: INK, alpha: 0.45 });
	const things: [number, () => void][] = [];
	const corner = p.w >= 64 && p.h >= 64;
	if (corner) {
		things.push([p.y + 42, () => pallet(g, p.x + p.w / 2 - Math.min(p.w / 2 - 34, 60), p.y + 42, 0)]);
		things.push([p.y + p.h - 12, () => drums(g, p.x + p.w - 26, p.y + p.h - 12, p.w >= 110 ? 2 : 1)]);
	}
	if (p.w >= 80 && p.h >= 150) things.push([p.y + p.h * 0.6, () => pallet(g, p.x + p.w / 2, p.y + p.h * 0.6, 1)]);
	if (p.w >= 150 && p.h >= 150) things.push([p.y + p.h - 12, () => pallet(g, p.x + 40, p.y + p.h - 12, 2)]);
	if (!corner) things.push([p.y + p.h - 6, () => drums(g, p.x + p.w / 2, p.y + p.h - 6, 1)]);
	for (const [, draw] of things.sort((a, b) => a[0] - b[0])) draw();
}

/** A pallet with boxes on it, its base's centre at (x, y). */
function pallet(g: Graphics, x: number, y: number, k: number): void {
	g.rect(x - 28, y - 3, 62, 6).fill(SHADOW);
	g.rect(x - 30, y - 9, 60, 9)
		.fill(WOOD)
		.stroke(line(2.5));
	g.rect(x - 24, y - 7, 8, 5)
		.rect(x - 4, y - 7, 8, 5)
		.rect(x + 16, y - 7, 8, 5)
		.fill(INK);
	const boxes: [number, number, number, number][] = [
		[-26, -31, 26, 22],
		[2, -27, 24, 18],
		[-14, -49, 24, 18],
	];
	for (const [i, [bx, by, bw, bh]] of boxes.slice(0, 2 + (k % 2)).entries()) {
		g.rect(x + bx, y + by, bw, bh)
			.fill(i === 2 ? 0xd6b48a : 0xc9a77a)
			.stroke(line(2));
		g.moveTo(x + bx + bw / 2, y + by)
			.lineTo(x + bx + bw / 2, y + by + bh * 0.45)
			.stroke({ width: 3, color: 0xe8d6b5 });
	}
}

/** Oil drums standing together, the front one's base centre at (x, y). */
function drums(g: Graphics, x: number, y: number, n: number): void {
	for (let i = n - 1; i >= 0; i--) {
		const dx = x - i * 22;
		const dy = y - i * 8;
		g.ellipse(dx + 3, dy + 1, 13, 4).fill(SHADOW);
		g.roundRect(dx - 11, dy - 32, 22, 32, 3)
			.fill(i ? 0x3d7dff : RED)
			.stroke(line(2.5));
		g.rect(dx - 11, dy - 22, 22, 2)
			.rect(dx - 11, dy - 11, 22, 2)
			.fill(INK);
		g.ellipse(dx, dy - 32, 11, 3)
			.fill(i ? 0x6f9cff : 0xff8f8f)
			.stroke({ width: 1.8, color: INK });
	}
}
