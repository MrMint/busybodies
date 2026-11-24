// The office's rig: the paper rig's cast and parts, repainted by name where the office goes full
// office (plan-alive stream D), so every pose plays unchanged, as the factory's does. No hard hats,
// aprons, sawhorses or bricks: the construction gear is the factory's. The cast dresses as an
// over-the-top corporate office with accessories, not wigs: one silhouette idea on the dome, one
// small thing on the belly, the body colour left alone (it is the main role tell), and nothing
// touching the mouth. The builder's work becomes paperwork laid out on the same points (reach.ts
// WORK), at about the same size, so the solved arms still land on the business ends:
//
//   hammer → a giant stapler      nails → a sheaf, squashed and stapled a strike at a time
//   sawhorse → stacked letter trays   bricks → reams of paper, and binders stacked on the trays
//   wrench → a sharpener's crank  the machine's nut → a giant crank pencil sharpener (the hub is
//                                 its; the pencil goes in shorter each turn, the drawer fills)
//   crate → a banker's box        bolt, gear → a binder clip, a tape dispenser
//   blueprint → a green-bar printout   torch → a laser pointer   map → a seating chart
//
// Nothing here may still read as the workshop: each is drawn as the office thing it is (a stapler
// side on, not a hammer head; a slim crank, not a wrench), only its working end kept where the
// arms are solved to. The words follow: the poses' office titles are theme/words.ts `poses`, and
// the crew's lines in the office are sass/lines.ts `themed`.
//
// The crew's tower on the desk (binders and reams) and the recycling bin are the scene theme's
// (theme/office.ts). One part is new, and only themes with it paint it: `arm/upper/verifier`, the
// sleeve garter (the puppet uses it on the left arm when the atlas has one). One is dropped: the
// designer's `front/scarf`, so its belly is bare (the puppet shows a front piece only when the
// atlas has it).
import type { Graphics } from "pixi.js";
import { WORK } from "./reach";
import { ANCHORS, type Painter, type Palette, PAPER_PALETTE, RED, type Theme, W, line, paperTheme } from "./theme";

/** Office colours, on top of the paper palette. */
const OFFICE = {
	hairBrown: 0x4a3226,
	hairLight: 0x7a5a48,
	hairGrey: 0x9c93ad,
	hairGreyDark: 0x7c7390,
	tie: 0xff4d5e,
	pencil: 0xffc93c,
	eraser: 0xff9eb1,
	sticky: 0xffe66b,
	scrunchie: 0xff5c9a,
	visor: 0x2fb35f,
	visorDark: 0x1f7f42,
	visorShine: 0x9fe8b8,
	bumBag: 0x3f4c6b,
	beret: 0x2b2833,
	lanyard: 0x3d7dff,
	stapler: 0xe8423a,
	stand: 0x8f9ab4,
	greenbar: 0xd6f2dc,
	box: 0xf3ece0,
	laser: 0xff2d3d,
	shades: 0x262433,
} as const;

/** The costumes and work the office repaints; everything else (faces, hands, limbs, the stations,
 * effects) is the paper rig's, on purpose. The tests hold this list. */
export const OFFICE_REPAINTS = [
	"hat/lead", "hat/lead-cup", "hat/builder", "hat/scout", "hat/explorer", "hat/reviewer", "hat/verifier", "hat/designer",
	"front/tie", "front/apron", "front/kerchief", "front/straps", "front/bowtie", "front/badge",
	"wear/glasses",
	"held/hammer", "held/wrench", "held/bolt", "held/gear", "held/brick", "held/torch", "held/map", "held/brush",
	"work/nail1", "work/nail2", "work/nail3", "work/bent", "work/nut1", "work/nut2", "work/nut3", "work/crate",
	"work/stack", "work/stackL", "work/stackR", "work/brick",
	"prop/plan", "prop/plan2", "prop/roll",
] as const;

/** Parts only the office (and the factory) have (see the header). */
export const OFFICE_EXTRAS = ["arm/upper/verifier"] as const;

/** Paper parts the office leaves out on purpose (see the header). */
export const OFFICE_DROPS = ["front/scarf"] as const;

export function officeTheme(p: Palette = PAPER_PALETTE): Theme {
	const base = paperTheme(p);
	const parts: Record<string, Painter> = { ...base.parts };
	for (const name of OFFICE_DROPS) delete parts[name];
	const ink = p.ink;
	const A = ANCHORS;

	/** Draw `paint` turned by `deg` degrees about (cx, cy). */
	const turned = (g: Graphics, cx: number, cy: number, deg: number, paint: () => void) => {
		g.save();
		g.translateTransform(-cx, -cy).rotateTransform((deg * Math.PI) / 180).translateTransform(cx, cy);
		paint();
		g.restore();
	};

	/** Belly pieces sit this far below the board's (reach.ts frontY), clear of the big eyes. */
	const DROP = A.frontY + 16;
	/** Draw `paint` slid down onto the belly by DROP. */
	const low = (g: Graphics, paint: () => void) => {
		g.save();
		g.translateTransform(0, DROP);
		paint();
		g.restore();
	};

	/** A pencil from its eraser at (x1, y1) to the end of its yellow body at (x2, y2), the sharpened
	 * tip beyond. */
	const pencil = (g: Graphics, x1: number, y1: number, x2: number, y2: number) => {
		const l = Math.hypot(x2 - x1, y2 - y1);
		const ux = (x2 - x1) / l;
		const uy = (y2 - y1) / l;
		line(g, [x1, y1, x2, y2], 5.4, ink);
		line(g, [x1, y1, x2, y2], 3.2, OFFICE.pencil);
		g.circle(x1, y1, 2.5).fill(OFFICE.eraser).stroke({ width: 1.2, color: ink });
		line(g, [x2, y2, x2 + ux * 3.4, y2 + uy * 3.4], 2.6, p.wood);
		line(g, [x2 + ux * 2.6, y2 + uy * 2.6, x2 + ux * 3.6, y2 + uy * 3.6], 1.5, ink);
	};

	// The lead: the boss. One soft tuft on top, a headset with a foam mic (its boom stops short of the
	// mouth), and a short wide loud tie (the tie and the ear cup take the project accent).
	parts["hat/lead"] = (g) => {
		g.moveTo(-9, -69).bezierCurveTo(-12, -80, -2, -88, 9, -84).bezierCurveTo(4, -82, 4, -77, 8, -69).closePath().fill(OFFICE.hairBrown).stroke({ width: W.fine + 0.4, color: ink, join: "round" });
		g.moveTo(-47, -38).bezierCurveTo(-48, -84, 48, -84, 47, -38).stroke({ width: 5, color: ink, cap: "round" });
		g.moveTo(-47, -38).bezierCurveTo(-48, -84, 48, -84, 47, -38).stroke({ width: 2.2, color: 0xcfd6e6, cap: "round" });
		g.moveTo(-50, -30).quadraticCurveTo(-47, -11, -25.5, -12.6).stroke({ width: 3, color: ink, cap: "round" });
		g.circle(-22, -13, 4).fill(0x3a3f5c).stroke({ width: 1.4, color: ink });
		g.circle(-23.2, -14.3, 1.1).fill(0x6a7090);
	};
	parts["hat/lead-cup"] = (g) => {
		g.roundRect(-58, -47, 13, 21, 5.5).fill(0xffffff).stroke({ width: W.part, color: ink });
		g.roundRect(-55, -43, 4, 12, 2).fill(0xdfe4ef);
	};
	parts["front/tie"] = (g) => {
		// White with grey stripes, so the project accent tints it loud; a rounded knot.
		// Shorter than the board's, so the lower knot still ends on the body.
		const blade = [-4, -11, 4, -11, 7, -1.5, 0, 3.5, -7, -1.5];
		g.poly(blade).fill(0xffffff);
		line(g, [-4.6, -6.4, 4.2, -8.8], 1.6, 0xa0a0a0);
		line(g, [-5.8, -2, 5.6, -4.8], 1.6, 0xa0a0a0);
		g.poly(blade).stroke({ width: W.fine, color: ink, join: "round" });
		g.roundRect(-5, -16.5, 10, 6.2, 2.4).fill(0xffffff).stroke({ width: W.fine, color: ink });
	};

	// Builders: no hair. A pencil behind the right ear, a sticky note it forgot stuck to the dome, and
	// a small crooked tie.
	parts["hat/builder"] = (g) => {
		pencil(g, 31, -62, 53, -44);
		turned(g, -12, -70, -9, () => {
			g.roundRect(-23, -80, 20, 18, 1.5).fill(OFFICE.sticky).stroke({ width: 2, color: ink });
			for (const [x0, x1, y] of [[-19, -7, -75], [-19, -10, -71], [-19, -8, -67]] as const) line(g, [x0, y, x1, y], 1.3, 0xa89a70);
		});
	};
	parts["front/apron"] = (g) => {
		// The blade kicked to one side, the knot turned.
		g.poly([-2, -11, 5, -10, 14, -1.5, 9, 3, 1, -0.5]).fill(OFFICE.tie).stroke({ width: W.fine, color: ink, join: "round" });
		turned(g, 0, -13.2, 12, () => g.roundRect(-5, -16.4, 10, 6.2, 2.4).fill(OFFICE.tie).stroke({ width: W.fine, color: ink }));
	};

	// Scouts: the intern. A sprout top-knot curling over, with a scrunchie at its base, and a lanyard
	// to a big ID badge.
	parts["hat/scout"] = (g) => {
		g.moveTo(-1, -70)
			.bezierCurveTo(-12, -78, -9, -92, 3, -93)
			.bezierCurveTo(14, -93, 17, -84, 12, -80)
			.bezierCurveTo(10, -84, 6, -84, 5, -80)
			.bezierCurveTo(4, -76, 5, -73, 3, -70)
			.closePath()
			.fill(OFFICE.hairBrown)
			.stroke({ width: W.fine + 0.6, color: ink, join: "round" });
		g.moveTo(-3, -86).bezierCurveTo(0, -89, 5, -89, 8, -87).stroke({ width: 1.6, color: OFFICE.hairLight, cap: "round" });
		g.roundRect(-9, -75.5, 18, 8, 4).fill(OFFICE.scrunchie).stroke({ width: 2, color: ink });
	};
	parts["front/kerchief"] = (g) => low(g, () => {
		for (const s of [-1, 1]) {
			line(g, [s * 15, -21, s * 3, -9], 4.2, ink);
			line(g, [s * 15, -21, s * 3, -9], 2.2, OFFICE.lanyard);
		}
		g.roundRect(-9.5, -10, 19, 14, 2.4).fill(0xffffff);
		g.roundRect(-9.5, -10, 19, 4, 1.5).fill(RED);
		g.roundRect(-9.5, -10, 19, 14, 2.4).stroke({ width: W.fine, color: ink });
		g.circle(-4, -1.6, 2.6).fill(0xbcd6ff).stroke({ width: 1.2, color: ink });
		line(g, [1, -3, 7, -3], 1.3, 0x9aa3bd);
		line(g, [1, 0, 5.5, 0], 1.3, 0x9aa3bd);
	});

	// Explorers: the off-site strategist. Sunglasses parked on top of the dome, and a bum bag.
	parts["hat/explorer"] = (g) => {
		turned(g, 0, -70, -5, () => {
			line(g, [-24, -66, -37, -58], W.part, ink);
			line(g, [24, -66, 37, -58], W.part, ink);
			g.roundRect(-24, -79, 21, 14, 6).fill(OFFICE.shades).stroke({ width: W.fine + 0.4, color: ink });
			g.roundRect(3, -79, 21, 14, 6).fill(OFFICE.shades).stroke({ width: W.fine + 0.4, color: ink });
			line(g, [-3, -73, 3, -73], W.part, ink);
			line(g, [-19, -76, -14, -72], 1.8, 0x8c8aa6);
			line(g, [8, -76, 13, -72], 1.8, 0x8c8aa6);
		});
	};
	parts["front/straps"] = (g) => low(g, () => {
		g.moveTo(-47, -13).quadraticCurveTo(0, -5, 47, -13).stroke({ width: 5, color: ink, cap: "round" });
		g.moveTo(-47, -13).quadraticCurveTo(0, -5, 47, -13).stroke({ width: 2.4, color: OFFICE.bumBag, cap: "round" });
		g.roundRect(-13, -15, 26, 14, 6).fill(OFFICE.bumBag).stroke({ width: 2, color: ink });
		line(g, [-8, -10.5, 8, -10.5], 1.6, 0xc3cadb);
		g.roundRect(5, -12.5, 3.4, 6, 1.4).fill(OFFICE.pencil).stroke({ width: 1.2, color: ink });
	});

	// Reviewers: the senior partner. A grey bun with a pencil through it, half-moon reading glasses it
	// peers over, and pearls.
	parts["hat/reviewer"] = (g) => {
		g.circle(0, -80, 11.5).fill(OFFICE.hairGrey).stroke({ width: W.part, color: ink });
		g.moveTo(-0.6 + 7 * Math.cos(-2.26), -77.6 + 7 * Math.sin(-2.26)).arc(-0.6, -77.6, 7, -2.26, -0.35).stroke({ width: 1.5, color: OFFICE.hairGreyDark, cap: "round" });
		pencil(g, -17, -91, 16, -72);
	};
	parts["front/bowtie"] = (g) => {
		for (const x of [-15, -10.5, -5.4, 0, 5.4, 10.5, 15]) g.circle(x, -11.5 + DROP - (x * x) / 45, 2.5).fill(0xffffff).stroke({ width: 1.2, color: ink });
	};
	parts["wear/glasses"] = (g) => {
		// The flat top crosses the lower third of the eyes.
		const y = A.eyeY + 3.7;
		const r = 13.2;
		for (const x of [-A.eyeX, A.eyeX]) {
			g.moveTo(x - r, y).lineTo(x + r, y).arc(x, y, r, 0, Math.PI).closePath().fill({ color: 0xffffff, alpha: 0.3 }).stroke({ width: 2.2, color: ink, join: "round" });
		}
		line(g, [-A.eyeX + r, y, A.eyeX - r, y], 2, ink);
	};

	// Verifiers: the accountant. A translucent green eyeshade with the dome showing over its band, a
	// pocket protector full of pens, a sleeve garter.
	parts["hat/verifier"] = (g) => {
		// Lifted a little off the board's, so the bill's lower edge clears the big eyes.
		g.moveTo(-43, -56).quadraticCurveTo(0, -66, 43, -56).quadraticCurveTo(30, -50, 0, -49.5).quadraticCurveTo(-30, -50, -43, -56).closePath().fill({ color: OFFICE.visor, alpha: 0.55 }).stroke({ width: W.fine + 0.6, color: ink, join: "round" });
		g.moveTo(-28, -54.5).quadraticCurveTo(0, -59, 20, -55.5).stroke({ width: 1.8, color: OFFICE.visorShine, cap: "round" });
		g.moveTo(-40, -57).quadraticCurveTo(0, -68, 40, -57).stroke({ width: 6, color: ink, cap: "round" });
		g.moveTo(-40, -57).quadraticCurveTo(0, -68, 40, -57).stroke({ width: 3.2, color: OFFICE.visorDark, cap: "round" });
	};
	parts["front/badge"] = (g) => {
		low(g, () => {
			[RED, 0x3d7dff, ink].forEach((c, i) => g.roundRect(11 + i * 4.2, -19 + (i % 2), 3.2, 9, 1.2).fill(c).stroke({ width: 1.2, color: ink }));
			g.roundRect(9, -13, 15, 12, 2).fill(0xffffff).stroke({ width: W.fine, color: ink });
			line(g, [12, -6, 21, -6], 1.3, 0x9aa3bd);
		});
	};
	parts["arm/upper/verifier"] = (g) => {
		line(g, [0, 0, 0, A.upper], 6, ink);
		g.roundRect(-4.6, 5, 9.2, 4.6, 1.6).fill(ink);
		g.rect(-4, 6.6, 8, 1.4).fill(RED);
		g.roundRect(-1.2, 4.4, 2.4, 5.8, 0.6).fill(p.steel).stroke({ width: 0.7, color: ink });
	};

	// Designers: the creative director. A tilted black beret and big round frames; nothing else (the
	// belly is bare: no front/scarf).
	parts["hat/designer"] = (g) => {
		const r = 15.6;
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, A.eyeY, r).fill({ color: 0xffffff, alpha: 0.2 }).stroke({ width: 2, color: ink });
		g.moveTo(-A.eyeX + r, A.eyeY - 2).quadraticCurveTo(0, A.eyeY - 6, A.eyeX - r, A.eyeY - 2).stroke({ width: 2, color: ink, cap: "round" });
		turned(g, 0, -70, -7, () => {
			g.roundRect(-1, -91, 5, 9, 2.2).fill(ink);
			g.ellipse(-3, -73, 37, 12.5).fill(OFFICE.beret).stroke({ width: W.part, color: ink });
			g.ellipse(-13, -77, 14, 3.4).fill({ color: 0xffffff, alpha: 0.14 });
		});
	};

	// Held tools -----------------------------------------------------------------------------------

	/** Where a stapler's point (`d` along it from the tail, `h` up from the bottom of its base) lands. */
	type Side = (d: number, h: number) => [number, number];
	/** Points along a quadratic curve from `a` to `b` pulled toward `c`, `a` left out. */
	const curve = (a: [number, number], c: [number, number], b: [number, number], n = 5) =>
		Array.from({ length: n }, (_, i) => {
			const t = (i + 1) / n;
			const u = 1 - t;
			return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as [number, number];
		});
	/**
	 * A desktop stapler side on, 35.5 long and 16 high, laid out by `at` (see Side): a steel base
	 * plate, the staple channel over it, and the chunky red top arm on its hinge at the tail, the
	 * rounded nose at the far end. `open` swings the arm (with its channel) up about the hinge, in
	 * radians; the jaw is always a little open at the nose.
	 */
	const stapler = (g: Graphics, at: Side, open = 0) => {
		const pts = (q: [number, number][], f: Side = at) => q.flatMap(([d, h]) => f(d, h));
		const hinge: [number, number] = [3.4, 5.2];
		const arm: Side = (d, h) => {
			const [c, sn] = [Math.cos(open), Math.sin(open)];
			const [dd, dh] = [d - hinge[0], h - hinge[1]];
			return at(hinge[0] + dd * c - dh * sn, hinge[1] + dd * sn + dh * c);
		};
		// The base plate, its anvil under the nose.
		g.poly(pts([[0.6, 0], [33.4, 0], [35.4, 1.6], [33.4, 3.4], [0.6, 3.4]])).fill(p.steel).stroke({ width: 1.4, color: ink, join: "round" });
		line(g, [...at(26.5, 3.4), ...at(32, 3.4)], 1.6, 0x56628a);
		// The staple channel, opening toward the nose, and the staples' line along it.
		g.poly(pts([[1.6, 4], [31.6, 6.2], [31.6, 8.8], [1.6, 6.6]], arm)).fill(0xdfe4ef).stroke({ width: 1.3, color: ink, join: "round" });
		line(g, [...arm(5, 5.7), ...arm(29, 7.4)], 1.2, 0x6a7090);
		// The top arm: low at the tail, a rounded nose overhanging the channel's mouth.
		const top: [number, number][] = [
			[1, 6.4],
			[31, 8.6],
			...curve([31, 8.6], [36, 8.2], [35.6, 11.2]),
			...curve([35.6, 11.2], [35.4, 15.2], [30.5, 15.2]),
			[10, 15.8],
			...curve([10, 15.8], [0, 16.2], [0, 10]),
		];
		g.poly(pts(top, arm)).fill(OFFICE.stapler).stroke({ width: W.fine, color: ink, join: "round" });
		line(g, [...arm(10, 13.8), ...arm(29, 13.2)], 1.6, 0xff8a80);
		// The hinge pin.
		const [hx, hy] = at(...hinge);
		g.circle(hx, hy, 2.3).fill(p.steel).stroke({ width: 1.3, color: ink });
	};

	// The giant stapler, swung like the hammer and gripped near its tail: it lies along the handle,
	// base plate on the striking side (the hammer head's face that meets the nail, 10.5 out on +x:
	// the strike turns the hand a quarter turn, so +x is down), so at the strike it lands flat on
	// the sheaf with the palm pressing its back end, and in the wind-up it is held aloft. Squeezed
	// a little along its length to stay in the hammer's box (the atlas, and the test that holds it).
	parts["held/hammer"] = (g) => stapler(g, (d, h) => [10.5 - h, 3.5 - d * 0.95]);
	// The sharpener's crank: a slim steel arm from the wooden knob in the palm to a cap on the hub
	// (the sharpener's own: work/nut*), which the arms turn a third a stroke.
	parts["held/wrench"] = (g) => {
		line(g, [0, -1, 0, -24], 4.4, ink);
		line(g, [0, -1, 0, -24], 2.2, 0xdfe4ef);
		g.circle(0, -24, 3.2).fill(p.steel).stroke({ width: 1.4, color: ink });
		g.circle(0, -0.5, 4.6).fill(p.wood).stroke({ width: 1.6, color: ink });
		g.circle(-1.4, -2, 1.3).fill(0xf0c48a);
	};
	// A binder clip, held up to squint at (the wrong one): the black jaws in the fingers, both silver
	// handles folded up.
	parts["held/bolt"] = (g) => {
		// The handles splay out like ears, each a wire loop from the top of the jaws.
		for (const s of [-1, 1]) {
			turned(g, s * 3.6, -10, s * 18, () => {
				line(g, [s * 3.6 - 3.4, -10, s * 3.6 - 3.4, -21, s * 3.6 + 3.4, -21, s * 3.6 + 3.4, -10], 3.6, ink);
				line(g, [s * 3.6 - 3.4, -10, s * 3.6 - 3.4, -21, s * 3.6 + 3.4, -21, s * 3.6 + 3.4, -10], 1.6, 0xdfe4ef);
			});
		}
		g.poly([-7, -11.5, 7, -11.5, 9.5, -1, -9.5, -1]).fill(OFFICE.shades).stroke({ width: W.fine, color: ink, join: "round" });
		line(g, [-6, -9.2, 6, -9.2], 1.4, 0x6a7090);
	};
	// A tape dispenser (the right part, at last): a heavy charcoal body, its hump low at the back, a
	// fat roll standing up out of it (pale see-through tape on a bright card core), the tape running
	// to the serrated cutter at the nose. As big as the gear's box allows, so it reads at room zoom.
	parts["held/gear"] = (g) => {
		const [cx, cy, r] = [-1.5, -14.5, 9.8];
		g.moveTo(-14.6, 2.4)
			.lineTo(-14.6, -10)
			.arc(-7.4, -10, 7.2, Math.PI, Math.PI * 1.6)
			.lineTo(4, -13)
			.lineTo(13.2, -10.5)
			.lineTo(13.2, 2.4)
			.closePath()
			.fill(OFFICE.shades)
			.stroke({ width: W.part, color: ink, join: "round" });
		line(g, [-12, -1.4, 10.6, -1.4], 1.4, 0x6a7090);
		// The tape, off the roll's front to the cutter.
		line(g, [cx + r * 0.9, cy + r * 0.44, 13.6, -11], 1.8, 0xbfe6ff);
		g.poly([12.2, -13.2, 15.4, -12.6, 14.2, -11.4, 15.6, -10.2, 14.2, -9.2, 15.4, -8, 12.2, -7.6])
			.fill(p.steel)
			.stroke({ width: 1.1, color: ink, join: "round" });
		// The roll: a pale band of tape, a glint on it, and the card core.
		g.circle(cx, cy, r).fill({ color: 0xe6f6ff, alpha: 0.9 }).stroke({ width: W.fine, color: ink });
		const [a0, a1, gr] = [Math.PI * 1.08, Math.PI * 1.42, r - 2.4];
		g.moveTo(cx + gr * Math.cos(a0), cy + gr * Math.sin(a0))
			.arc(cx, cy, gr, a0, a1)
			.stroke({ width: 1.6, color: 0xffffff, cap: "round" });
		g.circle(cx, cy, 4.6).fill(OFFICE.pencil).stroke({ width: 1.5, color: ink });
		g.circle(cx, cy, 1.8).fill(OFFICE.shades);
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

	// The in-tray stand, where the sawhorse was: a stack of three letter trays on straight risers,
	// paper sticking out of the lower two; the top tray is the work surface.
	const stand = (g: Graphics) => {
		const { benchL: l, benchR: r, benchTop: t } = WORK;
		for (const x of [l + 5, r - 5]) {
			line(g, [x, t + 3, x, -2], 3.6, ink);
			line(g, [x, t + 3, x, -2], 1.6, 0xc3cadb);
		}
		for (const y of [t + 8, t + 16]) {
			// The tray's papers, sticking out past its front.
			g.poly([l + 4, y - 2.6, r + 5, y - 3.4, r + 5.4, y + 0.4, l + 4, y + 0.4]).fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [r - 6, y - 1.4, r + 4, y - 1.8], 1.2, 0xc3cadb);
			g.roundRect(l, y, r - l, 5, 1.6).fill(OFFICE.stand).stroke({ width: W.fine, color: ink });
			line(g, [l + 3, y + 2.5, l + 12, y + 2.5], 1.2, 0xc3cadb);
		}
		g.roundRect(l, t, r - l, 5.5, 1.6).fill(OFFICE.stand).stroke({ width: W.part, color: ink });
		line(g, [l + 3, t + 2.6, l + 12, t + 2.6], 1.2, 0xc3cadb);
		for (const x of [l + 2, r - 8]) g.roundRect(x, -2.4, 6, 2.4, 1).fill(ink);
	};
	/** A sheaf on the stand, its top at `top`: loose sheets squashed flatter each strike, with
	 * `staples` in its corner. */
	const sheaf = (g: Graphics, top: number, staples: number) => {
		const x = WORK.nailX;
		const t = WORK.benchTop;
		// Loose, it is a pile of sheets with ragged edges; squashed flat, one neat block.
		const n = top < t - 5 ? 5 : 1;
		const gap = (t - top) / n;
		for (let i = 0; i < n; i++) {
			const off = n > 1 ? [-1.5, 1.2, -0.4, 1.8, 0][i]! : 0;
			g.rect(x - 13 + off, t - (i + 1) * gap, 26, gap).fill(i === n - 1 ? 0xffffff : 0xf3f4f8).stroke({ width: 1.2, color: ink, join: "round" });
		}
		if (n === 1) line(g, [x - 11, top + gap / 2, x + 11, top + gap / 2], 1, 0xc3cadb);
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
		stapler(g, (d, h) => [WORK.benchR + 2 + d * 0.8, -h * 0.8], 0.5);
		for (const [sx, sy] of [[WORK.benchR - 4, -1.5], [WORK.benchR + 32, -2]] as const) line(g, [sx, sy, sx, sy - 1.6, sx + 3, sy - 1.6, sx + 3, sy], 1, ink);
	};

	// The giant crank pencil sharpener, where the machine was: a boxy body on a post, the crank's hub
	// on its side (the crank's cap meets it at the nut, a third of a turn a step), a fat pencil going
	// in at the front that is shorter every step, and the shavings drawer filling up under it.
	const sharpener = (g: Graphics, step: number) => {
		const { x, y } = WORK.nut;
		line(g, [x + 1, y + 26, x + 1, y + 37], 6, ink);
		line(g, [x + 1, y + 26, x + 1, y + 37], 3.4, 0xc3cadb);
		g.roundRect(x - 11, y + 35, 24, 4, 2).fill(OFFICE.stand).stroke({ width: 1.6, color: ink });
		// The pencil, going in at the front: shorter every step, the eraser end out.
		const tip = x + 17;
		const end = tip + [24, 16, 8][step]!;
		const py = y - 7;
		line(g, [tip, py, end, py], 8, ink);
		line(g, [tip, py, end, py], 5.4, OFFICE.pencil);
		line(g, [tip, py - 1, end, py - 1], 1.2, 0xe0a81e);
		g.rect(end - 1, py - 3.6, 3.4, 7.2).fill(p.steel).stroke({ width: 1.2, color: ink });
		g.roundRect(end + 2, py - 3.6, 4.2, 7.2, 2).fill(OFFICE.eraser).stroke({ width: 1.2, color: ink });
		// The body: a box with a lid, and the collar the pencil goes in by.
		g.roundRect(x - 13, y - 19, 31, 31, 4).fill(0xd5dbe8).stroke({ width: W.part, color: ink });
		g.roundRect(x - 13, y - 19, 31, 6, 3).fill(0x8a94ad).stroke({ width: W.fine, color: ink });
		g.roundRect(x + 16, py - 5, 4, 10, 1.6).fill(0x8a94ad).stroke({ width: 1.4, color: ink });
		// The shavings drawer, clear, filling a step at a time.
		g.roundRect(x - 11, y + 12, 27, 14, 2.5).fill({ color: 0xdff4ff, alpha: 0.95 }).stroke({ width: W.fine, color: ink });
		const curls = [3, 6, 10][step]!;
		for (let k = 0; k < curls; k++) {
			const cx = x - 7 + (k % 5) * 5 + (k >= 5 ? 2.5 : 0);
			const cy = y + 23 - Math.floor(k / 5) * 3.6;
			g.circle(cx, cy, 2.2).fill(k % 3 ? p.wood : OFFICE.pencil).stroke({ width: 1, color: ink });
		}
		line(g, [x - 1, y + 15, x + 6, y + 15], 1.6, ink);
		// The hub, on the body's side, marked so the turn shows.
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
