// The factory's rooms: the shell, high windows and shutters, the arm rail, the foreman's corner
// and door, the signs, and the hallway. Split out of scene.ts.
import type { Container, Graphics } from "pixi.js";
import { GREEN, INK, SHADOW, type SignStyle, hash, label, line, signboard } from "../../scene/office/paper";
import type { Area, Rect } from "../../scene/world/world";
import { COMMON_COLOURS } from "../office/palette";
import type { SignText } from "../../scene/theme/words";
import { FACTORY_WORDS } from "./words";
import { mix } from "../../shared/colour";
import { CONCRETE, GLASS, ORANGE, SAFETY, STEEL, STEEL_DARK, STEEL_LIGHT, WOOD, hazard } from "./palette";

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
	g.moveTo(x, floorY)
		.lineTo(x + w, floorY)
		.stroke(line(4));
	g.moveTo(x, floorY + 9)
		.lineTo(x + w, floorY + 9)
		.stroke(line(2));
	// The girder along the top: an I-beam with its web's truss.
	g.rect(x, y + 2, w, 10).fill(STEEL_DARK);
	for (let cx = x + 8; cx < x + w - 8; cx += 18)
		g.moveTo(cx, y + 11)
			.lineTo(cx + 9, y + 3)
			.lineTo(cx + 18, y + 11);
	g.stroke({ width: 1.5, color: INK, alpha: 0.5 });
	g.moveTo(x, y + 12)
		.lineTo(x + w, y + 12)
		.stroke(line(2));
	// Side walls: narrow strips with an inner edge, for a little depth.
	const sideTop = y + 100;
	g.rect(x, sideTop, 13, y + h - sideTop)
		.fill(wall)
		.moveTo(x + 13, sideTop)
		.lineTo(x + 13, y + h)
		.stroke(line(4));
	g.rect(x + w - 13, sideTop, 13, y + h - sideTop)
		.fill(wall)
		.moveTo(x + w - 13, sideTop)
		.lineTo(x + w - 13, y + h)
		.stroke(line(4));
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 10).stroke(line(5));
}

/** The rail the bay's robot arm rides, along the foot of the back wall (themes/factory/arm.ts ARM.rail). */
function armRail(g: Graphics, a: Area): void {
	const y = a.floorY - 6;
	g.roundRect(a.rect.x + 16, y - 4, a.rect.w - 32, 8, 3)
		.fill(STEEL_DARK)
		.stroke(line(2.5));
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
	g.moveTo(x, y + hh / 2)
		.lineTo(x + w, y + hh / 2)
		.stroke({ width: 2.5, color: INK });
	g.roundRect(x + 2, y + 2, w - 4, hh - 4, 3).stroke(line(4));
	// The sill, and a vent below it.
	g.roundRect(x - 4, y + hh, w + 8, 5, 2)
		.fill(STEEL)
		.stroke(line(2));
	g.roundRect(x + w / 2 - 16, y + hh + 14, 32, 12, 3)
		.fill(STEEL_LIGHT)
		.stroke(line(2));
	g.moveTo(x + w / 2 - 11, y + hh + 18)
		.lineTo(x + w / 2 + 11, y + hh + 18)
		.moveTo(x + w / 2 - 11, y + hh + 22)
		.lineTo(x + w / 2 + 11, y + hh + 22)
		.stroke({ width: 1.5, color: INK, alpha: 0.6 });
}

/** A roller shutter in a hazard-striped frame. */
function shutter(g: Graphics, { x, y, w, h }: Rect): void {
	g.rect(x - 6, y, w + 12, h).fill(INK);
	hazard(g, x - 6, y, 6, h, 10);
	hazard(g, x + w, y, 6, h, 10);
	g.rect(x, y + 10, w, h - 10).fill(STEEL);
	for (let sy = y + 16; sy < y + h; sy += 7) g.moveTo(x, sy).lineTo(x + w, sy);
	g.stroke({ width: 1.5, color: INK, alpha: 0.45 });
	g.roundRect(x - 4, y, w + 8, 12, 3)
		.fill(STEEL_DARK)
		.stroke(line(3));
	g.roundRect(x + w / 2 - 8, y + h - 12, 16, 5, 2).fill(INK);
	g.rect(x - 6, y, w + 12, h).stroke(line(4));
}

/** The foreman's door: steel, a wired window, and the plate. */
function foremanDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	g.roundRect(x, y + 4, w, h - 4, 4)
		.fill(0x5f7a8c)
		.stroke(line(5));
	g.roundRect(x + 14, y + 52, w - 28, 26, 3)
		.fill(GLASS)
		.stroke(line(3));
	g.moveTo(x + 14, y + 65)
		.lineTo(x + w - 14, y + 65)
		.stroke({ width: 1.5, color: INK, alpha: 0.5 });
	g.roundRect(x + w - 16, y + h * 0.6, 9, 4, 2)
		.fill(SAFETY)
		.stroke({ width: 1.5, color: INK });
	g.roundRect(x + 6, y + 20, w - 12, 20, 3)
		.fill(0xffffff)
		.stroke(line(3));
	const t = label(FACTORY_WORDS.door, 10, "800");
	t.position.set(x + w / 2 - t.width / 2, y + 23);
	return t;
}

export const rivets = (g: Graphics, x: number, y: number, w: number, h: number) => {
	for (const [rx, ry] of [
		[x + 5, y + 5],
		[x + w - 5, y + 5],
		[x + 5, y + h - 5],
		[x + w - 5, y + h - 5],
	])
		g.circle(rx!, ry!, 2);
	g.fill(STEEL_DARK);
};

/** Each bay's tint pair (pale, deep), in room order: the office's project colours as they were
 * before its floors went pale. The factory mixes them into steel and concrete, where they were
 * never loud enough to fight the cast, so it keeps them. */
const BAY_TINTS: [number, number][] = [
	[0xffe9cf, 0xffc47f],
	[0xdeecff, 0xa6d0ff],
	[0xdff7ec, 0xa5e6c9],
	[0xffe6f0, 0xffbdd6],
	[0xeee7ff, 0xd2c0ff],
	[0xfff6c9, 0xffe08a],
	[0xe3f7ff, 0x9fdcf5],
];

const SIGNS: SignStyle = { sign: SAFETY, signAlt: ORANGE, whiteboard: 0xe6eaee, frame: 0xffffff, dress: (g, _k, x, y, w, h) => rivets(g, x, y, w, h) };

export function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [officeWall, officeFloor] = a.kind === "project" ? BAY_TINTS[a.hue % BAY_TINTS.length]! : COMMON_COLOURS[a.kind as keyof typeof COMMON_COLOURS];
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
	if (a.kind === "yours") foremanCorner(g, a);
}

/** The foreman's corner, where the office keeps the boss's (themes/office/scene.ts `bossCorner`, the same
 * footprint, so it meets nothing the room has): a clipboard on the wall, a hazard-striped mat with a
 * two-door locker on it (one door ajar on a hi-vis sleeve, a hard hat on a hook at its side), and a
 * crate for a side table with a thermos and a lunch tin. A little worn. Baked with the room. */
function foremanCorner(g: Graphics, a: Area): void {
	const { x, y } = a.rect;
	const f = a.floorY;
	// The clipboard, on a nail where the boss hangs a picture: a sheet with a few scribbled lines.
	const px = x + 136;
	const py = y + 66;
	g.moveTo(px + 4, py + 2)
		.lineTo(px + 13, py - 6)
		.lineTo(px + 22, py + 2)
		.stroke({ width: 1.2, color: INK, alpha: 0.6 });
	g.circle(px + 13, py - 6, 1.8).fill(STEEL_DARK);
	g.rect(px + 3, py + 3, 26, 34).fill(SHADOW);
	g.roundRect(px, py, 26, 34, 3).fill(WOOD).stroke(line(2.5));
	g.rect(px + 3, py + 5, 20, 26).fill(0xf7f4ec);
	g.roundRect(px + 7, py - 2, 12, 6, 2)
		.fill(STEEL)
		.stroke({ width: 1.5, color: INK });
	for (const [ly, lw] of [
		[py + 11, 13],
		[py + 16, 10],
		[py + 21, 14],
	] as const) {
		g.moveTo(px + 6, ly);
		for (let k = 1; k <= 4; k++) g.lineTo(px + 6 + (lw * k) / 4, ly + (k % 2 ? -1.2 : 0.6));
	}
	g.stroke({ width: 1.1, color: INK, alpha: 0.55 });
	g.moveTo(px + 6, py + 26)
		.lineTo(px + 8, py + 28)
		.lineTo(px + 12, py + 24)
		.stroke({ width: 1.4, color: GREEN });
	// The mat: grey rubber with a hazard edge, faint, so it stays floor.
	const mx = x + 204;
	const my = f + 86;
	g.roundRect(mx, my, 84, 92, 8).fill({ color: STEEL_DARK, alpha: 0.22 }).stroke({ width: 2, color: INK, alpha: 0.3 });
	for (const sy of [my + 4, my + 81]) {
		g.rect(mx + 4, sy, 76, 7).fill({ color: SAFETY, alpha: 0.4 });
		for (let sx = mx + 6; sx < mx + 78; sx += 10) g.poly([sx, sy + 7, sx + 4, sy + 7, sx + 8, sy, sx + 4, sy]);
		g.fill({ color: INK, alpha: 0.16 });
	}
	for (let rx = mx + 14; rx < mx + 76; rx += 12) g.rect(rx, my + 16, 1.5, 60);
	g.fill({ color: INK, alpha: 0.06 });
	// The locker: slate steel on a plinth, standing where the boss's armchair does.
	const cx = x + 246;
	const cy = f + 140;
	const slate = 0x7088a0;
	g.ellipse(cx + 4, cy + 2, 34, 6).fill(SHADOW);
	g.roundRect(cx - 27, cy - 78, 54, 76, 4)
		.fill(slate)
		.stroke(line(3));
	g.rect(cx - 26, cy - 6, 52, 6)
		.fill(STEEL_DARK)
		.stroke(line(2));
	// The left door, shut: vents at its top, a handle, a scuff, a smiley magnet.
	g.roundRect(cx - 23, cy - 74, 21, 64, 2)
		.fill(mix(slate, 0xffffff, 0.12))
		.stroke({ width: 1.8, color: INK });
	for (let k = 0; k < 3; k++) g.roundRect(cx - 19, cy - 69 + k * 4, 13, 1.8, 0.9);
	g.fill({ color: INK, alpha: 0.6 });
	g.roundRect(cx - 7, cy - 46, 3, 10, 1.5)
		.fill(STEEL_LIGHT)
		.stroke({ width: 1.2, color: INK });
	g.moveTo(cx - 20, cy - 24)
		.lineTo(cx - 13, cy - 27)
		.moveTo(cx - 19, cy - 20)
		.lineTo(cx - 15, cy - 22)
		.stroke({ width: 1.2, color: 0xffffff, alpha: 0.45 });
	g.circle(cx - 14, cy - 55, 3.6)
		.fill(SAFETY)
		.stroke({ width: 1.2, color: INK });
	g.circle(cx - 15.2, cy - 55.8, 0.6)
		.circle(cx - 12.8, cy - 55.8, 0.6)
		.fill(INK);
	g.moveTo(cx - 15.6, cy - 54)
		.quadraticCurveTo(cx - 14, cy - 52.6, cx - 12.4, cy - 54)
		.stroke({ width: 0.8, color: INK });
	// The right door, ajar: a dark gap at the seam, the door swung a little out, a sleeve hanging out.
	g.rect(cx - 1, cy - 74, 6, 64).fill(INK);
	g.poly([cx + 5, cy - 76, cx + 24, cy - 74, cx + 24, cy - 10, cx + 5, cy - 8])
		.fill(mix(slate, 0xffffff, 0.2))
		.stroke({ width: 1.8, color: INK, join: "round" });
	for (let k = 0; k < 3; k++) g.roundRect(cx + 9, cy - 70 + k * 4, 12, 1.8, 0.9);
	g.fill({ color: INK, alpha: 0.6 });
	g.roundRect(cx + 7, cy - 46, 3, 10, 1.5)
		.fill(STEEL_LIGHT)
		.stroke({ width: 1.2, color: INK });
	// The sleeve in the foreman's vest's hi-vis (themes/factory/rig.ts FACTORY.hivis), a reflective band on it.
	g.poly([cx, cy - 50, cx + 6, cy - 50, cx + 9, cy - 26, cx + 2, cy - 25])
		.fill(0xd4ef3a)
		.stroke({ width: 1.6, color: INK, join: "round" });
	g.poly([cx + 1.2, cy - 40, cx + 7.4, cy - 40, cx + 7.9, cy - 36, cx + 1.6, cy - 36]).fill(STEEL_LIGHT);
	g.roundRect(cx + 1, cy - 27, 9, 4, 1.5)
		.fill(ORANGE)
		.stroke({ width: 1.2, color: INK });
	// The hard hat, on a hook at the locker's side.
	const hx = cx - 37;
	const hy = cy - 48;
	g.moveTo(cx - 27, hy - 14)
		.lineTo(hx + 1, hy - 14)
		.lineTo(hx + 1, hy - 9)
		.stroke({ width: 2, color: STEEL_DARK, cap: "round" });
	g.moveTo(hx - 10, hy)
		.arc(hx, hy, 10, Math.PI, Math.PI * 2)
		.closePath()
		.fill(SAFETY)
		.stroke(line(2.5));
	g.moveTo(hx, hy - 10)
		.lineTo(hx, hy)
		.stroke({ width: 2, color: mix(SAFETY, INK, 0.25) });
	g.roundRect(hx - 13, hy - 1, 26, 4.5, 2)
		.fill(SAFETY)
		.stroke(line(2));
	g.rect(hx - 6, hy - 6, 3, 3).fill({ color: 0xffffff, alpha: 0.5 });
	// The crate, a side table where the boss keeps a bookcase: a thermos and a lunch tin on it.
	const bx = x + 236;
	const by = f + 238;
	g.rect(bx - 19, by - 28, 44, 30).fill(SHADOW);
	g.roundRect(bx - 22, by - 30, 44, 30, 2)
		.fill(WOOD)
		.stroke(line(3));
	g.moveTo(bx - 22, by - 20)
		.lineTo(bx + 22, by - 20)
		.moveTo(bx - 22, by - 10)
		.lineTo(bx + 22, by - 10)
		.stroke({ width: 1.5, color: INK, alpha: 0.5 });
	g.rect(bx - 22, by - 30, 6, 30)
		.rect(bx + 16, by - 30, 6, 30)
		.fill({ color: INK, alpha: 0.12 });
	g.poly([bx + 22, by - 30, bx + 22, by - 24, bx + 17, by - 30]).fill(mix(WOOD, 0xffffff, 0.35));
	g.roundRect(bx - 15, by - 54, 10, 24, 3)
		.fill(GREEN)
		.stroke(line(2));
	g.roundRect(bx - 16, by - 58, 12, 6, 2)
		.fill(STEEL_LIGHT)
		.stroke({ width: 1.6, color: INK });
	g.rect(bx - 14, by - 44, 8, 3).fill({ color: 0xffffff, alpha: 0.5 });
	g.moveTo(bx + 4, by - 44)
		.quadraticCurveTo(bx + 11, by - 51, bx + 18, by - 44)
		.stroke({ width: 1.8, color: INK });
	g.roundRect(bx + 1, by - 44, 20, 14, 3)
		.fill(STEEL_LIGHT)
		.stroke(line(2));
	g.moveTo(bx + 1, by - 39)
		.lineTo(bx + 21, by - 39)
		.stroke({ width: 1.2, color: INK, alpha: 0.5 });
	g.rect(bx + 9, by - 41, 4, 4).fill(STEEL_DARK);
}

/** The conveyor aisle: concrete, yellow lane lines, and the belt down the middle on its rollers. */
export function hallway(g: Graphics, r: Rect): void {
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
	g.moveTo(r.x, mid - bh / 2 - 5)
		.lineTo(r.x + r.w, mid - bh / 2 - 5)
		.moveTo(r.x, mid + bh / 2 + 5)
		.lineTo(r.x + r.w, mid + bh / 2 + 5)
		.stroke(line(3));
	// Walkway lanes either side, dashed.
	for (let x = r.x + 8; x < r.x + r.w; x += 34) g.rect(x, r.y + 14, 20, 4).rect(x, r.y + r.h - 18, 20, 4);
	g.fill(SAFETY);
	g.moveTo(r.x, r.y + 2.5)
		.lineTo(r.x + r.w, r.y + 2.5)
		.moveTo(r.x, r.y + r.h - 2.5)
		.lineTo(r.x + r.w, r.y + r.h - 2.5)
		.stroke(line(5));
}
