// The office's rooms: the shell, windows and doors, ceiling lights, the mug wall, posters, the
// signs, your door and the boss's corner, and the hallway. Split out of scene.ts.
import { Container, type Graphics } from "pixi.js";
import { GREEN, INK, PAPER_SIGNS, RED, SHADOW, SUN, type SignStyle, hash, label, line, signboard, text } from "../../scene/office/paper";
import { rotRect } from "../../scene/rig/theme";
import { KITCHEN_WALL, ceilingPanels } from "../../scene/world/propspots";
import type { Area, Rect } from "../../scene/world/world";
import type { SignText } from "../../scene/theme/words";
import { OFFICE_WORDS } from "./words";
import { COMMON_COLOURS, HALL_FLOOR, PLANT_LEAVES, ROOM_COLOURS, SLAB } from "./palette";

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
	g.moveTo(x, floorY)
		.lineTo(x + w, floorY)
		.stroke(line(4));
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

export function hallway(g: Graphics, r: Rect): void {
	g.rect(r.x, r.y, r.w, r.h).fill(HALL_FLOOR);
	for (let x = r.x + 118; x < r.x + r.w; x += 122) g.rect(x, r.y, 4, r.h);
	g.fill({ color: INK, alpha: 0.1 });
	g.moveTo(r.x, r.y + 2.5)
		.lineTo(r.x + r.w, r.y + 2.5)
		.moveTo(r.x, r.y + r.h - 2.5)
		.lineTo(r.x + r.w, r.y + r.h - 2.5)
		.stroke(line(5));
}

// --- Wall items -------------------------------------------------------------------------------

function windowPane(g: Graphics, { x, y, w, h }: Rect, seed: number): void {
	g.roundRect(x, y, w, h, 10).fill(0xbfe6ff);
	const cx = x + w * (0.12 + (seed % 5) * 0.05);
	const cy = y + h * 0.3;
	g.roundRect(cx, cy, 34, 16, 8)
		.roundRect(cx + 20, cy + 9, 30, 12, 6)
		.fill(0xffffff);
	g.rect(x + w / 2 - 2.5, y, 5, h).fill(INK);
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 9).stroke(line(5));
}

function door(g: Graphics, { x, y, w, h }: Rect): void {
	const r = w / 2;
	g.moveTo(x, y + h)
		.lineTo(x, y + r)
		.arc(x + r, y + r, r, Math.PI, 0)
		.lineTo(x + w, y + h)
		.closePath()
		.fill(SLAB)
		.stroke(line(5));
	g.circle(x + w - 12, y + h * 0.52, 4.5).fill(SUN);
}

/** A room: its shell in its colours, the fluorescent panels, then its wall items (the planner has
 * its own layer), and a motivational poster in any stretch of bare wall wide enough for one. */
export function room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void {
	const [wall, floor] = a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON_COLOURS[a.kind as keyof typeof COMMON_COLOURS];
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
		g.roundRect(cx - 38, y + 3, 76, 7, 3)
			.fill(0xf7fbff)
			.stroke({ width: 2, color: INK });
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
		g.roundRect(mx, sy - 9, 9, 9, 2)
			.fill(mugs[k]!)
			.stroke({ width: 1.4, color: INK });
		g.moveTo(mx + 9, sy - 7.5)
			.arc(mx + 9, sy - 5, 2.5, -Math.PI / 2, Math.PI / 2)
			.stroke({ width: 1.2, color: INK });
		if (k % 2 === 0) g.rect(mx + 2, sy - 6, 5, 1.6).fill({ color: INK, alpha: 0.5 });
	}
	g.roundRect(x, sy, w, 3.6, 1.5).fill(0xd9a066).stroke({ width: 1.5, color: INK });
	// The banner over the mugs' tops, its two lines clear of its edge.
	g.roundRect(x, y - 1, w, 13, 3)
		.fill(0xffffff)
		.stroke({ width: 1.5, color: INK });
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
		if (f.kind === "plant" && Math.abs(f.y - a.floorY) <= 20)
			taken.push([f.x - PLANT_LEAVES.left - PLANT_LEAVES.air, f.x + PLANT_LEAVES.right + PLANT_LEAVES.air]);
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
			g.moveTo(px + pw / 2 - ph * 0.38, ground)
				.arc(px + pw / 2, ground, ph * 0.38, Math.PI, 0)
				.closePath()
				.fill(SUN);
			g.rect(px, ground - 3, pw, 3).fill(0x2b2340);
			break;
		case "dominoes":
			for (let k = 0; k < 5; k++)
				g.poly(rotRect(px + 7 + k * 8, ground - 8, 4, 14, k === 4 ? 0.9 : k * 0.12))
					.fill(0xffffff)
					.stroke({ width: 1, color: INK });
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
				g.moveTo(bx2 + Math.cos(a + 2.6) * 3.4, by2 + Math.sin(a + 2.6) * 3.4)
					.lineTo(bx2, by2)
					.lineTo(bx2 + Math.cos(a - 2.6) * 3.4, by2 + Math.sin(a - 2.6) * 3.4)
					.stroke({ width: 1.3, color: col, alpha: 0.8 });
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
			g.poly([x + 10, y + h - 9, x + w * 0.32, y + h - 30, x + w * 0.48, y + h - 18, x + w * 0.66, y + h - 36, x + w - 10, y + h - 9]).fill({
				color: 0x46536f,
				alpha: 0.22,
			});
		}
	},
};

// --- Your office -------------------------------------------------------------------------------

/** Your door: a door with YOU on it. */
function yourDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	const r = w / 2;
	g.moveTo(x, y + h)
		.lineTo(x, y + r)
		.arc(x + r, y + r, r, Math.PI, 0)
		.lineTo(x + w, y + h)
		.closePath()
		.fill(0x8a5a3c)
		.stroke(line(5));
	g.circle(x + w - 12, y + h * 0.55, 4.5).fill(SUN);
	g.roundRect(x + 10, y + 24, w - 20, 20, 4)
		.fill(0xffffff)
		.stroke(line(3));
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
	g.roundRect(x + 204, f + 86, 84, 92, 14)
		.fill(0xc7524f)
		.stroke({ width: 2, color: INK, alpha: 0.4 });
	g.roundRect(x + 211, f + 93, 70, 78, 10).stroke({ width: 2.5, color: 0xf2bd3c, alpha: 0.85 });
	g.roundRect(x + 220, f + 102, 52, 60, 8).fill({ color: 0xffffff, alpha: 0.12 });
	// The armchair: a wingback in green leather, facing out.
	const cx = x + 246;
	const cy = f + 140;
	g.ellipse(cx + 4, cy + 2, 38, 8).fill(SHADOW);
	g.roundRect(cx - 26, cy - 74, 52, 60, 14)
		.fill(0x2f8f6b)
		.stroke(line(3));
	for (const bx of [-12, 0, 12]) g.circle(cx + bx, cy - 52, 1.8).fill({ color: INK, alpha: 0.5 });
	g.roundRect(cx - 24, cy - 30, 48, 18, 6)
		.fill(0x3aa57c)
		.stroke(line(2.5));
	g.roundRect(cx - 36, cy - 44, 14, 38, 6)
		.roundRect(cx + 22, cy - 44, 14, 38, 6)
		.fill(0x3aa57c)
		.stroke(line(3));
	g.rect(cx - 30, cy - 6, 5, 7)
		.rect(cx + 25, cy - 6, 5, 7)
		.fill(0x8a5a3c);
	// The bookcase: two shelves of books, a trophy on top.
	const bx = x + 236;
	const by = f + 238;
	g.rect(bx - 20, by - 50, 46, 50).fill(SHADOW);
	g.roundRect(bx - 23, by - 52, 46, 52, 3)
		.fill(0xb7794a)
		.stroke(line(3));
	g.moveTo(bx - 23, by - 26)
		.lineTo(bx + 23, by - 26)
		.stroke(line(2));
	const spines = [0x3d7dff, 0xff6b6b, 0xffd166, 0x2fcf83, 0x8c5cff, 0xffffff];
	for (const [row, top] of [
		[0, by - 48],
		[1, by - 22],
	] as const) {
		for (let i = 0; i < 5; i++) {
			const h = 15 + ((i + row) % 3) * 2;
			g.rect(bx - 18 + i * 7, top + 19 - h, 6, h)
				.fill(spines[(i + row * 2) % spines.length]!)
				.stroke({ width: 1, color: INK });
		}
	}
	// The trophy: a gold cup on a plinth.
	g.rect(bx - 7, by - 58, 14, 6).fill(INK);
	g.rect(bx - 2, by - 65, 4, 8)
		.fill(0xf2bd3c)
		.stroke({ width: 1.2, color: INK });
	g.moveTo(bx - 10, by - 82)
		.lineTo(bx + 10, by - 82)
		.quadraticCurveTo(bx + 9, by - 66, bx, by - 65)
		.quadraticCurveTo(bx - 9, by - 66, bx - 10, by - 82)
		.closePath()
		.fill(0xf7c948)
		.stroke(line(2));
	g.moveTo(bx - 10, by - 79)
		.quadraticCurveTo(bx - 16, by - 77, bx - 9, by - 71)
		.moveTo(bx + 10, by - 79)
		.quadraticCurveTo(bx + 16, by - 77, bx + 9, by - 71)
		.stroke({ width: 1.8, color: INK });
	g.rect(bx - 4, by - 79, 2.5, 8).fill({ color: 0xffffff, alpha: 0.6 });
}
