// The office theme: the original look (design/boards/FloorBusy), cut paper with pastel rooms. Every
// painter here draws once per change into a Graphics or Container, never per frame; furniture is
// drawn around its base point (0, 0), the bottom centre where it meets the floor. Desk props are
// drawn around the desk front's centre (office/propspots.ts PROPS says where each goes): the desk
// top is y -70 to -38, the lead stands behind it at x -26, the crew build is on its left end.
//
//   inTray      the context pile in front of the lead: a few sheets to buried to the eyebrows
//   mugPile     a mug per cup of coffee, stacked
//   testLamp    a little lamp on the desk's right end, red or green from the last test
//   drawers     a filing cabinet beside the desk, a drawer per ~10 files, the full ones bulging
//   skip        a skip in front of it that fills with the removed lines
//   planner     the room's wall planner: sticky notes in TO DO, DOING and DONE, a colour per session
//   shredder, tickets, bell: furniture bodies (the shredder's slot and pile are the rig's)
import { Container, Graphics } from "pixi.js";
import type { Lamp, PlannerRow, Tray } from "../director/metrics";
import { GREEN, INK, RED, SHADOW, SUN, batched, hash, label, line, signboard, wob } from "../office/paper";
import { PROPS } from "../office/propspots";
import type { Who } from "../office/slot";
import type { Area, Rect } from "../office/world";
import { crewBuild } from "./build";
import type { FurnitureKind, SceneTheme } from "./types";
import { OFFICE_WORDS, type SignText } from "./words";

export const LAWN = 0xbfe8c6;
export const SLAB = 0x46536f;
export const HALL_FLOOR = 0xf3efe2;

/** Wall and floor colours. Projects take them in the order their rooms were built. */
export const ROOM_COLOURS: [number, number][] = [
	[0xffe9cf, 0xffc47f], // orange
	[0xdeecff, 0xa6d0ff], // blue
	[0xdff7ec, 0xa5e6c9], // green
	[0xffe6f0, 0xffbdd6], // pink
	[0xeee7ff, 0xd2c0ff], // lilac
	[0xfff6c9, 0xffe08a], // yellow
	[0xe3f7ff, 0x9fdcf5], // cyan
];
export const COMMON_COLOURS = {
	meeting: [0xf1f3fa, 0xcfd6ea],
	lobby: [0xf6f1e4, 0xe8dfc8],
	yours: [0xfff1e0, 0xe9d6c0],
	kitchen: [0xf6f1e4, 0xffffff],
	vacant: [0xeef0f4, 0xd9dde6],
} as const;

/** Who keeps an empty office company. */
export const NIGHT_WATCH: Who = { key: "night-watch", kind: "lead", role: "lead", mood: "idle", size: 72, tint: "night-watch" };

// --- Rooms ------------------------------------------------------------------------------------

/** A room's shell: back wall, floor, side walls and frame. */
function roomShell(g: Graphics, r: Rect, floorY: number, wall: number, floor: number, checker = false): void {
	const { x, y, w, h } = r;
	g.roundRect(x, y, w, h, 10).fill(wall);
	g.rect(x, floorY, w, y + h - floorY).fill(floor);
	if (checker) {
		const s = 56;
		for (let cy = floorY, j = 0; cy < y + h; cy += s, j++) {
			for (let cx = x, i = 0; cx < x + w; cx += s, i++) {
				if ((i + j) % 2) g.rect(cx, cy, Math.min(s, x + w - cx), Math.min(s, y + h - cy));
			}
		}
		g.fill(0xdfe5f3);
	}
	// A soft band where the wall meets the floor, then the skirting line.
	g.rect(x, floorY, w, 10).fill({ color: INK, alpha: 0.07 });
	g.moveTo(x, floorY).lineTo(x + w, floorY).stroke(line(4));
	// Side walls: narrow strips with an inner edge, for a little depth.
	const sideTop = y + 100;
	g.rect(x, sideTop, 13, y + h - sideTop).fill(wall).moveTo(x + 13, sideTop).lineTo(x + 13, y + h).stroke(line(4));
	g.rect(x + w - 13, sideTop, 13, y + h - sideTop).fill(wall).moveTo(x + w - 13, sideTop).lineTo(x + w - 13, y + h).stroke(line(4));
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 10).stroke(line(5));
}

function hallway(g: Graphics, r: Rect): void {
	g.rect(r.x, r.y, r.w, r.h).fill(HALL_FLOOR);
	for (let x = r.x + 118; x < r.x + r.w; x += 122) g.rect(x, r.y, 4, r.h);
	g.fill({ color: INK, alpha: 0.1 });
	g.moveTo(r.x, r.y + 2.5).lineTo(r.x + r.w, r.y + 2.5).moveTo(r.x, r.y + r.h - 2.5).lineTo(r.x + r.w, r.y + r.h - 2.5).stroke(line(5));
}

// --- Wall items -------------------------------------------------------------------------------

function windowPane(g: Graphics, { x, y, w, h }: Rect, seed: number): void {
	g.roundRect(x, y, w, h, 10).fill(0xbfe6ff);
	const cx = x + w * (0.12 + (seed % 5) * 0.05);
	const cy = y + h * 0.3;
	g.roundRect(cx, cy, 34, 16, 8).roundRect(cx + 20, cy + 9, 30, 12, 6).fill(0xffffff);
	g.rect(x + w / 2 - 2.5, y, 5, h).fill(INK);
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 9).stroke(line(5));
}

function door(g: Graphics, { x, y, w, h }: Rect): void {
	const r = w / 2;
	g.moveTo(x, y + h).lineTo(x, y + r).arc(x + r, y + r, r, Math.PI, 0).lineTo(x + w, y + h).closePath().fill(SLAB).stroke(line(5));
	g.circle(x + w - 12, y + h * 0.52, 4.5).fill(SUN);
}


/** A room: its shell in its colours, then its wall items (the planner has its own layer). */
function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [wall, floor] =
		a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON_COLOURS[a.kind as keyof typeof COMMON_COLOURS];
	roomShell(g, a.rect, a.floorY, wall, floor, a.kind === "kitchen");
	const seed = hash(a.id);
	for (const [i, w] of a.wall.entries()) {
		if (w.kind === "window") windowPane(g, w.rect, seed + i);
		else if (w.kind === "door") door(g, w.rect);
		else if (w.kind === "you") c.addChild(yourDoor(g, w.rect));
		else if (w.kind !== "planner") c.addChild(signboard(w.kind, w.rect, w.slot ? sign(w.slot) : undefined, seed + i));
	}
}

// --- Desk props ---------------------------------------------------------------------------------

const PAPER = 0xffffff;
const PAPER_EDGE = 0xdfe4f2;

/** The in-tray: a wire tray and its pile, sheets off it past 80%, empty while the lead has it out.
 * While the lead plays `buried` the rig draws the tray and pile (and the sheets going), so the
 * office draws nothing, or there would be two. */
function inTray(t: Tray, seed: string): Graphics {
	const g = batched();
	if (t.rig) return g;
	const { x, y, w, sheet } = PROPS.tray;
	const s = hash(seed);
	// The tray.
	g.roundRect(x - 2, y - 4, w + 4, 6, 2).fill(0xc5cbe0).stroke(line(2));
	if (t.out) return g;
	// The pile: each sheet a little off the last; past 95% it leans like it means it.
	const lean = t.buried ? 0.35 : t.spill ? 0.15 : 0;
	for (let i = 0; i < t.sheets; i++) {
		const sx = x + 1 + wob(s, i) * 1.4 + lean * i;
		const sy = y - 4 - (i + 1) * sheet;
		g.rect(sx, sy, w - 2, sheet).fill(i % 3 === 2 ? PAPER_EDGE : PAPER);
	}
	if (t.sheets > 0) {
		// An outline round the stack, so it reads as one pile.
		const top = y - 4 - t.sheets * sheet;
		g.poly([x + 1, y - 4, x + w - 1, y - 4, x + w - 1 + lean * t.sheets, top, x + 1 + lean * t.sheets, top]).stroke(line(1.6));
		for (let i = 3; i < t.sheets; i += 3) g.moveTo(x + 2 + lean * i, y - 4 - i * sheet).lineTo(x + w - 2 + lean * i, y - 4 - i * sheet);
		g.stroke({ width: 1, color: INK, alpha: 0.35 });
	}
	// Sheets slid off: onto the desk, then over the edge onto the floor.
	const off: [number, number, number][] = [
		[x + w + 4, y - 3, 0.35],
		[x + w - 8, -30, -0.5],
		[x - 4, 10, 0.25],
	];
	for (const [ox, oy, r] of off.slice(0, t.spill)) {
		const c = Math.cos(r);
		const sn = Math.sin(r);
		const pts = [-8, -5, 8, -5, 8, 5, -8, 5];
		const rot: number[] = [];
		for (let i = 0; i < pts.length; i += 2) rot.push(ox + pts[i]! * c - pts[i + 1]! * sn, oy + pts[i]! * sn + pts[i + 1]! * c);
		g.poly(rot).fill(PAPER).stroke(line(1.5));
	}
	return g;
}

/** Mugs stacked on the desk: three, two, one. */
function mugPile(n: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.mugs;
	const rows = [3, 2, 1];
	let k = 0;
	for (let r = 0; r < rows.length && k < n; r++) {
		for (let i = 0; i < rows[r]! && k < n; i++, k++) {
			const mx = x + (i + r * 0.5) * (w + 1);
			const my = y - (r + 1) * h;
			g.roundRect(mx, my, w, h, 1.5).fill(k % 2 ? 0xffffff : 0xffd0e4).stroke(line(1.4));
			g.moveTo(mx + w, my + 1.5).arc(mx + w, my + h / 2, h / 2 - 1.5, -Math.PI / 2, Math.PI / 2).stroke(line(1.2));
		}
	}
	return g;
}

/** The test lamp: a small desk lamp, its shade lit red or green. */
function testLamp(lamp: Lamp): Graphics {
	const { x, y } = PROPS.lamp;
	const colour = lamp === "red" ? RED : GREEN;
	const g = batched();
	g.roundRect(x - 5, y + 10, 10, 3, 1.5).fill(INK);
	g.rect(x - 1, y - 2, 2, 12).fill(INK);
	g.circle(x, y - 6, 9).fill({ color: colour, alpha: 0.25 });
	g.circle(x, y - 6, 5).fill(colour).stroke(line(1.6));
	return g;
}

/** A filing cabinet beside the desk: a drawer per ~10 files; the full ones bulge open with folders. */
function drawers(n: number, full: number): Graphics {
	const g = batched();
	const { x, w, h } = PROPS.drawers;
	const top = -(n * h + 4);
	g.rect(x + 3, top + 3, w, -top).fill(SHADOW);
	g.roundRect(x, top, w, -top, 3).fill(0xc9d2ea).stroke(line(2));
	for (let i = 0; i < n; i++) {
		const dy = top + 2 + i * h;
		// Full drawers are the bottom ones: they fill first.
		const bulge = n - 1 - i < full;
		const dx = bulge ? -4 : 0;
		if (bulge) {
			for (let f = 0; f < 3; f++) g.rect(x + dx + 3 + f * 5, dy - 3 + (f % 2), 4, 5).fill([SUN, 0x9be3ff, 0xffbdd6][f]!).stroke({ width: 1, color: INK });
		}
		g.roundRect(x + dx + 1, dy, w - 2, h - 2, 2).fill(0xdfe4f2).stroke(line(1.5));
		g.roundRect(x + dx + w / 2 - 3, dy + h / 2 - 2, 6, 2, 1).fill(INK);
	}
	return g;
}

/** A skip on the floor in front of the cabinet, filled 0 to 5 loads with removed lines. */
function skip(load: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.skip;
	if (load > 0) {
		// Rubble: crumpled lines heaped over the rim as the loads go in.
		const heap = Math.min(5, load);
		for (let i = 0; i < heap * 2; i++) {
			const bx = x + 3 + ((i * 7) % (w - 8));
			const by = y - h + 2 - Math.floor(i / 2) * 2.2 + (i % 2);
			g.roundRect(bx, by, 6, 4, 2).fill(i % 2 ? 0xf1f3fa : 0xc5cbe0).stroke({ width: 1, color: INK });
		}
	}
	g.poly([x, y - h, x + w, y - h, x + w - 4, y, x + 4, y]).fill(SUN).stroke(line(2));
	g.moveTo(x + 6, y - h / 2).lineTo(x + w - 6, y - h / 2).stroke({ width: 1.5, color: INK, alpha: 0.4 });
	return g;
}

// --- The planner -------------------------------------------------------------------------------

const NOTE_COLOURS = [SUN, 0xffbdd6, 0x9be3ff, 0xa5e6c9, 0xd2c0ff, 0xffc47f];

/** The room's planner on its back wall: a board in three columns of sticky notes, a colour per
 * session, as many as fit and a "+n" for the rest. Another theme takes it with its own board
 * colour, column words and dressing. */
export function plannerOf(r: Rect, rows: PlannerRow[], board = 0xf7e7c6, columns: readonly string[] = OFFICE_WORDS.columns, dress?: (g: Graphics, r: Rect) => void): Container {
	const c = new Container();
	const g = batched();
	c.addChild(g);
	g.roundRect(r.x, r.y, r.w, r.h, 8).fill(board).stroke(line(5));
	dress?.(g, r);
	const colW = (r.w - 12) / 3;
	const note = 9;
	const gap = 2;
	const perRow = Math.max(1, Math.floor((colW - 2) / (note + gap)));
	const head = 17;
	const fit = perRow * Math.floor((r.h - head - 6) / (note + gap));
	for (let k = 0; k < 3; k++) {
		const cx = r.x + 6 + k * colW;
		if (k > 0) g.moveTo(cx, r.y + 6).lineTo(cx, r.y + r.h - 6).stroke({ width: 1.5, color: INK, alpha: 0.3 });
		const t = label(columns[k]!, 6.5, "800");
		t.position.set(cx + (colW - t.width) / 2, r.y + 5);
		c.addChild(t);
		const notes = rows.flatMap((row) => Array.from({ length: [row.pending, row.active, row.done][k]! }, () => NOTE_COLOURS[hash(row.session) % NOTE_COLOURS.length]!));
		notes.slice(0, notes.length > fit ? fit - 1 : fit).forEach((colour, i) => {
			const nx = cx + 2 + (i % perRow) * (note + gap);
			const ny = r.y + head + Math.floor(i / perRow) * (note + gap);
			g.rect(nx, ny, note, note).fill(colour).stroke({ width: 1, color: INK });
		});
		if (notes.length > fit) {
			const more = label(`+${notes.length - fit + 1}`, 6.5, "800");
			more.position.set(cx + colW - more.width - 2, r.y + r.h - more.height - 3);
			c.addChild(more);
		}
	}
	return c;
}

// --- Your office -------------------------------------------------------------------------------

/** Your door: a door with YOU on it. */
function yourDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	const r = w / 2;
	g.moveTo(x, y + h).lineTo(x, y + r).arc(x + r, y + r, r, Math.PI, 0).lineTo(x + w, y + h).closePath().fill(0x8a5a3c).stroke(line(5));
	g.circle(x + w - 12, y + h * 0.55, 4.5).fill(SUN);
	g.roundRect(x + 10, y + 24, w - 20, 20, 4).fill(0xffffff).stroke(line(3));
	const t = label(OFFICE_WORDS.door, 13, "800");
	t.position.set(x + w / 2 - t.width / 2, y + 26);
	return t;
}

// --- Furniture ------------------------------------------------------------------------------


/** A desk: the top surface behind, the front panel below. 150 wide, its front 44 tall. */
function desk(g: Graphics, front: number, top: number, w = 150): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, -70, w + 24, 32, 8).fill(top).stroke(line(4));
	g.roundRect(-w / 2, -44, w, 44, 5).fill(front).stroke(line(4));
}

function drawFurniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	switch (kind) {
		case "desk":
			desk(g, 0xe9bd80, 0xf7dcb0);
			break;
		case "table":
			desk(g, 0xffffff, 0xf1f3fa, 180);
			g.roundRect(-60, -82, 22, 14, 3).fill(0xffffff).stroke(line(3)); // a sheet that says no
			g.rect(40, -86, 15, 15).fill(0xffffff).stroke(line(3)); // a cup
			break;
		case "counter":
			desk(g, 0xffffff, 0xf1f3fa, 130);
			// The coffee machine: a dark box with two lights and a cup.
			g.roundRect(-58, -126, 44, 52, 8).fill(INK);
			g.circle(-45, -114, 4).fill(RED).circle(-31, -114, 4).fill(GREEN);
			g.roundRect(-47, -96, 22, 18, 4).fill(0x8a5a3c).stroke({ width: 3, color: 0xffffff });
			g.rect(6, -88, 15, 15).fill(0xffffff).stroke(line(3)).rect(28, -88, 15, 15).fill(0xffffff).stroke(line(3));
			break;
		case "chair":
			g.roundRect(-25, -62, 50, 62, 14).fill(0x5a6596).stroke(line(4));
			break;
		case "plant":
			g.ellipse(-12, -50, 13, 24).fill(GREEN).stroke(line(4));
			g.ellipse(12, -56, 13, 28).fill(GREEN).stroke(line(4));
			g.moveTo(-17, -30).lineTo(17, -30).lineTo(14, 0).lineTo(-14, 0).closePath().fill(0xe07a4f).stroke(line(4));
			break;
		case "lamp":
			g.rect(-2.5, -96, 5, 96).fill(INK);
			g.roundRect(-14, -4, 28, 6, 3).fill(INK);
			g.circle(0, -104, 16).fill(GREEN).stroke(line(4));
			break;
		case "cooler":
			g.roundRect(-21, -66, 42, 66, 6).fill(0xffffff).stroke(line(4));
			g.circle(-4, -52, 4).fill(RED);
			g.roundRect(-17, -108, 34, 44, 12).fill(0x9be3ff).stroke(line(4));
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
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 7).fill(INK).stroke(line(4));
			g.rect(-24, -36, 22, 4).rect(-24, -27, 22, 4).rect(-12, -18, 12, 3).fill(0x5dffa0);
			break;
		case "screen-off":
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 7).fill(0xaab2cc).stroke(line(4));
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

// Stations: shared equipment along a project room's left wall (world.ts STRIP). The office draws
// only each station's body, around its base, with its user standing to the right facing it; the rig
// draws the moving parts (the top drawer, the card tray, the copier's lid, button, light, jam door
// and out-tray, the ink pad and forms) at the working point, (+20, -40) from the base, in every frame.
// So each body's top surface is at that height, starting a few px past the point on the user's side
// and running back toward the wall, and nothing is drawn there that the rig draws.
const WOOD = 0xd9a066;
const WOOD_TOP = 0xf0c48a;
/** Body extents, from the base: left edge (toward the wall) and right edge (toward the user). */
const ST_L = -24;
const ST_R = 24;

function station(g: Graphics, kind: FurnitureKind): void {
	const w = ST_R - ST_L;
	switch (kind) {
		case "files": {
			// A filing cabinet a little taller than the point: the rig pulls its top drawer.
			g.rect(ST_L + 4, -47 + 5, w, 47).fill(SHADOW);
			g.roundRect(ST_L, -47, w, 47, 4).fill(0xc9d2ea).stroke(line(4));
			g.rect(ST_L, -31, w, 3).rect(ST_L, -15, w, 3).fill(INK);
			g.roundRect(-6, -24, 12, 4, 2).roundRect(-6, -8, 12, 4, 2).fill(INK);
			break;
		}
		case "catalogue": {
			// A card catalogue: a chest of little drawers on legs (the rig draws the open tray on top).
			g.rect(ST_L + 4, -42 + 5, w, 42).fill(SHADOW);
			g.rect(ST_L + 4, -10, 5, 10).rect(ST_R - 9, -10, 5, 10).fill(INK);
			g.roundRect(ST_L, -42, w, 34, 4).fill(WOOD).stroke(line(4));
			for (let r = 0; r < 2; r++)
				for (let c = 0; c < 3; c++) {
					const x = ST_L + 4 + c * 14;
					const y = -38 + r * 14;
					g.roundRect(x, y, 12, 11, 2).fill(WOOD_TOP).stroke({ width: 2, color: INK });
					g.circle(x + 6, y + 6, 1.6).fill(INK);
				}
			break;
		}
		case "copier": {
			// A copier's body: a pale box on a plinth with its paper drawer (lid, panel and trays: the rig).
			g.rect(ST_L + 4, -40 + 5, w, 40).fill(SHADOW);
			g.roundRect(ST_L, -40, w, 34, 5).fill(0xf1f3fa).stroke(line(4));
			g.roundRect(ST_L + 5, -20, w - 10, 9, 3).fill(0xdfe4f2).stroke({ width: 2, color: INK });
			g.roundRect(-5, -17, 10, 3, 1.5).fill(INK);
			g.roundRect(ST_L + 2, -7, w - 4, 7, 3).fill(SLAB);
			break;
		}
		case "stamps": {
			// The QA desk: a small table, its top just under the point (ink pad and forms: the rig).
			g.rect(ST_L + 4, -38 + 5, w, 38).fill(SHADOW);
			g.rect(ST_L + 4, -32, 5, 32).rect(ST_R - 9, -32, 5, 32).fill(INK);
			g.rect(ST_L + 6, -14, w - 12, 3).fill(INK);
			g.roundRect(ST_L - 2, -38, w + 4, 8, 3).fill(WOOD_TOP).stroke(line(4));
			break;
		}
		case "phone": {
			// The phone table: a slim stand with a shelf, and the phone's base toward the wall, where
			// the handset's cord goes (the receiver and the notepad at the working point: the rig).
			g.rect(ST_L + 8, -38 + 5, w - 8, 38).fill(SHADOW);
			g.roundRect(-5, -32, 10, 30, 3).fill(WOOD).stroke(line(3));
			g.roundRect(ST_L + 2, -4, w - 4, 6, 3).fill(WOOD).stroke(line(3));
			g.roundRect(ST_L - 2, -38, w + 4, 7, 3).fill(WOOD_TOP).stroke(line(4));
			g.roundRect(ST_L + 1, -50, 22, 13, 5).fill(0x3d4256).stroke(line(3));
			g.roundRect(ST_L + 5, -47, 14, 3, 1.5).fill(0x9aa3bd);
			break;
		}
		case "outbox": {
			// A mail cart: a canvas bin on a frame with wheels (the wire tray on top: the rig).
			g.rect(ST_L + 4, -40 + 5, w, 36).fill(SHADOW);
			g.roundRect(ST_L, -40, w, 30, 5).fill(0xb9c7e6).stroke(line(4));
			g.moveTo(ST_L + 6, -30).quadraticCurveTo(0, -22, ST_R - 6, -30).stroke({ width: 2, color: INK, alpha: 0.5 });
			g.rect(ST_L + 3, -10, 4, 6).rect(ST_R - 7, -10, 4, 6).fill(INK);
			g.circle(ST_L + 5, -3, 3.5).circle(ST_R - 5, -3, 3.5).fill(INK);
			break;
		}
	}
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

/** Brick colours for crew builds: the kraft the builders carry (the rig's brick), in a few
 * shades so the courses read as bricks. */
const BLOCKS = [0xe9bd80, 0xdca56a, 0xf0c994, 0xe3b074, 0xeec088];

const BRICKS = {
	piece: (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		g.roundRect(x, y, w, h, 2).fill(BLOCKS[k % BLOCKS.length]!).stroke({ width: 1.5, color: INK });
	},
	flag: (f: Graphics, top: { x: number; y: number }) => {
		f.moveTo(top.x, top.y).lineTo(top.x, top.y - 22).stroke({ width: 2.5, color: INK });
		f.moveTo(top.x, top.y - 22).lineTo(top.x + 15, top.y - 16).lineTo(top.x, top.y - 10).closePath().fill(0xff6b6b).stroke({ width: 1.5, color: INK });
	},
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
	crewBuild: (b, seed) => crewBuild(b, seed, BRICKS),
	nightWatch: NIGHT_WATCH,
	arms: false,
};
