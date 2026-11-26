// Where the things on and by a desk go, around the desk front's centre (props.ts and the themes
// draw them; office.ts places the screen). Pixi-free, so unit tests and the director can read the
// positions without a renderer.
//
// The lead's face is a keep-out zone (world.ts `faceZone`, the lead at SEAT): the crew build takes
// the desk's left end, the screen its right end, and everything else on the desk top sits low
// enough, or far enough along, to leave the face clear. `deskParts` lists each one's rectangle, so a
// test can hold that.
import { BUILD, DESK_TOP, type Rect } from "./world";

/** The screen: its stand's foot at (x, y) on the desk top, a neck, then the screen itself, w by h,
 * at the desk's right end, its left edge clear of the lead's cheek. */
export const MONITOR = { x: 60, y: -46, w: 46, h: 34, neck: 18 } as const;

/** Where the desk props sit, from the desk front's centre. */
export const PROPS = {
	/** The in-tray: at the front of the desk top, under the screen and right of the lead's face; a
	 * full pile (16 sheets) just reaches the screen's foot. While the lead plays `buried` the rig
	 * draws its own, in front of the lead. `x` is its left edge, `y` its base. */
	tray: { x: 38, w: 25.4, y: -50, sheet: 1.27 },
	/** Mugs: in front of the lead, a full stack's top just under its face, the stack's foot just
	 * above the name card. */
	mugs: { x: -20, y: -50, w: 7, h: 6 },
	/** The test lamp: at the right end, in front of the screen's corner. */
	lamp: { x: 84, y: -66 },
	drawers: { x: 88, w: 20, h: 11 },
	skip: { x: 85, y: 16, w: 28, h: 12 },
	/** A milestone treat (director/treats.ts): between the mugs and the in-tray, its base on the
	 * desk top's front edge; `x` its middle. At most `w` wide and `h` tall, candle and flame
	 * included, so it stays under the lead's face as the mugs do. */
	treat: { x: 18, y: -50, w: 24, h: 18 },
} as const;

/** A long-idle desk's cobweb (director/cobwebs.ts): the corner it is strung in, how far its spokes
 * reach, and which way they fan (radians, y down, from `from` through a quarter turn). The screen's
 * top corners are inside its ink outline; the desk front's corner is its top left, under the desk
 * top's lip. */
export const COBWEB_CORNERS = {
	screenL: { x: MONITOR.x - MONITOR.w / 2 + 2, y: MONITOR.y - MONITOR.neck - MONITOR.h + 2, r: 15, from: 0 },
	screenR: { x: MONITOR.x + MONITOR.w / 2 - 2, y: MONITOR.y - MONITOR.neck - MONITOR.h + 2, r: 15, from: Math.PI / 2 },
	desk: { x: -73, y: -42, r: 14, from: 0 },
} as const;

/**
 * The office kitchen's back wall (themes/office/scene.ts, office/ambient.ts): the mug wall, from the room's
 * top-left corner (its banner's top to its shelf's underside), and the coffee machine and its steam,
 * from the counter's fixture point. The mug wall hangs under the ceiling panel (its glow ends
 * `ceiling` px down), between the fridge and the sign, above the machine; the steam rises off the
 * cup in the machine's hatch, in front of it, and thins out before the mugs. Tests hold them clear.
 */
export const KITCHEN_WALL = {
	ceiling: 14,
	mugWall: { x: 114, y: 15, w: 78, h: 24.5 },
	/** The machine on the counter: its sides and top. */
	machine: { x0: -58, x1: -14, top: -126 },
	/** The steam: from the cup (x, y up from the counter's point), and how far it rises. */
	steam: { dx: 36, dy: 98, rise: 22 },
	/** A wisp's half-height at the top of its rise, and its alpha past `fadeFrom` of the rise. */
	wisp: { r: 5.5 * 1.4, fadeFrom: 0.85 },
} as const;

/** The office's fluorescent ceiling panels along a room's back wall (themes/office/scene.ts draws them; one
 * in each room flickers now and then, office/ambient.ts): about one per 190 px, evenly spaced, each
 * a tube 66 px long, `y` px below the wall's top. */
export function ceilingPanels(r: { x: number; y: number; w: number }): { cx: number; y: number }[] {
	const n = Math.max(1, Math.round(r.w / 190));
	const step = r.w / n;
	return Array.from({ length: n }, (_, i) => ({ cx: r.x + step * (i + 0.5), y: r.y + 5 }));
}

/** The most drawers a desk's cabinet shows (director/metrics.ts). */
const MAX_DRAWERS = 6;

/** Everything drawn at a desk in front of its lead, as rectangles from the desk front's centre (a
 * little generous, for strokes): the desk top, the screen, the crew build at any height, the in-tray
 * at its fullest, the mugs, the lamp, the drawers and skip, the cubicle wall, the name card. */
export function deskParts(): Record<string, Rect> {
	const m = MONITOR;
	const t = PROPS.tray;
	const u = PROPS.mugs;
	const buildW = BUILD.wide * BUILD.brickW + 3;
	return {
		top: { x: -89, y: DESK_TOP - 2, w: 178, h: -38 - DESK_TOP + 2 },
		front: { x: -77, y: -46, w: 154, h: 48 },
		screen: { x: m.x - m.w / 2 - 2, y: m.y - m.neck - m.h - 2, w: m.w + 4, h: m.neck + m.h + 6 },
		// However tall it grows, the flag on top included: its columns, from the desk up.
		build: { x: BUILD.left - 1, y: -100_000, w: buildW + 2, h: 100_000 + BUILD.floor + 1 },
		// The full pile, leaning, or the factory's hopper heaped over its rim; and what slid off.
		tray: { x: t.x - 4, y: t.y - 4 - 16 * t.sheet * 1.6, w: t.w + 8 + 6, h: 4 + 16 * t.sheet * 1.6 + 2 },
		spill: { x: t.x + t.w - 10, y: t.y - 9, w: 24, h: 10 },
		mugs: { x: u.x - 1, y: u.y - 3 * u.h - 1, w: 3 * (u.w + 1) + 2, h: 3 * u.h + 2 },
		lamp: { x: PROPS.lamp.x - 11, y: PROPS.lamp.y - 17, w: 22, h: 31 },
		drawers: { x: PROPS.drawers.x - 5, y: -(MAX_DRAWERS * PROPS.drawers.h + 4) - 4, w: PROPS.drawers.w + 9, h: MAX_DRAWERS * PROPS.drawers.h + 8 },
		cubicle: { x: 88, y: -121, w: 20, h: 86 },
		// The name card, at its widest and tallest (office.ts).
		card: { x: -CARD.maxW / 2, y: CARD.top, w: CARD.maxW, h: CARD.foot - CARD.top },
		skip: { x: PROPS.skip.x - 1, y: PROPS.skip.y - PROPS.skip.h - 4, w: PROPS.skip.w + 2, h: PROPS.skip.h + 5 },
		treat: { x: PROPS.treat.x - PROPS.treat.w / 2 - 1, y: PROPS.treat.y - PROPS.treat.h, w: PROPS.treat.w + 2, h: PROPS.treat.h + 1 },
		...Object.fromEntries(
			Object.entries(COBWEB_CORNERS).map(([k, c]) => {
				const xs = [c.x, c.x + Math.cos(c.from) * c.r, c.x + Math.cos(c.from + Math.PI / 2) * c.r];
				const ys = [c.y, c.y + Math.sin(c.from) * c.r, c.y + Math.sin(c.from + Math.PI / 2) * c.r];
				const x = Math.min(...xs) - 1;
				const y = Math.min(...ys) - 1;
				return [`cobweb:${k}`, { x, y, w: Math.max(...xs) + 1 - x, h: Math.max(...ys) + 6 - y }];
			}),
		),
	};
}

/** The name card on the desk front: its top with the model's word (three lines, 45 tall) and
 * without (two, 34 tall), so its foot is 5 or 6 up from the desk front's; and its widest. A
 * full-size crew member in the aisle's first row (world.ts AISLE.front) has its head below it. */
export const CARD = { top: -50, topShort: -40, foot: -5, maxW: 142 } as const;
