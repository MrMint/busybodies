// Where the rig's hands go for the metrics' props, converted to office px. The working points are
// the rig's own (src/scene/rig/reach.ts: TRAY, BELL, BELL_BASE, PLANNER, in rig units, 85 to a
// character's height), so the furniture and the hands can't drift apart. A rig unit is
// `size / RIG_HEIGHT` office px for a character `size` px tall.
import { BELL, BELL_BASE, PLANNER, PUPPET_HEIGHT, TRAY } from "../rig/reach";
import type { Rect } from "./world";

export const RIG_HEIGHT = PUPPET_HEIGHT;

/** The lead's in-tray in its puppet space (facing right, behind the desk). */
export const RIG_TRAY = TRAY;
/** The bell's plunger top, in the ringer's puppet space, and how far below it the counter's top is. */
export const RIG_BELL = { x: BELL.x, y: BELL.y, base: BELL_BASE } as const;
/** A posted sticky note's middle, from the poster's feet: up, and in front. */
export const RIG_PLANNER = PLANNER;

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
