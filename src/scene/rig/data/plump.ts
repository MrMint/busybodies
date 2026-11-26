// Plump: how full a character's context is, worn as its body. A fresh context is the plain mochi;
// as the window fills the body swells round like a plum, while the face, arms and legs stay the
// size they were, so they look smaller and smaller on it. It is a shape, not a motion: the body
// never squashes or stretches to act (decisions.md), it is painted at a few sizes and swaps.
// Pixi-free: the director picks the level, the puppet draws it.
import type { Context } from "../../../watcher/model";
import { mix } from "../../../shared/colour";

/** How swollen a body is: 0 the plain mochi, 3 a plum. */
export type PlumpLevel = 0 | 1 | 2 | 3;

export interface Plump {
	level: PlumpLevel;
	/** Nearly out of room (past `RIPE`): the body blushes plum. */
	ripe: boolean;
}

/** The share of the window where each level starts. */
export const PLUMP_AT = [0, 0.4, 0.65, 0.85] as const;
/** Past this share the plum is ripe. */
export const RIPE = 0.95;

/** The body's painted size at each level, in rig units (the plain mochi is 100 by 70). */
export const PLUMP_SHAPE: readonly { w: number; h: number }[] = [
	{ w: 100, h: 70 },
	{ w: 122, h: 80 },
	{ w: 150, h: 94 },
	{ w: 182, h: 110 },
];

/** The atlas part for a role's body at a level: `body/lead`, `body/lead~g2`, and a ripe plum's
 * `body/lead~ripe` (the biggest size, painted plum). */
export const bodyPart = (role: string, level: PlumpLevel, ripe = false) =>
	ripe ? `body/${role}~ripe` : level === 0 ? `body/${role}` : `body/${role}~g${level}`;

/** Every body a role has painted: each size, and the ripe plum. */
export const bodyVariants = (role: string) => [
	...PLUMP_SHAPE.map((s, level) => ({ part: bodyPart(role, level as PlumpLevel), ...s, level: level as PlumpLevel, ripe: false })),
	{ part: bodyPart(role, 3, true), ...PLUMP_SHAPE[3]!, level: 3 as PlumpLevel, ripe: true },
];

/** The plum a ripe body is painted in, and how far a role's colour goes towards it. */
const PLUM = 0x9b6ad8;
export const ripeColour = (role: number) => mix(role, PLUM, 0.62);

/** How full a context is, 0 to 1; undefined without a window. */
export function share(c: Context | undefined): number | undefined {
	if (!c?.window || c.window <= 0) return undefined;
	return Math.max(0, Math.min(1, c.used / c.window));
}

/** The plump for a context; undefined (the plain mochi) without a window. */
export function plumpOf(c: Context | undefined): Plump | undefined {
	const s = share(c);
	if (s === undefined) return undefined;
	let level: PlumpLevel = 0;
	for (let i = PLUMP_AT.length - 1; i > 0; i--)
		if (s >= PLUMP_AT[i]!) {
			level = i as PlumpLevel;
			break;
		}
	return { level, ripe: s >= RIPE };
}

/**
 * Where the parts that ride the body sit at a level, as offsets from the plain mochi's anchors
 * (reach.ts ANCHORS), in rig units. The face rises a little with the dome but stays low and
 * small; the cheeks and shoulders go out to the new sides; the legs spread a touch and stay short.
 */
export function plumpOffsets(level: PlumpLevel) {
	const { w, h } = PLUMP_SHAPE[level]!;
	const dw = (w - 100) / 2;
	const dh = h - 70;
	return {
		/** The top of the dome rises by this (hats and the lead's cup ride it). */
		top: -dh,
		/** The face (eyes, brows, mouth) rises by this. */
		face: -dh * 0.3,
		cheekX: dw * 0.8,
		cheekY: -dh * 0.25,
		// Not all the way out: a plum's work arms are re-solved onto their work (reach.ts plumpArm),
		// and shoulders far out would have its short arms stretch further to get there.
		shoulderX: dw * 0.55,
		shoulderY: -dh * 0.35,
		legX: dw * 0.35,
	};
}

/** How far a walk rocks the body side to side at a level, in degrees: a plum waddles. */
export const WADDLE_DEG: readonly number[] = [0, 2.5, 5, 8];
