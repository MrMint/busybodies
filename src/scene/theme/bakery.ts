// The Line: the same floor plan, cast and director, in a restaurant kitchen (plan-alive wave 3,
// stream H). Project rooms are stations on the line (white subway tile under a steel extraction
// hood, red quarry tiles underfoot); the hallway is the line itself, a rubber mat down the
// middle; the meeting room is the pass, where everything is tasted before it goes out; the
// kitchen is staff meal, with the walk-in's door; your office is the chef's table, where
// "Service!" waits on you. The planner is the ticket rail, the in-tray the mise tray, the crew
// build a layer cake. Stations are kitchen kit under the same slots, drawn as bodies only, their
// tops at the rig's working point (the rig draws what the hands work there: the press's lid, the
// lowboy's drawer, the tasting bowls, the pass). Still cut paper: flat shapes and the same ink.
import { Container, Graphics } from "pixi.js";
import type { Lamp, PlannerRow, Tray } from "../director/metrics";
import { GREEN, INK, RED, SHADOW, type SignStyle, batched, hash, label, line, signboard, wob } from "../office/paper";
import { PROPS } from "../office/propspots";
import type { Area, Rect } from "../office/world";
import { crewBuild } from "./build";
import { COMMON_COLOURS, NIGHT_WATCH, ROOM_COLOURS } from "./office";
import type { FurnitureKind, SceneLight, SceneTheme } from "./types";
import { BAKERY_WORDS, type SignText } from "./words";

const TILE = 0xf7f6f0;
const QUARRY = 0xc8664a;
const STEEL = 0xc3cadb;
const STEEL_LIGHT = 0xe1e5ee;
const STEEL_DARK = 0x6f7891;
const WOOD = 0xd9a066;
const BOARD = 0xe8c48e;
const COPPER = 0xd9824a;
const TOMATO = 0xff5a4a;
const BASIL = 0x3fae5a;
const CARROT = 0xff9a2e;
const ONION = 0xf4ecd8;
const HEAT = 0xffb347;
const TICKET = 0xfffdf4;
const MAT = 0x3a3f4c;

/** Mix two colours: `t` of the way from a to b. */
function mix(a: number, b: number, t: number): number {
	const ch = (c: number, s: number) => (c >> s) & 0xff;
	const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
	return m(16) | m(8) | m(0);
}

// --- Rooms ------------------------------------------------------------------------------------

/** A station's shell: subway tile up the back wall (the room's colour as a band of tiles at
 * shoulder height, so stations still tell apart), a steel hood along the top with its grease
 * filters, quarry tiles underfoot with a drain, the side walls and the frame. */
function shell(g: Graphics, a: Area, band: number, floor: number, hood = true): void {
	const { x, y, w, h } = a.rect;
	const floorY = a.floorY;
	g.roundRect(x, y, w, h, 10).fill(TILE);
	// The tiles: offset courses of 24 by 12, the grout a faint line.
	const tw = 24;
	const th = 12;
	for (let cy = y + 14; cy < floorY; cy += th) g.rect(x, cy, w, 1);
	for (let cy = y + 14, j = 0; cy < floorY; cy += th, j++) for (let cx = x + (j % 2 ? tw / 2 : 0); cx < x + w; cx += tw) g.rect(cx, cy, 1, Math.min(th, floorY - cy));
	g.fill({ color: INK, alpha: 0.07 });
	// The room's colour: a band of tiles, two courses, a little above the counters.
	const by = floorY - 62;
	g.rect(x, by, w, th * 2).fill({ color: band, alpha: 0.85 });
	g.rect(x, by, w, 1.5).rect(x, by + th * 2 - 1.5, w, 1.5).fill({ color: INK, alpha: 0.12 });
	// Quarry tiles: big squares, the grout darker, a drain grate in the middle.
	g.rect(x, floorY, w, y + h - floorY).fill(floor);
	const s = 44;
	for (let cy = floorY + s; cy < y + h; cy += s) g.rect(x, cy, w, 2);
	for (let cx = x + s; cx < x + w; cx += s) g.rect(cx, floorY, 2, y + h - floorY);
	g.fill({ color: INK, alpha: 0.1 });
	const dx = x + w / 2;
	const dy = floorY + (y + h - floorY) * 0.62;
	g.roundRect(dx - 16, dy - 8, 32, 16, 3).fill(STEEL_DARK).stroke(line(2));
	for (let k = -12; k <= 12; k += 4) g.rect(dx + k - 0.75, dy - 6, 1.5, 12);
	g.fill({ color: INK, alpha: 0.5 });
	// The cove where the wall meets the floor, then the line.
	g.rect(x, floorY, w, 8).fill({ color: INK, alpha: 0.08 });
	g.moveTo(x, floorY).lineTo(x + w, floorY).stroke(line(4));
	if (hood) {
		// The extraction hood: a steel canopy along the top, its filters in a row.
		g.poly([x, y + 2, x + w, y + 2, x + w - 6, y + 26, x + 6, y + 26]).fill(STEEL).stroke(line(3));
		for (let cx = x + 22; cx < x + w - 40; cx += 46) {
			g.roundRect(cx, y + 9, 36, 12, 2).fill(STEEL_DARK);
			for (let k = 4; k < 34; k += 4) g.rect(cx + k, y + 10, 1.4, 10);
			g.fill({ color: 0xffffff, alpha: 0.35 });
		}
		g.rect(x + 8, y + 27, w - 16, 4).fill({ color: HEAT, alpha: 0.22 });
	}
	// Side walls: narrow strips with an inner edge, for a little depth.
	const sideTop = y + 100;
	g.rect(x, sideTop, 13, y + h - sideTop).fill(TILE).moveTo(x + 13, sideTop).lineTo(x + 13, y + h).stroke(line(4));
	g.rect(x + w - 13, sideTop, 13, y + h - sideTop).fill(TILE).moveTo(x + w - 13, sideTop).lineTo(x + w - 13, y + h).stroke(line(4));
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 10).stroke(line(5));
}

/** A window onto the alley: a steel frame, two panes, a herb box on the sill. */
function kitchenWindow(g: Graphics, { x, y, w, h }: Rect, seed: number): void {
	g.roundRect(x, y, w, h, 4).fill(0xcfe6f2);
	const glare = x + w * (0.12 + (seed % 4) * 0.1);
	g.poly([glare, y + h - 6, glare + 16, y + 6, glare + 26, y + 6, glare + 10, y + h - 6]).fill({ color: 0xffffff, alpha: 0.6 });
	g.rect(x + w / 2 - 2.5, y, 5, h).fill(STEEL_DARK);
	g.roundRect(x + 2, y + 2, w - 4, h - 4, 3).stroke(line(4));
	// The herb box.
	g.roundRect(x - 4, y + h - 2, w + 8, 12, 3).fill(WOOD).stroke(line(2.5));
	for (let i = 0; i < 6; i++) {
		const cx = x + 8 + (i * (w - 16)) / 5;
		g.circle(cx, y + h - 5, 5 + (i % 2)).fill(i % 3 === 1 ? 0x2f8f48 : BASIL);
	}
	g.circle(x + w * 0.38, y + h - 8, 2.4).circle(x + w * 0.7, y + h - 7, 2.2).fill(TOMATO);
}

/** The swinging doors: a pair, each with its round window, a kick plate at the foot. */
function swingDoors(g: Graphics, { x, y, w, h }: Rect): void {
	g.rect(x - 4, y, w + 8, h).fill(STEEL_DARK).stroke(line(4));
	const half = w / 2;
	for (const k of [0, 1]) {
		const dx = x + k * half;
		g.roundRect(dx + 2, y + 6, half - 4, h - 6, 3).fill(0xe8d7b9).stroke(line(3));
		g.circle(dx + half / 2, y + h * 0.36, Math.min(11, half / 2 - 6)).fill(0x2a3140).stroke(line(3));
		g.roundRect(dx + 4, y + h - 18, half - 8, 14, 2).fill(STEEL).stroke(line(2));
	}
}

/** The chef's door: plain white, a round window, and the plate. */
function chefDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	g.roundRect(x, y + 4, w, h - 4, 4).fill(0xffffff).stroke(line(5));
	g.circle(x + w / 2, y + 66, 12).fill(0x2a3140).stroke(line(3));
	g.roundRect(x + w - 16, y + h * 0.6, 9, 4, 2).fill(STEEL_DARK).stroke({ width: 1.5, color: INK });
	g.roundRect(x + 6, y + 20, w - 12, 20, 3).fill(INK);
	const t = label(BAKERY_WORDS.door, 10, "800", 0xffffff);
	t.position.set(x + w / 2 - t.width / 2, y + 23);
	return t;
}

const SIGNS: SignStyle = {
	sign: 0xffe08a,
	signAlt: 0xffd0c4,
	whiteboard: 0xffffff,
	frame: 0xfff6e8,
	dress: (g, kind, x, y, w, h) => {
		if (kind === "frame") {
			// Tonight's special: a chalk-edged menu card, a fork and a knife at its foot.
			g.roundRect(x + 4, y + 4, w - 8, h - 8, 4).stroke({ width: 1.6, color: COPPER });
			const fx = x + w / 2;
			const fy = y + h - 9;
			g.moveTo(fx - 16, fy).lineTo(fx - 4, fy).moveTo(fx + 4, fy).lineTo(fx + 16, fy).stroke({ width: 1.6, color: INK, alpha: 0.5 });
		}
	},
};

function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [officeWall, officeFloor] =
		a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON_COLOURS[a.kind as keyof typeof COMMON_COLOURS];
	// The room's own colour lives on in a band of tiles and, a little, in the floor.
	const band = mix(officeFloor, officeWall, 0.5);
	const floor = a.kind === "lobby" ? 0xd9b98a : mix(QUARRY, officeWall, a.kind === "project" ? 0.18 : 0.3);
	shell(g, a, band, floor, a.kind !== "lobby");
	const seed = hash(a.id);
	for (const [i, w] of a.wall.entries()) {
		if (w.kind === "window") kitchenWindow(g, w.rect, seed + i);
		else if (w.kind === "door") swingDoors(g, w.rect);
		else if (w.kind === "you") c.addChild(chefDoor(g, w.rect));
		else if (w.kind !== "planner") c.addChild(signboard(w.kind, w.rect, w.slot ? sign(w.slot) : undefined, seed + i, SIGNS));
	}
}

/** The line: grey quarry tiles, and a black rubber mat down the middle with its drainage holes. */
function hallway(g: Graphics, r: Rect): void {
	g.rect(r.x, r.y, r.w, r.h).fill(0xd6d2ca);
	for (let x = r.x + 40; x < r.x + r.w; x += 40) g.rect(x, r.y, 2, r.h);
	g.fill({ color: INK, alpha: 0.07 });
	const mid = r.y + r.h / 2;
	const mh = 34;
	g.roundRect(r.x, mid - mh / 2, r.w, mh, 6).fill(MAT);
	for (let x = r.x + 7; x < r.x + r.w; x += 12) for (let k = -1; k <= 1; k++) g.circle(x + (k % 2 ? 6 : 0), mid + k * 9, 2.2);
	g.fill(0x22262f);
	g.moveTo(r.x, mid - mh / 2).lineTo(r.x + r.w, mid - mh / 2).moveTo(r.x, mid + mh / 2).lineTo(r.x + r.w, mid + mh / 2).stroke(line(2.5));
	g.moveTo(r.x, r.y + 2.5).lineTo(r.x + r.w, r.y + 2.5).moveTo(r.x, r.y + r.h - 2.5).lineTo(r.x + r.w, r.y + r.h - 2.5).stroke(line(5));
}

// --- Desk props ---------------------------------------------------------------------------------

const PREP = [CARROT, BASIL, ONION, TOMATO, 0xf2c94c, 0xb07ae8];

/** The mise tray: a hotel pan at the in-tray's spot, deli tubs of prep standing in it as the
 * context fills; a stack over the rim past 60%, tubs tipped off past 80%; empty while the lead has
 * it out. While the lead plays `buried` the rig draws the stack, so this draws nothing. */
function miseTray(t: Tray, seed: string): Graphics {
	const g = batched();
	if (t.rig) return g;
	const { x, y, w, sheet } = PROPS.tray;
	const s = hash(seed);
	const base = y - 4;
	const level = Math.min(10, t.out ? 0 : t.sheets);
	const tubH = Math.max(2, level * sheet);
	const tw = (w - 2) / 3;
	if (level > 0) {
		for (let c = 0; c < 3; c++) {
			const tx = x + 1 + c * tw;
			g.rect(tx + 0.4, base - tubH, tw - 0.8, tubH).fill(0xf3f6fb).stroke({ width: 0.9, color: INK });
			g.rect(tx + 1.2, base - tubH * 0.6, tw - 2.4, tubH * 0.6 - 0.6).fill(PREP[(s + c) % PREP.length]!);
		}
	}
	const heap = t.out ? 0 : Math.max(0, t.sheets - 10);
	if (heap > 0) {
		const lean = t.buried ? 3 : 0;
		const rows = Math.ceil(heap / 3);
		for (let r = 0; r < rows; r++) {
			const hh = Math.min(3, heap - r * 3) * sheet * 1.6;
			const yy = base - tubH - (r + 1) * 3 * sheet * 1.6;
			for (let c = 0; c < 3; c++) {
				const tx = x + 1 + c * tw + (lean * r) / rows + (r % 2 ? 1 : -1);
				g.rect(tx + 0.4, yy + 3 * sheet * 1.6 - hh, tw - 0.8, hh).fill(0xf3f6fb).stroke({ width: 0.9, color: INK });
				g.rect(tx + 1.2, yy + 3 * sheet * 1.6 - hh * 0.6, tw - 2.4, hh * 0.6 - 0.6).fill(PREP[(s + r * 3 + c + 1) % PREP.length]!);
			}
		}
	}
	// The hotel pan.
	g.poly([x - 3, base - 6, x + w + 3, base - 6, x + w + 1, base, x - 1, base]).fill(STEEL).stroke(line(1.6));
	g.moveTo(x - 1, base - 4).lineTo(x + w + 1, base - 4).stroke({ width: 0.9, color: 0xffffff });
	// Tubs tipped off: onto the counter, then over the edge onto the floor.
	const off: [number, number][] = [
		[x + w + 6, y - 3],
		[x + w - 8, -30],
		[x - 4, 10],
	];
	for (const [i, [ox, oy]] of off.slice(0, t.spill).entries()) {
		g.roundRect(ox - 3 + wob(s, i) * 2, oy - 4, 7, 5, 1).fill(0xf3f6fb).stroke({ width: 1, color: INK });
		g.circle(ox + 6, oy + 1, 1.6).fill(PREP[i % PREP.length]!).stroke({ width: 0.8, color: INK });
	}
	return g;
}

/** Quart deli cups of water on the counter, stacked three, two, one (a cook's mug). */
function deliCups(n: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.mugs;
	const rows = [3, 2, 1];
	let k = 0;
	for (let r = 0; r < rows.length && k < n; r++) {
		for (let i = 0; i < rows[r]! && k < n; i++, k++) {
			const mx = x + (i + r * 0.5) * (w + 1);
			const my = y - (r + 1) * h;
			g.poly([mx, my, mx + w, my, mx + w - 0.8, my + h, mx + 0.8, my + h]).fill({ color: 0xdff4ff, alpha: 0.9 }).stroke({ width: 1.1, color: INK, join: "round" });
			g.rect(mx - 0.3, my - 0.6, w + 0.6, 1.4).fill(0xffffff);
			g.rect(mx + 1.2, my + 2.2, w - 2.4, 1).fill(k % 2 ? TOMATO : 0x3d7dff);
		}
	}
	return g;
}

/** The heat lamp's bulb on its stalk at the counter's end, glowing green or red from the last
 * tasting. */
function heatBulb(lamp: Lamp): Graphics {
	const { x, y } = PROPS.lamp;
	const colour = lamp === "red" ? RED : GREEN;
	const g = batched();
	g.roundRect(x - 6, y + 9, 12, 4, 1.5).fill(STEEL_DARK).stroke({ width: 1.2, color: INK });
	g.rect(x - 1.5, y - 2, 3, 12).fill(INK);
	g.circle(x, y - 6, 11).fill({ color: colour, alpha: 0.25 });
	g.moveTo(x - 8, y - 6).arc(x, y - 6, 8, Math.PI, 0).closePath().fill(STEEL).stroke(line(1.6));
	g.circle(x, y - 4, 4.4).fill(colour).stroke({ width: 1.2, color: INK });
	return g;
}

/** A lowboy fridge under the counter's end: a drawer per ~10 files; the full ones won't shut. */
function lowboy(n: number, full: number): Graphics {
	const g = batched();
	const { x, w, h } = PROPS.drawers;
	const top = -(n * h + 4);
	g.rect(x + 3, top + 3, w, -top).fill(SHADOW);
	g.roundRect(x, top, w, -top, 3).fill(STEEL).stroke(line(2));
	for (let i = 0; i < n; i++) {
		const dy = top + 2 + i * h;
		const bulge = n - 1 - i < full;
		const dx = bulge ? -4 : 0;
		if (bulge) {
			// A tub lid and a leek poking out.
			g.rect(x + dx + 3, dy - 3, 7, 3).fill(0xffffff).stroke({ width: 1, color: INK });
			g.rect(x + dx + 12, dy - 4, 3, 5).fill(BASIL).stroke({ width: 1, color: INK });
		}
		g.roundRect(x + dx + 1, dy, w - 2, h - 2, 2).fill(STEEL_LIGHT).stroke(line(1.5));
		g.roundRect(x + dx + 3, dy + 1.5, w - 6, 2, 1).fill(INK);
	}
	return g;
}

/** The scraps bucket by the station, filled 0 to 5 loads with peelings. */
function scraps(load: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.skip;
	if (load > 0) {
		const heap = Math.min(5, load);
		for (let i = 0; i < heap * 2; i++) {
			const bx = x + 3 + ((i * 7) % (w - 8));
			const by = y - h + 2 - Math.floor(i / 2) * 2.2 + (i % 2);
			g.poly([bx, by, bx + 6, by - 1, bx + 5, by + 2]).fill(i % 3 ? CARROT : 0xd9c06a).stroke({ width: 0.9, color: INK, join: "round" });
		}
	}
	g.poly([x, y - h, x + w, y - h, x + w - 4, y, x + 4, y]).fill(0x3f8f5f).stroke(line(2));
	g.moveTo(x + 6, y - h / 2).lineTo(x + w - 6, y - h / 2).stroke({ width: 1.5, color: INK, alpha: 0.4 });
	return g;
}

// --- Furniture --------------------------------------------------------------------------------

/** A stainless prep counter: a steel top behind (a board on it), a front with its undershelf.
 * 150 wide. */
function counter(g: Graphics, w = 150, board = true): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, -70, w + 24, 32, 3).fill(STEEL_LIGHT).stroke(line(4));
	g.moveTo(-w / 2 - 10, -66).lineTo(w / 2 + 10, -66).stroke({ width: 1.5, color: 0xffffff });
	if (board) g.roundRect(-w / 2 + 4, -62, 52, 14, 2).fill(BOARD).stroke({ width: 2, color: INK });
	g.roundRect(-w / 2, -44, w, 44, 2).fill(STEEL).stroke(line(4));
	g.rect(-w / 2 + 4, -18, w - 8, 3).fill(STEEL_DARK);
	// Pans stacked on the undershelf.
	for (let i = 0; i < 3; i++) g.roundRect(-w / 2 + 10 + i * 16, -14, 14, 5, 1.5).fill(STEEL_LIGHT).stroke({ width: 1.2, color: INK });
	g.rect(-w / 2 + 2, -40, 3, 40).rect(w / 2 - 5, -40, 3, 40).fill(STEEL_DARK);
}

/** Station bodies: between ST_L (toward the wall) and ST_R (toward the user), tops at the point. */
const ST_L = -24;
const ST_R = 24;

function furniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	const w = ST_R - ST_L;
	switch (kind) {
		case "desk":
			counter(g);
			break;
		case "table": {
			// The pass: a long steel shelf under a gantry of heat lamps, the ticket spike on its end.
			counter(g, 180, false);
			g.rect(-86, -120, 4, 50).rect(82, -120, 4, 50).fill(STEEL_DARK);
			g.roundRect(-92, -128, 184, 10, 3).fill(STEEL).stroke(line(3));
			for (const lx of [-56, 0, 56]) {
				g.poly([lx - 14, -118, lx + 14, -118, lx + 8, -110, lx - 8, -110]).fill(STEEL_DARK).stroke({ width: 2, color: INK });
				g.rect(lx - 16, -108, 32, 30).fill({ color: HEAT, alpha: 0.18 });
			}
			// A plate waiting, and the spike with its tickets.
			g.ellipse(-30, -72, 18, 4).fill(0xffffff).stroke({ width: 2, color: INK });
			g.roundRect(-38, -80, 14, 6, 2).fill(0xf2a08f).stroke({ width: 1.5, color: INK });
			g.rect(66, -96, 2, 26).fill(INK);
			for (let k = 0; k < 3; k++) g.poly([60 + k, -86 + k * 5, 74 - k, -88 + k * 5, 74, -82 + k * 5, 60, -80 + k * 5]).fill(TICKET).stroke({ width: 1.2, color: INK, join: "round" });
			break;
		}
		case "counter": {
			// Staff meal's counter: a coffee urn and a tray of bread rolls.
			counter(g, 130, false);
			g.roundRect(-58, -118, 34, 46, 6).fill(STEEL).stroke(line(3));
			g.roundRect(-62, -122, 42, 8, 3).fill(STEEL_DARK).stroke(line(2));
			g.rect(-44, -80, 6, 6).fill(INK);
			g.circle(-41, -100, 4).fill(GREEN).stroke({ width: 1.5, color: INK });
			g.roundRect(-2, -76, 52, 6, 2).fill(STEEL_DARK).stroke(line(2));
			for (let i = 0; i < 4; i++) g.ellipse(6 + i * 12, -80, 6, 4.4).fill(WOOD).stroke({ width: 1.6, color: INK });
			break;
		}
		case "chair":
			// An upturned milk crate, which is what cooks sit on.
			g.rect(-18 + 4, -40 + 4, 40, 40).fill(SHADOW);
			g.roundRect(-20, -40, 40, 40, 3).fill(0x3d6fd6).stroke(line(4));
			for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.roundRect(-16 + c * 9, -34 + r * 11, 6, 7, 1.5).fill(0x2a4f9e);
			break;
		case "plant": {
			// A sack of potatoes where the office keeps a plant.
			g.rect(-15, -54 + 5, 34, 54).fill(SHADOW);
			g.moveTo(-18, 0).lineTo(-20, -40).quadraticCurveTo(-16, -56, 0, -54).quadraticCurveTo(16, -56, 20, -40).lineTo(18, 0).closePath().fill(0xd8c29a).stroke(line(4));
			g.moveTo(-12, -46).quadraticCurveTo(0, -52, 12, -46).stroke({ width: 2, color: INK });
			for (const [px, py] of [[-6, -54], [4, -56], [-1, -59]] as const) g.ellipse(px, py, 6, 4.4).fill(0xb98a4c).stroke({ width: 1.6, color: INK });
			g.rect(-11, -30, 22, 8).fill({ color: 0x8a5a33, alpha: 0.55 });
			break;
		}
		case "lamp":
			// A standing heat lamp on its pole.
			g.rect(-2.5, -96, 5, 96).fill(STEEL_DARK);
			g.roundRect(-14, -4, 28, 6, 3).fill(INK);
			g.poly([-18, -100, 18, -100, 10, -88, -10, -88]).fill(STEEL).stroke(line(3));
			g.circle(0, -86, 6).fill(HEAT).stroke({ width: 2, color: INK });
			break;
		case "cooler": {
			// The ice machine: a squat steel bin, its scoop on a hook.
			g.rect(-18, -70 + 5, 42, 70).fill(SHADOW);
			g.roundRect(-21, -70, 42, 70, 4).fill(STEEL).stroke(line(4));
			g.roundRect(-17, -64, 34, 20, 3).fill(STEEL_LIGHT).stroke({ width: 2, color: INK });
			for (let i = 0; i < 4; i++) g.rect(-14 + i * 8, -60, 6, 2);
			g.fill(INK);
			g.roundRect(-17, -36, 34, 26, 3).fill(0xdff4ff).stroke({ width: 2, color: INK });
			for (const [cx, cy] of [[-9, -20], [0, -26], [8, -18], [-3, -15]] as const) g.roundRect(cx - 3, cy - 3, 6, 6, 1.5).fill(0xffffff).stroke({ width: 1, color: INK });
			break;
		}
		case "fridge": {
			// The walk-in's door: heavy steel, a big latch, strip curtain behind its window, the
			// temperature on its dial.
			g.rect(-38, -144, 84, 150).fill(SHADOW);
			g.roundRect(-42, -150, 84, 150, 4).fill(STEEL).stroke(line(4));
			g.roundRect(-36, -144, 72, 138, 3).stroke({ width: 2, color: STEEL_DARK });
			g.roundRect(-24, -132, 48, 34, 3).fill(0xcfe6f2).stroke(line(3));
			for (let k = -20; k < 24; k += 8) g.rect(k, -130, 5, 30);
			g.fill({ color: 0xffffff, alpha: 0.5 });
			g.roundRect(18, -86, 18, 34, 4).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(22, -76, 22, 8, 3).fill(STEEL_LIGHT).stroke(line(2));
			g.circle(-22, -70, 9).fill(0xffffff).stroke(line(2.5));
			g.moveTo(-22, -70).lineTo(-26, -75).stroke({ width: 1.6, color: 0x3d7dff });
			g.rect(-30, -40, 24, 18).fill(0xffe08a).stroke(line(2));
			g.rect(-26, -34, 16, 2).rect(-26, -29, 12, 2).fill(INK);
			break;
		}
		case "sofa": {
			// A bench of flour sacks, slumped against each other.
			for (const [i, sx] of [-50, 0, 50].entries()) {
				g.moveTo(sx - 26, 0).lineTo(sx - 28, -46).quadraticCurveTo(sx - 20, -64 + i * 3, sx, -60).quadraticCurveTo(sx + 20, -64, sx + 27, -46).lineTo(sx + 25, 0).closePath().fill(0xf3ece0).stroke(line(4));
				g.rect(sx - 18, -34, 36, 9).fill({ color: RED, alpha: 0.7 });
				g.moveTo(sx - 10, -56).quadraticCurveTo(sx, -60, sx + 10, -56).stroke({ width: 2, color: INK });
			}
			break;
		}
		case "cabinet": {
			// A speed rack: a tall steel frame of sheet pans, bread rising on two of them.
			g.rect(-33, -104, 4, 104).rect(29, -104, 4, 104).fill(STEEL_DARK);
			for (let i = 0; i < 8; i++) {
				const y = -98 + i * 12;
				g.rect(-31, y, 62, 3).fill(STEEL).stroke({ width: 1.2, color: INK });
				if (i === 2 || i === 5) for (let k = 0; k < 4; k++) g.ellipse(-22 + k * 15, y - 3, 6, 3.4).fill(WOOD).stroke({ width: 1.2, color: INK });
			}
			g.rect(-33, -104, 66, 104).stroke(line(3));
			g.circle(-28, 2, 3).circle(28, 2, 3).fill(INK);
			break;
		}
		case "pod": {
			// The host stand's giant stockpot (the napper shows in it, peeking over the rim).
			g.rect(-70, -62 + 5, 140, 62).fill(SHADOW);
			g.roundRect(-75, -62, 150, 62, 10).fill(STEEL).stroke(line(4));
			g.roundRect(-80, -66, 160, 10, 4).fill(STEEL_LIGHT).stroke(line(3));
			for (const s of [-1, 1]) g.roundRect(s > 0 ? 72 : -90, -54, 18, 8, 4).fill(STEEL_DARK).stroke(line(3));
			g.circle(-36, -33, 21).fill(0x2a3140).stroke(line(3));
			g.roundRect(8, -46, 52, 26, 4).fill(TICKET).stroke(line(2.5));
			g.roundRect(14, -40, 30, 4, 2).fill(RED);
			g.roundRect(14, -32, 22, 4, 2).fill(INK);
			break;
		}
		case "screen-lit":
			// The ticket printer's screen: green on black, a ticket curling out of it.
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 4).fill(STEEL_DARK).stroke(line(4));
			g.roundRect(-26, -39, 52, 34, 2).fill(0x1d2a22);
			g.rect(-22, -34, 22, 4).rect(-22, -25, 30, 4).rect(-22, -16, 12, 3).fill(0x5dffa0);
			g.poly([18, -44, 28, -44, 30, -58, 20, -56]).fill(TICKET).stroke({ width: 1.5, color: INK, join: "round" });
			break;
		case "screen-off":
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 4).fill(STEEL_DARK).stroke(line(4));
			g.roundRect(-26, -39, 52, 34, 2).fill(0x8d96a3);
			break;
		case "files": {
			// The lowboy (reference): a steel under-counter fridge, its top drawer at the point.
			g.rect(ST_L + 4, -47 + 5, w, 47).fill(SHADOW);
			g.roundRect(ST_L, -47, w, 47, 3).fill(STEEL).stroke(line(4));
			g.rect(ST_L, -31, w, 3).rect(ST_L, -15, w, 3).fill(STEEL_DARK);
			g.roundRect(-8, -24, 16, 3, 1.5).roundRect(-8, -8, 16, 3, 1.5).fill(0xffffff);
			g.rect(ST_R - 12, -45, 9, 5).fill(0x9be3ff).stroke({ width: 1, color: INK });
			break;
		}
		case "catalogue": {
			// The spice shelf (search): a little rack of jars over a recipe tin on legs.
			g.rect(ST_L + 4, -42 + 5, w, 42).fill(SHADOW);
			g.rect(ST_L + 4, -10, 5, 10).rect(ST_R - 9, -10, 5, 10).fill(INK);
			g.roundRect(ST_L, -42, w, 34, 3).fill(WOOD).stroke(line(4));
			const caps = [TOMATO, 0xf2c94c, BASIL];
			for (let r = 0; r < 2; r++)
				for (let c = 0; c < 3; c++) {
					const x = ST_L + 5 + c * 14;
					const y = -38 + r * 14;
					g.roundRect(x, y + 2, 10, 9, 2).fill(0xf7f1e3).stroke({ width: 1.6, color: INK });
					g.roundRect(x - 0.5, y, 11, 3, 1).fill(caps[(r + c) % 3]!).stroke({ width: 1.2, color: INK });
				}
			break;
		}
		case "copier": {
			// The oven (build): a range body under the point, its door and knobs (the press and its
			// lid, the oven door's window and the toasties: the rig, at the point).
			g.rect(ST_L + 4, -40 + 5, w, 40).fill(SHADOW);
			g.roundRect(ST_L, -40, w, 34, 3).fill(STEEL).stroke(line(4));
			for (let k = 0; k < 4; k++) g.circle(ST_L + 8 + k * 11, -34, 2.6).fill(INK);
			g.roundRect(ST_L + 4, -28, w - 8, 18, 2).fill(0x2a2430).stroke({ width: 2, color: INK });
			g.rect(ST_L + 8, -24, w - 16, 3).fill({ color: HEAT, alpha: 0.6 });
			g.roundRect(ST_L + 2, -7, w - 4, 7, 2).fill(STEEL_DARK);
			break;
		}
		case "stamps": {
			// The tasting stand (test): a small steel table under the point, a tub of spoons on it.
			g.rect(ST_L + 4, -38 + 5, w, 38).fill(SHADOW);
			g.rect(ST_L + 4, -32, 5, 32).rect(ST_R - 9, -32, 5, 32).fill(STEEL_DARK);
			g.rect(ST_L + 6, -14, w - 12, 3).fill(STEEL_DARK);
			g.roundRect(ST_L + 1, -52, 10, 14, 2).fill(0xdff4ff).stroke({ width: 2, color: INK });
			for (const x of [ST_L + 4, ST_L + 6, ST_L + 8.5]) g.rect(x, -58, 1.4, 10).fill(STEEL_DARK);
			g.roundRect(ST_L - 2, -38, w + 4, 8, 2).fill(STEEL_LIGHT).stroke(line(4));
			break;
		}
		case "phone": {
			// The takeout line (web): a slim stand, the phone on its wall end, the order pad at the
			// point (the handset and the pad: the rig).
			g.rect(ST_L + 8, -38 + 5, w - 8, 38).fill(SHADOW);
			g.roundRect(-5, -32, 10, 30, 3).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(ST_L + 2, -4, w - 4, 6, 3).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(ST_L - 2, -38, w + 4, 7, 3).fill(STEEL_LIGHT).stroke(line(4));
			g.roundRect(ST_L + 1, -50, 22, 13, 5).fill(RED).stroke(line(3));
			g.roundRect(ST_L + 5, -47, 14, 3, 1.5).fill(0xffd0c4);
			break;
		}
		case "outbox": {
			// The pass's end (outbox): a steel shelf on legs under a heat lamp (the shelf's top and the
			// plates: the rig).
			g.rect(ST_L + 4, -36 + 5, w, 36).fill(SHADOW);
			g.rect(ST_L + 2, -36, 4, 36).rect(ST_R - 6, -36, 4, 36).fill(STEEL_DARK);
			g.rect(ST_L + 2, -12, w - 4, 3).fill(STEEL_DARK);
			for (let i = 0; i < 4; i++) g.ellipse(0, -16 - i * 3, 16, 2.6).fill(0xffffff).stroke({ width: 1.2, color: INK });
			g.rect(-2, -84, 4, 32).fill(STEEL_DARK);
			g.poly([-16, -86, 16, -86, 10, -76, -10, -76]).fill(STEEL).stroke(line(2.5));
			g.rect(-14, -74, 28, 30).fill({ color: HEAT, alpha: 0.18 });
			break;
		}
		case "shredder": {
			// The scraps bin: a green bin with a swing lid, its top just under the working point (the
			// slot and the pile: the rig).
			g.rect(-14, -38 + 5, 32, 38).fill(SHADOW);
			g.poly([-18, -38, 14, -38, 11, 0, -15, 0]).fill(0x3f8f5f).stroke(line(4));
			g.rect(-14, -26, 22, 3).fill({ color: INK, alpha: 0.25 });
			// A peel stencilled on its front.
			g.poly([-9, -12, 3, -16, 1, -10]).fill({ color: 0xffffff, alpha: 0.7 });
			break;
		}
		case "tickets": {
			// The ticket printer on its post, a ticket curling out (take a number).
			g.roundRect(-10, -4, 20, 4, 2).fill(INK);
			g.rect(-2.5, -52, 5, 50).fill(INK);
			g.roundRect(-15, -78, 30, 28, 4).fill(STEEL_LIGHT).stroke(line(3));
			g.rect(-10, -72, 20, 4).fill(INK);
			g.poly([-6, -68, 6, -68, 8, -50, -4, -52]).fill(TICKET).stroke({ width: 1.5, color: INK, join: "round" });
			g.rect(-3, -62, 6, 1.6).fill(RED);
			break;
		}
		case "bell": {
			// The pass's end by the chef's door, centred under the bell's plunger (rigpoints.ts), the
			// service bell on it: the same bell the rig draws over while it rings.
			g.rect(-14, -31 + 5, 32, 31).fill(SHADOW);
			g.rect(-14, -27, 4, 27).rect(10, -27, 4, 27).fill(STEEL_DARK);
			g.roundRect(-18, -31, 36, 7, 2).fill(STEEL_LIGHT).stroke(line(3));
			g.moveTo(-6, -31).arc(0, -31, 6, Math.PI, 0).closePath().fill(0xf2bd3c).stroke(line(2));
			g.rect(-1, -41, 2, 4).fill(INK);
			g.circle(0, -41.5, 1.8).fill(INK);
			break;
		}
	}
	return g;
}

// --- The crew build -------------------------------------------------------------------------------

const SPONGES = [0xffd98a, 0xffcf7a, 0xf7c46c, 0xffdf9e];

/** The crew's layer cake: sponge after sponge, cream between, and a pick with "ORDER UP" on top
 * once the PR is up. */
const CAKE_BUILD = {
	piece: (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		// `k` steps by 3 a piece (build.ts): every third piece is a chocolate layer.
		const n = Math.floor(k / 3);
		g.rect(x, y, w, h).fill(n % 3 === 1 ? 0x8a5a3c : SPONGES[k % SPONGES.length]!);
		g.rect(x, y + h - 3, w, 2.4).fill(0xfff6e8);
		g.circle(x + w * 0.3, y + h * 0.4, 0.9).circle(x + w * 0.7, y + h * 0.35, 0.9).fill(0xd9a043);
		g.rect(x, y, w, h).stroke({ width: 1.5, color: INK });
	},
	flag: (f: Graphics, top: { x: number; y: number }) => {
		f.moveTo(top.x, top.y).lineTo(top.x, top.y - 22).stroke({ width: 2, color: INK });
		f.circle(top.x, top.y - 2, 3.4).fill(0xe8506e).stroke({ width: 1.2, color: INK });
		f.moveTo(top.x, top.y - 22).lineTo(top.x + 15, top.y - 18).lineTo(top.x + 15, top.y - 11).lineTo(top.x, top.y - 13).closePath().fill(GREEN).stroke({ width: 1.5, color: INK });
	},
};

/** The ticket rail: the planner as a steel rail along the top with three columns of tickets hung
 * from it, a ticket per todo, coloured by session at its top band. */
const BANDS = [0xff5a4a, 0x3d7dff, 0x3fae5a, 0xff9a2e, 0xb07ae8, 0xe8506e];

function ticketRail(r: Rect, rows: PlannerRow[]): Container {
	const c = new Container();
	const g = batched();
	c.addChild(g);
	g.roundRect(r.x, r.y, r.w, r.h, 6).fill(0xeef0f4).stroke(line(4));
	const colW = (r.w - 12) / 3;
	const tw = 8;
	const th = 11;
	const gap = 2;
	const head = 15;
	const perRow = Math.max(1, Math.floor((colW - 2) / (tw + gap)));
	const fit = perRow * Math.max(1, Math.floor((r.h - head - 6) / (th + gap + 2)));
	for (let k = 0; k < 3; k++) {
		const cx = r.x + 6 + k * colW;
		const t = label(BAKERY_WORDS.columns[k]!, 6, "800");
		t.position.set(cx + (colW - t.width) / 2, r.y + 4);
		c.addChild(t);
		const notes = rows.flatMap((row) => Array.from({ length: [row.pending, row.active, row.done][k]! }, () => BANDS[hash(row.session) % BANDS.length]!));
		const lines = Math.max(1, Math.ceil(Math.min(notes.length, fit) / perRow));
		// A rail for each line of tickets.
		for (let l = 0; l < lines; l++) {
			const ry = r.y + head + l * (th + gap + 2);
			g.rect(cx + 1, ry - 1.5, colW - 4, 2.4).fill(STEEL_DARK);
		}
		notes.slice(0, notes.length > fit ? fit - 1 : fit).forEach((band, i) => {
			const nx = cx + 2 + (i % perRow) * (tw + gap);
			const ny = r.y + head + Math.floor(i / perRow) * (th + gap + 2);
			const tilt = k === 2 ? 0.8 : 0;
			g.poly([nx, ny, nx + tw, ny, nx + tw + tilt, ny + th, nx + tilt, ny + th]).fill(TICKET).stroke({ width: 1, color: INK });
			g.rect(nx + 0.6, ny + 0.8, tw - 1.2, 2.2).fill(band);
			if (k === 2) g.moveTo(nx + 1.6, ny + 7).lineTo(nx + tw - 1, ny + 5).stroke({ width: 1, color: RED });
		});
		if (notes.length > fit) {
			const more = label(`+${notes.length - fit + 1}`, 6.5, "800");
			more.position.set(cx + colW - more.width - 2, r.y + r.h - more.height - 3);
			c.addChild(more);
		}
	}
	return c;
}

/** The Line's light (office/light.ts): warm heat lamps in round pools, an alley out of the
 * windows at the back of a city block, the yard with its bins and pallets. */
export const BAKERY_LIGHT: SceneLight = {
	ambient: { morning: 0xeceaf2, noon: 0xffffff, afternoon: 0xfdeedb, dusk: 0xc2aec2, night: 0x5a5478 },
	hall: { morning: 0xf0eef5, noon: 0xffffff, afternoon: 0xfdf2e2, dusk: 0xd0c2cc, night: 0x9a90a8 },
	outside: { morning: 0xf2f0ff, noon: 0xffffff, afternoon: 0xffeed6, dusk: 0xa9a0c8, night: 0x35406e },
	lamp: 0xffe2b8,
	glow: 0xffa64d,
	overhead: "pools",
	vacant: 0.66,
	sun: 0xfff0c4,
	sky: {
		morning: [0xbfe1ff, 0xffe3c8],
		noon: [0x8fd0ff, 0xd3f0ff],
		afternoon: [0xa8cdf2, 0xffcf8f],
		dusk: [0x564a8e, 0xff9a78],
		night: [0x141a36, 0x29356a],
	},
	skyline: {
		morning: [0xcab8a8, 0xa58f80],
		noon: [0xcdbcab, 0xa79280],
		afternoon: [0xd9b39a, 0xb08a74],
		dusk: [0x6d5a7f, 0x46385a],
		night: [0x2a2c48, 0x1d1f36],
	},
	window: { inset: 4, panes: 2, transom: false, bar: 5 },
	floors: { lobby: "planks" },
	cluster: "rug",
	decal: { size: 30, colour: INK, stencil: false },
	yard: "yard",
};

export const BAKERY_THEME: SceneTheme = {
	id: "bakery",
	words: BAKERY_WORDS,
	lawn: 0xc9c2b4,
	slab: 0x4a3f45,
	room,
	hallway,
	furniture,
	desk: { tray: miseTray, mugs: deliCups, lamp: heatBulb, drawers: lowboy, skip: scraps },
	planner: ticketRail,
	crewBuild: (b, seed) => crewBuild(b, seed, CAKE_BUILD),
	nightWatch: { ...NIGHT_WATCH, tint: "night-chef" },
	arms: false,
	light: BAKERY_LIGHT,
};
