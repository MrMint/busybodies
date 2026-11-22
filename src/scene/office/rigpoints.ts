// Where the rig's hands go for the metrics' props, converted to office px. These mirror the rig's
// fixed working points (src/scene/rig/reach.ts on the wave-2 rig branch: TRAY, BELL, BELL_BASE,
// PLANNER, in rig units, 85 to a character's height); once both branches are in, import them from
// there instead. A rig unit is `size / RIG_HEIGHT` office px for a character `size` px tall.
import type { Rect } from "./world";

export const RIG_HEIGHT = 85;

/** The lead's in-tray in its puppet space (facing right, behind the desk): the pile's middle and
 * width, the desk top it stands on, a sheet's thickness, and the buried pile's top. */
export const RIG_TRAY = { x: 21, w: 30, base: -28, sheet: 1.5, buried: -61 } as const;
/** The bell's plunger top, in the ringer's puppet space (the station point plus (2, 8)), and how far
 * below it the counter's top is. */
export const RIG_BELL = { x: (38 * RIG_HEIGHT) / 58 + 2, y: (-40 * RIG_HEIGHT) / 58 + 8, base: 13 } as const;
/** A posted sticky note's middle, from the poster's feet: up, and in front. */
export const RIG_PLANNER = { x: 58, y: -66 } as const;

const px = (units: number, size: number) => (units * size) / RIG_HEIGHT;

/** The in-tray on a desk, relative to the desk front's centre, for a lead `size` px tall standing at
 * `lead` (relative to the same centre): its left edge, width, base (the desk top) and a sheet. */
export function trayOnDesk(lead: { x: number; y: number }, size: number) {
	const w = px(RIG_TRAY.w, size);
	return { x: lead.x + px(RIG_TRAY.x, size) - w / 2, w, y: lead.y + px(RIG_TRAY.base, size), sheet: px(RIG_TRAY.sheet, size), top: lead.y + px(RIG_TRAY.buried, size) };
}

/** The bell's plunger top and the counter's top, from a ringer `size` px tall facing right at its feet. */
export function bellFrom(feet: { x: number; y: number }, size: number) {
	const plunger = { x: feet.x + px(RIG_BELL.x, size), y: feet.y + px(RIG_BELL.y, size) };
	return { plunger, top: plunger.y + px(RIG_BELL.base, size) };
}

/** Where a poster `size` px tall stands (facing right) so the note it presses on lands at `note`. */
export const posterFor = (note: { x: number; y: number }, size: number) => ({ x: Math.round(note.x - px(RIG_PLANNER.x, size)), y: Math.round(note.y - px(RIG_PLANNER.y, size)) });

/** Where on the planner a new note goes: the DONE column (the right third), low on the board, so
 * even a small poster stands on the floor below it. */
export const plannerNote = (r: Rect) => ({ x: r.x + r.w - 6 - (r.w - 12) / 6, y: r.y + r.h * 0.78 });
