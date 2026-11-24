// The factory theme: the same floor plan, cast and director, in a works. Project rooms are workshop
// bays (concrete floors, hazard stripes along the wall, high windows, a girder overhead with the bay's
// robot arm on its rail); the hallway is a conveyor aisle; the meeting room a QA booth, the kitchen a
// break room with a vending machine, your office the foreman's. Stations are machines under the same
// slots, drawn as bodies only, their tops at the rig's working point (the rig draws what the hands
// work there: the press's ram, the gauge's needle, the bins, the radio's handset). Still cut paper:
// flat shapes and the same ink, so the cast reads the same in both.
import type { Graphics } from "pixi.js";
import { GREEN, INK, RED, SHADOW, line, noise } from "../../scene/office/paper";
import type { Band, Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import { NIGHT_WATCH, plannerOf } from "../office/scene";
import { FACTORY_STAGING } from "./staging";
import type { SceneLight, SceneTheme, StagePainters } from "../../scene/theme/types";
import { FACTORY_WORDS } from "./words";
import { GLASS, ORANGE, SAFETY, STEEL, STEEL_DARK, STEEL_LIGHT, WOOD, hazard } from "./palette";
import { hallway, rivets, room } from "./room";
import { beacon, cans, furniture, hopper, scrapBin, toolChest } from "./furniture";

// --- The crew build -------------------------------------------------------------------------------

const CRATES = [0xd9a066, 0xc98f55, 0xe3b074, 0xcf9a5e];

const CRATE_BUILD = {
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

/** The job board: the planner on a steel board with rivets, its notes magnets. */
const jobBoard = (r: Rect, rows: Parameters<typeof plannerOf>[1]) => plannerOf(r, rows, 0xdfe4e8, FACTORY_WORDS.columns, (g, b) => rivets(g, b.x, b.y, b.w, b.h));

/** The factory's light (office/light.ts): cold fluorescent strips over each line, high windows on
 * an industrial skyline, a gravel yard with bollards and pallets. */
const FACTORY_LIGHT: SceneLight = {
	ambient: { morning: 0xe4e6f0, noon: 0xf8fafc, afternoon: 0xf3eadc, dusk: 0xa7a8bd, night: 0x3e4866 },
	hall: { morning: 0xeaecf3, noon: 0xffffff, afternoon: 0xf7efe3, dusk: 0xbcbdcc, night: 0x868fac },
	outside: { morning: 0xeef0f8, noon: 0xffffff, afternoon: 0xfaebd4, dusk: 0xa3a0bd, night: 0x343d5c },
	lamp: 0xeef6ff,
	glow: 0xcfe6ff,
	overhead: "strips",
	vacant: 0.68,
	sun: 0xfff3d6,
	sky: {
		morning: [0xc9dcf0, 0xf3e1cf],
		noon: [0xa9cbe6, 0xdbe9f2],
		afternoon: [0xb8c9dc, 0xf2c995],
		dusk: [0x4f4a78, 0xe89272],
		night: [0x131828, 0x26304e],
	},
	skyline: {
		morning: [0xb7bfcc, 0x8e98a8],
		noon: [0xb9c2cf, 0x8f9aab],
		afternoon: [0xc8b4a4, 0x9a8679],
		dusk: [0x5d5577, 0x3c3654],
		night: [0x262c44, 0x191e33],
	},
	window: { inset: 4, height: 42, panes: 4, transom: true, bar: 2.5 },
	floors: { lobby: "planks" },
	cluster: "zone",
	decal: { size: 26, colour: INK, stencil: true },
	yard: "yard",
};

/** A gap in the footprint as the works' back yard: a concrete apron with its joints and a painted
 * walkway line, pallets of boxes in the corners and a couple of oil drums; as much as fits. */
function yard(g: Graphics, r: Rect, _band: Band): void {
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
	g.rect(x - 30, y - 9, 60, 9).fill(WOOD).stroke(line(2.5));
	g.rect(x - 24, y - 7, 8, 5).rect(x - 4, y - 7, 8, 5).rect(x + 16, y - 7, 8, 5).fill(INK);
	const boxes: [number, number, number, number][] = [[-26, -31, 26, 22], [2, -27, 24, 18], [-14, -49, 24, 18]];
	for (const [i, [bx, by, bw, bh]] of boxes.slice(0, 2 + (k % 2)).entries()) {
		g.rect(x + bx, y + by, bw, bh).fill(i === 2 ? 0xd6b48a : 0xc9a77a).stroke(line(2));
		g.moveTo(x + bx + bw / 2, y + by).lineTo(x + bx + bw / 2, y + by + bh * 0.45).stroke({ width: 3, color: 0xe8d6b5 });
	}
}

/** Oil drums standing together, the front one's base centre at (x, y). */
function drums(g: Graphics, x: number, y: number, n: number): void {
	for (let i = n - 1; i >= 0; i--) {
		const dx = x - i * 22;
		const dy = y - i * 8;
		g.ellipse(dx + 3, dy + 1, 13, 4).fill(SHADOW);
		g.roundRect(dx - 11, dy - 32, 22, 32, 3).fill(i ? 0x3d7dff : RED).stroke(line(2.5));
		g.rect(dx - 11, dy - 22, 22, 2).rect(dx - 11, dy - 11, 22, 2).fill(INK);
		g.ellipse(dx, dy - 32, 11, 3).fill(i ? 0x6f9cff : 0xff8f8f).stroke({ width: 1.8, color: INK });
	}
}

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

const FACTORY_STAGE: StagePainters = { belt, slats, rollers, part, booth, dock, crate: prCrate };

export const FACTORY_THEME: SceneTheme = {
	id: "factory",
	words: FACTORY_WORDS,
	lawn: 0xcfc8b8,
	slab: 0x3b4049,
	room,
	hallway,
	furniture,
	desk: { tray: hopper, mugs: cans, lamp: beacon, drawers: toolChest, skip: scrapBin },
	planner: jobBoard,
	patio: yard,
	crewBuild: (b, seed) => crewBuild(b, seed, CRATE_BUILD),
	nightWatch: { ...NIGHT_WATCH, tint: "night-shift" },
	arms: true,
	light: FACTORY_LIGHT,
	staging: FACTORY_STAGING,
	stage: FACTORY_STAGE,
};
