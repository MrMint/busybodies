// Gaze: where a character looks when the director points it at someone or something (a cue's
// `lookAt`: an actor's key, a world point, or the viewer). Pure: world pixels in, the face's slide in
// rig units out, so the conversion is unit-tested without a renderer.
//
// The face slides inside the body (vocab.ts LOOKS: about 4 units to a side, 3.5 up and down). A
// target is turned into that slide by its direction from the character's eyes, in the character's
// own facing (a target behind it is a look over the shoulder), clamped to the face's range. The
// floor is seen from above at an angle, so a teammate lower on the screen is mostly nearer, not
// below: the vertical part counts for half. Past SIDE of the side range the eyes go `side` too, so
// a look far to one side reads at office zoom.
import { LOOKS } from "./vocab";
import type { Eyes, Look } from "./vocab";

export const GAZE = {
	/** The face's range: as far as the poses' own looks go. */
	x: LOOKS.right[0],
	up: -LOOKS.up[1],
	down: LOOKS.down[1],
	/** Past this share of the side range, the eyes go `side`. */
	side: 0.7,
	/** How much a target's height on screen counts (the floor is seen at an angle). */
	depth: 0.5,
	/** A target nearer than this (px) gets a smaller look: it is right there. */
	near: 30,
	/** Where the eyes are, and where a target's face is, as a share of the height above the feet. */
	eyes: 0.62,
	/** Looking at the viewer: a little up, straight out of the screen. */
	viewer: [0, -1.6] as const,
} as const;

/** What a cue asks a character to look at: another actor (by key), a point on the floor plan (world
 * pixels, e.g. the YOU door), or the viewer, out of the screen. */
export type LookAt = string | { x: number; y: number } | { viewer: true };

/** A look in rig units, and whether the eyes go `side` for it. */
export interface Aim {
	x: number;
	y: number;
	side: boolean;
}

/** Frames whose eyes are on the work (the bench out front, the keyboard): they win over a gaze. */
export const WORK_LOOKS: ReadonlySet<Look> = new Set<Look>(["downR", "down"]);

/** Eyes a gaze may turn into `side`: open ones. Shut, happy, starry or teary eyes keep what they are. */
export const SIDE_EYES: ReadonlySet<Eyes> = new Set<Eyes>(["rest", "wide", "shine", "squint", "half", "side"]);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The look towards `to` for a character whose eyes are at `from`, facing `facing` (1 right, -1
 * left). Both in world pixels.
 */
export function aimAt(from: { x: number; y: number }, facing: 1 | -1, to: { x: number; y: number }): Aim {
	const dx = (to.x - from.x) * facing;
	const dy = (to.y - from.y) * GAZE.depth;
	const d = Math.hypot(dx, dy);
	if (d < 1) return { x: 0, y: 0, side: false };
	const k = Math.min(1, d / GAZE.near);
	const x = clamp((dx / d) * GAZE.x * k, -GAZE.x, GAZE.x);
	const uy = dy / d;
	const y = clamp(uy * (uy < 0 ? GAZE.up : GAZE.down) * k, -GAZE.up, GAZE.down);
	const r = (n: number) => Math.round(n * 100) / 100;
	return { x: r(x), y: r(y), side: Math.abs(x) > GAZE.side * GAZE.x };
}

/** The look at the viewer: out of the screen, a little up. */
export const AT_VIEWER: Aim = { x: GAZE.viewer[0], y: GAZE.viewer[1], side: false };

/** Where someone `size` px tall standing at `feet` has its eyes (and its face, to be looked at). */
export const eyesOf = (feet: { x: number; y: number }, size: number) => ({ x: feet.x, y: feet.y - size * GAZE.eyes });

export const isViewer = (l: LookAt | undefined): l is { viewer: true } => typeof l === "object" && l !== null && "viewer" in l;
