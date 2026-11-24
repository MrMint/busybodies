// The office's furniture, drawn by kind: cubicle walls, the ficus, the water cooler, shelves of
// binders. Split out of scene.ts.
import { Graphics } from "pixi.js";
import { GREEN, INK, RED, SHADOW, SUN, line } from "../../scene/office/paper";
import { rotRect } from "../../scene/rig/theme";
import { KITCHEN_WALL } from "../../scene/world/propspots";
import { DESK_TOP } from "../../scene/world/world";
import type { FurnitureKind } from "../../scene/theme/types";
import { SLAB } from "./palette";
import { desk, screen, station } from "./desk";

export function drawFurniture(kind: FurnitureKind): Graphics {
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

export const BINDERS = {
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
