// Windows that look out: the sky for the phase, a skyline, the sun or the moon, drawn into the glass
// of each window the theme hangs (inside its frame, so the theme's painter is untouched) and baked
// with the room. The skyline is laid out by world x, so neighbouring windows show one continuous
// city. Clouds move (office.ts keeps them as sprites on the life clock); everything here is still.
import { Graphics, type Renderer, Rectangle, type Texture } from "pixi.js";
import { type Phase, type SunSpot, glassOf } from "./daylight";

export { type SunSpot, glassOf, panesOf, sunSpot } from "./daylight";
import { INK, noise } from "./paper";
import type { SceneLight } from "../theme/types";
import type { Rect } from "./world";

const SUN_COLOUR = { morning: 0xfff0a6, afternoon: 0xffc867, dusk: 0xff8a5c } as const;

/** Draw the view out of one window into `g`, inside its glass. */
export function drawOutlook(g: Graphics, wall: Rect, light: SceneLight, phase: Phase, sun: SunSpot | undefined): void {
	const r = glassOf(wall, light);
	const [top, horizon] = light.sky[phase];
	const [far, near] = light.skyline[phase];
	// The sky, in three flat paper bands.
	const mid = mixColour(top, horizon, 0.5);
	g.rect(r.x, r.y, r.w, r.h * 0.42).fill(top);
	g.rect(r.x, r.y + r.h * 0.42, r.w, r.h * 0.3).fill(mid);
	g.rect(r.x, r.y + r.h * 0.72, r.w, r.h * 0.28).fill(horizon);
	if (phase === "night") {
		// Stars, from the window's place in the world.
		for (let i = 0; i < 6; i++) {
			const sx = r.x + 3 + noise(Math.round(wall.x), i, 3) * (r.w - 6);
			const sy = r.y + 3 + noise(Math.round(wall.x), i, 4) * r.h * 0.45;
			g.rect(sx, sy, 1.6, 1.6);
		}
		g.fill({ color: 0xffffff, alpha: 0.85 });
	}
	const here = sun && Math.abs(sun.x - wall.x) < 1;
	if (here && sun) {
		const cx = r.x + r.w * sun.across;
		const cy = r.y + r.h * sun.at;
		const rad = Math.min(r.h * (sun.kind === "setting" ? 0.24 : 0.17), 13);
		if (sun.kind === "moon") {
			g.circle(cx, cy, rad).fill(0xe3d083);
			g.circle(cx - rad * 0.22, cy - rad * 0.12, rad * 0.8).fill(0xfff3b0);
		} else {
			const colour = SUN_COLOUR[phase as keyof typeof SUN_COLOUR] ?? 0xfff0a6;
			g.circle(cx, cy, rad * 1.6).fill({ color: colour, alpha: 0.3 });
			g.circle(cx, cy, rad).fill(colour);
		}
	}
	// The skyline: a far row and a near row of blocks, by world x, so windows side by side agree.
	skyline(g, r, 24, 0.3, 0.58, far, 1);
	skyline(g, r, 16, 0.14, 0.38, near, 2, phase === "night" || phase === "dusk" ? 0xffe39a : undefined);
	// A pane's glare by day.
	if (phase !== "night" && phase !== "dusk") {
		const gx = r.x + r.w * 0.62;
		g.poly([gx, r.y + r.h, gx + 10, r.y, gx + 17, r.y, gx + 7, r.y + r.h]).fill({ color: 0xffffff, alpha: 0.22 });
	}
	// The bars, over everything (the theme's frame is outside the glass).
	const { panes, bar, transom } = light.window;
	const pw = (r.w - bar * (panes - 1)) / panes;
	for (let i = 1; i < panes; i++) g.rect(r.x + i * pw + (i - 1) * bar, r.y, bar, r.h);
	if (transom) g.rect(r.x, r.y + (r.h - bar) / 2, r.w, bar);
	g.fill(INK);
}

/** One row of the skyline in the glass `r`: blocks `lot` px wide by world x, `lo` to `hi` of the
 * glass's height, with lit windows (`lit`) after dark. */
function skyline(g: Graphics, r: Rect, lot: number, lo: number, hi: number, colour: number, seed: number, lit?: number): void {
	const first = Math.floor(r.x / lot);
	const last = Math.floor((r.x + r.w) / lot);
	const blocks: Rect[] = [];
	for (let i = first; i <= last; i++) {
		const n = noise(i, seed, 7);
		if (seed === 2 && n < 0.18) continue; // a gap in the near row
		const h = r.h * (lo + (hi - lo) * noise(i, seed, 8));
		const x0 = Math.max(r.x, i * lot + (seed === 2 ? 2 : 0));
		const x1 = Math.min(r.x + r.w, (i + 1) * lot - (seed === 2 ? 2 : 0));
		if (x1 <= x0) continue;
		blocks.push({ x: x0, y: r.y + r.h - h, w: x1 - x0, h });
	}
	for (const b of blocks) g.rect(b.x, b.y, b.w, b.h);
	g.fill(colour);
	if (lit === undefined) return;
	for (const b of blocks) {
		for (let k = 0; k < 4; k++) {
			const wx = b.x + 2 + noise(Math.round(b.x), k, 9) * Math.max(0, b.w - 5);
			const wy = b.y + 3 + noise(Math.round(b.x), k, 10) * Math.max(0, b.h - 6);
			if (noise(Math.round(b.x), k, 11) < 0.45) g.rect(wx, wy, 2.2, 2.2);
		}
	}
	g.fill(lit);
}

function mixColour(a: number, b: number, t: number): number {
	const ch = (c: number, s: number) => (c >> s) & 0xff;
	const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
	return m(16) | m(8) | m(0);
}

/** A small flat paper cloud, baked once, tinted per phase by its sprite. */
export function cloudTexture(renderer: Renderer): Texture {
	const g = new Graphics();
	g.roundRect(0, 6, 34, 14, 7).roundRect(10, 0, 18, 14, 7).fill(0xffffff);
	const tex = renderer.generateTexture({ target: g, frame: new Rectangle(-1, -1, 36, 22), resolution: 4, antialias: true });
	g.destroy();
	return tex;
}

/** The cloud's tint and alpha for the phase. */
export const CLOUD: Record<Phase, { tint: number; alpha: number }> = {
	morning: { tint: 0xffffff, alpha: 0.95 },
	noon: { tint: 0xffffff, alpha: 1 },
	afternoon: { tint: 0xfff3e2, alpha: 0.95 },
	dusk: { tint: 0xffc6b4, alpha: 0.85 },
	night: { tint: 0x4a557f, alpha: 0.7 },
};
