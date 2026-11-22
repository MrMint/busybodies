// The office's cut-paper look, drawn procedurally: flat pastel shapes with thick ink outlines and
// a soft offset shadow, after design/boards/FloorBusy. Every function draws in world pixels into a
// Graphics or Container; nothing here is per-frame. Furniture is drawn around its base point
// (0, 0): the bottom centre, where it meets the floor.
import { BitmapFont, BitmapText, Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import type { PropFurniture } from "./props";
import type { Rect, WallItem } from "./world";

export const INK = 0x1b2140;
export const SHADOW = { color: INK, alpha: 0.14 };
export const SUN = 0xffe500;
export const RED = 0xff6b6b;
export const GREEN = 0x2fcf83;
export const LAWN = 0xbfe8c6;
export const SLAB = 0x46536f;
export const HALL_FLOOR = 0xf3efe2;
export const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif';

/** Wall and floor colours. Projects take them in the order their rooms were built. */
export const ROOM_COLOURS: [number, number][] = [
	[0xffe9cf, 0xffc47f], // orange
	[0xdeecff, 0xa6d0ff], // blue
	[0xdff7ec, 0xa5e6c9], // green
	[0xffe6f0, 0xffbdd6], // pink
	[0xeee7ff, 0xd2c0ff], // lilac
	[0xfff6c9, 0xffe08a], // yellow
	[0xe3f7ff, 0x9fdcf5], // cyan
];
export const COMMON_COLOURS = {
	meeting: [0xf1f3fa, 0xcfd6ea],
	lobby: [0xf6f1e4, 0xe8dfc8],
	yours: [0xfff1e0, 0xe9d6c0],
	kitchen: [0xf6f1e4, 0xffffff],
	vacant: [0xeef0f4, 0xd9dde6],
} as const;

const line = (width: number) => ({ width, color: INK, join: "round" as const, cap: "round" as const });

export function text(value: string, size: number, opts: TextStyleOptions = {}): Text {
	return new Text({
		text: value,
		style: { fill: INK, fontSize: size, fontWeight: "700", fontFamily: FONT, lineHeight: size * 1.18, ...opts },
	});
}

/**
 * Labels that sit over the live scene (room tabs, desk cards, bubbles) are bitmap text: they all
 * draw from one shared glyph atlas, so they batch with the furniture instead of each bringing its
 * own texture, and changing one redraws no canvas. Glyphs are drawn large (64 px at 2x), so they
 * stay sharp at the desk stop. Text baked into a cached room uses plain Text.
 */
const LABEL_FONTS = { "800": "bb-label-800", "600": "bb-label-600" } as const;
const installed = new Set<string>();

export function label(value: string, size: number, weight: keyof typeof LABEL_FONTS = "800", fill = INK): BitmapText {
	const name = LABEL_FONTS[weight];
	if (!installed.has(name)) {
		BitmapFont.install({
			name,
			style: { fontFamily: FONT, fontSize: 64, fontWeight: weight, fill: 0xffffff },
			chars: [[" ", "~"], "·…‹›×"],
			resolution: 2,
			padding: 8,
		});
		installed.add(name);
	}
	return new BitmapText({ text: value, style: { fontFamily: name, fontSize: size, fill } });
}

// --- Rooms ------------------------------------------------------------------------------------

/** A room's shell: back wall, floor, side walls and frame. */
export function roomShell(g: Graphics, r: Rect, floorY: number, wall: number, floor: number, checker = false): void {
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

export function hallway(g: Graphics, r: Rect): void {
	g.rect(r.x, r.y, r.w, r.h).fill(HALL_FLOOR);
	for (let x = r.x + 118; x < r.x + r.w; x += 122) g.rect(x, r.y, 4, r.h);
	g.fill({ color: INK, alpha: 0.1 });
	g.moveTo(r.x, r.y + 2.5).lineTo(r.x + r.w, r.y + 2.5).moveTo(r.x, r.y + r.h - 2.5).lineTo(r.x + r.w, r.y + r.h - 2.5).stroke(line(5));
}

// --- Wall items -------------------------------------------------------------------------------

export function windowPane(g: Graphics, { x, y, w, h }: Rect, seed: number): void {
	g.roundRect(x, y, w, h, 10).fill(0xbfe6ff);
	const cx = x + w * (0.12 + (seed % 5) * 0.05);
	const cy = y + h * 0.3;
	g.roundRect(cx, cy, 34, 16, 8).roundRect(cx + 20, cy + 9, 30, 12, 6).fill(0xffffff);
	g.rect(x + w / 2 - 2.5, y, 5, h).fill(INK);
	g.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, 9).stroke(line(5));
}

export function door(g: Graphics, { x, y, w, h }: Rect): void {
	const r = w / 2;
	g.moveTo(x, y + h).lineTo(x, y + r).arc(x + r, y + r, r, Math.PI, 0).lineTo(x + w, y + h).closePath().fill(SLAB).stroke(line(5));
	g.circle(x + w - 12, y + h * 0.52, 4.5).fill(SUN);
}

export interface SignText {
	title: string;
	body?: string;
}

const SIGN_COLOURS: Record<string, number> = { sign: SUN, whiteboard: 0xffffff, frame: 0xffffff };

/** A sign, whiteboard or frame with its text, as a container to bake into the room. */
export function signboard(kind: WallItem["kind"], r: Rect, content: SignText | undefined, seed: number): Container {
	const c = new Container();
	const g = new Graphics();
	c.addChild(g);
	const tilt = kind === "sign" ? ((seed % 5) - 2) * 0.012 : 0;
	c.position.set(r.x + r.w / 2, r.y + r.h / 2);
	c.rotation = tilt;
	const x = -r.w / 2;
	const y = -r.h / 2;
	const fill = kind === "sign" && seed % 3 === 1 ? 0xffd0e4 : SIGN_COLOURS[kind] ?? 0xffffff;
	if (kind === "sign") g.rect(x + 4, y + 5, r.w, r.h).fill(SHADOW);
	g.roundRect(x, y, r.w, r.h, kind === "sign" ? 4 : 8).fill(fill).stroke(line(kind === "sign" ? 3 : 5));
	if (kind === "frame") g.roundRect(x + 8, y + 8, r.w - 16, r.h - 16, 4).stroke({ width: 2, color: INK, alpha: 0.4 });
	const pad = kind === "sign" ? 8 : 12;
	if (content) {
		// Shrink the text until it fits the board.
		const big = kind === "whiteboard" ? 16 : 13;
		for (let size = big; ; size -= 1) {
			const t = text(content.title, size, { fontWeight: "800", wordWrap: true, wordWrapWidth: r.w - pad * 2 });
			t.position.set(x + pad, y + pad - 3);
			const b = content.body ? text(content.body, size * 0.8, { fontWeight: "600", wordWrap: true, wordWrapWidth: r.w - pad * 2 }) : undefined;
			b?.position.set(x + pad, t.y + t.height);
			const height = t.height + (b?.height ?? 0);
			if (height <= r.h - pad * 1.5 || size <= 8) {
				c.addChild(t);
				if (b) c.addChild(b);
				break;
			}
			t.destroy();
			b?.destroy();
		}
	} else {
		// No text yet: a few scribbled lines, so an empty slot still reads as a board or a note.
		const colours = kind === "whiteboard" ? [GREEN, RED, 0xc5cbe0] : [INK, INK];
		colours.forEach((col, i) => {
			const lw = (r.w - pad * 2) * (0.9 - ((seed + i) % 3) * 0.15);
			g.roundRect(x + pad, y + pad + 4 + i * 14, lw, 6, 3).fill({ color: col, alpha: kind === "whiteboard" ? 1 : 0.25 });
		});
	}
	return c;
}

// --- Furniture --------------------------------------------------------------------------------

export type FurnitureKind =
	| "desk"
	| "chair"
	| "plant"
	| "counter"
	| "cooler"
	| "fridge"
	| "sofa"
	| "table"
	| "cabinet"
	| "pod"
	| "lamp"
	| "screen-lit"
	| "screen-off"
	| "files"
	| "catalogue"
	| "copier"
	| "stamps"
	| PropFurniture;

/** A desk: the top surface behind, the front panel below. 150 wide, its front 44 tall. */
function desk(g: Graphics, front: number, top: number, w = 150): void {
	g.rect(-w / 2 + 5, -44 + 6, w, 44).fill(SHADOW);
	g.roundRect(-w / 2 - 12, -70, w + 24, 32, 8).fill(top).stroke(line(4));
	g.roundRect(-w / 2, -44, w, 44, 5).fill(front).stroke(line(4));
}

export function drawFurniture(kind: FurnitureKind): Graphics {
	const g = new Graphics();
	switch (kind) {
		case "desk":
			desk(g, 0xe9bd80, 0xf7dcb0);
			break;
		case "table":
			desk(g, 0xffffff, 0xf1f3fa, 180);
			g.roundRect(-60, -82, 22, 14, 3).fill(0xffffff).stroke(line(3)); // a sheet that says no
			g.rect(40, -86, 15, 15).fill(0xffffff).stroke(line(3)); // a cup
			break;
		case "counter":
			desk(g, 0xffffff, 0xf1f3fa, 130);
			// The coffee machine: a dark box with two lights and a cup.
			g.roundRect(-58, -126, 44, 52, 8).fill(INK);
			g.circle(-45, -114, 4).fill(RED).circle(-31, -114, 4).fill(GREEN);
			g.roundRect(-47, -96, 22, 18, 4).fill(0x8a5a3c).stroke({ width: 3, color: 0xffffff });
			g.rect(6, -88, 15, 15).fill(0xffffff).stroke(line(3)).rect(28, -88, 15, 15).fill(0xffffff).stroke(line(3));
			break;
		case "chair":
			g.roundRect(-25, -62, 50, 62, 14).fill(0x5a6596).stroke(line(4));
			break;
		case "plant":
			g.ellipse(-12, -50, 13, 24).fill(GREEN).stroke(line(4));
			g.ellipse(12, -56, 13, 28).fill(GREEN).stroke(line(4));
			g.moveTo(-17, -30).lineTo(17, -30).lineTo(14, 0).lineTo(-14, 0).closePath().fill(0xe07a4f).stroke(line(4));
			break;
		case "lamp":
			g.rect(-2.5, -96, 5, 96).fill(INK);
			g.roundRect(-14, -4, 28, 6, 3).fill(INK);
			g.circle(0, -104, 16).fill(GREEN).stroke(line(4));
			break;
		case "cooler":
			g.roundRect(-21, -66, 42, 66, 6).fill(0xffffff).stroke(line(4));
			g.circle(-4, -52, 4).fill(RED);
			g.roundRect(-17, -108, 34, 44, 12).fill(0x9be3ff).stroke(line(4));
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
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 7).fill(INK).stroke(line(4));
			g.rect(-24, -36, 22, 4).rect(-24, -27, 22, 4).rect(-12, -18, 12, 3).fill(0x5dffa0);
			break;
		case "screen-off":
			g.rect(-6, -2, 12, 12).fill(INK);
			g.roundRect(-31, -44, 62, 44, 7).fill(0xaab2cc).stroke(line(4));
			break;
		default:
			station(g, kind);
	}
	return g;
}

// Stations: shared equipment along a project room's left wall (world.ts STRIP). The office draws
// only each station's body, around its base, with its user standing to the right facing it; the rig
// draws the moving parts (the top drawer, the card tray, the copier's lid, button, light, jam door
// and out-tray, the ink pad and forms) at the working point, (+20, -40) from the base, in every frame.
// So each body's top surface is at that height, starting a few px past the point on the user's side
// and running back toward the wall, and nothing is drawn there that the rig draws.
const WOOD = 0xd9a066;
const WOOD_TOP = 0xf0c48a;
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
	}
}

/** A pill label: white, rounded ends, ink border. */
export function pill(value: string, size: number, fill = 0xffffff): Container {
	const c = new Container();
	const t = label(value, size, "800");
	const g = new Graphics()
		.roundRect(0, 0, t.width + size * 1.4, t.height + size * 0.45, (t.height + size * 0.45) / 2)
		.fill(fill)
		.stroke(line(3));
	t.position.set(size * 0.7, size * 0.2);
	c.addChild(g, t);
	return c;
}

/** The dark name tab on a room's corner. */
export function nameTab(value: string): Container {
	const c = new Container();
	const t = label(value, 30, "800", 0xffffff);
	const g = new Graphics().roundRect(0, 0, t.width + 28, t.height + 14, 12).fill(INK);
	t.position.set(14, 6);
	c.addChild(g, t);
	c.rotation = -0.035;
	return c;
}
