// The bakery's rig (plan-alive wave 4, stream L): a patisserie gone over the top. The same cast and
// parts as the paper rig, repainted by name as the office's and the factory's are, so every pose
// plays unchanged: the crew in pastel bakers' gear, each role told apart by its headwear at room
// zoom; the builder's work becomes baking on the same points (reach.ts WORK), and the station parts
// the hands work become bakery kit at the same working points (reach.ts STATION, AT, TRAY,
// PLANNER), at about the same size, so the solved reaches still land on the business ends:
//
//   hammer → a hand rolling pin       nails → a ball of dough, rolled flatter a pass at a time
//   sawhorse → a floured pastry bench   bricks → cake layers, stacked into a dripping layer cake
//   wrench → the stand mixer's crank    the machine's nut → a pastel stand mixer, batter in the bowl
//   crate → a bread basket of baguettes and a croissant
//   bolt, gear → a pistachio macaron (the wrong one), a sprinkle doughnut (the right one)
//   blueprint → a recipe card   torch → a crème brûlée torch   map → the cake order on a clipboard
//   brush → a piping bag
//
//   filing drawer → a proofing drawer of dough balls rising in their tins
//   copier → a deck oven: the lid its hood, a tray of croissants on the deck, croissants out on the
//            cooling rack, a burnt baguette stuck in the lower door
//   stamp desk → tasting: a cake fork, the cake, slices on plates flagged yes or no
//   notepad → the order pad       outbox → the display counter, a pastry box set on it
//   shredder → the crumb bin, burnt cookies waiting beside it   in-tray → a teetering tray of pastries
//   planner notes → order slips   envelope → a pastry box with a ribbon   the PR → a cake under a dome
//   the parcel → a cake box   the mug → a cappuccino   the trophy → a frosted gold cup
//   a sheet of paper → a tray of croissants   confetti → sprinkles
//
// The bell is the paper rig's brass bell; its ding says "fresh!". Drawn like the office: cut paper,
// ink outlines, flat fills, with a white gloss on everything sweet and sprinkles wherever they fit.
// Costumes, by role (the headwear does the telling apart):
//
//   lead      the head baker: the tallest toque, banded in the project accent with a bow on it, a
//             big accent bow at the collar and a croissant brooch on the jacket
//   builder   the bread baker: a pink gingham headscarf knotted in a bow on top, a candy-striped
//             bib apron with a whisk in the pocket and an oven mitt, flour everywhere
//   scout     the barista: a coffee-brown flat cap with a bean pin, a Breton top, a brown waist
//             apron with a takeaway cup steaming in its pocket
//   explorer  the candy-maker: a candy-striped paper cap with a swirl lollipop stuck in it, a
//             candy-cane strap and a jar of gumballs on the hip
//   reviewer  the pâtissier: a puffed mushroom toque, the double-breasted jacket, a chocolate
//             bow tie, a tasting fork and spoon in the pocket, gold glasses on a chain
//   verifier  the taster: a cupcake hat (pleated liner, three swirls of frosting, sprinkles, a
//             cherry), a dotted smock, a prize doughnut rosette
//   designer  the cake decorator: a tiny tiered cake on a headband, a mint smock with icing dripping
//             off the collar, a piping bag and a palette knife in the pocket
import type { Graphics } from "pixi.js";
import { bodyEdge } from "./factory";
import { AT, BELL, PLANNER, STATION, STICKY, TRAY, WORK, handAt } from "./reach";
import { ROLES } from "./roles";
import { ANCHORS, type Painter, type Palette, PAPER_PALETTE, RED, type Theme, TRAY_FULL, W, burstAt, line, mochiPath, paperTheme, rotRect, sparkle, text } from "./theme";

/** Bakery colours, on top of the paper palette. */
export const BAKERY = {
	whites: 0xfffaf2,
	whitesShade: 0xf0e2d4,
	pink: 0xffb3cf,
	pinkDeep: 0xff7fae,
	pinkPale: 0xffdbe8,
	mint: 0xaeeed6,
	mintDeep: 0x5cc9a0,
	lemon: 0xffe27a,
	lemonDeep: 0xe8b84a,
	lavender: 0xd9c8ff,
	sky: 0xb8dcff,
	pistachio: 0xc4e08a,
	cream: 0xfff6e8,
	buttercream: 0xfff1c9,
	vanilla: 0xffe0a0,
	choc: 0x7a4630,
	chocLight: 0xa8693f,
	golden: 0xf2b350,
	goldenDeep: 0xd98a2e,
	dough: 0xfbe6c2,
	doughShade: 0xeccb98,
	cherry: 0xe8233f,
	berry: 0xff4f73,
	coffee: 0x7a4a2e,
	coffeeDark: 0x5a3420,
	crema: 0xd9a46a,
	navy: 0x2f4a8a,
	wood: 0xd9a56b,
	board: 0xecc896,
	wicker: 0xd9a05b,
	steel: 0xc3cadb,
	steelDark: 0x56628a,
	glass: 0xd8f0ff,
	gold: 0xf2c94c,
	flame: 0x3d9bff,
	burnt: 0x4a3226,
	ticket: 0xfffdf4,
	plate: 0xffffff,
} as const;

/** Sprinkle colours. */
const SPRINKLES = [0xff5c9a, 0xffd23f, 0x3d9bff, 0x2ecc71, 0xffffff, 0xb07ae8, 0xff8a1f] as const;

/** The costumes, the builder's work and the station parts the bakery repaints; everything else
 * (faces, hands, limbs, the receiver, the card tray, the bell, most effects) is the paper rig's, on
 * purpose. The tests hold this list. */
export const BAKERY_REPAINTS = [
	...ROLES.map((r) => `body/${r}`),
	"hat/lead", "hat/lead-cup", "hat/builder", "hat/scout", "hat/explorer", "hat/reviewer", "hat/verifier", "hat/designer",
	"front/tie", "front/apron", "front/kerchief", "front/straps", "front/bowtie", "front/badge", "front/scarf",
	"wear/glasses",
	"held/hammer", "held/wrench", "held/bolt", "held/gear", "held/brick", "held/torch", "held/map", "held/brush", "held/mug", "held/paper", "held/trophy",
	"held/stamp", "held/stampG", "held/stampR", "held/envelope", "held/crumple", "held/slip", "held/feed1", "held/feed2", "held/feed3",
	"held/sticky", "held/stickyFlap",
	"prop/plan", "prop/plan2", "prop/roll", "prop/box", "prop/bigEnvelope",
	"work/nail1", "work/nail2", "work/nail3", "work/bent", "work/nut1", "work/nut2", "work/nut3", "work/crate",
	"work/stack", "work/stackL", "work/stackR", "work/brick",
	"work/cabinet", "work/drawer", "work/drawerGap",
	"work/copier", "work/lidHalf", "work/lidUp", "work/lidSheet", "work/scan", "work/copy1", "work/copy2", "work/jam", "work/door",
	"work/doorTug", "work/doorOpen", "work/jammed", "work/kicked", "work/jabbed", "work/kickSpit",
	"work/forms", "work/formsOk", "work/formsSlid", "work/formsR", "work/formsNo",
	"work/note0", "work/note1", "work/note2", "work/note3", "work/noteFlip",
	"work/outbox", "work/mail1", "work/mail2",
	"work/shred", "work/shred4", "work/shredBuzz",
	"work/tray1", "work/tray2", "work/tray3", "work/tray4", "work/tray4L", "work/tray4R", "work/traySlide", "work/trayDrop",
	"work/stickyOn",
	"fx/ding", "fx/toss", "fx/conf1", "fx/conf2", "fx/conf3",
] as const;

/** `c` moved `t` of the way toward `to`, per channel. */
const mix = (c: number, to: number, t: number) => {
	const ch = (v: number, s: number) => (v >> s) & 0xff;
	const m = (s: number) => Math.round(ch(c, s) + (ch(to, s) - ch(c, s)) * t) << s;
	return m(16) | m(8) | m(0);
};

/** Clip a polygon to a convex one (Sutherland-Hodgman), both as flat [x, y, ...] lists. */
function clipConvex(subject: number[], clip: number[]): number[] {
	type P = [number, number];
	const pts = (a: number[]) => {
		const r: P[] = [];
		for (let i = 0; i < a.length; i += 2) r.push([a[i]!, a[i + 1]!]);
		return r;
	};
	const C = pts(clip);
	let area = 0;
	for (let i = 0; i < C.length; i++) {
		const a = C[i]!;
		const b = C[(i + 1) % C.length]!;
		area += a[0] * b[1] - b[0] * a[1];
	}
	const s = Math.sign(area) || 1;
	let out = pts(subject);
	for (let i = 0; i < C.length && out.length; i++) {
		const a = C[i]!;
		const b = C[(i + 1) % C.length]!;
		const side = (q: P) => s * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
		const cut = (q: P, r: P): P => {
			const t = side(q) / (side(q) - side(r));
			return [q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t];
		};
		const was = out;
		out = [];
		for (let j = 0; j < was.length; j++) {
			const q = was[j]!;
			const r = was[(j + 1) % was.length]!;
			const qi = side(q) >= 0;
			const ri = side(r) >= 0;
			if (ri) {
				if (!qi) out.push(cut(q, r));
				out.push(r);
			} else if (qi) out.push(cut(q, r));
		}
	}
	return out.flat();
}

/** Stripes across a convex region: `dir` "v" (leaning `lean` per unit of height) or "h". */
function bands(g: Graphics, region: number[], color: number, step: number, w: number, dir: "v" | "h", lean = 0, alpha = 1) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (let i = 0; i < region.length; i += 2) {
		x0 = Math.min(x0, region[i]!);
		x1 = Math.max(x1, region[i]!);
		y0 = Math.min(y0, region[i + 1]!);
		y1 = Math.max(y1, region[i + 1]!);
	}
	const h = y1 - y0;
	const stripe: number[][] = [];
	if (dir === "v") for (let k = x0 - Math.abs(lean) * h - step; k < x1 + Math.abs(lean) * h; k += step) stripe.push([k, y1, k + w, y1, k + w + lean * h, y0, k + lean * h, y0]);
	else for (let k = y0 + step / 2 - w / 2; k < y1; k += step) stripe.push([x0, k, x1, k, x1, k + w, x0, k + w]);
	for (const s of stripe) {
		const c = clipConvex(s, region);
		if (c.length >= 6) g.poly(c).fill({ color, alpha });
	}
}

/** A half-ellipse dome standing on `base`: from the left foot, over the top, to the right foot. */
function dome(cx: number, base: number, halfW: number, h: number, n = 18): number[] {
	const pts: number[] = [];
	for (let i = 0; i <= n; i++) {
		const t = (i / n) * Math.PI;
		pts.push(cx - halfW * Math.cos(t), base - h * Math.sin(t));
	}
	return pts;
}

/** The cut-paper gloss: a soft white highlight. */
const gloss = (g: Graphics, x: number, y: number, rx: number, ry: number, alpha = 0.6) => g.ellipse(x, y, rx, ry).fill({ color: 0xffffff, alpha });

/** Sprinkles scattered in a box (deterministic from `seed`), skipping any point `keep` refuses. */
function sprinkles(g: Graphics, x0: number, y0: number, x1: number, y1: number, n: number, seed: number, size = 1, keep?: (x: number, y: number) => boolean) {
	for (let i = 0; i < n; i++) {
		const k = i * 37 + seed * 11 + 5;
		const x = x0 + (((k * 29) % 97) / 97) * (x1 - x0);
		const y = y0 + (((k * 53) % 89) / 89) * (y1 - y0);
		if (keep && !keep(x, y)) continue;
		g.poly(rotRect(x, y, 3 * size, 1.2 * size, (k % 7) * 0.45)).fill(SPRINKLES[(i + seed) % SPRINKLES.length]!);
	}
}

/** Icing along `y` from `x0` to `x1`, hanging in drips of the given lengths; outlined as one piece. */
function drips(g: Graphics, x0: number, x1: number, y: number, color: number, lengths: number[], ink: number, r = 2, top = 2) {
	const pts: number[] = [x1, y - top, x0, y - top, x0, y + 1];
	const n = lengths.length;
	for (let i = 0; i < n; i++) {
		const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
		const L = lengths[i]!;
		pts.push(x - r, y + 1, x - r, y + L);
		for (let k = 1; k < 6; k++) {
			const t = (k / 6) * Math.PI;
			pts.push(x - r * Math.cos(t), y + L + r * Math.sin(t));
		}
		pts.push(x + r, y + L, x + r, y + 1);
	}
	pts.push(x1, y + 1);
	g.poly(pts).fill(color).stroke({ width: 1.1, color: ink, join: "round" });
	g.rect(x0 + 1.5, y - top + 0.6, x1 - x0 - 3, 0.9).fill({ color: 0xffffff, alpha: 0.55 });
}

export function bakeryTheme(p: Palette = PAPER_PALETTE): Theme {
	const base = paperTheme(p);
	const parts: Record<string, Painter> = { ...base.parts };
	const ink = p.ink;
	const A = ANCHORS;
	const T = A.bodyTop;
	const F = A.frontY;
	const S = STATION;
	const at = (q: { x: number; y: number }) => ({ x: S.x + q.x, y: S.y + q.y });

	// Sweets ---------------------------------------------------------------------------------------

	/** A croissant, `w` across, centred at (x, y): five glossy segments, the middle one biggest. */
	const croissant = (g: Graphics, x: number, y: number, w: number, fill: number = BAKERY.golden, edge: number = BAKERY.goldenDeep) => {
		const h = w * 0.5;
		const sw = Math.max(0.7, w / 14);
		for (const k of [-2, 2, -1, 1, 0]) {
			const cx = x + k * w * 0.2;
			const cy = y + Math.abs(k) * Math.abs(k) * h * 0.09 - h * 0.08;
			const rx = w * (0.19 - Math.abs(k) * 0.035);
			const ry = h * (0.5 - Math.abs(k) * 0.12);
			g.ellipse(cx, cy, rx, ry).fill(Math.abs(k) === 2 ? edge : fill).stroke({ width: sw, color: ink });
		}
		gloss(g, x - w * 0.05, y - h * 0.28, w * 0.09, h * 0.1, 0.7);
	};
	/** A macaron side on, `w` across, centred at (x, y): two shells, the filling and the ruffled feet. */
	const macaron = (g: Graphics, x: number, y: number, w: number, shell: number, filling: number = BAKERY.cream) => {
		const h = w * 0.62;
		const sw = Math.max(0.7, w / 12);
		g.roundRect(x - w / 2, y - h / 2, w, h * 0.42, h * 0.2).fill(shell).stroke({ width: sw, color: ink });
		g.roundRect(x - w / 2, y + h * 0.08, w, h * 0.42, h * 0.2).fill(shell).stroke({ width: sw, color: ink });
		g.rect(x - w / 2 + sw, y - h * 0.08, w - sw * 2, h * 0.16).fill(filling);
		gloss(g, x - w * 0.18, y - h * 0.36, w * 0.16, h * 0.07, 0.75);
		for (const dy of [-h * 0.1, h * 0.12]) for (let k = 0; k < 4; k++) g.circle(x - w * 0.36 + k * w * 0.24, y + dy, w * 0.045).fill(mix(shell, ink, 0.18));
	};
	/** A doughnut from above, radius `r`: the glaze, its sprinkles, the hole. */
	const doughnut = (g: Graphics, x: number, y: number, r: number, glaze: number = BAKERY.pink, seed = 0) => {
		const sw = Math.max(0.8, r / 6);
		g.circle(x, y, r).fill(BAKERY.golden).stroke({ width: sw, color: ink });
		const wave: number[] = [];
		for (let i = 0; i < 16; i++) {
			const a = (i / 16) * Math.PI * 2;
			const rr = r * (i % 2 ? 0.84 : 0.74);
			wave.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
		}
		g.poly(wave).fill(glaze);
		gloss(g, x - r * 0.4, y - r * 0.45, r * 0.25, r * 0.13, 0.75);
		sprinkles(g, x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, 12, seed, r / 8, (px, py) => {
			const d = Math.hypot(px - x, py - y);
			return d > r * 0.38 && d < r * 0.68;
		});
		g.circle(x, y, r * 0.28).fill(BAKERY.goldenDeep).stroke({ width: sw * 0.8, color: ink });
	};
	/** A cherry: red, glossy, a stem curling up and right. */
	const cherry = (g: Graphics, x: number, y: number, r: number) => {
		g.moveTo(x, y - r * 0.6).quadraticCurveTo(x + r * 0.3, y - r * 1.8, x + r * 1.2, y - r * 2.1).stroke({ width: Math.max(0.8, r * 0.3), color: 0x5a7a3a, cap: "round" });
		g.circle(x, y, r).fill(BAKERY.cherry).stroke({ width: Math.max(0.8, r * 0.28), color: ink });
		gloss(g, x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.22, 0.85);
	};
	/** A cupcake side on, `w` across its liner, standing on `y`. */
	const cupcake = (g: Graphics, x: number, y: number, w: number, frosting: number = BAKERY.pink, seed = 0) => {
		const sw = Math.max(0.7, w / 12);
		const h = w * 0.55;
		g.poly([x - w * 0.4, y, x + w * 0.4, y, x + w * 0.5, y - h, x - w * 0.5, y - h]).fill(BAKERY.sky).stroke({ width: sw, color: ink, join: "round" });
		for (let k = -2; k <= 2; k++) line(g, [x + k * w * 0.16, y - 0.5, x + k * w * 0.2, y - h + 0.5], sw * 0.6, mix(BAKERY.sky, ink, 0.3));
		g.moveTo(x - w * 0.56, y - h).quadraticCurveTo(x - w * 0.5, y - h - w * 0.5, x, y - h - w * 0.62).quadraticCurveTo(x + w * 0.5, y - h - w * 0.5, x + w * 0.56, y - h).closePath().fill(frosting).stroke({ width: sw, color: ink });
		gloss(g, x - w * 0.2, y - h - w * 0.3, w * 0.14, w * 0.08, 0.7);
		sprinkles(g, x - w * 0.4, y - h - w * 0.45, x + w * 0.4, y - h - w * 0.08, 5, seed, w / 14);
	};

	// Bodies: each role's own garment below the face, the role colour above, so the roles still tell
	// apart by colour too. The head baker and the pâtissier wear the double-breasted white jacket.
	const outline = mochiPath();
	const lower: number[] = [];
	for (let i = 0; i < outline.length; i += 2) if (outline[i + 1]! >= -21) lower.push(outline[i]!, outline[i + 1]!);
	const flour = (g: Graphics, x: number, y: number, s: number) => {
		for (const [dx, dy, r] of [[0, 0, 3.2], [3, 1.5, 2.4], [-2.6, 2, 2], [1.4, -2.4, 1.8]] as const) g.circle(x + dx * s, y + dy * s, r * s).fill({ color: 0xffffff, alpha: 0.82 });
	};
	const buttons = (g: Graphics, colour: number) => {
		line(g, [6, -18, 3, -3], 1.1, BAKERY.whitesShade);
		for (const x of [-11, 13]) for (const y of [-14, -8]) {
			g.circle(x + (y + 14) * 0.1, y, 1.8).fill(colour).stroke({ width: 0.8, color: ink });
		}
	};
	const GARMENT: Record<(typeof ROLES)[number], { fill: number; seam: number; dress?: (g: Graphics) => void }> = {
		lead: {
			fill: BAKERY.whites,
			seam: BAKERY.pink,
			dress: (g) => {
				buttons(g, BAKERY.pinkDeep);
				croissant(g, -26, -10, 13);
			},
		},
		builder: {
			fill: BAKERY.cream,
			seam: BAKERY.whitesShade,
			dress: (g) => {
				flour(g, -36, -46, 1);
				flour(g, 34, -56, 0.8);
				flour(g, -30, -8, 0.9);
			},
		},
		scout: { fill: 0xffffff, seam: BAKERY.navy, dress: (g) => bands(g, lower, BAKERY.navy, 4.6, 2, "h") },
		explorer: { fill: 0xffffff, seam: BAKERY.berry, dress: (g) => bands(g, lower, BAKERY.berry, 8, 3.4, "v", 0.7) },
		reviewer: { fill: BAKERY.whites, seam: BAKERY.lavender, dress: (g) => buttons(g, BAKERY.choc) },
		verifier: {
			fill: BAKERY.pinkPale,
			seam: BAKERY.pink,
			dress: (g) => {
				for (let y = -17; y < 0; y += 5.5) for (let x = -44 + ((y + 17) % 11 ? 3 : 0); x < 46; x += 7) if (bodyEdge(y) > Math.abs(x) + 3) g.circle(x, y, 1.7).fill(0xffffff);
			},
		},
		designer: {
			fill: BAKERY.mint,
			seam: BAKERY.mintDeep,
			dress: (g) => sprinkles(g, -40, -14, 40, -3, 22, 3, 1, (x, y) => bodyEdge(y) > Math.abs(x) + 3),
		},
	};
	for (const role of ROLES) {
		const col = p.role[role];
		const gm = GARMENT[role];
		parts[`body/${role}`] = (g) => {
			g.poly(outline).fill(col);
			g.poly(lower).fill(gm.fill);
			gm.dress?.(g);
			// The collar band.
			g.poly([-bodyEdge(-21) + 1, -21, bodyEdge(-21) - 1, -21, bodyEdge(-18) - 1, -18, -bodyEdge(-18) + 1, -18]).fill(gm.seam);
			line(g, [-bodyEdge(-21) + 1, -21, bodyEdge(-21) - 1, -21], 1.4, mix(gm.seam, ink, 0.45));
			// The cake decorator's collar drips with icing.
			if (role === "designer") drips(g, -bodyEdge(-20) + 2, bodyEdge(-20) - 2, -19.5, 0xffffff, [3, 7, 4, 9, 3, 6, 10, 4, 7, 3], ink, 1.8, 1.5);
			g.ellipse(-19, -54, 12, 7).fill({ color: 0xffffff, alpha: 0.3 });
			g.ellipse(0, -7, 38, 6).fill({ color: p.shadow, alpha: 0.06 });
			g.poly(outline).stroke({ width: W.body, color: ink, join: "round" });
		};
	}

	/** A toque: a band round the head and a puffed, pleated crown `tall` above it, `wide` across. */
	const toque = (g: Graphics, tall: number, wide: number, pleats = 3, fill: number = BAKERY.whites, pleat: number = BAKERY.whitesShade) => {
		const top = T - tall;
		g.moveTo(-26, T + 1)
			.lineTo(-wide / 2 + 3, top + 10)
			.bezierCurveTo(-wide / 2 - 8, top - 2, -wide / 4, top - 10, -wide / 8, top - 4)
			.bezierCurveTo(-2, top - 12, 8, top - 12, wide / 8 + 2, top - 4)
			.bezierCurveTo(wide / 4, top - 10, wide / 2 + 8, top - 2, wide / 2 - 3, top + 10)
			.lineTo(26, T + 1)
			.closePath()
			.fill(fill)
			.stroke({ width: W.part, color: ink, join: "round" });
		for (let k = 0; k < pleats; k++) {
			const x = ((k + 0.5) / pleats - 0.5) * wide * 0.8;
			line(g, [x * 0.7, T - 4, x, top + 2], 1.3, pleat);
		}
		g.ellipse(-wide / 5, top + 2, wide / 9, 4).fill({ color: 0xffffff, alpha: 0.9 });
		g.roundRect(-28, T - 6, 56, 9, 3).fill(fill).stroke({ width: W.part, color: ink });
	};

	// The lead: the head baker. The tallest toque in the house; its band and the bow on it are the
	// project accent (`hat/lead-cup` is tinted, so it is drawn white), and so is the big bow at the
	// collar. A croissant brooch is pinned to the jacket.
	parts["hat/lead"] = (g) => {
		toque(g, 44, 66, 5);
		// A dusting of flour on the crown.
		for (const [x, y] of [[-14, T - 30], [9, T - 40], [20, T - 22]] as const) g.circle(x, y, 1.1).fill(BAKERY.whitesShade);
	};
	parts["hat/lead-cup"] = (g) => {
		g.roundRect(-29, T - 7, 58, 10, 3).fill(0xffffff).stroke({ width: W.part, color: ink });
		line(g, [-26, T - 4, 26, T - 4], 0.9, 0xd9d9e2);
		// The bow on the band's right, its tails hanging.
		const bx = 20;
		const by = T - 2;
		g.poly([bx, by, bx + 3, by + 11, bx + 6, by + 9, bx + 2, by]).fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
		g.poly([bx, by, bx - 11, by - 8, bx - 12, by + 4]).fill(0xffffff).stroke({ width: 1.4, color: ink, join: "round" });
		g.poly([bx, by, bx + 11, by - 9, bx + 13, by + 3]).fill(0xffffff).stroke({ width: 1.4, color: ink, join: "round" });
		g.circle(bx, by - 1, 3).fill(0xffffff).stroke({ width: 1.3, color: ink });
	};
	parts["front/tie"] = (g) => {
		// A big bow at the collar: two loops, the knot, two tails.
		const y = F - 2;
		for (const s of [-1, 1] as const) {
			g.poly([s * 2, y + 4, s * 7, y + 17, s * 12, y + 14, s * 4, y + 3]).fill(0xffffff).stroke({ width: 1.5, color: ink, join: "round" });
			g.moveTo(s * 2, y).bezierCurveTo(s * 10, y - 12, s * 24, y - 8, s * 20, y + 1).bezierCurveTo(s * 22, y + 9, s * 10, y + 10, s * 2, y + 3).closePath().fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
			line(g, [s * 6, y + 1, s * 15, y - 2], 1, 0xd9d9e2);
		}
		g.roundRect(-4, y - 3.5, 8, 8, 2.6).fill(0xffffff).stroke({ width: 1.5, color: ink });
	};

	// Builders: the bread baker. A pink gingham headscarf knotted in a bow on top, a candy-striped bib
	// apron with a whisk in its pocket, an oven mitt hanging off the waist string, flour everywhere.
	parts["hat/builder"] = (g) => {
		const scarf = dome(0, T + 9, 35, 25);
		g.poly(scarf).fill(BAKERY.pinkPale);
		bands(g, scarf, BAKERY.pinkDeep, 7, 3.4, "v", 0, 0.5);
		bands(g, scarf, BAKERY.pinkDeep, 7, 3.4, "h", 0, 0.5);
		g.poly(scarf).stroke({ width: W.part, color: ink, join: "round" });
		line(g, [-33, T + 6, 0, T + 2, 33, T + 6], 1.3, mix(BAKERY.pinkDeep, ink, 0.3));
		flour(g, -18, T - 6, 0.8);
		// The bow on top.
		const bx = 8;
		const by = T - 15;
		g.poly([bx, by, bx - 15, by - 10, bx - 16, by + 2]).fill(BAKERY.pinkDeep).stroke({ width: 1.6, color: ink, join: "round" });
		g.poly([bx, by, bx + 15, by - 12, bx + 17, by + 1]).fill(BAKERY.pinkDeep).stroke({ width: 1.6, color: ink, join: "round" });
		for (const [x, y] of [[bx - 11, by - 4], [bx + 11, by - 6], [bx - 7, by - 2], [bx + 7, by - 3]] as const) g.circle(x, y, 1.1).fill(0xffffff);
		g.circle(bx, by, 3.6).fill(BAKERY.pinkDeep).stroke({ width: 1.5, color: ink });
	};
	parts["front/apron"] = (g) => {
		const y0 = F - 3;
		const y1 = -1;
		const bib = [-13, y0, 13, y0, bodyEdge(y1) - 6, y1, -bodyEdge(y1) + 6, y1];
		g.poly(bib).fill(0xffffff);
		bands(g, bib, BAKERY.pink, 6, 2.6, "v");
		// A floury handprint.
		g.circle(-10, F + 10, 3.2).fill({ color: 0xffffff, alpha: 0.9 });
		for (let k = 0; k < 4; k++) g.ellipse(-14.5 + k * 3, F + 5.2 - (k === 1 || k === 2 ? 0.8 : 0), 1, 2.2).fill({ color: 0xffffff, alpha: 0.9 });
		// The pocket, a whisk standing in it.
		line(g, [10, F + 4, 12, F - 3], 1.6, ink);
		for (const rx of [3.2, 1.8]) g.ellipse(12.6, F - 6.5, rx, 4.6).stroke({ width: 1, color: BAKERY.steelDark });
		g.roundRect(5, F + 2, 12, 8, 1.5).fill(BAKERY.pink).stroke({ width: 1.3, color: ink });
		g.poly(bib).stroke({ width: 1.8, color: ink, join: "round" });
		line(g, [-13, y0, -24, -24], 1.4, ink);
		line(g, [13, y0, 24, -24], 1.4, ink);
		line(g, [-bodyEdge(F + 6) + 2, F + 6, bodyEdge(F + 6) - 2, F + 6], 1.6, ink);
		// The oven mitt hanging off the string on the right: quilted, with its thumb out.
		g.ellipse(21, F + 13, 3, 4.4).fill(BAKERY.pinkDeep).stroke({ width: 1.3, color: ink });
		g.roundRect(22, F + 6, 11, 15, 5).fill(BAKERY.pinkDeep).stroke({ width: 1.4, color: ink });
		for (const k of [0, 1, 2]) line(g, [23.5, F + 10 + k * 3.5, 31.5, F + 8 + k * 3.5], 0.8, 0xffffff);
		g.roundRect(22.5, F + 4, 10, 4, 1.4).fill(0xffffff).stroke({ width: 1.2, color: ink });
	};

	// Scouts: the barista. A coffee-brown flat cap with a bean pinned on it, a Breton top, and a waist
	// apron with a takeaway cup steaming in its pocket.
	const bean = (g: Graphics, x: number, y: number, r: number, a = 0.5) => {
		g.save();
		g.translateTransform(-x, -y).rotateTransform(a).translateTransform(x, y);
		g.ellipse(x, y, r, r * 0.7).fill(BAKERY.coffeeDark).stroke({ width: 1, color: ink });
		g.moveTo(x - r * 0.8, y).quadraticCurveTo(x, y - r * 0.35, x + r * 0.8, y).stroke({ width: 0.9, color: BAKERY.crema });
		g.restore();
	};
	parts["hat/scout"] = (g) => {
		// The brim across the brow, then the soft crown over it, pulled a little to the right.
		g.moveTo(-24, T + 3).quadraticCurveTo(6, T + 17, 36, T + 2).quadraticCurveTo(8, T + 9, -24, T + 3).closePath().fill(BAKERY.coffeeDark).stroke({ width: W.part, color: ink, join: "round" });
		g.ellipse(3, T - 5, 35, 12).fill(BAKERY.coffee).stroke({ width: W.part, color: ink });
		line(g, [-30, T + 1, 36, T + 1], 1.6, BAKERY.crema);
		for (const x of [-14, 4, 21]) line(g, [x * 0.8 + 3, T - 15, x + 3, T + 0], 1, BAKERY.coffeeDark);
		gloss(g, -14, T - 10, 9, 3, 0.35);
		g.circle(3, T - 16, 2.4).fill(BAKERY.coffeeDark).stroke({ width: 1.2, color: ink });
		bean(g, -21, T - 3, 4.4);
	};
	parts["front/kerchief"] = (g) => {
		g.roundRect(-26, F + 2, 52, 14, 3).fill(BAKERY.coffee).stroke({ width: 1.8, color: ink });
		for (let x = -23; x < 23; x += 4) line(g, [x, F + 4.2, x + 2, F + 4.2], 0.9, BAKERY.crema);
		// The pocket and the cup in it: a lid, a kraft sleeve with a heart, steam curling off.
		g.poly([-19, F - 6, -7, F - 6, -8.4, F + 8, -17.6, F + 8]).fill(0xffffff).stroke({ width: 1.3, color: ink, join: "round" });
		g.rect(-18.4, F - 1, 10.8, 5).fill(BAKERY.crema);
		g.moveTo(-13, F + 3).bezierCurveTo(-16, F + 0.5, -14, F - 1, -13, F + 0.4).bezierCurveTo(-12, F - 1, -10, F + 0.5, -13, F + 3).fill(BAKERY.berry);
		g.roundRect(-20, F - 9, 14, 3.6, 1.4).fill(0xffffff).stroke({ width: 1.2, color: ink });
		for (const x of [-15, -11]) g.moveTo(x, F - 10).quadraticCurveTo(x - 3, F - 13, x, F - 16).quadraticCurveTo(x + 3, F - 19, x, F - 22).stroke({ width: 1.1, color: 0xb5bdd0, cap: "round" });
		g.roundRect(-21, F + 4, 16, 10, 1.5).fill(BAKERY.coffeeDark).stroke({ width: 1.2, color: ink });
		bean(g, 14, F + 9, 3.6, -0.4);
	};

	// Explorers: the candy-maker (the small one, trailing its scout). A candy-striped paper cap with
	// a swirl lollipop stuck in its side, a candy-cane strap, and a jar of gumballs on the hip.
	const lollipop = (g: Graphics, x: number, y: number, r: number) => {
		g.circle(x, y, r).fill(0xffffff);
		const pts: number[] = [];
		for (let i = 0; i <= 40; i++) {
			const t = (i / 40) * Math.PI * 2 * 2.2;
			const rr = (r - 1.6) * (i / 40);
			pts.push(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
		}
		line(g, pts, r * 0.24, BAKERY.berry);
		gloss(g, x - r * 0.4, y - r * 0.45, r * 0.28, r * 0.16, 0.85);
		g.circle(x, y, r).stroke({ width: 1.6, color: ink });
	};
	parts["hat/explorer"] = (g) => {
		line(g, [16, T - 2, 25, T - 26], 3.6, ink);
		line(g, [16, T - 2, 25, T - 26], 2, 0xffffff);
		lollipop(g, 27, T - 33, 10);
		const cap = [-31, T + 7, -27, T - 9, -4, T - 15, 4, T - 15, 27, T - 9, 31, T + 7];
		g.poly(cap).fill(0xffffff);
		bands(g, cap, BAKERY.berry, 8, 3.4, "v", 0.6);
		g.poly(cap).stroke({ width: W.part, color: ink, join: "round" });
		line(g, [-27, T + 3, 27, T + 3], 1.2, mix(BAKERY.berry, ink, 0.3));
		line(g, [-24, T - 9, 24, T - 9], 1, 0xd5d5e0);
	};
	parts["front/straps"] = (g) => {
		line(g, [-32, -20, 18, F + 14], 4.8, ink);
		line(g, [-32, -20, 18, F + 14], 3, 0xffffff);
		for (let k = 0; k < 7; k++) {
			const t = (k + 0.3) / 7;
			const x = -32 + 50 * t;
			const y = -20 + (F + 34) * t;
			line(g, [x - 1.4, y - 1, x + 1.4, y + 1.4], 2, BAKERY.berry);
		}
		// A wrapped sweet in the strap.
		g.poly([-24, -13, -28, -16, -28, -10]).fill(BAKERY.lemon).stroke({ width: 0.9, color: ink, join: "round" });
		g.poly([-16, -13, -12, -16, -12, -10]).fill(BAKERY.lemon).stroke({ width: 0.9, color: ink, join: "round" });
		g.ellipse(-20, -13, 4.4, 3).fill(BAKERY.lemon).stroke({ width: 1, color: ink });
		// The gumball jar on the hip.
		const jar = { x: 13, y: F - 1, w: 16, h: 15 };
		g.roundRect(jar.x, jar.y, jar.w, jar.h, 4).fill({ color: BAKERY.glass, alpha: 0.7 });
		const balls = [BAKERY.berry, BAKERY.lemon, BAKERY.sky, BAKERY.mintDeep, BAKERY.pinkDeep, 0xb07ae8, BAKERY.lemonDeep, BAKERY.berry];
		balls.forEach((c, i) => g.circle(jar.x + 3.5 + (i % 3) * 4.5 + (Math.floor(i / 3) % 2) * 2, jar.y + jar.h - 3.2 - Math.floor(i / 3) * 4, 2.2).fill(c).stroke({ width: 0.6, color: ink }));
		g.rect(jar.x + 2, jar.y + 2, 2, jar.h - 4).fill({ color: 0xffffff, alpha: 0.7 });
		g.roundRect(jar.x, jar.y, jar.w, jar.h, 4).stroke({ width: 1.4, color: ink });
		g.roundRect(jar.x - 1, jar.y - 4, jar.w + 2, 4.4, 1.5).fill(BAKERY.pinkDeep).stroke({ width: 1.3, color: ink });
	};

	// Reviewers: the pâtissier, who tastes everything before it goes in the window. A puffed mushroom
	// toque, a chocolate bow tie, a tasting fork and spoon in the pocket, gold glasses on a chain.
	parts["hat/reviewer"] = (g) => {
		g.moveTo(-24, T + 1)
			.bezierCurveTo(-54, T - 6, -44, T - 34, -12, T - 30)
			.bezierCurveTo(-4, T - 38, 10, T - 38, 16, T - 30)
			.bezierCurveTo(46, T - 34, 54, T - 6, 24, T + 1)
			.closePath()
			.fill(BAKERY.whites)
			.stroke({ width: W.part, color: ink, join: "round" });
		for (const x of [-26, -10, 8, 26]) g.moveTo(x * 0.6, T - 4).quadraticCurveTo(x * 1.05, T - 14, x * 0.95, T - 26).stroke({ width: 1.3, color: BAKERY.whitesShade });
		g.ellipse(-22, T - 22, 8, 4).fill({ color: 0xffffff, alpha: 0.95 });
		g.roundRect(-27, T - 6, 54, 9, 3).fill(BAKERY.whites).stroke({ width: W.part, color: ink });
		line(g, [-25, T - 1.5, 25, T - 1.5], 1.3, BAKERY.lavender);
		macaron(g, -15, T - 1.5, 9, BAKERY.chocLight, BAKERY.buttercream);
	};
	parts["front/bowtie"] = (g) => {
		// The chocolate bow tie at the collar.
		const y = F - 4;
		g.poly([0, y, -11, y - 5, -11, y + 5]).fill(BAKERY.choc).stroke({ width: 1.4, color: ink, join: "round" });
		g.poly([0, y, 11, y - 5, 11, y + 5]).fill(BAKERY.choc).stroke({ width: 1.4, color: ink, join: "round" });
		for (const [x, dy] of [[-7, -1.5], [-6, 2], [7, -1.6], [6, 2]] as const) g.circle(x, y + dy, 0.9).fill(BAKERY.pink);
		g.roundRect(-2.6, y - 2.6, 5.2, 5.2, 1.6).fill(BAKERY.chocLight).stroke({ width: 1.2, color: ink });
		// The pocket: a cake fork and a tasting spoon.
		line(g, [13, F + 6, 12, F - 6], 1.8, ink);
		line(g, [13, F + 6, 12, F - 6], 0.9, BAKERY.gold);
		for (const dx of [-1.6, 0, 1.6]) line(g, [12 + dx, F - 6, 12 + dx * 1.1, F - 10], 0.8, ink);
		line(g, [18.5, F + 6, 19.5, F - 6], 1.8, ink);
		line(g, [18.5, F + 6, 19.5, F - 6], 0.9, BAKERY.gold);
		g.ellipse(19.6, F - 8, 2.4, 3.2).fill(BAKERY.gold).stroke({ width: 1, color: ink });
		g.roundRect(9, F + 1, 14, 9, 1.5).fill(BAKERY.whitesShade).stroke({ width: 1.3, color: ink });
		line(g, [9.5, F + 3.5, 22.5, F + 3.5], 1, BAKERY.lavender);
	};
	parts["wear/glasses"] = (g) => {
		const y = A.eyeY + 3;
		g.moveTo(-26, -46).quadraticCurveTo(-34, -10, 0, -12).quadraticCurveTo(34, -10, 26, -46).stroke({ width: 1.2, color: BAKERY.gold });
		for (let k = 0; k < 9; k++) g.circle(-22 + k * 5.5, -14 - (k === 0 || k === 8 ? 8 : k === 1 || k === 7 ? 3 : 0), 0.9).fill(BAKERY.gold);
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, y, 8.4).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 2.2, color: ink });
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, y, 8.4).stroke({ width: 1, color: BAKERY.gold });
		line(g, [-7.6, y - 1, 7.6, y - 1], 1.8, ink);
		line(g, [-24.4, y - 1, -27, -46], 1.5, ink);
		line(g, [24.4, y - 1, 27, -46], 1.5, ink);
	};

	// Verifiers: the taster. A cupcake for a hat (a pleated liner round the head, three swirls of
	// frosting, sprinkles and a cherry), and a prize doughnut on a rosette for the best in show.
	parts["hat/verifier"] = (g) => {
		const liner = [-27, T + 8, 27, T + 8, 32, T - 6, -32, T - 6];
		g.poly(liner).fill(BAKERY.lemon);
		for (let k = -4; k <= 4; k++) line(g, [k * 6, T + 7.5, k * 7, T - 5.5], 1.4, BAKERY.lemonDeep);
		g.poly(liner).stroke({ width: W.part, color: ink, join: "round" });
		const swirl = [[0, T - 9, 36, 9], [1, T - 19, 27, 8], [2, T - 28, 17, 7]] as const;
		for (const [x, y, rx, ry] of swirl) {
			g.ellipse(x, y, rx, ry).fill(BAKERY.pink).stroke({ width: W.part, color: ink });
			g.moveTo(x - rx * 0.6, y + ry * 0.2).quadraticCurveTo(x, y + ry * 0.75, x + rx * 0.7, y + ry * 0.1).stroke({ width: 1, color: BAKERY.pinkDeep });
			gloss(g, x - rx * 0.45, y - ry * 0.35, rx * 0.2, ry * 0.22, 0.7);
		}
		g.moveTo(-6, T - 33).quadraticCurveTo(2, T - 44, 7, T - 32).closePath().fill(BAKERY.pink).stroke({ width: 2, color: ink, join: "round" });
		sprinkles(g, -30, T - 34, 30, T - 3, 26, 1, 1.15, (x, y) => {
			for (const [cx, cy, rx, ry] of swirl) if (((x - cx) / (rx - 3)) ** 2 + ((y - cy) / (ry - 2)) ** 2 < 1) return true;
			return false;
		});
		cherry(g, 4, T - 40, 5);
	};
	parts["front/badge"] = (g) => {
		const x = 16;
		const y = F + 1;
		for (const [dx, a] of [[-3, -0.2], [3, 0.2]] as const) {
			const tx = x + dx;
			g.poly([tx - 3, y + 3, tx + 3, y + 3, tx + 3 + a * 10, y + 16, tx + a * 10, y + 13, tx - 3 + a * 10, y + 16]).fill(BAKERY.sky).stroke({ width: 1.2, color: ink, join: "round" });
		}
		g.star(x, y, 12, 10.5, 8.5, 0).fill(BAKERY.sky).stroke({ width: 1.2, color: ink, join: "round" });
		doughnut(g, x, y, 7.4, BAKERY.pink, 2);
	};

	// Designers: the cake decorator. A tiny three-tier cake perched on a headband with a satin bow,
	// a mint smock with icing dripping off the collar (the body's), a piping bag and a palette knife
	// in the pocket.
	parts["hat/designer"] = (g) => {
		g.moveTo(-36, T + 14).bezierCurveTo(-32, T - 10, 32, T - 10, 36, T + 14).stroke({ width: 5.4, color: ink, cap: "round" });
		g.moveTo(-36, T + 14).bezierCurveTo(-32, T - 10, 32, T - 10, 36, T + 14).stroke({ width: 3, color: BAKERY.pinkDeep, cap: "round" });
		const cx = -6;
		const cy = T - 5;
		g.save();
		g.translateTransform(-cx, -cy).rotateTransform(-0.16).translateTransform(cx, cy);
		g.ellipse(cx, cy + 1, 21, 3.4).fill(BAKERY.gold).stroke({ width: 1.6, color: ink });
		let y = cy;
		const tiers = [[34, 13, BAKERY.whites], [25, 11, BAKERY.pinkPale], [16, 10, BAKERY.whites]] as const;
		tiers.forEach(([w, h, fill], i) => {
			g.roundRect(cx - w / 2, y - h, w, h, 2).fill(fill).stroke({ width: 1.6, color: ink });
			drips(g, cx - w / 2 + 0.5, cx + w / 2 - 0.5, y - h + 1.6, i === 1 ? 0xffffff : BAKERY.pink, i === 0 ? [3.4, 6, 2.6, 5, 3.4] : i === 1 ? [3.4, 5, 2.6, 4] : [3, 4.6, 2.6], ink, 1.5, 1.8);
			for (let k = 0; k < Math.round(w / 4); k++) g.circle(cx - w / 2 + 2.4 + k * 4, y - 1.8, 0.95).fill(0xffffff).stroke({ width: 0.5, color: ink });
			y -= h;
		});
		// A strawberry on top.
		g.moveTo(cx - 6, y - 2).quadraticCurveTo(cx, y + 6, cx + 6, y - 2).quadraticCurveTo(cx, y - 9, cx - 6, y - 2).closePath().fill(BAKERY.berry).stroke({ width: 1.3, color: ink });
		g.star(cx, y - 5, 5, 4, 1.6, 0).fill(BAKERY.mintDeep).stroke({ width: 0.8, color: ink });
		for (const [dx, dy] of [[-2, -0.5], [1.6, 0], [0, 1.6]] as const) g.circle(cx + dx, y + dy, 0.6).fill(BAKERY.lemon);
		g.restore();
		// The satin bow on the band's right.
		const bx = 30;
		const by = T + 2;
		g.poly([bx, by, bx - 9, by - 9, bx - 10, by + 4]).fill(BAKERY.mint).stroke({ width: 1.4, color: ink, join: "round" });
		g.poly([bx, by, bx + 9, by - 10, bx + 11, by + 2]).fill(BAKERY.mint).stroke({ width: 1.4, color: ink, join: "round" });
		g.circle(bx, by - 1, 2.8).fill(BAKERY.mintDeep).stroke({ width: 1.2, color: ink });
	};
	parts["front/scarf"] = (g) => {
		// The piping bag standing in the pocket, icing at its tip.
		g.poly([9.5, F + 2, 17.5, F + 2, 14.2, F - 12, 12.8, F - 12]).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		g.poly([10.6, F - 2, 16.4, F - 2, 14.4, F - 10, 12.6, F - 10]).fill(BAKERY.pink);
		g.poly([12.6, F - 12, 14.4, F - 12, 13.5, F - 15.6]).fill(BAKERY.steel).stroke({ width: 0.9, color: ink, join: "round" });
		g.circle(13.5, F - 17.4, 1.8).fill(BAKERY.pinkDeep).stroke({ width: 0.8, color: ink });
		// The palette knife.
		line(g, [21, F + 3, 22, F - 6], 2, ink);
		line(g, [21, F + 3, 22, F - 6], 1, BAKERY.wood);
		g.roundRect(20.6, F - 15, 3.2, 10, 1.6).fill(BAKERY.steel).stroke({ width: 1, color: ink });
		g.roundRect(7, F, 18, 10, 1.5).fill(BAKERY.mintDeep).stroke({ width: 1.3, color: ink });
		line(g, [8, F + 2.6, 24, F + 2.6], 0.9, 0xffffff);
		// Icing smeared down the front.
		g.circle(-12, -12, 2.2).circle(-14, -6, 1.5).circle(-9, -7, 1.2).fill(BAKERY.pinkDeep);
	};

	// Held tools -----------------------------------------------------------------------------------

	/** A rolling pin's barrel, `w` long, centred at (x, y), lying flat. */
	const barrel = (g: Graphics, x: number, y: number, w: number, h: number) => {
		g.roundRect(x - w / 2, y - h / 2, w, h, h / 2).fill(0xf0c890).stroke({ width: 2.2, color: ink });
		line(g, [x - w / 2 + 3, y + h * 0.15, x + w / 2 - 3, y + h * 0.15], 0.8, BAKERY.goldenDeep);
		gloss(g, x - w * 0.15, y - h * 0.22, w * 0.25, h * 0.12, 0.7);
	};
	// The hand rolling pin, swung like the hammer: a handle and the barrel crosswise on its fork, a
	// lump of dough stuck to it and flour flying off.
	parts["held/hammer"] = (g) => {
		line(g, [0, 6, 0, -16], 5, ink);
		line(g, [0, 6, 0, -16], 3, BAKERY.pinkDeep);
		line(g, [-7, -20, -7, -16.5, 7, -16.5, 7, -20], 1.8, BAKERY.steelDark);
		barrel(g, 0, -24.5, 21, 8.6);
		g.ellipse(4, -21, 3.2, 1.6).fill(BAKERY.dough).stroke({ width: 0.8, color: ink });
		for (const [x, y] of [[-8, -30], [-3, -29.5], [6, -30]] as const) g.circle(x, y, 0.9).fill(0xffffff);
	};
	// The stand mixer's crank: a cream knob in the palm, the arm, and its hub on the mixer.
	parts["held/wrench"] = (g) => {
		g.roundRect(-2.4, -24, 4.8, 22, 2).fill(BAKERY.steel).stroke({ width: 1.8, color: ink });
		g.circle(0, -24, 9.4).fill(BAKERY.pinkDeep).stroke({ width: 1.8, color: ink });
		g.circle(0, -24, 4.6).fill(BAKERY.gold).stroke({ width: 1.4, color: ink });
		g.circle(0, -24, 1.6).fill(ink);
		gloss(g, -4, -29, 2.6, 1.4, 0.7);
		g.roundRect(-4.2, -4, 8.4, 9, 4).fill(BAKERY.cream).stroke({ width: 1.8, color: ink });
	};
	// A pistachio macaron, held up to squint at (the wrong one).
	parts["held/bolt"] = (g) => macaron(g, 0, -8.5, 14, BAKERY.pistachio, BAKERY.buttercream);
	// A pink sprinkle doughnut (the right one, at last).
	parts["held/gear"] = (g) => doughnut(g, 0, -11, 9.4, BAKERY.pink, 4);
	/** A cake layer, centred at (x, y): sponge, a cream band, buttercream and sprinkles on top. */
	const layer = (g: Graphics, x: number, y: number, w: number, h: number, sponge: number = BAKERY.vanilla, seed = 0) => {
		g.roundRect(x - w / 2, y - h / 2, w, h, 2.4).fill(sponge).stroke({ width: 2, color: ink });
		g.rect(x - w / 2 + 1, y - h / 2 + h * 0.48, w - 2, h * 0.18).fill(BAKERY.cream);
		drips(g, x - w / 2 + 1, x + w / 2 - 1, y - h / 2 + 2, BAKERY.pink, [2, 4, 1.6, 3.4, 2.4], ink, 1.4, 1.8);
		sprinkles(g, x - w / 2 + 2, y - h / 2 - 0.4, x + w / 2 - 2, y - h / 2 + 1.6, 6, seed, 0.9);
	};
	parts["held/brick"] = (g) => layer(g, 0, -10, WORK.brickW, WORK.brickH, BAKERY.vanilla, 1);
	// The crème brûlée torch: a pink canister in the hand, the nozzle up, a blue flame.
	parts["held/torch"] = (g) => {
		g.poly([-3, -18, 3, -18, 15, -44, -15, -44]).fill({ color: BAKERY.flame, alpha: 0.16 });
		g.moveTo(-1.5, -24).quadraticCurveTo(-6, -34, 0, -42).quadraticCurveTo(6, -34, 1.5, -24).closePath().fill({ color: BAKERY.flame, alpha: 0.85 }).stroke({ width: 1.1, color: ink });
		g.moveTo(-0.6, -25).quadraticCurveTo(-2.4, -31, 0, -35).quadraticCurveTo(2.4, -31, 0.6, -25).closePath().fill(0xdff4ff);
		g.roundRect(-1.4, -24, 2.8, 5, 0.8).fill(BAKERY.gold).stroke({ width: 1, color: ink });
		g.roundRect(-3.5, -19, 7, 22, 2.4).fill(BAKERY.pinkDeep).stroke({ width: 2, color: ink });
		g.roundRect(-5, -21, 10, 5, 1.5).fill(BAKERY.gold).stroke({ width: 1, color: ink });
		g.rect(-3.5, -9, 7, 3).fill(0xffffff);
		gloss(g, -1.6, -13, 0.8, 3, 0.7);
	};
	// The cake order on a clipboard: a sketch of the cake wanted, a heart, and the date circled.
	parts["held/map"] = (g) => {
		g.roundRect(-16, -26, 30, 21, 2).fill(BAKERY.pinkDeep).stroke({ width: 2, color: ink, join: "round" });
		g.rect(-13.5, -23.5, 25, 16).fill(0xffffff);
		g.rect(-9, -12.5, 10, 4).stroke({ width: 0.9, color: ink });
		g.rect(-7, -16, 6, 3.5).stroke({ width: 0.9, color: ink });
		g.circle(-4, -17.5, 1).fill(BAKERY.cherry);
		g.moveTo(7, -15).bezierCurveTo(3, -18, 5, -21, 7, -19).bezierCurveTo(9, -21, 11, -18, 7, -15).fill(BAKERY.berry);
		line(g, [3, -11, 10, -11], 0.9, ink);
		g.roundRect(-5, -28.5, 8, 4.5, 1.4).fill(BAKERY.gold).stroke({ width: 1.3, color: ink });
	};
	// The piping bag: gripped at its twisted end, the nozzle up, a star of pink icing coming out.
	parts["held/brush"] = (g) => {
		g.poly([-2, 7, 2, 7, 3, 2, -3, 2]).fill(0xffffff).stroke({ width: 1.2, color: ink, join: "round" });
		g.moveTo(-6.6, 2).quadraticCurveTo(-8, -10, -1.6, -24).lineTo(1.6, -24).quadraticCurveTo(8, -10, 6.6, 2).closePath().fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
		g.moveTo(-5.4, -2).quadraticCurveTo(-6.4, -10, -1.4, -21).lineTo(1.4, -21).quadraticCurveTo(6.4, -10, 5.4, -2).closePath().fill(BAKERY.pink);
		gloss(g, -2.6, -10, 1, 5, 0.7);
		g.poly([-1.8, -24, 1.8, -24, 0.9, -28.6, -0.9, -28.6]).fill(BAKERY.steel).stroke({ width: 1, color: ink, join: "round" });
		g.star(0, -31, 6, 3.4, 2, 0).fill(BAKERY.pinkDeep).stroke({ width: 1, color: ink, join: "round" });
	};
	// The sheet fed to the copier (and read in idle moments) is a baking tray of croissants, held up.
	parts["held/paper"] = (g) => {
		g.roundRect(-9.5, -22.5, 18, 23, 1.6).fill(BAKERY.steel).stroke({ width: 1.8, color: ink });
		g.rect(-7.5, -20.5, 14, 19).fill(BAKERY.cream);
		for (const y of [-17, -11, -5]) croissant(g, -0.5, y, 10, BAKERY.dough, BAKERY.doughShade);
	};
	// The trophy is a gold cup heaped with frosting and sprinkles.
	parts["held/trophy"] = (g) => {
		g.roundRect(-7, -6, 14, 4, 1.5).fill(BAKERY.gold).stroke({ width: 2, color: ink });
		g.rect(-1.5, -12, 3, 6).fill(ink);
		g.arc(-11, -20, 4.5, Math.PI * 0.5, Math.PI * 1.5).stroke({ width: 2, color: ink });
		g.arc(11, -20, 4.5, -Math.PI * 0.5, Math.PI * 0.5).stroke({ width: 2, color: ink });
		g.moveTo(-12, -26).quadraticCurveTo(-8, -33, 0, -33).quadraticCurveTo(8, -33, 12, -26).closePath().fill(BAKERY.pink).stroke({ width: 2, color: ink });
		sprinkles(g, -8, -31.5, 8, -27, 7, 6, 0.9);
		g.moveTo(-11, -26).lineTo(11, -26).quadraticCurveTo(11, -12, 0, -12).quadraticCurveTo(-11, -12, -11, -26).fill(BAKERY.gold).stroke({ width: W.part, color: ink });
		drips(g, -10.5, 10.5, -25, BAKERY.pink, [2, 4, 1.6, 3.4, 2.2], ink, 1.3, 1.4);
		gloss(g, -5, -19, 1.4, 3.4, 0.6);
	};
	// The mug is a cappuccino on its saucer, a heart in the foam.
	parts["held/mug"] = (g) => {
		g.ellipse(4, -0.6, 8, 1.6).fill(0xffffff).stroke({ width: 1.4, color: ink });
		g.arc(10, -8, 3.4, -Math.PI / 2, Math.PI / 2).stroke({ width: 2, color: ink });
		g.moveTo(-2, -13).lineTo(10, -13).quadraticCurveTo(10, -1.6, 4, -1.6).quadraticCurveTo(-2, -1.6, -2, -13).closePath().fill(BAKERY.pinkPale).stroke({ width: 2, color: ink });
		g.ellipse(4, -13, 6, 1.8).fill(BAKERY.crema).stroke({ width: 1.2, color: ink });
		g.moveTo(4, -12).bezierCurveTo(2, -13.4, 2.6, -14.4, 4, -13.6).bezierCurveTo(5.4, -14.4, 6, -13.4, 4, -12).fill(0xffffff);
		gloss(g, 0.6, -8, 0.8, 2.6, 0.8);
	};

	// The recipe card (where the blueprint was): a title band, a cake drawn on it, the steps ticked.
	// Turned, it hangs upside down.
	const recipe = (g: Graphics, flip: boolean) => {
		g.roundRect(-29, -14, 58, 25, 1).fill(BAKERY.cream).stroke({ width: W.part, color: ink });
		const k = flip ? -1 : 1;
		const Y = (v: number) => -1 + v * k;
		g.rect(-26, Y(-8) - 1.8, 52, 3.6).fill(BAKERY.pink);
		// The cake on the left.
		g.rect(-23, Math.min(Y(2), Y(8)), 13, 6).fill(BAKERY.pinkPale).stroke({ width: 1, color: ink });
		g.rect(-21, Math.min(Y(-2), Y(2)), 9, 4).fill(0xffffff).stroke({ width: 1, color: ink });
		g.circle(-16.5, Y(-3.4), 1.3).fill(BAKERY.cherry);
		for (const [v, w] of [[-2.5, 26], [1.5, 20], [5.5, 24]] as const) {
			line(g, [-5, Y(v), -5 + w - 6, Y(v)], 1.1, ink);
			line(g, [-5 + w - 3, Y(v), -5 + w, Y(v)], 1.1, BAKERY.mintDeep);
		}
		g.roundRect(-30, -17, 60, 6, 2).fill(BAKERY.pinkDeep).stroke({ width: 2, color: ink });
	};
	parts["prop/plan"] = (g) => recipe(g, false);
	parts["prop/plan2"] = (g) => recipe(g, true);
	parts["prop/roll"] = (g) => {
		g.roundRect(-31, -18, 62, 12, 6).fill(BAKERY.cream).stroke({ width: W.part, color: ink });
		g.rect(-20, -14, 10, 3).fill(BAKERY.pink);
		g.rect(10, -14, 10, 3).fill(BAKERY.pink);
		g.ellipse(-31, -12, 3, 6).fill(BAKERY.pinkPale).stroke({ width: 1.6, color: ink });
		g.ellipse(31, -12, 3, 6).fill(BAKERY.pinkPale).stroke({ width: 1.6, color: ink });
		// Tied with a ribbon and a bow.
		g.rect(-2, -18, 4, 12).fill(BAKERY.mintDeep).stroke({ width: 1, color: ink });
		g.poly([0, -18, -6, -20, -6, -15]).fill(BAKERY.mint).stroke({ width: 1, color: ink, join: "round" });
		g.poly([0, -18, 6, -20, 6, -15]).fill(BAKERY.mint).stroke({ width: 1, color: ink, join: "round" });
	};

	/** A pastry box with a ribbon and a bow, `w` by `h`, standing on `y` at `x`, tilted `a`. */
	const pastryBox = (g: Graphics, x: number, y: number, w: number, h: number, a = 0) => {
		g.save();
		g.translateTransform(-x, -y).rotateTransform(a).translateTransform(x, y);
		const box = [x - w / 2, y, x + w / 2, y, x + w / 2, y - h, x - w / 2, y - h];
		g.poly(box).fill(BAKERY.pinkPale);
		bands(g, box, BAKERY.pink, Math.max(3, w / 5), Math.max(1.4, w / 12), "v");
		g.poly(box).stroke({ width: Math.max(1, w / 14), color: ink, join: "round" });
		g.rect(x - w / 2, y - h * 0.82, w, h * 0.12).fill({ color: 0xffffff, alpha: 0.5 });
		g.rect(x - w * 0.06, y - h, w * 0.12, h).fill(BAKERY.mintDeep);
		const b = Math.max(2.4, w * 0.2);
		g.poly([x, y - h, x - b, y - h - b * 0.6, x - b, y - h + b * 0.3]).fill(BAKERY.mint).stroke({ width: 0.9, color: ink, join: "round" });
		g.poly([x, y - h, x + b, y - h - b * 0.6, x + b, y - h + b * 0.3]).fill(BAKERY.mint).stroke({ width: 0.9, color: ink, join: "round" });
		g.circle(x, y - h, b * 0.3).fill(BAKERY.mintDeep).stroke({ width: 0.8, color: ink });
		g.restore();
	};
	// A pastry box carried to the counter (where the outbox's envelope was).
	parts["held/envelope"] = (g) => pastryBox(g, 0, -4, 22, 10);
	// The parcel carried at the belly: a cake box with a cellophane window, cupcakes inside.
	parts["prop/box"] = (g) => {
		const box = [-18, -6, 18, -6, 18, -30, -18, -30];
		g.poly(box).fill(BAKERY.pinkPale);
		bands(g, box, BAKERY.pink, 6, 2.6, "v");
		g.poly(box).stroke({ width: W.part, color: ink, join: "round" });
		g.roundRect(-13, -25, 26, 13, 2).fill({ color: BAKERY.glass, alpha: 0.95 }).stroke({ width: 1.4, color: ink });
		for (const [x, c] of [[-7, BAKERY.pink], [1, BAKERY.lavender], [9, BAKERY.mint]] as const) cupcake(g, x - 1, -13, 7, c, x + 9);
		line(g, [-11, -15, -6, -24], 1.4, 0xffffff);
		g.rect(-18, -10, 36, 3).fill(BAKERY.mintDeep).stroke({ width: 1, color: ink });
	};
	// The PR: a cake under a glass dome on a gold stand, the order slip tucked under its rim.
	parts["prop/bigEnvelope"] = (g) => {
		g.ellipse(0, -3.4, 23, 3.4).fill(BAKERY.gold).stroke({ width: W.part, color: ink });
		g.rect(-3, -3, 6, 3).fill(BAKERY.gold).stroke({ width: 1.2, color: ink });
		g.roundRect(-11, -16, 22, 11, 2).fill(BAKERY.pink).stroke({ width: 1.8, color: ink });
		g.rect(-10, -11.6, 20, 2.4).fill(BAKERY.cream);
		drips(g, -10.5, 10.5, -14.4, 0xffffff, [3, 5, 2.4, 4.4, 2.6, 4], ink, 1.3, 1.6);
		for (let k = 0; k < 6; k++) g.circle(-8.5 + k * 3.4, -6.6, 0.9).fill(0xffffff).stroke({ width: 0.4, color: ink });
		cherry(g, 0, -19.4, 2.8);
		// The dome.
		g.moveTo(-19, -5).bezierCurveTo(-19, -29, 19, -29, 19, -5).closePath().fill({ color: BAKERY.glass, alpha: 0.32 }).stroke({ width: W.part, color: ink });
		g.moveTo(-14, -9).quadraticCurveTo(-13, -21, -4, -23.5).stroke({ width: 2.2, color: 0xffffff, cap: "round" });
		g.moveTo(13, -10).quadraticCurveTo(13.5, -14, 12, -16).stroke({ width: 1.4, color: 0xffffff, cap: "round" });
		g.circle(0, -24.6, 2.8).fill(BAKERY.gold).stroke({ width: 1.4, color: ink });
		g.poly(rotRect(15, -3, 9, 6, 0.2)).fill(BAKERY.ticket).stroke({ width: 1, color: ink, join: "round" });
		line(g, [12.4, -3.6, 17.6, -2.4], 0.8, BAKERY.pinkDeep);
	};

	// The work out front (reach.ts WORK) ---------------------------------------------------------

	// The pastry bench, where the sawhorse was: a floured board on pastel legs.
	const bench = (g: Graphics) => {
		const { benchL: l, benchR: r, benchTop: t } = WORK;
		for (const [a, b] of [[l + 7, l + 3], [r - 7, r - 3]] as const) {
			line(g, [a, t + 4, b, 0], 4.2, ink);
			line(g, [a, t + 4, b, 0], 2.2, BAKERY.mintDeep);
		}
		line(g, [l + 5, t + 14, r - 5, t + 14], 3, ink);
		line(g, [l + 5, t + 14, r - 5, t + 14], 1.2, BAKERY.mint);
		g.roundRect(l, t, r - l, 7, 1.5).fill(BAKERY.board).stroke({ width: W.part, color: ink });
		line(g, [l + 3, t + 4.6, r - 3, t + 4.6], 0.8, BAKERY.wood);
		for (const [x, rx] of [[l + 8, 4], [r - 12, 6], [l + 22, 3]] as const) g.ellipse(x, t + 2, rx, 1.2).fill({ color: 0xffffff, alpha: 0.85 });
	};
	/** The dough on the bench, its top at `top`: rolled flatter and wider each pass. */
	const dough = (g: Graphics, top: number, passes: number) => {
		const x = WORK.nailX;
		const t = WORK.benchTop;
		const h = t - top;
		const w = 20 + passes * 4;
		g.moveTo(x - w / 2, t).quadraticCurveTo(x - w / 2 - 1, top, x - 2, top).quadraticCurveTo(x + w / 2 + 2, top - 0.5, x + w / 2, t).closePath().fill(BAKERY.dough).stroke({ width: 1.4, color: ink, join: "round" });
		if (h > 4) gloss(g, x - w / 6, top + h * 0.38, w * 0.14, h * 0.16, 0.7);
		for (let k = 0; k < passes; k++) line(g, [x - w / 2 + 4, top + 1.6 + k * 1.3, x + w / 2 - 4, top + 1.6 + k * 1.3], 0.8, BAKERY.doughShade);
		for (const [dx, dy] of [[-5, 1.4], [4, 1.1], [0, 2.6]] as const) g.circle(x + dx, top + dy, 0.8).fill(0xffffff);
	};
	parts["work/nail1"] = (g) => (bench(g), dough(g, WORK.nailTop[0], 0));
	parts["work/nail2"] = (g) => (bench(g), dough(g, WORK.nailTop[1], 1));
	parts["work/nail3"] = (g) => (bench(g), dough(g, WORK.nailTop[2], 2));
	parts["work/bent"] = (g) => {
		// Overworked: the dough torn in two in a puff of flour, and the rolling pin rolled off.
		bench(g);
		const x = WORK.nailX;
		const t = WORK.benchTop;
		const top = WORK.nailTop[2];
		for (const s of [-1, 1] as const) {
			g.moveTo(x + s * 2, t).lineTo(x + s * 14, t).quadraticCurveTo(x + s * 14, top, x + s * 4, top - 1).lineTo(x + s * 1, t - 1).closePath().fill(BAKERY.dough).stroke({ width: 1.3, color: ink, join: "round" });
		}
		for (const [dx, dy, r] of [[-3, -6, 3.4], [3, -8, 3], [8, -5, 2.4], [-8, -4, 2.2]] as const) g.circle(x + dx, top + dy, r).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: 0.8, color: ink, alpha: 0.5 });
		const mx = WORK.benchR + 3;
		line(g, [mx, -3.6, mx + 29, -3.6], 2.6, BAKERY.pinkDeep);
		barrel(g, mx + 14.5, -3.8, 21, 7);
	};

	// The stand mixer, where the machine was: the crank's hub on the nut, a third of a turn a step;
	// pink batter in the bowl, the beater turning and spattering.
	const mixer = (g: Graphics, step: number) => {
		const { x, y } = WORK.nut;
		// The base and the column at the back.
		g.roundRect(x - 12, y + 34, 33, 5, 2.5).fill(BAKERY.pinkDeep).stroke({ width: 1.6, color: ink });
		g.roundRect(x + 11, y - 8, 9, 44, 4).fill(BAKERY.pink).stroke({ width: W.fine, color: ink });
		// The bowl: steel, batter heaped in it.
		g.moveTo(x - 13, y + 20).lineTo(x + 13, y + 20).quadraticCurveTo(x + 12, y + 35, x, y + 35).quadraticCurveTo(x - 12, y + 35, x - 13, y + 20).closePath().fill(BAKERY.steel).stroke({ width: W.fine, color: ink });
		g.moveTo(x - 12, y + 20.5).quadraticCurveTo(x - 4, y + 13 - step, x + 1, y + 16).quadraticCurveTo(x + 6, y + 13 + step, x + 12, y + 20.5).closePath().fill(BAKERY.pinkPale).stroke({ width: 1.2, color: ink });
		gloss(g, x - 8, y + 26, 2, 4, 0.7);
		// The beater down into the batter.
		line(g, [x + 2, y + 9, x + 2, y + 18], 2.4, ink);
		line(g, [x + 2, y + 9, x + 2, y + 18], 1, BAKERY.steel);
		// Spatters flying as it turns.
		for (let k = 0; k <= step; k++) g.circle(x - 10 - k * 3, y + 12 - k * 4, 1.2).fill(BAKERY.pink).stroke({ width: 0.6, color: ink });
		// The head over the bowl: pink enamel, a gold stripe.
		g.roundRect(x - 13, y - 16, 34, 26, 11).fill(BAKERY.pink).stroke({ width: W.part, color: ink });
		line(g, [x - 8, y + 5, x + 17, y + 5], 1.6, BAKERY.gold);
		gloss(g, x + 8, y - 11, 8, 2.6, 0.7);
		// The hub, marked so the turn shows.
		g.circle(x, y, 8.5).fill(BAKERY.pinkDeep).stroke({ width: 1.6, color: ink });
		const a = (step * Math.PI) / 9;
		for (let k = 0; k < 3; k++) {
			const b = a + (k * Math.PI * 2) / 3;
			line(g, [x + Math.cos(b) * 2.6, y + Math.sin(b) * 2.6, x + Math.cos(b) * 7, y + Math.sin(b) * 7], 1.4, 0xffffff);
		}
		g.circle(x, y, 2.2).fill(BAKERY.gold).stroke({ width: 1.2, color: ink });
	};
	parts["work/nut1"] = (g) => mixer(g, 0);
	parts["work/nut2"] = (g) => mixer(g, 1);
	parts["work/nut3"] = (g) => mixer(g, 2);

	// A bread basket, where the parts crate was: baguettes standing in a wicker basket, a round loaf
	// and a croissant on top, a gingham cloth over the front.
	const baguette = (g: Graphics, x: number, y: number, len: number, a: number) => {
		g.poly(rotRect(x, y, 6, len, a)).fill(BAKERY.golden).stroke({ width: 1.3, color: ink, join: "round" });
		const c = Math.cos(a);
		const s = Math.sin(a);
		for (const k of [-0.3, 0, 0.3]) {
			const px = x - s * k * len;
			const py = y + c * k * len;
			line(g, [px - 1.6 * c + 1 * s, py - 1.6 * s - 1 * c, px + 1.6 * c - 1 * s, py + 1.6 * s + 1 * c], 1, BAKERY.goldenDeep);
		}
	};
	parts["work/crate"] = (g) => {
		baguette(g, 62, -26, 20, -0.3);
		baguette(g, 69, -27, 20, -0.08);
		g.circle(82, -21, 7).fill(BAKERY.goldenDeep).stroke({ width: 1.3, color: ink });
		line(g, [79, -24, 85, -18], 1, BAKERY.buttercream);
		line(g, [85, -24, 79, -18], 1, BAKERY.buttercream);
		croissant(g, 89, -22, 11);
		g.roundRect(54, -20, 40, 20, 3).fill(BAKERY.wicker).stroke({ width: W.part, color: ink });
		for (let y = -16; y < -1; y += 4) for (let x = 57; x < 92; x += 5) line(g, [x, y + ((x / 5) % 2 ? 0 : 2), x + 3, y + ((x / 5) % 2 ? 2 : 0)], 0.9, 0xa8713e);
		g.roundRect(53, -22, 42, 4, 2).fill(BAKERY.wicker).stroke({ width: 1.6, color: ink });
		const cloth = [60, -19, 76, -19, 72, -8, 63, -10];
		g.poly(cloth).fill(0xffffff);
		bands(g, cloth, BAKERY.berry, 4, 2, "v", 0, 0.55);
		bands(g, cloth, BAKERY.berry, 4, 2, "h", 0, 0.55);
		g.poly(cloth).stroke({ width: 1, color: ink, join: "round" });
	};

	// The layer cake on the bench, where the bricks were stacked, rocking `tilt` on a corner.
	const cake = (g: Graphics, tilt: number) => {
		const t = WORK.benchTop;
		const px = tilt < 0 ? 75 : 93;
		g.save();
		g.translateTransform(-px, -t).rotateTransform(tilt * 0.12).translateTransform(px, t);
		const tier = (cx: number, cy: number, sponge: number) => {
			g.roundRect(cx - 9, cy - 5.5, 18, 11, 2).fill(sponge).stroke({ width: 2, color: ink });
			g.rect(cx - 8, cy - 1, 16, 2.4).fill(BAKERY.cream);
			for (let k = 0; k < 3; k++) g.circle(cx - 5 + k * 5, cy + 0.2, 0.9).fill(BAKERY.berry);
		};
		tier(84, t - 5.5, BAKERY.vanilla);
		tier(85, t - 16.5, BAKERY.chocLight);
		tier(83, t - 27.5, BAKERY.pink);
		drips(g, 74.5, 91.5, t - 32.5, 0xffffff, [3, 6, 2.4, 5, 3.4], ink, 1.4, 1.6);
		sprinkles(g, 76, t - 34, 90, t - 32, 8, 2, 0.9);
		cherry(g, 83, t - 34, 2);
		gloss(g, 78, t - 26, 2, 1.2, 0.7);
		g.restore();
	};
	parts["work/stack"] = (g) => (bench(g), cake(g, 0));
	parts["work/stackL"] = (g) => (bench(g), cake(g, -1));
	parts["work/stackR"] = (g) => (bench(g), cake(g, 1));
	parts["work/brick"] = (g) => layer(g, WORK.brick.x, WORK.brick.y, WORK.brickW, WORK.brickH, BAKERY.pink, 2);

	// The station parts, at reach.ts's working points --------------------------------------------

	// The filing drawer: a proofing drawer. Shut, its brass handle is on the working point and its
	// window glows warm; pulled out, it comes toward the viewer with the dough balls rising in their
	// tins (their tops are where the folder tabs were, walked by the fingertips), one gone in `gap`.
	const proofer = (g: Graphics, state: "shut" | "out" | "gap") => {
		const rail = (y: number) => g.rect(S.x - 8, y, 36, 2).fill(BAKERY.wood).stroke({ width: 1, color: ink });
		if (state === "shut") {
			rail(S.y - 8);
			g.roundRect(S.x - 5, S.y - 6, 30, 13, 2).fill(BAKERY.mint).stroke({ width: W.fine + 0.4, color: ink });
			g.roundRect(S.x + 14, S.y + 1.5, 9, 4, 1).fill(0xffd08a).stroke({ width: 0.9, color: ink });
			g.circle(S.x + 16.5, S.y + 3.5, 1.2).circle(S.x + 20, S.y + 3.5, 1.2).fill(BAKERY.dough);
			g.roundRect(S.x - 1, S.y - 1.3, 20, 2.6, 1.3).fill(BAKERY.gold).stroke({ width: 1.4, color: ink });
			rail(S.y + 7);
			return;
		}
		rail(S.y - 8);
		g.rect(S.x - 6, S.y - 6, 32, 5).fill(mix(BAKERY.mint, ink, 0.35)).stroke({ width: 1.2, color: ink });
		for (let i = 0; i < 6; i++) {
			const x = S.x - 1 + i * 5;
			if (state === "gap" && i === 3) continue;
			g.rect(x - 2.4, S.y - 7, 4.8, 3).fill(BAKERY.steel).stroke({ width: 0.8, color: ink });
			g.circle(x, S.y - 8.4, 2.6).fill(BAKERY.dough).stroke({ width: 0.9, color: ink });
			g.circle(x - 0.8, S.y - 9.4, 0.8).fill(0xffffff);
		}
		const o = AT.drawerOut;
		g.poly([S.x - 7, S.y - 2, S.x + 27, S.y - 2, S.x + 27, S.y + 12, S.x - 7, S.y + 12]).fill(BAKERY.mint).stroke({ width: W.fine + 0.4, color: ink, join: "round" });
		g.roundRect(S.x + o.x - 1, S.y + o.y + 2.2, 20, 2.6, 1.3).fill(BAKERY.gold).stroke({ width: 1.4, color: ink });
	};
	parts["work/cabinet"] = (g) => proofer(g, "shut");
	parts["work/drawer"] = (g) => proofer(g, "out");
	parts["work/drawerGap"] = (g) => proofer(g, "gap");

	// The copier: a deck oven. Its lid is the oven's hood (on the same hinge), the glass its deck with
	// a tray of croissants laid on it, the start button the dial and the status light the
	// thermostat's; the jam door the lower oven door with its window, and the jam a burnt baguette in
	// it. The out-tray is a cooling rack where the croissants land.
	const oven = (
		g: Graphics,
		o: { lid?: number; sheet?: boolean; light?: "go" | "red"; glow?: boolean; copies?: 1 | 2; door?: boolean; jam?: "corner" | "inside" | "tugged"; bang?: boolean; pressed?: boolean },
	) => {
		const lidLen = 30;
		// The cooling rack on the far side, and the croissants on it.
		g.poly([S.x + 36, S.y + 8, S.x + 52, S.y + 5, S.x + 52.5, S.y + 7.5, S.x + 36, S.y + 11]).fill(BAKERY.steel).stroke({ width: 1.6, color: ink, join: "round" });
		for (const k of [0, 1, 2, 3]) line(g, [S.x + 38 + k * 4, S.y + 10.2 - k * 0.6, S.x + 38.4 + k * 4, S.y + 7.4 - k * 0.6], 0.7, BAKERY.steelDark);
		if (o.copies === 1) croissant(g, S.x + 42, S.y + 6, 9);
		if (o.copies === 2) for (let k = 0; k < 3; k++) croissant(g, S.x + 41 + k * 4.4, S.y + 6.4 - k * 1.6, 8.4);
		// The control plate: the dial and the thermostat light.
		const b = at(AT.button);
		g.roundRect(b.x - 4, b.y - 3, 15, 6, 1.5).fill(BAKERY.pinkDeep).stroke({ width: 1.2, color: ink });
		g.circle(b.x, b.y, 3).fill(BAKERY.gold).stroke({ width: 0.9, color: ink });
		line(g, [b.x, b.y, b.x + (o.pressed ? 1.6 : 0), b.y - (o.pressed ? 1.6 : 2.4)], 1.1, ink);
		const bx = b.x + 7;
		const lit = o.light === "red" ? RED : o.light === "go" ? p.go : 0x7a6a4a;
		g.circle(bx, b.y, o.pressed ? 2.4 : 2).fill(lit).stroke({ width: 0.9, color: ink });
		if (o.light === "red") for (const a of o.pressed ? [-2.6, -1.57, -0.5] : [-2.2, -0.9]) line(g, [bx + Math.cos(a) * 3.4, b.y + Math.sin(a) * 3.4, bx + Math.cos(a) * 5.6, b.y + Math.sin(a) * 5.6], 1, RED);
		// The lower oven door, shut, or dropped open on its bottom hinge onto the glowing inside.
		const d = at(AT.door);
		const dl = d.x - 5;
		const dt = S.y + 12;
		if (o.door) {
			g.rect(dl, dt, 24, 11).fill(0x3a2430).stroke({ width: 1.4, color: ink });
			for (const x of [dl + 5, dl + 12, dl + 19]) line(g, [x - 2, dt + 8, x + 2, dt + 8], 1.2, 0xff7a3a);
			g.rect(dl + 1, dt + 1, 22, 3).fill({ color: 0xff9a2e, alpha: 0.35 });
			const flap = [dl, dt + 11, dl + 24, dt + 11, dl + 27, dt + 17, dl - 3, dt + 17];
			g.poly(flap).fill(BAKERY.mint).stroke({ width: 1.6, color: ink, join: "round" });
			line(g, [dl + 4, dt + 15.5, dl + 20, dt + 15.5], 1.6, BAKERY.gold);
		} else {
			g.roundRect(dl, dt, 24, 11, 1.5).fill({ color: BAKERY.mint, alpha: 0.75 }).stroke({ width: 1.2, color: ink, alpha: 0.8 });
			g.roundRect(dl + 4, dt + 3, 16, 6, 1).fill({ color: 0xffb35a, alpha: 0.75 });
			g.rect(d.x - 1.5, d.y - 1, 3, 2).fill(BAKERY.gold);
		}
		// The burnt baguette: its end poking out of the door, inside, or tugged out, smoking.
		const j = at(AT.jam);
		if (o.jam === "corner") {
			g.poly([j.x - 3, dt + 0.5, j.x - 1, dt - 4, j.x + 2, dt - 2.5, j.x + 4, dt - 5, j.x + 5, dt + 0.5]).fill(BAKERY.burnt).stroke({ width: 1.2, color: ink, join: "round" });
			for (const k of [0, 1]) g.circle(j.x + k * 3, dt - 8 - k * 3, 1.6 + k * 0.6).fill({ color: 0x9aa3bd, alpha: 0.6 });
		}
		if (o.jam === "inside") g.poly([j.x - 4, j.y - 3, j.x, j.y - 5, j.x + 4, j.y - 2, j.x + 3, j.y + 3, j.x - 2, j.y + 4, j.x - 5, j.y + 1]).fill(BAKERY.burnt).stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "tugged") {
			const e = at(AT.jamOut);
			g.roundRect(e.x, j.y - 3, j.x + 4 - e.x, 6, 3).fill(BAKERY.burnt).stroke({ width: 1.2, color: ink });
			for (let k = 1; k < 4; k++) {
				const x = e.x + ((j.x + 4 - e.x) * k) / 4;
				line(g, [x - 1.2, j.y - 1.6, x + 1.2, j.y + 1.6], 0.9, 0x8a6a50);
			}
			for (const k of [0, 1]) g.circle(j.x - 4 + k * 4, j.y - 6 - k * 3, 1.4 + k * 0.5).fill({ color: 0x9aa3bd, alpha: 0.6 });
		}
		// The deck under a raised hood, and the tray of croissants laid on it.
		if (o.lid) {
			g.rect(S.x, S.y - 1.5, lidLen - 2, 1.5).fill(BAKERY.burnt).stroke({ width: 1, color: ink });
			if (o.sheet) {
				g.rect(S.x + 4, S.y - 2.6, 20, 1.2).fill(BAKERY.steel).stroke({ width: 0.6, color: ink });
				for (const k of [0, 1, 2]) croissant(g, S.x + 8 + k * 6, S.y - 4.4, 6.4, BAKERY.dough, BAKERY.doughShade);
			}
		}
		// The hood, about its hinge at the far end, a gold handle at its front.
		const hx = S.x + lidLen;
		const hy = S.y - 2;
		g.save();
		g.translateTransform(-hx, -hy).rotateTransform(((o.lid ?? 0) * Math.PI) / 180).translateTransform(hx, hy);
		g.roundRect(S.x - 1, S.y - 4, lidLen + 1, 4, 1.5).fill(BAKERY.mintDeep).stroke({ width: W.fine + 0.2, color: ink });
		line(g, [S.x + 3, S.y - 3, S.x + lidLen - 3, S.y - 3], 0.9, 0xffffff);
		g.roundRect(S.x - 4, S.y - 3.5, 5, 3, 1.4).fill(BAKERY.gold).stroke({ width: 0.8, color: ink });
		g.restore();
		if (o.glow) {
			// Baking: the deck glows, and the smell comes off it.
			g.rect(S.x, S.y - 0.6, lidLen - 2, 1.4).fill(0xff9a2e);
			for (const x of [S.x + 6, S.x + 16, S.x + 24]) g.moveTo(x, S.y - 3).quadraticCurveTo(x - 3, S.y - 6, x, S.y - 9).stroke({ width: 1.2, color: 0xffb3cf, cap: "round" });
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
	parts["work/copier"] = (g) => oven(g, {});
	parts["work/lidHalf"] = (g) => oven(g, { lid: 22 });
	parts["work/lidUp"] = (g) => oven(g, { lid: 78 });
	parts["work/lidSheet"] = (g) => oven(g, { lid: 78, sheet: true });
	parts["work/scan"] = (g) => oven(g, { light: "go", glow: true });
	parts["work/copy1"] = (g) => oven(g, { light: "go", glow: true, copies: 1 });
	parts["work/copy2"] = (g) => oven(g, { copies: 2 });
	parts["work/jam"] = (g) => oven(g, { light: "red", jam: "corner" });
	parts["work/door"] = (g) => oven(g, { light: "red", door: true, jam: "inside" });
	parts["work/doorTug"] = (g) => oven(g, { light: "red", door: true, jam: "tugged" });
	parts["work/doorOpen"] = (g) => oven(g, { light: "red", door: true });
	parts["work/jammed"] = (g) => oven(g, { light: "red" });
	parts["work/kicked"] = (g) => oven(g, { light: "red", bang: true });
	parts["work/jabbed"] = (g) => oven(g, { light: "red", pressed: true });
	parts["work/kickSpit"] = (g) => oven(g, { light: "red", bang: true, jam: "corner" });

	// The stamp desk: tasting. The stamp is a cake fork (its grip the verdict's colour) with a morsel
	// on its tines; it dips into the cake (the ink pad's place), then goes to the top slice, which
	// gets a flag stuck in it, a green tick or a red cross, and is pushed along onto the tasted ones.
	const fork = (g: Graphics, grip: number) => {
		g.roundRect(-2.4, -10.4, 4.8, 6, 2).fill(grip).stroke({ width: 1.1, color: ink });
		g.rect(-1.1, -4.6, 2.2, 7).fill(BAKERY.gold).stroke({ width: 0.9, color: ink });
		g.poly([-1.4, 2, 1.4, 2, 3.6, 4.4, 3.6, 8.6, -3.6, 8.6, -3.6, 4.4]).fill(BAKERY.gold).stroke({ width: 1, color: ink, join: "round" });
		for (const x of [-1.2, 1.2]) line(g, [x, 5.4, x, 8.6], 0.8, ink);
		g.roundRect(-2.6, 2.6, 5.2, 2.6, 0.8).fill(BAKERY.pink).stroke({ width: 0.6, color: ink });
	};
	parts["held/stamp"] = (g) => fork(g, BAKERY.lavender);
	parts["held/stampG"] = (g) => fork(g, p.go);
	parts["held/stampR"] = (g) => fork(g, RED);
	const flag = (g: Graphics, x: number, y: number, kind: "ok" | "no") => {
		const colour = kind === "ok" ? p.go : RED;
		line(g, [x, y, x + 0.6, y - 4], 0.9, ink);
		g.roundRect(x - 0.4, y - 7, 6.4, 3.6, 1).fill(colour).stroke({ width: 0.8, color: ink });
		if (kind === "ok") line(g, [x + 1.2, y - 5.2, x + 2.4, y - 4.3, x + 4.6, y - 6.3], 0.9, 0xffffff);
		else {
			line(g, [x + 1.4, y - 6.4, x + 4.2, y - 4], 0.9, 0xffffff);
			line(g, [x + 4.2, y - 6.4, x + 1.4, y - 4], 0.9, 0xffffff);
		}
	};
	const tasting = (g: Graphics, verdict: number, m?: "ok" | "no", slid = false) => {
		/** A slice of layer cake on a plate, the flag in it if it's been tasted. */
		const slice = (x: number, y: number, mk?: "ok" | "no") => {
			g.ellipse(x + 0.5, y + 0.6, 9, 1.6).fill(BAKERY.plate).stroke({ width: 1, color: ink });
			g.poly([x - 6, y, x + 7, y, x + 7, y - 5.4, x - 6, y - 3.4]).fill(BAKERY.vanilla).stroke({ width: 1, color: ink, join: "round" });
			line(g, [x - 5.4, y - 1.8, x + 6.6, y - 2.6], 1, BAKERY.pink);
			g.poly([x - 6, y - 3.4, x + 7, y - 5.4, x + 7, y - 6.6, x - 6, y - 4.4]).fill(BAKERY.pink).stroke({ width: 0.8, color: ink, join: "round" });
			if (mk) flag(g, x + 2, y - 5, mk);
		};
		const pile = at({ x: AT.form.x + 18, y: 0 });
		for (let k = 0; k < 2; k++) slice(pile.x + (k % 2) * 0.8, pile.y - k * 2.2);
		flag(g, pile.x + 3, pile.y - 5.4, "ok");
		const f = at(AT.form);
		slice(f.x + 0.8, f.y + 2.2);
		slice(f.x, f.y, slid ? undefined : m);
		if (slid) slice(f.x + 9, f.y - 1.2, m);
		// The cake: a round cake with a slice out of it, a cherry, and the verdict's colour on its
		// stand.
		const i = at(AT.ink);
		g.roundRect(i.x - 7, i.y + 2, 14, 1.8, 0.8).fill(BAKERY.gold).stroke({ width: 1, color: ink });
		g.roundRect(i.x - 6, i.y - 3.4, 12, 5.6, 1.6).fill(BAKERY.pinkPale).stroke({ width: 1.4, color: ink });
		g.rect(i.x + 1, i.y - 3, 4.6, 5).fill(BAKERY.vanilla);
		line(g, [i.x + 1, i.y - 0.6, i.x + 5.6, i.y - 0.6], 0.9, BAKERY.pink);
		g.rect(i.x - 5.4, i.y - 3.6, 6, 1.2).fill(0xffffff);
		g.circle(i.x - 3, i.y - 4.4, 1.3).fill(BAKERY.cherry).stroke({ width: 0.6, color: ink });
		g.rect(i.x + 2, i.y + 2.2, 3, 1.4).fill(verdict);
	};
	parts["work/forms"] = (g) => tasting(g, p.go);
	parts["work/formsOk"] = (g) => tasting(g, p.go, "ok");
	parts["work/formsSlid"] = (g) => tasting(g, p.go, "ok", true);
	parts["work/formsR"] = (g) => tasting(g, RED);
	parts["work/formsNo"] = (g) => tasting(g, RED, "no");

	// The phone table's notepad: the order pad, pink carbon pages, the handset's coiled cord running
	// to the phone.
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
	const orderPad = (g: Graphics, n: number, flip = false) => {
		cord(g);
		const page = (dy: number, fill: number) => g.poly([S.x - 8, S.y + 1 + dy, S.x + 14, S.y + 1 + dy, S.x + 16.5, S.y - 4 + dy, S.x - 5.5, S.y - 4 + dy]).fill(fill).stroke({ width: 1.3, color: ink, join: "round" });
		page(1.4, BAKERY.pinkDeep);
		page(0, BAKERY.pinkPale);
		line(g, [S.x - 5, S.y - 3, S.x + 15.6, S.y - 3], 1.2, BAKERY.pinkDeep);
		const bits = [[S.x - 4, S.x + 1], [S.x + 2, S.x + 7], [S.x + 8, S.x + 12]] as const;
		for (let k = 0; k < Math.min(n, 3); k++) {
			const [a, b] = bits[k]!;
			const y = S.y - 1.2 + (k === 1 ? 0.6 : 0);
			const pts: number[] = [];
			for (let x = a; x <= b; x += 1.25) pts.push(x, y + (Math.round((x - a) / 1.25) % 2 ? -0.7 : 0.5));
			line(g, pts, 0.9, ink);
		}
		if (n >= 3) g.circle(S.x + 13, S.y - 0.6, 2.4).stroke({ width: 0.9, color: RED });
		if (flip) {
			g.moveTo(S.x - 5.5, S.y - 4).quadraticCurveTo(S.x - 3, S.y - 13, S.x + 4, S.y - 14).lineTo(S.x + 22, S.y - 12).quadraticCurveTo(S.x + 16, S.y - 10, S.x + 16.5, S.y - 4).closePath()
				.fill(BAKERY.pinkPale).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [S.x + 3, S.y - 11.5, S.x + 15, S.y - 10.5], 0.9, ink);
		}
	};
	parts["work/note0"] = (g) => orderPad(g, 0);
	parts["work/note1"] = (g) => orderPad(g, 1);
	parts["work/note2"] = (g) => orderPad(g, 2);
	parts["work/note3"] = (g) => orderPad(g, 3);
	parts["work/noteFlip"] = (g) => orderPad(g, 0, true);

	// The outbox: the display counter. A glass-fronted case of pastries with a cupcake on a stand at
	// its far end; the pastry box is set down on its top and waits there to go out.
	const counter = (g: Graphics, box: 0 | 1 | 2) => {
		const t = at(AT.tray);
		const l = t.x - 13;
		const r = t.x + 21;
		g.rect(r - 8, S.y - 2.6, 1.4, 2).fill(BAKERY.gold);
		g.ellipse(r - 7.3, S.y - 2.8, 4.2, 0.9).fill(BAKERY.gold).stroke({ width: 0.7, color: ink });
		cupcake(g, r - 7.3, S.y - 3.4, 5, BAKERY.lavender, 3);
		g.rect(l, S.y + 1.6, r - l, 5.4).fill(BAKERY.cream).stroke({ width: 1, color: ink });
		for (let k = 0; k < 4; k++) {
			const x = l + 4.5 + k * 8.4;
			if (k % 2) macaron(g, x, S.y + 4.2, 4.6, k === 1 ? BAKERY.pink : BAKERY.pistachio);
			else croissant(g, x, S.y + 4.4, 6);
		}
		g.rect(l, S.y + 1.6, r - l, 5.4).fill({ color: BAKERY.glass, alpha: 0.28 });
		line(g, [l + 3, S.y + 6.4, l + 7, S.y + 2], 1, 0xffffff);
		line(g, [l + 18, S.y + 6.4, l + 21, S.y + 2.6], 0.8, 0xffffff);
		g.rect(l, S.y + 5.4, r - l, 1.8).fill(BAKERY.pinkDeep).stroke({ width: 0.9, color: ink });
		if (box === 2) pastryBox(g, t.x + 3, S.y - 1, 13, 6.4);
		g.roundRect(l, S.y - 1, r - l, 2.6, 1).fill(BAKERY.gold).stroke({ width: W.fine, color: ink });
		if (box === 1) {
			pastryBox(g, t.x + 4, S.y - 3, 13, 6.4, -0.18);
			for (const x of [t.x - 2, t.x + 10]) line(g, [x, S.y - 21, x, S.y - 17], 1.2, ink);
		}
	};
	parts["work/outbox"] = (g) => counter(g, 0);
	parts["work/mail1"] = (g) => counter(g, 1);
	parts["work/mail2"] = (g) => counter(g, 2);

	// The shredder: the crumb bin. The slot is its swing lid's opening, the pile beside it a stack of
	// burnt cookies on a board; `crunch` while it's swallowing a sheet of them.
	const crumbBin = (g: Graphics, n: number, crunch: boolean) => {
		const pl = at(AT.pile);
		g.rect(pl.x - 8, S.y - 0.4, 16, 1.6).fill(BAKERY.board).stroke({ width: 0.7, color: ink });
		for (let k = 0; k < n; k++) {
			g.poly(rotRect(pl.x + (k % 2 ? 0.8 : -0.6), S.y - 1.2 * (k + 1), 12, 1.2, k % 2 ? 0.05 : -0.05)).fill(k % 2 ? BAKERY.chocLight : BAKERY.burnt).stroke({ width: 0.6, color: ink });
		}
		const s = at(AT.slot);
		g.roundRect(s.x - 13, s.y - 2, 26, 4, 1.6).fill(BAKERY.pink).stroke({ width: 1, color: ink });
		g.roundRect(s.x - 9, s.y - 1.4, 18, 2.8, 1.2).fill(ink);
		line(g, [s.x - 10, s.y + 2.4, s.x + 10, s.y + 2.4], 1, BAKERY.pinkDeep);
		if (crunch) {
			for (const side of [-1, 1]) {
				const x = s.x + side * 15;
				line(g, [x, s.y - 3, x + side * 1.5, s.y - 1.5, x, s.y, x + side * 1.5, s.y + 1.5], 1.1, ink);
				g.circle(s.x + side * 4, s.y - 4, 1.2).circle(s.x + side * 7, s.y - 3, 0.9).fill(BAKERY.chocLight);
			}
		}
	};
	parts["work/shred"] = (g) => crumbBin(g, 5, false);
	parts["work/shred4"] = (g) => crumbBin(g, 4, false);
	parts["work/shredBuzz"] = (g) => crumbBin(g, 4, true);

	/** A sheet of parchment with burnt cookies on it, held by its top going into the bin: `len` of it
	 * still shows. */
	const parchment = (g: Graphics, len: number) => {
		g.moveTo(-6, 1).lineTo(6, 1).lineTo(5.6, 1 + len).lineTo(-5.6, 1 + len).closePath().fill(BAKERY.cream).stroke({ width: 1.3, color: ink, join: "round" });
		for (const [x, y] of [[-2.6, 4], [2.4, 7.4], [-1.6, 11]] as const) if (y + 2 < 1 + len) g.circle(x, y, 1.8).fill(BAKERY.burnt);
	};
	parts["held/slip"] = (g) => {
		g.poly([0, -1.5, 16, -3.5, 17.5, 0.5, 1, 2.5]).fill(BAKERY.cream).stroke({ width: 1.3, color: ink, join: "round" });
		for (const x of [4.5, 9, 13.5]) g.circle(x, -0.4 - x * 0.08, 1.4).fill(BAKERY.burnt);
	};
	parts["held/feed1"] = (g) => parchment(g, 12);
	parts["held/feed2"] = (g) => parchment(g, 7);
	parts["held/feed3"] = (g) => parchment(g, 3);

	/** A burnt croissant (the jam, pulled out and balled up), at (x, y), `r` its outline. */
	const burnt = (g: Graphics, x: number, y: number, r: number[]) => {
		const pts = r.flatMap((v, i) => [x + Math.cos((i / r.length) * Math.PI * 2) * v, y + Math.sin((i / r.length) * Math.PI * 2) * v]);
		g.poly(pts).fill(BAKERY.burnt).stroke({ width: 1.5, color: ink, join: "round" });
		line(g, [x - 3, y - 2, x + 3, y - 2], 1, 0x8a6a50);
		line(g, [x - 2.4, y + 1.6, x + 2.6, y + 1.6], 1, 0x8a6a50);
	};
	parts["held/crumple"] = (g) => burnt(g, 0, -6, [6.4, 5.2, 6.8, 5.6, 6.2, 4.9, 6.6, 5.4, 6, 5.1]);
	parts["fx/toss"] = (g) => {
		g.moveTo(28, -86).quadraticCurveTo(-4, -118, -40, -92).stroke({ width: 1.3, color: ink, alpha: 0.5, cap: "round" });
		burnt(g, -44, -88, [5, 4.2, 5.4, 4.4, 5, 3.9, 5.2, 4.3]);
		for (const k of [0, 1]) g.circle(-40 + k * 4, -97 - k * 4, 1.8 + k * 0.6).fill({ color: 0x9aa3bd, alpha: 0.55 });
	};

	/** An order slip (where the sticky note was), centred at (x, y): a pink band with a cherry on it,
	 * and lines; `flap` lifts its free end. */
	const slip = (g: Graphics, x: number, y: number, flap: boolean) => {
		const s = STICKY / 2;
		const body = flap
			? [x - s, y + s, x + s, y + s, x + s + 0.8, y - s + 3, x + 2, y - s - 2, x - s + 0.2, y - s + 0.6]
			: [x - s, y + s, x + s, y + s, x + s, y - s, x - s, y - s];
		g.poly(body).fill(BAKERY.ticket).stroke({ width: 1.3, color: ink, join: "round" });
		if (!flap) {
			g.rect(x - s + 0.7, y - s + 0.7, STICKY - 1.4, 3).fill(BAKERY.pink);
			g.circle(x - s + 2.6, y - s + 2.2, 1.1).fill(BAKERY.cherry);
		}
		line(g, [x - s + 2, y + 0.6, x + s - 3, y + 0.6], 1, ink);
		line(g, [x - s + 2, y + 2.6, x + s - 2, y + 2.6], 1, ink);
		line(g, [x - s + 2, y + 4.4, x + s - 5, y + 4.4], 1, BAKERY.pinkDeep);
	};
	parts["held/sticky"] = (g) => slip(g, 0, -12, false);
	parts["held/stickyFlap"] = (g) => slip(g, 0, -12, true);
	parts["work/stickyOn"] = (g) => {
		g.rect(PLANNER.x - STICKY / 2 + 1.2, PLANNER.y - STICKY / 2 + 1.5, STICKY, STICKY).fill({ color: p.shadow, alpha: 0.14 });
		slip(g, PLANNER.x, PLANNER.y, false);
	};

	// The in-tray: a tray of pastries on the lead's station, the context stacked on it in rows of
	// pastries a bundle of sheets high, so it buries the lead as the sheets did; it sways, a macaron
	// slides off the top, and a doughnut drops over the side.
	/** One pastry filling a cell of the pile, `k` picks which. */
	const pastry = (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		const cx = x + w / 2;
		const cy = y + h / 2;
		switch (k % 5) {
			case 0:
				croissant(g, cx, cy + h * 0.1, w * 1.02);
				break;
			case 1:
				macaron(g, cx, cy, w * 0.94, [BAKERY.pink, BAKERY.pistachio, BAKERY.lavender, BAKERY.lemon][Math.floor(k / 5) % 4]!);
				break;
			case 2:
				// An éclair, chocolate on top.
				g.roundRect(x, y + h * 0.25, w, h * 0.75, h * 0.37).fill(BAKERY.golden).stroke({ width: 0.7, color: ink });
				g.roundRect(x + 0.4, y, w - 0.8, h * 0.45, h * 0.22).fill(BAKERY.choc).stroke({ width: 0.6, color: ink });
				gloss(g, x + w * 0.3, y + h * 0.15, w * 0.15, h * 0.08, 0.7);
				break;
			case 3:
				// A doughnut side on: the glaze over the top, sprinkles.
				g.roundRect(x, y + h * 0.1, w, h * 0.9, h * 0.45).fill(BAKERY.golden).stroke({ width: 0.7, color: ink });
				g.roundRect(x + 0.3, y, w - 0.6, h * 0.5, h * 0.25).fill(BAKERY.pinkDeep).stroke({ width: 0.6, color: ink });
				sprinkles(g, x + 1, y + 0.4, x + w - 1, y + h * 0.4, 3, k, 0.55);
				break;
			default:
				// A cinnamon roll, its swirl showing.
				g.roundRect(x, y, w, h, h * 0.4).fill(BAKERY.goldenDeep).stroke({ width: 0.7, color: ink });
				line(g, [x + w * 0.2, cy, x + w * 0.5, cy - h * 0.2, x + w * 0.8, cy], 0.6, BAKERY.buttercream);
		}
	};
	const pastries = (g: Graphics, n: number, lean = 0, top?: "slide" | "drop") => {
		const { x, w, base, sheet: h } = TRAY;
		let y = base - 2;
		for (let i = 0; i < n; i += 3) {
			const k = Math.min(3, n - i);
			const up = (i + k) / TRAY_FULL;
			const dx = lean * 9 * up * up + ((i / 3) % 2 ? 1 : -1) * 0.9;
			const row = i / 3;
			const tw = (w - 2) / 3;
			for (let c = 0; c < 3; c++) pastry(g, x - w / 2 + 1 + dx + c * tw + 0.4, y - k * h, tw - 0.8, k * h, row * 2 + c * 3 + row);
			y -= k * h;
		}
		g.poly([x - w / 2 - 3, base - 5, x + w / 2 + 3, base - 5, x + w / 2 + 1, base, x - w / 2 - 1, base]).fill(BAKERY.steel).stroke({ width: 1.4, color: ink, join: "round" });
		line(g, [x - w / 2 - 1, base - 3.4, x + w / 2 + 1, base - 3.4], 0.8, 0xffffff);
		g.rect(x - w / 2 - 2, base - 1.6, w + 3.6, 1).fill(BAKERY.pinkDeep);
		if (top === "slide") {
			macaron(g, x + w / 2 + 5.5, y - 4, 9, BAKERY.pink);
			for (const dy of [-3, 1]) line(g, [x - w / 2 - 3, y + dy, x - w / 2 - 8, y + dy], 1.2, ink);
		}
		if (top === "drop") {
			const fx = x + w / 2 + 15;
			const fy = y + 14;
			doughnut(g, fx, fy, 5.6, BAKERY.lavender, 5);
			for (const [dx, dy, a] of [[-7, 4, 0.4], [7, 6, -0.6], [2, 9, 1.2]] as const) g.poly(rotRect(fx + dx, fy + dy, 3, 1.2, a)).fill(SPRINKLES[(dx + 7) % SPRINKLES.length]!).stroke({ width: 0.4, color: ink });
			line(g, [fx - 5, fy - 11, fx - 2, fy - 15], 1.2, ink);
			line(g, [fx + 3, fy - 11, fx + 7, fy - 14], 1.2, ink);
		}
	};
	parts["work/tray1"] = (g) => pastries(g, 3);
	parts["work/tray2"] = (g) => pastries(g, 7);
	parts["work/tray3"] = (g) => pastries(g, 14);
	parts["work/tray4"] = (g) => pastries(g, TRAY_FULL);
	parts["work/tray4L"] = (g) => pastries(g, TRAY_FULL, -1);
	parts["work/tray4R"] = (g) => pastries(g, TRAY_FULL, 1);
	parts["work/traySlide"] = (g) => pastries(g, TRAY_FULL - 1, 1, "slide");
	parts["work/trayDrop"] = (g) => pastries(g, TRAY_FULL - 1, 0, "drop");

	// Confetti is sprinkles, with the odd heart and macaron among them.
	for (const v of [1, 2, 3] as const) {
		parts[`fx/conf${v}`] = (g) => {
			for (let i = 0; i < 14; i++) {
				const k = i * 37 + v * 13;
				const x = ((k * 29) % 140) - 70;
				const y = -78 - ((k * 17) % 50) + v * 4;
				if (i % 7 === 3) macaron(g, x, y, 7, [BAKERY.pink, BAKERY.pistachio, BAKERY.lavender][(i + v) % 3]!);
				else if (i % 7 === 6) g.moveTo(x, y + 2.6).bezierCurveTo(x - 4.4, y - 0.6, x - 2.2, y - 4, x, y - 1.6).bezierCurveTo(x + 2.2, y - 4, x + 4.4, y - 0.6, x, y + 2.6).fill(BAKERY.pinkDeep).stroke({ width: 0.8, color: ink });
				else g.poly(rotRect(x, y, 6, 2.2, (k % 7) * 0.45)).fill(SPRINKLES[(i + v) % SPRINKLES.length]!).stroke({ width: 0.5, color: ink });
			}
		};
	}

	// The bell is the paper rig's brass bell; it calls "fresh!".
	parts["fx/ding"] = (g, add) => {
		const x = BELL.x;
		const y = BELL.y + 15;
		for (const r of [7, 12]) g.arc(x, y - 3, r, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ width: 1.4, color: ink, alpha: r > 8 ? 0.55 : 1 });
		const t = text("fresh!", 9, ink, "900");
		t.position.set(x + 18, y - 19);
		t.rotation = 0.12;
		add(t);
	};

	return { name: "bakery", palette: p, parts };
}
