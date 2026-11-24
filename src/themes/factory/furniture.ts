// The factory's furniture: benches, the hopper, tool chests, scrap bins and the rest, drawn by
// kind. Split out of scene.ts.
import { Graphics } from "pixi.js";
import type { Lamp, Tray } from "../../scene/contract";
import { GREEN, INK, RED, SHADOW, batched, hash, line, wob } from "../../scene/office/paper";
import { MONITOR, PROPS } from "../../scene/world/propspots";
import { DESK_TOP } from "../../scene/world/world";
import type { FurnitureKind } from "../../scene/theme/types";
import { GLASS, ORANGE, SAFETY, STEEL, STEEL_DARK, STEEL_LIGHT, WOOD, WOOD_TOP, hazard } from "./palette";

// --- Desk props ---------------------------------------------------------------------------------

const PART_COLOURS = [STEEL_LIGHT, SAFETY, 0x9be3ff, ORANGE, STEEL];

/** The parts hopper: a steel funnel at the in-tray's spot, filling with parts as the context does;
 * a heap over the rim past 60%, parts spilling off past 80%; empty while the lead has it out. While
 * the lead plays `buried` the rig draws the pile, so this draws nothing. */
export function hopper(t: Tray, seed: string): Graphics {
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
export function cans(n: number): Graphics {
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
export function beacon(lamp: Lamp): Graphics {
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
export function toolChest(n: number, full: number): Graphics {
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
export function scrapBin(load: number): Graphics {
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
function bench(g: Graphics, w = 150, top = STEEL_LIGHT, front = STEEL_DARK, back = -70): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, back, w + 24, -38 - back, 4).fill(top).stroke(line(4));
	g.roundRect(-w / 2, -44, w, 44, 3).fill(front).stroke(line(4));
	hazard(g, -w / 2 + 4, -40, w - 8, 4, 10);
	for (let i = 0; i < 3; i++) g.roundRect(-w / 2 + 10 + (i * (w - 20)) / 3, -30, (w - 20) / 3 - 6, 10, 2);
	g.fill({ color: 0xffffff, alpha: 0.18 });
}

/** The bench's control screen, its stand's foot at the origin (propspots.ts MONITOR): a steel
 * bezel in an ink outline round a face of `face`. */
function panel(g: Graphics, face: number): void {
	const { w, h, neck } = MONITOR;
	g.roundRect(-9, -3, 18, 4, 2).fill(INK);
	g.rect(-3, -neck - 1, 6, neck).fill(INK);
	g.roundRect(-w / 2, -neck - h, w, h, 4).fill(STEEL_DARK).stroke(line(4));
	g.roundRect(-w / 2 + 4, -neck - h + 4, w - 8, h - 8, 2).fill(face);
}

/** Station bodies: between ST_L (toward the wall) and ST_R (toward the user), tops at the point. */
const ST_L = -24;

const ST_R = 24;

export function furniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	const w = ST_R - ST_L;
	switch (kind) {
		case "desk":
			// The lead's bench: its top's back edge low (DESK_TOP), so the lead's face shows over it.
			bench(g, 150, STEEL_LIGHT, STEEL_DARK, DESK_TOP);
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
			// A control panel's screen: a deep green-slate face (not near-black), amber lines.
			panel(g, 0x3b5048);
			g.rect(-15, -45, 16, 3.5).rect(-15, -38, 22, 3.5).rect(-15, -31, 9, 3).fill(0xffb347);
			break;
		case "screen-off":
			panel(g, 0x8d96a3);
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
