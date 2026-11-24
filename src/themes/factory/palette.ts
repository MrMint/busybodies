// The factory's colours, and its hazard stripe. Split out of scene.ts.
import type { Graphics } from "pixi.js";
import { INK } from "../../scene/office/paper";

export const STEEL = 0x9aa5b1;

export const STEEL_LIGHT = 0xc7ced6;

export const STEEL_DARK = 0x5d6b7a;

export const CONCRETE = 0xc9c6be;

export const SAFETY = 0xffc928;

export const ORANGE = 0xff8a3d;

export const WOOD = 0xd9a066;

export const WOOD_TOP = 0xf0c48a;

export const GLASS = 0xcfe6f2;

/** A strip of hazard stripes: yellow with black diagonals. */
export function hazard(g: Graphics, x: number, y: number, w: number, h: number, step = 14): void {
	g.rect(x, y, w, h).fill(SAFETY);
	for (let sx = x - h; sx < x + w; sx += step) {
		const a = Math.max(x, sx);
		const b = Math.min(x + w, sx + step / 2);
		const c = Math.min(x + w, sx + step / 2 + h);
		const d = Math.max(x, sx + h);
		if (b <= x || a >= x + w) continue;
		g.poly([a, y + h - Math.max(0, a - sx), b, y + h - Math.min(h, b - sx), c, y, d, y].map((v, i) => (i % 2 ? v : Math.min(x + w, Math.max(x, v)))));
	}
	g.fill({ color: INK, alpha: 0.85 });
}
