// The part vocabulary: every value a frame may name, and what each one means as numbers the rig
// springs towards. Pixi-free, so tests and the text dump read it without a renderer.
//
// Units: the mochi is drawn in "rig units". Its body is 100 wide and 70 tall, and the origin is the
// ground between its feet (y grows downward, as on screen). Angles are degrees, clockwise positive,
// the same convention as the CSS boards these values were ported from (`design/boards/bb.css`). An
// arm at 0° hangs straight down; the left arm (screen left) at 90° points out to the left.

/** Eyes. Each names one eye texture; both eyes use it (the right one mirrored where it matters). */
export const EYES = ["rest", "wide", "shine", "tear", "squint", "happy", "half", "star", "side", "closed", "dead"] as const;
export type Eyes = (typeof EYES)[number];

export const MOUTHS = ["rest", "flat", "small", "pout", "grin", "open", "wobble", "shout", "smirk", "drool", "yawn", "blep", "frown"] as const;
export type Mouth = (typeof MOUTHS)[number];

/** Where the face looks: the whole face slides a little inside the body. */
export const LOOKS = { center: [0, 0], left: [-5.5, 0], right: [5.5, 0], up: [0, -4.5], down: [0, 5], upR: [4.5, -4] } as const;
export type Look = keyof typeof LOOKS;

/** Brows spring: [yL, rotL, yR, rotR, alpha]. Rotation is about each brow's centre. */
export const BROWS = {
	none: [0, 0, 0, 0, 0],
	up: [-4, -6, -4, 6, 1],
	one: [0, 4, -5, 14, 1],
	worry: [-1.5, -20, -1.5, 20, 1],
	angry: [2, 22, 2, -22, 1],
	flat: [2, 0, 2, 0, 1],
} as const satisfies Record<string, readonly [number, number, number, number, number]>;
export type Brows = keyof typeof BROWS;

/** Cheeks: [scale, tint]. */
export const CHEEKS = { rest: [1, 0xff9eb1], blush: [1.4, 0xff6f8e], pale: [1, 0xb9c8ff] } as const;
export type Cheeks = keyof typeof CHEEKS;

/** An arm: [shoulder, elbow, hand] in degrees. Left arm values; the right arm mirrors them. */
export const ARMS = {
	rest: [22, 8, 0],
	carry: [-15, -75, 0],
	cheer: [150, -25, 0],
	chin: [-15, -100, 0],
	cross: [-32, -52, 0],
	cross2: [-26, -66, 0],
	face: [-20, -150, 0],
	five: [150, -10, 0],
	ham1: [150, 40, 0],
	ham2: [62, -20, -75],
	head: [160, 60, 0],
	hip: [55, -125, 0],
	hi: [176, 0, 0],
	hold: [10, -60, 0],
	low: [30, 10, 0],
	out: [85, 0, 0],
	palm: [-120, 0, 0],
	phone: [-5, -75, 0],
	point: [100, 0, 0],
	raise: [70, 80, 0],
	shrug: [60, 60, 0],
	sip: [-30, -135, 0],
	throw2: [70, 0, 0],
	type1: [-10, -60, 0],
	type2: [-5, -85, 0],
	type3: [-20, -100, 0],
	up: [165, 0, 0],
	wave1: [140, 45, 0],
	wave2: [140, -35, 0],
	down: [8, 4, 0],
} as const satisfies Record<string, readonly [number, number, number]>;
export type Arm = keyof typeof ARMS;

/** Feet: [left leg rotation, left lift, right leg rotation, right lift]. */
export const FEET = {
	rest: [0, 0, 0, 0],
	tapR: [0, 0, -18, -4.5],
	kick: [0, 0, -72, -3],
	runL: [28, -10, -10, 0],
	runR: [10, 0, -28, -10],
	wide: [14, 0, -14, 0],
	up: [-84, -19, -92, -24],
	swingL: [22, 0, 10, 0],
	swingR: [-10, 0, -22, 0],
	tip: [0, -3.4, 0, -3.4],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type Feet = keyof typeof FEET;

/** Body: [x, y, rotation, scaleX, scaleY, hop]. `hop` lifts the legs with the body. Scaling and
 * rotation are about the middle of the body's base, so a squash spreads it on the floor. */
export const BODIES = {
	rest: [0, 0, 0, 1, 1, 0],
	hop: [0, -15, 0, 0.9, 1.13, -14],
	stretch: [0, -2, 0, 0.9, 1.13, 0],
	low: [0, 7, 0, 1.15, 0.83, 0],
	squash: [0, 3, 0, 1.18, 0.8, 0],
	puff: [0, 0, 0, 1.2, 1.13, 0],
	nap: [0, 12, 15, 1.07, 0.9, 0],
	slump: [0, 13, 9, 1.06, 0.9, 0],
	tilt: [0, 0, -7, 1, 1, 0],
	fwd: [0, 5, 11, 1, 1, 0],
	back: [0, 3, -20, 1, 1, 0],
	leanR: [3, 0, 9, 1, 1, 0],
	leanL: [-3, 0, -9, 1, 1, 0],
	shakeL: [-6, 0, -5, 1, 1, 0],
	shakeR: [6, 0, 5, 1, 1, 0],
} as const satisfies Record<string, readonly [number, number, number, number, number, number]>;
export type Body = keyof typeof BODIES;

/** Things held in a hand. They stay upright whatever the arm does. */
export const HELD = ["sign", "ok", "trophy", "mag", "clip", "pom", "mug", "hammer", "map", "torch", "brush", "plane", "phone", "paper"] as const;
export type Held = (typeof HELD)[number];

/** Things in front of the body: a parcel held in both hands, a sign held overhead, a desk. */
export const FRONTS = ["box", "pls", "desk"] as const;
export type Front = (typeof FRONTS)[number];

/** Things behind the body. */
export const BACKS = ["chair"] as const;
export type Back = (typeof BACKS)[number];

/** Worn over the face, on top of the costume's own. */
export const WEARS = ["binoc"] as const;
export type Wear = (typeof WEARS)[number];

/** Effects around the character. Numbered variants are the steps of a little loop (z1, z2, z3). */
export const FX = [
	"sweat1", "sweat2",
	"conf1", "conf2", "conf3",
	"pop", "spark", "dust", "idea",
	"z1", "z2", "z3",
	"think1", "think2", "think3",
	"clock1", "clock2", "clock3", "clock4",
	"steam1", "steam2",
	"papers1", "papers2",
	"cobweb",
] as const;
export type Fx = (typeof FX)[number];

/** Where the second character of a two-hander stands: [x offset, alpha, scale]. */
export const SPOTS = { here: [0, 1, 1], off: [0, 0, 0.3], s1: [0, 1, 1], s2: [60, 1, 1], s3: [120, 1, 1] } as const;
export type Spot = keyof typeof SPOTS;

/** Twelve named faces, from the Cast board's face strip. Frames name parts directly; these are the
 * reference set the sheet and the theme are checked against. */
export const FACES = {
	sparkle: { eyes: "rest", mouth: "rest", brows: "none" },
	wide: { eyes: "wide", mouth: "open", brows: "up" },
	shine: { eyes: "shine", mouth: "grin", brows: "up" },
	teary: { eyes: "tear", mouth: "wobble", brows: "worry" },
	squint: { eyes: "squint", mouth: "flat", brows: "angry" },
	happy: { eyes: "happy", mouth: "grin", brows: "none" },
	halfLid: { eyes: "half", mouth: "pout", brows: "flat" },
	stars: { eyes: "star", mouth: "grin", brows: "up" },
	sideEye: { eyes: "side", mouth: "smirk", brows: "one" },
	asleep: { eyes: "closed", mouth: "drool", brows: "none" },
	crashed: { eyes: "dead", mouth: "wobble", brows: "none" },
	yawn: { eyes: "closed", mouth: "yawn", brows: "none" },
} as const satisfies Record<string, { eyes: Eyes; mouth: Mouth; brows: Brows }>;
export type FaceName = keyof typeof FACES;
