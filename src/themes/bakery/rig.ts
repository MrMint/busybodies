// The bakery's rig (plan-alive wave 4, stream L): a patisserie gone over the top. The same cast and
// parts as the paper rig, repainted by name as the office's and the factory's are, so every pose
// plays unchanged: the crew in over-the-top sweet accessories (below); the builder's work becomes baking on the same points (reach.ts WORK), and the station parts
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
// Costumes are accessories, not wigs (as the office's): the body keeps its role colour, each role
// wears one sweet idea on the dome (the headwear does the telling apart at room zoom) and one small
// thing pinned low on the belly, and nothing covers the eyes or touches the mouth:
//
//   lead      the head baker: the tallest toque, banded in the project accent with a bow on it, and
//             an accent ribbon bow on the belly
//   builder   the bread baker: a pink gingham bow on top with a baguette through it, flour on the
//             dome, a croissant brooch
//   scout     the barista: a coffee-brown flat cap with a cappuccino balanced on it, a coffee-bean pin
//   explorer  the candy-maker: a candy-striped paper cap with a swirl lollipop stuck in it, a
//             wrapped bonbon
//   reviewer  the pâtissier: a puffed mushroom toque, gold half-moon glasses, a chocolate macaron pin
//   verifier  the taster: a cupcake hat (pleated liner, three swirls of frosting, sprinkles, a
//             cherry), a prize doughnut rosette
//   designer  the cake decorator: a tiny tiered cake on a headband, a piping bag pinned on
import type { Graphics } from "pixi.js";
import { AT, BELL, PLANNER, STATION, STICKY, TRAY, WORK, frontSpread, handAt } from "../../scene/rig/data/reach";
import {
	ANCHORS,
	PLUMP_LEVELS,
	type Painter,
	type Palette,
	PAPER_PALETTE,
	RED,
	type Theme,
	TRAY_FULL,
	W,
	burstAt,
	line,
	paperTheme,
	rotRect,
	sized,
	sizedAll,
	sparkle,
	text,
} from "../../scene/rig/theme";
import { mix } from "../../shared/colour";
import { SPRINKLES, bands, drips, gloss, sprinkles } from "./rig-geometry";

/** Bakery colours, on top of the paper palette. */
const BAKERY = {
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

/** The costumes, the builder's work and the station parts the bakery repaints; everything else
 * (bodies, faces, hands, limbs, the receiver, the card tray, the bell, most effects) is the paper
 * rig's, on purpose. The tests hold this list. */
export const BAKERY_REPAINTS = [
	"hat/lead",
	"hat/lead-cup",
	"hat/builder",
	"hat/scout",
	"hat/explorer",
	"hat/reviewer",
	"hat/verifier",
	"hat/designer",
	"front/tie",
	"front/apron",
	"front/kerchief",
	"front/straps",
	"front/bowtie",
	"front/badge",
	"front/scarf",
	"wear/glasses",
	"held/hammer",
	"held/wrench",
	"held/bolt",
	"held/gear",
	"held/brick",
	"held/torch",
	"held/map",
	"held/brush",
	"held/mug",
	"held/paper",
	"held/trophy",
	"held/stamp",
	"held/stampG",
	"held/stampR",
	"held/envelope",
	"held/crumple",
	"held/slip",
	"held/feed1",
	"held/feed2",
	"held/feed3",
	"held/sticky",
	"held/stickyFlap",
	"prop/plan",
	"prop/plan2",
	"prop/roll",
	...sizedAll(["prop/plan", "prop/plan2", "prop/roll"]),
	"prop/box",
	"prop/bigEnvelope",
	"prop/drum",
	"work/nail1",
	"work/nail2",
	"work/nail3",
	"work/bent",
	"work/nut1",
	"work/nut2",
	"work/nut3",
	"work/crate",
	"work/stack",
	"work/stackL",
	"work/stackR",
	"work/brick",
	"work/cabinet",
	"work/drawer",
	"work/drawerGap",
	"work/copier",
	"work/lidHalf",
	"work/lidUp",
	"work/lidSheet",
	"work/scan",
	"work/copy1",
	"work/copy2",
	"work/jam",
	"work/door",
	"work/doorTug",
	"work/doorOpen",
	"work/jammed",
	"work/kicked",
	"work/jabbed",
	"work/kickSpit",
	"work/forms",
	"work/formsOk",
	"work/formsSlid",
	"work/formsR",
	"work/formsNo",
	"work/note0",
	"work/note1",
	"work/note2",
	"work/note3",
	"work/noteFlip",
	"work/outbox",
	"work/mail1",
	"work/mail2",
	"work/shred",
	"work/shred4",
	"work/shredBuzz",
	"work/tray1",
	"work/tray2",
	"work/tray3",
	"work/tray4",
	"work/tray4L",
	"work/tray4R",
	"work/traySlide",
	"work/trayDrop",
	"work/stickyOn",
	"fx/ding",
	"fx/toss",
	"fx/conf1",
	"fx/conf2",
	"fx/conf3",
] as const;

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
			g.ellipse(cx, cy, rx, ry)
				.fill(Math.abs(k) === 2 ? edge : fill)
				.stroke({ width: sw, color: ink });
		}
		gloss(g, x - w * 0.05, y - h * 0.28, w * 0.09, h * 0.1, 0.7);
	};
	/** A macaron side on, `w` across, centred at (x, y): two shells, the filling and the ruffled feet. */
	const macaron = (g: Graphics, x: number, y: number, w: number, shell: number, filling: number = BAKERY.cream) => {
		const h = w * 0.62;
		const sw = Math.max(0.7, w / 12);
		g.roundRect(x - w / 2, y - h / 2, w, h * 0.42, h * 0.2)
			.fill(shell)
			.stroke({ width: sw, color: ink });
		g.roundRect(x - w / 2, y + h * 0.08, w, h * 0.42, h * 0.2)
			.fill(shell)
			.stroke({ width: sw, color: ink });
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
		g.circle(x, y, r * 0.28)
			.fill(BAKERY.goldenDeep)
			.stroke({ width: sw * 0.8, color: ink });
	};
	/** A cherry: red, glossy, a stem curling up and right. */
	const cherry = (g: Graphics, x: number, y: number, r: number) => {
		g.moveTo(x, y - r * 0.6)
			.quadraticCurveTo(x + r * 0.3, y - r * 1.8, x + r * 1.2, y - r * 2.1)
			.stroke({ width: Math.max(0.8, r * 0.3), color: 0x5a7a3a, cap: "round" });
		g.circle(x, y, r)
			.fill(BAKERY.cherry)
			.stroke({ width: Math.max(0.8, r * 0.28), color: ink });
		gloss(g, x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.22, 0.85);
	};
	/** A cupcake side on, `w` across its liner, standing on `y`. */
	const cupcake = (g: Graphics, x: number, y: number, w: number, frosting: number = BAKERY.pink, seed = 0) => {
		const sw = Math.max(0.7, w / 12);
		const h = w * 0.55;
		g.poly([x - w * 0.4, y, x + w * 0.4, y, x + w * 0.5, y - h, x - w * 0.5, y - h])
			.fill(BAKERY.sky)
			.stroke({ width: sw, color: ink, join: "round" });
		for (let k = -2; k <= 2; k++) line(g, [x + k * w * 0.16, y - 0.5, x + k * w * 0.2, y - h + 0.5], sw * 0.6, mix(BAKERY.sky, ink, 0.3));
		g.moveTo(x - w * 0.56, y - h)
			.quadraticCurveTo(x - w * 0.5, y - h - w * 0.5, x, y - h - w * 0.62)
			.quadraticCurveTo(x + w * 0.5, y - h - w * 0.5, x + w * 0.56, y - h)
			.closePath()
			.fill(frosting)
			.stroke({ width: sw, color: ink });
		gloss(g, x - w * 0.2, y - h - w * 0.3, w * 0.14, w * 0.08, 0.7);
		sprinkles(g, x - w * 0.4, y - h - w * 0.45, x + w * 0.4, y - h - w * 0.08, 5, seed, w / 14);
	};

	// Costumes: accessories, not wigs (as the office's, themes/office/rig.ts). The body keeps its role
	// colour (the paper rig's own body: no jackets, smocks, bib aprons or stripes over it); each role
	// gets one over-the-top sweet idea on the dome, clear of the brows and the big eyes, and one small
	// thing pinned low on the belly, clear of the mouth and the cheeks (reach.ts ANCHORS).

	/** Belly pieces sit this far below the board's (reach.ts frontY), clear of the big eyes. */
	const B = F + 3;
	/** A flour puff, `s` big, dusted on the dome. */
	const flour = (g: Graphics, x: number, y: number, s: number) => {
		for (const [dx, dy, r] of [
			[0, 0, 3.2],
			[3, 1.5, 2.4],
			[-2.6, 2, 2],
			[1.4, -2.4, 1.8],
		] as const)
			g.circle(x + dx * s, y + dy * s, r * s).fill({ color: 0xffffff, alpha: 0.85 });
	};

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
		g.roundRect(-28, T - 6, 56, 9, 3)
			.fill(fill)
			.stroke({ width: W.part, color: ink });
	};

	// The lead: the head baker. The tallest toque in the house, dusted with flour; its band and the
	// bow on it are the project accent (`hat/lead-cup` is tinted, so it is drawn white), and so is the
	// ribbon bow pinned low on the belly (`front/tie`, tinted too).
	parts["hat/lead"] = (g) => {
		toque(g, 44, 66, 5);
		for (const [x, y] of [
			[-14, T - 30],
			[9, T - 40],
			[20, T - 22],
		] as const)
			g.circle(x, y, 1.1).fill(BAKERY.whitesShade);
	};
	parts["hat/lead-cup"] = (g) => {
		g.roundRect(-29, T - 7, 58, 10, 3)
			.fill(0xffffff)
			.stroke({ width: W.part, color: ink });
		line(g, [-26, T - 4, 26, T - 4], 0.9, 0xd9d9e2);
		// The bow on the band's right, its tails hanging (they stop well above the brows).
		const bx = 20;
		const by = T - 2;
		g.poly([bx, by, bx + 3, by + 9, bx + 6, by + 7, bx + 2, by])
			.fill(0xffffff)
			.stroke({ width: 1.3, color: ink, join: "round" });
		g.poly([bx, by, bx - 11, by - 8, bx - 12, by + 4])
			.fill(0xffffff)
			.stroke({ width: 1.4, color: ink, join: "round" });
		g.poly([bx, by, bx + 11, by - 9, bx + 13, by + 3])
			.fill(0xffffff)
			.stroke({ width: 1.4, color: ink, join: "round" });
		g.circle(bx, by - 1, 3)
			.fill(0xffffff)
			.stroke({ width: 1.3, color: ink });
	};
	parts["front/tie"] = (g) => {
		// A ribbon bow: two loops, the knot, two short tails, all low on the belly.
		const y = B - 1;
		for (const s of [-1, 1] as const) {
			g.poly([s * 1.5, y + 2, s * 5, y + 11, s * 9, y + 9, s * 3.5, y + 1])
				.fill(0xffffff)
				.stroke({ width: 1.4, color: ink, join: "round" });
			g.moveTo(s * 2, y)
				.bezierCurveTo(s * 7, y - 8, s * 15, y - 6, s * 13.5, y)
				.bezierCurveTo(s * 15, y + 5.5, s * 7, y + 6, s * 2, y + 2)
				.closePath()
				.fill(0xffffff)
				.stroke({ width: 1.5, color: ink, join: "round" });
			line(g, [s * 5, y + 0.4, s * 10.5, y - 1.6], 1, 0xd9d9e2);
		}
		g.roundRect(-3.2, y - 2.8, 6.4, 6.4, 2.2)
			.fill(0xffffff)
			.stroke({ width: 1.4, color: ink });
	};

	// Builders: the bread baker. A pink gingham bow knotted on top of the dome with a baguette tucked
	// through it, flour on the dome where it wiped its brow; a croissant brooch.
	/** A baguette from (x1, y1) to (x2, y2), `r` thick: a golden crust, slashes along it. */
	const stick = (g: Graphics, x1: number, y1: number, x2: number, y2: number, r: number) => {
		const l = Math.hypot(x2 - x1, y2 - y1);
		const [ux, uy] = [(x2 - x1) / l, (y2 - y1) / l];
		line(g, [x1, y1, x2, y2], r * 2 + 2.4, ink);
		line(g, [x1, y1, x2, y2], r * 2, BAKERY.golden);
		for (let k = 1; k < 5; k++) {
			const [cx, cy] = [x1 + ux * l * (k / 5), y1 + uy * l * (k / 5)];
			line(g, [cx - ux * 3 - uy * r * 0.5, cy - uy * 3 + ux * r * 0.5, cx + ux * 3 + uy * r * 0.5, cy + uy * 3 - ux * r * 0.5], 1.4, BAKERY.vanilla);
		}
		line(g, [x1 + ux * 3 - uy * r * 0.45, y1 + uy * 3 + ux * r * 0.45, x2 - ux * 3 - uy * r * 0.45, y2 - uy * 3 + ux * r * 0.45], 1, BAKERY.goldenDeep);
	};
	parts["hat/builder"] = (g) => {
		stick(g, -30, T - 4, 30, T - 26, 4.6);
		flour(g, -22, T + 6, 0.9);
		flour(g, 24, T + 4, 0.6);
		// The bow: gingham loops (stripes both ways), the knot, two tails lying on the dome.
		const bx = 2;
		const by = T - 8;
		for (const s of [-1, 1] as const) {
			g.poly([bx + s * 2, by + 3, bx + s * 8, by + 10, bx + s * 12, by + 7, bx + s * 5, by + 2])
				.fill(BAKERY.pinkDeep)
				.stroke({ width: 1.4, color: ink, join: "round" });
			const loop = [bx, by, bx + s * 22, by - 14, bx + s * 24, by + 8];
			g.poly(loop).fill(BAKERY.pinkPale);
			bands(g, loop, BAKERY.pinkDeep, 5, 2.4, "v", 0, 0.55);
			bands(g, loop, BAKERY.pinkDeep, 5, 2.4, "h", 0, 0.55);
			g.poly(loop).stroke({ width: 1.8, color: ink, join: "round" });
		}
		g.circle(bx, by, 4.4).fill(BAKERY.pinkDeep).stroke({ width: 1.6, color: ink });
		gloss(g, bx - 1.4, by - 1.6, 1.6, 1, 0.8);
	};
	parts["front/apron"] = (g) => {
		croissant(g, 10, B - 1, 23);
		g.circle(10, B - 1.4, 1.2).fill(BAKERY.gold);
	};

	// Scouts: the barista. A coffee-brown flat cap with a cappuccino balanced on its crown (steam
	// curling up, away from the face); a coffee-bean pin.
	const bean = (g: Graphics, x: number, y: number, r: number, a = 0.5) => {
		g.save();
		g.translateTransform(-x, -y).rotateTransform(a).translateTransform(x, y);
		g.ellipse(x, y, r, r * 0.7)
			.fill(BAKERY.coffeeDark)
			.stroke({ width: 1, color: ink });
		g.moveTo(x - r * 0.8, y)
			.quadraticCurveTo(x, y - r * 0.35, x + r * 0.8, y)
			.stroke({ width: 0.9, color: BAKERY.crema });
		g.restore();
	};
	parts["hat/scout"] = (g) => {
		// The brim, then the soft crown over it, pulled a little to the right.
		g.moveTo(-22, T + 3)
			.quadraticCurveTo(6, T + 11, 34, T + 1)
			.quadraticCurveTo(8, T + 6, -22, T + 3)
			.closePath()
			.fill(BAKERY.coffeeDark)
			.stroke({ width: W.part, color: ink, join: "round" });
		g.ellipse(3, T - 4, 32, 10)
			.fill(BAKERY.coffee)
			.stroke({ width: W.part, color: ink });
		for (const x of [-14, 4, 21]) line(g, [x * 0.8 + 3, T - 13, x + 3, T + 1], 1, BAKERY.coffeeDark);
		gloss(g, -14, T - 8, 8, 2.6, 0.35);
		bean(g, -19, T - 1, 4);
		// The cappuccino on top: a saucer, a white cup, the foam with a heart, steam rising.
		const cx = 6;
		const cy = T - 13;
		g.ellipse(cx, cy, 13, 3).fill(0xffffff).stroke({ width: 1.5, color: ink });
		g.moveTo(cx + 8, cy - 9)
			.bezierCurveTo(cx + 15, cy - 10, cx + 15, cy - 3, cx + 7.5, cy - 3)
			.stroke({ width: 3.4, color: ink, cap: "round" });
		g.moveTo(cx + 8, cy - 9)
			.bezierCurveTo(cx + 15, cy - 10, cx + 15, cy - 3, cx + 7.5, cy - 3)
			.stroke({ width: 1.6, color: 0xffffff, cap: "round" });
		g.moveTo(cx - 9, cy - 13)
			.lineTo(cx + 9, cy - 13)
			.quadraticCurveTo(cx + 8, cy - 1, cx, cy - 1)
			.quadraticCurveTo(cx - 8, cy - 1, cx - 9, cy - 13)
			.closePath()
			.fill(0xffffff)
			.stroke({ width: 1.6, color: ink, join: "round" });
		g.ellipse(cx, cy - 13, 9, 2.6)
			.fill(BAKERY.crema)
			.stroke({ width: 1.2, color: ink });
		g.moveTo(cx, cy - 11.6)
			.bezierCurveTo(cx - 3.4, cy - 13.6, cx - 1.6, cy - 15.4, cx, cy - 14)
			.bezierCurveTo(cx + 1.6, cy - 15.4, cx + 3.4, cy - 13.6, cx, cy - 11.6)
			.fill(0xffffff);
		gloss(g, cx - 5, cy - 9, 1.4, 2.4, 0.9);
		for (const x of [cx - 4, cx + 3])
			g.moveTo(x, cy - 17)
				.quadraticCurveTo(x - 3, cy - 20, x, cy - 24)
				.quadraticCurveTo(x + 3, cy - 27, x, cy - 31)
				.stroke({ width: 1.6, color: 0xc8cfdf, cap: "round" });
	};
	parts["front/kerchief"] = (g) => {
		// A round cream enamel pin with two coffee beans on it.
		const x = -12;
		const y = B - 1;
		g.circle(x, y, 9).fill(BAKERY.cream).stroke({ width: 1.6, color: ink });
		g.circle(x, y, 7).stroke({ width: 0.9, color: BAKERY.crema });
		bean(g, x - 2.6, y + 0.8, 3.8, 0.7);
		bean(g, x + 3, y - 1.2, 3.8, -0.5);
	};

	// Explorers: the candy-maker (the small one, trailing its scout). A candy-striped paper cap with
	// a swirl lollipop stuck in its side; a wrapped bonbon pinned on.
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
		const cap = [-30, T + 5, -26, T - 10, -4, T - 16, 4, T - 16, 26, T - 10, 30, T + 5];
		g.poly(cap).fill(0xffffff);
		bands(g, cap, BAKERY.berry, 8, 3.4, "v", 0.6);
		g.poly(cap).stroke({ width: W.part, color: ink, join: "round" });
		line(g, [-26, T + 1, 26, T + 1], 1.2, mix(BAKERY.berry, ink, 0.3));
		line(g, [-23, T - 10, 23, T - 10], 1, 0xd5d5e0);
	};
	parts["front/straps"] = (g) => {
		// A bonbon in a twist of lemon wrapper, a berry swirl on it.
		const x = 4;
		const y = B - 1;
		for (const s of [-1, 1] as const)
			g.poly([x + s * 7, y, x + s * 16.5, y - 6.4, x + s * 15, y, x + s * 16.5, y + 6.4])
				.fill(BAKERY.lemon)
				.stroke({ width: 1.3, color: ink, join: "round" });
		g.ellipse(x, y, 9.6, 6.6).fill(BAKERY.lemon).stroke({ width: 1.5, color: ink });
		g.moveTo(x - 5, y + 2)
			.bezierCurveTo(x - 3, y - 4, x + 2, y + 4, x + 5, y - 2)
			.stroke({ width: 1.8, color: BAKERY.berry, cap: "round" });
		gloss(g, x - 3, y - 2.6, 2.4, 1.1, 0.8);
	};

	// Reviewers: the pâtissier, who tastes everything before it goes in the window. A puffed mushroom
	// toque, gold half-moon glasses it peers over, and a macaron pin.
	parts["hat/reviewer"] = (g) => {
		g.moveTo(-24, T + 1)
			.bezierCurveTo(-54, T - 6, -44, T - 34, -12, T - 30)
			.bezierCurveTo(-4, T - 38, 10, T - 38, 16, T - 30)
			.bezierCurveTo(46, T - 34, 54, T - 6, 24, T + 1)
			.closePath()
			.fill(BAKERY.whites)
			.stroke({ width: W.part, color: ink, join: "round" });
		for (const x of [-26, -10, 8, 26])
			g.moveTo(x * 0.6, T - 4)
				.quadraticCurveTo(x * 1.05, T - 14, x * 0.95, T - 26)
				.stroke({ width: 1.3, color: BAKERY.whitesShade });
		g.ellipse(-22, T - 22, 8, 4).fill({ color: 0xffffff, alpha: 0.95 });
		g.roundRect(-27, T - 6, 54, 9, 3)
			.fill(BAKERY.whites)
			.stroke({ width: W.part, color: ink });
		g.rect(-25.5, T - 3, 51, 3).fill(BAKERY.lavender);
	};
	parts["front/bowtie"] = (g) => {
		macaron(g, 13, B - 1, 18, BAKERY.chocLight, BAKERY.buttercream);
	};
	parts["wear/glasses"] = (g) => {
		// Gold half-moons the size of the big eyes' frames (as the office's), the flat top across the
		// eyes' lower third, so the eyes show over them.
		const y = A.eyeY + 3.7;
		const r = 13.2;
		for (const x of [-A.eyeX, A.eyeX]) {
			g.moveTo(x - r, y)
				.lineTo(x + r, y)
				.arc(x, y, r, 0, Math.PI)
				.closePath()
				.fill({ color: 0xffffff, alpha: 0.3 })
				.stroke({ width: 2.6, color: ink, join: "round" });
			g.moveTo(x - r + 1.6, y)
				.arc(x, y, r - 1.6, Math.PI, 0, true)
				.stroke({ width: 1, color: BAKERY.gold });
		}
		line(g, [-A.eyeX + r, y, A.eyeX - r, y], 2.2, ink);
		line(g, [-A.eyeX + r + 1, y, A.eyeX - r - 1, y], 0.9, BAKERY.gold);
	};

	// Verifiers: the taster. A cupcake for a hat (a pleated liner round the head, three swirls of
	// frosting, sprinkles and a cherry), and a prize doughnut on a rosette for the best in show.
	parts["hat/verifier"] = (g) => {
		const liner = [-27, T + 8, 27, T + 8, 32, T - 6, -32, T - 6];
		g.poly(liner).fill(BAKERY.lemon);
		for (let k = -4; k <= 4; k++) line(g, [k * 6, T + 7.5, k * 7, T - 5.5], 1.4, BAKERY.lemonDeep);
		g.poly(liner).stroke({ width: W.part, color: ink, join: "round" });
		const swirl = [
			[0, T - 9, 36, 9],
			[1, T - 19, 27, 8],
			[2, T - 28, 17, 7],
		] as const;
		for (const [x, y, rx, ry] of swirl) {
			g.ellipse(x, y, rx, ry).fill(BAKERY.pink).stroke({ width: W.part, color: ink });
			g.moveTo(x - rx * 0.6, y + ry * 0.2)
				.quadraticCurveTo(x, y + ry * 0.75, x + rx * 0.7, y + ry * 0.1)
				.stroke({ width: 1, color: BAKERY.pinkDeep });
			gloss(g, x - rx * 0.45, y - ry * 0.35, rx * 0.2, ry * 0.22, 0.7);
		}
		g.moveTo(-6, T - 33)
			.quadraticCurveTo(2, T - 44, 7, T - 32)
			.closePath()
			.fill(BAKERY.pink)
			.stroke({ width: 2, color: ink, join: "round" });
		sprinkles(g, -30, T - 34, 30, T - 3, 26, 1, 1.15, (x, y) => {
			for (const [cx, cy, rx, ry] of swirl) if (((x - cx) / (rx - 3)) ** 2 + ((y - cy) / (ry - 2)) ** 2 < 1) return true;
			return false;
		});
		cherry(g, 4, T - 40, 5);
	};
	parts["front/badge"] = (g) => {
		const x = 15;
		const y = B - 3;
		for (const [dx, a] of [
			[-3, -0.2],
			[3, 0.2],
		] as const) {
			const tx = x + dx;
			g.poly([tx - 3, y + 3, tx + 3, y + 3, tx + 3 + a * 8, y + 12, tx + a * 8, y + 10, tx - 3 + a * 8, y + 12])
				.fill(BAKERY.sky)
				.stroke({ width: 1.2, color: ink, join: "round" });
		}
		g.star(x, y, 12, 9.6, 7.8, 0).fill(BAKERY.sky).stroke({ width: 1.2, color: ink, join: "round" });
		doughnut(g, x, y, 6.6, BAKERY.pink, 2);
	};

	// Designers: the cake decorator. A tiny three-tier cake perched on a headband with a satin bow;
	// a piping bag pinned on, a swirl of icing at its tip.
	parts["hat/designer"] = (g) => {
		g.moveTo(-37, T + 11)
			.bezierCurveTo(-33, T - 12, 33, T - 12, 37, T + 11)
			.stroke({ width: 5.4, color: ink, cap: "round" });
		g.moveTo(-37, T + 11)
			.bezierCurveTo(-33, T - 12, 33, T - 12, 37, T + 11)
			.stroke({ width: 3, color: BAKERY.pinkDeep, cap: "round" });
		const cx = -6;
		const cy = T - 6;
		g.save();
		g.translateTransform(-cx, -cy).rotateTransform(-0.16).translateTransform(cx, cy);
		g.ellipse(cx, cy + 1, 21, 3.4)
			.fill(BAKERY.gold)
			.stroke({ width: 1.6, color: ink });
		let y = cy;
		const tiers = [
			[34, 13, BAKERY.whites],
			[25, 11, BAKERY.pinkPale],
			[16, 10, BAKERY.whites],
		] as const;
		tiers.forEach(([w, h, fill], i) => {
			g.roundRect(cx - w / 2, y - h, w, h, 2)
				.fill(fill)
				.stroke({ width: 1.6, color: ink });
			drips(
				g,
				cx - w / 2 + 0.5,
				cx + w / 2 - 0.5,
				y - h + 1.6,
				i === 1 ? 0xffffff : BAKERY.pink,
				i === 0 ? [3.4, 6, 2.6, 5, 3.4] : i === 1 ? [3.4, 5, 2.6, 4] : [3, 4.6, 2.6],
				ink,
				1.5,
				1.8,
			);
			for (let k = 0; k < Math.round(w / 4); k++)
				g.circle(cx - w / 2 + 2.4 + k * 4, y - 1.8, 0.95)
					.fill(0xffffff)
					.stroke({ width: 0.5, color: ink });
			y -= h;
		});
		// A strawberry on top.
		g.moveTo(cx - 6, y - 2)
			.quadraticCurveTo(cx, y + 6, cx + 6, y - 2)
			.quadraticCurveTo(cx, y - 9, cx - 6, y - 2)
			.closePath()
			.fill(BAKERY.berry)
			.stroke({ width: 1.3, color: ink });
		g.star(cx, y - 5, 5, 4, 1.6, 0)
			.fill(BAKERY.mintDeep)
			.stroke({ width: 0.8, color: ink });
		for (const [dx, dy] of [
			[-2, -0.5],
			[1.6, 0],
			[0, 1.6],
		] as const)
			g.circle(cx + dx, y + dy, 0.6).fill(BAKERY.lemon);
		g.restore();
		// The satin bow on the band's right.
		const bx = 30;
		const by = T;
		g.poly([bx, by, bx - 9, by - 9, bx - 10, by + 4])
			.fill(BAKERY.mint)
			.stroke({ width: 1.4, color: ink, join: "round" });
		g.poly([bx, by, bx + 9, by - 10, bx + 11, by + 2])
			.fill(BAKERY.mint)
			.stroke({ width: 1.4, color: ink, join: "round" });
		g.circle(bx, by - 1, 2.8)
			.fill(BAKERY.mintDeep)
			.stroke({ width: 1.2, color: ink });
	};
	parts["front/scarf"] = (g) => {
		// The piping bag lying aslant: the twisted end low on the left, the steel nozzle up on the
		// right with a pink star of icing coming out.
		const [x0, y0, x1, y1] = [-12, B + 2, 10, B - 7];
		const l = Math.hypot(x1 - x0, y1 - y0);
		const [nx, ny] = [-(y1 - y0) / l, (x1 - x0) / l];
		const wide = 5.2;
		g.poly([x0 + nx * wide, y0 + ny * wide, x1, y1, x0 - nx * wide, y0 - ny * wide])
			.fill(0xffffff)
			.stroke({ width: 1.4, color: ink, join: "round" });
		g.poly([
			x0 + (x1 - x0) * 0.25 + nx * wide * 0.7,
			y0 + (y1 - y0) * 0.25 + ny * wide * 0.7,
			x1 - (x1 - x0) * 0.12,
			y1 - (y1 - y0) * 0.12,
			x0 + (x1 - x0) * 0.25 - nx * wide * 0.7,
			y0 + (y1 - y0) * 0.25 - ny * wide * 0.7,
		]).fill(BAKERY.pink);
		line(g, [x0 - (x1 - x0) * 0.12, y0 - (y1 - y0) * 0.12, x0, y0], 3.4, BAKERY.mintDeep);
		g.circle(x0, y0, 1.6).fill(BAKERY.mintDeep).stroke({ width: 0.9, color: ink });
		g.poly([x1 - 2, y1 + 0.6, x1 + 1, y1 - 2, x1 + 4.4, y1 - 3])
			.fill(BAKERY.steel)
			.stroke({ width: 1, color: ink, join: "round" });
		g.star(x1 + 6.4, y1 - 4.2, 6, 3.8, 2, 0.3)
			.fill(BAKERY.pinkDeep)
			.stroke({ width: 1, color: ink, join: "round" });
		gloss(g, x0 + 6, y0 - 4.4, 2.6, 1, 0.8);
	};

	// Held tools -----------------------------------------------------------------------------------

	/** A rolling pin's barrel, `w` long, centred at (x, y), lying flat. */
	const barrel = (g: Graphics, x: number, y: number, w: number, h: number) => {
		g.roundRect(x - w / 2, y - h / 2, w, h, h / 2)
			.fill(0xf0c890)
			.stroke({ width: 2.2, color: ink });
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
		for (const [x, y] of [
			[-8, -30],
			[-3, -29.5],
			[6, -30],
		] as const)
			g.circle(x, y, 0.9).fill(0xffffff);
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
		g.roundRect(x - w / 2, y - h / 2, w, h, 2.4)
			.fill(sponge)
			.stroke({ width: 2, color: ink });
		g.rect(x - w / 2 + 1, y - h / 2 + h * 0.48, w - 2, h * 0.18).fill(BAKERY.cream);
		drips(g, x - w / 2 + 1, x + w / 2 - 1, y - h / 2 + 2, BAKERY.pink, [2, 4, 1.6, 3.4, 2.4], ink, 1.4, 1.8);
		sprinkles(g, x - w / 2 + 2, y - h / 2 - 0.4, x + w / 2 - 2, y - h / 2 + 1.6, 6, seed, 0.9);
	};
	parts["held/brick"] = (g) => layer(g, 0, -10, WORK.brickW, WORK.brickH, BAKERY.vanilla, 1);
	// The crème brûlée torch: a pink canister in the hand, the nozzle up, a blue flame.
	parts["held/torch"] = (g) => {
		g.poly([-3, -18, 3, -18, 15, -44, -15, -44]).fill({ color: BAKERY.flame, alpha: 0.16 });
		g.moveTo(-1.5, -24)
			.quadraticCurveTo(-6, -34, 0, -42)
			.quadraticCurveTo(6, -34, 1.5, -24)
			.closePath()
			.fill({ color: BAKERY.flame, alpha: 0.85 })
			.stroke({ width: 1.1, color: ink });
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
		g.moveTo(-6.6, 2)
			.quadraticCurveTo(-8, -10, -1.6, -24)
			.lineTo(1.6, -24)
			.quadraticCurveTo(8, -10, 6.6, 2)
			.closePath()
			.fill(0xffffff)
			.stroke({ width: 1.6, color: ink, join: "round" });
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
		g.moveTo(-11, -26)
			.lineTo(11, -26)
			.quadraticCurveTo(11, -12, 0, -12)
			.quadraticCurveTo(-11, -12, -11, -26)
			.fill(BAKERY.gold)
			.stroke({ width: W.part, color: ink });
		drips(g, -10.5, 10.5, -25, BAKERY.pink, [2, 4, 1.6, 3.4, 2.2], ink, 1.3, 1.4);
		gloss(g, -5, -19, 1.4, 3.4, 0.6);
	};
	// The mug is a cappuccino on its saucer, a heart in the foam.
	parts["held/mug"] = (g) => {
		g.ellipse(4, -0.6, 8, 1.6).fill(0xffffff).stroke({ width: 1.4, color: ink });
		g.arc(10, -8, 3.4, -Math.PI / 2, Math.PI / 2).stroke({ width: 2, color: ink });
		g.moveTo(-2, -13)
			.lineTo(10, -13)
			.quadraticCurveTo(10, -1.6, 4, -1.6)
			.quadraticCurveTo(-2, -1.6, -2, -13)
			.closePath()
			.fill(BAKERY.pinkPale)
			.stroke({ width: 2, color: ink });
		g.ellipse(4, -13, 6, 1.8).fill(BAKERY.crema).stroke({ width: 1.2, color: ink });
		g.moveTo(4, -12).bezierCurveTo(2, -13.4, 2.6, -14.4, 4, -13.6).bezierCurveTo(5.4, -14.4, 6, -13.4, 4, -12).fill(0xffffff);
		gloss(g, 0.6, -8, 0.8, 2.6, 0.8);
	};

	// The recipe card (where the blueprint was): a title band, a cake drawn on it, the steps ticked.
	// Turned, it hangs upside down.
	const recipe = (g: Graphics, flip: boolean, w = 0) => {
		g.roundRect(-29 - w, -14, 58 + 2 * w, 25, 1)
			.fill(BAKERY.cream)
			.stroke({ width: W.part, color: ink });
		const k = flip ? -1 : 1;
		const Y = (v: number) => -1 + v * k;
		g.rect(-26 - w, Y(-8) - 1.8, 52 + 2 * w, 3.6).fill(BAKERY.pink);
		// The cake on the left.
		g.rect(-23, Math.min(Y(2), Y(8)), 13, 6)
			.fill(BAKERY.pinkPale)
			.stroke({ width: 1, color: ink });
		g.rect(-21, Math.min(Y(-2), Y(2)), 9, 4)
			.fill(0xffffff)
			.stroke({ width: 1, color: ink });
		g.circle(-16.5, Y(-3.4), 1.3).fill(BAKERY.cherry);
		for (const [v, w] of [
			[-2.5, 26],
			[1.5, 20],
			[5.5, 24],
		] as const) {
			line(g, [-5, Y(v), -5 + w - 6, Y(v)], 1.1, ink);
			line(g, [-5 + w - 3, Y(v), -5 + w, Y(v)], 1.1, BAKERY.mintDeep);
		}
		g.roundRect(-30 - w, -17, 60 + 2 * w, 6, 2)
			.fill(BAKERY.pinkDeep)
			.stroke({ width: 2, color: ink });
	};
	const roll = (g: Graphics, w = 0) => {
		g.roundRect(-31 - w, -18, 62 + 2 * w, 12, 6)
			.fill(BAKERY.cream)
			.stroke({ width: W.part, color: ink });
		g.rect(-20, -14, 10, 3).fill(BAKERY.pink);
		g.rect(10, -14, 10, 3).fill(BAKERY.pink);
		g.ellipse(-31 - w, -12, 3, 6)
			.fill(BAKERY.pinkPale)
			.stroke({ width: 1.6, color: ink });
		g.ellipse(31 + w, -12, 3, 6)
			.fill(BAKERY.pinkPale)
			.stroke({ width: 1.6, color: ink });
		// Tied with a ribbon and a bow.
		g.rect(-2, -18, 4, 12).fill(BAKERY.mintDeep).stroke({ width: 1, color: ink });
		g.poly([0, -18, -6, -20, -6, -15]).fill(BAKERY.mint).stroke({ width: 1, color: ink, join: "round" });
		g.poly([0, -18, 6, -20, 6, -15]).fill(BAKERY.mint).stroke({ width: 1, color: ink, join: "round" });
	};
	parts["prop/plan"] = (g) => recipe(g, false);
	parts["prop/plan2"] = (g) => recipe(g, true);
	parts["prop/roll"] = (g) => roll(g);
	// A plum holds them wider (reach.ts frontSpread).
	for (const level of PLUMP_LEVELS) {
		const w = frontSpread(level);
		parts[sized("prop/plan", level)] = (g) => recipe(g, false, w);
		parts[sized("prop/plan2", level)] = (g) => recipe(g, true, w);
		parts[sized("prop/roll", level)] = (g) => roll(g, w);
	}

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
		g.poly([x, y - h, x - b, y - h - b * 0.6, x - b, y - h + b * 0.3])
			.fill(BAKERY.mint)
			.stroke({ width: 0.9, color: ink, join: "round" });
		g.poly([x, y - h, x + b, y - h - b * 0.6, x + b, y - h + b * 0.3])
			.fill(BAKERY.mint)
			.stroke({ width: 0.9, color: ink, join: "round" });
		g.circle(x, y - h, b * 0.3)
			.fill(BAKERY.mintDeep)
			.stroke({ width: 0.8, color: ink });
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
		for (const [x, c] of [
			[-7, BAKERY.pink],
			[1, BAKERY.lavender],
			[9, BAKERY.mint],
		] as const)
			cupcake(g, x - 1, -13, 7, c, x + 9);
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
		for (let k = 0; k < 6; k++)
			g.circle(-8.5 + k * 3.4, -6.6, 0.9)
				.fill(0xffffff)
				.stroke({ width: 0.4, color: ink });
		cherry(g, 0, -19.4, 2.8);
		// The dome.
		g.moveTo(-19, -5).bezierCurveTo(-19, -29, 19, -29, 19, -5).closePath().fill({ color: BAKERY.glass, alpha: 0.32 }).stroke({ width: W.part, color: ink });
		g.moveTo(-14, -9).quadraticCurveTo(-13, -21, -4, -23.5).stroke({ width: 2.2, color: 0xffffff, cap: "round" });
		g.moveTo(13, -10).quadraticCurveTo(13.5, -14, 12, -16).stroke({ width: 1.4, color: 0xffffff, cap: "round" });
		g.circle(0, -24.6, 2.8).fill(BAKERY.gold).stroke({ width: 1.4, color: ink });
		g.poly(rotRect(15, -3, 9, 6, 0.2))
			.fill(BAKERY.ticket)
			.stroke({ width: 1, color: ink, join: "round" });
		line(g, [12.4, -3.6, 17.6, -2.4], 0.8, BAKERY.pinkDeep);
	};

	// The drum sat on (the bakery's flour-sack nap): a fat flour sack, its top slumped where the
	// baker sits, the neck tied off at one end, a wheat sheaf stamped on it, flour puffing out.
	parts["prop/drum"] = (g) => {
		g.moveTo(-46, -3)
			.quadraticCurveTo(-48, -26, -42, -38)
			.quadraticCurveTo(-22, -44, 0, -40)
			.quadraticCurveTo(22, -44, 42, -38)
			.quadraticCurveTo(48, -26, 46, -3)
			.quadraticCurveTo(0, 3, -46, -3)
			.closePath()
			.fill(0xf3e4c8)
			.stroke({ width: W.part, color: ink, join: "round" });
		for (const [x0, x1] of [
			[-30, -26],
			[24, 30],
		] as const)
			g.moveTo(x0, -30)
				.quadraticCurveTo(x0 - 3, -18, x1, -6)
				.stroke({ width: 1.2, color: 0xd8c39c });
		// The stamp: a wheat sheaf in a ring.
		g.circle(0, -18, 9).stroke({ width: 1.4, color: BAKERY.chocLight });
		line(g, [0, -11, 0, -24], 1.4, BAKERY.chocLight);
		for (const s of [-1, 1]) for (const y of [-23, -19.5, -16]) g.ellipse(s * 2.4, y, 1.6, 2.6).fill(BAKERY.chocLight);
		// The tied neck on the right, and flour puffing from it.
		g.ellipse(44, -30, 3.6, 6.4).fill(0xf3e4c8).stroke({ width: 1.8, color: ink });
		line(g, [40.5, -36, 40.5, -24], 2.6, BAKERY.berry);
		for (const [x, y, r] of [
			[-37, -42.5, 2.2],
			[-30, -43.5, 1.6],
			[32, -43, 1.8],
		] as const)
			g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.9 });
		gloss(g, -20, -30, 8, 2.4, 0.45);
	};

	// The work out front (reach.ts WORK) ---------------------------------------------------------

	// The pastry bench, where the sawhorse was: a floured board on pastel legs.
	const bench = (g: Graphics) => {
		const { benchL: l, benchR: r, benchTop: t } = WORK;
		for (const [a, b] of [
			[l + 7, l + 3],
			[r - 7, r - 3],
		] as const) {
			line(g, [a, t + 4, b, 0], 4.2, ink);
			line(g, [a, t + 4, b, 0], 2.2, BAKERY.mintDeep);
		}
		line(g, [l + 5, t + 14, r - 5, t + 14], 3, ink);
		line(g, [l + 5, t + 14, r - 5, t + 14], 1.2, BAKERY.mint);
		g.roundRect(l, t, r - l, 7, 1.5)
			.fill(BAKERY.board)
			.stroke({ width: W.part, color: ink });
		line(g, [l + 3, t + 4.6, r - 3, t + 4.6], 0.8, BAKERY.wood);
		for (const [x, rx] of [
			[l + 8, 4],
			[r - 12, 6],
			[l + 22, 3],
		] as const)
			g.ellipse(x, t + 2, rx, 1.2).fill({ color: 0xffffff, alpha: 0.85 });
	};
	/** The dough on the bench, its top at `top`: rolled flatter and wider each pass. */
	const dough = (g: Graphics, top: number, passes: number) => {
		const x = WORK.nailX;
		const t = WORK.benchTop;
		const h = t - top;
		const w = 20 + passes * 4;
		g.moveTo(x - w / 2, t)
			.quadraticCurveTo(x - w / 2 - 1, top, x - 2, top)
			.quadraticCurveTo(x + w / 2 + 2, top - 0.5, x + w / 2, t)
			.closePath()
			.fill(BAKERY.dough)
			.stroke({ width: 1.4, color: ink, join: "round" });
		if (h > 4) gloss(g, x - w / 6, top + h * 0.38, w * 0.14, h * 0.16, 0.7);
		for (let k = 0; k < passes; k++) line(g, [x - w / 2 + 4, top + 1.6 + k * 1.3, x + w / 2 - 4, top + 1.6 + k * 1.3], 0.8, BAKERY.doughShade);
		for (const [dx, dy] of [
			[-5, 1.4],
			[4, 1.1],
			[0, 2.6],
		] as const)
			g.circle(x + dx, top + dy, 0.8).fill(0xffffff);
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
			g.moveTo(x + s * 2, t)
				.lineTo(x + s * 14, t)
				.quadraticCurveTo(x + s * 14, top, x + s * 4, top - 1)
				.lineTo(x + s * 1, t - 1)
				.closePath()
				.fill(BAKERY.dough)
				.stroke({ width: 1.3, color: ink, join: "round" });
		}
		for (const [dx, dy, r] of [
			[-3, -6, 3.4],
			[3, -8, 3],
			[8, -5, 2.4],
			[-8, -4, 2.2],
		] as const)
			g.circle(x + dx, top + dy, r)
				.fill({ color: 0xffffff, alpha: 0.9 })
				.stroke({ width: 0.8, color: ink, alpha: 0.5 });
		const mx = WORK.benchR + 3;
		line(g, [mx, -3.6, mx + 29, -3.6], 2.6, BAKERY.pinkDeep);
		barrel(g, mx + 14.5, -3.8, 21, 7);
	};

	// The stand mixer, where the machine was: the crank's hub on the nut, a third of a turn a step;
	// pink batter in the bowl, the beater turning and spattering.
	const mixer = (g: Graphics, step: number) => {
		const { x, y } = WORK.nut;
		// The base and the column at the back.
		g.roundRect(x - 12, y + 34, 33, 5, 2.5)
			.fill(BAKERY.pinkDeep)
			.stroke({ width: 1.6, color: ink });
		g.roundRect(x + 11, y - 8, 9, 44, 4)
			.fill(BAKERY.pink)
			.stroke({ width: W.fine, color: ink });
		// The bowl: steel, batter heaped in it.
		g.moveTo(x - 13, y + 20)
			.lineTo(x + 13, y + 20)
			.quadraticCurveTo(x + 12, y + 35, x, y + 35)
			.quadraticCurveTo(x - 12, y + 35, x - 13, y + 20)
			.closePath()
			.fill(BAKERY.steel)
			.stroke({ width: W.fine, color: ink });
		g.moveTo(x - 12, y + 20.5)
			.quadraticCurveTo(x - 4, y + 13 - step, x + 1, y + 16)
			.quadraticCurveTo(x + 6, y + 13 + step, x + 12, y + 20.5)
			.closePath()
			.fill(BAKERY.pinkPale)
			.stroke({ width: 1.2, color: ink });
		gloss(g, x - 8, y + 26, 2, 4, 0.7);
		// The beater down into the batter.
		line(g, [x + 2, y + 9, x + 2, y + 18], 2.4, ink);
		line(g, [x + 2, y + 9, x + 2, y + 18], 1, BAKERY.steel);
		// Spatters flying as it turns.
		for (let k = 0; k <= step; k++)
			g.circle(x - 10 - k * 3, y + 12 - k * 4, 1.2)
				.fill(BAKERY.pink)
				.stroke({ width: 0.6, color: ink });
		// The head over the bowl: pink enamel, a gold stripe.
		g.roundRect(x - 13, y - 16, 34, 26, 11)
			.fill(BAKERY.pink)
			.stroke({ width: W.part, color: ink });
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
		g.poly(rotRect(x, y, 6, len, a))
			.fill(BAKERY.golden)
			.stroke({ width: 1.3, color: ink, join: "round" });
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
		for (let y = -16; y < -1; y += 4)
			for (let x = 57; x < 92; x += 5) line(g, [x, y + ((x / 5) % 2 ? 0 : 2), x + 3, y + ((x / 5) % 2 ? 2 : 0)], 0.9, 0xa8713e);
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
		g.translateTransform(-px, -t)
			.rotateTransform(tilt * 0.12)
			.translateTransform(px, t);
		const tier = (cx: number, cy: number, sponge: number) => {
			g.roundRect(cx - 9, cy - 5.5, 18, 11, 2)
				.fill(sponge)
				.stroke({ width: 2, color: ink });
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
		const rail = (y: number) =>
			g
				.rect(S.x - 8, y, 36, 2)
				.fill(BAKERY.wood)
				.stroke({ width: 1, color: ink });
		if (state === "shut") {
			rail(S.y - 8);
			g.roundRect(S.x - 5, S.y - 6, 30, 13, 2)
				.fill(BAKERY.mint)
				.stroke({ width: W.fine + 0.4, color: ink });
			g.roundRect(S.x + 14, S.y + 1.5, 9, 4, 1)
				.fill(0xffd08a)
				.stroke({ width: 0.9, color: ink });
			g.circle(S.x + 16.5, S.y + 3.5, 1.2)
				.circle(S.x + 20, S.y + 3.5, 1.2)
				.fill(BAKERY.dough);
			g.roundRect(S.x - 1, S.y - 1.3, 20, 2.6, 1.3)
				.fill(BAKERY.gold)
				.stroke({ width: 1.4, color: ink });
			rail(S.y + 7);
			return;
		}
		rail(S.y - 8);
		g.rect(S.x - 6, S.y - 6, 32, 5)
			.fill(mix(BAKERY.mint, ink, 0.35))
			.stroke({ width: 1.2, color: ink });
		for (let i = 0; i < 6; i++) {
			const x = S.x - 1 + i * 5;
			if (state === "gap" && i === 3) continue;
			g.rect(x - 2.4, S.y - 7, 4.8, 3)
				.fill(BAKERY.steel)
				.stroke({ width: 0.8, color: ink });
			g.circle(x, S.y - 8.4, 2.6)
				.fill(BAKERY.dough)
				.stroke({ width: 0.9, color: ink });
			g.circle(x - 0.8, S.y - 9.4, 0.8).fill(0xffffff);
		}
		const o = AT.drawerOut;
		g.poly([S.x - 7, S.y - 2, S.x + 27, S.y - 2, S.x + 27, S.y + 12, S.x - 7, S.y + 12])
			.fill(BAKERY.mint)
			.stroke({ width: W.fine + 0.4, color: ink, join: "round" });
		g.roundRect(S.x + o.x - 1, S.y + o.y + 2.2, 20, 2.6, 1.3)
			.fill(BAKERY.gold)
			.stroke({ width: 1.4, color: ink });
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
		o: {
			lid?: number;
			sheet?: boolean;
			light?: "go" | "red";
			glow?: boolean;
			copies?: 1 | 2;
			door?: boolean;
			jam?: "corner" | "inside" | "tugged";
			bang?: boolean;
			pressed?: boolean;
		},
	) => {
		const lidLen = 30;
		// The cooling rack on the far side, and the croissants on it.
		g.poly([S.x + 36, S.y + 8, S.x + 52, S.y + 5, S.x + 52.5, S.y + 7.5, S.x + 36, S.y + 11])
			.fill(BAKERY.steel)
			.stroke({ width: 1.6, color: ink, join: "round" });
		for (const k of [0, 1, 2, 3]) line(g, [S.x + 38 + k * 4, S.y + 10.2 - k * 0.6, S.x + 38.4 + k * 4, S.y + 7.4 - k * 0.6], 0.7, BAKERY.steelDark);
		if (o.copies === 1) croissant(g, S.x + 42, S.y + 6, 9);
		if (o.copies === 2) for (let k = 0; k < 3; k++) croissant(g, S.x + 41 + k * 4.4, S.y + 6.4 - k * 1.6, 8.4);
		// The control plate: the dial and the thermostat light.
		const b = at(AT.button);
		g.roundRect(b.x - 4, b.y - 3, 15, 6, 1.5)
			.fill(BAKERY.pinkDeep)
			.stroke({ width: 1.2, color: ink });
		g.circle(b.x, b.y, 3).fill(BAKERY.gold).stroke({ width: 0.9, color: ink });
		line(g, [b.x, b.y, b.x + (o.pressed ? 1.6 : 0), b.y - (o.pressed ? 1.6 : 2.4)], 1.1, ink);
		const bx = b.x + 7;
		const lit = o.light === "red" ? RED : o.light === "go" ? p.go : 0x7a6a4a;
		g.circle(bx, b.y, o.pressed ? 2.4 : 2)
			.fill(lit)
			.stroke({ width: 0.9, color: ink });
		if (o.light === "red")
			for (const a of o.pressed ? [-2.6, -1.57, -0.5] : [-2.2, -0.9])
				line(g, [bx + Math.cos(a) * 3.4, b.y + Math.sin(a) * 3.4, bx + Math.cos(a) * 5.6, b.y + Math.sin(a) * 5.6], 1, RED);
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
			g.poly([j.x - 3, dt + 0.5, j.x - 1, dt - 4, j.x + 2, dt - 2.5, j.x + 4, dt - 5, j.x + 5, dt + 0.5])
				.fill(BAKERY.burnt)
				.stroke({ width: 1.2, color: ink, join: "round" });
			for (const k of [0, 1]) g.circle(j.x + k * 3, dt - 8 - k * 3, 1.6 + k * 0.6).fill({ color: 0x9aa3bd, alpha: 0.6 });
		}
		if (o.jam === "inside")
			g.poly([j.x - 4, j.y - 3, j.x, j.y - 5, j.x + 4, j.y - 2, j.x + 3, j.y + 3, j.x - 2, j.y + 4, j.x - 5, j.y + 1])
				.fill(BAKERY.burnt)
				.stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "tugged") {
			const e = at(AT.jamOut);
			g.roundRect(e.x, j.y - 3, j.x + 4 - e.x, 6, 3)
				.fill(BAKERY.burnt)
				.stroke({ width: 1.2, color: ink });
			for (let k = 1; k < 4; k++) {
				const x = e.x + ((j.x + 4 - e.x) * k) / 4;
				line(g, [x - 1.2, j.y - 1.6, x + 1.2, j.y + 1.6], 0.9, 0x8a6a50);
			}
			for (const k of [0, 1]) g.circle(j.x - 4 + k * 4, j.y - 6 - k * 3, 1.4 + k * 0.5).fill({ color: 0x9aa3bd, alpha: 0.6 });
		}
		// The deck under a raised hood, and the tray of croissants laid on it.
		if (o.lid) {
			g.rect(S.x, S.y - 1.5, lidLen - 2, 1.5)
				.fill(BAKERY.burnt)
				.stroke({ width: 1, color: ink });
			if (o.sheet) {
				g.rect(S.x + 4, S.y - 2.6, 20, 1.2)
					.fill(BAKERY.steel)
					.stroke({ width: 0.6, color: ink });
				for (const k of [0, 1, 2]) croissant(g, S.x + 8 + k * 6, S.y - 4.4, 6.4, BAKERY.dough, BAKERY.doughShade);
			}
		}
		// The hood, about its hinge at the far end, a gold handle at its front.
		const hx = S.x + lidLen;
		const hy = S.y - 2;
		g.save();
		g.translateTransform(-hx, -hy)
			.rotateTransform(((o.lid ?? 0) * Math.PI) / 180)
			.translateTransform(hx, hy);
		g.roundRect(S.x - 1, S.y - 4, lidLen + 1, 4, 1.5)
			.fill(BAKERY.mintDeep)
			.stroke({ width: W.fine + 0.2, color: ink });
		line(g, [S.x + 3, S.y - 3, S.x + lidLen - 3, S.y - 3], 0.9, 0xffffff);
		g.roundRect(S.x - 4, S.y - 3.5, 5, 3, 1.4)
			.fill(BAKERY.gold)
			.stroke({ width: 0.8, color: ink });
		g.restore();
		if (o.glow) {
			// Baking: the deck glows, and the smell comes off it.
			g.rect(S.x, S.y - 0.6, lidLen - 2, 1.4).fill(0xff9a2e);
			for (const x of [S.x + 6, S.x + 16, S.x + 24])
				g.moveTo(x, S.y - 3)
					.quadraticCurveTo(x - 3, S.y - 6, x, S.y - 9)
					.stroke({ width: 1.2, color: 0xffb3cf, cap: "round" });
			sparkle(g, S.x + lidLen / 2, S.y + 1.5, 2.6, p.sun, ink);
		}
		if (o.bang) {
			burstAt(g, S.x - 4, -7, 3, 7, ink);
			for (const [x, y] of [
				[S.x - 6, S.y + 2],
				[S.x + lidLen + 6, S.y - 4],
			] as const) {
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
		g.roundRect(x - 0.4, y - 7, 6.4, 3.6, 1)
			.fill(colour)
			.stroke({ width: 0.8, color: ink });
		if (kind === "ok") line(g, [x + 1.2, y - 5.2, x + 2.4, y - 4.3, x + 4.6, y - 6.3], 0.9, 0xffffff);
		else {
			line(g, [x + 1.4, y - 6.4, x + 4.2, y - 4], 0.9, 0xffffff);
			line(g, [x + 4.2, y - 6.4, x + 1.4, y - 4], 0.9, 0xffffff);
		}
	};
	const tasting = (g: Graphics, verdict: number, m?: "ok" | "no", slid = false) => {
		/** A slice of layer cake on a plate, the flag in it if it's been tasted. */
		const slice = (x: number, y: number, mk?: "ok" | "no") => {
			g.ellipse(x + 0.5, y + 0.6, 9, 1.6)
				.fill(BAKERY.plate)
				.stroke({ width: 1, color: ink });
			g.poly([x - 6, y, x + 7, y, x + 7, y - 5.4, x - 6, y - 3.4])
				.fill(BAKERY.vanilla)
				.stroke({ width: 1, color: ink, join: "round" });
			line(g, [x - 5.4, y - 1.8, x + 6.6, y - 2.6], 1, BAKERY.pink);
			g.poly([x - 6, y - 3.4, x + 7, y - 5.4, x + 7, y - 6.6, x - 6, y - 4.4])
				.fill(BAKERY.pink)
				.stroke({ width: 0.8, color: ink, join: "round" });
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
		g.roundRect(i.x - 7, i.y + 2, 14, 1.8, 0.8)
			.fill(BAKERY.gold)
			.stroke({ width: 1, color: ink });
		g.roundRect(i.x - 6, i.y - 3.4, 12, 5.6, 1.6)
			.fill(BAKERY.pinkPale)
			.stroke({ width: 1.4, color: ink });
		g.rect(i.x + 1, i.y - 3, 4.6, 5).fill(BAKERY.vanilla);
		line(g, [i.x + 1, i.y - 0.6, i.x + 5.6, i.y - 0.6], 0.9, BAKERY.pink);
		g.rect(i.x - 5.4, i.y - 3.6, 6, 1.2).fill(0xffffff);
		g.circle(i.x - 3, i.y - 4.4, 1.3)
			.fill(BAKERY.cherry)
			.stroke({ width: 0.6, color: ink });
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
		const page = (dy: number, fill: number) =>
			g
				.poly([S.x - 8, S.y + 1 + dy, S.x + 14, S.y + 1 + dy, S.x + 16.5, S.y - 4 + dy, S.x - 5.5, S.y - 4 + dy])
				.fill(fill)
				.stroke({ width: 1.3, color: ink, join: "round" });
		page(1.4, BAKERY.pinkDeep);
		page(0, BAKERY.pinkPale);
		line(g, [S.x - 5, S.y - 3, S.x + 15.6, S.y - 3], 1.2, BAKERY.pinkDeep);
		const bits = [
			[S.x - 4, S.x + 1],
			[S.x + 2, S.x + 7],
			[S.x + 8, S.x + 12],
		] as const;
		for (let k = 0; k < Math.min(n, 3); k++) {
			const [a, b] = bits[k]!;
			const y = S.y - 1.2 + (k === 1 ? 0.6 : 0);
			const pts: number[] = [];
			for (let x = a; x <= b; x += 1.25) pts.push(x, y + (Math.round((x - a) / 1.25) % 2 ? -0.7 : 0.5));
			line(g, pts, 0.9, ink);
		}
		if (n >= 3) g.circle(S.x + 13, S.y - 0.6, 2.4).stroke({ width: 0.9, color: RED });
		if (flip) {
			g.moveTo(S.x - 5.5, S.y - 4)
				.quadraticCurveTo(S.x - 3, S.y - 13, S.x + 4, S.y - 14)
				.lineTo(S.x + 22, S.y - 12)
				.quadraticCurveTo(S.x + 16, S.y - 10, S.x + 16.5, S.y - 4)
				.closePath()
				.fill(BAKERY.pinkPale)
				.stroke({ width: 1.3, color: ink, join: "round" });
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
		g.ellipse(r - 7.3, S.y - 2.8, 4.2, 0.9)
			.fill(BAKERY.gold)
			.stroke({ width: 0.7, color: ink });
		cupcake(g, r - 7.3, S.y - 3.4, 5, BAKERY.lavender, 3);
		g.rect(l, S.y + 1.6, r - l, 5.4)
			.fill(BAKERY.cream)
			.stroke({ width: 1, color: ink });
		for (let k = 0; k < 4; k++) {
			const x = l + 4.5 + k * 8.4;
			if (k % 2) macaron(g, x, S.y + 4.2, 4.6, k === 1 ? BAKERY.pink : BAKERY.pistachio);
			else croissant(g, x, S.y + 4.4, 6);
		}
		g.rect(l, S.y + 1.6, r - l, 5.4).fill({ color: BAKERY.glass, alpha: 0.28 });
		line(g, [l + 3, S.y + 6.4, l + 7, S.y + 2], 1, 0xffffff);
		line(g, [l + 18, S.y + 6.4, l + 21, S.y + 2.6], 0.8, 0xffffff);
		g.rect(l, S.y + 5.4, r - l, 1.8)
			.fill(BAKERY.pinkDeep)
			.stroke({ width: 0.9, color: ink });
		if (box === 2) pastryBox(g, t.x + 3, S.y - 1, 13, 6.4);
		g.roundRect(l, S.y - 1, r - l, 2.6, 1)
			.fill(BAKERY.gold)
			.stroke({ width: W.fine, color: ink });
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
		g.rect(pl.x - 8, S.y - 0.4, 16, 1.6)
			.fill(BAKERY.board)
			.stroke({ width: 0.7, color: ink });
		for (let k = 0; k < n; k++) {
			g.poly(rotRect(pl.x + (k % 2 ? 0.8 : -0.6), S.y - 1.2 * (k + 1), 12, 1.2, k % 2 ? 0.05 : -0.05))
				.fill(k % 2 ? BAKERY.chocLight : BAKERY.burnt)
				.stroke({ width: 0.6, color: ink });
		}
		const s = at(AT.slot);
		g.roundRect(s.x - 13, s.y - 2, 26, 4, 1.6)
			.fill(BAKERY.pink)
			.stroke({ width: 1, color: ink });
		g.roundRect(s.x - 9, s.y - 1.4, 18, 2.8, 1.2).fill(ink);
		line(g, [s.x - 10, s.y + 2.4, s.x + 10, s.y + 2.4], 1, BAKERY.pinkDeep);
		if (crunch) {
			for (const side of [-1, 1]) {
				const x = s.x + side * 15;
				line(g, [x, s.y - 3, x + side * 1.5, s.y - 1.5, x, s.y, x + side * 1.5, s.y + 1.5], 1.1, ink);
				g.circle(s.x + side * 4, s.y - 4, 1.2)
					.circle(s.x + side * 7, s.y - 3, 0.9)
					.fill(BAKERY.chocLight);
			}
		}
	};
	parts["work/shred"] = (g) => crumbBin(g, 5, false);
	parts["work/shred4"] = (g) => crumbBin(g, 4, false);
	parts["work/shredBuzz"] = (g) => crumbBin(g, 4, true);

	/** A sheet of parchment with burnt cookies on it, held by its top going into the bin: `len` of it
	 * still shows. */
	const parchment = (g: Graphics, len: number) => {
		g.moveTo(-6, 1)
			.lineTo(6, 1)
			.lineTo(5.6, 1 + len)
			.lineTo(-5.6, 1 + len)
			.closePath()
			.fill(BAKERY.cream)
			.stroke({ width: 1.3, color: ink, join: "round" });
		for (const [x, y] of [
			[-2.6, 4],
			[2.4, 7.4],
			[-1.6, 11],
		] as const)
			if (y + 2 < 1 + len) g.circle(x, y, 1.8).fill(BAKERY.burnt);
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
				g.roundRect(x, y + h * 0.25, w, h * 0.75, h * 0.37)
					.fill(BAKERY.golden)
					.stroke({ width: 0.7, color: ink });
				g.roundRect(x + 0.4, y, w - 0.8, h * 0.45, h * 0.22)
					.fill(BAKERY.choc)
					.stroke({ width: 0.6, color: ink });
				gloss(g, x + w * 0.3, y + h * 0.15, w * 0.15, h * 0.08, 0.7);
				break;
			case 3:
				// A doughnut side on: the glaze over the top, sprinkles.
				g.roundRect(x, y + h * 0.1, w, h * 0.9, h * 0.45)
					.fill(BAKERY.golden)
					.stroke({ width: 0.7, color: ink });
				g.roundRect(x + 0.3, y, w - 0.6, h * 0.5, h * 0.25)
					.fill(BAKERY.pinkDeep)
					.stroke({ width: 0.6, color: ink });
				sprinkles(g, x + 1, y + 0.4, x + w - 1, y + h * 0.4, 3, k, 0.55);
				break;
			default:
				// A cinnamon roll, its swirl showing.
				g.roundRect(x, y, w, h, h * 0.4)
					.fill(BAKERY.goldenDeep)
					.stroke({ width: 0.7, color: ink });
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
		g.poly([x - w / 2 - 3, base - 5, x + w / 2 + 3, base - 5, x + w / 2 + 1, base, x - w / 2 - 1, base])
			.fill(BAKERY.steel)
			.stroke({ width: 1.4, color: ink, join: "round" });
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
			for (const [dx, dy, a] of [
				[-7, 4, 0.4],
				[7, 6, -0.6],
				[2, 9, 1.2],
			] as const)
				g.poly(rotRect(fx + dx, fy + dy, 3, 1.2, a))
					.fill(SPRINKLES[(dx + 7) % SPRINKLES.length]!)
					.stroke({ width: 0.4, color: ink });
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
				else if (i % 7 === 6)
					g.moveTo(x, y + 2.6)
						.bezierCurveTo(x - 4.4, y - 0.6, x - 2.2, y - 4, x, y - 1.6)
						.bezierCurveTo(x + 2.2, y - 4, x + 4.4, y - 0.6, x, y + 2.6)
						.fill(BAKERY.pinkDeep)
						.stroke({ width: 0.8, color: ink });
				else
					g.poly(rotRect(x, y, 6, 2.2, (k % 7) * 0.45))
						.fill(SPRINKLES[(i + v) % SPRINKLES.length]!)
						.stroke({ width: 0.5, color: ink });
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
