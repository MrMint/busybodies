// A frame: one value per part. Poses are written in the boards' compact token form
// ("e-wide b-worry al-type1 bd-fwd") and parsed here into complete Frame objects, so a pose reads
// like the board it came from and every part not named stays at rest.
import {
	ARMS, BACKS, BODIES, BROWS, CHEEKS, EYES, FEET, FRONTS, FX, HELD, LOOKS, MOUTHS, SPOTS, WEARS, WORKS,
	type Arm, type Back, type Body, type Brows, type Cheeks, type Eyes, type Feet, type Front, type Fx,
	type Held, type Look, type Mouth, type Spot, type Wear, type Work,
} from "./vocab";

interface Props {
	/** Held in the left / right hand. */
	left?: Held;
	right?: Held;
	front?: Front;
	back?: Back;
	wear?: Wear;
	/** What the work is done on, on the floor out front (puppet space, not riding the body). */
	work?: Work;
}

export interface Frame {
	eyes: Eyes;
	look: Look;
	brows: Brows;
	cheeks: Cheeks;
	mouth: Mouth;
	armL: Arm;
	armR: Arm;
	feet: Feet;
	body: Body;
	props: Props;
	fx?: Fx;
	/** Where a second character in a two-hander stands. */
	spot: Spot;
}

/** A frame as a pose holds it: how long, and an optional line said on it. */
export interface TimedFrame extends Frame {
	ms: number;
	say?: string;
}

export const REST: Frame = Object.freeze({
	eyes: "rest", look: "center", brows: "none", cheeks: "rest", mouth: "rest",
	armL: "rest", armR: "rest", feet: "rest", body: "rest", props: {}, spot: "here",
}) as Frame;

// Token prefixes, as the boards wrote them (rig.css), and which list each one may name.
const TOKENS: Record<string, { key: string; values: readonly string[] }> = {
	e: { key: "eyes", values: EYES },
	l: { key: "look", values: Object.keys(LOOKS) },
	b: { key: "brows", values: Object.keys(BROWS) },
	c: { key: "cheeks", values: Object.keys(CHEEKS) },
	m: { key: "mouth", values: MOUTHS },
	al: { key: "armL", values: Object.keys(ARMS) },
	ar: { key: "armR", values: Object.keys(ARMS) },
	f: { key: "feet", values: Object.keys(FEET) },
	bd: { key: "body", values: Object.keys(BODIES) },
	x: { key: "fx", values: FX },
	at: { key: "spot", values: Object.keys(SPOTS) },
	hl: { key: "props.left", values: HELD },
	hr: { key: "props.right", values: HELD },
	fr: { key: "props.front", values: FRONTS },
	bk: { key: "props.back", values: BACKS },
	a: { key: "props.wear", values: WEARS },
	w: { key: "props.work", values: WORKS },
};

/** Parse "e-wide al-up hr-trophy" into a complete frame. Throws on any token it doesn't know, so a
 * typo in a pose fails the unit tests instead of drawing a resting arm. */
export function parseFrame(tokens: string): Frame {
	const f: Frame = { ...REST, props: {} };
	for (const tok of tokens.split(/\s+/).filter(Boolean)) {
		const i = tok.indexOf("-");
		const spec = i > 0 ? TOKENS[tok.slice(0, i)] : undefined;
		const value = tok.slice(i + 1);
		if (!spec?.values.includes(value)) throw new Error(`unknown frame token "${tok}" in "${tokens}"`);
		if (spec.key.startsWith("props.")) (f.props as Record<string, string>)[spec.key.slice(6)] = value;
		else (f as unknown as Record<string, string>)[spec.key] = value;
	}
	return f;
}

/** The parts of a frame that differ from rest, for dumps and the inspector. */
export function diff(f: Frame): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of ["eyes", "look", "brows", "cheeks", "mouth", "armL", "armR", "feet", "body", "fx", "spot"] as const) {
		const v = f[k];
		if (v !== undefined && v !== (REST as unknown as Record<string, unknown>)[k]) out[k] = v;
	}
	for (const [k, v] of Object.entries(f.props)) if (v) out[k === "left" ? "holdL" : k === "right" ? "holdR" : k] = v;
	return out;
}

/** One line per frame, in the boards' printed form: `{ eyes: 'wide', armL: 'up' }`. */
export function describe(f: Frame): string {
	const d = diff(f);
	const parts = Object.entries(d).map(([k, v]) => `${k}: '${v}'`);
	return parts.length ? `{ ${parts.join(", ")} }` : "{ rest }";
}

/** The numeric targets a frame asks every spring for. Names match the puppet's channels. */
export type Channels = Record<ChannelName, number>;
export const CHANNELS = [
	"shoulderL", "elbowL", "handL", "shoulderR", "elbowR", "handR",
	"legL", "liftL", "legR", "liftR",
	"bodyX", "bodyY", "bodyR", "bodySX", "bodySY", "hop",
	"lookX", "lookY",
	"browLY", "browLR", "browRY", "browRR", "browA",
	"cheek",
	"spotX", "spotA", "spotS",
] as const;
export type ChannelName = (typeof CHANNELS)[number];

export function channels(f: Frame): Channels {
	const [sl, el, hl] = ARMS[f.armL];
	const [sr, er, hr] = ARMS[f.armR];
	const [ll, ly, lr, ry] = FEET[f.feet];
	const [bx, by, br, sx, sy, hop] = BODIES[f.body];
	const [fx, fy] = LOOKS[f.look];
	const [byl, brl, byr, brr, ba] = BROWS[f.brows];
	const [cs] = CHEEKS[f.cheeks];
	const [px, pa, ps] = SPOTS[f.spot];
	return {
		shoulderL: sl, elbowL: el, handL: hl,
		// The right arm mirrors the left: same numbers, opposite sense.
		shoulderR: -sr, elbowR: -er, handR: -hr,
		legL: ll, liftL: ly, legR: lr, liftR: ry,
		bodyX: bx, bodyY: by, bodyR: br, bodySX: sx, bodySY: sy, hop,
		lookX: fx, lookY: fy,
		browLY: byl, browLR: brl, browRY: byr, browRR: brr, browA: ba,
		cheek: cs,
		spotX: px, spotA: pa, spotS: ps,
	};
}
