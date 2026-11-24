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
import { Container, Graphics } from "pixi.js";
import type { Lamp, PlannerRow, Tray } from "../contract";
import { GREEN, INK, RED, SHADOW, type SignStyle, batched, hash, label, line, signboard, wob } from "../office/paper";
import { MONITOR, PROPS } from "../world/propspots";
import type { SceneStaging } from "../world/staging";
import { type Area, type Band, DESK_TOP, type Rect } from "../world/world";
import { crewBuild } from "./build";
import { NIGHT_WATCH, ROOM_COLOURS } from "../../themes/office/scene";
import type { FurnitureKind, SceneLight, SceneTheme, StagePainters } from "./types";
import { BAKERY_WORDS, type SignText } from "./words";
import { mix } from "../../shared/colour";

// --- Paint ------------------------------------------------------------------------------------

const CREAM = 0xfff6e6;
const IVORY = 0xfffaf0;
const PINK = 0xff9ec4;
const PINK_LIGHT = 0xffd3e4;
const RASPBERRY = 0xe8507a;
const MINT = 0x9fe3c8;
const MINT_LIGHT = 0xd5f5e8;
const LILAC = 0xcdb8ff;
const LEMON = 0xfff08a;
const BLUEBERRY = 0x6f86ec;
const ORANGE = 0xffa34d;
const CHOC = 0x7a4a33;
const CHOC_DARK = 0x4f2e22;
const CRUST = 0xe09a48;
const CRUST_LIGHT = 0xf4c27a;
const CRUST_DARK = 0xb06a2e;
const DOUGH = 0xf0c48a;
const CHERRY = 0xe8384f;
const CHROME = 0xe3e8f0;
const CHROME_DARK = 0x8d97a8;
const BRASS = 0xe8b84a;
const COPPER = 0xd9824a;
const BRICK = 0xc96a4f;
const BRICK_DARK = 0x9c4b38;
const WOOD = 0xd9a066;
const WOOD_DARK = 0xa8703f;
const MARBLE = 0xf7f4f0;
const GLASS = 0xe6f6ff;
const HEAT = 0xffb347;
const CHALK = 0x34584a;

/** Sprinkles, icings, macaron shells, boxes: the bakery's candy colours, in turn. */
const CANDY = [PINK, MINT, LEMON, LILAC, BLUEBERRY, ORANGE] as const;

/** The common rooms' wall and floor colours, as the project rooms' (theme/office.ts ROOM_COLOURS):
 * the wall carries the colour, the floor is a pale tint of it. The tasting table pink, the shop
 * front butter, the pick-up counter mint, the café latte, a vacant room in dust sheets. */
const COMMON: Record<Exclude<Area["kind"], "project">, [number, number]> = {
	meeting: [0xffcfe0, 0xfff0f5],
	lobby: [0xffe6a0, 0xfff9e4],
	yours: [0xbfecd6, 0xecf9f2],
	kitchen: [0xecd3bb, 0xfbf3ea],
	vacant: [0xe3e6ee, 0xf2f3f7],
};

/** A room's wall and floor: the project's colour on the wall, a pale tint of it on the floor. */
function coloursOf(a: Area): [wall: number, floor: number] {
	return a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON[a.kind];
}

/** Under a project room's desks: a rug a step deeper than its checks, edged in a deeper shade of
 * its wall, so the room reads as its project's from the whole-office stop (as the office's). */
function rugOf(a: Area): { fill: number; edge: number } | undefined {
	if (a.kind !== "project") return undefined;
	const [wall, floor] = coloursOf(a);
	return { fill: mix(floor, wall, 0.4), edge: mix(wall, RASPBERRY, 0.3) };
}


const thin = (w: number) => ({ width: w, color: INK, join: "round" as const, cap: "round" as const });

/** An ellipse as a polygon, turned by `a`: for things lying at an angle (baguettes, horns). */
function oval(cx: number, cy: number, rx: number, ry: number, a = 0, n = 18): number[] {
	const pts: number[] = [];
	const c = Math.cos(a);
	const s = Math.sin(a);
	for (let k = 0; k < n; k++) {
		const t = (k / n) * Math.PI * 2;
		const x = Math.cos(t) * rx;
		const y = Math.sin(t) * ry;
		pts.push(cx + x * c - y * s, cy + x * s + y * c);
	}
	return pts;
}

// --- Baked goods: small painters, each with its base centre at (x, y), `s` its scale ------------

function croissant(g: Graphics, x: number, y: number, s = 1): void {
	const lw = Math.max(0.8, 1.2 * s);
	const seg = (dx: number, dy: number, rx: number, ry: number, a: number, col: number) =>
		g.poly(oval(x + dx * s, y + dy * s, rx * s, ry * s, a)).fill(col).stroke(thin(lw));
	seg(-9, -2.6, 3, 2, 0.6, CRUST_DARK);
	seg(9, -2.6, 3, 2, -0.6, CRUST_DARK);
	seg(-5.6, -4, 4.2, 3.6, 0.35, CRUST);
	seg(5.6, -4, 4.2, 3.6, -0.35, CRUST);
	seg(0, -5, 4.8, 4.6, 0, CRUST_LIGHT);
	g.moveTo(x - 2 * s, y - 8 * s).quadraticCurveTo(x, y - 7 * s, x + 2 * s, y - 8 * s).stroke({ width: lw * 0.8, color: 0xffffff, alpha: 0.7 });
}

function donut(g: Graphics, x: number, y: number, s = 1, icing = PINK, seed = 0): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.ellipse(x, y - 4 * s, 8 * s, 4.4 * s).fill(DOUGH).stroke(thin(lw));
	g.ellipse(x, y - 4.8 * s, 6.8 * s, 3.4 * s).fill(icing);
	g.ellipse(x, y - 4.8 * s, 2.2 * s, 1.1 * s).fill(CRUST_DARK).stroke(thin(lw * 0.8));
	for (let k = 0; k < 6; k++) {
		const a = (k / 6) * Math.PI * 2 + seed;
		const px = x + Math.cos(a) * 4.6 * s;
		const py = y - 4.8 * s + Math.sin(a) * 2.2 * s;
		g.rect(px - 0.9 * s, py - 0.4 * s, 1.8 * s, 0.9 * s).fill(CANDY[(k + seed) % CANDY.length] === icing ? 0xffffff : CANDY[(k + seed) % CANDY.length]!);
	}
}

function macaron(g: Graphics, x: number, y: number, s = 1, shell = PINK): void {
	const lw = Math.max(0.8, 1.1 * s);
	g.roundRect(x - 6 * s, y - 4 * s, 12 * s, 4 * s, 2 * s).fill(shell).stroke(thin(lw));
	g.rect(x - 5.4 * s, y - 5.6 * s, 10.8 * s, 1.8 * s).fill(IVORY).stroke({ width: lw * 0.6, color: INK, alpha: 0.5 });
	g.roundRect(x - 6 * s, y - 10.4 * s, 12 * s, 5 * s, 2.5 * s).fill(shell).stroke(thin(lw));
	g.rect(x - 3.4 * s, y - 9.4 * s, 4 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.55 });
}

function eclair(g: Graphics, x: number, y: number, s = 1, glaze = CHOC): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.roundRect(x - 10 * s, y - 6 * s, 20 * s, 6 * s, 3 * s).fill(CRUST_LIGHT).stroke(thin(lw));
	g.roundRect(x - 9.4 * s, y - 6.8 * s, 18.8 * s, 3.4 * s, 1.7 * s).fill(glaze).stroke(thin(lw * 0.7));
	g.moveTo(x - 7 * s, y - 5 * s);
	for (let k = 0; k < 6; k++) g.lineTo(x + (-5 + k * 2.4) * s, y - (k % 2 ? 6 : 4.6) * s);
	g.stroke({ width: lw * 0.7, color: 0xffffff, alpha: 0.85 });
}

function cupcake(g: Graphics, x: number, y: number, s = 1, frost = PINK, wrap = MINT): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.poly([x - 6 * s, y - 7 * s, x + 6 * s, y - 7 * s, x + 4.6 * s, y, x - 4.6 * s, y]).fill(wrap).stroke(thin(lw));
	for (let k = -2; k <= 2; k++) g.moveTo(x + k * 2.2 * s, y - 6.6 * s).lineTo(x + k * 1.7 * s, y - 0.4 * s);
	g.stroke({ width: lw * 0.6, color: INK, alpha: 0.35 });
	g.ellipse(x, y - 8.6 * s, 7 * s, 3 * s).fill(frost).stroke(thin(lw));
	g.ellipse(x, y - 11.2 * s, 5 * s, 2.6 * s).fill(frost).stroke(thin(lw));
	g.ellipse(x, y - 13.4 * s, 3 * s, 2 * s).fill(frost).stroke(thin(lw));
	g.circle(x + 0.6 * s, y - 16 * s, 1.9 * s).fill(CHERRY).stroke(thin(lw * 0.8));
}

function loaf(g: Graphics, x: number, y: number, s = 1): void {
	const lw = Math.max(0.8, 1.3 * s);
	g.ellipse(x, y - 5 * s, 10 * s, 5.4 * s).fill(CRUST).stroke(thin(lw));
	for (let k = -1; k <= 1; k++) g.moveTo(x + (k * 5 - 2) * s, y - 7.6 * s).lineTo(x + (k * 5 + 2) * s, y - 3.8 * s);
	g.stroke({ width: lw * 0.9, color: CRUST_LIGHT });
	g.ellipse(x - 3 * s, y - 8 * s, 3 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.35 });
}

/** A baguette lying at angle `a`, centred at (x, y), `len` long. */
function baguette(g: Graphics, x: number, y: number, len: number, a: number, s = 1): void {
	g.poly(oval(x, y, len / 2, 3.2 * s, a)).fill(CRUST).stroke(thin(1.3 * s));
	const c = Math.cos(a);
	const sn = Math.sin(a);
	for (let k = -2; k <= 2; k++) {
		const t = (k * len) / 6;
		const px = x + t * c;
		const py = y + t * sn;
		g.moveTo(px - 2 * c + 1.4 * sn, py - 2 * sn - 1.4 * c).lineTo(px + 2 * c - 1.4 * sn, py + 2 * sn + 1.4 * c);
	}
	g.stroke({ width: 1.1 * s, color: CRUST_LIGHT });
}

function painAuChocolat(g: Graphics, x: number, y: number, s = 1): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.roundRect(x - 7 * s, y - 7 * s, 14 * s, 7 * s, 2.6 * s).fill(CRUST_LIGHT).stroke(thin(lw));
	g.rect(x - 7 * s, y - 5 * s, 1.8 * s, 2 * s).rect(x + 5.2 * s, y - 5 * s, 1.8 * s, 2 * s).fill(CHOC_DARK);
	g.moveTo(x - 4 * s, y - 6.2 * s).lineTo(x + 4 * s, y - 6.2 * s).stroke({ width: lw * 0.8, color: CRUST });
}

/** A layer cake, `w` wide and `h` tall, its base centre at (x, y): sponge and cream in courses, a
 * frosted top, drips, a cherry or three. */
function layerCake(g: Graphics, x: number, y: number, w: number, h: number, frost = PINK, sponge = 0xffe0a0, seed = 0): void {
	const lw = Math.max(1, w / 30);
	g.roundRect(x - w / 2, y - h, w, h, 3).fill(sponge).stroke(thin(lw));
	const courses = Math.max(2, Math.round(h / 8));
	for (let k = 1; k < courses; k++) g.rect(x - w / 2 + 0.5, y - h + (k * h) / courses - 1, w - 1, 2);
	g.fill({ color: k2(seed) ? CHOC : IVORY, alpha: 0.9 });
	// The frosting: a cap with drips down the side.
	g.roundRect(x - w / 2 - 1, y - h - 3, w + 2, 6, 3).fill(frost).stroke(thin(lw));
	for (let k = 0; k < 5; k++) {
		const dx = x - w / 2 + 2 + ((k + 0.5) * (w - 4)) / 5;
		g.roundRect(dx - 1.4, y - h + 1, 2.8, 3 + ((seed + k * 3) % 4) * 1.2, 1.4);
	}
	g.fill(frost);
	for (let k = 0; k < 3; k++) g.circle(x + (k - 1) * w * 0.28, y - h - 4, Math.max(1.4, w / 22));
	g.fill(CHERRY);
}
const k2 = (seed: number) => seed % 3 === 1;

/** A swirl lollipop on its stick: the candy's centre at (x, y), the stick down `stick` from it. */
function lollipop(g: Graphics, x: number, y: number, r: number, stick: number, a = PINK, b = 0xffffff): void {
	g.rect(x - 1.2, y, 2.4, stick).fill(0xffffff).stroke(thin(1));
	g.circle(x, y, r).fill(a).stroke(thin(Math.max(1.2, r / 7)));
	g.moveTo(x, y);
	for (let k = 1; k <= 40; k++) {
		const t = (k / 40) * Math.PI * 5;
		const rr = (k / 40) * r * 0.86;
		g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
	}
	g.stroke({ width: Math.max(1, r * 0.22), color: b, cap: "round", join: "round" });
}

/** A cup of coffee on its saucer, a heart in the foam: its base centre at (x, y). */
function cup(g: Graphics, x: number, y: number, s = 1, colour = 0xffffff): void {
	const lw = Math.max(0.8, 1.2 * s);
	g.ellipse(x, y - 1 * s, 8 * s, 2 * s).fill(colour).stroke(thin(lw));
	g.poly([x - 5.5 * s, y - 8 * s, x + 5.5 * s, y - 8 * s, x + 4 * s, y - 1.6 * s, x - 4 * s, y - 1.6 * s]).fill(colour).stroke(thin(lw));
	g.moveTo(x + 5 * s, y - 6.6 * s).arc(x + 6.4 * s, y - 5 * s, 2 * s, -Math.PI / 2, Math.PI / 2).stroke(thin(lw));
	g.ellipse(x, y - 8 * s, 5.5 * s, 1.6 * s).fill(0xd9a46a).stroke(thin(lw * 0.8));
	g.circle(x - 0.7 * s, y - 8.2 * s, 0.8 * s).circle(x + 0.7 * s, y - 8.2 * s, 0.8 * s).fill(0xfff6e6);
}

/** A glass candy jar, its base centre at (x, y), full of sweets. */
function candyJar(g: Graphics, x: number, y: number, w: number, h: number, seed: number, lid = PINK): void {
	g.roundRect(x - w / 2, y - h, w, h, w * 0.25).fill({ color: GLASS, alpha: 0.95 }).stroke(thin(1.6));
	const r = Math.max(1.4, w / 9);
	for (let row = 0; row < Math.floor((h - 6) / (r * 1.8)); row++)
		for (let c = 0; c < Math.floor((w - 4) / (r * 2.1)); c++) {
			const cx = x - w / 2 + 2.6 + r + c * r * 2.1 + (row % 2 ? r * 0.6 : 0);
			const cy = y - 2.4 - r - row * r * 1.8;
			if (cx > x + w / 2 - 2) continue;
			g.circle(cx, cy, r).fill(CANDY[(seed + row * 3 + c) % CANDY.length]!);
		}
	g.rect(x - w / 2 + 2, y - h + 3, 2, h - 8).fill({ color: 0xffffff, alpha: 0.7 });
	g.roundRect(x - w / 2 - 1, y - h - 4, w + 2, 5, 2).fill(lid).stroke(thin(1.4));
	g.circle(x, y - h - 5, 1.8).fill(lid).stroke(thin(1));
}

/** A row of scallops, each `r` round, hanging from y between x0 and x1, in colours by turn. */
function scallops(g: Graphics, x0: number, x1: number, y: number, r: number, colours: number[], ink = 2): void {
	const n = Math.max(1, Math.round((x1 - x0) / (r * 2)));
	const step = (x1 - x0) / n;
	for (let i = 0; i < n; i++) {
		const cx = x0 + step * (i + 0.5);
		g.moveTo(cx - step / 2, y).arc(cx, y, step / 2, Math.PI, 0, true).closePath().fill(colours[i % colours.length]!).stroke(thin(ink));
	}
}

/** A striped awning from x0 to x1, its rod at y, `h` deep, then its scalloped hem. */
function awning(g: Graphics, x0: number, x1: number, y: number, h: number, a: number, b = 0xffffff, stripe = 14): void {
	const n = Math.max(2, Math.round((x1 - x0) / stripe));
	const sw = (x1 - x0) / n;
	for (let i = 0; i < n; i++) g.rect(x0 + i * sw, y, sw, h).fill(i % 2 ? b : a);
	g.rect(x0, y, x1 - x0, h).stroke(thin(1.8));
	scallops(g, x0, x1, y + h, sw / 2, [a, b], 1.6);
	g.roundRect(x0 - 3, y - 2.5, x1 - x0 + 6, 4, 2).fill(BRASS).stroke(thin(1.4));
}

/** Fairy lights strung along a dipping wire from x0 to x1. */
function fairyLights(g: Graphics, x0: number, x1: number, y: number, seed: number): void {
	const spans = Math.max(1, Math.round((x1 - x0) / 70));
	const sw = (x1 - x0) / spans;
	for (let i = 0; i < spans; i++) g.moveTo(x0 + i * sw, y).quadraticCurveTo(x0 + (i + 0.5) * sw, y + 9, x0 + (i + 1) * sw, y);
	g.stroke({ width: 1.2, color: INK, alpha: 0.55 });
	for (let i = 0; i < spans; i++)
		for (let k = 1; k < 5; k++) {
			const t = k / 5;
			const bx = x0 + (i + t) * sw;
			const by = y + 2 * 9 * t * (1 - t) + 2.4;
			g.ellipse(bx, by, 1.8, 2.4).fill(CANDY[(seed + i * 4 + k) % CANDY.length]!).stroke({ width: 0.9, color: INK });
		}
}

// --- Rooms ------------------------------------------------------------------------------------

/** A room's shell: candy-stripe wallpaper in its wall's colour (the project's, so rooms tell apart
 * and the cast stands out against a pale floor), a cream wainscot with its dado rail, a pale
 * checkerboard floor in a tint of it, the side walls and the frame; the awning along the top. */
function shell(g: Graphics, a: Area, wall: number, floor: number, vacant: boolean): void {
	const { x, y, w, h } = a.rect;
	const floorY = a.floorY;
	g.roundRect(x, y, w, h, 10).fill(wall);
	// The wallpaper: wide white stripes, a thin deeper pinstripe between, little dots in the colour.
	for (let cx = x + 6; cx < x + w; cx += 28) g.rect(cx, y, 13, floorY - y);
	g.fill({ color: 0xffffff, alpha: vacant ? 0.22 : 0.3 });
	for (let cx = x + 23.5; cx < x + w; cx += 28) g.rect(cx, y, 1.6, floorY - y);
	g.fill({ color: mix(wall, RASPBERRY, 0.3), alpha: 0.6 });
	for (let cx = x + 12.5, i = 0; cx < x + w; cx += 28, i++) for (let cy = y + 30 + (i % 2) * 11; cy < floorY - 40; cy += 22) g.circle(cx, cy, 1.7);
	g.fill({ color: 0xffffff, alpha: 0.9 });
	// The wainscot: cream panels under a dado rail in a deeper shade of the wall.
	const dado = floorY - 34;
	g.rect(x, dado, w, 34).fill(vacant ? 0xf2f2f2 : CREAM);
	for (let px = x + 8; px + 36 < x + w; px += 44) g.roundRect(px, dado + 8, 36, 20, 3);
	g.stroke({ width: 1.4, color: INK, alpha: 0.13 });
	g.rect(x, dado - 2, w, 6).fill(mix(wall, RASPBERRY, 0.25)).stroke(thin(1.4));
	// The floor: big pale checks in the floor's tint and a step deeper, a soft shine down the middle.
	const s = 32;
	g.rect(x, floorY, w, y + h - floorY).fill(floor);
	for (let j = 0, cy = floorY; cy < y + h; cy += s, j++) for (let i = 0, cx = x; cx < x + w; cx += s, i++) if ((i + j) % 2 === 0) g.rect(cx, cy, Math.min(s, x + w - cx), Math.min(s, y + h - cy));
	g.fill(mix(floor, wall, vacant ? 0.16 : 0.24));
	g.rect(x, floorY, w, 8).fill({ color: INK, alpha: 0.07 });
	g.moveTo(x, floorY).lineTo(x + w, floorY).stroke(line(4));
	// The awning along the top, in a deeper shade of the wall and white; a vacant room's is rolled up.
	if (vacant) g.roundRect(x + 10, y + 3, w - 20, 7, 3.5).fill(0xd9dde6).stroke(thin(2));
	else {
		awning(g, x + 6, x + w - 6, y + 4, 11, mix(wall, RASPBERRY, 0.38), 0xffffff, 18);
		fairyLights(g, x + 14, x + w - 14, y + 27, hash(a.id));
	}
	// Side walls: narrow strips with an inner edge, for a little depth.
	const sideTop = y + 100;
	g.rect(x, sideTop, 13, y + h - sideTop).fill(wall).moveTo(x + 13, sideTop).lineTo(x + 13, y + h).stroke(line(4));
	g.rect(x + w - 13, sideTop, 13, y + h - sideTop).fill(wall).moveTo(x + w - 13, sideTop).lineTo(x + w - 13, y + h).stroke(line(4));
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 10).stroke(line(5));
}

/** A shop window: a white frame, a little awning over it, and a cake stand on its sill. */
function shopWindow(g: Graphics, { x, y, w, h }: Rect, seed: number, accent: number): void {
	g.roundRect(x - 3, y - 3, w + 6, h + 6, 6).fill(0xffffff).stroke(line(3));
	g.roundRect(x, y, w, h, 4).fill(0xcfe6f2);
	g.rect(x + w / 2 - 2.5, y, 5, h).fill(0xffffff);
	g.roundRect(x + 2, y + 2, w - 4, h - 4, 3).stroke(line(3));
	awning(g, x - 6, x + w + 6, y - 9, 7, mix(accent, RASPBERRY, 0.35), 0xffffff, 12);
	// The sill, and what stands on it (a cake on a stand, jars, a loaf), by the window's seed.
	g.roundRect(x - 6, y + h - 1, w + 12, 8, 3).fill(0xffffff).stroke(thin(2));
	const sill = y + h - 1;
	g.rect(x + 22, sill - 7, 3, 7).fill(0xffffff).stroke(thin(1.2));
	g.ellipse(x + 23.5, sill - 7.5, 13, 2.4).fill(0xffffff).stroke(thin(1.2));
	layerCake(g, x + 23.5, sill - 9, 20, 14, CANDY[seed % CANDY.length]!, 0xffe0a0, seed);
	candyJar(g, x + w - 18, sill, 12, 16, seed, CANDY[(seed + 2) % CANDY.length]!);
	loaf(g, x + w / 2 + 12, sill, 0.8);
}

/** A glazed door out to the hallway: pastel, an arched window, a brass kick plate, an OPEN tag. */
function shopDoor(g: Graphics, c: Container, { x, y, w, h }: Rect, accent: number): void {
	g.rect(x - 5, y, w + 10, h).fill(0xffffff).stroke(line(4));
	g.roundRect(x + 2, y + 6, w - 4, h - 6, 3).fill(mix(accent, RASPBERRY, 0.15)).stroke(line(3));
	g.moveTo(x + 9, y + h * 0.55).lineTo(x + 9, y + 30).arc(x + w / 2, y + 30, w / 2 - 9, Math.PI, 0).lineTo(x + w - 9, y + h * 0.55).closePath().fill(0xcfe6f2).stroke(thin(2.5));
	g.rect(x + w / 2 - 1.5, y + 14, 3, h * 0.55 - 14).fill(0xffffff);
	g.roundRect(x + 6, y + h - 16, w - 12, 11, 2).fill(BRASS).stroke(thin(1.8));
	g.circle(x + w - 12, y + h * 0.64, 3).fill(BRASS).stroke(thin(1.4));
	// The tag on its string.
	const tx = x + w / 2;
	const ty = y + h * 0.36;
	g.moveTo(tx - 8, ty).lineTo(tx, ty - 8).lineTo(tx + 8, ty).stroke({ width: 1.2, color: INK });
	g.roundRect(tx - 15, ty, 30, 12, 3).fill(0xffffff).stroke(thin(1.6));
	const t = label("OPEN", 7, "800", RASPBERRY);
	t.position.set(tx - t.width / 2, ty + 2);
	c.addChild(t);
}

/** The door to your office, from the pick-up counter: mint, a round window with a cupcake on its
 * glass, the plate. */
function bakerDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	g.roundRect(x, y + 4, w, h - 4, 4).fill(MINT).stroke(line(5));
	g.roundRect(x + 6, y + 44, w - 12, h - 56, 3).stroke({ width: 2, color: INK, alpha: 0.25 });
	g.circle(x + w / 2, y + 70, 13).fill(0xcfe6f2).stroke(line(3));
	cupcake(g, x + w / 2, y + 78, 0.8, PINK, LEMON);
	g.roundRect(x + w - 16, y + h * 0.62, 9, 4, 2).fill(BRASS).stroke({ width: 1.5, color: INK });
	g.roundRect(x + 6, y + 18, w - 12, 20, 3).fill(RASPBERRY).stroke(thin(2));
	const t = label(BAKERY_WORDS.door, 10, "800", 0xffffff);
	t.position.set(x + w / 2 - t.width / 2, y + 21);
	return t;
}

const SIGNS: SignStyle = {
	sign: 0xffe3ee,
	signAlt: LEMON,
	whiteboard: 0xffffff,
	frame: 0xfff8e8,
	dress: (g, kind, x, y, w, h) => {
		if (kind === "whiteboard") {
			// A menu board: a scalloped pink trim along its top.
			scallops(g, x + 6, x + w - 6, y + 2, 5, [PINK_LIGHT, 0xffffff], 1.2);
		} else if (kind === "frame") {
			// A doily round the card: little lace holes all round its edge.
			for (let px = x + 8; px < x + w - 4; px += 9) g.circle(px, y + 4, 1.6).circle(px, y + h - 4, 1.6);
			for (let py = y + 12; py < y + h - 8; py += 9) g.circle(x + 4, py, 1.6).circle(x + w - 4, py, 1.6);
			g.fill({ color: PINK, alpha: 0.8 });
		} else {
			// A sign: a sprinkle in each corner.
			const d = (px: number, py: number, col: number, a: number) => g.poly(oval(px, py, 3, 1, a, 8)).fill(col);
			d(x + 6, y + 5, PINK, 0.5);
			d(x + w - 7, y + 5, MINT, -0.6);
			d(x + w - 8, y + h - 5, BLUEBERRY, 0.3);
		}
	},
};

function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [wall, floor] = coloursOf(a);
	const accent = mix(wall, RASPBERRY, 0.12);
	shell(g, a, wall, floor, a.kind === "vacant");
	const seed = hash(a.id);
	for (const [i, w] of a.wall.entries()) {
		if (w.kind === "window") shopWindow(g, w.rect, seed + i, accent);
		else if (w.kind === "door") shopDoor(g, c, w.rect, accent);
		else if (w.kind === "you") c.addChild(bakerDoor(g, w.rect));
		else if (w.kind !== "planner") c.addChild(signboard(w.kind, w.rect, w.slot ? sign(w.slot) : undefined, seed + i, SIGNS));
	}
	const { x, w } = a.rect;
	const f = a.floorY;
	if (a.kind === "lobby" || a.kind === "meeting") {
		// Bunting across the floor's back edge: the shop dressed for a party, every day.
		const flags = Math.floor((w - 30) / 16);
		g.moveTo(x + 14, f + 6).quadraticCurveTo(x + w / 2, f + 18, x + w - 14, f + 6).stroke({ width: 1.2, color: INK, alpha: 0.6 });
		for (let i = 0; i < flags; i++) {
			const t = (i + 0.5) / flags;
			const fx = x + 14 + t * (w - 28);
			const fy = f + 6 + 2 * 12 * t * (1 - t);
			g.poly([fx - 6, fy, fx + 6, fy, fx, fy + 10]).fill(CANDY[(seed + i) % CANDY.length]!).stroke(thin(1.1));
		}
	}
	if (a.kind === "kitchen") {
		// The café's floor runner.
		g.roundRect(x + 170, f + 140, 220, 34, 6).fill(mix(RASPBERRY, IVORY, 0.4)).stroke(thin(2));
		for (let k = 0; k < 9; k++) g.circle(x + 186 + k * 23.5, f + 157, 4).fill(IVORY);
	}
	if (a.kind === "lobby") {
		// The welcome mat, a heart on it, at the door.
		const door = a.wall.find((d) => d.kind === "door")?.rect;
		if (door) {
			g.roundRect(door.x - 6, f + 10, door.w + 12, 18, 4).fill(RASPBERRY).stroke(thin(2));
			const hx = door.x + door.w / 2;
			g.circle(hx - 3, f + 17, 3.4).circle(hx + 3, f + 17, 3.4).fill(IVORY);
			g.poly([hx - 6.2, f + 18, hx + 6.2, f + 18, hx, f + 25]).fill(IVORY);
		}
	}
	if (a.kind === "yours") {
		// Where to wait: a pink heart painted on the floor at each place in the queue.
		for (const [i, p] of (a.spots.line ?? []).entries()) {
			const hy = p.y + 3;
			g.circle(p.x - 4, hy - 2, 4.4).circle(p.x + 4, hy - 2, 4.4).fill({ color: i === 0 ? RASPBERRY : PINK, alpha: 0.6 });
			g.poly([p.x - 8.2, hy - 1, p.x + 8.2, hy - 1, p.x, hy + 8]).fill({ color: i === 0 ? RASPBERRY : PINK, alpha: 0.6 });
		}
	}
	if (a.kind === "vacant") {
		// Closed for icing: a dust sheet over a stack of chairs and an empty cake stand.
		const cx = x + w / 2;
		g.moveTo(cx - 60, f + 120).quadraticCurveTo(cx - 50, f + 50, cx - 10, f + 46).quadraticCurveTo(cx + 40, f + 40, cx + 56, f + 120).closePath().fill(0xf4f4f6).stroke(line(3));
		g.moveTo(cx - 30, f + 70).quadraticCurveTo(cx - 20, f + 96, cx - 34, f + 116).moveTo(cx + 10, f + 60).quadraticCurveTo(cx + 22, f + 92, cx + 14, f + 116).stroke({ width: 1.6, color: INK, alpha: 0.25 });
	}
}

/** The pastry conveyor: pastel tiles, the belt down the middle in a candy-striped frame, a heart
 * trim along each edge. Drawn in chunks, so every pattern keeps to world coordinates. */
function hallway(g: Graphics, r: Rect): void {
	g.rect(r.x, r.y, r.w, r.h).fill(0xfbeee6);
	const t = 26;
	const x0 = Math.floor(r.x / t) * t;
	for (let x = x0; x < r.x + r.w; x += t) for (let y = r.y, j = 0; y < r.y + r.h; y += t, j++) if ((Math.round(x / t) + j) % 2 === 0) g.rect(Math.max(x, r.x), y, Math.min(t, r.x + r.w - Math.max(x, r.x)), Math.min(t, r.y + r.h - y));
	g.fill({ color: PINK_LIGHT, alpha: 0.55 });
	const mid = r.y + r.h / 2;
	const bh = 30;
	// The frame: raspberry with white candy stripes, rivets, then the belt.
	g.rect(r.x, mid - bh / 2 - 7, r.w, bh + 14).fill(RASPBERRY);
	const sx0 = Math.floor(r.x / 18) * 18;
	for (let x = sx0; x < r.x + r.w; x += 18) {
		const a = Math.max(x, r.x);
		const b = Math.min(x + 8, r.x + r.w);
		if (b > a) g.rect(a, mid - bh / 2 - 7, b - a, 7).rect(a, mid + bh / 2, b - a, 7);
	}
	g.fill(0xffffff);
	g.rect(r.x, mid - bh / 2, r.w, bh).fill(MINT_LIGHT);
	const lx0 = Math.floor(r.x / 16) * 16;
	for (let x = lx0 + 6; x < r.x + r.w; x += 16) if (x >= r.x) g.rect(x, mid - bh / 2, 1.6, bh);
	g.fill({ color: MINT, alpha: 0.8 });
	g.moveTo(r.x, mid - bh / 2 - 7).lineTo(r.x + r.w, mid - bh / 2 - 7).moveTo(r.x, mid + bh / 2 + 7).lineTo(r.x + r.w, mid + bh / 2 + 7).stroke(line(3));
	g.moveTo(r.x, mid - bh / 2).lineTo(r.x + r.w, mid - bh / 2).moveTo(r.x, mid + bh / 2).lineTo(r.x + r.w, mid + bh / 2).stroke({ width: 1.6, color: INK, alpha: 0.6 });
	g.moveTo(r.x, r.y + 2.5).lineTo(r.x + r.w, r.y + 2.5).moveTo(r.x, r.y + r.h - 2.5).lineTo(r.x + r.w, r.y + r.h - 2.5).stroke(line(5));
}

// --- Desk props ---------------------------------------------------------------------------------

/** The macaron stand: a cake plate on a doily at the in-tray's spot, macarons stacking up in three
 * columns as the context fills; a tower over the rim past 60%, macarons rolled off past 80%; empty
 * while the lead has it out. While the lead plays `buried` the rig draws the stack, so this draws
 * nothing. */
function macaronStand(t: Tray, seed: string): Graphics {
	const g = batched();
	if (t.rig) return g;
	const { x, y, w, sheet } = PROPS.tray;
	const s = hash(seed);
	const base = y - 4;
	const level = t.out ? 0 : Math.min(10, t.sheets);
	const tw = (w - 2) / 3;
	const mh = Math.max(2.2, sheet * 1.9);
	const sc = tw / 13;
	const rows = Math.ceil(level / 2);
	const heap = t.out ? 0 : Math.max(0, t.sheets - 10);
	const lean = t.buried ? 3 : 0;
	const total = rows + Math.ceil(heap / 2);
	for (let r = 0; r < total; r++) {
		for (let c = 0; c < 3; c++) {
			const over = r >= rows;
			const mx = x + 1 + c * tw + tw / 2 + (over ? (lean * (r - rows + 1)) / 3 + (r % 2 ? 0.8 : -0.8) : 0);
			const my = base - 1 - r * mh;
			const k = s + r * 3 + c;
			g.roundRect(mx - 6 * sc, my - mh * 0.45, 12 * sc, mh * 0.45, 1.2).roundRect(mx - 6 * sc, my - mh, 12 * sc, mh * 0.5, 1.2).fill(CANDY[k % CANDY.length]!).stroke({ width: 0.8, color: INK });
			g.rect(mx - 5.2 * sc, my - mh * 0.52, 10.4 * sc, mh * 0.12).fill(IVORY);
		}
	}
	// The plate and its doily.
	g.ellipse(x + w / 2, base + 0.5, w / 2 + 4, 2.2).fill(0xffffff).stroke({ width: 1.2, color: INK });
	for (let k = 0; k < 7; k++) g.circle(x - 2 + ((w + 4) * (k + 0.5)) / 7, base + 1.8, 1.1);
	g.fill({ color: PINK, alpha: 0.9 });
	// Rolled off: onto the bench, then over the edge onto the floor.
	const off: [number, number][] = [
		[x + w + 7, y - 3],
		[x + w - 8, -30],
		[x - 4, 10],
	];
	for (const [i, [ox, oy]] of off.slice(0, t.spill).entries()) macaron(g, ox + wob(s, i) * 2, oy, 0.45, CANDY[(s + i) % CANDY.length]!);
	return g;
}

/** Cappuccinos on the bench, stacked three, two, one (a baker's mug). */
function cappuccinos(n: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.mugs;
	const rows = [3, 2, 1];
	let k = 0;
	for (let r = 0; r < rows.length && k < n; r++) {
		for (let i = 0; i < rows[r]! && k < n; i++, k++) {
			const mx = x + (i + r * 0.5) * (w + 1);
			const my = y - (r + 1) * h;
			g.poly([mx, my, mx + w, my, mx + w - 1, my + h - 1, mx + 1, my + h - 1]).fill(k % 3 === 1 ? PINK_LIGHT : 0xffffff).stroke({ width: 1, color: INK, join: "round" });
			g.rect(mx - 0.8, my + h - 1.2, w + 1.6, 1.2).fill(0xffffff).stroke({ width: 0.7, color: INK });
			g.ellipse(mx + w / 2, my + 0.4, w / 2 - 0.4, 1).fill(0xd9a46a);
		}
	}
	return g;
}

/** A sugar-glass cloche lamp on the bench's end, glowing green or red from the last tasting. */
function clocheLamp(lamp: Lamp): Graphics {
	const { x, y } = PROPS.lamp;
	const colour = lamp === "red" ? RED : GREEN;
	const g = batched();
	g.circle(x, y - 3, 13).fill({ color: colour, alpha: 0.22 });
	g.ellipse(x, y + 11, 8, 2.4).fill(0xffffff).stroke({ width: 1.2, color: INK });
	g.rect(x - 1.4, y + 4, 2.8, 7).fill(BRASS).stroke({ width: 1, color: INK });
	g.moveTo(x - 8, y + 4).lineTo(x - 8, y - 4).arc(x, y - 4, 8, Math.PI, 0).lineTo(x + 8, y + 4).closePath().fill({ color: colour, alpha: 0.85 }).stroke(line(1.6));
	g.rect(x - 5, y - 6, 2, 8).fill({ color: 0xffffff, alpha: 0.7 });
	g.circle(x, y - 13.5, 2).fill(BRASS).stroke({ width: 1, color: INK });
	return g;
}

/** Cake boxes stacked by the bench's end: a box per ~10 files; the full ones won't shut, a pastry
 * poking out under the lid. */
function cakeBoxes(n: number, full: number): Graphics {
	const g = batched();
	const { x, w, h } = PROPS.drawers;
	const top = -(n * h + 4);
	g.rect(x + 3, top + 3, w, -top).fill(SHADOW);
	for (let i = 0; i < n; i++) {
		const dy = top + 2 + i * h;
		const bulge = n - 1 - i < full;
		const dx = (i % 2 ? 1 : -1) * 1.2 + (bulge ? -3 : 0);
		const colour = [PINK_LIGHT, MINT_LIGHT, 0xfff3c4][i % 3]!;
		g.rect(x + dx, dy, w, h - 1).fill(colour).stroke(thin(1.4));
		g.rect(x + dx + w / 2 - 1, dy, 2, h - 1).fill(RASPBERRY);
		if (bulge) {
			g.poly([x + dx - 1, dy, x + dx + w + 1, dy - 3, x + dx + w + 1, dy - 1, x + dx - 1, dy + 2]).fill(colour).stroke(thin(1.1));
			croissant(g, x + dx + 6, dy + 1, 0.4);
		}
	}
	g.circle(x + w / 2 + 1, top + 1, 2).circle(x + w / 2 + 4, top + 0.5, 1.6).fill(RASPBERRY);
	return g;
}

/** The crumb bin by the bench, filled 0 to 5 loads with eggshells and spent piping bags. */
function crumbBin(load: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.skip;
	if (load > 0) {
		const heap = Math.min(5, load);
		for (let i = 0; i < heap * 2; i++) {
			const bx = x + 4 + ((i * 7) % (w - 8));
			const by = y - h + 1 - Math.floor(i / 2) * 2.2 + (i % 2);
			if (i % 3 === 0) g.poly([bx, by, bx + 7, by - 2, bx + 2, by + 2]).fill(0xffffff).stroke({ width: 0.9, color: INK, join: "round" });
			else g.moveTo(bx, by + 1).arc(bx + 3, by + 1, 3, Math.PI, 0).closePath().fill(0xfff4e0).stroke({ width: 0.9, color: INK });
		}
	}
	g.poly([x, y - h, x + w, y - h, x + w - 4, y, x + 4, y]).fill(PINK).stroke(line(2));
	g.moveTo(x + 6, y - h / 2).lineTo(x + w - 6, y - h / 2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
	return g;
}

// --- Furniture --------------------------------------------------------------------------------

/** The baker's bench: a marble top dusted with flour behind, and a front that is a glass pastry case
 * crammed with two shelves of croissants, donuts, éclairs, macarons and cupcakes, a scalloped
 * valance over it. 150 wide; the top's back edge at `back` (a work bench's is DESK_TOP, low enough
 * that its lead's face shows over it). The café's counter keeps plain cupboards (`display` false). */
function bench(g: Graphics, w = 150, flour = true, front = CREAM, display = true, back = -70): void {
	/** A height on the top, laid out for the full -70 top, squeezed onto this one. */
	const Y = (y: number) => -38 + ((y + 38) * (-38 - back)) / 32;
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, back, w + 24, -38 - back, 4).fill(MARBLE).stroke(line(4));
	g.moveTo(-w / 2 + 4, Y(-62)).quadraticCurveTo(-w / 2 + 40, Y(-54), -w / 2 + 70, Y(-64)).moveTo(w / 2 - 50, Y(-50)).quadraticCurveTo(w / 2 - 30, Y(-60), w / 2, Y(-56));
	g.stroke({ width: 1.2, color: CHROME_DARK, alpha: 0.35 });
	if (flour) {
		g.ellipse(w / 2 - 26, Y(-55), 18, 4 * ((-38 - back) / 32)).fill({ color: 0xffffff, alpha: 0.9 });
		for (let k = 0; k < 7; k++) g.circle(w / 2 - 44 + k * 6, Y(-60 + (k % 3) * 3), 0.9);
		g.fill({ color: 0xffffff, alpha: 0.9 });
	}
	g.roundRect(-w / 2, -44, w, 44, 3).fill(front).stroke(line(4));
	if (display) {
		const gx = -w / 2 + 6;
		const gw = w - 12;
		g.roundRect(gx, -38, gw, 27, 3).fill(GLASS).stroke(thin(2));
		g.rect(gx + 1, -25, gw - 2, 1.6).fill(0xffffff).stroke({ width: 0.8, color: INK, alpha: 0.4 });
		const n = Math.floor(gw / 17);
		const step = gw / n;
		for (let i = 0; i < n; i++) {
			const px = gx + step * (i + 0.5);
			switch (i % 4) {
				case 0:
					croissant(g, px, -26, 0.62);
					donut(g, px, -13, 0.62, CANDY[(i + 1) % CANDY.length]!, i);
					break;
				case 1:
					cupcake(g, px, -26, 0.58, CANDY[i % CANDY.length]!, CANDY[(i + 3) % CANDY.length]!);
					eclair(g, px, -13, 0.5, i % 2 ? CHOC : PINK);
					break;
				case 2:
					macaron(g, px - 3, -26, 0.5, CANDY[(i + 2) % CANDY.length]!);
					macaron(g, px + 3, -26, 0.5, CANDY[(i + 4) % CANDY.length]!);
					painAuChocolat(g, px, -13, 0.62);
					break;
				default:
					donut(g, px, -26, 0.62, CANDY[(i + 3) % CANDY.length]!, i);
					croissant(g, px, -13, 0.62);
			}
		}
		g.poly([gx + 4, -36, gx + 12, -36, gx + 4, -24]).fill({ color: 0xffffff, alpha: 0.7 });
		g.rect(-w / 2 + 3, -9, w - 6, 6).fill(mix(front, INK, 0.08));
		g.circle(-w / 2 + 12, -6, 1.6).circle(w / 2 - 12, -6, 1.6).fill(BRASS);
	} else {
		g.roundRect(-w / 2 + 8, -30, w / 2 - 12, 24, 3).roundRect(4, -30, w / 2 - 12, 24, 3).stroke({ width: 2, color: INK, alpha: 0.3 });
		g.circle(-6, -18, 2.4).circle(10, -18, 2.4).fill(BRASS).stroke(thin(1));
	}
	scallops(g, -w / 2 + 2, w / 2 - 2, -44, 6, [PINK, PINK_LIGHT], 1.4);
	g.rect(-w / 2 + 3, -4, w - 6, 4).fill({ color: INK, alpha: 0.15 });
}

/** The till's screen, its stand's foot at the origin (propspots.ts MONITOR, at its size): a pink
 * foot and neck, a pink bezel in an ink outline round a face of `face`, a receipt peeping out of
 * its top. */
function till(g: Graphics, face: number): void {
	const { w, h, neck } = MONITOR;
	g.roundRect(-10, -3, 20, 4.4, 2).fill(PINK).stroke(thin(1.6));
	g.rect(-3, -neck - 1, 6, neck).fill(PINK).stroke(thin(1.6));
	g.poly([w / 2 - 15, -neck - h + 1, w / 2 - 6, -neck - h + 1, w / 2 - 7, -neck - h - 1, w / 2 - 14, -neck - h - 1]).fill(0xffffff).stroke({ width: 1.2, color: INK, join: "round" });
	g.roundRect(-w / 2, -neck - h, w, h, 5).fill(PINK).stroke(line(4));
	g.roundRect(-w / 2 + 4, -neck - h + 4, w - 8, h - 8, 2.5).fill(face);
	g.rect(-w / 2 + 6, -neck - h + 6, 3, h - 14).fill({ color: 0xffffff, alpha: 0.18 });
}

/** Station bodies: between ST_L (toward the wall) and ST_R (toward the user), tops at the point. */
const ST_L = -24;
const ST_R = 24;

/** The deck oven's window, from the build station's base: office/ambient.ts glows over it. */
const OVEN_WINDOW = { x: ST_L + 5, y: -29, w: ST_R - ST_L - 10, h: 15 } as const;

function furniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	const w = ST_R - ST_L;
	switch (kind) {
		case "desk":
			bench(g, 150, true, CREAM, true, DESK_TOP);
			break;
		case "table": {
			// The tasting table: a gingham cloth over a long table, plates and forks, a croquembouche at
			// one end and a teapot at the other, a cake stand in the middle (the cake on it turns:
			// office/ambient.ts `cakeStand`).
			g.rect(-90 + 5, -44 + 6, 180, 44).fill(SHADOW);
			g.roundRect(-100, -70, 200, 32, 4).fill(0xffffff).stroke(line(4));
			g.roundRect(-92, -44, 184, 40, 3).fill(0xffffff).stroke(line(4));
			for (let x = -88; x < 88; x += 10) g.rect(x, -44, 5, 38);
			for (let y = -40; y < -6; y += 10) g.rect(-92, y, 184, 5);
			g.fill({ color: PINK, alpha: 0.45 });
			scallops(g, -92, 92, -6, 6, [0xffffff], 2);
			for (const px of [-62, 62]) g.ellipse(px, -55, 13, 3.6).fill(0xffffff).stroke(thin(1.6));
			macaron(g, -62, -54, 0.6, MINT);
			eclair(g, 62, -54, 0.6, PINK);
			// The croquembouche: a cone of choux, spun sugar round it.
			for (let row = 0; row < 6; row++) {
				const n = 6 - row;
				for (let i = 0; i < n; i++) g.circle(-88 + 8 + i * 7 - (n * 7) / 2 + 20, -64 - row * 6, 3.8);
			}
			g.fill(CRUST_LIGHT).stroke(thin(1.1));
			g.moveTo(-82, -66).bezierCurveTo(-60, -80, -84, -92, -66, -102).stroke({ width: 1, color: BRASS });
			g.circle(-68, -102, 2.2).fill(CHERRY).stroke(thin(1));
			// The teapot.
			g.ellipse(86, -66, 11, 9).fill(MINT).stroke(thin(2));
			g.poly([95, -66, 104, -74, 104, -71, 97, -62]).fill(MINT).stroke(thin(1.6));
			g.circle(86, -76, 2.6).fill(PINK).stroke(thin(1.2));
			// The stand's pedestal (the cake is the ambient's).
			g.rect(-3, -84, 6, 16).fill(0xffffff).stroke(thin(1.6));
			g.ellipse(0, -68, 12, 3).fill(0xffffff).stroke(thin(1.6));
			g.ellipse(0, -85, 24, 4.6).fill(0xffffff).stroke(thin(2));
			break;
		}
		case "counter": {
			// The café's counter: the espresso machine, a glass dome over a cake, cups and the tip jar.
			// Its steam (office/ambient.ts `steam`) rises from (-36, -128).
			bench(g, 130, false, mix(CHOC, CREAM, 0.7), false);
			// The machine: a chrome body, a brass dome and its eagle-less crest, two groups, lights.
			g.rect(-70, -78, 58, 6).fill(SHADOW);
			g.roundRect(-68, -112, 64, 40, 6).fill(CHROME).stroke(line(3));
			g.roundRect(-64, -108, 56, 10, 3).fill(RASPBERRY).stroke(thin(1.6));
			for (let k = 0; k < 5; k++) g.circle(-58 + k * 11, -103, 1.8);
			g.fill(0xffffff);
			g.moveTo(-54, -112).quadraticCurveTo(-54, -128, -36, -127).quadraticCurveTo(-18, -128, -18, -112).closePath().fill(BRASS).stroke(line(2.5));
			g.circle(-36, -128, 3).fill(BRASS).stroke(thin(1.4));
			g.circle(-36, -88, 6).fill(0xffffff).stroke(thin(1.6));
			g.moveTo(-36, -88).lineTo(-33, -91).stroke({ width: 1.2, color: RED });
			for (const gx of [-56, -16]) {
				g.roundRect(gx - 6, -80, 12, 5, 2).fill(CHROME_DARK).stroke(thin(1.4));
				g.rect(gx - 1, -76, 2, 4).fill(INK);
				g.rect(gx + 4, -80, 10, 2.6).fill(INK);
			}
			cup(g, -56, -70, 0.7, PINK_LIGHT);
			cup(g, -16, -70, 0.7);
			// The wand, and a jug of milk.
			g.moveTo(-6, -96).lineTo(2, -80).stroke({ width: 2, color: CHROME_DARK, cap: "round" });
			g.poly([0, -80, 8, -80, 7, -70, 1, -70]).fill(CHROME).stroke(thin(1.4));
			// The cake under its glass dome.
			g.ellipse(32, -72, 19, 4).fill(0xffffff).stroke(thin(1.6));
			layerCake(g, 32, -74, 26, 16, LEMON, 0xffd9a0, 4);
			g.moveTo(14, -73).lineTo(14, -90).arc(32, -90, 18, Math.PI, 0).lineTo(50, -73).fill({ color: GLASS, alpha: 0.35 }).stroke(thin(1.8));
			g.circle(32, -110, 2.4).fill(BRASS).stroke(thin(1));
			g.rect(18, -100, 2.4, 18).fill({ color: 0xffffff, alpha: 0.8 });
			// The tip jar.
			candyJar(g, 60, -66, 10, 12, 3, MINT);
			break;
		}
		case "chair":
			// A bistro stool: a pink cushion on curly brass legs.
			g.rect(-18 + 4, -40 + 4, 36, 40).fill(SHADOW);
			g.moveTo(-12, 0).quadraticCurveTo(-16, -16, -8, -26).moveTo(12, 0).quadraticCurveTo(16, -16, 8, -26).moveTo(0, 0).lineTo(0, -26);
			g.stroke({ width: 3, color: BRASS, cap: "round" });
			g.moveTo(-10, -10).lineTo(10, -10).stroke({ width: 2, color: BRASS });
			g.roundRect(-19, -40, 38, 14, 7).fill(PINK).stroke(line(3));
			for (const bx of [-9, 0, 9]) g.circle(bx, -33, 1.4).fill(RASPBERRY);
			break;
		case "plant": {
			// A bucket of giant lollipops and a candy cane, where the office keeps a plant.
			g.rect(-15, -40 + 5, 34, 40).fill(SHADOW);
			g.moveTo(-8, -40).lineTo(-8, -108).stroke({ width: 5, color: 0xffffff, cap: "round" });
			g.moveTo(-8, -108).arc(-1, -108, 7, Math.PI, 0).stroke({ width: 5, color: 0xffffff, cap: "round" });
			for (let k = 0; k < 8; k++) g.moveTo(-10.5, -46 - k * 8).lineTo(-5.5, -51 - k * 8);
			g.stroke({ width: 2.4, color: CHERRY });
			lollipop(g, 8, -96, 15, 56, PINK);
			lollipop(g, -10, -74, 11, 34, MINT, LEMON);
			lollipop(g, 12, -62, 9, 22, LILAC);
			g.poly([-17, -40, 17, -40, 13, 0, -13, 0]).fill(0xffffff).stroke(line(3.5));
			for (let k = -12; k <= 12; k += 8) g.poly([k - 2.5, -40, k + 2.5, -40, k * 0.8 + 2, 0, k * 0.8 - 2, 0]);
			g.fill({ color: PINK, alpha: 0.85 });
			g.poly([-17, -40, 17, -40, 13, 0, -13, 0]).stroke(line(3.5));
			g.roundRect(-19, -44, 38, 6, 3).fill(0xffffff).stroke(thin(2));
			break;
		}
		case "lamp":
			// A candy-cane lamp post, its shade a cupcake liner.
			g.rect(-2.5, -96, 5, 96).fill(0xffffff).stroke(thin(1.4));
			for (let k = 0; k < 12; k++) g.poly([-2.5, -90 + k * 8, 2.5, -94 + k * 8, 2.5, -91 + k * 8, -2.5, -87 + k * 8]).fill(CHERRY);
			g.roundRect(-14, -4, 28, 6, 3).fill(INK);
			g.poly([-16, -100, 16, -100, 10, -88, -10, -88]).fill(PINK).stroke(line(3));
			g.circle(0, -86, 6).fill(HEAT).stroke({ width: 2, color: INK });
			break;
		case "cooler": {
			// The pink lemonade dispenser on its stand: a glass jar with lemon slices, its tap.
			g.rect(-18, -40 + 5, 42, 40).fill(SHADOW);
			g.roundRect(-21, -40, 42, 40, 4).fill(0xffffff).stroke(line(4));
			for (let x = -18; x < 20; x += 8) g.rect(x, -38, 4, 36);
			g.fill({ color: MINT, alpha: 0.7 });
			g.roundRect(-21, -40, 42, 40, 4).stroke(line(4));
			g.roundRect(-17, -96, 34, 56, 8).fill({ color: GLASS, alpha: 0.95 }).stroke(line(3));
			g.roundRect(-14, -82, 28, 39, 6).fill({ color: PINK, alpha: 0.75 });
			for (const [lx, ly] of [[-6, -70], [6, -60], [-3, -52]] as const) {
				g.circle(lx, ly, 5).fill(LEMON).stroke(thin(1.2));
				for (let k = 0; k < 4; k++) g.moveTo(lx, ly).lineTo(lx + Math.cos((k * Math.PI) / 2) * 4, ly + Math.sin((k * Math.PI) / 2) * 4);
				g.stroke({ width: 0.8, color: 0xffffff });
			}
			g.rect(-11, -92, 3, 46).fill({ color: 0xffffff, alpha: 0.7 });
			g.roundRect(-19, -102, 38, 8, 3).fill(MINT).stroke(thin(2));
			g.roundRect(9, -48, 10, 6, 2).fill(CHROME).stroke(thin(1.6));
			cup(g, 13, -40, 0.7, PINK_LIGHT);
			break;
		}
		case "fridge": {
			// The cake cabinet, stacked to the ceiling: a mint case, four glass shelves of cakes,
			// cupcakes, donuts and a macaron tower, a scalloped crown on top.
			g.rect(-38, -150, 84, 156).fill(SHADOW);
			g.roundRect(-42, -150, 84, 150, 6).fill(MINT).stroke(line(4));
			g.roundRect(-36, -140, 72, 118, 4).fill(GLASS).stroke(line(3));
			const shelves = [-112, -84, -56];
			for (const sy of shelves) g.rect(-36, sy, 72, 3).fill(0xffffff).stroke(thin(1.4));
			// Top shelf: a tall cake.
			layerCake(g, -14, -112, 30, 22, PINK, 0xffe0a0, 1);
			macaron(g, 16, -112, 0.9, LILAC);
			macaron(g, 16, -122, 0.9, LEMON);
			// Cupcakes.
			for (let k = 0; k < 4; k++) cupcake(g, -26 + k * 17, -84, 0.85, CANDY[k]!, CANDY[(k + 3) % 6]!);
			// Donuts.
			for (let k = 0; k < 4; k++) donut(g, -25 + k * 17, -56, 0.95, CANDY[(k + 2) % 6]!, k);
			// Bottom: a macaron tower and éclairs.
			for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - r; i++) macaron(g, -22 + i * 9 + r * 4.5, -22 - r * 7, 0.6, CANDY[(i + r) % 6]!);
			eclair(g, 18, -28, 0.75, PINK);
			eclair(g, 18, -22, 0.75, CHOC);
			g.rect(-30, -136, 3, 110).fill({ color: 0xffffff, alpha: 0.6 });
			g.roundRect(-36, -18, 72, 12, 3).fill(0xffffff).stroke(thin(2));
			g.roundRect(-10, -15, 20, 5, 2).fill(BRASS);
			// The crown.
			g.roundRect(-46, -158, 92, 10, 4).fill(0xffffff).stroke(thin(2.5));
			scallops(g, -42, 42, -148, 6, [PINK, 0xffffff], 1.6);
			g.circle(0, -162, 5).fill(CHERRY).stroke(thin(1.6));
			break;
		}
		case "sofa": {
			// A row of giant macaron poufs: strawberry, pistachio, lemon.
			for (const [i, sx] of [-50, 0, 50].entries()) {
				const shell = [PINK, MINT, LEMON][i]!;
				g.ellipse(sx + 4, -2, 26, 5).fill(SHADOW);
				g.roundRect(sx - 25, -26, 50, 24, 12).fill(shell).stroke(line(3.5));
				for (let k = -20; k <= 20; k += 5) g.circle(sx + k, -4, 2.2);
				g.fill(mix(shell, INK, 0.12));
				g.roundRect(sx - 23, -34, 46, 9, 4).fill(IVORY).stroke(thin(2));
				g.roundRect(sx - 25, -58, 50, 26, 13).fill(shell).stroke(line(3.5));
				g.ellipse(sx - 8, -50, 9, 3.4).fill({ color: 0xffffff, alpha: 0.5 });
			}
			break;
		}
		case "cabinet": {
			// The bread rack: wooden shelves of loaves, a basket of baguettes on top.
			g.rect(-33, -104, 4, 104).rect(29, -104, 4, 104).fill(WOOD_DARK);
			for (let i = 0; i < 4; i++) {
				const y = -96 + i * 26;
				g.rect(-31, y, 62, 4).fill(WOOD).stroke({ width: 1.2, color: INK });
				for (let k = 0; k < 3; k++) {
					if (i % 2) loaf(g, -20 + k * 20, y, 0.85);
					else croissant(g, -20 + k * 20, y, 0.9);
				}
			}
			g.rect(-33, -104, 66, 104).stroke(line(3));
			for (let k = 0; k < 4; k++) baguette(g, -10 + k * 7, -118, 34, -1.2 + k * 0.18);
			g.poly([-24, -112, 24, -112, 20, -100, -20, -100]).fill(WOOD).stroke(thin(2));
			break;
		}
		case "pod": {
			// The giant cupcake: a pleated liner with a round nook to nap in (the napper shows in it,
			// over the nook), a mountain of frosting, sprinkles and a cherry the size of a head.
			g.ellipse(4, 2, 84, 10).fill(SHADOW);
			g.poly([-80, -62, 80, -62, 70, 0, -70, 0]).fill(MINT).stroke(line(4));
			for (let k = -70; k <= 70; k += 14) g.poly([k - 4, -62, k + 4, -62, k * 0.875 + 3.5, 0, k * 0.875 - 3.5, 0]);
			g.fill({ color: 0xffffff, alpha: 0.45 });
			g.poly([-80, -62, 80, -62, 70, 0, -70, 0]).stroke(line(4));
			g.circle(-36, -33, 22).fill(CHOC_DARK).stroke(line(3));
			g.circle(-36, -33, 17).fill(CHOC);
			// The frosting, piped in rings.
			const rings: [number, number, number][] = [
				[-70, 84, 14],
				[-88, 70, 13],
				[-104, 52, 12],
				[-118, 34, 11],
				[-130, 16, 9],
			];
			for (const [ry, rx, rr] of rings) g.roundRect(-rx, ry - rr, rx * 2, rr * 2, rr).fill(PINK).stroke(line(3));
			for (const [ry, rx] of rings) g.ellipse(-rx * 0.4, ry - 4, rx * 0.3, 2.6).fill({ color: 0xffffff, alpha: 0.55 });
			for (let k = 0; k < 26; k++) {
				const ri = k % rings.length;
				const [ry, rx] = rings[ri]!;
				const px = -rx + 8 + ((k * 37) % Math.max(10, rx * 2 - 16));
				g.poly(oval(px, ry + ((k * 13) % 9) - 4, 3.4, 1.2, (k * 0.7) % Math.PI, 8)).fill(CANDY[k % CANDY.length]!);
			}
			g.circle(4, -150, 12).fill(CHERRY).stroke(line(3));
			g.ellipse(0, -154, 4, 2.6).fill({ color: 0xffffff, alpha: 0.6 });
			g.moveTo(6, -161).quadraticCurveTo(10, -176, 22, -178).stroke({ width: 2.4, color: 0x3f8f5f, cap: "round" });
			// A little sign: NAPS, on the liner.
			g.roundRect(14, -46, 46, 20, 4).fill(0xffffff).stroke(thin(2));
			g.roundRect(20, -40, 24, 4, 2).fill(RASPBERRY);
			g.roundRect(20, -33, 16, 3, 1.5).fill(INK);
			break;
		}
		case "screen-lit":
			// The till's screen: a pink till round a slate face, mint lines and a heart on it.
			till(g, 0x39446e);
			g.rect(-17, -46, 17, 3.5).rect(-17, -39, 22, 3.5).rect(-8, -32, 9, 3).fill(MINT);
			g.circle(11.4, -33.6, 2.2).circle(14.6, -33.6, 2.2).fill(PINK);
			g.poly([9.3, -33, 16.7, -33, 13, -29.4]).fill(PINK);
			break;
		case "screen-off":
			till(g, 0xc9bfd6);
			break;
		case "files": {
			// The pastry case (reference): a cupboard under a glass case of croissants and pains au
			// chocolat, its top at the point (the drawer the hands pull: the rig).
			g.rect(ST_L + 4, -47 + 5, w, 47).fill(SHADOW);
			g.roundRect(ST_L, -20, w, 20, 3).fill(PINK).stroke(line(3.5));
			g.roundRect(ST_L + 6, -15, w - 12, 10, 2).stroke({ width: 1.6, color: INK, alpha: 0.35 });
			g.roundRect(ST_L, -47, w, 28, 3).fill(GLASS).stroke(line(3.5));
			g.rect(ST_L + 2, -33, w - 4, 2).fill(0xffffff);
			croissant(g, ST_L + 13, -34, 0.75);
			croissant(g, ST_R - 13, -34, 0.75);
			painAuChocolat(g, ST_L + 13, -21, 0.75);
			painAuChocolat(g, ST_R - 13, -21, 0.75);
			g.rect(ST_L + 4, -45, 2.4, 22).fill({ color: 0xffffff, alpha: 0.7 });
			g.roundRect(ST_L - 2, -49, w + 4, 5, 2).fill(0xffffff).stroke(thin(2));
			break;
		}
		case "catalogue": {
			// The sweet shelf (search): candy jars in a row on a shelf on legs.
			g.rect(ST_L + 4, -42 + 5, w, 42).fill(SHADOW);
			g.rect(ST_L + 4, -10, 5, 10).rect(ST_R - 9, -10, 5, 10).fill(WOOD_DARK);
			g.roundRect(ST_L, -12, w, 5, 2).fill(WOOD).stroke(thin(2.5));
			candyJar(g, ST_L + 8, -12, 13, 22, 1, PINK);
			candyJar(g, 0, -12, 13, 26, 3, MINT);
			candyJar(g, ST_R - 8, -12, 13, 20, 5, LEMON);
			g.roundRect(ST_L - 2, -44, w + 4, 6, 2).fill(WOOD).stroke(thin(2.5));
			lollipop(g, ST_L + 5, -50, 5, 6, LILAC);
			break;
		}
		case "copier": {
			// The deck oven (build): a brick body under the point, its glowing window full of loaves (the
			// rig's lid works on top; the glow flickers: office/ambient.ts `ovens`).
			g.rect(ST_L + 4, -40 + 5, w, 40).fill(SHADOW);
			g.roundRect(ST_L, -40, w, 40, 3).fill(BRICK).stroke(line(4));
			for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.rect(ST_L + 2 + c * 12 + (r % 2 ? 6 : 0), -38 + r * 9, 1.2, 8);
			for (let r = 1; r < 4; r++) g.rect(ST_L + 1, -40 + r * 9 + 2, w - 2, 1.2);
			g.fill({ color: BRICK_DARK, alpha: 0.6 });
			g.roundRect(OVEN_WINDOW.x - 2, OVEN_WINDOW.y - 2, OVEN_WINDOW.w + 4, OVEN_WINDOW.h + 4, 4).fill(COPPER).stroke(thin(2));
			g.roundRect(OVEN_WINDOW.x, OVEN_WINDOW.y, OVEN_WINDOW.w, OVEN_WINDOW.h, 3).fill(0x5a2c1e);
			loaf(g, -8, -16, 0.55);
			loaf(g, 8, -16, 0.55);
			g.rect(OVEN_WINDOW.x, OVEN_WINDOW.y + OVEN_WINDOW.h - 4, OVEN_WINDOW.w, 2).fill({ color: HEAT, alpha: 0.8 });
			g.roundRect(ST_L + 8, -9, w - 16, 3, 1.5).fill(BRASS).stroke(thin(1));
			g.roundRect(ST_L - 2, -42, w + 4, 5, 2).fill(COPPER).stroke(thin(2));
			break;
		}
		case "stamps": {
			// The tasting stand (test): a little pastel table under the point, a jar of cake testers.
			g.rect(ST_L + 4, -38 + 5, w, 38).fill(SHADOW);
			g.moveTo(ST_L + 6, 0).quadraticCurveTo(ST_L + 4, -18, ST_L + 8, -32).moveTo(ST_R - 6, 0).quadraticCurveTo(ST_R - 4, -18, ST_R - 8, -32);
			g.stroke({ width: 3.4, color: BRASS, cap: "round" });
			g.rect(ST_L + 8, -14, w - 16, 2.6).fill(BRASS);
			g.roundRect(ST_L + 1, -54, 10, 15, 2).fill(GLASS).stroke({ width: 2, color: INK });
			for (const x of [ST_L + 4, ST_L + 6, ST_L + 8.5]) g.rect(x, -60, 1.2, 12).fill(WOOD_DARK);
			g.roundRect(ST_L - 2, -38, w + 4, 8, 3).fill(MINT).stroke(line(3.5));
			scallops(g, ST_L, ST_R, -30, 4, [MINT_LIGHT], 1.2);
			break;
		}
		case "phone": {
			// The order line (web): a slim stand, a pink telephone on its wall end, the order pad at
			// the point (the handset and the pad: the rig).
			g.rect(ST_L + 8, -38 + 5, w - 8, 38).fill(SHADOW);
			g.roundRect(-5, -32, 10, 30, 3).fill(BRASS).stroke(line(3));
			g.roundRect(ST_L + 2, -4, w - 4, 6, 3).fill(BRASS).stroke(line(3));
			g.roundRect(ST_L - 2, -38, w + 4, 7, 3).fill(0xffffff).stroke(line(3.5));
			g.roundRect(ST_L + 1, -50, 22, 13, 5).fill(PINK).stroke(line(3));
			g.circle(ST_L + 12, -44, 3.4).fill(0xffffff).stroke(thin(1.2));
			break;
		}
		case "outbox": {
			// The pick-up shelf (outbox): a shelf on legs, cake boxes tied with ribbon on its lower
			// tier, a striped canopy over it (the shelf's top and what goes on it: the rig).
			g.rect(ST_L + 4, -36 + 5, w, 36).fill(SHADOW);
			g.rect(ST_L + 2, -36, 4, 36).rect(ST_R - 6, -36, 4, 36).fill(BRASS);
			g.rect(ST_L + 2, -12, w - 4, 3).fill(BRASS);
			for (const [i, bx] of [-12, 2].entries()) {
				g.rect(ST_L + 16 + bx, -23, 15, 11).fill(i ? MINT_LIGHT : PINK_LIGHT).stroke(thin(1.4));
				g.rect(ST_L + 22.5 + bx, -23, 2, 11).fill(RASPBERRY);
			}
			g.rect(-2, -84, 4, 34).fill(0xffffff).stroke(thin(1));
			awning(g, -18, 18, -86, 6, PINK, 0xffffff, 6);
			break;
		}
		case "shredder": {
			// The crumb bin: a pink pedal bin with a swing lid, its top just under the working point (the
			// slot and the pile: the rig). A cookie stencilled on its front.
			g.rect(-14, -38 + 5, 32, 38).fill(SHADOW);
			g.poly([-18, -38, 14, -38, 11, 0, -15, 0]).fill(PINK).stroke(line(4));
			g.rect(-14, -26, 22, 3).fill({ color: 0xffffff, alpha: 0.6 });
			g.circle(-2, -13, 5).fill({ color: 0xffffff, alpha: 0.7 });
			g.circle(-4, -14, 1).circle(0, -11, 1).fill(PINK);
			g.roundRect(-12, 0, 8, 3, 1.5).fill(CHROME_DARK);
			break;
		}
		case "tickets": {
			// Take a number: a candy-cane post, a pink dispenser, a ticket curling out.
			g.roundRect(-10, -4, 20, 4, 2).fill(INK);
			g.rect(-2.5, -52, 5, 50).fill(0xffffff).stroke(thin(1));
			for (let k = 0; k < 6; k++) g.poly([-2.5, -46 + k * 8, 2.5, -50 + k * 8, 2.5, -47 + k * 8, -2.5, -43 + k * 8]).fill(CHERRY);
			g.roundRect(-15, -78, 30, 28, 6).fill(PINK).stroke(line(3));
			g.rect(-10, -72, 20, 4).fill(INK);
			g.poly([-6, -68, 6, -68, 8, -50, -4, -52]).fill(0xffffff).stroke({ width: 1.5, color: INK, join: "round" });
			g.rect(-3, -62, 6, 1.6).fill(RED);
			break;
		}
		case "bell": {
			// A little glass counter of cookies by your door, centred under the bell's plunger
			// (rigpoints.ts), the service bell on it: the same bell the rig draws over while it rings.
			g.rect(-14, -31 + 5, 32, 31).fill(SHADOW);
			g.roundRect(-18, -24, 36, 24, 3).fill(GLASS).stroke(line(3));
			for (let k = 0; k < 3; k++) g.circle(-10 + k * 10, -8, 4).fill(DOUGH).stroke(thin(1));
			for (let k = 0; k < 3; k++) g.circle(-11 + k * 10, -9, 0.9).circle(-9 + k * 10, -7, 0.9).fill(CHOC_DARK);
			g.roundRect(-18, -31, 36, 7, 2).fill(0xffffff).stroke(line(3));
			g.moveTo(-6, -31).arc(0, -31, 6, Math.PI, 0).closePath().fill(0xf2bd3c).stroke(line(2));
			g.rect(-1, -41, 2, 4).fill(INK);
			g.circle(0, -41.5, 1.8).fill(INK);
			break;
		}
	}
	return g;
}

// --- The crew build -------------------------------------------------------------------------------

const SPONGES = [0xffe0a0, 0xffd38a, 0xf7c46c, 0xffe7b0];
const ICINGS = [PINK, MINT, LEMON, LILAC];

/** The crew's tiered cake: sponge after sponge, a frosting band and a drip on each, and a candle with
 * a cherry and a "fresh" flag on top once the PR is up. */
const CAKE_BUILD = {
	piece: (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		// `k` steps by 3 a piece (build.ts): every third piece is a chocolate layer.
		const n = Math.floor(k / 3);
		g.rect(x, y, w, h).fill(n % 3 === 1 ? CHOC : SPONGES[k % SPONGES.length]!);
		const icing = ICINGS[n % ICINGS.length]!;
		g.rect(x, y, w, 2.6).fill(icing);
		g.roundRect(x + 2 + (k % 3) * 2.5, y + 1, 2.2, 3.4 + (k % 2), 1.1).fill(icing);
		g.rect(x, y + h - 2.4, w, 1.6).fill(IVORY);
		g.circle(x + w * 0.7, y + h * 0.55, 0.8).fill(CANDY[k % CANDY.length]!);
		g.rect(x, y, w, h).stroke({ width: 1.4, color: INK });
	},
	flag: (f: Graphics, top: { x: number; y: number }) => {
		f.rect(top.x - 1.6, top.y - 14, 3.2, 14).fill(0xffffff).stroke({ width: 1.1, color: INK });
		f.rect(top.x - 1.6, top.y - 10, 3.2, 2).rect(top.x - 1.6, top.y - 5, 3.2, 2).fill(PINK);
		f.ellipse(top.x, top.y - 18, 2.4, 3.8).fill(HEAT).stroke({ width: 1, color: INK });
		f.ellipse(top.x, top.y - 17.2, 1, 1.8).fill(0xfff3b0);
		f.circle(top.x + 6, top.y - 2.6, 3.2).fill(CHERRY).stroke({ width: 1.2, color: INK });
		f.moveTo(top.x - 5, top.y).lineTo(top.x - 5, top.y - 24).stroke({ width: 1.6, color: INK });
		f.moveTo(top.x - 5, top.y - 24).lineTo(top.x - 20, top.y - 20).lineTo(top.x - 20, top.y - 13).lineTo(top.x - 5, top.y - 15).closePath().fill(PINK).stroke({ width: 1.4, color: INK });
		f.circle(top.x - 12.5, top.y - 18.5, 1.6).fill(0xffffff);
	},
};

/** The order board: the planner as a chalkboard in a scalloped pink frame, three columns of order
 * cards pegged on strings, a card per todo with its session's colour along the top; the boxed ones
 * tied with a ribbon. */
const BANDS = [0xff5a7a, 0x3d7dff, 0x2fbf83, 0xff9a2e, 0xb07ae8, 0xe8b84a];

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

// --- Staging (world/staging.ts): the pastry conveyor, the pick-up hatch ---------------------

/** A line's belt (should the bakery ever run its benches as lines): a mint belt in a candy frame. */
function belt(g: Graphics, w: number): void {
	g.rect(4, 2, w, 14).fill(SHADOW);
	for (let x = 10; x < w; x += 120) g.rect(x, 6, 5, 10);
	g.fill(BRASS);
	g.rect(0, -8, w, 8).fill(MINT_LIGHT);
	g.roundRect(-2, 0, w + 4, 8, 2).fill(RASPBERRY).stroke(line(2.5));
	for (let x = 4; x < w; x += 12) g.rect(x, 2, 5, 4);
	g.fill(0xffffff);
	g.moveTo(0, -8).lineTo(w, -8).stroke({ width: 2, color: INK });
}

function slats(g: Graphics, w: number, pitch: number): void {
	for (let x = -pitch; x < w; x += pitch) g.rect(x, -7, 2, 6);
	g.fill({ color: MINT, alpha: 0.8 });
}

function rollers(g: Graphics, w: number, pitch: number): void {
	const cap = pitch + 2;
	for (const x of [-cap + 2, w - 2]) {
		g.roundRect(x, -10, cap, 18, 4).fill(PINK_LIGHT).stroke(line(2.5));
		g.circle(x + cap / 2, -1, 3).fill(RASPBERRY);
	}
}

/** A pastry for each kind of work: a croissant (read), a donut (web), a macaron (search), an éclair
 * (edit), a loaf (shell), a cupcake (test). About 14 px, its base at y = 0. */
function pastry(g: Graphics, kind: string): void {
	switch (kind) {
		case "read":
			croissant(g, 0, 0, 0.85);
			break;
		case "web":
			donut(g, 0, 0, 0.85, PINK, 1);
			break;
		case "search":
			macaron(g, 0, 0, 0.85, MINT);
			break;
		case "edit":
			eclair(g, 0, 0, 0.7);
			break;
		case "test":
			cupcake(g, 0, 0, 0.8, LILAC, LEMON);
			break;
		default:
			loaf(g, 0, 0, 0.75);
	}
}

/** A kiosk round a bench on a line: two candy-cane posts and a striped canopy (a line bay only). */
function kiosk(g: Graphics): void {
	const l = -86;
	const r = 30;
	const top = -124;
	const bottom = -66;
	for (const px of [l, r]) {
		g.rect(px, top, 7, bottom - top).fill(0xffffff).stroke(thin(2));
		for (let y = top + 4; y < bottom; y += 9) g.poly([px, y + 4, px + 7, y, px + 7, y + 3, px, y + 7]).fill(CHERRY);
	}
	awning(g, l - 4, r + 11, top - 6, 8, PINK, 0xffffff, 12);
}

/** The pick-up hatch at the hallway's end: a pink booth, its hatch open on shelves of boxes, an
 * awning over it and the belt running in under it. Its right edge at x = 0. */
function hatch(g: Graphics, h: number): void {
	const w = 56;
	g.rect(-w, 6, w, h - 12).fill(PINK_LIGHT);
	g.rect(-w + 6, 22, w - 12, h * 0.4).fill(0x5a3a44).stroke(thin(2));
	for (let k = 0; k < 2; k++) {
		const sy = 22 + (h * 0.4 * (k + 1)) / 2 - 2;
		g.rect(-w + 6, sy, w - 12, 2).fill(0xffffff);
		for (let i = 0; i < 3; i++) g.rect(-w + 9 + i * 13, sy - 8, 11, 8).fill([PINK, MINT_LIGHT, 0xfff3c4][(i + k) % 3]!).stroke(thin(1));
	}
	awning(g, -w - 4, 2, 9, 7, RASPBERRY, 0xffffff, 8);
	g.rect(-w, h / 2 - 15, w, 30).fill({ color: 0x5a3a44, alpha: 0.85 });
	g.rect(-w, 6, w, h - 12).stroke(line(3));
	g.circle(-w / 2, h - 22, 5).fill(0xf2bd3c).stroke(thin(1.6));
}

/** A PR's cake box riding the hallway's belt: pink, tied with a ribbon and a bow, its base at y = 0. */
function cakeBox(g: Graphics): void {
	g.rect(-13, -18, 26, 18).fill(PINK_LIGHT).stroke(line(2.5));
	g.rect(-14, -20, 28, 4).fill(0xffffff).stroke(thin(1.8));
	g.rect(-1.5, -20, 3, 20).rect(-13, -10, 26, 3).fill(RASPBERRY);
	g.ellipse(-4, -22, 4.4, 2.8).ellipse(4, -22, 4.4, 2.8).fill(RASPBERRY).stroke(thin(1.4));
	g.circle(0, -22, 1.8).fill(RASPBERRY).stroke(thin(1.2));
}

const BAKERY_STAGE: StagePainters = { belt, slats, rollers, part: pastry, booth: kiosk, dock: hatch, crate: cakeBox };

/** The bakery bakes at its benches (desks), and the hallway is a pastry conveyor: pastries ride it
 * all day, a finished PR's cake box rides it to the pick-up hatch. The café's espresso machine
 * steams, the deck ovens' windows flicker, the marquee bulbs round "Order up!" chase, the tasting
 * table's cake turns on its stand, sprinkles drift down round the giant cupcake. Idle, the bakers sip
 * at the café's lemonade, put their feet up and nap face down on the bench; first, the bakery's own:
 * a cappuccino, a sneaked macaron, a lick of the cake fork, a nap on a flour sack (rig/data/poses.ts). */
const BAKERY_STAGING: SceneStaging = {
	bay: "desks",
	hall: "conveyor",
	ambient: ["steam", "ovens", "marquee", "cakeStand", "sprinkles", "parade"],
	habits: ["cappuccinoSip", "macaronSneak", "forkLick", "flourNap", "waterCooler", "feetUp", "stretch", "faceDown", "chairSpin", "slowWalk"],
};

// --- The café terrace -------------------------------------------------------------------------

/** A gap in the footprint as the café's terrace: pale pink and cream tiles, bistro tables under
 * striped umbrellas, a chalkboard A-frame, striped pots of giant lollipops in the corners; whatever
 * its size, with as much as fits. Drawn in world coordinates, baked. */
function patio(g: Graphics, r: Rect, _band: Band): void {
	const p = { x: r.x + 7, y: r.y + 7, w: r.w - 14, h: r.h - 14 };
	if (p.w < 18 || p.h < 18) return;
	g.roundRect(p.x, p.y, p.w, p.h, 8).fill(0xfff6ee);
	const s = 24;
	for (let j = 0, y = p.y; y < p.y + p.h - 2; y += s, j++) for (let i = 0, x = p.x; x < p.x + p.w - 2; x += s, i++) if ((i + j) % 2 === 0) g.rect(x + 1, y + 1, Math.min(s, p.x + p.w - x) - 2, Math.min(s, p.y + p.h - y) - 2);
	g.fill(0xfde3e6);
	g.roundRect(p.x, p.y, p.w, p.h, 8).stroke({ width: 3, color: INK, alpha: 0.45 });
	// From the place's position, so the same every load. A hash, never the coordinates themselves:
	// the top band's gaps sit above the hallway at negative y, and a negative seed picks no colour.
	const seed = hash(`patio:${r.x},${r.y}`);
	// What stands on it, back to front.
	const things: [number, () => void][] = [];
	const corner = p.w >= 48 && p.h >= 64;
	const big = p.w >= 150 && p.h >= 150;
	if (corner) {
		things.push([p.y + 50, () => lollyPot(g, p.x + 22, p.y + 50, seed)]);
		things.push([p.y + p.h - 8, () => lollyPot(g, p.x + p.w - 22, p.y + p.h - 8, seed + 1)]);
	}
	if (big) {
		things.push([p.y + 50, () => lollyPot(g, p.x + p.w - 22, p.y + 50, seed + 2)]);
		things.push([p.y + p.h - 8, () => chalkboard(g, p.x + 30, p.y + p.h - 8, seed)]);
	}
	// The tables, in a grid between the corners, each under its umbrella.
	const x0 = p.x + 52;
	const x1 = p.x + p.w - 52;
	const y0 = p.y + 104;
	const y1 = p.y + p.h - 26;
	const cols = Math.floor((x1 - x0) / 110) + 1;
	const rows = Math.floor((y1 - y0) / 130) + 1;
	if (x1 >= x0 && y1 >= y0) {
		for (let j = 0; j < rows; j++) {
			for (let i = 0; i < cols; i++) {
				const tx = cols > 1 ? x0 + ((x1 - x0) * i) / (cols - 1) : (x0 + x1) / 2;
				const ty = rows > 1 ? y0 + ((y1 - y0) * j) / (rows - 1) : (y0 + y1) / 2;
				const k = seed + i + j * 3;
				things.push([ty, () => bistro(g, tx + ((j % 2) * 18 - 9), ty, k)]);
			}
		}
	} else if (!corner) things.push([p.y + p.h - 6, () => lollyPot(g, p.x + p.w / 2, p.y + p.h - 6, seed)]);
	for (const [, draw] of things.sort((a, b) => a[0] - b[0])) draw();
}

/** A striped pot of three giant swirl lollipops at different heights, its base's centre at (x, y). */
function lollyPot(g: Graphics, x: number, y: number, k: number): void {
	g.ellipse(x + 3, y + 1, 17, 4.6).fill(SHADOW);
	const sticks: [number, number, number][] = [[-8, 40, 9], [7, 50, 10.5], [0, 30, 8]];
	sticks.forEach(([dx, hgt, rr], i) => lollipop(g, x + dx, y - 16 - hgt, rr, hgt, CANDY[(k + i) % CANDY.length]!, 0xffffff));
	g.poly([x - 15, y - 20, x + 15, y - 20, x + 11, y, x - 11, y]).fill(0xffffff).stroke(thin(2.2));
	for (const dx of [-8, 0, 8]) g.poly([x + dx - 2.4, y - 20, x + dx + 2.4, y - 20, x + dx * 0.73 + 1.8, y, x + dx * 0.73 - 1.8, y]).fill(CANDY[(k + 3) % CANDY.length]!);
	g.poly([x - 15, y - 20, x + 15, y - 20, x + 11, y, x - 11, y]).stroke(thin(2.2));
	g.roundRect(x - 16.5, y - 23, 33, 5, 2.4).fill(0xffffff).stroke(thin(1.8));
	// Sprinkles in the soil, for show.
	for (let i = 0; i < 5; i++) g.rect(x - 10 + i * 5, y - 22 + (i % 2), 2.6, 1.1).fill(CANDY[(k + i) % CANDY.length]!);
}

/** A round marble bistro table under a striped umbrella, a bent-wire chair either side, a cup and a
 * cake on it; its foot's centre at (x, y). */
function bistro(g: Graphics, x: number, y: number, k: number): void {
	const shade = CANDY[k % CANDY.length]!;
	g.ellipse(x + 5, y + 2, 38, 7).fill(SHADOW);
	for (const side of [-1, 1]) {
		const cx = x + side * 27;
		// The chair: a heart-shaped wire back over a round seat, thin legs.
		g.moveTo(cx, y - 24).bezierCurveTo(cx - 14, y - 32, cx - 9, y - 46, cx, y - 38).bezierCurveTo(cx + 9, y - 46, cx + 14, y - 32, cx, y - 24).stroke({ width: 2.4, color: INK, join: "round" });
		g.moveTo(cx, y - 24).bezierCurveTo(cx - 14, y - 32, cx - 9, y - 46, cx, y - 38).bezierCurveTo(cx + 9, y - 46, cx + 14, y - 32, cx, y - 24).stroke({ width: 1, color: 0xffffff, join: "round" });
		g.rect(cx - 7, y - 18, 2.4, 18).rect(cx + 4.6, y - 18, 2.4, 18).fill(INK);
		g.ellipse(cx, y - 19, 10, 3.6).fill(mix(shade, 0xffffff, 0.3)).stroke(thin(1.8));
	}
	// The umbrella's pole, the table's foot and its marble top.
	g.rect(x - 1.5, y - 92, 3, 92).fill(INK);
	g.roundRect(x - 9, y - 3, 18, 4, 2).fill(INK);
	g.ellipse(x, y - 30, 19, 5).fill(MARBLE).stroke(thin(2.2));
	cup(g, x - 8, y - 32, 0.55);
	cupcake(g, x + 7, y - 31, 0.5, CANDY[(k + 2) % CANDY.length]!, CANDY[(k + 4) % CANDY.length]!);
	// The umbrella: white and its colour in panels, a scalloped valance, a cherry on the finial.
	const top = y - 112;
	const base = y - 84;
	g.moveTo(x - 44, base).quadraticCurveTo(x - 30, top + 2, x, top).quadraticCurveTo(x + 30, top + 2, x + 44, base).closePath().fill(0xffffff);
	for (const [a, b] of [[-44, -26], [-9, 9], [26, 44]] as const) {
		g.moveTo(x + a, base).lineTo(x + a * 0.08, top + 1).lineTo(x + b * 0.08, top + 1).lineTo(x + b, base).closePath().fill(shade);
	}
	scallops(g, x - 44, x + 44, base, 4.9, [shade, 0xffffff], 1.4);
	g.moveTo(x - 44, base).quadraticCurveTo(x - 30, top + 2, x, top).quadraticCurveTo(x + 30, top + 2, x + 44, base).closePath().stroke(line(2.5));
	g.circle(x, top - 3, 3.4).fill(CHERRY).stroke(thin(1.4));
}

/** A chalkboard A-frame of the day's specials: chalk lines, a cupcake drawn in chalk, a heart; its
 * feet's centre at (x, y). */
function chalkboard(g: Graphics, x: number, y: number, k: number): void {
	g.ellipse(x + 3, y + 1, 18, 4).fill(SHADOW);
	g.moveTo(x - 15, y).lineTo(x - 11, y - 48).moveTo(x + 15, y).lineTo(x + 11, y - 48).stroke({ width: 4, color: WOOD_DARK, cap: "round" });
	g.roundRect(x - 14, y - 50, 28, 38, 3).fill(WOOD).stroke(thin(2));
	g.roundRect(x - 11, y - 47, 22, 32, 2).fill(CHALK);
	const chalk = { width: 1.2, color: 0xffffff, alpha: 0.85, cap: "round" as const };
	g.moveTo(x - 7, y - 42).lineTo(x + 7, y - 42).moveTo(x - 7, y - 37).lineTo(x + 3, y - 37).stroke(chalk);
	g.moveTo(x - 5, y - 21).lineTo(x - 4, y - 27).lineTo(x + 4, y - 27).lineTo(x + 5, y - 21).closePath().stroke({ ...chalk, color: CANDY[k % CANDY.length]! });
	g.moveTo(x - 5, y - 27).quadraticCurveTo(x, y - 36, x + 5, y - 27).stroke({ ...chalk, color: 0xffd3e4 });
	g.circle(x + 7, y - 24, 1.2).circle(x + 9, y - 24, 1.2).fill({ color: RASPBERRY, alpha: 0.9 });
}

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
