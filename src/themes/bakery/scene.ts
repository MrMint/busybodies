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
import { Container, type Graphics } from "pixi.js";
import type { PlannerRow } from "../../scene/contract";
import { INK, type SignStyle, batched, hash, label, line, signboard } from "../../scene/office/paper";
import type { Area, Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import { NIGHT_WATCH } from "../office/scene";
import type { SceneLight, SceneTheme } from "../../scene/theme/types";
import type { SignText } from "../../scene/theme/words";
import { BAKERY_WORDS } from "./words";
import { mix } from "../../shared/colour";
import { BLUEBERRY, BRASS, CANDY, CHALK, CREAM, GLASS, IVORY, LEMON, MINT, MINT_LIGHT, PINK, PINK_LIGHT, RASPBERRY, coloursOf } from "./palette";
import { cupcake, layerCake, loaf, oval } from "./pastries";
import { patio } from "./outside";
import { BAKERY_STAGE, BAKERY_STAGING, BANDS, CAKE_BUILD } from "./stage";
import { cakeBoxes, cappuccinos, clocheLamp, crumbBin, furniture, macaronStand } from "./furniture";

/** Under a project room's desks: a rug a step deeper than its checks, edged in a deeper shade of
 * its wall, so the room reads as its project's from the whole-office stop (as the office's). */
function rugOf(a: Area): { fill: number; edge: number } | undefined {
	if (a.kind !== "project") return undefined;
	const [wall, floor] = coloursOf(a);
	return { fill: mix(floor, wall, 0.4), edge: mix(wall, RASPBERRY, 0.3) };
}

export const thin = (w: number) => ({ width: w, color: INK, join: "round" as const, cap: "round" as const });

/** A glass candy jar, its base centre at (x, y), full of sweets. */
export function candyJar(g: Graphics, x: number, y: number, w: number, h: number, seed: number, lid = PINK): void {
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
export function scallops(g: Graphics, x0: number, x1: number, y: number, r: number, colours: number[], ink = 2): void {
	const n = Math.max(1, Math.round((x1 - x0) / (r * 2)));
	const step = (x1 - x0) / n;
	for (let i = 0; i < n; i++) {
		const cx = x0 + step * (i + 0.5);
		g.moveTo(cx - step / 2, y).arc(cx, y, step / 2, Math.PI, 0, true).closePath().fill(colours[i % colours.length]!).stroke(thin(ink));
	}
}

/** A striped awning from x0 to x1, its rod at y, `h` deep, then its scalloped hem. */
export function awning(g: Graphics, x0: number, x1: number, y: number, h: number, a: number, b = 0xffffff, stripe = 14): void {
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
