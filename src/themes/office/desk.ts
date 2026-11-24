// The office's desks and what sits on them: the desk and screen, in-tray, mugs, test lamp,
// drawers, the skip, the planner, and the stations. Split out of scene.ts.
import { Container, type Graphics } from "pixi.js";
import type { Lamp, PlannerRow, Tray } from "../../scene/contract";
import { GREEN, INK, RED, SHADOW, SUN, batched, hash, label, line, wob } from "../../scene/office/paper";
import { MONITOR, PROPS } from "../../scene/world/propspots";
import type { Rect } from "../../scene/world/world";
import type { FurnitureKind } from "../../scene/theme/types";
import { OFFICE_WORDS } from "./words";
import { NOTE_COLOURS, PAPER, PAPER_EDGE, SLAB, WOOD, WOOD_TOP } from "./palette";

/** The in-tray: a wire tray and its pile, sheets off it past 80%, empty while the lead has it out.
 * While the lead plays `buried` the rig draws the tray and pile (and the sheets going), so the
 * office draws nothing, or there would be two. */
export function inTray(t: Tray, seed: string): Graphics {
	const g = batched();
	if (t.rig) return g;
	const { x, y, w, sheet } = PROPS.tray;
	const s = hash(seed);
	// The tray.
	g.roundRect(x - 2, y - 4, w + 4, 6, 2)
		.fill(0xc5cbe0)
		.stroke(line(2));
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
			g.roundRect(mx, my, w, h, 1.5)
				.fill(k % 2 ? 0xffffff : 0xffd0e4)
				.stroke(line(1.4));
			g.moveTo(mx + w, my + 1.5)
				.arc(mx + w, my + h / 2, h / 2 - 1.5, -Math.PI / 2, Math.PI / 2)
				.stroke(line(1.2));
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
	g.circle(x, y - 6, 5)
		.fill(colour)
		.stroke(line(1.6));
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
			for (let f = 0; f < 3; f++)
				g.rect(x + dx + 3 + f * 5, dy - 3 + (f % 2), 4, 5)
					.fill([SUN, 0x9be3ff, 0xffbdd6][f]!)
					.stroke({ width: 1, color: INK });
		}
		g.roundRect(x + dx + 1, dy, w - 2, h - 2, 2)
			.fill(0xdfe4f2)
			.stroke(line(1.5));
		g.roundRect(x + dx + w / 2 - 3, dy + h / 2 - 2, 6, 2, 1).fill(INK);
	}
	return g;
}

/** The recycling bin on the floor in front of the cabinet (the slot is `skip`), filled 0 to 5 loads
 * with balled-up removed lines. */
export function skip(load: number): Graphics {
	const g = batched();
	const { x, y, w, h } = PROPS.skip;
	if (load > 0) {
		// Balled-up paper, heaped over the rim as the loads go in.
		const heap = Math.min(5, load);
		for (let i = 0; i < heap * 2; i++) {
			const bx = x + 6 + ((i * 7) % (w - 10));
			const by = y - h + 1 - Math.floor(i / 2) * 2.2 + (i % 2);
			g.circle(bx, by, 3)
				.fill(i % 3 ? 0xffffff : 0xf1f3fa)
				.stroke({ width: 1, color: INK });
		}
	}
	g.poly([x + 2, y - h, x + w - 2, y - h, x + w - 5, y, x + 5, y])
		.fill(0x3d7dff)
		.stroke(line(2));
	g.roundRect(x, y - h - 2, w, 3.4, 1.5)
		.fill(0x2f63d0)
		.stroke({ width: 1.5, color: INK });
	// The three chasing arrows, in white.
	const cx = x + w / 2;
	const cy = y - h / 2 + 0.5;
	for (let k = 0; k < 3; k++) {
		const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
		const b = a + 1.6;
		g.moveTo(cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4)
			.lineTo(cx + Math.cos(b) * 3.4, cy + Math.sin(b) * 3.4)
			.stroke({ width: 1.2, color: 0xffffff });
		g.circle(cx + Math.cos(b) * 3.4, cy + Math.sin(b) * 3.4, 0.9).fill(0xffffff);
	}
	return g;
}

/** The room's planner on its back wall: a board in three columns of sticky notes, a colour per
 * session, as many as fit and a "+n" for the rest. Another theme takes it with its own board
 * colour, column words and dressing. */
export function plannerOf(
	r: Rect,
	rows: PlannerRow[],
	board = 0xf7e7c6,
	columns: readonly string[] = OFFICE_WORDS.columns,
	dress?: (g: Graphics, r: Rect) => void,
): Container {
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
		if (k > 0)
			g.moveTo(cx, r.y + 6)
				.lineTo(cx, r.y + r.h - 6)
				.stroke({ width: 1.5, color: INK, alpha: 0.3 });
		const t = label(columns[k]!, 6.5, "800");
		t.position.set(cx + (colW - t.width) / 2, r.y + 5);
		c.addChild(t);
		const notes = rows.flatMap((row) =>
			Array.from({ length: [row.pending, row.active, row.done][k]! }, () => NOTE_COLOURS[hash(row.session) % NOTE_COLOURS.length]!),
		);
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

// --- Furniture ------------------------------------------------------------------------------

/** A desk: the top surface behind, the front panel below. 150 wide, its front 44 tall; the top's
 * back edge at `back` (a work desk's is DESK_TOP, low enough that its lead's face shows over it). */
export function desk(g: Graphics, front: number, top: number, w = 150, back = -70): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, back, w + 24, -38 - back, 8)
		.fill(top)
		.stroke(line(4));
	g.roundRect(-w / 2, -44, w, 44, 5)
		.fill(front)
		.stroke(line(4));
}

/** The desk's screen, its stand's foot at the origin (propspots.ts MONITOR): an ink foot and neck,
 * the screen in an ink outline, filled `face`. */
export function screen(g: Graphics, face: number): void {
	const { w, h, neck } = MONITOR;
	g.roundRect(-9, -3, 18, 4, 2).fill(INK);
	g.rect(-3, -neck - 1, 6, neck).fill(INK);
	g.roundRect(-w / 2, -neck - h, w, h, 6)
		.fill(face)
		.stroke(line(4));
}

/** Body extents, from the base: left edge (toward the wall) and right edge (toward the user). */
const ST_L = -24;

const ST_R = 24;

export function station(g: Graphics, kind: FurnitureKind): void {
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
			g.rect(ST_L + 4, -10, 5, 10)
				.rect(ST_R - 9, -10, 5, 10)
				.fill(INK);
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
			g.roundRect(ST_L + 5, -20, w - 10, 9, 3)
				.fill(0xdfe4f2)
				.stroke({ width: 2, color: INK });
			g.roundRect(-5, -17, 10, 3, 1.5).fill(INK);
			g.roundRect(ST_L + 2, -7, w - 4, 7, 3).fill(SLAB);
			break;
		}
		case "stamps": {
			// The QA desk: a small table, its top just under the point (ink pad and forms: the rig).
			g.rect(ST_L + 4, -38 + 5, w, 38).fill(SHADOW);
			g.rect(ST_L + 4, -32, 5, 32)
				.rect(ST_R - 9, -32, 5, 32)
				.fill(INK);
			g.rect(ST_L + 6, -14, w - 12, 3).fill(INK);
			g.roundRect(ST_L - 2, -38, w + 4, 8, 3)
				.fill(WOOD_TOP)
				.stroke(line(4));
			break;
		}
		case "phone": {
			// The phone table: a slim stand with a shelf, and the phone's base toward the wall, where
			// the handset's cord goes (the receiver and the notepad at the working point: the rig).
			g.rect(ST_L + 8, -38 + 5, w - 8, 38).fill(SHADOW);
			g.roundRect(-5, -32, 10, 30, 3).fill(WOOD).stroke(line(3));
			g.roundRect(ST_L + 2, -4, w - 4, 6, 3)
				.fill(WOOD)
				.stroke(line(3));
			g.roundRect(ST_L - 2, -38, w + 4, 7, 3)
				.fill(WOOD_TOP)
				.stroke(line(4));
			g.roundRect(ST_L + 1, -50, 22, 13, 5)
				.fill(0x3d4256)
				.stroke(line(3));
			g.roundRect(ST_L + 5, -47, 14, 3, 1.5).fill(0x9aa3bd);
			break;
		}
		case "outbox": {
			// A mail cart: a canvas bin on a frame with wheels (the wire tray on top: the rig).
			g.rect(ST_L + 4, -40 + 5, w, 36).fill(SHADOW);
			g.roundRect(ST_L, -40, w, 30, 5).fill(0xb9c7e6).stroke(line(4));
			g.moveTo(ST_L + 6, -30)
				.quadraticCurveTo(0, -22, ST_R - 6, -30)
				.stroke({ width: 2, color: INK, alpha: 0.5 });
			g.rect(ST_L + 3, -10, 4, 6)
				.rect(ST_R - 7, -10, 4, 6)
				.fill(INK);
			g.circle(ST_L + 5, -3, 3.5)
				.circle(ST_R - 5, -3, 3.5)
				.fill(INK);
			break;
		}
	}
}
