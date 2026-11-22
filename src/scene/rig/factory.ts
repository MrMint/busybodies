// The factory's rig: the same cast and the same parts as the paper office, repainted by name where
// the factory differs, so every pose plays unchanged (plan-next stream D: themes keep the mochis,
// the same crew in different outfits with different tools). Costumes become factory gear that
// still reads as the role; the station parts the hands work become machines laid out on the same
// working points (reach.ts STATION, AT, TRAY, BELL, PLANNER), at about the same size, so the
// solved arms still land on their business ends. Drawn like the office: cut paper, ink outlines,
// flat fills, in the paper palette plus hazard yellow and black, steel and safety orange.
//
// Two parts are new, and only the factory paints them: `leg/explorer` (knee pads) and
// `arm/upper/verifier` (a QA armband on one arm). The puppet uses a role's own leg or upper arm
// when the atlas has one, so the paper atlas, which has neither, draws as before.
import type { Graphics } from "pixi.js";
import { ROLES } from "./roles";
import { AT, BELL, BELL_BASE, PLANNER, STATION, STICKY, TRAY, handAt } from "./reach";
import {
	ANCHORS,
	type Painter,
	type Palette,
	PAPER_PALETTE,
	RED,
	type Theme,
	TRAY_FULL,
	W,
	burstAt,
	line,
	mochiPath,
	paperTheme,
	rotRect,
	sparkle,
	text,
} from "./theme";

/** Factory colours, on top of the paper palette. */
export const FACTORY = {
	hazard: 0xffc61a,
	hivis: 0xd4ef3a,
	orange: 0xff7a1a,
	steelLight: 0xc3cadb,
	steelDark: 0x56628a,
	gunmetal: 0x3a3f5c,
	reflect: 0xe8ecf5,
	whiteHat: 0xf6f6f2,
	leather: 0xc98a4b,
	belt: 0x8a5a33,
	schematic: 0x2f6f73,
	blank: 0xe3e8f2,
	tag: 0xf0cf8a,
	bell: 0xe8423a,
} as const;

/** The costumes and station parts the factory repaints; everything else (faces, hands, limbs, the
 * effects, the builder's own work) is the paper rig's, on purpose. The tests hold this list. */
export const FACTORY_REPAINTS = [
	...ROLES.map((r) => `body/${r}`),
	"hat/lead", "hat/lead-cup", "hat/builder", "hat/scout", "hat/explorer", "hat/reviewer", "hat/verifier", "hat/designer",
	"front/apron", "front/kerchief", "front/straps", "front/bowtie", "front/badge", "front/scarf",
	"wear/glasses",
	"held/card", "held/receiver", "held/stamp", "held/stampG", "held/stampR", "held/envelope", "held/crumple",
	"held/slip", "held/feed1", "held/feed2", "held/feed3", "held/sticky", "held/stickyFlap",
	"prop/plan", "prop/plan2", "prop/roll", "prop/bigEnvelope",
	"work/cabinet", "work/drawer", "work/drawerGap",
	"work/cards", "work/cardsA", "work/cardsB", "work/cardsGap",
	"work/copier", "work/lidHalf", "work/lidUp", "work/lidSheet", "work/scan", "work/copy1", "work/copy2", "work/jam", "work/door",
	"work/doorTug", "work/doorOpen", "work/jammed", "work/kicked", "work/jabbed", "work/kickSpit",
	"work/forms", "work/formsOk", "work/formsSlid", "work/formsR", "work/formsNo",
	"work/note0", "work/note1", "work/note2", "work/note3", "work/noteFlip",
	"work/outbox", "work/mail1", "work/mail2",
	"work/shred", "work/shred4", "work/shredBuzz",
	"work/tray1", "work/tray2", "work/tray3", "work/tray4", "work/tray4L", "work/tray4R", "work/traySlide", "work/trayDrop",
	"work/bell", "work/bellDing", "work/bellHum", "work/stickyOn",
	"fx/ding", "fx/toss",
] as const;

/** Parts only the factory has (see the header). */
export const FACTORY_EXTRAS = ["leg/explorer", "arm/upper/verifier"] as const;

/** `c` moved `t` of the way toward `to`, per channel. */
const mix = (c: number, to: number, t: number) => {
	const ch = (v: number, s: number) => (v >> s) & 0xff;
	const m = (s: number) => Math.round(ch(c, s) + (ch(to, s) - ch(c, s)) * t) << s;
	return m(16) | m(8) | m(0);
};

/** Where the mochi's outline is at height `y` (torso space, -70 to 0): its half-width. */
export function bodyEdge(y: number): number {
	const b = 35;
	const top = y < -b;
	const ex = top ? 2.25 : 3.4;
	const a = top ? 50 * 0.97 : 50;
	const s = Math.min(1, (Math.abs(y + b) / b) ** (ex / 2));
	const c = Math.sqrt(Math.max(0, 1 - s * s));
	return a * c ** (2 / ex);
}

/** Clip a polygon to an axis-aligned box (Sutherland-Hodgman). */
function clipBox(pts: number[], x0: number, y0: number, x1: number, y1: number): number[] {
	type P = [number, number];
	let poly: P[] = [];
	for (let i = 0; i < pts.length; i += 2) poly.push([pts[i]!, pts[i + 1]!]);
	const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
		[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
		[(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
		[(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
		[(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
	];
	for (const [inside, cut] of edges) {
		const out: P[] = [];
		for (let i = 0; i < poly.length; i++) {
			const a = poly[i]!;
			const b = poly[(i + 1) % poly.length]!;
			if (inside(b)) {
				if (!inside(a)) out.push(cut(a, b));
				out.push(b);
			} else if (inside(a)) out.push(cut(a, b));
		}
		poly = out;
		if (!poly.length) return [];
	}
	return poly.flat();
}

/** Hazard stripes (yellow and black, leaning right) filling a box; outline it yourself. */
function hazard(g: Graphics, x: number, y: number, w: number, h: number, ink: number, step = 4) {
	g.rect(x, y, w, h).fill(FACTORY.hazard);
	for (let k = x - h; k < x + w; k += step) {
		const s = clipBox([k, y + h, k + step / 2, y + h, k + step / 2 + h, y, k + h, y], x, y, x + w, y + h);
		if (s.length >= 6) g.poly(s).fill(ink);
	}
}

export function factoryTheme(p: Palette = PAPER_PALETTE): Theme {
	const base = paperTheme(p);
	const parts: Record<string, Painter> = { ...base.parts };
	const ink = p.ink;
	const A = ANCHORS;
	const T = A.bodyTop;
	const F = A.frontY;
	const S = STATION;
	const at = (q: { x: number; y: number }) => ({ x: S.x + q.x, y: S.y + q.y });

	// Bodies: the mochi in coveralls. The lower body takes a workwear shade of the role's colour,
	// with a collar seam and a zip; the face and the role colour above stay as they were.
	const lower: number[] = [];
	const outline = mochiPath();
	for (let i = 0; i < outline.length; i += 2) if (outline[i + 1]! >= -21) lower.push(outline[i]!, outline[i + 1]!);
	for (const role of ROLES) {
		const col = p.role[role];
		const work = mix(col, 0x46506e, 0.2);
		parts[`body/${role}`] = (g) => {
			g.poly(outline).fill(col);
			g.poly(lower).fill(work);
			line(g, [-bodyEdge(-21) + 1, -21, bodyEdge(-21) - 1, -21], 1.4, mix(work, ink, 0.35));
			line(g, [0, -20, 0, -4], 1.2, mix(work, ink, 0.35));
			g.ellipse(-19, -54, 12, 7).fill({ color: 0xffffff, alpha: 0.26 });
			g.ellipse(0, -7, 38, 6).fill({ color: p.shadow, alpha: 0.06 });
			g.poly(outline).stroke({ width: W.body, color: ink, join: "round" });
		};
	}

	/** A hard hat's crown, ridge and brim (the builder's silhouette), in `shell` with `ridge`. */
	const hardHat = (g: Graphics, shell: number, ridge: number) => {
		g.moveTo(-28, T + 5).bezierCurveTo(-28, T - 26, 28, T - 26, 28, T + 5).closePath().fill(shell).stroke({ width: W.part, color: ink });
		g.roundRect(-5, T - 18, 10, 20, 3).fill(ridge).stroke({ width: 2, color: ink });
	};

	// The lead: the foreman. A white hard hat with an ear defender on a stalk, and a hi-vis vest
	// open at the front over the tie. The ear cup and the vest's reflective trim are the tinted
	// part (hat/lead-cup), so they take the project accent as the tie and headset did.
	const vYat = (y: number) => 3 + (9 * (-3 - y)) / 21;
	const vestPanel = (side: -1 | 1): number[] => {
		const pts: number[] = [side * 3, -3];
		for (let y = -3; y >= -24; y -= 1.5) pts.push(side * (bodyEdge(y) - 0.4), y);
		pts.push(side * 12, -24);
		return pts;
	};
	parts["hat/lead"] = (g) => {
		for (const side of [-1, 1] as const) g.poly(vestPanel(side)).fill(FACTORY.hivis).stroke({ width: W.fine, color: ink, join: "round" });
		line(g, [-36, T + 8, -48, -44], 4, ink);
		line(g, [-36, T + 8, -48, -44], 1.8, FACTORY.steelLight);
		hardHat(g, FACTORY.whiteHat, 0xe1e4ec);
		g.rect(-26, T + 0.5, 52, 2).fill(0xe1e4ec);
		g.roundRect(-37, T + 2, 74, 7, 3.5).fill(FACTORY.whiteHat).stroke({ width: W.part, color: ink });
	};
	parts["hat/lead-cup"] = (g) => {
		g.roundRect(-55, -44, 10, 17, 4.5).fill(0xffffff).stroke({ width: W.part, color: ink });
		for (const side of [-1, 1] as const) {
			const pts = [bodyEdge(-14) - 1.2, -14, vYat(-14) + 0.6, -14, vYat(-10) + 0.6, -10, bodyEdge(-10) - 1.2, -10].map((v, i) => (i % 2 ? v : side * v));
			g.poly(pts).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		}
	};

	// Builders: a hazard-yellow hard hat with a striped brim, and a tool belt.
	parts["hat/builder"] = (g) => {
		hardHat(g, FACTORY.hazard, 0xffa600);
		hazard(g, -36, T + 2.5, 72, 6, ink, 6);
		g.roundRect(-37, T + 2, 74, 7, 3).stroke({ width: W.part, color: ink });
	};
	parts["front/apron"] = (g) => {
		const y0 = F + 3;
		const y1 = F + 8;
		// A wrench and a hammer handle poke out of the pouches.
		g.roundRect(-23.5, y1 - 8, 3.4, 10, 1.6).fill(p.steel).stroke({ width: 1.4, color: ink });
		g.circle(-21.8, y1 - 9, 3).stroke({ width: 3.2, color: ink });
		g.circle(-21.8, y1 - 9, 3).stroke({ width: 1.6, color: p.steel });
		line(g, [26, y1 + 1, 28, y1 - 9], 2.8, 0x8a5a33);
		g.roundRect(24, y1 - 13, 9, 4.5, 1.2).fill(p.steel).stroke({ width: 1.4, color: ink });
		g.poly([-bodyEdge(y0) + 0.6, y0, bodyEdge(y0) - 0.6, y0, bodyEdge(y1) - 0.6, y1, -bodyEdge(y1) + 0.6, y1]).fill(FACTORY.belt).stroke({ width: 1.8, color: ink, join: "round" });
		g.roundRect(-5, y0 - 1, 10, 7, 1.5).fill(p.steel).stroke({ width: 1.6, color: ink });
		g.rect(-2.5, y0 + 1, 5, 3).fill(FACTORY.belt);
		for (const x of [-28, 18]) {
			g.roundRect(x, y1 - 1, 12, 9, 2).fill(FACTORY.leather).stroke({ width: 1.6, color: ink });
			line(g, [x + 1.5, y1 + 2.5, x + 10.5, y1 + 2.5], 1, 0x9a6634);
		}
	};

	// Scouts: the green cap, with a headlamp strapped on; a hi-vis bandana.
	parts["hat/scout"] = (g) => {
		g.moveTo(-20, T + 3).lineTo(-16, T - 15).quadraticCurveTo(0, T - 20, 16, T - 15).lineTo(20, T + 3).closePath().fill(0x35b866).stroke({ width: W.part, color: ink });
		g.rect(-19, T - 4, 38, 5).fill(ink);
		g.ellipse(0, T + 4, 38, 5).fill(0x35b866).stroke({ width: W.part, color: ink });
		g.roundRect(-6.5, T - 10, 13, 9, 3).fill(p.steel).stroke({ width: 1.8, color: ink });
		g.circle(0, T - 5.5, 3.2).fill(0xfff3a0).stroke({ width: 1.3, color: ink });
		for (const [x0, x1] of [[-5, -9], [0, 0], [5, 9]] as const) line(g, [x0, T - 13, x1, T - 18], 1.6, ink);
	};
	parts["front/kerchief"] = (g) => {
		g.poly([-14, F - 2, 14, F - 2, 0, F + 10]).fill(FACTORY.orange).stroke({ width: 2, color: ink, join: "round" });
		g.poly([-10.5, F + 1, 10.5, F + 1, 8.2, F + 3, -8.2, F + 3]).fill(FACTORY.reflect);
	};

	// Explorers: a safety-orange brimmed hard hat, a harness with a torch clipped on, knee pads.
	parts["hat/explorer"] = (g) => {
		g.ellipse(0, T + 3, 40, 6).fill(FACTORY.orange).stroke({ width: W.part, color: ink });
		g.moveTo(-26, T + 2).bezierCurveTo(-26, T - 26, 26, T - 26, 26, T + 2).closePath().fill(FACTORY.orange).stroke({ width: W.part, color: ink });
		g.rect(-25, T - 3, 50, 4).fill(FACTORY.reflect);
		g.roundRect(-3.5, T - 21, 7, 19, 3).fill(0xe0661a).stroke({ width: 1.6, color: ink });
	};
	parts["front/straps"] = (g) => {
		for (const side of [-1, 1]) {
			line(g, [side * 30, -20, side * 16, F + 14], 4.6, ink);
			line(g, [side * 30, -20, side * 16, F + 14], 2.6, FACTORY.orange);
		}
		g.roundRect(-6, F + 2, 12, 9, 2).fill(p.steel).stroke({ width: 1.6, color: ink });
		g.rect(-3, F + 4.5, 6, 4).fill(FACTORY.steelDark);
		// The torch, clipped to the right strap, lens up.
		g.roundRect(21, F - 6, 5.4, 11, 1.6).fill(p.steel).stroke({ width: 1.4, color: ink });
		g.roundRect(20, F - 9, 7.4, 4, 1.4).fill(p.sun).stroke({ width: 1.3, color: ink });
	};
	parts["leg/explorer"] = (g) => {
		line(g, [0, 0, 0, 14], 6.6, ink);
		g.roundRect(-9.5, 11.5, 13, 6.5, 3.2).fill(ink);
		g.roundRect(-5.2, 2.2, 10.4, 7.4, 2.8).fill(0xa9b2c6).stroke({ width: 1.5, color: ink });
		line(g, [-3, 4.4, 2.6, 4.4], 1, 0xffffff);
	};

	// Reviewers: the bun in a hairnet, safety glasses, and a clipboard badge.
	parts["hat/reviewer"] = (g) => {
		const r = 10;
		g.circle(0, T - 9, r).fill(0x9a7ae8).stroke({ width: W.part, color: ink });
		for (const k of [-6, -2, 2, 6]) {
			const h = Math.sqrt(r * r - k * k) - 1;
			line(g, [-h, T - 9 + k, h, T - 9 + k], 0.9, 0xe9e2ff);
			line(g, [k, T - 9 - h, k, T - 9 + h], 0.9, 0xe9e2ff);
		}
		g.roundRect(-8, T - 2, 16, 5, 2.5).fill(0x7a5ad0).stroke({ width: 2, color: ink });
	};
	parts["wear/glasses"] = (g) => {
		const y = A.eyeY;
		for (const side of [-1, 1]) {
			const sh = [-27, y - 6, -33, y - 4, -33, y + 3, -27, y + 5].map((v, i) => (i % 2 ? v : side * v));
			g.poly(sh).fill({ color: 0xdff4ff, alpha: 0.5 }).stroke({ width: 1.6, color: ink, join: "round" });
		}
		g.roundRect(-27, y - 8, 54, 15, 6).fill({ color: 0xdff4ff, alpha: 0.24 }).stroke({ width: 2.4, color: ink });
		g.roundRect(-27.5, y - 9, 55, 3.4, 1.7).fill(FACTORY.orange).stroke({ width: 1.4, color: ink });
		line(g, [-22, y - 3, -18, y + 2], 1.4, 0xffffff);
		line(g, [11, y - 3, 15, y + 2], 1.4, 0xffffff);
	};
	parts["front/bowtie"] = (g) => {
		g.roundRect(-6, F - 4, 12, 15, 1.5).fill(0xc99a6b).stroke({ width: 1.6, color: ink });
		g.rect(-4.5, F - 1, 9, 10.5).fill(0xffffff);
		for (const y of [F + 1.5, F + 4]) line(g, [-3, y, 3, y], 1, 0x9aa3bd);
		line(g, [-2.6, F + 7, -0.9, F + 8.6, 2.8, F + 5.6], 1.3, p.go);
		g.roundRect(-3, F - 6, 6, 3.5, 1).fill(p.steel).stroke({ width: 1.2, color: ink });
	};

	// Verifiers: a teal bump cap with a reflective band, a QA tag, and a QA armband.
	parts["hat/verifier"] = (g) => {
		g.moveTo(-30, T + 6).quadraticCurveTo(0, T - 14, 30, T + 6).closePath().fill(0x1fb5a8).stroke({ width: W.part, color: ink });
		for (const x of [-8, 0, 8]) line(g, [x, T - 3, x * 1.1, T + 3], 1.2, 0x168f85);
		g.roundRect(-36, T - 6, 72, 7, 2).fill(0x34cdbf).stroke({ width: W.part, color: ink });
		g.rect(-30, T - 3.5, 60, 2).fill(FACTORY.reflect);
	};
	parts["front/badge"] = (g) => {
		g.poly([11, F - 3, 18, F - 3, 20, F - 1, 20, F + 10, 9, F + 10, 9, F - 1]).fill(0xffffff).stroke({ width: 2, color: ink, join: "round" });
		g.rect(9.8, F + 0.4, 9.4, 2.6).fill(p.go);
		g.circle(14.5, F - 1, 1).fill(ink);
		line(g, [11.6, F + 6, 13.8, F + 8.2, 17.6, F + 4.4], 1.7, p.go);
	};
	parts["arm/upper/verifier"] = (g) => {
		line(g, [0, 0, 0, A.upper], 6, ink);
		g.roundRect(-4.8, 4.2, 9.6, 6.2, 1.6).fill(FACTORY.orange).stroke({ width: 1.4, color: ink });
		line(g, [-2, 7.4, -0.6, 8.6, 2.2, 5.8], 1.2, 0xffffff);
	};

	// Designers: a welding helmet flipped up on its pivots, and a welder's leather scarf.
	parts["hat/designer"] = (g) => {
		const y = -56;
		const e = bodyEdge(y) - 1;
		g.moveTo(-e, y).quadraticCurveTo(0, y - 6, e, y).stroke({ width: 4.2, color: ink, cap: "round" });
		g.moveTo(-e, y).quadraticCurveTo(0, y - 6, e, y).stroke({ width: 2.2, color: FACTORY.gunmetal, cap: "round" });
		for (const side of [-1, 1]) {
			line(g, [side * 27, T + 1, side * e, y], 4.4, ink);
			line(g, [side * 27, T + 1, side * e, y], 2.4, 0xe8506e);
			g.circle(side * e, y, 3.4).fill(p.steel).stroke({ width: 1.4, color: ink });
		}
		g.roundRect(-30, T - 13, 60, 16, 7).fill(0xe8506e).stroke({ width: W.part, color: ink });
		g.roundRect(-12, T - 9, 24, 8, 2).fill(0x2f6b5e).stroke({ width: 1.6, color: ink });
		line(g, [-8, T - 7, -4, T - 3], 1.2, 0x9fe3cf);
	};
	parts["front/scarf"] = (g) => {
		g.roundRect(8, F + 1, 7, 13, 3).fill(FACTORY.leather).stroke({ width: 1.8, color: ink });
		line(g, [11.5, F + 4, 11.5, F + 11], 0.9, 0x8a5a33);
		g.moveTo(-24, F - 1).quadraticCurveTo(0, F + 7, 24, F - 1).stroke({ width: 7, color: ink, cap: "round" });
		g.moveTo(-24, F - 1).quadraticCurveTo(0, F + 7, 24, F - 1).stroke({ width: 3.8, color: FACTORY.leather, cap: "round" });
	};

	// Held tools ------------------------------------------------------------------------------------
	// The hammer, wrench and clipboard are the office's; the blueprint becomes a machine schematic.
	const schematic = (g: Graphics, flip: boolean) => {
		g.roundRect(-29, -14, 58, 25, 2).fill(FACTORY.schematic).stroke({ width: W.part, color: ink });
		const k = flip ? -1 : 1;
		const cy = -1;
		const Y = (v: number) => cy + v * k;
		// A gear on a shaft driving a piston, and dimension lines: turned, it hangs upside down.
		g.star(-10, Y(0), 8, 7.6, 5.6, 0).stroke({ width: 1.5, color: 0xffffff, join: "round" });
		g.circle(-10, Y(0), 2).stroke({ width: 1.2, color: 0xffffff });
		line(g, [-10, Y(0), 8, Y(-3)], 1.4, 0xffffff);
		g.poly([6, Y(-7), 20, Y(-7), 20, Y(1), 6, Y(1)]).stroke({ width: 1.4, color: 0xffffff, join: "round" });
		line(g, [-22, Y(-8), -22, Y(8)], 1.2, 0xbfe6e0);
		line(g, [6, Y(7), 20, Y(7)], 1.2, 0xbfe6e0);
		g.roundRect(-30, -17, 60, 6, 3).fill(0x245a5e).stroke({ width: 2, color: ink });
	};
	parts["prop/plan"] = (g) => schematic(g, false);
	parts["prop/plan2"] = (g) => schematic(g, true);
	parts["prop/roll"] = (g) => {
		g.roundRect(-31, -18, 62, 12, 6).fill(FACTORY.schematic).stroke({ width: W.part, color: ink });
		line(g, [-18, -15, 14, -15], 1.4, 0xbfe6e0);
		g.ellipse(-31, -12, 3, 6).fill(0xbfe6e0).stroke({ width: 1.6, color: ink });
		g.ellipse(31, -12, 3, 6).fill(0xbfe6e0).stroke({ width: 1.6, color: ink });
	};

	/** A bolt lying on its side, head toward `-x`: a hex head and a threaded shank. */
	const bolt = (g: Graphics, x0: number, x1: number, y: number) => {
		g.rect(x0 + 3, y - 1.5, x1 - x0 - 3, 3).fill(FACTORY.steelLight).stroke({ width: 1.1, color: ink });
		for (let x = x0 + 5; x < x1 - 0.5; x += 1.8) line(g, [x, y - 1.5, x - 0.8, y + 1.5], 0.7, p.steel);
		g.roundRect(x0, y - 3.2, 4, 6.4, 0.8).fill(p.steel).stroke({ width: 1.3, color: ink });
	};
	// The bolt from the bolt bins, held up to squint at (where the index card was).
	parts["held/card"] = (g) => bolt(g, -8, 8, -9.5);

	/** An inspection stamp held by its knob, the steel face (`face` its colour) at GRIP.stamp. */
	const stamp = (g: Graphics, face: number) => {
		g.rect(-1.8, -5, 3.6, 8).fill(p.steel).stroke({ width: 1.2, color: ink });
		g.circle(0, -7, 3.4).fill(FACTORY.gunmetal).stroke({ width: 1.4, color: ink });
		g.roundRect(-6.5, 2.5, 13, 4, 1).fill(FACTORY.steelLight).stroke({ width: W.fine, color: ink });
		g.rect(-5.5, 6.5, 11, 2).fill(face).stroke({ width: 1, color: ink });
	};
	parts["held/stamp"] = (g) => stamp(g, 0x7a7f92);
	parts["held/stampG"] = (g) => stamp(g, p.go);
	parts["held/stampR"] = (g) => stamp(g, RED);

	// The radio log's handset: a dispatch mic on its coiled cord (the cord runs on to the radio
	// with the log, as the phone's did).
	parts["held/receiver"] = (g) => {
		const zig: number[] = [];
		for (let i = 0; i <= 4; i++) zig.push(1 + (i % 2 ? 2.4 : -2.4) + i * 0.4, 13 + i * 2.5);
		line(g, zig, 1.3, ink);
		g.roundRect(-3.6, -15, 9.2, 28, 3).fill(FACTORY.gunmetal).stroke({ width: 1.8, color: ink });
		for (const y of [-11, -8.5, -6]) line(g, [-1.4, y, 3.4, y], 1, 0x9aa3bd);
		g.roundRect(-5.4, -1, 2.6, 7, 1).fill(FACTORY.orange).stroke({ width: 1, color: ink });
		g.circle(1, 8, 1.6).fill(RED).stroke({ width: 0.9, color: ink });
	};

	/** A shipping carton, centred at (x, y) and turned `a`: kraft, a tape seam, a label. */
	const carton = (g: Graphics, x: number, y: number, a: number) => {
		const pt = (dx: number, dy: number): [number, number] => [x + dx * Math.cos(a) - dy * Math.sin(a), y + dx * Math.sin(a) + dy * Math.cos(a)];
		g.poly(rotRect(x, y, 22, 14, a)).fill(p.kraft).stroke({ width: W.fine, color: ink, join: "round" });
		g.poly(rotRect(...pt(0, 0), 3.4, 14, a)).fill(0xf3d29e);
		g.poly(rotRect(...pt(-6.5, 2.5), 6, 4.4, a)).fill(0xffffff).stroke({ width: 0.9, color: ink });
		line(g, [...pt(5, -3.5), ...pt(5, 0.5), ...pt(3.4, -1.3), ...pt(5, 0.5), ...pt(6.6, -1.3)], 1, ink);
		g.poly(rotRect(x, y, 22, 14, a)).stroke({ width: W.fine, color: ink, join: "round" });
	};
	parts["held/envelope"] = (g) => carton(g, 0, -8, 0);

	/** A balled-up blank: a jammed part, crushed. */
	const crumple = (g: Graphics, x: number, y: number, r: number[]) => {
		const pts = r.flatMap((v, i) => [x + Math.cos((i / r.length) * Math.PI * 2) * v, y + Math.sin((i / r.length) * Math.PI * 2) * v]);
		g.poly(pts).fill(0xd5dbe6).stroke({ width: 1.6, color: ink, join: "round" });
		line(g, [x - 3, y - 3, x, y, x - 1, y + 4], 1, p.steel);
		line(g, [x + 1, y - 4, x + 3, y + 1, x + 2, y + 4], 1, p.steel);
	};
	parts["held/crumple"] = (g) => crumple(g, 0, -6, [6.4, 5.2, 6.8, 5.6, 6.2, 4.9, 6.6, 5.4, 6, 5.1]);

	/** A steel offcut held by its top edge going into the crusher: `len` of it still shows. */
	const strip = (g: Graphics, len: number) => {
		g.rect(-7, 1, 14, len).fill(FACTORY.steelLight).stroke({ width: 1.4, color: ink });
		if (len > 5) line(g, [-4, 2.5, 3, 1 + len - 1.5], 1.2, 0xffffff);
	};
	parts["held/slip"] = (g) => {
		g.poly([0, -1.5, 16, -3.5, 17.5, 0.5, 1, 2.5]).fill(FACTORY.steelLight).stroke({ width: 1.4, color: ink, join: "round" });
		line(g, [4, 0.6, 12, -0.6], 1, 0xffffff);
	};
	parts["held/feed1"] = (g) => strip(g, 12);
	parts["held/feed2"] = (g) => strip(g, 7);
	parts["held/feed3"] = (g) => strip(g, 3);

	/** A work-order tag (where the sticky note was), centred at (x, y): a manila tag with clipped
	 * top corners, a reinforced hole, a red band and two lines; `flap` lifts its free end. */
	const workTag = (g: Graphics, x: number, y: number, flap: boolean) => {
		const s = STICKY / 2;
		const body = flap
			? [x - s, y + s, x + s, y + s, x + s + 0.8, y - s + 3, x + 2, y - s - 2, x - s + 0.2, y - s + 0.6]
			: [x - s, y + s, x + s, y + s, x + s, y - s + 2.4, x + s - 2.4, y - s, x - s + 2.4, y - s, x - s, y - s + 2.4];
		g.poly(body).fill(FACTORY.tag).stroke({ width: 1.3, color: ink, join: "round" });
		g.circle(x, y - s + 2.8, 1.5).fill(0xffffff).stroke({ width: 0.9, color: ink });
		if (!flap) g.rect(x - s + 0.7, y - 0.8, STICKY - 1.4, 2).fill(RED);
		line(g, [x - s + 2.5, y + 2.6, x + s - 3, y + 2.4], 1, ink);
		line(g, [x - s + 2.5, y + 4.4, x + s - 5, y + 4.2], 1, ink);
	};
	parts["held/sticky"] = (g) => workTag(g, 0, -12, false);
	parts["held/stickyFlap"] = (g) => workTag(g, 0, -12, true);
	parts["work/stickyOn"] = (g) => {
		g.rect(PLANNER.x - STICKY / 2 + 1.2, PLANNER.y - STICKY / 2 + 1.5, STICKY, STICKY).fill({ color: p.shadow, alpha: 0.14 });
		workTag(g, PLANNER.x, PLANNER.y, false);
	};

	// The PR's big envelope: a shipping crate held up in front by its sides (ARMS.present).
	parts["prop/bigEnvelope"] = (g) => {
		const l = -23;
		const r = 23;
		const t = -25;
		const b = -1;
		g.roundRect(l, t, r - l, b - t, 1.5).fill(p.wood).stroke({ width: W.part, color: ink });
		for (const y of [t + 8, t + 16]) line(g, [l + 1.5, y, r - 1.5, y], 1.2, 0xb88a4c);
		line(g, [l + 3, b - 3, r - 3, t + 3], 3.4, 0xd8a868);
		line(g, [l + 3, b - 3, r - 3, t + 3], 1, 0xb88a4c);
		for (const x of [l, r - 4]) g.rect(x, t, 4, b - t).fill(0xd8a868).stroke({ width: 1.4, color: ink });
		hazard(g, -7, t + 3, 14, 6, ink, 4);
		g.rect(-7, t + 3, 14, 6).stroke({ width: 1.2, color: ink });
		// "This way up", stencilled.
		for (const x of [-12, 8]) line(g, [x, b - 4, x, b - 10, x - 2, b - 8, x, b - 10, x + 2, b - 8], 1.3, ink);
	};

	// The station parts, at reach.ts's working points --------------------------------------------

	// The filing drawer: a parts-rack bin. Shut, its handle bar is on the working point; pulled out,
	// it comes toward the viewer with its spec packets standing in it (their tops are where the
	// folder tabs were, walked by the fingertips), one gone in `gap`.
	const bin = (g: Graphics, state: "shut" | "out" | "gap") => {
		const rail = (y: number) => g.rect(S.x - 8, y, 36, 2).fill(p.steel).stroke({ width: 1, color: ink });
		if (state === "shut") {
			rail(S.y - 8);
			g.roundRect(S.x - 5, S.y - 6, 30, 13, 2).fill(FACTORY.orange).stroke({ width: W.fine + 0.4, color: ink });
			g.rect(S.x + 6, S.y - 4.4, 8, 3.2).fill(0xffffff).stroke({ width: 1, color: ink });
			g.roundRect(S.x - 1, S.y - 1.3, 20, 2.6, 1.3).fill(p.steel).stroke({ width: 1.4, color: ink });
			rail(S.y + 7);
			return;
		}
		rail(S.y - 8);
		g.rect(S.x - 6, S.y - 6, 32, 5).fill(FACTORY.gunmetal).stroke({ width: 1.2, color: ink });
		const zips = [p.go, 0x3d7dff, FACTORY.hazard, RED, p.go, 0x3d7dff];
		zips.forEach((c, i) => {
			const x = S.x - 3 + i * 5;
			if (state === "gap" && i === 3) return;
			g.roundRect(x, S.y - 11, 4.4, 7, 0.8).fill(0xeef2f8).stroke({ width: 1, color: ink });
			g.rect(x + 0.4, S.y - 10.6, 3.6, 1.4).fill(c);
		});
		const o = AT.drawerOut;
		g.poly([S.x - 7, S.y - 2, S.x + 27, S.y - 2, S.x + 27, S.y + 12, S.x - 7, S.y + 12]).fill(FACTORY.orange).stroke({ width: W.fine + 0.4, color: ink, join: "round" });
		g.rect(S.x + 6, S.y + 0.4, 8, 3.2).fill(0xffffff).stroke({ width: 1, color: ink });
		g.roundRect(S.x + o.x - 1, S.y + o.y + 2.2, 20, 2.6, 1.3).fill(p.steel).stroke({ width: 1.4, color: ink });
	};
	parts["work/cabinet"] = (g) => bin(g, "shut");
	parts["work/drawer"] = (g) => bin(g, "out");
	parts["work/drawerGap"] = (g) => bin(g, "gap");

	// The card tray: a bin pulled out of the bolt-bin wall, its bolts standing head up in a slotted
	// rack. Bolts nearer than `upTo` are tipped toward the character by the fingertip; `gap` has
	// the one at the fingertip lifted out.
	const boltBin = (g: Graphics, upTo: number, gap: boolean) => {
		for (let i = 0; i < 11; i++) {
			const x = S.x + i * 2;
			if (gap && Math.abs(i * 2 - (upTo + 1)) < 1) continue;
			const a = i * 2 < upTo ? -0.42 : 0;
			const h = 9;
			const cx = x + (Math.sin(a) * h) / 2;
			const cy = S.y - 1 - (Math.cos(a) * h) / 2;
			g.poly(rotRect(cx, cy, 1.3, h, a)).fill(i % 3 === 1 ? 0xd9b44a : FACTORY.steelLight).stroke({ width: 0.7, color: ink });
			const hx = x + Math.sin(a) * h;
			const hy = S.y - 1 - Math.cos(a) * h;
			g.poly(rotRect(hx, hy, 2.6, 1.8, a)).fill(p.steel).stroke({ width: 0.7, color: ink });
		}
		g.roundRect(S.x - 3, S.y - 1, 26, 9, 1.5).fill(p.steel).stroke({ width: W.fine + 0.2, color: ink });
		hazard(g, S.x + 6, S.y + 0.8, 8, 3, ink, 3);
		g.rect(S.x + 6, S.y + 0.8, 8, 3).stroke({ width: 1, color: ink });
		g.circle(S.x + 10, S.y + 5.6, 1.6).stroke({ width: 1.2, color: ink });
	};
	parts["work/cards"] = (g) => boltBin(g, 0, false);
	parts["work/cardsA"] = (g) => boltBin(g, AT.cards[1].x, false);
	parts["work/cardsB"] = (g) => boltBin(g, AT.cards[2].x, false);
	parts["work/cardsGap"] = (g) => boltBin(g, AT.cards[2].x, true);

	// The copier: a stamping press. Its lid is the press's guard (hazard-striped, on the same hinge),
	// the glass its die bed, the start button a cycle button and the status light a beacon on the
	// control plate, the jam door a striped access hatch, the out-tray the parts chute.
	const press = (
		g: Graphics,
		o: { lid?: number; sheet?: boolean; light?: "go" | "red"; glow?: boolean; copies?: 1 | 2; door?: boolean; jam?: "corner" | "inside" | "tugged"; bang?: boolean; pressed?: boolean },
	) => {
		const lidLen = 30;
		// The chute on the far side, and the stamped brackets sliding down it.
		g.poly([S.x + 36, S.y + 8, S.x + 52, S.y + 5, S.x + 52.5, S.y + 7.5, S.x + 36, S.y + 11]).fill(FACTORY.steelLight).stroke({ width: 1.6, color: ink, join: "round" });
		line(g, [S.x + 36, S.y + 7.4, S.x + 52, S.y + 4.4], 1.4, ink);
		const bracket = (x: number, y: number) => {
			g.poly([x, y, x + 8, y - 1.5, x + 8.3, y + 0.3, x + 2, y + 1.4, x + 2.3, y + 3, x + 0.3, y + 3.4]).fill(FACTORY.blank).stroke({ width: 1, color: ink, join: "round" });
			g.circle(x + 5.5, y - 0.3, 0.6).fill(ink);
		};
		if (o.copies === 1) bracket(S.x + 36, S.y + 5.8);
		if (o.copies === 2) for (let k = 0; k < 3; k++) bracket(S.x + 38 + k * 4.2, S.y + 6.6 - k * 1.6);
		// The control plate: the cycle button and the beacon.
		const b = at(AT.button);
		g.roundRect(b.x - 4, b.y - 3, 15, 6, 1.5).fill(FACTORY.gunmetal).stroke({ width: 1.2, color: ink });
		g.circle(b.x, b.y, 3).fill(FACTORY.hazard).stroke({ width: 0.9, color: ink });
		g.circle(b.x, b.y + (o.pressed ? 0.6 : 0), o.pressed ? 1.7 : 2.2).fill(o.light === "go" ? p.go : o.pressed ? 0x1f7a45 : 0x45b06f).stroke({ width: 1.1, color: ink });
		const bx = b.x + 7;
		const lit = o.light === "red" ? RED : o.light === "go" ? p.go : 0x7a6a4a;
		g.rect(bx - 2.2, b.y - 0.4, 4.4, 1.6).fill(ink);
		g.moveTo(bx - 2, b.y - 0.4).lineTo(bx - 2, b.y - 2.6).quadraticCurveTo(bx, b.y - (o.pressed ? 5.4 : 4.8), bx + 2, b.y - 2.6).lineTo(bx + 2, b.y - 0.4).closePath().fill(lit).stroke({ width: 0.9, color: ink });
		const [r0, r1] = o.pressed ? [4, 7.6] : [3.6, 5.8];
		const rays = o.pressed ? [-2.8, -2.1, -1.57, -1.05, -0.35] : [-2.4, -1.57, -0.74];
		if (o.light === "red") for (const a of rays) line(g, [bx + Math.cos(a) * r0, b.y - 2 + Math.sin(a) * r0, bx + Math.cos(a) * r1, b.y - 2 + Math.sin(a) * r1], 1, RED);
		// The access hatch, shut, or dropped open on its bottom hinge.
		const d = at(AT.door);
		const dl = d.x - 5;
		const dt = S.y + 12;
		if (o.door) {
			g.rect(dl, dt, 24, 11).fill(FACTORY.gunmetal).stroke({ width: 1.4, color: ink });
			for (const x of [dl + 6, dl + 16]) g.circle(x, dt + 7, 2.2).fill(p.steel).stroke({ width: 1, color: ink });
			const flap = [dl, dt + 11, dl + 24, dt + 11, dl + 27, dt + 17, dl - 3, dt + 17];
			g.poly(flap).fill(FACTORY.hazard);
			for (let k = -2; k < 30; k += 5) g.poly(clipBox([dl + k, dt + 17, dl + k + 2.5, dt + 17, dl + k + 8.5, dt + 11, dl + k + 6, dt + 11], dl - 3, dt + 11, dl + 27, dt + 17)).fill(ink);
			g.poly(flap).stroke({ width: 1.6, color: ink, join: "round" });
		} else {
			hazard(g, dl, dt, 24, 2.2, ink, 4);
			g.roundRect(dl, dt, 24, 11, 1.5).stroke({ width: 1.2, color: ink, alpha: 0.7 });
			g.rect(d.x - 1.5, d.y - 1, 3, 2).fill(p.steel).stroke({ width: 1, color: ink });
		}
		// The jammed blank: a bent corner at the hatch's seam, crushed inside, or tugged out.
		const j = at(AT.jam);
		if (o.jam === "corner") g.poly([j.x - 3, dt + 0.5, j.x - 1, dt - 4, j.x + 2, dt - 2.5, j.x + 4, dt - 5, j.x + 5, dt + 0.5]).fill(FACTORY.blank).stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "inside") g.poly([j.x - 4, j.y - 3, j.x, j.y - 5, j.x + 4, j.y - 2, j.x + 3, j.y + 3, j.x - 2, j.y + 4, j.x - 5, j.y + 1]).fill(FACTORY.blank).stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "tugged") {
			const e = at(AT.jamOut);
			const top: number[] = [];
			const bot: number[] = [];
			for (let i = 0; i <= 6; i++) {
				const x = j.x + 3 + ((e.x - j.x - 3) * i) / 6;
				top.push(x, j.y - 3 + (i % 2 ? -1.2 : 0.4));
				bot.unshift(x, j.y + 3 + (i % 2 ? 1 : -0.4));
			}
			g.poly([...top, ...bot]).fill(FACTORY.blank).stroke({ width: 1.2, color: ink, join: "round" });
		}
		// The die bed under a raised guard, and the blank laid on it.
		if (o.lid) {
			g.rect(S.x, S.y - 1.5, lidLen - 2, 1.5).fill(FACTORY.steelDark).stroke({ width: 1, color: ink });
			if (o.sheet) g.rect(S.x + 4, S.y - 3, 18, 1.6).fill(FACTORY.blank).stroke({ width: 1, color: ink });
		}
		// The guard, about its hinge at the far end.
		const hx = S.x + lidLen;
		const hy = S.y - 2;
		g.save();
		g.translateTransform(-hx, -hy).rotateTransform(((o.lid ?? 0) * Math.PI) / 180).translateTransform(hx, hy);
		hazard(g, S.x - 1, S.y - 4, lidLen + 1, 4, ink, 5);
		g.roundRect(S.x - 1, S.y - 4, lidLen + 1, 4, 1.5).stroke({ width: W.fine + 0.2, color: ink });
		g.rect(S.x - 1, S.y - 3, 3, 2).fill(ink);
		g.restore();
		if (o.glow) {
			// The stroke: the ram comes down and the die flashes under the guard.
			g.rect(S.x, S.y - 0.6, lidLen - 2, 1.4).fill(0xfff3a0);
			for (const x of [S.x - 2, S.x + lidLen + 1]) line(g, [x, S.y - 1, x + (x < S.x ? -4 : 4), S.y - 2], 1.2, p.sun);
			sparkle(g, S.x + lidLen / 2, S.y + 1.5, 2.6, p.sun, ink);
		}
		if (o.bang) {
			burstAt(g, S.x - 4, -7, 3, 7, ink);
			for (const [x, y] of [[S.x - 6, S.y + 2], [S.x + lidLen + 6, S.y - 4]] as const) {
				g.arc(x, y, 4, -2.2, -1).stroke({ width: 1.2, color: ink });
				g.arc(x, y, 7, -2.2, -1).stroke({ width: 1.2, color: ink, alpha: 0.6 });
			}
		}
	};
	parts["work/copier"] = (g) => press(g, {});
	parts["work/lidHalf"] = (g) => press(g, { lid: 22 });
	parts["work/lidUp"] = (g) => press(g, { lid: 78 });
	parts["work/lidSheet"] = (g) => press(g, { lid: 78, sheet: true });
	parts["work/scan"] = (g) => press(g, { light: "go", glow: true });
	parts["work/copy1"] = (g) => press(g, { light: "go", glow: true, copies: 1 });
	parts["work/copy2"] = (g) => press(g, { copies: 2 });
	parts["work/jam"] = (g) => press(g, { light: "red", jam: "corner" });
	parts["work/door"] = (g) => press(g, { light: "red", door: true, jam: "inside" });
	parts["work/doorTug"] = (g) => press(g, { light: "red", door: true, jam: "tugged" });
	parts["work/doorOpen"] = (g) => press(g, { light: "red", door: true });
	parts["work/jammed"] = (g) => press(g, { light: "red" });
	parts["work/kicked"] = (g) => press(g, { light: "red", bang: true });
	parts["work/jabbed"] = (g) => press(g, { light: "red", pressed: true });
	parts["work/kickSpit"] = (g) => press(g, { light: "red", bang: true, jam: "corner" });

	// The stamp desk: a gauge and a pad of pass/fail tags. The stamp goes to the gauge's anvil (the
	// ink pad's place; its top and needle are the verdict's colour), then onto the top tag, and the
	// marked tag is pushed onto the done pile.
	const mark = (g: Graphics, x: number, y: number, colour: number, kind: "ok" | "no") => {
		g.ellipse(x, y, 5.4, 2.5).stroke({ width: 1.6, color: colour });
		if (kind === "ok") line(g, [x - 2.6, y, x - 0.8, y + 1.3, x + 2.8, y - 1.5], 1.5, colour);
		else {
			line(g, [x - 2.3, y - 1.3, x + 2.3, y + 1.3], 1.5, colour);
			line(g, [x + 2.3, y - 1.3, x - 2.3, y + 1.3], 1.5, colour);
		}
	};
	const tags = (g: Graphics, verdict: number, m?: "ok" | "no", slid = false) => {
		const tag = (x: number, y: number, mk?: "ok" | "no") => {
			g.poly([x - 6.5, y + 1, x + 8, y + 1, x + 11, y - 5.5, x - 3.5, y - 5.5, x - 8.5, y - 2.2]).fill(FACTORY.tag).stroke({ width: 1.2, color: ink, join: "round" });
			g.circle(x - 5.4, y - 2.1, 0.9).fill(0xffffff).stroke({ width: 0.7, color: ink });
			line(g, [x - 8.4, y - 2.2, x - 11, y - 0.4], 0.8, ink);
			if (mk) mark(g, x + 1.5, y - 2, mk === "ok" ? p.go : RED, mk);
		};
		const pile = at({ x: AT.form.x + 18, y: 0 });
		for (let k = 0; k < 3; k++) tag(pile.x + (k % 2) * 0.8, pile.y - k * 1.2);
		mark(g, pile.x + 2, pile.y - 4.4, p.go, "ok");
		const f = at(AT.form);
		for (let k = 2; k >= 1; k--) tag(f.x + k * 0.4, f.y + k * 1.1);
		tag(f.x, f.y, slid ? undefined : m);
		if (slid) tag(f.x + 9, f.y - 1.2, m);
		// The gauge: a steel block with a dial on its face and the verdict on its anvil.
		const i = at(AT.ink);
		g.roundRect(i.x - 6, i.y - 2, 12, 5.5, 1.2).fill(p.steel).stroke({ width: 1.6, color: ink });
		g.roundRect(i.x - 5, i.y - 3, 10, 1.8, 0.8).fill(verdict).stroke({ width: 1, color: ink });
		g.circle(i.x - 2.6, i.y + 0.9, 1.7).fill(0xffffff).stroke({ width: 0.8, color: ink });
		line(g, [i.x - 2.6, i.y + 0.9, i.x - 1.6 + (verdict === RED ? -1.8 : 0.4), i.y - 0.2], 0.8, verdict);
		g.rect(i.x + 1.4, i.y + 0.1, 3.2, 1.4).fill(verdict);
	};
	parts["work/forms"] = (g) => tags(g, p.go);
	parts["work/formsOk"] = (g) => tags(g, p.go, "ok");
	parts["work/formsSlid"] = (g) => tags(g, p.go, "ok", true);
	parts["work/formsR"] = (g) => tags(g, RED);
	parts["work/formsNo"] = (g) => tags(g, RED, "no");

	// The phone table's notepad: the radio log, a ruled log sheet on a board under a steel clip,
	// with the handset's coiled cord running to the radio.
	const cord = (g: Graphics) => {
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
	const radioLog = (g: Graphics, n: number, flip = false) => {
		cord(g);
		const sheet = (dy: number, fill: number) => g.poly([S.x - 8, S.y + 1 + dy, S.x + 14, S.y + 1 + dy, S.x + 16.5, S.y - 4 + dy, S.x - 5.5, S.y - 4 + dy]).fill(fill).stroke({ width: 1.3, color: ink, join: "round" });
		sheet(1.4, FACTORY.gunmetal);
		sheet(0, 0xffffff);
		for (const x of [S.x + 1, S.x + 9]) line(g, [x - 1.3, S.y + 0.7, x, S.y - 3.6], 0.7, 0x9aa3bd);
		g.roundRect(S.x - 1, S.y - 5.4, 10, 2.2, 0.8).fill(p.steel).stroke({ width: 1, color: ink });
		const bits = [[S.x - 4, S.x + 1], [S.x + 2, S.x + 7], [S.x + 8, S.x + 12]] as const;
		for (let k = 0; k < Math.min(n, 3); k++) {
			const [a, b] = bits[k]!;
			const y = S.y - 1.5 + (k === 1 ? 0.6 : 0);
			const pts: number[] = [];
			for (let x = a; x <= b; x += 1.25) pts.push(x, y + (Math.round((x - a) / 1.25) % 2 ? -0.7 : 0.5));
			line(g, pts, 0.9, ink);
		}
		if (n >= 3) line(g, [S.x - 4, S.y + 0.2, S.x + 12, S.y + 0.2], 0.9, RED);
		if (flip) {
			g.moveTo(S.x - 5.5, S.y - 4).quadraticCurveTo(S.x - 3, S.y - 13, S.x + 4, S.y - 14).lineTo(S.x + 22, S.y - 12).quadraticCurveTo(S.x + 16, S.y - 10, S.x + 16.5, S.y - 4).closePath()
				.fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [S.x + 3, S.y - 11.5, S.x + 15, S.y - 10.5], 0.9, ink);
		}
	};
	parts["work/note0"] = (g) => radioLog(g, 0);
	parts["work/note1"] = (g) => radioLog(g, 1);
	parts["work/note2"] = (g) => radioLog(g, 2);
	parts["work/note3"] = (g) => radioLog(g, 3);
	parts["work/noteFlip"] = (g) => radioLog(g, 0, true);

	// The outbox: a pallet on the loading dock's striped edge; the carton falls onto it and lies there.
	const pallet = (g: Graphics, env: 0 | 1 | 2) => {
		const t = at(AT.tray);
		hazard(g, t.x - 15, S.y + 6.5, 38, 2.2, ink, 4);
		for (const x of [t.x - 12, t.x + 2, t.x + 15]) g.rect(x, S.y + 1.5, 4, 4).fill(0xb88a4c).stroke({ width: 1, color: ink });
		g.rect(t.x - 13, S.y + 5, 34, 1.8).fill(p.wood).stroke({ width: 1, color: ink });
		if (env === 2) carton(g, t.x + 4, S.y - 6, -0.04);
		g.rect(t.x - 13, S.y - 1, 34, 2.6).fill(p.wood).stroke({ width: W.fine, color: ink });
		for (const x of [t.x - 2, t.x + 9]) line(g, [x, S.y - 0.6, x, S.y + 1.2], 0.9, 0xb88a4c);
		if (env === 1) {
			carton(g, t.x + 4, S.y - 9, -0.22);
			for (const x of [t.x - 2, t.x + 10]) line(g, [x, S.y - 21, x, S.y - 17], 1.2, ink);
		}
	};
	parts["work/outbox"] = (g) => pallet(g, 0);
	parts["work/mail1"] = (g) => pallet(g, 1);
	parts["work/mail2"] = (g) => pallet(g, 2);

	// The shredder: a crusher. The slot is its jaws (two toothed rollers between hazard blocks), the
	// pile beside it a stack of steel offcuts; `crunch` while it's eating one.
	const crusher = (g: Graphics, n: number, crunch: boolean) => {
		const pl = at(AT.pile);
		for (let k = 0; k < n; k++) g.rect(pl.x - 7 + (k % 2) * 0.6, S.y - 1.2 * (k + 1), 14, 1.2).fill(k % 2 ? 0xa9b2c6 : FACTORY.steelLight).stroke({ width: 0.7, color: ink });
		const s = at(AT.slot);
		for (const side of [-1, 1]) {
			hazard(g, s.x + (side < 0 ? -13 : 9), s.y - 2, 4, 4, ink, 3);
			g.rect(s.x + (side < 0 ? -13 : 9), s.y - 2, 4, 4).stroke({ width: 0.9, color: ink });
		}
		g.roundRect(s.x - 9, s.y - 1.4, 18, 2.8, 1.2).fill(ink);
		for (let x = s.x - 8; x <= s.x + 7; x += 2.5) {
			g.poly([x, s.y - 1.4, x + 1.2, s.y + 0.2, x + 2.4, s.y - 1.4]).fill(p.steel);
			g.poly([x + 1.2, s.y + 1.4, x + 2.4, s.y - 0.2, x + 3.6, s.y + 1.4]).fill(FACTORY.steelLight);
		}
		line(g, [s.x - 10, s.y + 2.4, s.x + 10, s.y + 2.4], 1, p.steel);
		if (crunch) {
			for (const side of [-1, 1]) {
				const x = s.x + side * 15;
				line(g, [x, s.y - 3, x + side * 1.5, s.y - 1.5, x, s.y, x + side * 1.5, s.y + 1.5], 1.1, ink);
				sparkle(g, s.x + side * 4, s.y - 4, 2, p.sun, ink);
			}
		}
	};
	parts["work/shred"] = (g) => crusher(g, 5, false);
	parts["work/shred4"] = (g) => crusher(g, 4, false);
	parts["work/shredBuzz"] = (g) => crusher(g, 4, true);

	// The in-tray: a hopper on the lead's desk, filling with parts. The pile rises in rows of parts
	// a bundle of sheets high, so it buries the lead as the sheets did; it sways, sheds a gear off
	// the top, and loses one over the side.
	const gear = (g: Graphics, x: number, y: number, r: number, a = 0) => {
		g.star(x, y, 7, r, r * 0.74, a).fill(FACTORY.hazard).stroke({ width: 1.1, color: ink, join: "round" });
		g.circle(x, y, r * 0.3).fill(FACTORY.steelDark).stroke({ width: 0.8, color: ink });
	};
	const hopper = (g: Graphics, n: number, lean = 0, top?: "slide" | "drop") => {
		const { x, w, base, sheet: h } = TRAY;
		let y = base - 2;
		for (let i = 0; i < n; i += 3) {
			const k = Math.min(3, n - i);
			const up = (i + k) / TRAY_FULL;
			const dx = lean * 9 * up * up + ((i / 3) % 2 ? 1 : -1) * 0.9;
			const row = (i / 3) % 2;
			g.rect(x - w / 2 + 1 + dx, y - k * h, w - 2, k * h).fill(row ? 0xa9b2c6 : FACTORY.steelLight).stroke({ width: 0.9, color: ink });
			for (let c = 0; c < 4; c++) g.circle(x - w / 2 + 5 + c * 7 + row * 3 + dx, y - (k * h) / 2, Math.min(1.3, (k * h) / 2 - 0.3)).fill(row ? FACTORY.steelDark : p.steel);
			y -= k * h;
		}
		g.poly([x - w / 2 - 3, base - 5, x + w / 2 + 3, base - 5, x + w / 2 + 1, base, x - w / 2 - 1, base]).fill(FACTORY.orange).stroke({ width: 1.4, color: ink, join: "round" });
		hazard(g, x - w / 2 + 1, base - 4, w - 2, 1.8, ink, 3);
		if (top === "slide") {
			gear(g, x + w / 2 + 2, y - 3.5, 4.6, 0.3);
			for (const dy of [-3, 1]) line(g, [x - w / 2 - 3, y + dy, x - w / 2 - 8, y + dy], 1.2, ink);
		}
		if (top === "drop") {
			const fx = x + w / 2 + 15;
			const fy = y + 14;
			gear(g, fx, fy, 7.5, 0.5);
			line(g, [fx - 5, fy - 11, fx - 2, fy - 15], 1.2, ink);
			line(g, [fx + 3, fy - 11, fx + 7, fy - 14], 1.2, ink);
		}
	};
	parts["work/tray1"] = (g) => hopper(g, 3);
	parts["work/tray2"] = (g) => hopper(g, 7);
	parts["work/tray3"] = (g) => hopper(g, 14);
	parts["work/tray4"] = (g) => hopper(g, TRAY_FULL);
	parts["work/tray4L"] = (g) => hopper(g, TRAY_FULL, -1);
	parts["work/tray4R"] = (g) => hopper(g, TRAY_FULL, 1);
	parts["work/traySlide"] = (g) => hopper(g, TRAY_FULL - 1, 1, "slide");
	parts["work/trayDrop"] = (g) => hopper(g, TRAY_FULL - 1, 0, "drop");

	// The counter bell: the shift bell, a red dome on a striped steel foot, struck the same way.
	const shiftBell = (g: Graphics, ring: 0 | 1 | 2) => {
		const { x, y } = BELL;
		const foot = y + BELL_BASE;
		const down = ring === 2 ? 1.8 : 0;
		g.ellipse(x, foot, 13.5, 3).fill(FACTORY.gunmetal).stroke({ width: 1.4, color: ink });
		g.moveTo(x - 11.5, foot - 1).quadraticCurveTo(x - 11.5, y + 2.5, x, y + 2.5).quadraticCurveTo(x + 11.5, y + 2.5, x + 11.5, foot - 1).closePath().fill(FACTORY.bell).stroke({ width: W.fine + 0.2, color: ink, join: "round" });
		hazard(g, x - 10, foot - 3.4, 20, 2.2, ink, 3);
		g.ellipse(x - 3.5, y + 5.5, 2.4, 1.4).fill({ color: 0xffffff, alpha: 0.6 });
		g.rect(x - 0.9, y + down, 1.8, 3).fill(p.steel).stroke({ width: 0.9, color: ink });
		g.roundRect(x - 2.8, y - 1.4 + down, 5.6, 2, 1).fill(ink);
		if (ring) {
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
	parts["work/bell"] = (g) => shiftBell(g, 0);
	parts["work/bellDing"] = (g) => shiftBell(g, 2);
	parts["work/bellHum"] = (g) => shiftBell(g, 1);
	parts["fx/ding"] = (g, add) => {
		const x = BELL.x;
		const y = BELL.y + 15;
		for (const r of [7, 12]) g.arc(x, y - 3, r, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ width: 1.4, color: ink, alpha: r > 8 ? 0.55 : 1 });
		const t = text("clang!", 9, ink, "800");
		t.position.set(x + 17, y - 19);
		t.rotation = 0.12;
		add(t);
	};

	// The tossed jam: the crushed blank, flung back over the shoulder.
	parts["fx/toss"] = (g) => {
		g.moveTo(28, -86).quadraticCurveTo(-4, -118, -40, -92).stroke({ width: 1.3, color: ink, alpha: 0.5, cap: "round" });
		crumple(g, -44, -88, [5, 4.2, 5.4, 4.4, 5, 3.9, 5.2, 4.3]);
	};

	return { name: "factory", palette: p, parts };
}
