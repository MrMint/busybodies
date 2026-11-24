// The office theme: the original look (design/boards/FloorBusy), cut paper with pastel rooms. Every
// painter here draws once per change into a Graphics or Container, never per frame; furniture is
// drawn around its base point (0, 0), the bottom centre where it meets the floor. Desk props are
// drawn around the desk front's centre (world/propspots.ts PROPS says where each goes): the desk
// top is y -70 to -38, the lead stands behind it at x -26, the crew build is on its left end.
//
//   inTray      the context pile in front of the lead: a few sheets to buried to the eyebrows
//   mugPile     a mug per cup of coffee, stacked
//   testLamp    a little lamp on the desk's right end, red or green from the last test
//   drawers     a filing cabinet beside the desk, a drawer per ~10 files, the full ones bulging
//   skip        a recycling bin in front of it that fills with the removed lines, balled up
//   planner     the room's wall planner: sticky notes in TO DO, DOING and DONE, a colour per session
//   shredder, tickets, bell: furniture bodies (the shredder's slot and pile are the rig's)
import { Graphics } from "pixi.js";
import { GREEN, INK, RED, SHADOW, SUN, line, noise } from "../../scene/office/paper";
import { rotRect } from "../../scene/rig/theme";
import { mix } from "../../scene/office/light";
import { KITCHEN_WALL } from "../../scene/world/propspots";
import type { Who } from "../../scene/contract";
import { type Area, type Band, DESK_TOP, type Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import type { FurnitureKind, SceneLight, SceneTheme } from "../../scene/theme/types";
import { OFFICE_WORDS } from "./words";
import { BLOOMS, LAWN, ROOM_COLOURS, SLAB, STONE } from "./palette";
import { hallway, room } from "./room";
import { desk, drawers, inTray, mugPile, plannerOf, screen, skip, station, testLamp } from "./desk";

/** A project room's rug under its desks: a step deeper than its floor, never near a body colour,
 * edged in the wall's colour so the room reads as its project's from the whole-office stop. */
function rugOf(a: Area): { fill: number; edge: number } | undefined {
	if (a.kind !== "project") return undefined;
	const [wall, floor] = ROOM_COLOURS[a.hue % ROOM_COLOURS.length]!;
	return { fill: mix(floor, wall, 0.35), edge: mix(wall, INK, 0.12) };
}

/** Who keeps an empty office company. */
export const NIGHT_WATCH: Who = { key: "night-watch", kind: "lead", role: "lead", mood: "idle", size: 72, tint: "night-watch" };

/** A gap in the footprint as a small paved patio: pale stone flags, a bench, planters in the
 * corners; whatever its size, with as much as fits. Drawn in world coordinates, baked. */
function patio(g: Graphics, r: Rect, _band: Band): void {
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
	if (wide) things.push([p.y + p.h * 0.4, () => parasol(g, p.x + p.w * 0.3, p.y + p.h * 0.4)]); else if (!corner) things.push([p.y + p.h - 6, () => planter(g, p.x + p.w / 2, p.y + p.h - 6, 0)]);
	for (const [, draw] of things.sort((a, b) => a[0] - b[0])) draw();
}

/** A wooden planter box with a round shrub and a few flowers, its base's centre at (x, y). */
function planter(g: Graphics, x: number, y: number, k: number): void {
	g.setTransform(1.25, 0, 0, 1.25, x - x * 1.25, y - y * 1.25);
	g.ellipse(x + 3, y + 1, 21, 5).fill(SHADOW);
	g.circle(x - 9, y - 26, 11).circle(x + 8, y - 28, 12).circle(x, y - 36, 11).fill(INK);
	g.circle(x - 9, y - 26, 9.5).circle(x + 8, y - 28, 10.5).circle(x, y - 36, 9.5).fill(k % 2 ? 0x47c97f : 0x3fb874);
	g.circle(x - 4, y - 36, 3.4).fill({ color: 0xffffff, alpha: 0.22 });
	for (let i = 0; i < 4; i++) g.circle(x - 10 + i * 7, y - 30 - (i % 2) * 7, 2.4).fill(BLOOMS[(k + i) % BLOOMS.length]!).stroke({ width: 1, color: INK });
	g.roundRect(x - 17, y - 20, 34, 20, 3).fill(0xd9a066).stroke(line(2.5));
	g.moveTo(x - 17, y - 13).lineTo(x + 17, y - 13).stroke({ width: 1.2, color: INK, alpha: 0.4 });
	g.setTransform(1, 0, 0, 1, 0, 0);
}

/** A round café table under a striped parasol, a chair either side, its foot's centre at (x, y). */
function parasol(g: Graphics, x: number, y: number): void {
	g.ellipse(x + 5, y + 2, 34, 7).fill(SHADOW);
	for (const side of [-1, 1]) {
		const cx = x + side * 26;
		g.roundRect(cx - 8, y - 30, 16, 14, 4).fill(0x8fc8ff).stroke(line(2));
		g.rect(cx - 7, y - 16, 3, 16).rect(cx + 4, y - 16, 3, 16).fill(SLAB);
	}
	g.rect(x - 1.5, y - 74, 3, 74).fill(SLAB);
	g.ellipse(x, y - 24, 17, 5).fill(0xffffff).stroke(line(2.2));
	g.moveTo(x - 36, y - 66).quadraticCurveTo(x, y - 98, x + 36, y - 66).closePath().fill(0xffffff).stroke(line(2.5));
	g.moveTo(x - 12, y - 66).quadraticCurveTo(x - 6, y - 90, x, y - 82).quadraticCurveTo(x + 6, y - 90, x + 12, y - 66).closePath().fill(0xff8fa3);
	g.moveTo(x - 36, y - 66).quadraticCurveTo(x, y - 98, x + 36, y - 66).stroke(line(2.5));
}

/** A park bench seen from the front: slatted back and seat on dark iron legs, centred at (x, y). */
function bench(g: Graphics, x: number, y: number, w: number): void {
	g.ellipse(x + 4, y + 1, w / 2 + 2, 6).fill(SHADOW);
	g.roundRect(x - w / 2 + 6, y - 30, 5, 30, 2).roundRect(x + w / 2 - 11, y - 30, 5, 30, 2).fill(SLAB);
	g.roundRect(x - w / 2, y - 40, w, 8, 3).roundRect(x - w / 2, y - 29, w, 8, 3).fill(0xc98a55).stroke(line(2));
	g.roundRect(x - w / 2 - 3, y - 17, w + 6, 8, 3).fill(0xd9a066).stroke(line(2.2));
}

function drawFurniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	switch (kind) {
		case "desk":
			cubicleWall(g);
			desk(g, 0xe9bd80, 0xf7dcb0, 150, DESK_TOP);
			break;
		case "table":
			desk(g, 0xffffff, 0xf1f3fa, 180);
			g.roundRect(-60, -82, 22, 14, 3).fill(0xffffff).stroke(line(3)); // a sheet that says no
			g.rect(40, -86, 15, 15).fill(0xffffff).stroke(line(3)); // a cup
			break;
		case "counter":
			desk(g, 0xffffff, 0xf1f3fa, 130);
			// The coffee machine: a dark box with two lights and a cup (propspots.ts KITCHEN_WALL).
			g.roundRect(KITCHEN_WALL.machine.x0, KITCHEN_WALL.machine.top, KITCHEN_WALL.machine.x1 - KITCHEN_WALL.machine.x0, 52, 8).fill(INK);
			g.circle(-45, -114, 4).fill(RED).circle(-31, -114, 4).fill(GREEN);
			g.roundRect(-47, -96, 22, 18, 4).fill(0x8a5a3c).stroke({ width: 3, color: 0xffffff });
			g.rect(6, -88, 15, 15).fill(0xffffff).stroke(line(3)).rect(28, -88, 15, 15).fill(0xffffff).stroke(line(3));
			break;
		case "chair":
			g.roundRect(-25, -62, 50, 62, 14).fill(0x5a6596).stroke(line(4));
			break;
		case "plant":
			ficus(g);
			break;
		case "lamp":
			g.rect(-2.5, -96, 5, 96).fill(INK);
			g.roundRect(-14, -4, 28, 6, 3).fill(INK);
			g.circle(0, -104, 16).fill(GREEN).stroke(line(4));
			break;
		case "cooler":
			waterCooler(g);
			break;
		case "fridge":
			g.rect(-38, -144, 84, 150).fill(SHADOW);
			g.roundRect(-42, -150, 84, 150, 12).fill(0xffffff).stroke(line(4));
			g.moveTo(-42, -95).lineTo(42, -95).stroke(line(4));
			g.roundRect(-33, -134, 6, 24, 3).roundRect(-33, -82, 6, 24, 3).fill(INK);
			g.rect(-10, -78, 36, 36).fill(SUN).stroke(line(3)); // the note on the fridge
			g.rect(-4, -68, 24, 3).rect(-4, -58, 18, 3).fill(INK);
			break;
		case "sofa":
			g.roundRect(-69, -82, 138, 50, 18).fill(0xff6f8f).stroke(line(4));
			g.roundRect(-75, -46, 150, 46, 14).fill(0xff8fa3).stroke(line(4));
			break;
		case "cabinet":
			g.roundRect(-33, -104, 66, 104, 6).fill(0xc9d2ea).stroke(line(4));
			g.rect(-33, -70, 66, 3).rect(-33, -36, 66, 3).fill(INK);
			g.roundRect(-8, -94, 16, 5, 2).roundRect(-8, -60, 16, 5, 2).roundRect(-8, -26, 16, 5, 2).fill(INK);
			break;
		case "pod":
			g.roundRect(-75, -66, 150, 66, 33).fill(0xdfe4f2).stroke(line(4));
			g.circle(-36, -33, 21).fill(SLAB).stroke(line(3));
			g.roundRect(4, -40, 54, 6, 3).roundRect(4, -26, 40, 6, 3).fill({ color: INK, alpha: 0.6 });
			break;
		case "screen-lit":
			// A deep slate face, not a slab of ink: the lead is the darkest thing at its desk.
			screen(g, 0x39446e);
			g.rect(-17, -46, 17, 3.5).rect(-17, -39, 17, 3.5).rect(-8, -32, 9, 3).fill(0x5dffa0);
			break;
		case "screen-off":
			screen(g, 0xaab2cc);
			break;
		case "shredder":
		case "tickets":
		case "bell":
			drawPropFurniture(g, kind);
			break;
		default:
			station(g, kind);
	}
	return g;
}

/** The cubicle wall at the desk's right end: a fabric partition with an aluminium cap, a family
 * photo and a postcard pinned to it, and a sticky note. Behind the desk's drawers and lamp. */
function cubicleWall(g: Graphics): void {
	const x = 90;
	g.rect(x + 4, -116 + 5, 16, 80).fill(SHADOW);
	g.roundRect(x, -116, 16, 80, 2).fill(0x9aa7c7).stroke(line(3));
	for (let y = -108; y < -40; y += 6) g.moveTo(x + 3, y).lineTo(x + 13, y + 1);
	g.stroke({ width: 1, color: 0x8794b6 });
	g.roundRect(x - 1, -119, 18, 5, 2).fill(0xdfe4ef).stroke({ width: 2, color: INK });
	// The family photo: two grown-ups and a small one, under a pin.
	g.rect(x + 2.5, -106, 11, 9).fill(0xffffff).stroke({ width: 1.2, color: INK });
	g.rect(x + 3.5, -105, 9, 7).fill(0xbfe6ff);
	for (const [cx, r] of [[5.6, 1.4], [8, 1], [10.4, 1.4]] as const) g.circle(x + cx, -101.5, r).fill(INK);
	g.circle(x + 8, -106.5, 1).fill(RED);
	// A postcard of a beach, askew, and a sticky note.
	g.poly(rotRect(x + 8, -88, 11, 8, 0.15)).fill(0xffe9b0).stroke({ width: 1.1, color: INK });
	g.rect(x + 3, -76, 9, 9).fill(SUN).stroke({ width: 1, color: INK });
}

/** The office ficus: a slim trunk, a crown of small leaves, a terracotta pot. */
function ficus(g: Graphics): void {
	g.moveTo(-17, -30).lineTo(17, -30).lineTo(14, 0).lineTo(-14, 0).closePath().fill(0xe07a4f).stroke(line(4));
	g.moveTo(0, -30).bezierCurveTo(-4, -50, 6, -60, 0, -84).stroke({ width: 4, color: 0x8a5a3c, cap: "round" });
	g.moveTo(0, -60).lineTo(10, -70).stroke({ width: 2.6, color: 0x8a5a3c, cap: "round" });
	const leaves: [number, number, number][] = [
		[-14, -86, -0.6], [-4, -96, 0.2], [8, -92, 0.7], [16, -80, 1.1], [-18, -72, -1], [-8, -78, -0.3],
		[4, -80, 0.4], [12, -68, 0.9], [-12, -62, -0.8], [0, -70, 0], [-2, -104, 0.1], [12, -100, 0.6], [-14, -98, -0.5],
	];
	leaves.forEach(([lx, ly, a], i) => {
		const pts: number[] = [];
		for (let k = 0; k < 10; k++) {
			const t = (k / 10) * Math.PI * 2;
			// A leaf: round at the stalk, pointed at the tip.
			const r = 7.5 * (1 - 0.35 * Math.max(0, -Math.sin(t)));
			const px = Math.cos(t) * 4.6;
			const py = Math.sin(t) * r;
			pts.push(lx + px * Math.cos(a) - py * Math.sin(a), ly + px * Math.sin(a) + py * Math.cos(a));
		}
		g.poly(pts).fill(i % 3 ? 0x2fb36b : 0x47c97f).stroke({ width: 2.2, color: INK, join: "round" });
	});
}

/** The water cooler: the big blue bottle, the taps, and a paper-cone dispenser on its side. */
function waterCooler(g: Graphics): void {
	g.roundRect(-21, -66, 42, 66, 6).fill(0xffffff).stroke(line(4));
	g.circle(-8, -52, 3.6).fill(RED).stroke({ width: 1.5, color: INK });
	g.circle(6, -52, 3.6).fill(0x3d7dff).stroke({ width: 1.5, color: INK });
	g.roundRect(-12, -40, 24, 4, 2).fill(0xc5cbe0);
	g.roundRect(-17, -108, 34, 44, 12).fill(0x9be3ff).stroke(line(4));
	g.roundRect(-11, -102, 8, 28, 4).fill({ color: 0xffffff, alpha: 0.5 });
	// The cone dispenser: a tube on the cooler's side, cones peeking out of the bottom.
	g.roundRect(22, -84, 9, 34, 3).fill(0xdfe4ef).stroke(line(3));
	g.poly([22.5, -50, 30.5, -50, 26.5, -40]).fill(0xffffff).stroke({ width: 1.6, color: INK, join: "round" });
	g.poly([22.5, -52, 30.5, -52, 26.5, -43]).stroke({ width: 1.2, color: INK, alpha: 0.5 });
}

function drawPropFurniture(g: Graphics, kind: "shredder" | "tickets" | "bell"): void {
	switch (kind) {
		case "shredder": {
			// A narrow shredder's bin against the right wall, its top just under the working point
			// (-10, -40: world.ts SHREDDER): the rig draws the slot and the pile there, its user on
			// the left facing it. A window shows the shreds piling up.
			g.rect(-14, -38 + 5, 32, 38).fill(SHADOW);
			g.roundRect(-18, -38, 32, 38, 5).fill(0x9aa3bd).stroke(line(4));
			g.roundRect(-12, -26, 20, 18, 3).fill(0xdfe4f2).stroke({ width: 2, color: INK });
			for (let i = 0; i < 3; i++) g.moveTo(-8 + i * 6, -24 + (i % 2) * 3).lineTo(-8 + i * 6, -10);
			g.stroke({ width: 1.5, color: INK, alpha: 0.5 });
			break;
		}
		case "tickets": {
			// The ticket machine on its post, a ticket sticking out.
			g.roundRect(-10, -4, 20, 4, 2).fill(INK);
			g.rect(-2.5, -52, 5, 50).fill(INK);
			g.roundRect(-15, -78, 30, 28, 6).fill(RED).stroke(line(3));
			g.roundRect(-8, -71, 16, 9, 2).fill(0xffffff).stroke({ width: 1.5, color: INK });
			g.rect(-5, -52, 10, 8).fill(0xffffff).stroke({ width: 1.5, color: INK });
			break;
		}
		case "bell": {
			// The counter by your door, centred under the bell's plunger (rigpoints.ts: its top 31 px
			// up, the plunger's top 42 for a lead), with the bell resting on it. While the bell rings
			// the rig draws it, exactly over this one.
			g.rect(-14, -31 + 5, 32, 31).fill(SHADOW);
			g.rect(-14, -27, 4, 27).rect(10, -27, 4, 27).fill(INK);
			g.roundRect(-18, -31, 36, 7, 3).fill(0xf0c48a).stroke(line(3));
			g.moveTo(-6, -31).arc(0, -31, 6, Math.PI, 0).closePath().fill(SUN).stroke(line(2));
			g.rect(-1, -41, 2, 4).fill(INK);
			g.circle(0, -41.5, 1.8).fill(INK);
			break;
		}
	}
}

// --- The crew build -------------------------------------------------------------------------------

/** The crew build in the office: a teetering stack of reams of copy paper and ring binders (the
 * reams the builders carry), and a sticky-note flag on a pencil once the PR is up. */
const SPINES = [0x3d7dff, 0xff6b6b, 0x2fcf83, 0x8c5cff];
const BANDS = [0x3d7dff, 0xff8a1f, 0x2fcf83];

const BINDERS = {
	piece: (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		// `k` steps by 3 a piece (build.ts), so the piece's own number is k / 3.
		const n = Math.floor(k / 3);
		const kind = (n + Math.floor(n / 3)) % 3;
		if (kind === 1) {
			// A binder on its side, spine out: a label window and a finger hole.
			g.roundRect(x, y, w, h, 1.5).fill(SPINES[n % SPINES.length]!).stroke({ width: 1.5, color: INK });
			g.rect(x + 2, y + 2, w * 0.5, h - 5).fill(0xffffff);
			g.circle(x + w - 3, y + h / 2, 1.2).fill(0xffffff);
		} else {
			// A ream in its wrapper, a coloured band round the middle.
			g.roundRect(x, y, w, h, 1.5).fill(0xffffff).stroke({ width: 1.5, color: INK });
			g.rect(x + 0.8, y + h * 0.36, w - 1.6, h * 0.3).fill(BANDS[(n + kind) % BANDS.length]!);
		}
	},
	flag: (f: Graphics, top: { x: number; y: number }) => {
		f.moveTo(top.x, top.y).lineTo(top.x, top.y - 22).stroke({ width: 3.4, color: INK });
		f.moveTo(top.x, top.y - 1).lineTo(top.x, top.y - 21).stroke({ width: 1.6, color: 0xffc93c });
		f.circle(top.x, top.y - 23, 1.8).fill(0xff9eb1).stroke({ width: 1, color: INK });
		f.rect(top.x, top.y - 21, 13, 11).fill(SUN).stroke({ width: 1.5, color: INK });
		f.moveTo(top.x + 3, top.y - 17).lineTo(top.x + 5, top.y - 14).lineTo(top.x + 10, top.y - 19).stroke({ width: 1.4, color: GREEN });
	},
};

/** The office's light (office/light.ts): warm desk lamps and round ceiling pools, a city skyline,
 * the lawn with trees; night after design/boards/PaperNight. */
const OFFICE_LIGHT: SceneLight = {
	ambient: { morning: 0xe9e6f5, noon: 0xffffff, afternoon: 0xfbeedb, dusk: 0xb4a9c9, night: 0x464f80 },
	hall: { morning: 0xeeecf7, noon: 0xffffff, afternoon: 0xfdf2e2, dusk: 0xc6bdd6, night: 0x8b92bd },
	outside: { morning: 0xf2f0ff, noon: 0xffffff, afternoon: 0xffeed6, dusk: 0xa9a0c8, night: 0x35406e },
	lamp: 0xfff1d2,
	glow: 0xffc867,
	overhead: "pools",
	vacant: 0.72,
	sun: 0xfff0c4,
	sky: {
		morning: [0xbfe1ff, 0xffe3c8],
		noon: [0x8fd0ff, 0xd3f0ff],
		afternoon: [0xa8cdf2, 0xffcf8f],
		dusk: [0x564a8e, 0xff9a78],
		night: [0x141a36, 0x29356a],
	},
	skyline: {
		morning: [0xc4d0e6, 0x9cb0d0],
		noon: [0xc6d6ea, 0x9fb7d8],
		afternoon: [0xd9bfae, 0xb4978f],
		dusk: [0x6d5a8f, 0x463a6a],
		night: [0x2a3360, 0x1d2548],
	},
	window: { inset: 5, panes: 2, transom: false, bar: 5 },
	floors: { project: "carpet", vacant: "carpet", meeting: "carpet", lobby: "planks", yours: "planks" },
	cluster: "rug",
	decal: { size: 34, colour: INK, stencil: false },
	yard: "trees",
};

export const OFFICE_THEME: SceneTheme = {
	id: "office",
	words: OFFICE_WORDS,
	lawn: LAWN,
	slab: SLAB,
	room,
	hallway,
	furniture: drawFurniture,
	desk: { tray: inTray, mugs: mugPile, lamp: testLamp, drawers, skip },
	planner: (r, rows) => plannerOf(r, rows),
	rug: rugOf,
	patio,
	crewBuild: (b, seed) => crewBuild(b, seed, BINDERS),
	nightWatch: NIGHT_WATCH,
	arms: false,
	light: OFFICE_LIGHT,
};

// --- Staging (world/staging.ts) ----------------------------------------------------------------

/** The office keeps its desks and its corridor; what moves on its own is the steam off the coffee,
 * the kitchen's ceiling fan and the copier's light (office/ambient.ts). */
OFFICE_THEME.staging = { bay: "desks", hall: "corridor", ambient: ["steam", "fan", "printer", "flicker"] };
