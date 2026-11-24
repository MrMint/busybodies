// The factory's stage: the crate build, the belt and its parts, the foreman's booth, the dock and
// the PR crate. Split out of scene.ts.
import type { Graphics } from "pixi.js";
import { GREEN, INK, RED, SHADOW, line } from "../../scene/office/paper";
import type { StagePainters } from "../../scene/theme/types";
import { GLASS, ORANGE, SAFETY, STEEL, STEEL_DARK, STEEL_LIGHT, WOOD, hazard } from "./palette";

// --- The crew build -------------------------------------------------------------------------------

const CRATES = [0xd9a066, 0xc98f55, 0xe3b074, 0xcf9a5e];

export const CRATE_BUILD = {
	piece: (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		g.rect(x, y, w, h).fill(CRATES[k % CRATES.length]!);
		g.moveTo(x + 1, y + h / 2).lineTo(x + w - 1, y + h / 2).moveTo(x + 2, y + 1).lineTo(x + w - 2, y + h - 1).stroke({ width: 1, color: INK, alpha: 0.45 });
		g.rect(x, y, w, h).stroke({ width: 1.5, color: INK });
	},
	flag: (f: Graphics, top: { x: number; y: number }) => {
		// A pennant on a pole: SHIP IT, in green.
		f.moveTo(top.x, top.y).lineTo(top.x, top.y - 22).stroke({ width: 2.5, color: INK });
		f.moveTo(top.x, top.y - 22).lineTo(top.x + 15, top.y - 16).lineTo(top.x, top.y - 10).closePath().fill(GREEN).stroke({ width: 1.5, color: INK });
	},
};

// --- Staging (world/staging.ts): lines, booths, the dock -------------------------------------

/** A line's belt: a dark rubber top on a steel frame with a hazard skirt, on short legs. */
function belt(g: Graphics, w: number): void {
	g.rect(4, 2, w, 14).fill(SHADOW);
	for (let x = 130; x < w - 60; x += 120) g.rect(x, 6, 5, 10);
	for (const x of [10, w - 15]) g.rect(x, 6, 5, 10);
	g.fill(STEEL_DARK);
	g.rect(0, -8, w, 8).fill(0x3c414a);
	g.roundRect(-2, 0, w + 4, 8, 2).fill(STEEL).stroke(line(2.5));
	hazard(g, 2, 2, w, 3, 10);
	g.moveTo(0, -8).lineTo(w, -8).stroke({ width: 2, color: INK });
}

/** The belt's slats: pale bars across the rubber, one every `pitch`. */
function slats(g: Graphics, w: number, pitch: number): void {
	for (let x = -pitch; x < w; x += pitch) g.rect(x, -7, 2.5, 6);
	g.fill({ color: 0xffffff, alpha: 0.22 });
}

/** The drums at each end, over the slats where they wrap round. */
function rollers(g: Graphics, w: number, pitch: number): void {
	const cap = pitch + 2;
	for (const x of [-cap + 2, w - 2]) {
		g.roundRect(x, -10, cap, 18, 4).fill(STEEL_LIGHT).stroke(line(2.5));
		g.circle(x + cap / 2, -1, 3).fill(STEEL_DARK);
	}
}

/** A part on the belt for each kind of work: a blueprint roll (read), a radio valve (web), a hex nut
 * (search), a gear (edit), a steel billet (shell), a gauge (test). About 12 px, its base at y = 0. */
function part(g: Graphics, kind: string): void {
	switch (kind) {
		case "read":
			g.roundRect(-8, -7, 16, 7, 3.5).fill(0x8fc3ec).stroke(line(1.8));
			g.moveTo(-3, -7).lineTo(-3, 0).stroke({ width: 1.2, color: INK, alpha: 0.5 });
			break;
		case "web":
			g.roundRect(-4, -12, 8, 12, 4).fill(GLASS).stroke(line(1.8));
			g.circle(0, -7, 1.8).fill(ORANGE);
			break;
		case "search": {
			const pts: number[] = [];
			for (let k = 0; k < 6; k++) pts.push(Math.cos((k * Math.PI) / 3) * 6, -6 + Math.sin((k * Math.PI) / 3) * 6);
			g.poly(pts).fill(STEEL_LIGHT).stroke(line(1.8));
			g.circle(0, -6, 2.2).fill(STEEL_DARK);
			break;
		}
		case "edit": {
			const pts: number[] = [];
			for (let k = 0; k < 16; k++) {
				const r = k % 2 ? 4.6 : 6.6;
				const a = (k * Math.PI) / 8;
				pts.push(Math.cos(a) * r, -6.6 + Math.sin(a) * r);
			}
			g.poly(pts).fill(SAFETY).stroke(line(1.8));
			g.circle(0, -6.6, 1.8).fill(INK);
			break;
		}
		case "test":
			g.circle(0, -6, 6).fill(0xffffff).stroke(line(1.8));
			g.moveTo(0, -6).lineTo(3.5, -9).stroke({ width: 1.4, color: RED });
			break;
		default:
			g.roundRect(-7, -8, 14, 8, 1.5).fill(STEEL).stroke(line(1.8));
			g.rect(-4, -6, 8, 1.5).fill({ color: 0xffffff, alpha: 0.4 });
	}
}

/** The foreman's booth round its bench: two posts, a roof with a hazard band and a lamp, and wired
 * glass behind the foreman, who stands up in it at the controls (layout.ts puts the lead at
 * (-26, -42) from the desk front's centre: the booth frames it). */
function booth(g: Graphics): void {
	// Wide enough to frame the foreman (72 px, its hat and all), its top rail no higher than a back
	// wall's signs come down (layout.ts SIGN_FOOT), so it never covers their text.
	const l = -86;
	const r = 30;
	const top = -124;
	const bottom = -66;
	g.rect(l + 7, top + 6, r - l - 7, bottom - top - 6).fill({ color: GLASS, alpha: 0.55 });
	for (let y = top + 16; y < bottom; y += 11) g.moveTo(l + 7, y).lineTo(r, y);
	for (let x = l + 18; x < r; x += 14) g.moveTo(x, top + 6).lineTo(x, bottom);
	g.stroke({ width: 1, color: STEEL_DARK, alpha: 0.3 });
	g.rect(l, top, 7, bottom - top).rect(r, top, 7, bottom - top).fill(STEEL_DARK);
	g.rect(l, top, 7, bottom - top).rect(r, top, 7, bottom - top).stroke(line(2.5));
	g.roundRect(l - 4, top - 4, r - l + 15, 8, 3).fill(STEEL).stroke(line(2.5));
	hazard(g, l - 1, top - 1, r - l + 9, 2.5, 9);
	g.roundRect(l - 2, top - 13, 11, 9, 4.5).fill(ORANGE).stroke(line(2));
}

/** The dock at the hallway's end: a loading door with its shutter half up and the belt running in
 * under it, hazard posts either side. Its right edge at x = 0. */
function dock(g: Graphics, h: number): void {
	const w = 56;
	g.rect(-w, 6, w, h - 12).fill(0x2b2f37);
	for (let y = 10; y < h * 0.42; y += 6) g.rect(-w + 4, y, w - 8, 4);
	g.fill(STEEL_LIGHT);
	g.rect(-w + 4, 10, w - 8, h * 0.42 - 10).stroke({ width: 1.5, color: INK });
	hazard(g, -w - 6, 6, 8, h - 12, 8);
	g.rect(-w - 6, 6, w + 6, h - 12).stroke(line(3));
}

/** A PR crate on the hallway's belt: slatted wood with a green ticket, its base at y = 0. */
function prCrate(g: Graphics): void {
	g.rect(-12, -18, 24, 18).fill(WOOD).stroke(line(2.5));
	g.moveTo(-12, -9).lineTo(12, -9).moveTo(-10, -16).lineTo(10, -2).stroke({ width: 1.5, color: INK, alpha: 0.5 });
	g.roundRect(-5, -23, 12, 7, 2).fill(GREEN).stroke(line(1.8));
}

export const FACTORY_STAGE: StagePainters = { belt, slats, rollers, part, booth, dock, crate: prCrate };
