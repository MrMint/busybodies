// Where the rig's hands go: the body's attachment points, the work out front, the station's working
// point, and the arm's kinematics (forward, to check a pose, and inverse, to solve one). Pixi-free,
// so the unit tests check that every tool hand lands on what it works on.
import { STATION_REACH } from "../director/stations";
import { ARMS, BODIES, type Arm, type Body } from "./vocab";

/** A standing mochi is about this tall in rig units, ground to the top of the body. */
export const PUPPET_HEIGHT = 85;

/** Where the face and limbs attach, in torso space (origin: the middle of the body's base). */
export const ANCHORS = {
	eyeX: 16,
	eyeY: -40,
	browY: -51,
	mouthY: -27,
	cheekX: 31,
	cheekY: -31,
	shoulderX: 46,
	shoulderY: -28,
	upper: 15,
	fore: 14,
	legX: 16,
	/** Legs hang from here (puppet space) to the ground; the torso stands on them at `base`. */
	legY: -18,
	base: -15,
	bodyTop: -70,
	frontY: -16,
} as const;

/** Where the work stands, in puppet space (ground at y = 0, the body centred on x = 0), out front on
 * the side the character faces. vocab.ts ARMS solves the tool hand onto these points, so moving one
 * means re-solving its arms. */
export const WORK = {
	/** The sawhorse bench: its plank's ends and top. */
	benchL: 60,
	benchR: 104,
	benchTop: -24,
	/** The nail, and the top of its head at each stroke: standing up, half in, flush. */
	nailX: 80,
	nailTop: [-37, -32, -27],
	/** The machine's nut. */
	nut: { x: 82, y: -38 },
	/** A brick set down on the build, where the palm let go of it. */
	brick: { x: 60, y: -54 },
	brickW: 24,
	brickH: 16,
} as const;

/** The crew member's height in office px that STATION_REACH was measured for. */
export const STATION_CREW_PX = 58;

/**
 * A station's working point in puppet space: STATION_REACH (office px, from the feet) scaled into
 * rig units. Every station pose reaches here, and the props the rig draws on the station (the open
 * drawer, the card tray, the copier's lid and panel, the forms, the notepad, the outbox, the
 * shredder's pile) are laid out around it (theme.ts). It sits about level with the eyes: the office
 * furniture is tall for a mochi, so a crew member reaches up to it.
 */
export const STATION = {
	x: (STATION_REACH.x * PUPPET_HEIGHT) / STATION_CREW_PX,
	y: (STATION_REACH.y * PUPPET_HEIGHT) / STATION_CREW_PX,
} as const;

/** Points on each station, relative to STATION (rig units, +x away from the character, +y down).
 * theme.ts draws the station props here and the station arms below are solved onto them. */
export const AT = {
	/** Filing cabinet: the top drawer's bar handle (its near end is the working point), and the
	 * handle once the drawer is pulled out toward the viewer; the folder tabs inside. */
	drawerHandle: { x: 0, y: 0 },
	drawerOut: { x: 1, y: 4 },
	drawerTabs: { x: 9, y: -9 },
	drawerTabs2: { x: 13, y: -9 },
	/** Card catalogue: the card tops in the open tray, walked along by the fingertips. */
	cards: [{ x: 3, y: -8 }, { x: 8, y: -8 }, { x: 13, y: -8 }],
	/** Copier: the lid's front edge, the lid lifted part way (hinged 30 behind the edge), the glass,
	 * the start button, the jam door's latch and the jammed sheet inside it. */
	lid: { x: 0, y: 0 },
	lidHalf: { x: 3, y: -13 },
	glass: { x: 12, y: -3 },
	button: { x: 5, y: 8 },
	door: { x: 2, y: 15 },
	jam: { x: 8, y: 17 },
	/** Where the tugged sheet's end is when the hand has pulled it out of the door. */
	jamOut: { x: -3, y: 18 },
	/** Stamp desk: the ink pad (near) and the top form (far); the form's near edge, for sliding it. */
	ink: { x: 0, y: 0 },
	form: { x: 11, y: 0 },
	formEdge: { x: 4, y: -2 },
	/** Phone table: the notepad, jotted on from left to right. */
	note: [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 10, y: 0 }],
	/** Outbox: the tray's rim. */
	tray: { x: 4, y: 0 },
	/** Shredder: the slot (the working point) and the pile waiting beside it. */
	slot: { x: 0, y: 0 },
	pile: { x: 14, y: -3 },
} as const;

/** Points on a held prop, from the hand's centre, drawn upright (theme.ts): its business end. */
export const GRIP = {
	/** The hand itself (a palm on a handle or a lid). */
	palm: { x: 0, y: 0 },
	/** A fingertip: the hand's edge, toward the work. */
	finger: { x: 5, y: 2 },
	/** The stamp's rubber face. */
	stamp: { x: 0, y: 8.5 },
	/** The pencil's point. */
	pencil: { x: 4, y: 8 },
	/** A sheet pinched by its top edge: its bottom edge, at full length. */
	sheet: { x: 0, y: 14 },
	/** An envelope or a sheet held up by its bottom edge. */
	under: { x: 0, y: 1 },
} as const;

const RAD = Math.PI / 180;
const rot = (x: number, y: number, deg: number) => {
	const c = Math.cos(deg * RAD);
	const s = Math.sin(deg * RAD);
	return { x: x * c - y * s, y: x * s + y * c };
};

/** The shoulder's place in puppet space for a body pose (`side` 1 is the right arm). */
export function shoulderAt(body: Body, side: 1 | -1 = 1) {
	const [bx, by, br, sx, sy] = BODIES[body];
	const p = rot(side * ANCHORS.shoulderX * sx, ANCHORS.shoulderY * sy, br);
	return { x: bx + p.x, y: by + ANCHORS.base + p.y };
}

/**
 * Where a hand (or a point on what it holds) is in puppet space, for an arm and a body pose: the
 * puppet's own transform chain (puppet.ts), without the springs. `side` 1 is the right arm, whose
 * channels mirror the ARMS numbers.
 */
export function handAt(arm: Arm | readonly [number, number, number], body: Body = "rest", side: 1 | -1 = 1, grip: { x: number; y: number } = GRIP.palm) {
	const [s, e, h] = typeof arm === "string" ? ARMS[arm] : arm;
	const [bx, by, br, sx, sy] = BODIES[body];
	// Channel values: the right arm turns the other way.
	const r1 = -side * s;
	const r2 = -side * e;
	const hand = -side * h;
	const elbow = rot(0, ANCHORS.upper, r1);
	const fore = rot(0, ANCHORS.fore, r1 + r2);
	const local = { x: side * ANCHORS.shoulderX + elbow.x + fore.x, y: ANCHORS.shoulderY + elbow.y + fore.y };
	const scaled = { x: local.x * sx, y: local.y * sy };
	const w = rot(scaled.x, scaled.y, br);
	// A held prop stays upright in the body's frame, then turns by the hand's own angle.
	const g = rot(grip.x * side, grip.y, br + hand);
	return { x: bx + w.x + g.x, y: by + ANCHORS.base + w.y + g.y };
}

/**
 * The arm angles (ARMS form: the left arm's numbers, mirrored for the right) that put `grip` on
 * `target`. `bend` picks the elbow: 1 bends it down and out (a hand reaching up to a handle), -1 up
 * and in. Out of reach, the arm points straight at the target. Used to write the station arms in
 * vocab.ts; the unit tests check them with handAt.
 */
export function solveArm(target: { x: number; y: number }, opts: { body?: Body; side?: 1 | -1; grip?: { x: number; y: number }; hand?: number; bend?: 1 | -1 } = {}): [number, number, number] {
	const body = opts.body ?? "rest";
	const side = opts.side ?? 1;
	const hand = opts.hand ?? 0;
	const grip = opts.grip ?? GRIP.palm;
	const [, , br] = BODIES[body];
	// Take the grip off the target to find the hand's centre, then work in the shoulder's frame.
	const g = rot(grip.x * side, grip.y, br - side * hand);
	const sh = shoulderAt(body, side);
	const d = rot(target.x - g.x - sh.x, target.y - g.y - sh.y, -br);
	const L1 = ANCHORS.upper;
	const L2 = ANCHORS.fore;
	const dist = Math.min(Math.hypot(d.x, d.y), L1 + L2 - 1e-6);
	// The direction of a limb at channel angle r is (-sin r, cos r); the right arm's angle is -s.
	const toward = Math.atan2(-d.x, d.y) / RAD;
	const cosInner = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
	const inner = Math.acos(Math.max(-1, Math.min(1, cosInner))) / RAD;
	const cosElbow = (L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2);
	const elbowBend = 180 - Math.acos(Math.max(-1, Math.min(1, cosElbow))) / RAD;
	const bend = opts.bend ?? 1;
	// Channel angles, then back to ARMS form (negate for the right arm).
	const r1 = toward + bend * side * inner;
	const r2 = -bend * side * elbowBend;
	const round = (v: number) => Math.round(v) + 0;
	// One turn either way is the same arm, but the springs go the short way from rest: keep the
	// shoulder in (-160, 240], where the arms above already live (a raised arm is 180, not -180).
	let s = -side * r1;
	while (s > 240) s -= 360;
	while (s <= -160) s += 360;
	return [round(s), round(-side * r2), round(hand)];
}

/** A station point in puppet space. */
export const station = (p: { x: number; y: number }) => ({ x: STATION.x + p.x, y: STATION.y + p.y });

type Point = { readonly x: number; readonly y: number };
export interface Reach {
	/** Where the grip goes, in puppet space with the body at `body`. */
	at: Point;
	body: Body;
	/** -1 for the left arm. */
	side?: 1 | -1;
	grip?: Point;
	/** The held prop's own turn (ARMS' third number). */
	hand?: number;
	bend: 1 | -1;
	/** The point rides the body (an ear, a folder held in front), so any body pose will do. */
	torso?: boolean;
	/** Either hand may use it, mirrored (both hands in front, dusting off). */
	mirror?: boolean;
}

/**
 * What each station arm in vocab.ts ARMS was solved for. The unit tests check every one lands
 * within a unit of its point, and that a pose only uses it with the body it was solved for; if
 * STATION_REACH or a point in AT moves, re-solve with solveArm and paste the numbers into ARMS.
 */
export const REACH: Record<string, Reach> = {
	// Filing cabinet: the hand up on the drawer's handle, pulling it out (leaning back), fingers
	// walking the folder tabs, a folder drawn up out of the drawer, a page of it turned.
	grip: { at: station(AT.drawerHandle), body: "rest", bend: -1 },
	pull: { at: station(AT.drawerOut), body: "leanL", bend: 1 },
	tab1: { at: station(AT.drawerTabs), body: "up", grip: GRIP.finger, bend: -1 },
	tab2: { at: station(AT.drawerTabs2), body: "up", grip: GRIP.finger, bend: -1 },
	fetch: { at: station({ x: 2, y: -3 }), body: "up", bend: -1 },
	flip: { at: { x: 20, y: -37 }, body: "rest", bend: -1, torso: true },
	// Card catalogue: a fingertip on the card tops, a step at a time; a card held up to squint at.
	card1: { at: station(AT.cards[0]), body: "up", grip: GRIP.finger, bend: -1 },
	card2: { at: station(AT.cards[1]), body: "up", grip: GRIP.finger, bend: -1 },
	card3: { at: station(AT.cards[2]), body: "up", grip: GRIP.finger, bend: -1 },
	card: { at: { x: 40, y: -54 }, body: "rest", bend: 1, torso: true },
	// Copier: under the lid's edge, the lid half up, a sheet over the glass and flat on it, the lid
	// pressed shut, a finger on the button; the jam door's latch, the jammed sheet, and tugged out.
	under: { at: station({ x: AT.lid.x + 1, y: AT.lid.y + 3 }), body: "rest", bend: -1 },
	lid: { at: station(AT.lidHalf), body: "up", bend: -1 },
	lay: { at: station({ x: AT.glass.x - 2, y: AT.glass.y - 1 }), body: "up", bend: -1 },
	flat: { at: station(AT.glass), body: "up", bend: -1 },
	shut: { at: station({ x: 6, y: -6 }), body: "rest", bend: -1 },
	press: { at: station(AT.button), body: "rest", grip: GRIP.finger, bend: -1 },
	door: { at: station(AT.door), body: "rest", bend: 1 },
	tug1: { at: station(AT.jam), body: "rest", bend: 1 },
	tug2: { at: station(AT.jamOut), body: "leanL", bend: 1 },
	// Stamp desk: the stamp lifted over the pad, in it, swung over the form, pressed on it, and
	// pushing the stamped form off the pad of forms.
	st1: { at: station({ x: AT.ink.x, y: AT.ink.y - 4 }), body: "up", grip: GRIP.stamp, bend: -1 },
	ink: { at: station(AT.ink), body: "up", grip: GRIP.stamp, bend: -1 },
	st2: { at: station({ x: AT.form.x - 1, y: AT.form.y - 4 }), body: "up", grip: GRIP.stamp, hand: 20, bend: -1 },
	stamp: { at: station(AT.form), body: "up", grip: GRIP.stamp, bend: -1 },
	push1: { at: station(AT.formEdge), body: "up", grip: GRIP.stamp, bend: -1 },
	push2: { at: station({ x: AT.formEdge.x + 6, y: AT.formEdge.y }), body: "up", grip: GRIP.stamp, bend: -1 },
	// Phone: the receiver at the ear (left hand), the pencil's point along the notepad.
	ear: { at: { x: -42, y: -53 }, body: "rest", side: -1, bend: 1, torso: true },
	jot1: { at: station(AT.note[0]), body: "up", grip: GRIP.pencil, bend: -1 },
	jot2: { at: station(AT.note[1]), body: "up", grip: GRIP.pencil, bend: -1 },
	jot3: { at: station(AT.note[2]), body: "up", grip: GRIP.pencil, bend: -1 },
	// Outbox: the envelope held over the tray, and the hand lifting away from it.
	post: { at: station({ x: AT.tray.x, y: AT.tray.y - 3 }), body: "rest", bend: -1 },
	let: { at: station({ x: 2, y: -8 }), body: "rest", bend: -1 },
	// Dusting off: the hands in front, one high and one low, swapping.
	brushHi: { at: { x: 22, y: -36 }, body: "rest", bend: -1, torso: true, mirror: true },
	brushLo: { at: { x: 24, y: -29 }, body: "rest", bend: -1, torso: true, mirror: true },
	// Shredder: a fingertip on the pile's top sheet, sliding it over, and lowering it into the slot
	// (its bottom edge at the slot as it goes in: 12, 7, then 3 of it left showing).
	pick: { at: station({ x: AT.pile.x - 7, y: AT.pile.y - 2 }), body: "up", bend: -1 },
	slide: { at: station({ x: 1, y: -7 }), body: "up", bend: -1 },
	feed1: { at: station({ x: AT.slot.x, y: AT.slot.y - 13 }), body: "up", bend: -1 },
	feed2: { at: station({ x: AT.slot.x, y: AT.slot.y - 8 }), body: "up", bend: -1 },
	feed3: { at: station({ x: AT.slot.x, y: AT.slot.y - 4 }), body: "up", bend: -1 },
	// Waiting in line: a clipboard held up to read (left hand).
	read: { at: { x: -26, y: -32 }, body: "rest", side: -1, bend: -1, torso: true },
};
