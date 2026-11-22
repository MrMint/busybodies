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
