// The bakery: the same floor plan, cast and director, in a patisserie gone completely over the top
// (plan-alive wave 4, stream K). Project rooms are baking rooms: candy-stripe wallpaper in the room's
// own pastel (so rooms still tell apart), a scalloped awning along the top with fairy lights under it,
// cream wainscot, and a checkerboard floor tinted with the room's colour. The hallway is a pastry
// conveyor: croissants, donuts, macarons and éclairs ride it on the life clock, and a finished PR's
// cake box rides it down to the pick-up hatch at its end. The meeting room is the tasting table (a
// cake turning on its stand), the lobby the shop front (a giant cupcake to nap in, sprinkles drifting
// down round it), your office the pick-up counter ("Order up!" in chasing marquee bulbs), the kitchen
// the café (a big espresso machine steaming, a cake cabinet stacked to the ceiling, macaron poufs).
// The planner is the order board, the in-tray a stand of macarons, the crew build a tiered cake.
//
// Stations are bakery kit under the same slots, drawn as bodies only, their tops at the rig's working
// point (the rig draws what the hands work there): the reference drawer is a pastry case, search a
// shelf of candy jars, build a deck oven (its window glows: office/ambient.ts `ovens`), test the cake
// tester's stand, web the order phone, the outbox the pick-up shelf of boxes, the shredder the crumb
// bin. Still cut paper: flat shapes and the same ink, so the cast reads the same as in the office.
import { Container } from "pixi.js";
import type { PlannerRow } from "../../scene/contract";
import { INK, batched, hash, label, line } from "../../scene/office/paper";
import type { Area, Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import { NIGHT_WATCH } from "../office/scene";
import type { SceneLight, SceneTheme } from "../../scene/theme/types";
import { BAKERY_WORDS } from "./words";
import { mix } from "../../shared/colour";
import { BRASS, CHALK, PINK, PINK_LIGHT, RASPBERRY, coloursOf } from "./palette";
import { patio } from "./outside";
import { BAKERY_STAGE, BAKERY_STAGING, BANDS, CAKE_BUILD } from "./stage";
import { cakeBoxes, cappuccinos, clocheLamp, crumbBin, furniture, macaronStand } from "./furniture";
import { hallway, room, scallops } from "./room";

/** Under a project room's desks: a rug a step deeper than its checks, edged in a deeper shade of
 * its wall, so the room reads as its project's from the whole-office stop (as the office's). */
function rugOf(a: Area): { fill: number; edge: number } | undefined {
	if (a.kind !== "project") return undefined;
	const [wall, floor] = coloursOf(a);
	return { fill: mix(floor, wall, 0.4), edge: mix(wall, RASPBERRY, 0.3) };
}

export const thin = (w: number) => ({ width: w, color: INK, join: "round" as const, cap: "round" as const });

function orderBoard(r: Rect, rows: PlannerRow[]): Container {
	const c = new Container();
	const g = batched();
	c.addChild(g);
	g.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 8).fill(PINK).stroke(line(4));
	g.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 4).fill(CHALK).stroke(thin(2));
	scallops(g, r.x + 8, r.x + r.w - 8, r.y - 2, 5, [PINK, PINK_LIGHT], 1.3);
	const colW = (r.w - 12) / 3;
	const tw = 8;
	const th = 10;
	const gap = 2;
	const head = 17;
	const perRow = Math.max(1, Math.floor((colW - 2) / (tw + gap)));
	const fit = perRow * Math.max(1, Math.floor((r.h - head - 8) / (th + gap + 2)));
	for (let k = 0; k < 3; k++) {
		const cx = r.x + 6 + k * colW;
		const t = label(BAKERY_WORDS.columns[k]!, 6, "800", 0xffffff);
		t.position.set(cx + (colW - t.width) / 2, r.y + 6);
		c.addChild(t);
		if (k > 0) g.rect(cx - 0.5, r.y + 8, 1, r.h - 16).fill({ color: 0xffffff, alpha: 0.35 });
		const notes = rows.flatMap((row) => Array.from({ length: [row.pending, row.active, row.done][k]! }, () => BANDS[hash(row.session) % BANDS.length]!));
		const lines = Math.max(1, Math.ceil(Math.min(notes.length, fit) / perRow));
		// A string for each line of cards.
		for (let l = 0; l < lines; l++) {
			const ry = r.y + head + l * (th + gap + 2);
			g.moveTo(cx + 1, ry - 0.5).quadraticCurveTo(cx + colW / 2, ry + 1.5, cx + colW - 3, ry - 0.5).stroke({ width: 0.9, color: 0xffffff, alpha: 0.75 });
		}
		notes.slice(0, notes.length > fit ? fit - 1 : fit).forEach((band, i) => {
			const nx = cx + 2 + (i % perRow) * (tw + gap);
			const ny = r.y + head + Math.floor(i / perRow) * (th + gap + 2);
			const tilt = k === 1 ? ((i % 3) - 1) * 0.7 : 0;
			g.poly([nx, ny, nx + tw, ny, nx + tw + tilt, ny + th, nx + tilt, ny + th]).fill(0xfffdf4).stroke({ width: 0.9, color: INK });
			g.rect(nx + 0.6, ny + 0.8, tw - 1.2, 2.2).fill(band);
			g.rect(nx + tw / 2 - 0.8, ny - 1.6, 1.6, 3).fill(BRASS);
			if (k === 2) {
				g.rect(nx + tw / 2 - 0.7, ny + 3, 1.4, th - 3).fill(RASPBERRY);
				g.circle(nx + tw / 2 - 1.4, ny + 6, 1.2).circle(nx + tw / 2 + 1.4, ny + 6, 1.2).fill(RASPBERRY);
			}
		});
		if (notes.length > fit) {
			const more = label(`+${notes.length - fit + 1}`, 6.5, "800", 0xffffff);
			more.position.set(cx + colW - more.width - 2, r.y + r.h - more.height - 5);
			c.addChild(more);
		}
	}
	return c;
}

/** The bakery's light (office/light.ts): golden morning light, warm oven-orange halos after dark,
 * round pools under its pendants, a pastel town out of the windows, trees on the street. */
const BAKERY_LIGHT: SceneLight = {
	ambient: { morning: 0xfff0de, noon: 0xffffff, afternoon: 0xffefdc, dusk: 0xd6b4c4, night: 0x6c5a80 },
	hall: { morning: 0xfff4e8, noon: 0xffffff, afternoon: 0xfff3e4, dusk: 0xe2c8d2, night: 0xa898b4 },
	outside: { morning: 0xfff0f0, noon: 0xffffff, afternoon: 0xffeed6, dusk: 0xb4a0c8, night: 0x3a4070 },
	lamp: 0xffe6c0,
	glow: 0xffa040,
	overhead: "pools",
	vacant: 0.62,
	sun: 0xfff0c4,
	sky: {
		morning: [0xc8e4ff, 0xffd8d0],
		noon: [0x9ad6ff, 0xdff4ff],
		afternoon: [0xb0d2f4, 0xffd09a],
		dusk: [0x5e4a92, 0xff9a90],
		night: [0x161a38, 0x2c3470],
	},
	skyline: {
		morning: [0xf2c6cc, 0xd9a3b0],
		noon: [0xf4cfd0, 0xdcaab4],
		afternoon: [0xf2c0aa, 0xd49c92],
		dusk: [0x7a5a88, 0x52386c],
		night: [0x2e2a4c, 0x201d38],
	},
	window: { inset: 4, panes: 2, transom: false, bar: 5 },
	floors: {},
	cluster: "rug",
	decal: { size: 30, colour: 0x6b2f4f, stencil: false },
	yard: "trees",
};

export const BAKERY_THEME: SceneTheme = {
	id: "bakery",
	words: BAKERY_WORDS,
	lawn: 0xd7ecd4,
	slab: 0x5a3a44,
	room,
	hallway,
	furniture,
	desk: { tray: macaronStand, mugs: cappuccinos, lamp: clocheLamp, drawers: cakeBoxes, skip: crumbBin },
	planner: orderBoard,
	rug: rugOf,
	patio,
	crewBuild: (b, seed) => crewBuild(b, seed, CAKE_BUILD),
	nightWatch: { ...NIGHT_WATCH, tint: "night-baker" },
	arms: false,
	light: BAKERY_LIGHT,
	staging: BAKERY_STAGING,
	stage: BAKERY_STAGE,
};
