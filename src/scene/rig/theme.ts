// The paper theme: a palette and a painter for every part texture. Painters draw in rig units
// (the body is 100 wide; see vocab.ts) in each part's own space, and the atlas bakes them once. A
// theme reskins the rig by supplying different painters or colours for the same part names; poses
// and frames never change. Part names are `<layer>/<variant>`; docs/decisions.md lists them.
import { Container, Graphics, Text } from "pixi.js";
import { EYES, FX, HELD, MOUTHS, WORKS } from "./vocab";
import { paintAccessories } from "./accessories";
import { ROLES, type Role } from "./roles";
import { ANCHORS, AT, BELL, BELL_BASE, HANDOFF, PLANNER, STATION, STICKY, TRAY, WORK, handAt } from "./reach";

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

// The rig's geometry (where limbs attach, where the work and the stations stand) lives in reach.ts,
// Pixi-free, so the tests can check the arms against it.
export { ANCHORS, WORK, STATION } from "./reach";

/** Station colours: a manila folder, a red mark, the phone's handset, cabinet and copier enamel. */
export const MANILA = 0xf0cf8a;
export const RED = 0xff4d5e;
const HANDSET = 0xff8a7a;
const CABINET = 0xc3cadb;
const COPIER = 0xdfe4ef;
/** Wave 2: a sticky note's yellow, the ticket's pink, the bell's brass. */
const STICKY_Y = 0xffe66b;
const TICKET = 0xffc9b0;
const BRASS = 0xf2bd3c;

/** Stroke weights. */
export const W = { body: 3.4, part: 2.6, fine: 1.8 };

export type Painter = (g: Graphics, add: (c: Container) => void) => void;

export interface Theme {
	name: string;
	palette: Palette;
	/** Every part texture the atlas bakes, by name. */
	parts: Record<string, Painter>;
}

// Helpers ---------------------------------------------------------------------------------------

export const line = (g: Graphics, pts: number[], width: number, color: number) => {
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

export const text = (s: string, size: number, color: number, weight: "700" | "800" | "900" = "900") => {
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
	// The eyes are big, glossy and low (reach.ts ANCHORS): a rest eye 20 wide with a violet glow in
	// its lower half and two highlights; the rest of the set drawn to match, `shine` and `tear`
	// bigger and sparklier still. The puppet mirrors the right eye (but not `side`), so `squint`
	// points at the nose and `tear` runs from the outer edge.
	const RX = 10;
	const RY = 12.4;
	const GLOW = 0x7b68e0;
	/** The part of the rest ellipse below a lid line at `lid`, as a polygon. */
	const lower = (lid: number): number[] => {
		const t0 = Math.asin(lid / RY);
		const pts: number[] = [];
		for (let k = 0; k <= 24; k++) {
			const t = t0 + ((Math.PI - 2 * t0) * k) / 24;
			pts.push(RX * Math.cos(t), RY * Math.sin(t));
		}
		return pts;
	};
	const glossy = (g: Graphics, glow: number, gx: number, gy: number, k: number) => {
		g.ellipse(0, RY * 0.5, gx, gy).fill({ color: glow, alpha: 0.9 });
		g.circle(3, -4.5, 3.7 * k).fill(0xffffff);
		g.circle(-3.6, 3.7, 1.7 * k).fill(0xffffff);
	};
	const twinkle = (g: Graphics, x: number, y: number, r: number) => {
		const i = r * 0.3;
		g.poly([x, y - r, x + i, y - i, x + r, y, x + i, y + i, x, y + r, x - i, y + i, x - r, y, x - i, y - i]).fill(0xffffff);
	};
	const eye: Record<(typeof EYES)[number], Painter> = {
		rest: (g) => {
			g.ellipse(0, 0, RX, RY).fill(ink);
			g.ellipse(0, RY * 0.5, RX * 0.62, RY * 0.33).fill({ color: GLOW, alpha: 0.85 });
			g.circle(3, -4.5, 3.7).fill(0xffffff);
			g.circle(-3.6, 3.7, 1.7).fill(0xffffff);
		},
		wide: (g) => {
			g.ellipse(0, 0, 11.2, 13).fill(0xffffff).stroke({ width: W.part, color: ink });
			g.circle(0, 1, 4.2).fill(ink);
			g.circle(1.4, -0.5, 1.4).fill(0xffffff);
		},
		shine: (g) => {
			g.ellipse(0, 0, 11, 13.4).fill(ink);
			glossy(g, 0x8f7bff, 7.4, 5, 1.25);
			twinkle(g, 2.2, 4, 2.9);
		},
		tear: (g) => {
			g.ellipse(0, 0, 11, 13.4).fill(ink);
			glossy(g, p.tear, 8, 5.2, 1.25);
			g.moveTo(-5, 11.8).quadraticCurveTo(-8.4, 18.3, -5, 20.8).quadraticCurveTo(-1.6, 18.3, -5, 11.8).fill(p.tear).stroke({ width: 1.3, color: ink });
		},
		squint: (g) => line(g, [-9, -6.2, 6, 0, -9, 6.2], 4, ink),
		happy: (g) => {
			g.moveTo(-10, 3.7).quadraticCurveTo(0, -11.8, 10, 3.7).stroke({ width: 4, color: ink, cap: "round" });
		},
		half: (g) => {
			g.poly(lower(-1)).fill(ink);
			g.ellipse(0, 6.4, 5.6, 3.2).fill({ color: GLOW, alpha: 0.85 });
			g.circle(3, 2.5, 2).fill(0xffffff);
			line(g, [-11.5, -1, 11.5, -1], 3.6, ink);
		},
		star: (g) => {
			g.star(0, 0, 5, 12, 5.4, 0).fill(p.sun).stroke({ width: 2.4, color: ink, join: "round" });
		},
		side: (g) => {
			g.poly(lower(-2.5)).fill(0xffffff).stroke({ width: 2.4, color: ink, join: "round" });
			g.circle(4.2, 2.7, 4.6).fill(ink);
			g.circle(5.6, 1, 1.4).fill(0xffffff);
			line(g, [-11.5, -2.5, 11.5, -2.5], 3.6, ink);
		},
		closed: (g) => {
			g.moveTo(-10, -0.6).quadraticCurveTo(0, 8.7, 10, -0.6).stroke({ width: 3.6, color: ink, cap: "round" });
		},
		dead: (g) => {
			line(g, [-8, -8, 8, 8], 4, ink);
			line(g, [8, -8, -8, 8], 4, ink);
		},
	};
	for (const e of EYES) parts[`eye/${e}`] = eye[e];

	// The mouth is small and tucked between the eyes; the big ones (grin, shout, yawn) stay clear of
	// the eyes above and the belly piece below.
	const mouth: Record<(typeof MOUTHS)[number], Painter> = {
		rest: (g) => {
			g.moveTo(-3.6, -1.4).quadraticCurveTo(0, 3.4, 3.6, -1.4).stroke({ width: 2.4, color: ink, cap: "round" });
		},
		flat: (g) => line(g, [-4.2, 0, 4.2, 0], 2.4, ink),
		small: (g) => {
			g.ellipse(0, 0, 2.4, 2.8).fill(ink);
		},
		pout: (g) => {
			g.moveTo(-3.6, 1.4).quadraticCurveTo(0, -2.6, 3.6, 1.4).stroke({ width: 2.4, color: ink, cap: "round" });
		},
		grin: (g) => {
			g.moveTo(-6.2, -2).lineTo(6.2, -2).quadraticCurveTo(5.8, 6, 0, 6).quadraticCurveTo(-5.8, 6, -6.2, -2).fill(ink);
			g.ellipse(0, 3.8, 3, 1.8).fill(p.tongue);
			g.rect(-4, -2, 8, 1.6).fill(0xffffff);
		},
		open: (g) => {
			g.ellipse(0, 1, 4, 4.8).fill(ink);
			g.ellipse(0, 3.3, 2.4, 1.6).fill(p.tongue);
		},
		wobble: (g) => line(g, [-6, 1, -4, -1.2, -2, 1, 0, -1.2, 2, 1, 4, -1.2, 6, 0.6], 2.2, ink),
		shout: (g) => {
			g.moveTo(-6.8, -2.5).lineTo(6.8, -2.5).quadraticCurveTo(6.2, 7, 0, 7).quadraticCurveTo(-6.2, 7, -6.8, -2.5).fill(ink);
			g.ellipse(0, 4.6, 3.6, 2.1).fill(p.tongue);
		},
		smirk: (g) => {
			g.moveTo(-4.4, 1).quadraticCurveTo(1, 2.6, 4.8, -2.2).stroke({ width: 2.4, color: ink, cap: "round" });
		},
		drool: (g) => {
			g.ellipse(0, 0, 3, 2.3).fill(ink);
			g.moveTo(2.2, 1).quadraticCurveTo(4.6, 6.6, 2.8, 8.4).quadraticCurveTo(1, 6.6, 2.2, 1).fill(p.tear);
		},
		yawn: (g) => {
			g.ellipse(0, 1, 3.6, 5.6).fill(ink);
			g.ellipse(0, 4.1, 2.2, 1.5).fill(p.tongue);
		},
		blep: (g) => {
			g.moveTo(-3.6, -1.4).quadraticCurveTo(0, 3.4, 3.6, -1.4).stroke({ width: 2.4, color: ink, cap: "round" });
			g.roundRect(-0.4, 0.6, 4, 4, 1.8).fill(p.tongue).stroke({ width: 1.2, color: ink });
		},
		frown: (g) => {
			g.arc(0, 3.6, 4, Math.PI + 0.4, -0.4).stroke({ width: 2.4, color: ink, cap: "round" });
		},
	};
	for (const m of MOUTHS) parts[`mouth/${m}`] = mouth[m];

	parts.brow = (g) => line(g, [-5.4, 0, 5.4, 0], 3, ink);
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
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, A.eyeY, 15).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 2.4, color: ink });
		line(g, [-5.5, A.eyeY - 2, 5.5, A.eyeY - 2], 2.2, ink);
	};
	// A regular's accessories (accessories.ts), the same in every theme.
	paintAccessories(parts, p);
	parts["wear/binoc"] = (g) => {
		for (const x of [-A.eyeX + 2, A.eyeX - 2]) {
			g.roundRect(x - 12, A.eyeY - 14, 24, 27, 8).fill(0x3a3f5c).stroke({ width: W.part, color: ink });
			g.circle(x, A.eyeY - 0.5, 7.4).fill(0x9fe3ff).stroke({ width: 1.6, color: ink });
		}
		g.rect(-7.5, A.eyeY - 4, 15, 6).fill(0x3a3f5c);
	};

	/** A clipboard held by its edge, on the hand's left (`side` -1, the left hand's board) or right. */
	const clipboard = (g: Graphics, side: -1 | 1) => {
		const x = (v: number) => (side < 0 ? v : -v);
		g.roundRect(Math.min(x(-24), x(-4)), -20, 20, 27, 2.5).fill(0xc99a6b).stroke({ width: 2.2, color: ink });
		g.rect(Math.min(x(-21.5), x(-6.5)), -16, 15, 21).fill(0xffffff);
		for (const y of [-11, -6, -1, 3]) line(g, [x(-19), y, x(-9), y], 1.4, 0x9aa3bd);
		g.roundRect(Math.min(x(-18), x(-10)), -23, 8, 5, 1.5).fill(p.steel).stroke({ width: 1.4, color: ink });
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
		clip: (g) => clipboard(g, -1),
		clipF: (g) => clipboard(g, 1),
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
		// At the stations. Business ends are where reach.ts GRIP says, so the arms land them.
		folder: (g) => {
			// A closed manila folder held up by its bottom edge, a sheet's edge showing at the top.
			g.roundRect(1, -26, 8, 5, 1.5).fill(MANILA).stroke({ width: 1.6, color: ink });
			line(g, [-6, -23.5, 8, -23.5], 1.4, 0xffffff);
			g.roundRect(-8, -23, 18, 23, 1.5).fill(MANILA).stroke({ width: W.fine + 0.2, color: ink });
			line(g, [-5, -6, 7, -6], 1.2, 0xc99a5a);
		},
		card: (g) => {
			// An index card: a red rule along the top and two lines.
			g.roundRect(-8, -15, 16, 11, 1).fill(0xffffff).stroke({ width: 1.6, color: ink });
			line(g, [-6, -12.3, 6, -12.3], 1.2, RED);
			for (const y of [-9.5, -7]) line(g, [-6, y, 4, y], 1, 0x9aa3bd);
		},
		receiver: (g) => {
			// A telephone handset held at its middle, earpiece and mouthpiece facing the face (to the
			// right of the left hand), and the start of its curly cord: the rest of the cord runs to the
			// phone's base with the notepad (notepad's phoneCord), since the base doesn't ride the hand.
			const zig: number[] = [];
			for (let i = 0; i <= 4; i++) zig.push(1 + (i % 2 ? 2.4 : -2.4) + i * 0.4, 13 + i * 2.5);
			line(g, zig, 1.3, ink);
			g.roundRect(-2.6, -11, 5.2, 22, 2.4).fill(HANDSET).stroke({ width: 1.8, color: ink });
			g.roundRect(-3, -16, 9, 6.5, 2.8).fill(HANDSET).stroke({ width: 1.8, color: ink });
			g.roundRect(-3, 9.5, 9, 6.5, 2.8).fill(HANDSET).stroke({ width: 1.8, color: ink });
		},
		pencil: (g) => {
			// Held writing: the point down and out at GRIP.pencil.
			line(g, [-4, -10, 2.6, 5.4], 4.6, ink);
			line(g, [-4, -10, 2.6, 5.4], 2.6, p.sun);
			g.circle(-4.3, -10.6, 2).fill(0xff9eb1).stroke({ width: 1.2, color: ink });
			line(g, [2.6, 5.4, 4, 8], 2.4, p.wood);
			line(g, [3.5, 6.9, 4, 8], 1.4, ink);
		},
		stamp: (g) => stamp(g, 0x7a7f92),
		stampG: (g) => stamp(g, p.go),
		stampR: (g) => stamp(g, RED),
		envelope: (g) => envelope(g, 0, -8, 0),
		crumple: (g) => {
			// A jammed sheet, balled up: a lumpy white ball with creases.
			const r = [6.4, 5.2, 6.8, 5.6, 6.2, 4.9, 6.6, 5.4, 6, 5.1];
			const pts = r.flatMap((v, i) => [Math.cos((i / r.length) * Math.PI * 2) * v, -6 + Math.sin((i / r.length) * Math.PI * 2) * v]);
			g.poly(pts).fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
			line(g, [-3, -9, 0, -6, -1, -2], 1, 0x9aa3bd);
			line(g, [1, -10, 3, -5, 2, -2], 1, 0x9aa3bd);
		},
		slip: (g) => {
			// A sheet slid flat off the pile, held by its near edge, seen at a slant.
			g.poly([0, -1.5, 16, -3.5, 17.5, 0.5, 1, 2.5]).fill(0xffffff).stroke({ width: 1.4, color: ink, join: "round" });
		},
		feed1: (g) => feedSheet(g, 12),
		feed2: (g) => feedSheet(g, 7),
		feed3: (g) => feedSheet(g, 3),
		ticket: (g, add) => {
			// A tear-off ticket pinched by its corner: notched ends where it tore off the roll, and
			// its number. (One number for everyone: the queue's order is where they stand.)
			const l = -3;
			const r = 14;
			const t = -13;
			const b = -2;
			const pts: number[] = [l, t, r, t];
			for (let k = 1; k <= 4; k++) pts.push(r + (k % 2 ? -1.4 : 0), t + ((b - t) * k) / 4);
			pts.push(l, b);
			for (let k = 3; k >= 1; k--) pts.push(l + (k % 2 ? 1.4 : 0), t + ((b - t) * k) / 4);
			g.poly(pts).fill(TICKET).stroke({ width: 1.4, color: ink, join: "round" });
			line(g, [l + 3, t + 2.4, r - 3, t + 2.4], 0.9, RED);
			const n = text("47", 6.4, ink);
			n.position.set((l + r) / 2, (t + b) / 2 + 1.2);
			add(n);
		},
		sticky: (g) => stickyNote(g, 0, -12, false),
		stickyFlap: (g) => stickyNote(g, 0, -12, true),
		finger: (g) => {
			// White, so the puppet tints it the hand's colour: a finger out front, the thumb cocked.
			g.roundRect(2, -3.2, 11, 5.4, 2.7).fill(0xffffff).stroke({ width: 1.8, color: ink });
			g.roundRect(-2.2, -10.5, 4.8, 8, 2.4).fill(0xffffff).stroke({ width: 1.8, color: ink });
		},
		folderOut: (g) => {
			// A closed folder held out flat by its near edge (HANDOFF.folder): its face, the tab on
			// the far side, a sheet peeking out at the top.
			const { from: a, to: b } = HANDOFF.folder;
			g.rect(a + 2, -12.5, b - a - 5, 2).fill(0xffffff).stroke({ width: 1, color: ink });
			g.roundRect(b - 7, -14.5, 6, 4, 1.4).fill(MANILA).stroke({ width: 1.3, color: ink });
			g.roundRect(a, -11, b - a, 22, 1.8).fill(MANILA).stroke({ width: W.fine + 0.2, color: ink });
			line(g, [a + 3, 6, b - 3, 6], 1.1, 0xc99a5a);
			g.rect(a + 4, -6, 6, 3).fill(0xffffff).stroke({ width: 0.9, color: ink });
		},
		hand: (g) => {
			// A hand of cards, fanned out from the palm (the factory's card game on a pallet).
			for (const [r, dx] of [[-0.42, -4], [0, 0], [0.42, 4]] as const) playingCard(g, dx + Math.sin(r) * 9, -8, 10, 15, r, dx === 0 ? 0xe8423a : ink);
		},
		folderTuck: (g) => {
			// The folder pinched upright between the forearm and the body, its tab showing at the top.
			g.roundRect(-8.5, -24, 4, 4, 1.2).fill(MANILA).stroke({ width: 1.2, color: ink });
			g.poly([-9, -21, -2, -22, -1, 4, -8, 5]).fill(MANILA).stroke({ width: W.fine, color: ink, join: "round" });
			line(g, [-6, -18, -6.5, 1], 1, 0xc99a5a);
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
	// An open folder held in both hands like the blueprint (ARMS.sheet on its top corners), and a
	// page of it turning: lifted by its corner (ARMS.flip), then laid over to show the next.
	const folder = (g: Graphics, step: 0 | 1 | 2) => {
		g.roundRect(18, -17, 9, 5, 1.5).fill(MANILA).stroke({ width: 1.6, color: ink });
		g.roundRect(-29, -13, 29, 23, 2).fill(MANILA).stroke({ width: W.fine + 0.4, color: ink });
		g.roundRect(0, -13, 29, 23, 2).fill(MANILA).stroke({ width: W.fine + 0.4, color: ink });
		const page = (x: number, lines: number[]) => {
			g.rect(x, -11, 24, 19).fill(0xffffff).stroke({ width: 1.2, color: ink });
			lines.forEach((w, i) => line(g, [x + 3, -7 + i * 3.6, x + 3 + w, -7 + i * 3.6], 1.2, 0x9aa3bd));
		};
		const A = [16, 12, 17, 9];
		const B = [10, 17, 14, 15];
		const C = [17, 8, 13, 16];
		page(-26, step === 2 ? B : A);
		page(2, step === 0 ? B : C);
		if (step === 1) {
			g.poly([1, -11, 19, -21, 14, 3, 1, 8]).fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [5, -10, 13, -14], 1, 0x9aa3bd);
			line(g, [5, -5, 12, -8], 1, 0x9aa3bd);
		}
		line(g, [0, -13, 0, 10], 1.4, 0xc99a5a);
	};
	parts["prop/folder"] = (g) => folder(g, 0);
	parts["prop/folderT"] = (g) => folder(g, 1);
	parts["prop/folder2"] = (g) => folder(g, 2);
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
	/** A pallet on the floor out front with a card game laid out on it; `slap` a card just played. */
	const pallet = (g: Graphics, slap: boolean) => {
		const l = WORK.benchL - 6;
		const r = WORK.benchR + 6;
		for (const x of [l + 2, (l + r) / 2 - 3, r - 8]) g.rect(x, -8, 6, 8);
		g.fill(0xb88a4c);
		g.roundRect(l, -12, r - l, 5, 1.5).fill(p.kraft).stroke({ width: W.fine, color: ink });
		g.rect(l, -8, r - l, 8).stroke({ width: W.fine, color: ink });
		for (const [x, rot] of [[l + 14, -0.2], [l + 30, 0.1]] as const) playingCard(g, x, -15, 8, 11, rot, ink);
		if (slap) {
			playingCard(g, r - 14, -15, 9, 12, 0, 0xe8423a);
			line(g, [r - 24, -24, r - 20, -20], 1.6, ink);
			line(g, [r - 4, -24, r - 8, -20], 1.6, ink);
		}
	};
	/** The vending machine out front: rows of snacks behind glass, a coin slot, the drop tray;
	 * `rock` it leans back from a kick; `drop` a snack has fallen into the tray. */
	const vending = (c: Graphics, rock: number, drop: boolean) => {
		const l = WORK.benchL - 4 + rock;
		const w = 50;
		c.roundRect(l, -104, w, 104, 4).fill(0xe8423a).stroke({ width: W.part, color: ink });
		c.rect(l + 5, -96, 30, 70).fill(0xcfe6f2).stroke({ width: W.fine, color: ink });
		for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) c.roundRect(l + 8 + k * 9, -91 + row * 17, 6, 9, 1.5).fill([p.sun, p.go, 0xff8a1f][(row + k) % 3]!);
		c.roundRect(l + 39, -90, 7, 12, 1.5).fill(p.steel).stroke({ width: 1.2, color: ink });
		c.rect(l + 41, -86, 3, 6).fill(ink);
		c.roundRect(l + 6, -20, 28, 10, 2).fill(ink);
		if (drop) c.roundRect(l + 12, -19, 12, 7, 1.5).fill(p.sun).stroke({ width: 1.2, color: ink });
		// Rocked by a kick: it shudders back, its near edge shaking.
		if (rock) for (const y of [-80, -56, -32]) line(c, [l - 7, y, l - 3, y + 5], 1.6, ink);
	};
	/** A playing card centred at (x, y), `w` by `h`, turned `r`, with a pip in `pip`. */
	const playingCard = (g: Graphics, x: number, y: number, w: number, h: number, r: number, pip: number) => {
		const c = Math.cos(r);
		const s = Math.sin(r);
		const at = (dx: number, dy: number) => [x + dx * c - dy * s, y + dx * s + dy * c];
		g.poly([...at(-w / 2, -h / 2), ...at(w / 2, -h / 2), ...at(w / 2, h / 2), ...at(-w / 2, h / 2)]).fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
		const [px, py] = at(0, -h / 6);
		g.circle(px!, py!, 1.6).fill(pip);
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
		cabinet: (g) => drawer(g, "shut"),
		drawer: (g) => drawer(g, "out"),
		drawerGap: (g) => drawer(g, "gap"),
		cards: (g) => cardTray(g, 0, false),
		cardsA: (g) => cardTray(g, AT.cards[1].x, false),
		cardsB: (g) => cardTray(g, AT.cards[2].x, false),
		cardsGap: (g) => cardTray(g, AT.cards[2].x, true),
		copier: (g) => copier(g, {}),
		lidHalf: (g) => copier(g, { lid: 22 }),
		lidUp: (g) => copier(g, { lid: 78 }),
		lidSheet: (g) => copier(g, { lid: 78, sheet: true }),
		scan: (g) => copier(g, { light: "go", glow: true }),
		copy1: (g) => copier(g, { light: "go", glow: true, copies: 1 }),
		copy2: (g) => copier(g, { copies: 2 }),
		jam: (g) => copier(g, { light: "red", jam: "corner" }),
		door: (g) => copier(g, { light: "red", door: true, jam: "inside" }),
		doorTug: (g) => copier(g, { light: "red", door: true, jam: "tugged" }),
		doorOpen: (g) => copier(g, { light: "red", door: true }),
		jammed: (g) => copier(g, { light: "red" }),
		kicked: (g) => copier(g, { light: "red", bang: true }),
		forms: (g) => forms(g, p.go),
		formsOk: (g) => forms(g, p.go, "ok"),
		formsSlid: (g) => forms(g, p.go, "ok", true),
		formsR: (g) => forms(g, RED),
		formsNo: (g) => forms(g, RED, "no"),
		note0: (g) => notepad(g, 0),
		note1: (g) => notepad(g, 1),
		note2: (g) => notepad(g, 2),
		note3: (g) => notepad(g, 3),
		noteFlip: (g) => notepad(g, 0, true),
		outbox: (g, add) => add(outbox(g, 0)),
		mail1: (g, add) => add(outbox(g, 1)),
		mail2: (g, add) => add(outbox(g, 2)),
		shred: (g) => shredder(g, 5, false),
		shred4: (g) => shredder(g, 4, false),
		shredBuzz: (g) => shredder(g, 4, true),
		tray1: (g) => inTray(g, 3),
		tray2: (g) => inTray(g, 7),
		tray3: (g) => inTray(g, 14),
		tray4: (g) => inTray(g, TRAY_FULL),
		tray4L: (g) => inTray(g, TRAY_FULL, -1),
		tray4R: (g) => inTray(g, TRAY_FULL, 1),
		traySlide: (g) => inTray(g, TRAY_FULL - 1, 1, "slide"),
		trayDrop: (g) => inTray(g, TRAY_FULL - 1, 0, "drop"),
		bell: (g) => bell(g, 0),
		bellDing: (g) => bell(g, 2),
		bellHum: (g) => bell(g, 1),
		stickyOn: (g) => {
			// Pressed onto the planner: flat, a soft shadow under it.
			g.rect(PLANNER.x - STICKY / 2 + 1.2, PLANNER.y - STICKY / 2 + 1.5, STICKY, STICKY).fill({ color: p.shadow, alpha: 0.14 });
			stickyNote(g, PLANNER.x, PLANNER.y, false);
		},
		jabbed: (g) => copier(g, { light: "red", pressed: true }),
		kickSpit: (g) => copier(g, { light: "red", bang: true, jam: "corner" }),
		pallet: (g) => pallet(g, false),
		palletSlap: (g) => pallet(g, true),
		vending: (g) => vending(g, 0, false),
		vendingRock: (g) => vending(g, 3, false),
		vendingDrop: (g) => vending(g, 0, true),
	};
	for (const w of WORKS) parts[`work/${w}`] = work[w];

	// Station parts, laid out around the working point (reach.ts STATION, AT) ----------------------
	const S = STATION;
	const at = (q: { x: number; y: number }) => ({ x: S.x + q.x, y: S.y + q.y });

	/** The filing cabinet's top drawer: shut (its bar handle's near end on the working point), or
	 * pulled out toward the viewer, lower and a little bigger, its folder tabs showing; `gap` is
	 * missing the folder the hand took. */
	const drawer = (g: Graphics, state: "shut" | "out" | "gap") => {
		if (state === "shut") {
			g.roundRect(S.x - 5, S.y - 6, 30, 13, 2).fill(CABINET).stroke({ width: W.fine + 0.4, color: ink });
			g.rect(S.x + 6, S.y - 4.4, 8, 3.2).fill(0xffffff).stroke({ width: 1, color: ink });
			g.roundRect(S.x - 1, S.y - 1.3, 20, 2.6, 1.3).fill(p.steel).stroke({ width: 1.4, color: ink });
			return;
		}
		g.rect(S.x - 6, S.y - 6, 32, 5).fill(0x4a5072).stroke({ width: 1.2, color: ink });
		const tabs = [MANILA, 0xbcd6ff, MANILA, 0xffc2d6, MANILA, 0xc8f0d8];
		tabs.forEach((c, i) => {
			const x = S.x - 3 + i * 5;
			if (state === "gap" && i === 3) return;
			g.roundRect(x, S.y - 11, 4.4, 7, 1).fill(c).stroke({ width: 1, color: ink });
		});
		const o = AT.drawerOut;
		g.roundRect(S.x - 7, S.y - 2, 34, 14, 2).fill(CABINET).stroke({ width: W.fine + 0.4, color: ink });
		g.rect(S.x + 6, S.y + 0.4, 8, 3.2).fill(0xffffff).stroke({ width: 1, color: ink });
		g.roundRect(S.x + o.x - 1, S.y + o.y + 2.2, 20, 2.6, 1.3).fill(p.steel).stroke({ width: 1.4, color: ink });
	};

	/** The card catalogue's tray, pulled out: a row of cards on edge. Cards nearer than `upTo` are
	 * flicked forward (leaning toward the character), the fingertip's place; `gap` has the card at
	 * the fingertip pulled out. */
	const cardTray = (g: Graphics, upTo: number, gap: boolean) => {
		for (let i = 0; i < 11; i++) {
			const x = S.x + i * 2;
			if (gap && Math.abs(i * 2 - (upTo + 1)) < 1) continue;
			const a = i * 2 < upTo ? -0.42 : 0;
			const h = 10;
			const cx = x + (Math.sin(a) * h) / 2;
			const cy = S.y - 1 - (Math.cos(a) * h) / 2;
			g.poly(rotRect(cx, cy, 1.7, h, a)).fill(i % 4 === 2 ? 0xfff3cf : 0xffffff).stroke({ width: 0.8, color: ink });
		}
		g.roundRect(S.x - 3, S.y - 1, 26, 9, 1.5).fill(p.wood).stroke({ width: W.fine + 0.2, color: ink });
		g.rect(S.x + 7, S.y + 0.8, 6, 3).fill(p.sun).stroke({ width: 1, color: ink });
		g.circle(S.x + 10, S.y + 5.6, 1.6).stroke({ width: 1.2, color: ink });
	};

	/** The copier's moving parts: its lid (shut, or up `lid` degrees about its hinge), the glass and
	 * what's on it, the start button and status light, the jam door, the out-tray and its copies. The
	 * office draws the copier's body under them. */
	const copier = (
		g: Graphics,
		o: { lid?: number; sheet?: boolean; light?: "go" | "red"; glow?: boolean; copies?: 1 | 2; door?: boolean; jam?: "corner" | "inside" | "tugged"; bang?: boolean; pressed?: boolean },
	) => {
		const lidLen = 30;
		// The out-tray on the far side, and the copies in it.
		g.poly([S.x + 36, S.y + 8, S.x + 52, S.y + 5, S.x + 52.5, S.y + 7.5, S.x + 36, S.y + 11]).fill(COPIER).stroke({ width: 1.6, color: ink, join: "round" });
		if (o.copies === 1) g.poly([S.x + 34, S.y + 6.5, S.x + 45, S.y + 4.6, S.x + 45.4, S.y + 6.6, S.x + 34, S.y + 8.6]).fill(0xffffff).stroke({ width: 1.2, color: ink });
		if (o.copies === 2) {
			for (let k = 0; k < 3; k++) {
				const d = -k * 1.3;
				g.poly([S.x + 38, S.y + 8 + d, S.x + 51, S.y + 5.6 + d, S.x + 51.3, S.y + 6.8 + d, S.x + 38, S.y + 9.2 + d]).fill(0xffffff).stroke({ width: 1, color: ink });
			}
		}
		// The control plate: the start button and the status light.
		const b = at(AT.button);
		g.roundRect(b.x - 4, b.y - 3, 15, 6, 1.5).fill(0x56628a).stroke({ width: 1.2, color: ink });
		// Jabbed, the button sinks into the plate and the red light flashes harder.
		g.circle(b.x, b.y + (o.pressed ? 0.6 : 0), o.pressed ? 1.8 : 2.4).fill(o.light === "go" ? p.go : o.pressed ? 0x9aa3bd : 0xcfd6e6).stroke({ width: 1.2, color: ink });
		g.circle(b.x + 7, b.y, o.pressed ? 2 : 1.5).fill(o.light === "red" ? RED : o.light === "go" ? p.go : 0x3a3f5c).stroke({ width: 1, color: ink });
		const [r0, r1] = o.pressed ? [3.4, 7] : [3, 5];
		const rays = o.pressed ? [-2.8, -2.1, -1.57, -1.05, -0.35] : [-2.4, -1.57, -0.74];
		if (o.light === "red") for (const a of rays) line(g, [b.x + 7 + Math.cos(a) * r0, b.y + Math.sin(a) * r0, b.x + 7 + Math.cos(a) * r1, b.y + Math.sin(a) * r1], 1, RED);
		// The jam door, shut or dropped open on its bottom hinge.
		const d = at(AT.door);
		const dl = d.x - 5;
		const dt = S.y + 12;
		if (o.door) {
			g.rect(dl, dt, 24, 11).fill(0x3a3f5c).stroke({ width: 1.4, color: ink });
			for (const x of [dl + 6, dl + 16]) g.circle(x, dt + 7, 2.2).fill(p.steel).stroke({ width: 1, color: ink });
			g.poly([dl, dt + 11, dl + 24, dt + 11, dl + 27, dt + 17, dl - 3, dt + 17]).fill(COPIER).stroke({ width: 1.6, color: ink, join: "round" });
		} else {
			g.roundRect(dl, dt, 24, 11, 1.5).stroke({ width: 1.2, color: ink, alpha: 0.7 });
			g.rect(d.x - 1.5, d.y - 1, 3, 2).fill(p.steel).stroke({ width: 1, color: ink });
		}
		// The jammed sheet: a crumpled corner at the door's seam, balled up inside, or tugged out.
		const j = at(AT.jam);
		if (o.jam === "corner") g.poly([j.x - 3, dt + 0.5, j.x - 1, dt - 4, j.x + 2, dt - 2.5, j.x + 4, dt - 5, j.x + 5, dt + 0.5]).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "inside") g.poly([j.x - 4, j.y - 3, j.x, j.y - 5, j.x + 4, j.y - 2, j.x + 3, j.y + 3, j.x - 2, j.y + 4, j.x - 5, j.y + 1]).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "tugged") {
			const e = at(AT.jamOut);
			const top: number[] = [];
			const bot: number[] = [];
			for (let i = 0; i <= 6; i++) {
				const x = j.x + 3 + ((e.x - j.x - 3) * i) / 6;
				top.push(x, j.y - 3 + (i % 2 ? -1.2 : 0.4));
				bot.unshift(x, j.y + 3 + (i % 2 ? 1 : -0.4));
			}
			g.poly([...top, ...bot]).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		}
		// The glass under a lifted lid, and the original laid on it.
		if (o.lid) {
			g.rect(S.x, S.y - 1.5, lidLen - 2, 1.5).fill(0x9fe3ff).stroke({ width: 1, color: ink });
			if (o.sheet) g.rect(S.x + 4, S.y - 3, 18, 1.6).fill(0xffffff).stroke({ width: 1, color: ink });
		}
		// The lid, about its hinge at the far end.
		const hx = S.x + lidLen;
		const hy = S.y - 2;
		g.save();
		g.translateTransform(-hx, -hy).rotateTransform(((o.lid ?? 0) * Math.PI) / 180).translateTransform(hx, hy);
		g.roundRect(S.x - 1, S.y - 4, lidLen + 1, 4, 1.5).fill(COPIER).stroke({ width: W.fine + 0.2, color: ink });
		g.rect(S.x - 1, S.y - 3, 3, 2).fill(0x9aa3bd);
		g.restore();
		if (o.glow) {
			// The scan light, leaking out under the lid.
			g.rect(S.x, S.y - 0.6, lidLen - 2, 1.4).fill(0xd8ffe6);
			for (const x of [S.x - 2, S.x + lidLen + 1]) line(g, [x, S.y - 1, x + (x < S.x ? -4 : 4), S.y - 2], 1.2, p.go);
			g.ellipse(S.x + lidLen / 2, S.y, lidLen / 2 + 3, 3).fill({ color: 0xb8ffd0, alpha: 0.35 });
		}
		if (o.bang) {
			// Kicked: an impact at its near foot, and the whole thing rattling.
			burstAt(g, S.x - 4, -7, 3, 7, ink);
			for (const [x, y] of [[S.x - 6, S.y + 2], [S.x + lidLen + 6, S.y - 4]] as const) {
				g.arc(x, y, 4, -2.2, -1).stroke({ width: 1.2, color: ink });
				g.arc(x, y, 7, -2.2, -1).stroke({ width: 1.2, color: ink, alpha: 0.6 });
			}
		}
	};

	/** The stamp desk: an ink pad (`ink` its colour), a pad of forms, and the done pile. `mark` is
	 * on the top form once it's stamped; `slid` has it pushed onto the done pile, the next form
	 * showing under it. Forms are drawn at a slant so their faces (and the marks) show. */
	const forms = (g: Graphics, inkColour: number, mark?: "ok" | "no", slid = false) => {
		const form = (x: number, y: number, m?: "ok" | "no") => {
			g.poly([x - 8.5, y + 1, x + 8, y + 1, x + 11, y - 5.5, x - 5.5, y - 5.5]).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
			line(g, [x - 4.5, y - 4.4, x + 7, y - 4.4], 0.8, 0x9aa3bd);
			if (m) stampMark(g, x + 1, y - 2, m === "ok" ? p.go : RED, m);
		};
		// The done pile, far side, a few stamped forms on it.
		const pile = at({ x: AT.form.x + 18, y: 0 });
		for (let k = 0; k < 3; k++) form(pile.x + (k % 2) * 0.8, pile.y - k * 1.2);
		stampMark(g, pile.x + 1.5, pile.y - 4.4, p.go, "ok");
		// The pad of forms.
		const f = at(AT.form);
		for (let k = 2; k >= 1; k--) form(f.x + k * 0.4, f.y + k * 1.1);
		form(f.x, f.y, slid ? undefined : mark);
		if (slid) form(f.x + 9, f.y - 1.2, mark);
		// The ink pad: a tin with the inked felt on top.
		const i = at(AT.ink);
		g.roundRect(i.x - 6, i.y - 2, 12, 4.5, 1.2).fill(0x56628a).stroke({ width: 1.6, color: ink });
		g.roundRect(i.x - 5, i.y - 3, 10, 1.8, 0.8).fill(inkColour).stroke({ width: 1, color: ink });
	};

	/** The notepad on the phone table, with `n` bits jotted where the pencil went (AT.note); or its
	 * page flipped over the top, a fresh one under it. */
	const notepad = (g: Graphics, n: number, flip = false) => {
		phoneCord(g);
		notepadOnly(g, n, flip);
	};

	/** The handset's curly cord, from the end of its stub (the receiver at the ear, ARMS.ear) down in
	 * a loose droop and across to the phone's base on the wall side of the table (AT.phoneBase). */
	const phoneCord = (g: Graphics) => {
		const ear = handAt("ear", "rest", -1);
		const a = { x: ear.x + 2.6, y: ear.y + 23 };
		const b = at(AT.phoneBase);
		const c = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + 26 };
		const pts: number[] = [];
		const n = 46;
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
			const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
			pts.push(x, y + (i % 2 ? 1.3 : -1.3));
		}
		line(g, pts, 1.2, ink);
	};

	const notepadOnly = (g: Graphics, n: number, flip = false) => {
		const pad = (dy: number, fill: number) => g.poly([S.x - 8, S.y + 1 + dy, S.x + 14, S.y + 1 + dy, S.x + 16.5, S.y - 4 + dy, S.x - 5.5, S.y - 4 + dy]).fill(fill).stroke({ width: 1.3, color: ink, join: "round" });
		pad(1.4, 0xc99a6b);
		pad(0, 0xfff3a8);
		for (let x = S.x - 4; x <= S.x + 14; x += 3) g.circle(x, S.y - 4, 0.9).fill(ink);
		const bits = [[S.x - 4, S.x + 1], [S.x + 2, S.x + 7], [S.x + 8, S.x + 12]] as const;
		for (let k = 0; k < Math.min(n, 3); k++) {
			const [a, b] = bits[k]!;
			const y = S.y - 1.5 + (k === 1 ? 0.6 : 0);
			const pts: number[] = [];
			for (let x = a; x <= b; x += 1.25) pts.push(x, y + (Math.round((x - a) / 1.25) % 2 ? -0.7 : 0.5));
			line(g, pts, 0.9, 0x3d7dff);
		}
		if (n >= 3) line(g, [S.x - 4, S.y + 0.2, S.x + 12, S.y + 0.2], 0.9, RED);
		if (flip) {
			// The used page, flipped up over the binding.
			g.moveTo(S.x - 5.5, S.y - 4).quadraticCurveTo(S.x - 3, S.y - 13, S.x + 4, S.y - 14).lineTo(S.x + 22, S.y - 12).quadraticCurveTo(S.x + 16, S.y - 10, S.x + 16.5, S.y - 4).closePath()
				.fill(0xfff3a8).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [S.x + 3, S.y - 11.5, S.x + 15, S.y - 10.5], 0.9, 0x3d7dff);
		}
	};

	/** The outbox: a wire tray, empty, with an envelope falling into it, or lying in it. */
	const outbox = (g: Graphics, env: 0 | 1 | 2) => {
		const t = at(AT.tray);
		g.rect(t.x - 11, S.y - 4, 30, 4).fill(p.steel).stroke({ width: 1.2, color: ink });
		if (env === 2) g.poly(rotRect(t.x + 4, S.y - 1.5, 22, 6, -0.05)).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		g.roundRect(t.x - 13, S.y, 34, 6.5, 1.5).fill(0xb8c0d4).stroke({ width: W.fine, color: ink });
		for (const x of [t.x - 6, t.x + 14]) line(g, [x, S.y + 1.5, x, S.y + 5], 1, 0x8a94ad);
		const label = text("OUT", 4.6, ink);
		label.position.set(t.x + 4, S.y + 3.3);
		if (env === 1) {
			// Let go: it drops, turning a little, toward the tray.
			envelope(g, t.x + 4, S.y - 8, -0.22);
			for (const x of [t.x - 2, t.x + 10]) line(g, [x, S.y - 20, x, S.y - 16], 1.2, ink);
		}
		return label;
	};

	/** The shredder's top: its slot (the working point) and the pile of `n` sheets waiting beside it;
	 * `buzz` while it's eating one. */
	const shredder = (g: Graphics, n: number, buzz: boolean) => {
		const pl = at(AT.pile);
		for (let k = 0; k < n; k++) g.rect(pl.x - 7 + (k % 2) * 0.6, S.y - 1.2 * (k + 1), 14, 1.2).fill(k % 2 ? 0xf3f4f8 : 0xffffff).stroke({ width: 0.7, color: ink });
		const s = at(AT.slot);
		g.roundRect(s.x - 9, s.y - 1.2, 18, 2.4, 1.2).fill(ink);
		line(g, [s.x - 10, s.y + 2, s.x + 10, s.y + 2], 1, p.steel);
		if (buzz) {
			for (const side of [-1, 1]) {
				const x = s.x + side * 12;
				line(g, [x, s.y - 3, x + side * 1.5, s.y - 1.5, x, s.y, x + side * 1.5, s.y + 1.5], 1.1, ink);
				line(g, [x + side * 3.5, s.y - 2, x + side * 5, s.y - 0.5, x + side * 3.5, s.y + 1], 1.1, ink);
			}
		}
	};

	/** A rubber stamp held by its knob, its rubber face (`face` the ink on it) at GRIP.stamp. */
	const stamp = (g: Graphics, face: number) => {
		g.rect(-1.8, -5, 3.6, 8).fill(0x8a5a33).stroke({ width: 1.2, color: ink });
		g.circle(0, -7, 3.4).fill(0x8a5a33).stroke({ width: 1.4, color: ink });
		g.roundRect(-6.5, 2.5, 13, 4, 1).fill(p.wood).stroke({ width: W.fine, color: ink });
		g.rect(-5.5, 6.5, 11, 2).fill(face).stroke({ width: 1, color: ink });
	};

	/** A stamp's mark on a form: a ring with a tick (approved) or a cross (rejected). */
	const stampMark = (g: Graphics, x: number, y: number, colour: number, kind: "ok" | "no") => {
		g.ellipse(x, y, 5.4, 2.5).stroke({ width: 1.6, color: colour });
		if (kind === "ok") line(g, [x - 2.6, y, x - 0.8, y + 1.3, x + 2.8, y - 1.5], 1.5, colour);
		else {
			line(g, [x - 2.3, y - 1.3, x + 2.3, y + 1.3], 1.5, colour);
			line(g, [x + 2.3, y - 1.3, x - 2.3, y + 1.3], 1.5, colour);
		}
	};

	/** An envelope, its flap and a stamp, centred at (x, y) and turned `a`. */
	const envelope = (g: Graphics, x: number, y: number, a: number) => {
		g.poly(rotRect(x, y, 22, 14, a)).fill(0xffffff).stroke({ width: W.fine, color: ink, join: "round" });
		const pt = (dx: number, dy: number) => {
			const c = Math.cos(a);
			const s = Math.sin(a);
			return [x + dx * c - dy * s, y + dx * s + dy * c];
		};
		// The PR's envelope (prop/bigEnvelope, carried here): airmail ticks along its edges.
		for (let k = 0; k < 5; k++) {
			const dx = -8 + k * 4;
			const c = k % 2 ? 0x3d7dff : RED;
			line(g, [...pt(dx, -5.6), ...pt(dx + 1.6, -5.6)], 1.2, c);
			line(g, [...pt(dx, 5.6), ...pt(dx + 1.6, 5.6)], 1.2, k % 2 ? RED : 0x3d7dff);
		}
		line(g, [...pt(-11, -7), ...pt(0, 0.5), ...pt(11, -7)], 1.3, ink);
		g.circle(...(pt(0, 0.5) as [number, number]), 2.3).fill(RED).stroke({ width: 0.9, color: ink });
		g.poly(rotRect(...(pt(7.2, -3.6) as [number, number]), 3.6, 3.6, a)).fill(0xff5c9a).stroke({ width: 0.9, color: ink });
		line(g, [...pt(-7, 3), ...pt(1, 3)], 1, 0x9aa3bd);
	};

	/** A sheet held by its top edge going into the shredder: `len` of it still shows. */
	const feedSheet = (g: Graphics, len: number) => {
		g.rect(-7, 1, 14, len).fill(0xffffff).stroke({ width: 1.4, color: ink });
		for (let y = 4; y < len; y += 3) line(g, [-5, y, 4, y], 1, 0x9aa3bd);
	};

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

	/** The lead's in-tray (reach.ts TRAY): a wire tray with `n` sheets in it, bundled in threes so
	 * the pile reads at office zoom. `lean` -1 or 1 sways its top that way (the pile teeters about
	 * its foot, the top moving most); `slide` has the top sheet skidding off to the right, `drop`
	 * has it falling past the pile's side. */
	const inTray = (g: Graphics, n: number, lean = 0, top?: "slide" | "drop") => {
		const { x, w, base, sheet: h } = TRAY;
		let y = base - 2;
		for (let i = 0; i < n; i += 3) {
			const k = Math.min(3, n - i);
			const up = (i + k) / TRAY_FULL;
			const dx = lean * 9 * up * up + ((i / 3) % 2 ? 1 : -1) * 0.9;
			g.rect(x - w / 2 + 1 + dx, y - k * h, w - 2, k * h).fill((i / 3) % 2 ? 0xf3f4f8 : 0xffffff).stroke({ width: 0.9, color: ink });
			y -= k * h;
		}
		// The tray itself, in front of the pile's foot.
		g.roundRect(x - w / 2 - 1, base - 4, w + 2, 4, 1.2).fill(p.steel).stroke({ width: 1.4, color: ink });
		for (const sx of [x - w / 4, x + w / 4]) line(g, [sx, base - 3.4, sx, base - 0.6], 0.8, 0x56628a);
		if (top === "slide") {
			// The top sheet skidding off to the right, half over the edge and tipping, its face showing.
			g.poly(rotRect(x + w / 2 - 1, y - 2.5, w - 2, 5, 0.32)).fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [x + w / 2 + 2, y - 4.5, x + w / 2 + 9, y - 2.2], 1, 0x9aa3bd);
			for (const dy of [-3, 1]) line(g, [x - w / 2 - 3, y + dy, x - w / 2 - 8, y + dy], 1.2, ink);
		}
		if (top === "drop") {
			// Gone over the side: a whole sheet falling face-on past the pile, flutter lines over it.
			const fx = x + w / 2 + 15;
			const fy = y + 14;
			g.poly(rotRect(fx, fy, 15, 19, 0.5)).fill(0xffffff).stroke({ width: 1.4, color: ink, join: "round" });
			for (const d of [-3, 1, 5]) line(g, [fx - 4 + d * 0.5, fy - 3 + d, fx + 2 + d * 0.5, fy + d * 1.3], 1, 0x9aa3bd);
			line(g, [fx - 5, fy - 15, fx - 2, fy - 19], 1.2, ink);
			line(g, [fx + 3, fy - 15, fx + 7, fy - 18], 1.2, ink);
		}
	};

	/** The bell on your desk (reach.ts BELL is the plunger's top): a brass dome on a base; the
	 * plunger up, struck (`ring` 2: pressed down, ringing hard), or humming after (1). */
	const bell = (g: Graphics, ring: 0 | 1 | 2) => {
		const { x, y } = BELL;
		const foot = y + BELL_BASE;
		const down = ring === 2 ? 1.8 : 0;
		g.ellipse(x, foot, 13.5, 3).fill(0x56628a).stroke({ width: 1.4, color: ink });
		g.moveTo(x - 11.5, foot - 1).quadraticCurveTo(x - 11.5, y + 2.5, x, y + 2.5).quadraticCurveTo(x + 11.5, y + 2.5, x + 11.5, foot - 1).closePath().fill(BRASS).stroke({ width: W.fine + 0.2, color: ink, join: "round" });
		g.ellipse(x - 3.5, y + 5.5, 2.4, 1.4).fill({ color: 0xffffff, alpha: 0.6 });
		g.rect(x - 0.9, y + down, 1.8, 3).fill(p.steel).stroke({ width: 0.9, color: ink });
		g.roundRect(x - 2.8, y - 1.4 + down, 5.6, 2, 1).fill(ink);
		if (ring) {
			// It rings: lines off the dome's shoulders, longer while it rings hard.
			const len = ring === 2 ? 5 : 2.6;
			for (const side of [-1, 1]) {
				for (const [a, r] of [[0.5, 13], [0.95, 14.5]] as const) {
					const dx = side * Math.sin(a);
					const dy = -Math.cos(a);
					line(g, [x + dx * r, foot - 3 + dy * r, x + dx * (r + len), foot - 3 + dy * (r + len)], 1.2, ink);
				}
			}
		}
	};

	/** A sticky note, centred at (x, y); `flap` lifts its free (top) end in the breeze. */
	const stickyNote = (g: Graphics, x: number, y: number, flap: boolean) => {
		const s = STICKY / 2;
		if (flap) g.poly([x - s, y + s, x + s, y + s, x + s + 0.8, y - s + 3, x - s + 1.5, y - s - 1.5]).fill(STICKY_Y).stroke({ width: 1.3, color: ink, join: "round" });
		else g.rect(x - s, y - s, STICKY, STICKY).fill(STICKY_Y).stroke({ width: 1.3, color: ink });
		if (!flap) g.rect(x - s + 0.7, y - s + 0.7, STICKY - 1.4, 2).fill(0xf5cf3a);
		line(g, [x - s + 2.5, y - 0.5, x + s - 3, y - 1], 1, 0x3d7dff);
		line(g, [x - s + 2.5, y + 2.5, x + s - 5, y + 2.2], 1, 0x3d7dff);
	};

	// Fronts and backs.
	parts["prop/box"] = (g) => {
		// Held at the belly, in torso space.
		g.roundRect(-18, -30, 36, 24, 2.5).fill(p.kraft).stroke({ width: W.part, color: ink });
		g.rect(-3, -30, 6, 24).fill(0xf3d29e);
		line(g, [-18, -24, 18, -24], 1.2, 0xb07a40);
	};
	parts["prop/bigEnvelope"] = (g) => {
		// The PR's big envelope, held up in front by its sides (ARMS.present), in torso space: an
		// airmail border, the flap, and a red wax seal. Proud, not branded.
		const l = -23;
		const r = 23;
		const t = -25;
		const b = -1;
		g.roundRect(l, t, r - l, b - t, 2).fill(0xffffff).stroke({ width: W.part, color: ink });
		for (let x = l + 3; x < r - 6; x += 6) {
			g.poly([x, t + 1.6, x + 3, t + 1.6, x + 1.6, t + 3.8, x - 1.4, t + 3.8]).fill(RED);
			g.poly([x + 3, t + 1.6, x + 6, t + 1.6, x + 4.6, t + 3.8, x + 1.6, t + 3.8]).fill(0x3d7dff);
			g.poly([x, b - 1.6, x + 3, b - 1.6, x + 1.6, b - 3.8, x - 1.4, b - 3.8]).fill(0x3d7dff);
			g.poly([x + 3, b - 1.6, x + 6, b - 1.6, x + 4.6, b - 3.8, x + 1.6, b - 3.8]).fill(RED);
		}
		line(g, [l + 1.5, t + 4.5, 0, -11, r - 1.5, t + 4.5], 1.6, ink);
		g.circle(0, -11, 5).fill(RED).stroke({ width: 1.6, color: ink });
		g.star(0, -11, 5, 2.8, 1.2, 0).fill(0xffb3bd);
		line(g, [l + 5, -6, l + 14, -6], 1.2, 0x9aa3bd);
		g.roundRect(r - 9, t + 6, 5, 6, 0.8).fill(0xff5c9a).stroke({ width: 1, color: ink });
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
	parts["prop/drum"] = (g) => {
		// An oil drum to sit on: its rim at the seat, ribs round it, wider than the body so it shows.
		g.roundRect(-44, -34, 88, 34, 6).fill(0x3d7dff).stroke({ width: W.part, color: ink });
		line(g, [-44, -22, 44, -22], 2.2, ink);
		line(g, [-44, -10, 44, -10], 2.2, ink);
		g.ellipse(0, -34, 44, 6).fill(0x2f62c9).stroke({ width: W.part, color: ink });
		g.rect(-30, -30, 8, 26).fill({ color: 0xffffff, alpha: 0.18 });
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
		sigh: (g) => {
			// A long breath out, drifting from the mouth.
			const y = ANCHORS.mouthY + 2;
			for (const [x, dy, r] of [[11, 2, 2.6], [17, 4, 3.6], [24, 3, 4.4]] as const) g.circle(x, y + dy, r).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: 1.2, color: ink, alpha: 0.55 });
		},
		dusty: (g) => {
			// Dust shaken off both hands, out in front (ARMS.brushHi/brushLo), in torso space.
			for (const side of [-1, 1]) {
				for (const [x, y, r] of [[32, -22, 3], [28, -12, 2.4], [35, -15, 1.8]] as const) g.circle(side * x, y, r).fill({ color: 0xd8d2c4, alpha: 0.9 }).stroke({ width: 1.1, color: ink, alpha: 0.5 });
			}
		},
		ding: (g, add) => {
			// "ding!" up off the bell (reach.ts BELL; fx are drawn as if the body stood at y = 0).
			const x = BELL.x;
			const y = BELL.y + 15;
			for (const r of [7, 12]) g.arc(x, y - 3, r, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ width: 1.4, color: ink, alpha: r > 8 ? 0.55 : 1 });
			const t = text("ding!", 9, ink, "800");
			t.position.set(x + 15, y - 19);
			t.rotation = 0.12;
			add(t);
		},
		rush1: (g) => rush(g, 1, ink, p.tear),
		rush2: (g) => rush(g, 2, ink, p.tear),
		rush3: (g) => rush(g, 3, ink, p.tear),
		toss: (g) => {
			// The crumpled ball, flung back over the shoulder, and the arc it took.
			g.moveTo(28, -86).quadraticCurveTo(-4, -118, -40, -92).stroke({ width: 1.3, color: ink, alpha: 0.5, cap: "round" });
			const r = [5, 4.2, 5.4, 4.4, 5, 3.9, 5.2, 4.3];
			g.poly(r.flatMap((v, i) => [-44 + Math.cos((i / r.length) * Math.PI * 2) * v, -88 + Math.sin((i / r.length) * Math.PI * 2) * v])).fill(0xffffff).stroke({ width: 1.4, color: ink, join: "round" });
			line(g, [-46, -90, -43, -87, -44, -84], 0.9, 0x9aa3bd);
		},
		pew: (g) => {
			// A spark at the finger-gun's tip, where ARMS.recoil puts it.
			const tip = handAt("recoil", "rest", 1, GUN_TIP);
			const x = tip.x + 3;
			const y = tip.y + 15 - 1.5;
			sparkle(g, x, y, 5, p.sun, ink);
			for (const a of [-0.5, 0, 0.5]) line(g, [x + Math.cos(a) * 7, y + Math.sin(a) * 7, x + Math.cos(a) * 11, y + Math.sin(a) * 11], 1.4, ink);
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

export function rotRect(x: number, y: number, w: number, h: number, a: number): number[] {
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

export function burstAt(g: Graphics, x: number, y: number, r1: number, r2: number, ink: number) {
	for (let i = 0; i < 7; i++) {
		const a = Math.PI * (0.55 + (i / 6) * 0.9);
		line(g, [x + Math.cos(a) * r1, y + Math.sin(a) * r1, x + Math.cos(a) * r2, y + Math.sin(a) * r2], 1.6, ink);
	}
}

export function sparkle(g: Graphics, x: number, y: number, r: number, fill: number, ink: number) {
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

/** The in-tray's sheets at its tallest: the pile's top at TRAY.buried. */
export const TRAY_FULL = Math.round((TRAY.base - 2 - TRAY.buried) / TRAY.sheet);

/** The finger-gun's fingertip, from the hand's centre (held/finger). */
const GUN_TIP = { x: 13, y: -0.5 };

/** A run's trail, step `v` of three: sweat flung back off the head and sheets peeling off behind,
 * each step further back and higher, a new one leaving. Drawn as if the body stood at y = 0. */
function rush(g: Graphics, v: 1 | 2 | 3, ink: number, tear: number) {
	const trail: [number, number, number][] = [
		[-46, -60, -0.3],
		[-64, -74, 0.45],
		[-84, -66, 1.1],
	];
	for (let k = 0; k < v; k++) {
		const [x, y, a] = trail[v - 1 - k]!;
		g.poly(rotRect(x, y, 12, 15, a + k * 0.2)).fill(0xffffff).stroke({ width: 1.5, color: ink, join: "round" });
		line(g, [x - 3, y - 2, x + 3, y - 2.5], 1, 0x9aa3bd);
	}
	const drops: [number, number, number][] = [
		[-46, -86, 1],
		[-56, -94, 0.8],
		[-60, -82, 0.7],
	];
	for (let k = 0; k < v; k++) drop(g, drops[k]![0], drops[k]![1], tear, ink, drops[k]![2]);
	for (const y of [-50, -38]) line(g, [-56 - v * 2, y, -68 - v * 3, y], 1.3, ink);
}
