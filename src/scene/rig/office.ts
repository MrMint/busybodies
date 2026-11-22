// The office's rig: the paper rig's cast and parts, repainted by name where the office goes full
// office (plan-alive stream D), so every pose plays unchanged, as the factory's does. No hard hats,
// aprons, sawhorses or bricks: the construction gear is the factory's. The cast dresses as an
// over-the-top corporate office, each role told apart by its hair or headwear at room zoom, not
// only its colour; the builder's work becomes paperwork laid out on the same points (reach.ts
// WORK), at about the same size, so the solved arms still land on the business ends:
//
//   hammer → a giant stapler      nails → a sheaf, stapled a strike at a time
//   sawhorse → an in-tray stand   bricks → reams of paper, and binders stacked on the stand
//   wrench → a sharpener's crank  the machine's nut → a giant crank pencil sharpener
//   crate → a banker's box        bolt, gear → a binder clip, a tape dispenser
//   blueprint → a green-bar printout   torch → a laser pointer   map → a seating chart
//
// The crew's tower on the desk (binders and reams) and the recycling bin are the scene theme's
// (theme/office.ts). One part is new, and only themes with it paint it: `arm/upper/verifier`, the
// sleeve garter (the puppet uses it on the left arm when the atlas has one).
import type { Graphics } from "pixi.js";
import { bodyEdge } from "./factory";
import { WORK } from "./reach";
import { ANCHORS, type Painter, type Palette, PAPER_PALETTE, RED, type Theme, W, line, mochiPath, paperTheme, rotRect } from "./theme";

/** Office colours, on top of the paper palette. */
export const OFFICE = {
	hair: 0x3a2d28,
	hairBrown: 0x6b4630,
	hairGrey: 0x9c93ad,
	shirt: 0xffffff,
	tie: 0xff4d5e,
	tieDark: 0xc9303f,
	pencil: 0xffc93c,
	eraser: 0xff9eb1,
	visor: 0x2fb35f,
	visorDark: 0x1f7f42,
	cardigan: 0xe2a63c,
	cardiganDark: 0xb98224,
	fleece: 0x3f4c6b,
	fleeceDark: 0x2c3550,
	turtleneck: 0x2b2833,
	lanyard: 0x3d7dff,
	stapler: 0xe8423a,
	stand: 0x6f7891,
	greenbar: 0xd6f2dc,
	box: 0xf3ece0,
	laser: 0xff2d3d,
	shades: 0x262433,
	blond: 0xf2d06b,
} as const;

/** The costumes and work the office repaints; everything else (faces, hands, limbs, the stations,
 * effects) is the paper rig's, on purpose. The tests hold this list. */
export const OFFICE_REPAINTS = [
	"body/designer",
	"hat/lead", "hat/lead-cup", "hat/builder", "hat/scout", "hat/explorer", "hat/reviewer", "hat/verifier", "hat/designer",
	"front/tie", "front/apron", "front/kerchief", "front/straps", "front/bowtie", "front/badge", "front/scarf",
	"wear/glasses",
	"held/hammer", "held/wrench", "held/bolt", "held/gear", "held/brick", "held/torch", "held/map", "held/brush",
	"work/nail1", "work/nail2", "work/nail3", "work/bent", "work/nut1", "work/nut2", "work/nut3", "work/crate",
	"work/stack", "work/stackL", "work/stackR", "work/brick",
	"prop/plan", "prop/plan2", "prop/roll",
] as const;

/** Parts only the office (and the factory) have (see the header). */
export const OFFICE_EXTRAS = ["arm/upper/verifier"] as const;

export function officeTheme(p: Palette = PAPER_PALETTE): Theme {
	const base = paperTheme(p);
	const parts: Record<string, Painter> = { ...base.parts };
	const ink = p.ink;
	const A = ANCHORS;
	const T = A.bodyTop;
	const F = A.frontY;

	/** A hair cap over the dome: its top just above the body's outline, its lower edge `edge` (a
	 * list of [x, y] from left to right). */
	const hairCap = (g: Graphics, colour: number, edge: number[], lift = 2) => {
		const pts: number[] = [];
		const outline = mochiPath();
		const x0 = edge[0]!;
		const x1 = edge[edge.length - 2]!;
		// The dome's own outline between the two ends, lifted a little so the hair stands proud.
		for (let i = 0; i < outline.length; i += 2) {
			const x = outline[i]!;
			const y = outline[i + 1]!;
			if (y < -45 && x >= x0 - 0.5 && x <= x1 + 0.5) pts.push(x, y - lift);
		}
		const top: (readonly [number, number])[] = [];
		for (let i = 0; i < pts.length; i += 2) top.push([pts[i]!, pts[i + 1]!] as const);
		top.sort((a, b) => a[0] - b[0]);
		const poly: number[] = [];
		for (const [x, y] of top) poly.push(x, y);
		for (let i = edge.length - 2; i >= 0; i -= 2) poly.push(edge[i]!, edge[i + 1]!);
		g.poly(poly).fill(colour).stroke({ width: W.fine + 0.2, color: ink, join: "round" });
	};

	/** The mochi outline below `y` (torso space), for a garment on the lower body. */
	const below = (y: number) => {
		const out: number[] = [];
		const o = mochiPath();
		for (let i = 0; i < o.length; i += 2) if (o[i + 1]! >= y) out.push(o[i]!, o[i + 1]!);
		return out;
	};

	/** A side panel of an open garment (a vest, a cardigan): the body's edge from `y0` up to `y1`,
	 * and an inner edge that leans out as it rises. */
	const panel = (side: -1 | 1, y0: number, y1: number, inner0: number, inner1: number): number[] => {
		const pts: number[] = [side * inner0, y0];
		for (let y = y0; y >= y1; y -= 1.5) pts.push(side * (bodyEdge(y) - 0.4), y);
		pts.push(side * (bodyEdge(y1) - 0.4), y1, side * inner1, y1);
		return pts;
	};

	// Bodies: only the designer's changes. The black turtleneck, from just under the mouth down.
	{
		const col = p.role.designer;
		const outline = mochiPath();
		const knit = below(-20);
		parts["body/designer"] = (g) => {
			g.poly(outline).fill(col);
			g.poly(knit).fill(OFFICE.turtleneck);
			for (let x = -36; x <= 36; x += 6) line(g, [x, -12, x * 1.04, -3], 0.9, 0x403c4a);
			g.ellipse(-19, -54, 12, 7).fill({ color: 0xffffff, alpha: 0.26 });
			g.poly(outline).stroke({ width: W.body, color: ink, join: "round" });
		};
	}

	// The lead: the boss. Slicked hair with a pompadour, a headset with a big foam mic, a starched
	// collar over the loud tie (the tie and the ear cup take the project accent).
	parts["hat/lead"] = (g) => {
		hairCap(g, OFFICE.hair, [-38, -58, -26, -63, -10, -60, 6, -64, 22, -63, 38, -58]);
		// The pompadour: a glossy wave over the forehead.
		g.moveTo(-28, -63).bezierCurveTo(-34, T - 22, 10, T - 24, 16, -67).quadraticCurveTo(-4, -70, -26, -64).fill(OFFICE.hair).stroke({ width: W.fine + 0.2, color: ink, join: "round" });
		line(g, [-22, -72, -6, T - 15], 1.8, 0x8a7a72);
		// The collar points, either side of the knot.
		for (const s of [-1, 1]) g.poly([s * 2, F - 4, s * 13, F - 5, s * 7, F + 4]).fill(OFFICE.shirt).stroke({ width: 1.5, color: ink, join: "round" });
		// The headset's band, and the boom to a big foam mic.
		g.moveTo(-47, -38).bezierCurveTo(-48, T - 14, 48, T - 14, 47, -38).stroke({ width: 5, color: ink, cap: "round" });
		g.moveTo(-47, -38).bezierCurveTo(-48, T - 14, 48, T - 14, 47, -38).stroke({ width: 2.2, color: 0xcfd6e6, cap: "round" });
		g.moveTo(-50, -30).quadraticCurveTo(-42, -14, -21, -19).stroke({ width: 3, color: ink, cap: "round" });
		g.circle(-18, -19, 4.4).fill(0x3a3f5c).stroke({ width: 1.4, color: ink });
		g.circle(-19.2, -20.4, 1.2).fill(0x6a7090);
	};
	parts["hat/lead-cup"] = (g) => {
		g.roundRect(-57, -46, 12, 20, 5).fill(0xffffff).stroke({ width: W.part, color: ink });
		g.roundRect(-54, -42, 4, 12, 2).fill(0xdfe4ef);
	};
	parts["front/tie"] = (g) => {
		// A wide, loud tie: white with grey stripes and a dot, so the project accent tints it loud.
		const knot = [-5, F - 2, 5, F - 2, 3, F + 3, -3, F + 3];
		const blade = [-3, F + 3, 3, F + 3, 7, F + 15, 0, F + 20, -7, F + 15];
		g.poly(blade).fill(0xffffff);
		for (let k = -2; k <= 4; k++) {
			const y = F + 4 + k * 3.2;
			line(g, [-8, y + 4, 8, y - 2], 1.5, 0x9a9a9a);
		}
		g.poly(blade).stroke({ width: 1.6, color: ink, join: "round" });
		g.poly(knot).fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
		g.circle(0, F + 0.5, 1).fill(0x9a9a9a);
	};

	// Builders: shirt and tie, the tie flung back over the shoulder, a pencil behind the ear, and hair
	// sticking up from running their hands through it.
	parts["hat/builder"] = (g) => {
		const tuft = [-30, -61, -26, T - 8, -16, -66, -9, T - 13, -2, -67, 6, T - 15, 12, -67, 22, T - 9, 26, -64, 32, -60];
		hairCap(g, OFFICE.hairBrown, [-34, -60, -22, -62, -8, -60, 8, -62, 22, -61, 34, -60]);
		g.poly([-30, -61, ...tuft.slice(2, -2), 32, -60, 20, -64, 0, -64, -18, -64]).fill(OFFICE.hairBrown).stroke({ width: W.fine + 0.2, color: ink, join: "round" });
		// The pencil behind the right ear, sticking out past the head.
		line(g, [34, -60, 55, -41], 5.2, ink);
		line(g, [34, -60, 55, -41], 3.2, OFFICE.pencil);
		g.circle(33.4, -60.6, 2.4).fill(OFFICE.eraser).stroke({ width: 1.2, color: ink });
		line(g, [55, -41, 58.4, -38], 2.4, p.wood);
		line(g, [57.4, -39, 58.4, -38], 1.4, ink);
	};
	parts["front/apron"] = (g) => {
		// The open collar and the loosened knot.
		for (const s of [-1, 1]) g.poly([s * 2, F - 5, s * 12, F - 6, s * 8, F + 2]).fill(OFFICE.shirt).stroke({ width: 1.5, color: ink, join: "round" });
		// The tie, flung back over the left shoulder, its tip flapping out behind.
		const path = (gr: Graphics) => gr.moveTo(0, F + 1).bezierCurveTo(-20, F + 4, -44, -24, -49, -46);
		path(g).stroke({ width: 9, color: ink, cap: "round" });
		path(g).stroke({ width: 6.4, color: OFFICE.tie, cap: "round" });
		g.poly([-52, -43, -45, -49, -55, -60]).fill(OFFICE.tie).stroke({ width: 1.6, color: ink, join: "round" });
		for (const [x, y] of [[-14, -14], [-27, -18], [-38, -27], [-45, -37]] as const) line(g, [x - 2, y - 2.6, x + 2, y + 2.6], 1.1, OFFICE.tieDark);
		g.poly([-4, F - 3, 4, F - 3, 3, F + 3, -3, F + 3]).fill(OFFICE.tie).stroke({ width: 1.5, color: ink, join: "round" });
		// A shirt pocket with a pen.
		g.roundRect(14, F - 1, 10, 9, 1.5).fill(OFFICE.shirt).stroke({ width: 1.3, color: ink });
		g.roundRect(19, F - 5, 2.6, 7, 1).fill(0x3d7dff).stroke({ width: 1, color: ink });
	};

	// Scouts: the intern. A high ponytail with a scrunchie, and a lanyard with an ID badge.
	parts["hat/scout"] = (g) => {
		g.moveTo(4, -70).bezierCurveTo(-2, -92, 30, -108, 38, -94).bezierCurveTo(42, -86, 26, -78, 20, -68).closePath().fill(0x4a3226).stroke({ width: W.fine + 0.2, color: ink, join: "round" });
		line(g, [14, -84, 30, -96], 1.2, 0x7a5a48);
		hairCap(g, 0x4a3226, [-36, -58, -24, -62, -14, -58, -4, -63, 10, -60, 24, -62, 36, -58]);
		g.poly(rotRect(12, -71, 13, 6, -0.55)).fill(0xff5c9a).stroke({ width: 1.4, color: ink, join: "round" });
	};
	parts["front/kerchief"] = (g) => {
		line(g, [-13, -21, -3, F + 3], 2.2, OFFICE.lanyard);
		line(g, [13, -21, 3, F + 3], 2.2, OFFICE.lanyard);
		g.roundRect(-2, F + 1.5, 4, 3, 1).fill(p.steel).stroke({ width: 1, color: ink });
		g.roundRect(-7, F + 4, 14, 11, 1.5).fill(0xffffff).stroke({ width: 1.6, color: ink });
		g.rect(-7, F + 4, 14, 2.6).fill(RED);
		g.rect(-5, F + 7.6, 4.2, 5).fill(0xbcd6ff).stroke({ width: 0.8, color: ink });
		line(g, [0.6, F + 9, 5, F + 9], 0.9, 0x9aa3bd);
		line(g, [0.6, F + 11.4, 4, F + 11.4], 0.9, 0x9aa3bd);
	};

	// Explorers: the off-site strategist. Sunglasses pushed up on gelled hair, a fleece vest, and a
	// laser pointer clipped in its pocket.
	parts["hat/explorer"] = (g) => {
		hairCap(g, OFFICE.blond, [-36, -58, -20, -61, 0, -59, 20, -61, 36, -58]);
		for (const x of [-22, -10, 4, 18]) line(g, [x, -61, x + 7, -70], 1.1, 0xc9a23e);
		// The sunglasses, pushed up on the head: arms running back to the ears.
		for (const s of [-1, 1]) {
			line(g, [s * 22, -68, s * 36, -60], 2, ink);
			g.poly(rotRect(s * 12, -70, 19, 10, s * 0.08)).fill(OFFICE.shades).stroke({ width: 1.8, color: ink, join: "round" });
			line(g, [s * 12 - 5, -72, s * 12 - 1, -68], 1.3, 0x8c8aa6);
		}
		line(g, [-3, -71, 3, -71], 2.2, ink);
	};
	parts["front/straps"] = (g) => {
		for (const s of [-1, 1] as const) {
			g.poly(panel(s, -2, -24, 7, 13)).fill(OFFICE.fleece).stroke({ width: 1.8, color: ink, join: "round" });
			// The stand-up collar and the zip's edge.
			g.roundRect(s > 0 ? 9 : -21, -26, 12, 5, 2).fill(OFFICE.fleeceDark).stroke({ width: 1.4, color: ink });
			for (let y = -20; y < -4; y += 4) line(g, [s * 18, y, s * 34, y + 1], 0.8, OFFICE.fleeceDark);
		}
		// The chest pocket and the laser pointer clipped in it.
		g.roundRect(-34, -16, 12, 8, 1.5).fill(OFFICE.fleeceDark).stroke({ width: 1.2, color: ink });
		g.roundRect(-29.5, -22, 3.4, 9, 1.2).fill(0xc3cadb).stroke({ width: 1, color: ink });
		g.circle(-27.8, -22.6, 1.3).fill(OFFICE.laser);
	};

	// Reviewers: the senior partner. A grey bun skewered with a pencil, a mustard cardigan, and
	// reading glasses low on the nose on a beaded chain.
	parts["hat/reviewer"] = (g) => {
		hairCap(g, OFFICE.hairGrey, [-37, -57, -20, -62, 0, -60, 20, -62, 37, -57]);
		g.circle(0, T - 10, 11).fill(OFFICE.hairGrey).stroke({ width: W.part, color: ink });
		g.arc(0, T - 10, 6, 0.4, 2.6).stroke({ width: 1.2, color: 0x7c7390 });
		line(g, [-17, T - 20, 16, T - 1], 4.4, ink);
		line(g, [-17, T - 20, 16, T - 1], 2.6, OFFICE.pencil);
		g.circle(-17, T - 20, 2).fill(OFFICE.eraser).stroke({ width: 1.1, color: ink });
	};
	parts["front/bowtie"] = (g) => {
		for (const s of [-1, 1] as const) {
			g.poly(panel(s, -2, -23, 9, 14)).fill(OFFICE.cardigan).stroke({ width: 1.8, color: ink, join: "round" });
			for (let y = -19; y < -3; y += 3.4) line(g, [s * 20, y, s * 36, y], 0.8, OFFICE.cardiganDark);
			for (const y of [-19, -13, -7]) g.circle(s * (12 - (y + 2) * 0.22), y, 1.5).fill(0x8a5a33).stroke({ width: 0.8, color: ink });
		}
		// A blouse collar between the panels.
		for (const s of [-1, 1]) g.poly([s * 2, F - 5, s * 12, F - 6, s * 9, F]).fill(OFFICE.shirt).stroke({ width: 1.3, color: ink, join: "round" });
	};
	parts["wear/glasses"] = (g) => {
		const y = A.eyeY + 4;
		// Half-moon reading glasses, low on the face, and the chain from the arms, round under the chin.
		g.moveTo(-26, -46).quadraticCurveTo(-34, -10, 0, -12).quadraticCurveTo(34, -10, 26, -46).stroke({ width: 1, color: 0xb8962e });
		for (let t = 0.1; t < 1; t += 0.1) {
			const x = (1 - t) * (1 - t) * -26 + 2 * (1 - t) * t * -34 + t * t * 0;
			const yy = (1 - t) * (1 - t) * -46 + 2 * (1 - t) * t * -10 + t * t * -12;
			g.circle(x, yy, 0.9).fill(0xf2bd3c).circle(-x, yy, 0.9).fill(0xf2bd3c);
		}
		for (const x of [-A.eyeX, A.eyeX]) {
			g.moveTo(x - 9, y - 1).lineTo(x + 9, y - 1).arc(x, y - 1, 9, 0, Math.PI).closePath().fill({ color: 0xffffff, alpha: 0.25 }).stroke({ width: 2.2, color: ink, join: "round" });
		}
		line(g, [-7, y - 1, 7, y - 1], 2, ink);
		line(g, [-25, y - 1, -27, -46], 1.6, ink);
		line(g, [25, y - 1, 27, -46], 1.6, ink);
	};

	// Verifiers: the accountant. A green visor over a combover, a pocket protector full of pens, a
	// sleeve garter.
	parts["hat/verifier"] = (g) => {
		for (const k of [0, 1, 2, 3]) {
			const x = -20 + k * 9;
			g.moveTo(x, -68 + k * 0.4).quadraticCurveTo(x + 14, -76, x + 22, -64).stroke({ width: 1.8, color: OFFICE.hair, cap: "round" });
		}
		g.roundRect(-38, -62, 76, 6, 3).fill(OFFICE.visorDark).stroke({ width: 1.8, color: ink });
		g.poly([-46, -58, 46, -58, 36, -47, -36, -47]).fill({ color: OFFICE.visor, alpha: 0.78 }).stroke({ width: W.fine + 0.4, color: ink, join: "round" });
		line(g, [-36, -55, 30, -55], 1.4, 0x9fe8b8);
	};
	parts["front/badge"] = (g) => {
		const cols = [RED, 0x3d7dff, ink];
		cols.forEach((c, i) => g.roundRect(11.4 + i * 3.6, F - 7 + (i % 2), 2.8, 8, 1).fill(c).stroke({ width: 0.8, color: ink }));
		g.roundRect(9.6, F - 1.5, 13, 11, 1.5).fill(0xffffff).stroke({ width: 1.6, color: ink });
		g.rect(9.6, F - 1.5, 13, 2.4).fill(0xdfe4ef);
		line(g, [11.6, F + 5, 20.6, F + 5], 0.9, 0x9aa3bd);
	};
	parts["arm/upper/verifier"] = (g) => {
		line(g, [0, 0, 0, A.upper], 6, ink);
		g.roundRect(-4.6, 5, 9.2, 4.6, 1.6).fill(ink);
		g.rect(-4, 6.6, 8, 1.4).fill(RED);
		g.roundRect(-1.2, 4.4, 2.4, 5.8, 0.6).fill(p.steel).stroke({ width: 0.7, color: ink });
	};

	// Designers: the creative director. A black beret, round wire glasses, the black turtleneck.
	parts["hat/designer"] = (g) => {
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, A.eyeY, 9.4).fill({ color: 0xffffff, alpha: 0.18 }).stroke({ width: 1.6, color: ink });
		g.moveTo(-6.6, A.eyeY - 1).quadraticCurveTo(0, A.eyeY - 5, 6.6, A.eyeY - 1).stroke({ width: 1.6, color: ink });
		g.ellipse(-5, T - 3, 35, 11).fill(OFFICE.turtleneck).stroke({ width: W.part, color: ink });
		g.ellipse(-12, T - 6, 14, 3).fill({ color: 0xffffff, alpha: 0.12 });
		g.roundRect(-3, T - 19, 5, 8, 2).fill(ink);
	};
	parts["front/scarf"] = (g) => {
		// The rolled turtleneck collar under the chin.
		const y0 = -21;
		const y1 = -14;
		g.poly([-bodyEdge(y0) + 3, y0, bodyEdge(y0) - 3, y0, bodyEdge(y1) - 1, y1, -bodyEdge(y1) + 1, y1]).fill(0x3a3644).stroke({ width: 1.8, color: ink, join: "round" });
		for (let x = -36; x <= 36; x += 4) line(g, [x, y0 + 1.5, x, y1 - 1.5], 0.9, 0x55505f);
	};

	// Held tools -----------------------------------------------------------------------------------

	/** A stapler seen side on, `len` long from its hinge at (x, y) along angle `a`, its arm open by
	 * `open` (radians). */
	const staplerSide = (g: Graphics, x: number, y: number, len: number, a: number, open = 0) => {
		const at = (d: number, n: number): [number, number] => [x + Math.cos(a) * d - Math.sin(a) * n, y + Math.sin(a) * d + Math.cos(a) * n];
		const base = [...at(0, 1), ...at(len, 1), ...at(len, -2), ...at(0, -2)];
		g.poly(base).fill(p.steel).stroke({ width: 1.3, color: ink, join: "round" });
		const b = a - open;
		const at2 = (d: number, n: number): [number, number] => [x + Math.cos(b) * d - Math.sin(b) * n, y + Math.sin(b) * d + Math.cos(b) * n];
		g.poly([...at2(0, -2), ...at2(len * 0.95, -2), ...at2(len, -4), ...at2(len - 2, -7), ...at2(2, -6.5)]).fill(OFFICE.stapler).stroke({ width: 1.4, color: ink, join: "round" });
	};

	// The giant stapler, swung like the hammer: gripped by its tail, the business end where the
	// hammer's head was, the mouth on the striking side.
	parts["held/hammer"] = (g) => {
		g.roundRect(-3.6, -20, 7.2, 27, 3).fill(OFFICE.stapler).stroke({ width: 2, color: ink });
		line(g, [-1.6, -18, -1.6, 4], 1.3, 0xff8a80);
		// The head: the arm over the base plate, a staple in its mouth.
		g.roundRect(-10.5, -24, 21, 5, 2).fill(p.steel).stroke({ width: 1.8, color: ink });
		g.roundRect(-10, -29.5, 20, 7, 3.4).fill(OFFICE.stapler).stroke({ width: 2, color: ink });
		line(g, [-7, -27.6, 4, -27.6], 1.2, 0xff8a80);
		g.rect(-10.6, -24.6, 3, 2.6).fill(ink);
	};
	// The sharpener's crank: a wooden knob in the palm, the arm, and the hub where the wrench's jaw
	// met the nut (the machine turns it a third a stroke).
	parts["held/wrench"] = (g) => {
		g.roundRect(-2.4, -24, 4.8, 22, 2).fill(p.steel).stroke({ width: 1.8, color: ink });
		g.circle(0, -24, 9.4).fill(0x8a94ad).stroke({ width: 1.8, color: ink });
		g.circle(0, -24, 4.6).fill(0xdfe4ef).stroke({ width: 1.4, color: ink });
		g.circle(0, -24, 1.6).fill(ink);
		g.roundRect(-4.2, -4, 8.4, 9, 4).fill(RED).stroke({ width: 1.8, color: ink });
		line(g, [-2, -2, -2, 2], 1.1, 0xff9aa2);
	};
	// A binder clip, held up to squint at (the wrong one).
	parts["held/bolt"] = (g) => {
		g.poly([-6, -6, 6, -6, 4, -1, -4, -1]).fill(OFFICE.shades).stroke({ width: 1.6, color: ink, join: "round" });
		line(g, [-3, -6, -5, -16, 5, -16, 3, -6], 1.4, ink);
		line(g, [-3, -6, -5, -16, 5, -16, 3, -6], 0.7, 0xdfe4ef);
		line(g, [-2, -4, 2, -4], 0.8, 0x6a7090);
	};
	// A tape dispenser (the right part, at last).
	parts["held/gear"] = (g) => {
		g.moveTo(-9, -3).lineTo(-9, -10).quadraticCurveTo(-9, -20, 0, -20).quadraticCurveTo(8, -20, 9, -12).lineTo(9.5, -3).closePath().fill(OFFICE.shades).stroke({ width: 1.8, color: ink, join: "round" });
		g.circle(-1, -12, 6).fill({ color: 0xdff4ff, alpha: 0.9 }).stroke({ width: 1.3, color: ink });
		g.circle(-1, -12, 2.4).fill(0xffffff).stroke({ width: 1, color: ink });
		line(g, [5, -14, 9.5, -16], 1.2, 0xdff4ff);
		g.rect(7, -18, 3, 2).fill(p.steel);
	};
	/** A ream of copy paper in its wrapper, centred at (x, y). */
	const ream = (g: Graphics, x: number, y: number, w: number, h: number, band = 0x3d7dff) => {
		g.roundRect(x - w / 2, y - h / 2, w, h, 1.6).fill(0xffffff).stroke({ width: 2, color: ink });
		g.rect(x - w / 2 + 1, y - h / 2 + h * 0.36, w - 2, h * 0.3).fill(band);
		g.roundRect(x - 4.5, y - h / 2 + h * 0.3, 9, h * 0.42, 1).fill(0xffffff).stroke({ width: 0.9, color: ink });
		for (let k = 1; k < 4; k++) line(g, [x - w / 2 + 1.5, y + h / 2 - k * 1.6, x - w / 2 + 4, y + h / 2 - k * 1.6], 0.7, 0x9aa3bd);
	};
	parts["held/brick"] = (g) => ream(g, 0, -10, WORK.brickW, WORK.brickH);
	// The laser pointer: a slim pen, its red beam and the dot it makes on the slide.
	parts["held/torch"] = (g) => {
		line(g, [0, -20, 0, -40], 1.6, OFFICE.laser);
		g.circle(0, -42, 7).fill({ color: OFFICE.laser, alpha: 0.18 });
		g.circle(0, -42, 2.6).fill(OFFICE.laser).stroke({ width: 0.9, color: ink });
		g.roundRect(-2.6, -19, 5.2, 22, 2.4).fill(0x3a3f5c).stroke({ width: 1.8, color: ink });
		g.rect(-2.6, -19, 5.2, 4).fill(0xc3cadb);
		g.circle(0, -9, 1.3).fill(OFFICE.laser);
	};
	// The scout's seating chart, on a clipboard: desks in rows, a red X where it is.
	parts["held/map"] = (g) => {
		g.roundRect(-16, -26, 30, 21, 2).fill(0xc99a6b).stroke({ width: 2, color: ink, join: "round" });
		g.rect(-13.5, -23.5, 25, 16).fill(0xffffff);
		for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.rect(-11.5 + c * 5.8, -21 + r * 4.4, 4, 2.6).fill(0xbcd6ff);
		line(g, [3.6, -17.4, 7.6, -13.4], 1.4, RED);
		line(g, [7.6, -17.4, 3.6, -13.4], 1.4, RED);
		g.roundRect(-5, -28.5, 8, 4.5, 1.4).fill(p.steel).stroke({ width: 1.3, color: ink });
	};
	// The designer's fat marker, cap off, the chisel tip up.
	parts["held/brush"] = (g) => {
		g.roundRect(-3.2, -21, 6.4, 25, 2.6).fill(0xffffff).stroke({ width: 1.8, color: ink });
		g.rect(-3.2, -14, 6.4, 4).fill(0xff4d7a);
		g.poly([-2.6, -21, 2.6, -21, 2.2, -27, -1.6, -31]).fill(0xff4d7a).stroke({ width: 1.4, color: ink, join: "round" });
	};

	// The green-bar printout (where the blueprint was): fan-fold paper with tractor holes, a bar
	// chart up the middle. Turned, it hangs upside down.
	const printout = (g: Graphics, flip: boolean) => {
		g.roundRect(-29, -14, 58, 25, 1).fill(0xffffff).stroke({ width: W.part, color: ink });
		for (let y = -12; y < 10; y += 4.4) g.rect(-23, y, 46, 2.2).fill(OFFICE.greenbar);
		for (const x of [-26.4, 26.4]) for (let y = -11; y < 10; y += 3.6) g.circle(x, y, 0.9).fill(ink);
		const k = flip ? -1 : 1;
		const cy = -1;
		const bars = [5, 9, 7, 13, 16];
		bars.forEach((h, i) => {
			const x = -13 + i * 6;
			const y0 = cy + 7 * k;
			g.rect(x, Math.min(y0, y0 - h * k), 4, h).fill(i === bars.length - 1 ? p.go : 0x3d7dff).stroke({ width: 1, color: ink });
		});
		line(g, [-16, cy + 7 * k, 16, cy + 7 * k], 1.2, ink);
		g.roundRect(-30, -17, 60, 6, 2).fill(0xf3f4f8).stroke({ width: 2, color: ink });
		line(g, [-27, -14, 27, -14], 1, OFFICE.greenbar);
	};
	parts["prop/plan"] = (g) => printout(g, false);
	parts["prop/plan2"] = (g) => printout(g, true);
	parts["prop/roll"] = (g) => {
		g.roundRect(-31, -18, 62, 12, 6).fill(0xffffff).stroke({ width: W.part, color: ink });
		for (const x of [-20, -8, 4, 16]) g.rect(x, -17, 5, 10).fill(OFFICE.greenbar);
		g.ellipse(-31, -12, 3, 6).fill(0xf3f4f8).stroke({ width: 1.6, color: ink });
		g.ellipse(31, -12, 3, 6).fill(0xf3f4f8).stroke({ width: 1.6, color: ink });
	};

	// The work out front (reach.ts WORK) ---------------------------------------------------------

	// The in-tray stand, where the sawhorse was: a wire letter tray on thin steel legs.
	const stand = (g: Graphics) => {
		const { benchL: l, benchR: r, benchTop: t } = WORK;
		for (const [a, b] of [[l + 7, l + 3], [r - 7, r - 3]] as const) {
			line(g, [a, t + 4, b, 0], 4, ink);
			line(g, [a, t + 4, b, 0], 1.8, 0xc3cadb);
		}
		line(g, [l + 5, t + 13, r - 5, t + 13], 3, ink);
		line(g, [l + 5, t + 13, r - 5, t + 13], 1.2, 0xc3cadb);
		g.roundRect(l, t, r - l, 6, 1.5).fill(OFFICE.stand).stroke({ width: W.part, color: ink });
		for (let x = l + 5; x < r - 2; x += 5) line(g, [x, t + 1.6, x, t + 4.4], 0.9, 0xc3cadb);
	};
	/** A sheaf on the stand, its top at `top`: loose sheets squashed flatter each strike, with
	 * `staples` in its corner. */
	const sheaf = (g: Graphics, top: number, staples: number) => {
		const x = WORK.nailX;
		const t = WORK.benchTop;
		const n = 5;
		const gap = (t - top) / n;
		for (let i = 0; i < n; i++) {
			const y = t - (i + 0.5) * gap;
			const a = gap > 2 ? (i % 2 ? 0.07 : -0.06) : 0;
			g.poly(rotRect(x + (i % 2 ? 1.2 : -1), y, 26, Math.max(1.2, gap * 0.6), a)).fill(i === n - 1 ? 0xffffff : 0xf3f4f8).stroke({ width: 1, color: ink, join: "round" });
		}
		for (let k = 0; k < staples; k++) {
			const sx = x - 10 + k * 5;
			line(g, [sx, top + 2.2, sx, top + 0.6, sx + 3.4, top + 0.6, sx + 3.4, top + 2.2], 1.3, 0x56628a);
		}
	};
	parts["work/nail1"] = (g) => (stand(g), sheaf(g, WORK.nailTop[0], 0));
	parts["work/nail2"] = (g) => (stand(g), sheaf(g, WORK.nailTop[1], 1));
	parts["work/nail3"] = (g) => (stand(g), sheaf(g, WORK.nailTop[2], 2));
	parts["work/bent"] = (g) => {
		// Jammed: a staple folded up out of the sheaf, and the stapler knocked to the floor, open.
		stand(g);
		sheaf(g, WORK.nailTop[2], 1);
		const x = WORK.nailX;
		const t = WORK.nailTop[2];
		line(g, [x, t + 1, x, t - 6, x + 8, t - 9], 3.2, ink);
		line(g, [x, t + 1, x, t - 6, x + 8, t - 9], 1.4, 0xc3cadb);
		staplerSide(g, WORK.benchR + 3, -2, 27, -0.05, 0.5);
		for (const [sx, sy] of [[WORK.benchR - 4, -1.5], [WORK.benchR + 32, -2]] as const) line(g, [sx, sy, sx, sy - 1.6, sx + 3, sy - 1.6, sx + 3, sy], 1, ink);
	};

	// The giant crank pencil sharpener, where the machine was: the crank's hub on the nut, a third
	// of a turn a step; a pencil in its mouth and shavings in its drawer.
	const sharpener = (g: Graphics, step: number) => {
		const { x, y } = WORK.nut;
		line(g, [x + 4, y + 18, x + 4, y + 36], 5, ink);
		line(g, [x + 4, y + 18, x + 4, y + 36], 2.6, 0xc3cadb);
		g.roundRect(x - 12, y + 34, 32, 4, 2).fill(OFFICE.stand).stroke({ width: 1.6, color: ink });
		// The pencil, going in at the top.
		line(g, [x + 12, y - 10, x + 18, y - 19], 5, ink);
		line(g, [x + 12, y - 10, x + 18, y - 19], 3, OFFICE.pencil);
		g.circle(x + 18.4, y - 19.6, 2.2).fill(OFFICE.eraser).stroke({ width: 1.1, color: ink });
		g.roundRect(x - 12, y - 17, 32, 30, 9).fill(0xc3cadb).stroke({ width: W.part, color: ink });
		g.roundRect(x - 8, y - 14, 24, 6, 3).fill({ color: 0xffffff, alpha: 0.4 });
		// The shavings drawer, part full.
		g.roundRect(x - 9, y + 11, 26, 8, 2).fill({ color: 0xdff4ff, alpha: 0.9 }).stroke({ width: 1.6, color: ink });
		for (let k = 0; k < 6; k++) g.circle(x - 6 + k * 4, y + 16 - (k % 2), 1.6).fill(k % 3 ? p.wood : OFFICE.pencil);
		// The hub, marked so the turn shows.
		g.circle(x, y, 8.5).fill(0x8a94ad).stroke({ width: 1.6, color: ink });
		const a = (step * Math.PI) / 9;
		for (let k = 0; k < 3; k++) {
			const b = a + (k * Math.PI * 2) / 3;
			line(g, [x + Math.cos(b) * 2.6, y + Math.sin(b) * 2.6, x + Math.cos(b) * 7, y + Math.sin(b) * 7], 1.4, 0xdfe4ef);
		}
		g.circle(x, y, 2.2).fill(0x56628a).stroke({ width: 1.2, color: ink });
	};
	parts["work/nut1"] = (g) => sharpener(g, 0);
	parts["work/nut2"] = (g) => sharpener(g, 1);
	parts["work/nut3"] = (g) => sharpener(g, 2);

	// A banker's box of supplies, where the parts crate was: a hole punch, a ruler and pens sticking
	// out of the top.
	parts["work/crate"] = (g) => {
		line(g, [82, -19, 86, -32], 4.4, ink);
		line(g, [82, -19, 86, -32], 2.6, OFFICE.pencil);
		g.roundRect(57, -27, 15, 8, 2).fill(0x56628a).stroke({ width: 1.6, color: ink });
		g.roundRect(59, -31, 11, 5, 2).fill(0x8a94ad).stroke({ width: 1.4, color: ink });
		for (const [x, c] of [[75, RED], [78, 0x3d7dff]] as const) g.roundRect(x, -29, 2.6, 9, 1).fill(c).stroke({ width: 0.9, color: ink });
		g.roundRect(54, -21, 40, 21, 1.5).fill(OFFICE.box).stroke({ width: W.part, color: ink });
		g.rect(55, -21, 38, 3).fill(0xdcd3c2);
		g.roundRect(66, -15, 16, 4, 2).fill(0x8a7a62);
		g.rect(58, -8, 12, 6).fill(0xffffff).stroke({ width: 0.9, color: ink });
	};

	// Three binders lying on the stand, rocking `tilt` on a bottom corner (the brick stack's place).
	const binder = (g: Graphics, cx: number, cy: number, colour: number) => {
		g.roundRect(cx - 9, cy - 5.5, 18, 11, 1.6).fill(colour).stroke({ width: 2, color: ink });
		g.rect(cx - 5, cy - 3.4, 8, 4.2).fill(0xffffff).stroke({ width: 0.9, color: ink });
		g.circle(cx + 5.6, cy + 1, 1.6).fill(0xffffff).stroke({ width: 0.9, color: ink });
	};
	const binders = (g: Graphics, tilt: number) => {
		const t = WORK.benchTop;
		const px = tilt < 0 ? 75 : 93;
		g.save();
		g.translateTransform(-px, -t).rotateTransform(tilt * 0.12).translateTransform(px, t);
		binder(g, 84, t - 5.5, 0x3d7dff);
		binder(g, 85, t - 16.5, RED);
		binder(g, 83, t - 27.5, 0x2ecc71);
		g.restore();
	};
	parts["work/stack"] = (g) => (stand(g), binders(g, 0));
	parts["work/stackL"] = (g) => (stand(g), binders(g, -1));
	parts["work/stackR"] = (g) => (stand(g), binders(g, 1));
	parts["work/brick"] = (g) => ream(g, WORK.brick.x, WORK.brick.y, WORK.brickW, WORK.brickH);

	return { name: "office", palette: p, parts };
}
