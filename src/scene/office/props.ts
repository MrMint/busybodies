// Metrics as things, drawn (plan-next stream B): the office theme's props for the numbers the
// director passes (director/metrics.ts). Cut paper like the rest (paper.ts): flat shapes, ink
// outlines. Every function draws once per change into a Container or Graphics; nothing here runs
// per frame. Desk props are drawn around the desk front's centre (as office.ts's desk is): the desk
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
import type { DeskProps, Lamp, PlannerRow, Tray } from "../director/metrics";
import { GREEN, INK, RED, SHADOW, SUN, label } from "./paper";
import { PROPS } from "./propspots";
import type { Rect } from "./world";

export { PROPS };

/** A Graphics that always joins the batch: a pile of sheets or a planner of notes is more than the
 * ~200 vertices Pixi batches by default, and each would cost its own draw call (and break the
 * batch around it). They change only when their numbers do, so batching them is cheap. */
function batched(): Graphics {
	const g = new Graphics();
	g.context.batchMode = "batch";
	return g;
}

const line = (width: number) => ({ width, color: INK, join: "round" as const, cap: "round" as const });
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** A small, fixed wobble from a seed: -1 to 1. */
const wob = (seed: number, i: number) => (((seed + i * 2654435761) >>> 0) % 1000) / 500 - 1;


const PAPER = 0xffffff;
const PAPER_EDGE = 0xdfe4f2;

/** The in-tray: a wire tray and its pile, sheets off it past 80%, empty while the lead has it out.
 * While the lead plays `buried` the rig draws the tray and pile (and the sheets going), so the
 * office draws nothing, or there would be two. */
export function inTray(t: Tray, seed: string): Graphics {
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
export function mugPile(n: number): Graphics {
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
export function testLamp(lamp: Lamp): Graphics {
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
export function drawers(n: number, full: number): Graphics {
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
export function skip(load: number): Graphics {
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

/** Everything a desk's metrics draw, split into what reads at any zoom (the pile, the lamp) and the
 * small things that only show zoomed in (mugs, drawers, skip). */
export function deskProps(p: DeskProps, seed: string): { always: Container; detail: Container } {
	const always = new Container();
	const detail = new Container();
	if (p.tray) always.addChild(inTray(p.tray, seed));
	if (p.lamp) always.addChild(testLamp(p.lamp));
	if (p.mugs > 0) detail.addChild(mugPile(p.mugs));
	if (p.drawers) detail.addChild(drawers(p.drawers.drawers, p.drawers.full));
	if (p.skip > 0) detail.addChild(skip(p.skip));
	return { always, detail };
}

/** The signature a desk's props redraw on. */
export const propsSig = (p: DeskProps | undefined): string =>
	p ? [p.tray ? `${p.tray.sheets},${p.tray.spill},${p.tray.buried},${!!p.tray.out},${!!p.tray.rig}` : "", p.word ?? "", p.drawers ? `${p.drawers.drawers},${p.drawers.full}` : "", p.skip, p.mugs, p.lamp ?? ""].join("/") : "";

// --- The planner -------------------------------------------------------------------------------

const NOTE_COLOURS = [SUN, 0xffbdd6, 0x9be3ff, 0xa5e6c9, 0xd2c0ff, 0xffc47f];
const COLUMNS = ["TO DO", "DOING", "DONE"] as const;

/** The room's planner on its back wall: a board in three columns of sticky notes, a colour per
 * session, as many as fit and a "+n" for the rest. */
export function planner(r: Rect, rows: PlannerRow[]): Container {
	const c = new Container();
	const g = batched();
	c.addChild(g);
	g.roundRect(r.x, r.y, r.w, r.h, 8).fill(0xf7e7c6).stroke(line(5));
	const colW = (r.w - 12) / 3;
	const note = 9;
	const gap = 2;
	const perRow = Math.max(1, Math.floor((colW - 2) / (note + gap)));
	const head = 17;
	const fit = perRow * Math.floor((r.h - head - 6) / (note + gap));
	for (let k = 0; k < 3; k++) {
		const cx = r.x + 6 + k * colW;
		if (k > 0) g.moveTo(cx, r.y + 6).lineTo(cx, r.y + r.h - 6).stroke({ width: 1.5, color: INK, alpha: 0.3 });
		const t = label(COLUMNS[k]!, 6.5, "800");
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

export const plannerSig = (rows: PlannerRow[] | undefined): string => (rows ?? []).map((r) => `${r.session}:${r.pending},${r.active},${r.done}`).join(";");

// --- Your office -------------------------------------------------------------------------------

/** Your door: a door with YOU on it. */
export function yourDoor(g: Graphics, { x, y, w, h }: Rect): Container {
	const r = w / 2;
	g.moveTo(x, y + h).lineTo(x, y + r).arc(x + r, y + r, r, Math.PI, 0).lineTo(x + w, y + h).closePath().fill(0x8a5a3c).stroke(line(5));
	g.circle(x + w - 12, y + h * 0.55, 4.5).fill(SUN);
	g.roundRect(x + 10, y + 24, w - 20, 20, 4).fill(0xffffff).stroke(line(3));
	const t = label("YOU", 13, "800");
	t.position.set(x + w / 2 - t.width / 2, y + 26);
	return t;
}

// --- Furniture bodies (baked like the rest: paper.ts drawFurniture) ----------------------------

export type PropFurniture = "shredder" | "tickets" | "bell";
export const PROP_FURNITURE: PropFurniture[] = ["shredder", "tickets", "bell"];

export function drawPropFurniture(g: Graphics, kind: PropFurniture): void {
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
