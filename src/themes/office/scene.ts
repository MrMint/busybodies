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
import { Container, Graphics } from "pixi.js";
import type { Lamp, PlannerRow, Tray } from "../../scene/contract";
import { GREEN, INK, PAPER_SIGNS, RED, SHADOW, SUN, type SignStyle, batched, hash, label, line, noise, signboard, text, wob } from "../../scene/office/paper";
import { rotRect } from "../../scene/rig/theme";
import { mix } from "../../scene/office/light";
import { KITCHEN_WALL, MONITOR, PROPS, ceilingPanels } from "../../scene/world/propspots";
import type { Who } from "../../scene/contract";
import { type Area, type Band, DESK_TOP, type Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import type { FurnitureKind, SceneLight, SceneTheme } from "../../scene/theme/types";
import type { SignText } from "../../scene/theme/words";
import { OFFICE_WORDS } from "./words";
import { BLOOMS, COMMON_COLOURS, HALL_FLOOR, LAWN, NOTE_COLOURS, PAPER, PAPER_EDGE, PLANT_LEAVES, ROOM_COLOURS, SLAB, STONE, WOOD, WOOD_TOP } from "./palette";

/** A project room's rug under its desks: a step deeper than its floor, never near a body colour,
 * edged in the wall's colour so the room reads as its project's from the whole-office stop. */
function rugOf(a: Area): { fill: number; edge: number } | undefined {
	if (a.kind !== "project") return undefined;
	const [wall, floor] = ROOM_COLOURS[a.hue % ROOM_COLOURS.length]!;
	return { fill: mix(floor, wall, 0.35), edge: mix(wall, INK, 0.12) };
}

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

/** A room: its shell in its colours, the fluorescent panels, then its wall items (the planner has
 * its own layer), and a motivational poster in any stretch of bare wall wide enough for one. */
function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [wall, floor] =
		a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON_COLOURS[a.kind as keyof typeof COMMON_COLOURS];
	roomShell(g, a.rect, a.floorY, wall, floor, a.kind === "kitchen");
	fluorescents(g, a.rect);
	const seed = hash(a.id);
	for (const [i, w] of a.wall.entries()) {
		if (w.kind === "window") windowPane(g, w.rect, seed + i);
		else if (w.kind === "door") door(g, w.rect);
		else if (w.kind === "you") c.addChild(yourDoor(g, w.rect));
		else if (w.kind !== "planner") c.addChild(signboard(w.kind, w.rect, w.slot ? sign(w.slot) : undefined, seed + i, OFFICE_SIGNS));
	}
	if (a.kind === "kitchen") c.addChild(mugWall(g, a));
	if (a.kind === "yours") bossCorner(g, a);
	for (const [k, r] of posterSpots(a).entries()) c.addChild(poster(g, r, seed + k * 7));
}

// --- Set dressing: the office goes full office --------------------------------------------------

/** Fluorescent ceiling panels along the top of the back wall: a tube in a white housing every
 * so often, with a cold glow under it. */
function fluorescents(g: Graphics, r: Rect): void {
	const y = r.y;
	for (const { cx } of ceilingPanels(r)) {
		g.rect(cx - 34, y + 9, 68, 5).fill({ color: 0xeaf6ff, alpha: 0.55 });
		g.roundRect(cx - 38, y + 3, 76, 7, 3).fill(0xf7fbff).stroke({ width: 2, color: INK });
		g.roundRect(cx - 33, y + 5, 66, 3, 1.5).fill(0xdff4ff);
	}
}

/** The kitchen's mug wall, between the fridge and the sign, just over the coffee machine: a shelf
 * of novelty mugs under the banner that explains them. Small: it reads zoomed in, and is quiet at
 * office zoom. world/propspots.ts KITCHEN_WALL places it, clear of the machine and its steam. */
function mugWall(g: Graphics, a: Area): Container {
	const { x: dx, y: dy, w, h } = KITCHEN_WALL.mugWall;
	const x = a.rect.x + dx;
	const y = a.rect.y + dy;
	const mugs = [0xffffff, 0xffd0e4, SUN, 0x9be3ff, 0xa5e6c9];
	const sy = y + h - 3.6;
	for (let k = 0; k < mugs.length; k++) {
		const mx = x + 4 + k * 15;
		g.roundRect(mx, sy - 9, 9, 9, 2).fill(mugs[k]!).stroke({ width: 1.4, color: INK });
		g.moveTo(mx + 9, sy - 7.5).arc(mx + 9, sy - 5, 2.5, -Math.PI / 2, Math.PI / 2).stroke({ width: 1.2, color: INK });
		if (k % 2 === 0) g.rect(mx + 2, sy - 6, 5, 1.6).fill({ color: INK, alpha: 0.5 });
	}
	g.roundRect(x, sy, w, 3.6, 1.5).fill(0xd9a066).stroke({ width: 1.5, color: INK });
	// The banner over the mugs' tops, its two lines clear of its edge.
	g.roundRect(x, y - 1, w, 13, 3).fill(0xffffff).stroke({ width: 1.5, color: INK });
	const t = text("you don't have to be busy\nto work here", 4.6, { fontWeight: "800", align: "center", lineHeight: 5.2 });
	if (t.width > w - 4) t.scale.set((w - 4) / t.width);
	t.anchor.set(0.5, 0);
	t.position.set(x + w / 2, y + 0.6);
	return t;
}

/** Bare stretches of back wall, between the wall items and the room's ends: a poster's place in
 * each one wide enough (the layout decides what hangs where; this only fills what it left). */
function posterSpots(a: Area): Rect[] {
	const { x, y, w } = a.rect;
	const taken: (readonly [number, number])[] = a.wall.map((it) => [it.rect.x, it.rect.x + it.rect.w] as const);
	// The kitchen's mug wall and the fridge in front of the wall are taken too.
	if (a.kind === "kitchen") taken.push([x, x + 196]);
	// So is a plant standing against the back wall (not one out on the floor): its leaves reach up it.
	for (const f of a.fixtures) {
		if (f.kind === "plant" && Math.abs(f.y - a.floorY) <= 20) taken.push([f.x - PLANT_LEAVES.left - PLANT_LEAVES.air, f.x + PLANT_LEAVES.right + PLANT_LEAVES.air]);
	}
	taken.sort((p, q) => p[0] - q[0]);
	const spots: Rect[] = [];
	let from = x + 18;
	const pw = 54;
	const ph = 70;
	for (const [l, r] of [...taken, [x + w - 18, x + w - 18] as const]) {
		const gap = l - from;
		if (gap >= pw + 28) spots.push({ x: Math.round(from + (gap - pw) / 2), y: y + 20, w: pw, h: ph });
		from = Math.max(from, r);
	}
	return spots;
}

/** Motivational posters: a big word over a dramatic picture, and a line that undercuts it. */
const POSTERS: [string, string, "peak" | "rowers" | "eagle" | "sunrise" | "dominoes"][] = [
	["SYNERGY", "nobody knows what it means, together", "rowers"],
	["TEAMWORK", "blame is a shared resource", "dominoes"],
	["EXCELLENCE", "good enough, but framed", "peak"],
	["ALIGNMENT", "let's circle back on that", "sunrise"],
	["VISION", "same thing, new font", "eagle"],
	["HUSTLE", "reply-all with confidence", "peak"],
	["PERSEVERANCE", "the build will finish. eventually.", "sunrise"],
	["LEADERSHIP", "it's a meeting about meetings", "eagle"],
];

/** A motivational poster in `r`: black mat, the picture, the word, the small print. */
function poster(g: Graphics, r: Rect, seed: number): Container {
	const [word, small, pic] = POSTERS[seed % POSTERS.length]!;
	const { x, y, w, h } = r;
	g.rect(x + 3, y + 4, w, h).fill(SHADOW);
	g.rect(x, y, w, h).fill(0x1d1f2e).stroke({ width: 2.5, color: INK });
	const px = x + 5;
	const py = y + 5;
	const pw = w - 10;
	const ph = h * 0.56;
	const sky = pic === "sunrise" ? 0xffb36b : pic === "eagle" ? 0x8fc8ff : 0x6f8fd8;
	g.rect(px, py, pw, ph).fill(sky);
	const ground = py + ph;
	switch (pic) {
		case "peak":
			g.poly([px, ground, px + pw * 0.45, py + 6, px + pw * 0.7, ground - ph * 0.45, px + pw, ground]).fill(0x46536f);
			g.poly([px + pw * 0.38, py + 12, px + pw * 0.45, py + 6, px + pw * 0.52, py + 12]).fill(0xffffff);
			break;
		case "rowers":
			g.rect(px, ground - ph * 0.3, pw, ph * 0.3).fill(0x3d7dff);
			g.roundRect(px + 6, ground - ph * 0.36, pw - 12, 3, 1.5).fill(INK);
			for (let k = 0; k < 4; k++) g.circle(px + 11 + k * ((pw - 22) / 3), ground - ph * 0.42, 2).fill(INK);
			break;
		case "eagle":
			g.poly([px + pw / 2, py + ph * 0.55, px + 4, py + ph * 0.3, px + pw / 2 - 3, py + ph * 0.45, px + pw - 4, py + ph * 0.3]).fill(0x2b2340);
			break;
		case "sunrise":
			g.moveTo(px + pw / 2 - ph * 0.38, ground).arc(px + pw / 2, ground, ph * 0.38, Math.PI, 0).closePath().fill(SUN);
			g.rect(px, ground - 3, pw, 3).fill(0x2b2340);
			break;
		case "dominoes":
			for (let k = 0; k < 5; k++) g.poly(rotRect(px + 7 + k * 8, ground - 8, 4, 14, k === 4 ? 0.9 : k * 0.12)).fill(0xffffff).stroke({ width: 1, color: INK });
			break;
	}
	g.rect(px, py, pw, ph).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
	const c = new Container();
	const big = text(word, 8, { fontWeight: "900", fill: 0xffffff, letterSpacing: 0.6 });
	if (big.width > w - 8) big.scale.set((w - 8) / big.width);
	big.anchor.set(0.5, 0);
	big.position.set(x + w / 2, ground + 3);
	const sub = text(small, 4.2, { fontWeight: "700", fill: 0xc5cbe0, wordWrap: true, wordWrapWidth: w - 8, align: "center", lineHeight: 5 });
	sub.anchor.set(0.5, 0);
	sub.position.set(x + w / 2, ground + 14);
	c.addChild(big, sub);
	return c;
}

/** The office's signs: the paper ones, with a whiteboard of arrows (a flowchart nobody can
 * follow, in the corner the text leaves) and the lobby's frame dressed as a motivational poster. */
const OFFICE_SIGNS: SignStyle = {
	...PAPER_SIGNS,
	dress: (g, kind, x, y, w, h) => {
		if (kind === "whiteboard") {
			const bx = x + w - 62;
			const by = y + h - 30;
			const box = (cx: number, cy: number, col: number) => g.roundRect(cx - 7, cy - 4.5, 14, 9, 2).stroke({ width: 1.4, color: col, alpha: 0.8 });
			box(bx + 8, by + 6, 0x3d7dff);
			box(bx + 34, by + 6, GREEN);
			box(bx + 21, by + 21, RED);
			const arrow = (pts: number[], col: number) => {
				g.moveTo(pts[0]!, pts[1]!);
				for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
				g.stroke({ width: 1.3, color: col, alpha: 0.8 });
				const n = pts.length;
				const [ax, ay, bx2, by2] = [pts[n - 4]!, pts[n - 3]!, pts[n - 2]!, pts[n - 1]!];
				const a = Math.atan2(by2 - ay, bx2 - ax);
				g.moveTo(bx2 + Math.cos(a + 2.6) * 3.4, by2 + Math.sin(a + 2.6) * 3.4).lineTo(bx2, by2).lineTo(bx2 + Math.cos(a - 2.6) * 3.4, by2 + Math.sin(a - 2.6) * 3.4).stroke({ width: 1.3, color: col, alpha: 0.8 });
			};
			arrow([bx + 15, by + 6, bx + 27, by + 6], INK);
			arrow([bx + 34, by + 11, bx + 34, by + 21, bx + 28, by + 21], INK);
			arrow([bx + 14, by + 21, bx + 8, by + 21, bx + 8, by + 11], RED);
			// And one that goes nowhere at all, circled.
			arrow([bx + 44, by + 21, bx + 52, by + 14, bx + 50, by + 6], 0x8c5cff);
			g.ellipse(bx + 50, by + 3, 5, 3.4).stroke({ width: 1.2, color: 0x8c5cff, alpha: 0.8 });
		}
		if (kind === "frame") {
			// A gilt edge and a mountain at the foot of the frame: motivational, whatever it says.
			g.roundRect(x + 4, y + 4, w - 8, h - 8, 6).stroke({ width: 2, color: 0xf2bd3c });
			g.poly([x + 10, y + h - 9, x + w * 0.32, y + h - 30, x + w * 0.48, y + h - 18, x + w * 0.66, y + h - 36, x + w - 10, y + h - 9]).fill({ color: 0x46536f, alpha: 0.22 });
		}
	},
};

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

/** The recycling bin on the floor in front of the cabinet (the slot is `skip`), filled 0 to 5 loads
 * with balled-up removed lines. */
function skip(load: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.skip;
	if (load > 0) {
		// Balled-up paper, heaped over the rim as the loads go in.
		const heap = Math.min(5, load);
		for (let i = 0; i < heap * 2; i++) {
			const bx = x + 6 + ((i * 7) % (w - 10));
			const by = y - h + 1 - Math.floor(i / 2) * 2.2 + (i % 2);
			g.circle(bx, by, 3).fill(i % 3 ? 0xffffff : 0xf1f3fa).stroke({ width: 1, color: INK });
		}
	}
	g.poly([x + 2, y - h, x + w - 2, y - h, x + w - 5, y, x + 5, y]).fill(0x3d7dff).stroke(line(2));
	g.roundRect(x, y - h - 2, w, 3.4, 1.5).fill(0x2f63d0).stroke({ width: 1.5, color: INK });
	// The three chasing arrows, in white.
	const cx = x + w / 2;
	const cy = y - h / 2 + 0.5;
	for (let k = 0; k < 3; k++) {
		const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
		const b = a + 1.6;
		g.moveTo(cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4).lineTo(cx + Math.cos(b) * 3.4, cy + Math.sin(b) * 3.4).stroke({ width: 1.2, color: 0xffffff });
		g.circle(cx + Math.cos(b) * 3.4, cy + Math.sin(b) * 3.4, 0.9).fill(0xffffff);
	}
	return g;
}

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

/**
 * Your office, lightly furnished as the boss's: a framed picture under NOW SERVING, and in the
 * right-hand corner (clear of the door in, the ticket machine, the counter with the bell, the queue
 * down the left and middle, and the YOU door) a rug, a wingback armchair and a low bookcase with a
 * trophy on it. Nobody stands or walks there, so it is drawn flat into the room's layer.
 */
function bossCorner(g: Graphics, a: Area): void {
	const { x, y } = a.rect;
	const f = a.floorY;
	// The picture: a gilt frame, a sunset over hills.
	const px = x + 128;
	const py = y + 69;
	g.rect(px + 3, py + 3, 44, 30).fill(SHADOW);
	g.rect(px, py, 44, 30).fill(0xf2bd3c).stroke(line(2.5));
	g.rect(px + 5, py + 5, 34, 20).fill(0xffc58f);
	g.circle(px + 25, py + 17, 5).fill(0xfff0a6);
	g.poly([px + 5, py + 25, px + 15, py + 15, px + 23, py + 21, px + 31, py + 13, px + 39, py + 20, px + 39, py + 25]).fill(0x6c9b7a);
	// The rug.
	g.roundRect(x + 204, f + 86, 84, 92, 14).fill(0xc7524f).stroke({ width: 2, color: INK, alpha: 0.4 });
	g.roundRect(x + 211, f + 93, 70, 78, 10).stroke({ width: 2.5, color: 0xf2bd3c, alpha: 0.85 });
	g.roundRect(x + 220, f + 102, 52, 60, 8).fill({ color: 0xffffff, alpha: 0.12 });
	// The armchair: a wingback in green leather, facing out.
	const cx = x + 246;
	const cy = f + 140;
	g.ellipse(cx + 4, cy + 2, 38, 8).fill(SHADOW);
	g.roundRect(cx - 26, cy - 74, 52, 60, 14).fill(0x2f8f6b).stroke(line(3));
	for (const bx of [-12, 0, 12]) g.circle(cx + bx, cy - 52, 1.8).fill({ color: INK, alpha: 0.5 });
	g.roundRect(cx - 24, cy - 30, 48, 18, 6).fill(0x3aa57c).stroke(line(2.5));
	g.roundRect(cx - 36, cy - 44, 14, 38, 6).roundRect(cx + 22, cy - 44, 14, 38, 6).fill(0x3aa57c).stroke(line(3));
	g.rect(cx - 30, cy - 6, 5, 7).rect(cx + 25, cy - 6, 5, 7).fill(0x8a5a3c);
	// The bookcase: two shelves of books, a trophy on top.
	const bx = x + 236;
	const by = f + 238;
	g.rect(bx - 20, by - 50, 46, 50).fill(SHADOW);
	g.roundRect(bx - 23, by - 52, 46, 52, 3).fill(0xb7794a).stroke(line(3));
	g.moveTo(bx - 23, by - 26).lineTo(bx + 23, by - 26).stroke(line(2));
	const spines = [0x3d7dff, 0xff6b6b, 0xffd166, 0x2fcf83, 0x8c5cff, 0xffffff];
	for (const [row, top] of [[0, by - 48], [1, by - 22]] as const) {
		for (let i = 0; i < 5; i++) {
			const h = 15 + ((i + row) % 3) * 2;
			g.rect(bx - 18 + i * 7, top + 19 - h, 6, h).fill(spines[(i + row * 2) % spines.length]!).stroke({ width: 1, color: INK });
		}
	}
	// The trophy: a gold cup on a plinth.
	g.rect(bx - 7, by - 58, 14, 6).fill(INK);
	g.rect(bx - 2, by - 65, 4, 8).fill(0xf2bd3c).stroke({ width: 1.2, color: INK });
	g.moveTo(bx - 10, by - 82).lineTo(bx + 10, by - 82).quadraticCurveTo(bx + 9, by - 66, bx, by - 65).quadraticCurveTo(bx - 9, by - 66, bx - 10, by - 82).closePath().fill(0xf7c948).stroke(line(2));
	g.moveTo(bx - 10, by - 79).quadraticCurveTo(bx - 16, by - 77, bx - 9, by - 71).moveTo(bx + 10, by - 79).quadraticCurveTo(bx + 16, by - 77, bx + 9, by - 71).stroke({ width: 1.8, color: INK });
	g.rect(bx - 4, by - 79, 2.5, 8).fill({ color: 0xffffff, alpha: 0.6 });
}

// --- Furniture ------------------------------------------------------------------------------

/** A desk: the top surface behind, the front panel below. 150 wide, its front 44 tall; the top's
 * back edge at `back` (a work desk's is DESK_TOP, low enough that its lead's face shows over it). */
function desk(g: Graphics, front: number, top: number, w = 150, back = -70): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, back, w + 24, -38 - back, 8).fill(top).stroke(line(4));
	g.roundRect(-w / 2, -44, w, 44, 5).fill(front).stroke(line(4));
}

/** The desk's screen, its stand's foot at the origin (propspots.ts MONITOR): an ink foot and neck,
 * the screen in an ink outline, filled `face`. */
function screen(g: Graphics, face: number): void {
	const { w, h, neck } = MONITOR;
	g.roundRect(-9, -3, 18, 4, 2).fill(INK);
	g.rect(-3, -neck - 1, 6, neck).fill(INK);
	g.roundRect(-w / 2, -neck - h, w, h, 6).fill(face).stroke(line(4));
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
