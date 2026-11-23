// The factory theme: the same floor plan, cast and director, in a works. Project rooms are workshop
// bays (concrete floors, hazard stripes along the wall, high windows, a girder overhead with the bay's
// robot arm on its rail); the hallway is a conveyor aisle; the meeting room a QA booth, the kitchen a
// break room with a vending machine, your office the foreman's. Stations are machines under the same
// slots, drawn as bodies only, their tops at the rig's working point (the rig draws what the hands
// work there: the press's ram, the gauge's needle, the bins, the radio's handset). Still cut paper:
// flat shapes and the same ink, so the cast reads the same in both.
import { Container, Graphics } from "pixi.js";
import type { Lamp, Tray } from "../director/metrics";
import { GREEN, INK, RED, SHADOW, type SignStyle, batched, hash, label, line, signboard, wob } from "../office/paper";
import { PROPS } from "../office/propspots";
import type { Area, Rect } from "../office/world";
import { crewBuild } from "./build";
import { COMMON_COLOURS, NIGHT_WATCH, ROOM_COLOURS, plannerOf } from "./office";
import type { SceneStaging } from "../office/staging";
import type { FurnitureKind, SceneLight, SceneTheme, StagePainters } from "./types";
import { FACTORY_WORDS, type SignText } from "./words";

const STEEL = 0x9aa5b1;
const STEEL_LIGHT = 0xc7ced6;
const STEEL_DARK = 0x5d6b7a;
const CONCRETE = 0xc9c6be;
const SAFETY = 0xffc928;
const ORANGE = 0xff8a3d;
const WOOD = 0xd9a066;
const WOOD_TOP = 0xf0c48a;
const GLASS = 0xcfe6f2;

/** Mix two colours: `t` of the way from a to b. */
function mix(a: number, b: number, t: number): number {
	const ch = (c: number, s: number) => (c >> s) & 0xff;
	const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
	return m(16) | m(8) | m(0);
}

/** A strip of hazard stripes: yellow with black diagonals. */
function hazard(g: Graphics, x: number, y: number, w: number, h: number, step = 14): void {
	g.rect(x, y, w, h).fill(SAFETY);
	for (let sx = x - h; sx < x + w; sx += step) {
		const a = Math.max(x, sx);
		const b = Math.min(x + w, sx + step / 2);
		const c = Math.min(x + w, sx + step / 2 + h);
		const d = Math.max(x, sx + h);
		if (b <= x || a >= x + w) continue;
		g.poly([a, y + h - Math.max(0, a - sx), b, y + h - Math.min(h, b - sx), c, y, d, y].map((v, i) => (i % 2 ? v : Math.min(x + w, Math.max(x, v)))));
	}
	g.fill({ color: INK, alpha: 0.85 });
}

// --- Rooms ------------------------------------------------------------------------------------

/** A bay's or common area's shell: corrugated back wall under a girder, a concrete floor with its
 * joints, hazard stripes where the wall meets it, the side walls and the frame. */
function shell(g: Graphics, a: Area, wall: number, floor: number, joints = true): void {
	const { x, y, w, h } = a.rect;
	const floorY = a.floorY;
	g.roundRect(x, y, w, h, 10).fill(wall);
	// Corrugation: the steel's ribs.
	for (let cx = x + 10; cx < x + w - 6; cx += 12) g.rect(cx, y + 10, 3, floorY - y - 10);
	g.fill({ color: INK, alpha: 0.07 });
	g.rect(x, floorY, w, y + h - floorY).fill(floor);
	if (joints) {
		// Expansion joints in the slab.
		for (let cx = x + 96; cx < x + w; cx += 112) g.rect(cx, floorY, 2, y + h - floorY);
		for (let cy = floorY + 120; cy < y + h; cy += 120) g.rect(x, cy, w, 2);
		g.fill({ color: INK, alpha: 0.08 });
	} else {
		// The break room's lino: a checker, as the office's kitchen has.
		const s = 56;
		for (let cy = floorY, j = 0; cy < y + h; cy += s, j++) {
			for (let cx = x, i = 0; cx < x + w; cx += s, i++) {
				if ((i + j) % 2) g.rect(cx, cy, Math.min(s, x + w - cx), Math.min(s, y + h - cy));
			}
		}
		g.fill({ color: INK, alpha: 0.06 });
	}
	// Hazard stripes along the foot of the wall, then the line.
	hazard(g, x, floorY, w, 9);
	g.rect(x, floorY + 9, w, 8).fill({ color: INK, alpha: 0.07 });
	g.moveTo(x, floorY).lineTo(x + w, floorY).stroke(line(4));
	g.moveTo(x, floorY + 9).lineTo(x + w, floorY + 9).stroke(line(2));
	// The girder along the top: an I-beam with its web's truss.
	g.rect(x, y + 2, w, 10).fill(STEEL_DARK);
	for (let cx = x + 8; cx < x + w - 8; cx += 18) g.moveTo(cx, y + 11).lineTo(cx + 9, y + 3).lineTo(cx + 18, y + 11);
	g.stroke({ width: 1.5, color: INK, alpha: 0.5 });
	g.moveTo(x, y + 12).lineTo(x + w, y + 12).stroke(line(2));
	// Side walls: narrow strips with an inner edge, for a little depth.
	const sideTop = y + 100;
	g.rect(x, sideTop, 13, y + h - sideTop).fill(wall).moveTo(x + 13, sideTop).lineTo(x + 13, y + h).stroke(line(4));
	g.rect(x + w - 13, sideTop, 13, y + h - sideTop).fill(wall).moveTo(x + w - 13, sideTop).lineTo(x + w - 13, y + h).stroke(line(4));
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 10).stroke(line(5));
}

/** The rail the bay's robot arm rides, along the foot of the back wall (theme/arm.ts ARM.rail). */
function armRail(g: Graphics, a: Area): void {
	const y = a.floorY - 6;
	g.roundRect(a.rect.x + 16, y - 4, a.rect.w - 32, 8, 3).fill(STEEL_DARK).stroke(line(2.5));
	for (let cx = a.rect.x + 30; cx < a.rect.x + a.rect.w - 24; cx += 40) g.circle(cx, y, 1.8);
	g.fill(STEEL_LIGHT);
}

/** High windows: a strip of wired glass panes near the top of the slot. */
function highWindow(g: Graphics, { x, y, w, h }: Rect, seed: number): void {
	const hh = Math.min(h, 42);
	g.roundRect(x, y, w, hh, 4).fill(GLASS);
	const glare = x + w * (0.15 + (seed % 4) * 0.12);
	g.poly([glare, y + hh - 4, glare + 14, y + 4, glare + 24, y + 4, glare + 10, y + hh - 4]).fill({ color: 0xffffff, alpha: 0.7 });
	const panes = 4;
	for (let i = 1; i < panes; i++) g.moveTo(x + (w * i) / panes, y).lineTo(x + (w * i) / panes, y + hh);
	g.moveTo(x, y + hh / 2).lineTo(x + w, y + hh / 2).stroke({ width: 2.5, color: INK });
	g.roundRect(x + 2, y + 2, w - 4, hh - 4, 3).stroke(line(4));
	// The sill, and a vent below it.
	g.roundRect(x - 4, y + hh, w + 8, 5, 2).fill(STEEL).stroke(line(2));
	g.roundRect(x + w / 2 - 16, y + hh + 14, 32, 12, 3).fill(STEEL_LIGHT).stroke(line(2));
	g.moveTo(x + w / 2 - 11, y + hh + 18).lineTo(x + w / 2 + 11, y + hh + 18).moveTo(x + w / 2 - 11, y + hh + 22).lineTo(x + w / 2 + 11, y + hh + 22).stroke({ width: 1.5, color: INK, alpha: 0.6 });
}

/** A roller shutter in a hazard-striped frame. */
function shutter(g: Graphics, { x, y, w, h }: Rect): void {
	g.rect(x - 6, y, w + 12, h).fill(INK);
	hazard(g, x - 6, y, 6, h, 10);
	hazard(g, x + w, y, 6, h, 10);
	g.rect(x, y + 10, w, h - 10).fill(STEEL);
	for (let sy = y + 16; sy < y + h; sy += 7) g.moveTo(x, sy).lineTo(x + w, sy);
	g.stroke({ width: 1.5, color: INK, alpha: 0.45 });
	g.roundRect(x - 4, y, w + 8, 12, 3).fill(STEEL_DARK).stroke(line(3));
	g.roundRect(x + w / 2 - 8, y + h - 12, 16, 5, 2).fill(INK);
	g.rect(x - 6, y, w + 12, h).stroke(line(4));
}

/** The foreman's door: steel, a wired window, and the plate. */
function foremanDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	g.roundRect(x, y + 4, w, h - 4, 4).fill(0x5f7a8c).stroke(line(5));
	g.roundRect(x + 14, y + 52, w - 28, 26, 3).fill(GLASS).stroke(line(3));
	g.moveTo(x + 14, y + 65).lineTo(x + w - 14, y + 65).stroke({ width: 1.5, color: INK, alpha: 0.5 });
	g.roundRect(x + w - 16, y + h * 0.6, 9, 4, 2).fill(SAFETY).stroke({ width: 1.5, color: INK });
	g.roundRect(x + 6, y + 20, w - 12, 20, 3).fill(0xffffff).stroke(line(3));
	const t = label(FACTORY_WORDS.door, 10, "800");
	t.position.set(x + w / 2 - t.width / 2, y + 23);
	return t;
}

const rivets = (g: Graphics, x: number, y: number, w: number, h: number) => {
	for (const [rx, ry] of [
		[x + 5, y + 5],
		[x + w - 5, y + 5],
		[x + 5, y + h - 5],
		[x + w - 5, y + h - 5],
	])
		g.circle(rx!, ry!, 2);
	g.fill(STEEL_DARK);
};

const SIGNS: SignStyle = { sign: SAFETY, signAlt: ORANGE, whiteboard: 0xe6eaee, frame: 0xffffff, dress: (g, _k, x, y, w, h) => rivets(g, x, y, w, h) };

function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [officeWall, officeFloor] =
		a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON_COLOURS[a.kind as keyof typeof COMMON_COLOURS];
	// Each bay keeps its office colour as a tint on the steel, so rooms still tell apart.
	const wall = mix(0xa9b2bc, officeFloor, a.kind === "project" ? 0.45 : 0.25);
	const floor = a.kind === "meeting" ? 0xb4cdb9 : mix(CONCRETE, officeWall, 0.25);
	shell(g, a, wall, floor, a.kind !== "kitchen");
	const seed = hash(a.id);
	for (const [i, w] of a.wall.entries()) {
		if (w.kind === "window") highWindow(g, w.rect, seed + i);
		else if (w.kind === "door") shutter(g, w.rect);
		else if (w.kind === "you") c.addChild(foremanDoor(g, w.rect));
		else if (w.kind !== "planner") c.addChild(signboard(w.kind, w.rect, w.slot ? sign(w.slot) : undefined, seed + i, SIGNS));
	}
	if (a.kind === "project") armRail(g, a);
}

/** The conveyor aisle: concrete, yellow lane lines, and the belt down the middle on its rollers. */
function hallway(g: Graphics, r: Rect): void {
	g.rect(r.x, r.y, r.w, r.h).fill(0xd8d5ce);
	const mid = r.y + r.h / 2;
	const bh = 30;
	// The belt and its frame.
	g.rect(r.x, mid - bh / 2 - 5, r.w, bh + 10).fill(STEEL_DARK);
	g.rect(r.x, mid - bh / 2, r.w, bh).fill(0x434852);
	for (let x = r.x + 6; x < r.x + r.w; x += 16) g.rect(x, mid - bh / 2, 2, bh);
	g.fill({ color: 0xffffff, alpha: 0.1 });
	for (let x = r.x + 30; x < r.x + r.w; x += 60) g.circle(x, mid - bh / 2 - 2.5, 1.6).circle(x, mid + bh / 2 + 2.5, 1.6);
	g.fill(STEEL_LIGHT);
	g.moveTo(r.x, mid - bh / 2 - 5).lineTo(r.x + r.w, mid - bh / 2 - 5).moveTo(r.x, mid + bh / 2 + 5).lineTo(r.x + r.w, mid + bh / 2 + 5).stroke(line(3));
	// Walkway lanes either side, dashed.
	for (let x = r.x + 8; x < r.x + r.w; x += 34) g.rect(x, r.y + 14, 20, 4).rect(x, r.y + r.h - 18, 20, 4);
	g.fill(SAFETY);
	g.moveTo(r.x, r.y + 2.5).lineTo(r.x + r.w, r.y + 2.5).moveTo(r.x, r.y + r.h - 2.5).lineTo(r.x + r.w, r.y + r.h - 2.5).stroke(line(5));
}

// --- Desk props ---------------------------------------------------------------------------------

const PART_COLOURS = [STEEL_LIGHT, SAFETY, 0x9be3ff, ORANGE, STEEL];

/** The parts hopper: a steel funnel at the in-tray's spot, filling with parts as the context does;
 * a heap over the rim past 60%, parts spilling off past 80%; empty while the lead has it out. While
 * the lead plays `buried` the rig draws the pile, so this draws nothing. */
function hopper(t: Tray, seed: string): Graphics {
	const g = batched();
	if (t.rig) return g;
	const { x, y, w, sheet } = PROPS.tray;
	const s = hash(seed);
	const body = 10 * sheet + 2;
	const base = y - 4;
	const rim = base - body;
	// Legs, then the funnel.
	g.rect(x + 3, base - 2, 2, 6).rect(x + w - 5, base - 2, 2, 6).fill(INK);
	const funnel = [x - 3, rim, x + w + 3, rim, x + w - 4, base, x + 4, base];
	g.poly(funnel).fill(STEEL);
	// The fill: level with the sheets, as many as fit the funnel, then a heap.
	const level = Math.min(10, t.out ? 0 : t.sheets);
	if (level > 0) {
		const top = base - level * sheet;
		const inset = (yy: number) => 4 - ((base - yy) / body) * 7;
		g.poly([x + inset(top), top, x + w - inset(top), top, x + w - 4, base, x + 4, base]).fill(0x7b8796);
		for (let i = 0; i < level * 2; i++) {
			const px = x + 5 + ((i * 5 + (s % 7)) % (w - 10));
			const py = base - 2 - ((i * 3) % Math.max(1, level * sheet - 2));
			g.circle(px, py, 1.4).fill(PART_COLOURS[(s + i) % PART_COLOURS.length]!);
		}
	}
	const heap = t.out ? 0 : Math.max(0, t.sheets - 10);
	if (heap > 0) {
		const lean = t.buried ? 3 : 0;
		const hh = heap * sheet * 1.6;
		g.poly([x - 2, rim, x + w / 2 + lean, rim - hh, x + w + 2, rim]).fill(0x7b8796).stroke(line(1.4));
		for (let i = 0; i < heap * 2; i++) {
			const u = ((i * 37 + s) % 100) / 100;
			const px = x + 2 + u * (w - 4);
			const py = rim - 2 - (1 - Math.abs(u - 0.5) * 2) * hh * ((i % 3) / 3 + 0.2);
			g.circle(px, py, 1.6).fill(PART_COLOURS[(s + i) % PART_COLOURS.length]!).stroke({ width: 0.8, color: INK });
		}
	}
	g.poly(funnel).stroke(line(1.8));
	g.moveTo(x - 3, rim + 3).lineTo(x + w + 3, rim + 3).stroke({ width: 1, color: INK, alpha: 0.4 });
	// Parts that fell off: onto the desk, then over the edge onto the floor.
	const off: [number, number][] = [
		[x + w + 6, y - 3],
		[x + w - 8, -30],
		[x - 4, 10],
	];
	for (const [i, [ox, oy]] of off.slice(0, t.spill).entries()) {
		g.circle(ox + wob(s, i) * 2, oy, 2.4).fill(PART_COLOURS[i % PART_COLOURS.length]!).stroke({ width: 1.2, color: INK });
		g.circle(ox + 5, oy + 1, 1.8).fill(STEEL_LIGHT).stroke({ width: 1, color: INK });
	}
	return g;
}

/** Cans on the bench, stacked three, two, one. */
function cans(n: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.mugs;
	const rows = [3, 2, 1];
	let k = 0;
	for (let r = 0; r < rows.length && k < n; r++) {
		for (let i = 0; i < rows[r]! && k < n; i++, k++) {
			const mx = x + (i + r * 0.5) * (w + 1);
			const my = y - (r + 1) * h;
			g.roundRect(mx, my, w, h, 1).fill(k % 2 ? RED : 0x9be3ff).stroke(line(1.2));
			g.rect(mx + 1, my + 1, w - 2, 1.2).fill(STEEL_LIGHT);
		}
	}
	return g;
}

/** A beacon on the bench's end, red or green from the last test. */
function beacon(lamp: Lamp): Graphics {
	const { x, y } = PROPS.lamp;
	const colour = lamp === "red" ? RED : GREEN;
	const g = batched();
	g.roundRect(x - 6, y + 9, 12, 4, 1.5).fill(STEEL_DARK).stroke({ width: 1.2, color: INK });
	g.rect(x - 1.5, y, 3, 10).fill(INK);
	g.circle(x, y - 5, 10).fill({ color: colour, alpha: 0.25 });
	g.moveTo(x - 6, y + 1).lineTo(x - 6, y - 6).arc(x, y - 6, 6, Math.PI, 0).lineTo(x + 6, y + 1).closePath().fill(colour).stroke(line(1.6));
	g.moveTo(x - 6, y - 3).lineTo(x + 6, y - 3).stroke({ width: 1, color: INK, alpha: 0.6 });
	return g;
}

/** A red tool chest beside the bench: a drawer per ~10 files; the full ones jammed open with tools. */
function toolChest(n: number, full: number): Graphics {
	const g = batched();
	const { x, w, h } = PROPS.drawers;
	const top = -(n * h + 4);
	g.rect(x + 3, top + 3, w, -top).fill(SHADOW);
	g.roundRect(x, top, w, -top, 3).fill(0xd8463c).stroke(line(2));
	for (let i = 0; i < n; i++) {
		const dy = top + 2 + i * h;
		const bulge = n - 1 - i < full;
		const dx = bulge ? -4 : 0;
		if (bulge) {
			// A spanner and a screwdriver sticking out.
			g.rect(x + dx + 3, dy - 3, 9, 2).fill(STEEL_LIGHT).stroke({ width: 1, color: INK });
			g.rect(x + dx + 12, dy - 2, 4, 4).fill(SAFETY).stroke({ width: 1, color: INK });
		}
		g.roundRect(x + dx + 1, dy, w - 2, h - 2, 2).fill(STEEL_LIGHT).stroke(line(1.5));
		g.roundRect(x + dx + 3, dy + h / 2 - 2, w - 6, 2, 1).fill(INK);
	}
	return g;
}

/** The scrap bin in front of the chest, filled 0 to 5 loads with offcuts. */
function scrapBin(load: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.skip;
	if (load > 0) {
		const heap = Math.min(5, load);
		for (let i = 0; i < heap * 2; i++) {
			const bx = x + 3 + ((i * 7) % (w - 8));
			const by = y - h + 2 - Math.floor(i / 2) * 2.2 + (i % 2);
			g.rect(bx, by, 6, 3).fill(i % 2 ? STEEL_LIGHT : STEEL).stroke({ width: 1, color: INK });
		}
	}
	g.poly([x, y - h, x + w, y - h, x + w - 4, y, x + 4, y]).fill(0x3f8f5f).stroke(line(2));
	g.moveTo(x + 6, y - h / 2).lineTo(x + w - 6, y - h / 2).stroke({ width: 1.5, color: INK, alpha: 0.4 });
	return g;
}

// --- Furniture --------------------------------------------------------------------------------

/** A workbench: a steel top behind, a front with a drawer row and a hazard edge. 150 wide. */
function bench(g: Graphics, w = 150, top = STEEL_LIGHT, front = STEEL_DARK): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, -70, w + 24, 32, 4).fill(top).stroke(line(4));
	g.roundRect(-w / 2, -44, w, 44, 3).fill(front).stroke(line(4));
	hazard(g, -w / 2 + 4, -40, w - 8, 4, 10);
	for (let i = 0; i < 3; i++) g.roundRect(-w / 2 + 10 + (i * (w - 20)) / 3, -30, (w - 20) / 3 - 6, 10, 2);
	g.fill({ color: 0xffffff, alpha: 0.18 });
}

/** Station bodies: between ST_L (toward the wall) and ST_R (toward the user), tops at the point. */
const ST_L = -24;
const ST_R = 24;

function furniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	const w = ST_R - ST_L;
	switch (kind) {
		case "desk":
			bench(g);
			break;
		case "table": {
			// The QA booth's inspection table, with a magnifier lamp over a part.
			bench(g, 180, 0xe6eaee, STEEL);
			g.moveTo(-50, -70).lineTo(-50, -100).lineTo(-30, -112).stroke({ width: 3, color: INK });
			g.circle(-26, -108, 9).fill(GLASS).stroke(line(3));
			g.circle(-26, -80, 7).fill(STEEL_LIGHT).stroke(line(2.5));
			g.circle(-26, -80, 2.5).fill(INK);
			g.roundRect(30, -84, 22, 14, 3).fill(0xffffff).stroke(line(2.5));
			g.moveTo(34, -78).lineTo(48, -78).stroke({ width: 1.5, color: GREEN });
			break;
		}
		case "counter": {
			// The break room's counter: a microwave and two cans.
			bench(g, 130, 0xe6eaee, STEEL);
			g.roundRect(-60, -112, 52, 40, 5).fill(0xe6eaee).stroke(line(3));
			g.roundRect(-55, -106, 32, 28, 3).fill(INK);
			g.circle(-15, -100, 2.5).circle(-15, -92, 2.5).fill(INK);
			g.roundRect(6, -88, 10, 16, 2).fill(RED).stroke(line(2)).roundRect(26, -88, 10, 16, 2).fill(0x9be3ff).stroke(line(2));
			break;
		}
		case "chair":
			// A shop chair with a high back.
			g.rect(-3, -28, 6, 28).fill(INK);
			g.roundRect(-16, -4, 32, 5, 2).fill(INK);
			g.roundRect(-22, -62, 44, 36, 10).fill(ORANGE).stroke(line(4));
			g.roundRect(-24, -32, 48, 10, 5).fill(STEEL_DARK).stroke(line(3));
			break;
		case "plant": {
			// An oil drum where the office keeps a plant.
			g.rect(-15, -56 + 5, 34, 56).fill(SHADOW);
			g.roundRect(-18, -56, 36, 56, 5).fill(0x3f7fbf).stroke(line(4));
			g.rect(-18, -40, 36, 3).rect(-18, -20, 36, 3).fill(INK);
			g.ellipse(0, -56, 16, 4).fill(0x2f6aa5).stroke(line(2));
			g.circle(8, -56, 2).fill(INK);
			break;
		}
		case "lamp":
			// A work light on a tripod.
			g.moveTo(0, -80).lineTo(-14, 0).moveTo(0, -80).lineTo(14, 0).moveTo(0, -80).lineTo(0, 0).stroke({ width: 3, color: INK });
			g.roundRect(-16, -100, 32, 22, 4).fill(SAFETY).stroke(line(3));
			g.roundRect(-11, -96, 22, 14, 2).fill(0xfff6c9);
			break;
		case "cooler":
			// A water cooler on a steel stand.
			g.roundRect(-21, -66, 42, 66, 4).fill(STEEL_LIGHT).stroke(line(4));
			g.circle(-4, -52, 4).fill(0x3f7fbf);
			g.roundRect(-14, -36, 28, 22, 3).fill({ color: INK, alpha: 0.15 });
			g.roundRect(-17, -108, 34, 44, 12).fill(0x9be3ff).stroke(line(4));
			break;
		case "fridge": {
			// The vending machine: a red cabinet, a window of snacks in rows, the keypad and the slot.
			g.rect(-38, -144, 84, 150).fill(SHADOW);
			g.roundRect(-42, -150, 84, 150, 8).fill(0xd94a4a).stroke(line(4));
			g.roundRect(-34, -140, 50, 104, 4).fill(GLASS).stroke(line(3));
			const snack = [SAFETY, 0x9be3ff, GREEN, ORANGE, 0xffbdd6];
			for (let r = 0; r < 4; r++) {
				g.rect(-34, -116 + r * 24, 50, 2).fill(INK);
				for (let c = 0; c < 4; c++) g.roundRect(-31 + c * 12, -132 + r * 24, 9, 14, 2).fill(snack[(r + c) % snack.length]!);
			}
			g.roundRect(22, -132, 14, 26, 2).fill(INK);
			for (let i = 0; i < 3; i++) g.rect(25, -128 + i * 7, 8, 4).fill(STEEL_LIGHT);
			g.roundRect(22, -98, 14, 8, 2).fill(STEEL_LIGHT).stroke({ width: 1.5, color: INK });
			g.roundRect(-30, -28, 44, 14, 3).fill(INK);
			break;
		}
		case "sofa":
			// A break bench: planks on steel legs.
			g.rect(-66, -40, 6, 40).rect(60, -40, 6, 40).fill(INK);
			g.roundRect(-72, -82, 144, 16, 5).fill(WOOD).stroke(line(4));
			g.rect(-58, -66, 5, 26).rect(53, -66, 5, 26).fill(INK);
			g.roundRect(-75, -46, 150, 16, 5).fill(WOOD_TOP).stroke(line(4));
			break;
		case "cabinet":
			// A locker.
			g.roundRect(-33, -104, 66, 104, 4).fill(0x6f8fa8).stroke(line(4));
			g.moveTo(0, -104).lineTo(0, 0).stroke(line(3));
			for (let i = 0; i < 4; i++) g.rect(-26, -96 + i * 6, 18, 2).rect(8, -96 + i * 6, 18, 2);
			g.fill(INK);
			break;
		case "pod":
			// The gatehouse's rest bay: a steel capsule with a porthole (the napper shows in it).
			g.roundRect(-75, -66, 150, 66, 20).fill(STEEL_LIGHT).stroke(line(4));
			for (let cx = -60; cx < 70; cx += 16) g.rect(cx, -60, 2, 54);
			g.fill({ color: INK, alpha: 0.08 });
			g.circle(-36, -33, 23).fill(STEEL_DARK).stroke(line(3));
			g.circle(-36, -33, 19).fill(0x2a3140);
			g.roundRect(8, -46, 52, 26, 4).fill(SAFETY).stroke(line(2.5));
			g.roundRect(14, -40, 30, 4, 2).roundRect(14, -32, 22, 4, 2).fill(INK);
			break;
		case "screen-lit":
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 4).fill(STEEL_DARK).stroke(line(4));
			g.roundRect(-26, -39, 52, 34, 2).fill(0x1d2a22);
			g.rect(-22, -34, 22, 4).rect(-22, -25, 30, 4).rect(-22, -16, 12, 3).fill(0xffb347);
			break;
		case "screen-off":
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 4).fill(STEEL_DARK).stroke(line(4));
			g.roundRect(-26, -39, 52, 34, 2).fill(0x8d96a3);
			break;
		case "files": {
			// The parts rack (reference): open shelving with boxes, a little taller than the point.
			g.rect(ST_L + 4, -47 + 5, w, 47).fill(SHADOW);
			g.rect(ST_L, -47, 4, 47).rect(ST_R - 4, -47, 4, 47).fill(STEEL_DARK);
			for (const sy of [-47, -31, -15]) g.roundRect(ST_L, sy, w, 3, 1).fill(STEEL_DARK);
			const box = [WOOD, 0x3f7fbf, SAFETY];
			for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) g.roundRect(ST_L + 6 + c * 13, -28 + r * 16, 11, 12 - (c % 2) * 3, 1.5).fill(box[(r + c) % 3]!);
			g.rect(ST_L, -47, w, 47).stroke(line(3));
			break;
		}
		case "catalogue": {
			// The bin wall (search): a frame of little parts bins with coloured lips, on legs.
			g.rect(ST_L + 4, -42 + 5, w, 42).fill(SHADOW);
			g.rect(ST_L + 4, -10, 5, 10).rect(ST_R - 9, -10, 5, 10).fill(INK);
			g.roundRect(ST_L, -42, w, 34, 3).fill(STEEL).stroke(line(4));
			const lip = [SAFETY, 0x3f7fbf, RED];
			for (let r = 0; r < 2; r++)
				for (let c = 0; c < 3; c++) {
					const x = ST_L + 4 + c * 14;
					const y = -38 + r * 14;
					g.roundRect(x, y, 12, 11, 2).fill(STEEL_LIGHT).stroke({ width: 2, color: INK });
					g.roundRect(x + 1, y + 6, 10, 5, 1.5).fill(lip[(r + c) % 3]!);
				}
			break;
		}
		case "copier": {
			// The press (build): a heavy bed on a plinth, a column at the back rising to the head with
			// its cylinder (the ram, its lights and the parts it stamps: the rig, at the point).
			g.rect(ST_L + 4, -40 + 5, w, 40).fill(SHADOW);
			g.roundRect(ST_L - 2, -78, 14, 78, 3).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(ST_L - 6, -90, 30, 14, 3).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(ST_L + 4, -100, 12, 12, 2).fill(STEEL_LIGHT).stroke(line(2));
			g.roundRect(ST_L, -40, w, 30, 4).fill(SAFETY).stroke(line(4));
			hazard(g, ST_L + 4, -22, w - 8, 6, 10);
			g.roundRect(ST_L + 2, -10, w - 4, 10, 3).fill(STEEL_DARK).stroke(line(2.5));
			break;
		}
		case "stamps": {
			// The gauge bench (test): a steel bench under the point, a dial on a post at its back.
			g.rect(ST_L + 4, -38 + 5, w, 38).fill(SHADOW);
			g.rect(ST_L + 4, -32, 5, 32).rect(ST_R - 9, -32, 5, 32).fill(INK);
			g.rect(ST_L + 6, -14, w - 12, 3).fill(INK);
			g.rect(ST_L + 3, -60, 4, 22).fill(INK);
			g.circle(ST_L + 5, -64, 9).fill(0xffffff).stroke(line(3));
			g.moveTo(ST_L + 5, -64).lineTo(ST_L + 10, -68).stroke({ width: 2, color: RED });
			g.roundRect(ST_L - 2, -38, w + 4, 8, 2).fill(STEEL_LIGHT).stroke(line(4));
			break;
		}
		case "phone": {
			// The radio set (web): a slim stand with a shelf, the set on its wall end with dials and an
			// aerial (the handset and the notepad at the point: the rig).
			g.rect(ST_L + 8, -38 + 5, w - 8, 38).fill(SHADOW);
			g.roundRect(-5, -32, 10, 30, 3).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(ST_L + 2, -4, w - 4, 6, 3).fill(STEEL_DARK).stroke(line(3));
			g.roundRect(ST_L - 2, -38, w + 4, 7, 3).fill(STEEL_LIGHT).stroke(line(4));
			g.moveTo(ST_L + 4, -52).lineTo(ST_L - 2, -76).stroke({ width: 2, color: INK });
			g.circle(ST_L - 2, -77, 2).fill(RED);
			g.roundRect(ST_L + 1, -52, 24, 15, 3).fill(0x5d7a4f).stroke(line(3));
			g.circle(ST_L + 8, -44.5, 3).circle(ST_L + 18, -44.5, 3).fill(STEEL_LIGHT);
			break;
		}
		case "outbox": {
			// The loading dock (outbox): a raised dock with a striped edge and rubber bumpers, a pallet on
			// top (the pallet's load, at the point: the rig).
			g.rect(ST_L + 4, -36 + 5, w, 36).fill(SHADOW);
			g.roundRect(ST_L, -36, w, 36, 3).fill(0xb3b0a8).stroke(line(4));
			hazard(g, ST_L + 2, -34, w - 4, 6, 10);
			g.roundRect(ST_L + 4, -22, 8, 12, 2).roundRect(ST_R - 12, -22, 8, 12, 2).fill(INK);
			g.rect(ST_L + 2, -42, w - 18, 3).rect(ST_L + 2, -38, w - 18, 2).fill(WOOD);
			g.rect(ST_L + 4, -40, 4, 2).rect(ST_L + 16, -40, 4, 2).fill(0x8a5a3c);
			break;
		}
		case "shredder": {
			// The crusher: a squat steel box with jaws inside its window, striped, its top just under the
			// working point (the slot and the pile: the rig).
			g.rect(-14, -38 + 5, 32, 38).fill(SHADOW);
			g.roundRect(-18, -38, 32, 38, 3).fill(STEEL_DARK).stroke(line(4));
			g.roundRect(-13, -30, 22, 16, 2).fill(0x2a3140).stroke({ width: 2, color: INK });
			for (let i = 0; i < 4; i++) g.poly([-12 + i * 5.5, -30, -9 + i * 5.5, -24, -6.5 + i * 5.5, -30]).poly([-12 + i * 5.5, -14, -9 + i * 5.5, -20, -6.5 + i * 5.5, -14]);
			g.fill(STEEL_LIGHT);
			hazard(g, -16, -9, 28, 5, 8);
			break;
		}
		case "tickets": {
			// The punch clock on its post, a card sticking out.
			g.roundRect(-10, -4, 20, 4, 2).fill(INK);
			g.rect(-2.5, -52, 5, 50).fill(INK);
			g.roundRect(-15, -80, 30, 30, 4).fill(STEEL_LIGHT).stroke(line(3));
			g.circle(0, -70, 7).fill(0xffffff).stroke({ width: 1.5, color: INK });
			g.moveTo(0, -70).lineTo(0, -75).moveTo(0, -70).lineTo(4, -70).stroke({ width: 1.2, color: INK });
			g.rect(-5, -56, 10, 10).fill(SAFETY).stroke({ width: 1.5, color: INK });
			break;
		}
		case "bell": {
			// The counter by the foreman's door, centred under the bell's plunger (rigpoints.ts), with the
			// bell on it: the same bell as the office's, which the rig draws over while it rings.
			g.rect(-14, -31 + 5, 32, 31).fill(SHADOW);
			g.rect(-14, -27, 4, 27).rect(10, -27, 4, 27).fill(INK);
			g.roundRect(-18, -31, 36, 7, 2).fill(STEEL_LIGHT).stroke(line(3));
			g.moveTo(-6, -31).arc(0, -31, 6, Math.PI, 0).closePath().fill(0xffe500).stroke(line(2));
			g.rect(-1, -41, 2, 4).fill(INK);
			g.circle(0, -41.5, 1.8).fill(INK);
			break;
		}
	}
	return g;
}

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
export const FACTORY_LIGHT: SceneLight = {
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

// --- Staging (office/staging.ts): lines, booths, the dock -------------------------------------

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

/** The factory stages its bays as lines with a belt across the floor, the crew along it and the
 * foreman up in a booth; the hallway's conveyor carries PR crates to the dock. A beacon turns on a
 * press while a build runs, the aisle's vents puff steam, a busy line throws weld sparks. Idle, the
 * crew sit on oil drums, play cards on a pallet and kick the vending machine (rig/poses.ts). */
export const FACTORY_STAGING: SceneStaging = {
	bay: "line",
	hall: "conveyor",
	ambient: ["beacon", "vents", "sparks"],
	habits: ["drumSit", "palletCards", "vendingKick", "scrolling", "stretch", "faceDown", "slowWalk"],
};

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
	crewBuild: (b, seed) => crewBuild(b, seed, CRATE_BUILD),
	nightWatch: { ...NIGHT_WATCH, tint: "night-shift" },
	arms: true,
	light: FACTORY_LIGHT,
	staging: FACTORY_STAGING,
	stage: FACTORY_STAGE,
};
