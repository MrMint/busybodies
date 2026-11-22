// The paper theme: a palette and a painter for every part texture. Painters draw in rig units
// (the body is 100 wide; see vocab.ts) in each part's own space, and the atlas bakes them once. A
// theme reskins the rig by supplying different painters or colours for the same part names; poses
// and frames never change. Part names are `<layer>/<variant>`; docs/decisions.md lists them.
import { Container, Graphics, Text } from "pixi.js";
import { EYES, FX, HELD, MOUTHS, WORKS } from "./vocab";
import { ROLES, type Role } from "./roles";

export interface Palette {
	ink: number;
	paper: number;
	shadow: number;
	role: Record<Role, number>;
	sun: number;
	go: number;
	wood: number;
	kraft: number;
	steel: number;
	tongue: number;
	tear: number;
	cheek: number;
}

export const PAPER_PALETTE: Palette = {
	ink: 0x2b2340,
	paper: 0xffffff,
	shadow: 0x1b2140,
	role: {
		lead: 0xfffaf0,
		builder: 0x86abff,
		scout: 0x6fdc9d,
		explorer: 0xecb67c,
		reviewer: 0xbda2ff,
		verifier: 0x58d9ce,
		designer: 0xff94c4,
	},
	sun: 0xffd23f,
	go: 0x2ecc71,
	wood: 0xe9bd80,
	kraft: 0xd9a066,
	steel: 0x8a94ad,
	tongue: 0xff7a90,
	tear: 0x7cc4ff,
	cheek: 0xffffff, // cheeks are white and tinted per frame (vocab.CHEEKS)
};

/** Project accent colours for the lead's tie and headset (the boards' t-* tints). */
export const ACCENTS = [0xff8a1f, 0x19b87a, 0x3d7dff, 0xff5c9a, 0x8c5cff] as const;

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

/** Stroke weights. */
const W = { body: 3.4, part: 2.6, fine: 1.8 };

export type Painter = (g: Graphics, add: (c: Container) => void) => void;

export interface Theme {
	name: string;
	palette: Palette;
	/** Every part texture the atlas bakes, by name. */
	parts: Record<string, Painter>;
}

// Helpers ---------------------------------------------------------------------------------------

const line = (g: Graphics, pts: number[], width: number, color: number) => {
	g.moveTo(pts[0]!, pts[1]!);
	for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
	g.stroke({ width, color, cap: "round", join: "round" });
};

/** The mochi outline: a superellipse with a round dome on top and a flatter, wider base. */
export function mochiPath(width = 100, height = 70): number[] {
	const a = width / 2;
	const b = height / 2;
	const pts: number[] = [];
	const n = 72;
	for (let i = 0; i < n; i++) {
		const t = (i / n) * Math.PI * 2;
		const c = Math.cos(t);
		const s = Math.sin(t);
		const top = s < 0;
		const ex = top ? 2.25 : 3.4;
		// Bottom half bulges a little wider than the top: the mochi settles on its base.
		const ax = top ? a * 0.97 : a;
		const x = ax * Math.sign(c) * Math.abs(c) ** (2 / ex);
		const y = b * Math.sign(s) * Math.abs(s) ** (2 / ex);
		pts.push(x, y - b);
	}
	return pts;
}

const text = (s: string, size: number, color: number, weight: "700" | "800" | "900" = "900") => {
	const t = new Text({
		text: s,
		style: { fontFamily: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif", fontSize: size, fontWeight: weight, fill: color },
		resolution: 4,
	});
	t.anchor.set(0.5);
	return t;
};

// Painters ---------------------------------------------------------------------------------------

export function paperTheme(p: Palette = PAPER_PALETTE): Theme {
	const ink = p.ink;
	const parts: Record<string, Painter> = {};
	const A = ANCHORS;

	parts.shadow = (g) => {
		g.ellipse(0, 0, 40, 6.5).fill({ color: p.shadow, alpha: 0.16 });
	};

	for (const role of ROLES) {
		const col = p.role[role];
		parts[`body/${role}`] = (g) => {
			g.poly(mochiPath()).fill(col);
			// Cut-paper light: a soft highlight on the dome and a shade along the base.
			g.ellipse(-19, -54, 12, 7).fill({ color: 0xffffff, alpha: 0.26 });
			g.ellipse(0, -7, 38, 6).fill({ color: p.shadow, alpha: 0.06 });
			g.poly(mochiPath()).stroke({ width: W.body, color: ink, join: "round" });
		};
		parts[`hand/${role}`] = (g) => {
			g.circle(0, 0, 6.2).fill(col).stroke({ width: W.part, color: ink });
		};
	}

	// Limbs: ink capsules, drawn hanging down from their pivot.
	parts["arm/upper"] = (g) => line(g, [0, 0, 0, A.upper], 6, ink);
	parts["arm/fore"] = (g) => line(g, [0, 0, 0, A.fore], 5.4, ink);
	parts.leg = (g) => {
		line(g, [0, 0, 0, 14], 6.6, ink);
		// A little shoe pointing outward (left leg; the right one is mirrored).
		g.roundRect(-9.5, 11.5, 13, 6.5, 3.2).fill(ink);
	};

	// Face ------------------------------------------------------------------------------------------
	const eye: Record<(typeof EYES)[number], Painter> = {
		rest: (g) => {
			g.ellipse(0, 0, 4.2, 5.4).fill(ink);
			g.circle(1.3, -1.8, 1.5).fill(0xffffff);
		},
		wide: (g) => {
			g.circle(0, 0, 6.6).fill(0xffffff).stroke({ width: 2.2, color: ink });
			g.circle(0, 0.6, 3.2).fill(ink);
			g.circle(1, -0.6, 1).fill(0xffffff);
		},
		shine: (g) => {
			g.ellipse(0, 0, 5.8, 7).fill(ink);
			g.circle(1.8, -2.4, 2.1).fill(0xffffff);
			g.circle(-1.9, 2.4, 1.1).fill(0xffffff);
		},
		tear: (g) => {
			g.ellipse(0, 0, 5.8, 7).fill(ink);
			g.circle(1.8, -2.4, 2.1).fill(0xffffff);
			g.circle(-1.9, 2.4, 1.1).fill(0xffffff);
			g.moveTo(-3, 6).quadraticCurveTo(-6, 11, -3, 13).quadraticCurveTo(0, 11, -3, 6).fill(p.tear).stroke({ width: 1, color: ink });
		},
		squint: (g) => line(g, [-4, -4, 3, 0, -4, 4], 2.6, ink),
		happy: (g) => {
			g.arc(0, 3, 5, Math.PI + 0.25, -0.25).stroke({ width: 2.6, color: ink, cap: "round" });
		},
		half: (g) => {
			g.arc(0, -0.5, 5, 0, Math.PI).fill(ink);
			line(g, [-6, -0.5, 6, -0.5], 2.4, ink);
		},
		star: (g) => {
			g.star(0, 0, 5, 7, 3.2, 0).fill(ink);
		},
		side: (g) => {
			g.ellipse(0, 0, 5.6, 4.6).fill(0xffffff).stroke({ width: 2, color: ink });
			g.circle(2.8, 0.6, 2.4).fill(ink);
			line(g, [-6, -2.4, 6, -2.4], 2.4, ink);
		},
		closed: (g) => {
			g.arc(0, -1.5, 4.8, 0.25, Math.PI - 0.25).stroke({ width: 2.6, color: ink, cap: "round" });
		},
		dead: (g) => {
			line(g, [-4, -4, 4, 4], 2.6, ink);
			line(g, [4, -4, -4, 4], 2.6, ink);
		},
	};
	for (const e of EYES) parts[`eye/${e}`] = eye[e];

	const mouth: Record<(typeof MOUTHS)[number], Painter> = {
		rest: (g) => {
			g.arc(0, -2, 4.5, 0.35, Math.PI - 0.35).stroke({ width: 2.4, color: ink, cap: "round" });
		},
		flat: (g) => line(g, [-5, 0, 5, 0], 2.4, ink),
		small: (g) => {
			g.ellipse(0, 0, 2.6, 3).fill(ink);
		},
		pout: (g) => {
			g.moveTo(-4, 1.5).quadraticCurveTo(0, -3, 4, 1.5).stroke({ width: 2.4, color: ink, cap: "round" });
		},
		grin: (g) => {
			g.moveTo(-8, -2.5).lineTo(8, -2.5).quadraticCurveTo(7.5, 8, 0, 8).quadraticCurveTo(-7.5, 8, -8, -2.5).fill(ink);
			g.ellipse(0, 5.2, 4, 2.4).fill(p.tongue);
			g.rect(-5, -2.5, 10, 2).fill(0xffffff);
		},
		open: (g) => {
			g.ellipse(0, 1, 4.6, 5.4).fill(ink);
			g.ellipse(0, 3.6, 2.8, 1.8).fill(p.tongue);
		},
		wobble: (g) => line(g, [-7, 1, -4.5, -1.5, -2, 1, 0.5, -1.5, 3, 1, 5.5, -1.5, 7, 0.5], 2.2, ink),
		shout: (g) => {
			g.moveTo(-9, -3).lineTo(9, -3).quadraticCurveTo(8, 10, 0, 10).quadraticCurveTo(-8, 10, -9, -3).fill(ink);
			g.ellipse(0, 6.8, 5, 2.8).fill(p.tongue);
		},
		smirk: (g) => {
			g.moveTo(-5, 1).quadraticCurveTo(1, 3, 5.5, -2.5).stroke({ width: 2.4, color: ink, cap: "round" });
		},
		drool: (g) => {
			g.ellipse(0, 0, 3.4, 2.6).fill(ink);
			g.moveTo(2.5, 1).quadraticCurveTo(5, 7, 3, 9).quadraticCurveTo(1, 7, 2.5, 1).fill(p.tear);
		},
		yawn: (g) => {
			g.ellipse(0, 1, 4.4, 7).fill(ink);
			g.ellipse(0, 5, 2.6, 1.8).fill(p.tongue);
		},
		blep: (g) => {
			g.arc(0, -2, 4.5, 0.35, Math.PI - 0.35).stroke({ width: 2.4, color: ink, cap: "round" });
			g.roundRect(-0.5, 1.2, 4.4, 4.4, 2).fill(p.tongue).stroke({ width: 1.2, color: ink });
		},
		frown: (g) => {
			g.arc(0, 4, 4.5, Math.PI + 0.4, -0.4).stroke({ width: 2.4, color: ink, cap: "round" });
		},
	};
	for (const m of MOUTHS) parts[`mouth/${m}`] = mouth[m];

	parts.brow = (g) => line(g, [-4.6, 0, 4.6, 0], 2.8, ink);
	parts.cheek = (g) => {
		g.ellipse(0, 0, 6.4, 3.8).fill(0xffffff);
	};

	// Costumes --------------------------------------------------------------------------------------
	// Hats sit on the body's top (torso y = -70) and are drawn in torso space.
	const T = A.bodyTop;
	parts["hat/lead"] = (g) => {
		// A headset: a band over the dome, an ear cup and a mic boom to the mouth.
		g.moveTo(-47, -38).bezierCurveTo(-48, T - 12, 48, T - 12, 47, -38).stroke({ width: 4, color: ink, cap: "round" });
		g.moveTo(-47, -38).bezierCurveTo(-48, T - 12, 48, T - 12, 47, -38).stroke({ width: 1.6, color: 0xcfd6e6, cap: "round" });
		g.moveTo(-50, -30).quadraticCurveTo(-42, -14, -20, -19).stroke({ width: 2.4, color: ink, cap: "round" });
		g.circle(-19, -19, 2.6).fill(ink);
	};
	parts["hat/lead-cup"] = (g) => {
		// The ear cup, white so it takes the project accent as a tint.
		g.roundRect(-55, -44, 10, 17, 4.5).fill(0xffffff).stroke({ width: W.part, color: ink });
	};
	parts["hat/builder"] = (g) => {
		g.moveTo(-28, T + 5).bezierCurveTo(-28, T - 26, 28, T - 26, 28, T + 5).closePath().fill(p.sun).stroke({ width: W.part, color: ink });
		g.roundRect(-5, T - 18, 10, 20, 3).fill(0xffb300).stroke({ width: 2, color: ink });
		g.roundRect(-37, T + 2, 74, 7, 3.5).fill(p.sun).stroke({ width: W.part, color: ink });
	};
	parts["hat/scout"] = (g) => {
		g.moveTo(-20, T + 3).lineTo(-16, T - 15).quadraticCurveTo(0, T - 20, 16, T - 15).lineTo(20, T + 3).closePath().fill(0x35b866).stroke({ width: W.part, color: ink });
		g.rect(-19, T - 3, 38, 5).fill(p.sun);
		g.ellipse(0, T + 4, 38, 5).fill(0x35b866).stroke({ width: W.part, color: ink });
	};
	parts["hat/explorer"] = (g) => {
		g.ellipse(0, T + 3, 40, 6).fill(0xf3e2b8).stroke({ width: W.part, color: ink });
		g.moveTo(-26, T + 2).bezierCurveTo(-26, T - 26, 26, T - 26, 26, T + 2).closePath().fill(0xf3e2b8).stroke({ width: W.part, color: ink });
		g.rect(-25, T - 3, 50, 4).fill(0x8a5a33);
		g.circle(0, T - 19, 2.6).fill(0x8a5a33).stroke({ width: 1.4, color: ink });
	};
	parts["hat/reviewer"] = (g) => {
		// A hair bun on top.
		g.circle(0, T - 9, 10).fill(0x9a7ae8).stroke({ width: W.part, color: ink });
		g.roundRect(-8, T - 2, 16, 5, 2.5).fill(0x7a5ad0).stroke({ width: 2, color: ink });
	};
	parts["hat/verifier"] = (g) => {
		g.moveTo(-30, T + 6).quadraticCurveTo(0, T - 14, 30, T + 6).closePath().fill(0x1fb5a8).stroke({ width: W.part, color: ink });
		g.roundRect(-36, T - 6, 72, 7, 2).fill(0x34cdbf).stroke({ width: W.part, color: ink });
		g.rect(-26, T + 1, 52, 3).fill({ color: 0xffffff, alpha: 0.5 });
	};
	parts["hat/designer"] = (g) => {
		g.ellipse(-4, T - 3, 34, 11).fill(0xe8506e).stroke({ width: W.part, color: ink });
		g.roundRect(-3, T - 18, 5, 7, 2).fill(ink);
	};

	// Front pieces, in torso space below the mouth.
	const F = A.frontY;
	parts["front/tie"] = (g) => {
		// White so the project accent tints it.
		g.poly([-4, F - 1, 4, F - 1, 2, F + 3, -2, F + 3]).fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
		g.poly([-2, F + 3, 2, F + 3, 4.5, F + 13, 0, F + 16, -4.5, F + 13]).fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
	};
	parts["front/apron"] = (g) => {
		g.roundRect(-15, F - 2, 30, 15, 4).fill(0xff8a1f).stroke({ width: W.part, color: ink });
		g.rect(-15, F + 3, 30, 3.4).fill(p.sun);
	};
	parts["front/kerchief"] = (g) => {
		g.poly([-14, F - 2, 14, F - 2, 0, F + 10]).fill(p.sun).stroke({ width: 2, color: ink, join: "round" });
	};
	parts["front/straps"] = (g) => {
		line(g, [-30, -20, -16, F + 14], 3.4, 0x8a5a33);
		line(g, [30, -20, 16, F + 14], 3.4, 0x8a5a33);
		g.roundRect(-6, F + 2, 12, 9, 2).fill(0x8a5a33).stroke({ width: 1.6, color: ink });
	};
	parts["front/bowtie"] = (g) => {
		g.poly([0, F + 2, -10, F - 4, -10, F + 8]).fill(0xff4d5e).stroke({ width: 1.8, color: ink, join: "round" });
		g.poly([0, F + 2, 10, F - 4, 10, F + 8]).fill(0xff4d5e).stroke({ width: 1.8, color: ink, join: "round" });
		g.circle(0, F + 2, 2.4).fill(0xff4d5e).stroke({ width: 1.6, color: ink });
	};
	parts["front/badge"] = (g) => {
		g.roundRect(9, F - 3, 11, 13, 2).fill(0xffffff).stroke({ width: 2, color: ink });
		g.circle(14.5, F + 2.5, 2.4).fill(p.go);
	};
	parts["front/scarf"] = (g) => {
		g.roundRect(8, F + 1, 7, 13, 3).fill(p.sun).stroke({ width: 1.8, color: ink });
		g.moveTo(-24, F - 1).quadraticCurveTo(0, F + 7, 24, F - 1).stroke({ width: 7, color: ink, cap: "round" });
		g.moveTo(-24, F - 1).quadraticCurveTo(0, F + 7, 24, F - 1).stroke({ width: 3.8, color: p.sun, cap: "round" });
	};

	// Worn on the face, centred between the eyes.
	parts["wear/glasses"] = (g) => {
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, A.eyeY, 9).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 2.4, color: ink });
		line(g, [-7, A.eyeY - 1, 7, A.eyeY - 1], 2.2, ink);
	};
	parts["wear/binoc"] = (g) => {
		for (const x of [-A.eyeX + 2, A.eyeX - 2]) {
			g.roundRect(x - 8, A.eyeY - 9, 16, 17, 5).fill(0x3a3f5c).stroke({ width: W.part, color: ink });
			g.circle(x, A.eyeY - 0.5, 5).fill(0x9fe3ff).stroke({ width: 1.6, color: ink });
		}
		g.rect(-6, A.eyeY - 4, 12, 6).fill(0x3a3f5c);
	};

	// Held props: drawn upright about the hand's centre.
	const held: Record<(typeof HELD)[number], Painter> = {
		sign: (g, add) => {
			line(g, [0, 0, 0, -30], 3.6, ink);
			g.circle(0, -43, 13).fill(p.sun).stroke({ width: W.part, color: ink });
			const t = text("!", 19, ink);
			t.position.set(0, -43);
			add(t);
		},
		ok: (g) => {
			line(g, [0, 0, 0, -26], 3.6, ink);
			g.circle(0, -38, 12).fill(p.go).stroke({ width: W.part, color: ink });
			line(g, [-5.5, -38, -1.5, -33.5, 6, -43], 3.2, ink);
		},
		trophy: (g) => {
			g.roundRect(-7, -6, 14, 4, 1.5).fill(p.sun).stroke({ width: 2, color: ink });
			g.rect(-1.5, -12, 3, 6).fill(ink);
			g.moveTo(-11, -28).lineTo(11, -28).quadraticCurveTo(11, -12, 0, -12).quadraticCurveTo(-11, -12, -11, -28).fill(p.sun).stroke({ width: W.part, color: ink });
			g.arc(-11, -22, 4.5, Math.PI * 0.5, Math.PI * 1.5).stroke({ width: 2, color: ink });
			g.arc(11, -22, 4.5, -Math.PI * 0.5, Math.PI * 0.5).stroke({ width: 2, color: ink });
		},
		mag: (g) => {
			line(g, [0, 2, 4, -12], 4, 0x8a5a33);
			g.circle(7, -21, 9).fill({ color: 0xdff4ff, alpha: 0.85 }).stroke({ width: W.part, color: ink });
			g.arc(7, -21, 5.5, Math.PI * 1.1, Math.PI * 1.5).stroke({ width: 1.6, color: 0xffffff });
		},
		clip: (g) => {
			g.roundRect(-24, -20, 20, 27, 2.5).fill(0xc99a6b).stroke({ width: 2.2, color: ink });
			g.rect(-21.5, -16, 15, 21).fill(0xffffff);
			for (const y of [-11, -6, -1, 3]) line(g, [-19, y, -9, y], 1.4, 0x9aa3bd);
			g.roundRect(-18, -23, 8, 5, 1.5).fill(p.steel).stroke({ width: 1.4, color: ink });
		},
		pom: (g) => {
			for (let i = 0; i < 9; i++) {
				const a = (i / 9) * Math.PI * 2;
				g.circle(Math.cos(a) * 6, -8 + Math.sin(a) * 6, 4.6).fill(0xff5c9a);
			}
			g.circle(0, -8, 5).fill(0xff86b6);
			g.circle(0, -8, 11).stroke({ width: 1.4, color: ink, alpha: 0.6 });
		},
		mug: (g) => {
			g.roundRect(-2, -14, 12, 14, 2).fill(0xffffff).stroke({ width: 2.2, color: ink });
			g.rect(-2, -9, 12, 3).fill(0xff8a1f);
			g.arc(10, -7, 3.6, -Math.PI / 2, Math.PI / 2).stroke({ width: 2, color: ink });
		},
		hammer: (g) => {
			line(g, [0, 6, 0, -20], 4, 0x8a5a33);
			g.roundRect(-10, -28, 20, 9, 2).fill(p.steel).stroke({ width: 2.2, color: ink });
		},
		map: (g) => {
			g.poly([-16, -26, -6, -23, 4, -26, 14, -23, 14, -5, 4, -8, -6, -5, -16, -8]).fill(0xfff3cf).stroke({ width: 2, color: ink, join: "round" });
			g.moveTo(-11, -12).lineTo(-3, -19).lineTo(4, -13).lineTo(10, -20).stroke({ width: 1.6, color: 0xff4d5e });
			g.circle(10, -20, 2).fill(0xff4d5e);
		},
		torch: (g) => {
			g.poly([-3, -18, 3, -18, 15, -44, -15, -44]).fill({ color: p.sun, alpha: 0.55 });
			g.roundRect(-3.5, -18, 7, 21, 2).fill(p.steel).stroke({ width: 2, color: ink });
			g.roundRect(-5, -21, 10, 5, 1.5).fill(p.sun).stroke({ width: 1.6, color: ink });
		},
		brush: (g) => {
			line(g, [0, 5, 0, -18], 3.4, 0x8a5a33);
			g.rect(-2.4, -22, 4.8, 5).fill(p.steel);
			g.moveTo(-3, -22).quadraticCurveTo(0, -32, 3, -22).closePath().fill(0xff4d7a).stroke({ width: 1.4, color: ink });
		},
		plane: (g) => {
			g.poly([-14, -6, 16, -16, -6, -2]).fill(0xffffff).stroke({ width: 1.8, color: ink, join: "round" });
			g.poly([-6, -2, 16, -16, -2, 4]).fill(0xe7ebf5).stroke({ width: 1.8, color: ink, join: "round" });
		},
		phone: (g) => {
			g.roundRect(-6, -20, 12, 21, 2.5).fill(0x3a3f5c).stroke({ width: 2, color: ink });
			g.roundRect(-4, -17.5, 8, 14, 1).fill(0x9fe3ff);
		},
		paper: (g) => {
			g.rect(-9, -22, 17, 22).fill(0xffffff).stroke({ width: 1.8, color: ink });
			for (const y of [-17, -12, -7]) line(g, [-6, y, 5, y], 1.3, 0x9aa3bd);
		},
		wrench: (g) => {
			// Upright about the palm: the handle, and an open jaw 24 up (the arms put it on the nut).
			g.roundRect(-3.2, -17, 6.4, 21, 3.2).fill(p.steel).stroke({ width: 2, color: ink });
			g.arc(0, -24, 7.4, Math.PI * 0.62, Math.PI * 2.38).stroke({ width: 7, color: ink, cap: "round" });
			g.arc(0, -24, 7.4, Math.PI * 0.62, Math.PI * 2.38).stroke({ width: 4, color: p.steel, cap: "round" });
		},
		bolt: (g) => {
			g.rect(-2.2, -12, 4.4, 11).fill(p.steel).stroke({ width: 1.4, color: ink });
			for (const y of [-9, -6, -3]) line(g, [-2.2, y, 2.2, y - 1.2], 1, ink);
			g.roundRect(-6, -17, 12, 5.5, 1).fill(p.steel).stroke({ width: 1.8, color: ink });
		},
		gear: (g) => {
			g.star(0, -11, 8, 9.5, 7, 0).fill(p.sun).stroke({ width: 1.8, color: ink, join: "round" });
			g.circle(0, -11, 2.8).fill(0xffffff).stroke({ width: 1.4, color: ink });
		},
		brick: (g) => {
			// On the palm: the hand shows under it.
			brick(g, 0, -10, WORK.brickW, WORK.brickH, p.wood, ink);
		},
	};
	for (const h of HELD) parts[`held/${h}`] = held[h];

	// A blueprint held in both hands by its top corners (vocab ARMS.sheet), in torso space.
	const plan = (g: Graphics, flip: boolean) => {
		// Held low, under the mouth, so the face stays readable over it.
		g.roundRect(-29, -14, 58, 25, 2).fill(0x4f8ff0).stroke({ width: W.part, color: ink });
		// A little house in white lines, and a dimension line beside it. Turned, it stands on its roof.
		const k = flip ? -1 : 1;
		const cy = -1;
		const pts = [-9, 6, -9, -2, 0, -9, 9, -2, 9, 6, -9, 6].map((v, i) => (i % 2 ? cy + v * k : v));
		line(g, pts, 1.8, 0xffffff);
		line(g, [-2.5, cy + 6 * k, -2.5, cy + 1 * k, 2.5, cy + 1 * k, 2.5, cy + 6 * k], 1.4, 0xffffff);
		line(g, [-22, cy - 8 * k, -22, cy + 8 * k], 1.2, 0xcfe0ff);
		line(g, [15, cy + 8 * k, 23, cy + 8 * k], 1.2, 0xcfe0ff);
		// The curl along the top edge, where it was rolled.
		g.roundRect(-30, -17, 60, 6, 3).fill(0x3d7de0).stroke({ width: 2, color: ink });
	};
	parts["prop/plan"] = (g) => plan(g, false);
	parts["prop/plan2"] = (g) => plan(g, true);
	parts["prop/roll"] = (g) => {
		g.roundRect(-31, -18, 62, 12, 6).fill(0x4f8ff0).stroke({ width: W.part, color: ink });
		line(g, [-18, -15, 14, -15], 1.4, 0xcfe0ff);
		g.ellipse(-31, -12, 3, 6).fill(0xcfe0ff).stroke({ width: 1.6, color: ink });
		g.ellipse(31, -12, 3, 6).fill(0xcfe0ff).stroke({ width: 1.6, color: ink });
	};

	// The work, on the floor out front, in puppet space (see WORK). ------------------------------------
	const bench = (g: Graphics) => {
		const { benchL: l, benchR: r, benchTop: t } = WORK;
		line(g, [l + 7, t + 4, l + 3, 0], 4, ink);
		line(g, [r - 7, t + 4, r - 3, 0], 4, ink);
		line(g, [l + 5, t + 13, r - 5, t + 13], 3, ink);
		g.roundRect(l, t, r - l, 6, 2).fill(p.wood).stroke({ width: W.part, color: ink });
		line(g, [l + 4, t + 3, l + 12, t + 3], 1, 0xb88a4c);
		line(g, [r - 16, t + 3, r - 6, t + 3], 1, 0xb88a4c);
	};
	const nail = (g: Graphics, top: number) => {
		const x = WORK.nailX;
		if (top < WORK.benchTop - 3) g.rect(x - 1.7, top + 3, 3.4, WORK.benchTop - top - 3).fill(p.steel).stroke({ width: 1.2, color: ink });
		g.roundRect(x - 5.5, top, 11, 3.4, 1.2).fill(p.steel).stroke({ width: 1.8, color: ink });
	};
	const work: Record<(typeof WORKS)[number], Painter> = {
		nail1: (g) => (bench(g), nail(g, WORK.nailTop[0])),
		nail2: (g) => (bench(g), nail(g, WORK.nailTop[1])),
		nail3: (g) => (bench(g), nail(g, WORK.nailTop[2])),
		bent: (g) => {
			// Struck crooked: the nail folded over, and the hammer knocked to the floor.
			bench(g);
			const x = WORK.nailX;
			const t = WORK.benchTop;
			line(g, [x, t, x, t - 6, x + 8, t - 9], 3.6, ink);
			line(g, [x, t, x, t - 6, x + 8, t - 9], 1.6, p.steel);
			g.roundRect(x + 6, t - 13, 3, 8, 1).fill(p.steel).stroke({ width: 1.4, color: ink });
			line(g, [WORK.benchR + 6, -3, WORK.benchR + 30, -6], 4, 0x8a5a33);
			g.roundRect(WORK.benchR + 2, -10, 9, 10, 2).fill(p.steel).stroke({ width: 2, color: ink });
		},
		nut1: (g) => machine(g, 0),
		nut2: (g) => machine(g, 1),
		nut3: (g) => machine(g, 2),
		crate: (g) => {
			// A crate of parts: a gear, bolts and a pipe poking out of the top.
			g.star(64, -22, 8, 8, 6, 0.2).fill(p.sun).stroke({ width: 1.6, color: ink });
			g.rect(82, -30, 3.6, 10).fill(p.steel).stroke({ width: 1.2, color: ink });
			g.roundRect(79.5, -32, 8.6, 4, 1).fill(p.steel).stroke({ width: 1.4, color: ink });
			line(g, [72, -18, 76, -29], 4, ink);
			line(g, [72, -18, 76, -29], 2, 0xff8a1f);
			g.roundRect(54, -21, 40, 21, 2.5).fill(p.kraft).stroke({ width: W.part, color: ink });
			line(g, [55, -11, 93, -11], 1.4, 0xb07a40);
			line(g, [60, -19, 60, -2], 1.2, 0xb07a40);
			line(g, [88, -19, 88, -2], 1.2, 0xb07a40);
		},
		stack: (g) => (bench(g), stack(g, 0)),
		stackL: (g) => (bench(g), stack(g, -1)),
		stackR: (g) => (bench(g), stack(g, 1)),
		brick: (g) => brick(g, WORK.brick.x, WORK.brick.y, WORK.brickW, WORK.brickH, p.wood, ink),
	};
	for (const w of WORKS) parts[`work/${w}`] = work[w];

	/** A machine with a big nut on its face, turned a third of the way between steps. */
	const machine = (g: Graphics, step: number) => {
		const { x, y } = WORK.nut;
		g.roundRect(x - 12, y - 18, 32, 56, 4).fill(0x6f7fa8).stroke({ width: W.part, color: ink });
		g.roundRect(x - 8, y - 14, 24, 7, 2).fill({ color: 0xffffff, alpha: 0.18 });
		g.circle(x + 12, y + 14, 2.6).fill(p.go).stroke({ width: 1.2, color: ink });
		g.circle(x, y, 8.5).fill(0x56628a).stroke({ width: 1.6, color: ink });
		const a = (step * Math.PI) / 9;
		g.regularPoly(x, y, 6, 6, a).fill(p.steel).stroke({ width: 1.8, color: ink, join: "round" });
		g.circle(x, y, 2.2).fill(0x56628a).stroke({ width: 1.2, color: ink });
	};
	/** Three bricks stacked on the bench, rocking `tilt` (-1, 0, 1) on a bottom corner. */
	const stack = (g: Graphics, tilt: number) => {
		const t = WORK.benchTop;
		const px = tilt < 0 ? 75 : 93;
		g.save();
		g.translateTransform(-px, -t).rotateTransform(tilt * 0.12).translateTransform(px, t);
		brick(g, 84, t - 5.5, 18, 11, 0x9be3ff, ink);
		brick(g, 85, t - 16.5, 18, 11, 0xffe58a, ink);
		brick(g, 83, t - 27.5, 18, 11, 0x8fe3b5, ink);
		g.restore();
	};

	// Fronts and backs.
	parts["prop/box"] = (g) => {
		// Held at the belly, in torso space.
		g.roundRect(-18, -30, 36, 24, 2.5).fill(p.kraft).stroke({ width: W.part, color: ink });
		g.rect(-3, -30, 6, 24).fill(0xf3d29e);
		line(g, [-18, -24, 18, -24], 1.2, 0xb07a40);
	};
	parts["prop/pls"] = (g, add) => {
		// Held overhead, in torso space.
		g.poly([-40, -112, 40, -116, 41, -88, -39, -86]).fill(0xffffff).stroke({ width: W.part + 0.6, color: ink, join: "round" });
		const t = text("please?", 17, ink, "800");
		t.rotation = -0.04;
		t.position.set(0, -100);
		add(t);
	};
	parts["prop/desk"] = (g) => {
		// In the puppet's own space: covers the legs and the base of the body.
		g.roundRect(-22, -33, 44, 6, 2).fill(0xdfe4ef).stroke({ width: 2, color: ink });
		g.roundRect(-72, -28, 144, 9, 3).fill(p.wood).stroke({ width: W.part, color: ink });
		g.rect(-64, -19, 128, 23).fill(0xd8a868).stroke({ width: W.part, color: ink });
		line(g, [-64, -10, 64, -10], 1.2, 0xb88a4c);
	};
	parts["prop/chair"] = (g) => {
		g.roundRect(-40, -110, 80, 86, 14).fill(0x4a5072).stroke({ width: W.part, color: ink });
		g.roundRect(-30, -100, 60, 62, 10).fill({ color: 0xffffff, alpha: 0.08 });
		line(g, [0, -24, 0, -2], 5, ink);
		line(g, [-18, 0, 18, 0], 4, ink);
	};

	// Effects, around the head: drawn as if the body stood at y = 0; the puppet lifts them by `base`.
	const fx: Record<(typeof FX)[number], Painter> = {
		sweat1: (g) => drop(g, -50, -78, p.tear, ink),
		sweat2: (g) => {
			drop(g, 48, -80, p.tear, ink);
			drop(g, 56, -66, p.tear, ink, 0.7);
		},
		conf1: (g) => confetti(g, 1),
		conf2: (g) => confetti(g, 2),
		conf3: (g) => confetti(g, 3),
		pop: (g) => burst(g, 0, -92, ink),
		spark: (g) => {
			sparkle(g, 56, -62, 7, p.sun, ink);
			sparkle(g, 66, -80, 4, p.sun, ink);
		},
		dust: (g) => {
			for (const [x, y, r] of [[-38, -4, 7], [-50, -8, 5], [-28, -10, 4]] as const) g.circle(x, y, r).fill({ color: 0xd8d2c4, alpha: 0.9 }).stroke({ width: 1.4, color: ink, alpha: 0.5 });
		},
		idea: (g) => {
			g.circle(0, -104, 9).fill(p.sun).stroke({ width: W.part, color: ink });
			g.roundRect(-4.5, -96, 9, 6, 1.5).fill(p.steel).stroke({ width: 1.6, color: ink });
			for (const a of [-2.4, -1.57, -0.74]) line(g, [Math.cos(a) * 13, -104 + Math.sin(a) * 13, Math.cos(a) * 18, -104 + Math.sin(a) * 18], 2, ink);
		},
		z1: (g, add) => zs(add, 1, ink),
		z2: (g, add) => zs(add, 2, ink),
		z3: (g, add) => zs(add, 3, ink),
		think1: (g) => think(g, 1, ink),
		think2: (g) => think(g, 2, ink),
		think3: (g) => think(g, 3, ink),
		clock1: (g) => clock(g, 0, ink, p.sun),
		clock2: (g) => clock(g, 1, ink, p.sun),
		clock3: (g) => clock(g, 2, ink, p.sun),
		clock4: (g) => clock(g, 3, ink, p.sun),
		steam1: (g) => steam(g, 1, ink),
		steam2: (g) => steam(g, 2, ink),
		papers1: (g) => {
			sheet(g, -58, -60, -0.4, ink);
			sheet(g, 52, -74, 0.3, ink);
		},
		papers2: (g) => {
			sheet(g, -64, -78, 0.25, ink);
			sheet(g, 60, -56, -0.35, ink);
			sheet(g, -40, -96, -0.1, ink);
		},
		hit: (g) => {
			// The strike, on the nail's head (drawn as if the body stood at y = 0; see WORK).
			const x = WORK.nailX;
			const y = WORK.nailTop[0] + 15;
			for (const a of [-2.7, -2.1, -1.05, -0.45]) line(g, [x + Math.cos(a) * 7, y + Math.sin(a) * 7, x + Math.cos(a) * 13, y + Math.sin(a) * 13], 2, ink);
		},
		cobweb: (g) => {
			// A web strung from the hat to the air, and a small spider.
			const cx = -58;
			const cy = -92;
			for (let i = 0; i <= 4; i++) {
				const a = Math.PI * 0.05 + (i / 4) * Math.PI * 0.45;
				line(g, [cx, cy, cx + Math.cos(a) * 40, cy + Math.sin(a) * 40], 1.1, ink);
			}
			for (const r of [12, 22, 32]) {
				const pts: number[] = [];
				for (let i = 0; i <= 4; i++) {
					const a = Math.PI * 0.05 + (i / 4) * Math.PI * 0.45;
					pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
				}
				line(g, pts, 1, ink);
			}
			line(g, [cx + 30, cy + 28, cx + 30, cy + 44], 0.9, ink);
			g.circle(cx + 30, cy + 47, 3).fill(ink);
		},
	};
	for (const f of FX) parts[`fx/${f}`] = fx[f];

	return { name: "paper", palette: p, parts };
}

function brick(g: Graphics, cx: number, cy: number, w: number, h: number, fill: number, ink: number) {
	g.roundRect(cx - w / 2, cy - h / 2, w, h, 2).fill(fill).stroke({ width: 2, color: ink });
	g.rect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, 2).fill({ color: 0xffffff, alpha: 0.4 });
}

function drop(g: Graphics, x: number, y: number, fill: number, ink: number, s = 1) {
	g.moveTo(x, y - 6 * s).quadraticCurveTo(x + 5 * s, y + 1 * s, x, y + 4 * s).quadraticCurveTo(x - 5 * s, y + 1 * s, x, y - 6 * s).fill(fill).stroke({ width: 1.4, color: ink });
}

function confetti(g: Graphics, v: number) {
	const cols = [0xff5c9a, 0xffd23f, 0x3d7dff, 0x2ecc71, 0xff8a1f];
	for (let i = 0; i < 9; i++) {
		const k = i * 37 + v * 13;
		const x = ((k * 29) % 140) - 70;
		const y = -78 - ((k * 17) % 50) + v * 4;
		g.poly(rotRect(x, y, 6, 3.2, (k % 7) * 0.45)).fill(cols[(i + v) % cols.length]!);
	}
}

function rotRect(x: number, y: number, w: number, h: number, a: number): number[] {
	const c = Math.cos(a);
	const s = Math.sin(a);
	const pts: number[] = [];
	for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const) pts.push(x + dx * c - dy * s, y + dx * s + dy * c);
	return pts;
}

function burst(g: Graphics, x: number, y: number, ink: number) {
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		line(g, [x + Math.cos(a) * 9, y + Math.sin(a) * 9, x + Math.cos(a) * 16, y + Math.sin(a) * 16], 2.2, ink);
	}
}

function sparkle(g: Graphics, x: number, y: number, r: number, fill: number, ink: number) {
	g.star(x, y, 4, r, r * 0.38, 0).fill(fill).stroke({ width: 1.4, color: ink });
}

function zs(add: (c: Container) => void, n: number, ink: number) {
	for (let i = 0; i < n; i++) {
		const t = text("z", 11 + i * 4, ink);
		t.position.set(42 + i * 10, -84 - i * 13);
		add(t);
	}
}

function think(g: Graphics, n: number, ink: number) {
	const dots = [[40, -78, 3], [50, -90, 4.5], [64, -106, 6]] as const;
	for (let i = 0; i < n; i++) {
		const [x, y, r] = dots[i]!;
		g.circle(x, y, r).fill(0xffffff).stroke({ width: 1.8, color: ink });
	}
}

function clock(g: Graphics, step: number, ink: number, sun: number) {
	const x = 62;
	const y = -100;
	g.circle(x, y, 13).fill(0xffffff).stroke({ width: W.part, color: ink });
	g.circle(x, y - 15, 3).fill(sun).stroke({ width: 1.4, color: ink });
	const a = -Math.PI / 2 + (step * Math.PI) / 2;
	line(g, [x, y, x + Math.cos(a) * 9, y + Math.sin(a) * 9], 2.2, ink);
	line(g, [x, y, x + 5, y], 2.2, ink);
}

function steam(g: Graphics, v: number, ink: number) {
	for (const side of [-1, 1]) {
		const x = side * (24 + v * 4);
		const y = -84 - v * 6;
		g.moveTo(x, y).bezierCurveTo(x + 6 * side, y - 6, x - 4 * side, y - 12, x + 2 * side, y - 18).stroke({ width: 3, color: 0xffffff, cap: "round" });
		g.moveTo(x, y).bezierCurveTo(x + 6 * side, y - 6, x - 4 * side, y - 12, x + 2 * side, y - 18).stroke({ width: 1.2, color: ink, cap: "round", alpha: 0.5 });
		g.circle(x + 2 * side, y - 22, 4 + v).fill(0xffffff).stroke({ width: 1.2, color: ink, alpha: 0.5 });
	}
}

function sheet(g: Graphics, x: number, y: number, a: number, ink: number) {
	g.poly(rotRect(x, y, 13, 16, a)).fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
}
