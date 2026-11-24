// The factory theme: the same floor plan, cast and director, in a works. Project rooms are workshop
// bays (concrete floors, hazard stripes along the wall, high windows, a girder overhead with the bay's
// robot arm on its rail); the hallway is a conveyor aisle; the meeting room a QA booth, the kitchen a
// break room with a vending machine, your office the foreman's. Stations are machines under the same
// slots, drawn as bodies only, their tops at the rig's working point (the rig draws what the hands
// work there: the press's ram, the gauge's needle, the bins, the radio's handset). Still cut paper:
// flat shapes and the same ink, so the cast reads the same in both.
import type { Graphics } from "pixi.js";
import { INK, RED, SHADOW, line, noise } from "../../scene/office/paper";
import type { Band, Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import { NIGHT_WATCH, plannerOf } from "../office/scene";
import { FACTORY_STAGING } from "./staging";
import type { SceneLight, SceneTheme } from "../../scene/theme/types";
import { FACTORY_WORDS } from "./words";
import { SAFETY, WOOD } from "./palette";
import { hallway, rivets, room } from "./room";
import { beacon, cans, furniture, hopper, scrapBin, toolChest } from "./furniture";
import { CRATE_BUILD, FACTORY_STAGE } from "./stage";

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
