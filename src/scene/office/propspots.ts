// Where the metrics' desk props go, around the desk front's centre (props.ts draws them). Pixi-free,
// so unit tests and the director can read the positions without a renderer.
import { trayOnDesk } from "./rigpoints";

/** Where the desk props sit, from the desk front's centre. */
export const PROPS = {
	/** The in-tray: at the rig's TRAY point for the lead behind the desk (layout.ts puts the lead at
	 * (-26, -42) from the desk front's centre; leads are 72 px), so the rig's pile in `buried` lands
	 * exactly where the office's was. */
	tray: trayOnDesk({ x: -26, y: -42 }, 72),
	/** Between the crew build and the in-tray. */
	mugs: { x: -46, y: -44, w: 7, h: 6 },
	lamp: { x: 80, y: -66 },
	drawers: { x: 88, w: 20, h: 11 },
	skip: { x: 85, y: 16, w: 28, h: 12 },
} as const;

/**
 * The office kitchen's back wall (theme/office.ts, office/ambient.ts): the mug wall, from the room's
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

/** The office's fluorescent ceiling panels along a room's back wall (theme/office.ts draws them; one
 * in each room flickers now and then, office/ambient.ts): about one per 190 px, evenly spaced, each
 * a tube 66 px long, `y` px below the wall's top. */
export function ceilingPanels(r: { x: number; y: number; w: number }): { cx: number; y: number }[] {
	const n = Math.max(1, Math.round(r.w / 190));
	const step = r.w / n;
	return Array.from({ length: n }, (_, i) => ({ cx: r.x + step * (i + 0.5), y: r.y + 5 }));
}
