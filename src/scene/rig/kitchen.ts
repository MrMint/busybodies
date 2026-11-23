// The Line's rig: a restaurant kitchen (plan-alive wave 3, stream H). The same cast and parts as the
// paper rig, repainted by name as the office's and the factory's are, so every pose plays unchanged:
// the crew in chef whites, each role told apart by its headwear at room zoom; the builder's work
// becomes prep on the same points (reach.ts WORK), the station parts the hands work become kitchen
// kit at the same working points (reach.ts STATION, AT, TRAY, PLANNER), at about the same size, so
// the solved reaches still land on the business ends:
//
//   hammer → a meat mallet          nails → a cutlet, pounded flatter a strike at a time
//   sawhorse → a butcher block      bricks → sponge layers, stacked into a layer cake
//   wrench → a pasta machine's crank   the machine's nut → the pasta machine
//   crate → a produce crate         bolt, gear → a garlic bulb, a tomato
//   blueprint → tonight's menu      torch → a kitchen blowtorch     map → the table plan
//   brush → a pastry brush
//
//   filing drawer → a lowboy fridge drawer of deli tubs   copier → a sandwich press on an oven
//   stamp desk → tasting: a spoon, the sauce pan, bowls marked yes or no
//   notepad → the takeout line's order pad   outbox → the pass, a plate set under the heat lamp
//   shredder → the scraps bin           in-tray → the mise tray, stacked deli tubs of prep
//   planner notes → order tickets on the rail     the PR → a plate under a cloche
//
// The bell is the paper rig's brass service bell (it is one already); its ding says "service!".
// Costumes, by role:
//
//   lead      tall toque, a headset, the neckerchief (the project accent): the expediter
//   builder   a red bandana and a butcher's striped apron with a side towel: the line cook
//   scout     a backwards cap and a black waiter's apron with an order pad: the runner
//   explorer  a bucket hat with a sprig, a basket strap and a mushroom: the forager
//   reviewer  a sous chef's toque, tasting spoons in the pocket, glasses on a chain
//   verifier  a hairnet over a bun and a probe thermometer: the one who checks the temperature
//   designer  a short black toque, a black jacket, a squeeze bottle and tweezers: the plater
import type { Graphics } from "pixi.js";
import { bodyEdge } from "./factory";
import { AT, BELL, PLANNER, STATION, STICKY, TRAY, WORK, handAt } from "./reach";
import { ROLES } from "./roles";
import { ANCHORS, type Painter, type Palette, PAPER_PALETTE, RED, type Theme, TRAY_FULL, W, burstAt, line, mochiPath, paperTheme, rotRect, sparkle, text } from "./theme";

/** Kitchen colours, on top of the paper palette. */
export const KITCHEN = {
	whites: 0xfbfbf6,
	whitesShade: 0xe2e5ee,
	button: 0x56628a,
	steel: 0xc3cadb,
	steelDark: 0x56628a,
	black: 0x34303f,
	blackShade: 0x4a4556,
	bandana: 0xe8423a,
	stripe: 0x3d6fd6,
	towel: 0xf3ece0,
	tomato: 0xff5a4a,
	basil: 0x3fae5a,
	carrot: 0xff9a2e,
	onion: 0xf4ecd8,
	sponge: 0xffd98a,
	cream: 0xfff6e8,
	berry: 0xe8506e,
	crust: 0xd9a066,
	meat: 0xf2a08f,
	flame: 0x3d9bff,
	copper: 0xd9824a,
	wood: 0xc99a6b,
	board: 0xe8c48e,
	ticket: 0xfffdf4,
	plate: 0xffffff,
} as const;

/** The costumes, the builder's work and the station parts the kitchen repaints; everything else
 * (faces, hands, limbs, the receiver, the card tray, the bell, most effects) is the paper rig's, on
 * purpose. The tests hold this list. */
export const KITCHEN_REPAINTS = [
	...ROLES.map((r) => `body/${r}`),
	"hat/lead", "hat/lead-cup", "hat/builder", "hat/scout", "hat/explorer", "hat/reviewer", "hat/verifier", "hat/designer",
	"front/tie", "front/apron", "front/kerchief", "front/straps", "front/bowtie", "front/badge", "front/scarf",
	"wear/glasses",
	"held/hammer", "held/wrench", "held/bolt", "held/gear", "held/brick", "held/torch", "held/map", "held/brush",
	"held/stamp", "held/stampG", "held/stampR", "held/envelope", "held/crumple", "held/slip", "held/feed1", "held/feed2", "held/feed3",
	"held/sticky", "held/stickyFlap",
	"prop/plan", "prop/plan2", "prop/roll", "prop/bigEnvelope",
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
	"fx/ding", "fx/toss",
] as const;

/** `c` moved `t` of the way toward `to`, per channel. */
const mix = (c: number, to: number, t: number) => {
	const ch = (v: number, s: number) => (v >> s) & 0xff;
	const m = (s: number) => Math.round(ch(c, s) + (ch(to, s) - ch(c, s)) * t) << s;
	return m(16) | m(8) | m(0);
};

export function kitchenTheme(p: Palette = PAPER_PALETTE): Theme {
	const base = paperTheme(p);
	const parts: Record<string, Painter> = { ...base.parts };
	const ink = p.ink;
	const A = ANCHORS;
	const T = A.bodyTop;
	const F = A.frontY;
	const S = STATION;
	const at = (q: { x: number; y: number }) => ({ x: S.x + q.x, y: S.y + q.y });

	// Bodies: chef whites. The lower body is a double-breasted jacket (two rows of knotted buttons
	// and a stand collar); the runner wears a black polo, the plater a black jacket. The face and the
	// role colour above stay as they were, so the roles still tell apart by colour too.
	const outline = mochiPath();
	const lower: number[] = [];
	for (let i = 0; i < outline.length; i += 2) if (outline[i + 1]! >= -21) lower.push(outline[i]!, outline[i + 1]!);
	for (const role of ROLES) {
		const col = p.role[role];
		const jacket = role === "designer" ? KITCHEN.black : role === "scout" ? KITCHEN.blackShade : KITCHEN.whites;
		const seam = role === "designer" || role === "scout" ? 0x6a6478 : KITCHEN.whitesShade;
		parts[`body/${role}`] = (g) => {
			g.poly(outline).fill(col);
			g.poly(lower).fill(jacket);
			// The stand collar, and the jacket's double-breasted front.
			g.poly([-bodyEdge(-21) + 1, -21, bodyEdge(-21) - 1, -21, bodyEdge(-18) - 1, -18, -bodyEdge(-18) + 1, -18]).fill(seam);
			line(g, [-bodyEdge(-21) + 1, -21, bodyEdge(-21) - 1, -21], 1.4, mix(seam, ink, 0.45));
			if (role !== "scout") {
				line(g, [6, -18, 3, -3], 1.1, mix(seam, ink, 0.3));
				for (const x of [-11, 13]) for (const y of [-14, -8]) g.circle(x + (y + 14) * 0.1, y, 1.5).fill(role === "designer" ? 0xbfc4d6 : KITCHEN.button);
			}
			g.ellipse(-19, -54, 12, 7).fill({ color: 0xffffff, alpha: 0.26 });
			g.ellipse(0, -7, 38, 6).fill({ color: p.shadow, alpha: 0.06 });
			g.poly(outline).stroke({ width: W.body, color: ink, join: "round" });
		};
	}

	/** A toque: a band round the head and a puffed, pleated crown `tall` above it, `wide` across. */
	const toque = (g: Graphics, tall: number, wide: number, fill: number = KITCHEN.whites, pleat: number = KITCHEN.whitesShade) => {
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
		for (const x of [-wide / 4, 0, wide / 4]) line(g, [x * 0.7, T - 2, x, top + 2], 1.2, pleat);
		g.roundRect(-28, T - 6, 56, 9, 3).fill(fill).stroke({ width: W.part, color: ink });
	};

	// The lead: the expediter. A tall pleated toque, the headset over it (the mic to the mouth, to
	// call the tickets), and the neckerchief (white, so the project accent tints it).
	parts["hat/lead"] = (g) => {
		toque(g, 34, 62);
		g.moveTo(-47, -38).bezierCurveTo(-48, T - 12, 48, T - 12, 47, -38).stroke({ width: 4.4, color: ink, cap: "round" });
		g.moveTo(-47, -38).bezierCurveTo(-48, T - 12, 48, T - 12, 47, -38).stroke({ width: 1.8, color: 0xcfd6e6, cap: "round" });
		g.moveTo(-50, -30).quadraticCurveTo(-42, -14, -21, -19).stroke({ width: 2.8, color: ink, cap: "round" });
		g.circle(-19, -19, 3.4).fill(0x3a3f5c).stroke({ width: 1.2, color: ink });
	};
	parts["hat/lead-cup"] = (g) => {
		g.roundRect(-56, -45, 11, 18, 5).fill(0xffffff).stroke({ width: W.part, color: ink });
	};
	parts["front/tie"] = (g) => {
		// The neckerchief: a knot at the collar and its two points.
		g.poly([-12, F - 4, 12, F - 4, 6, F + 2, -6, F + 2]).fill(0xffffff).stroke({ width: 1.6, color: ink, join: "round" });
		g.poly([-5, F + 1, -1, F + 2, -6, F + 12, -10, F + 8]).fill(0xffffff).stroke({ width: 1.5, color: ink, join: "round" });
		g.poly([5, F + 1, 1, F + 2, 6, F + 12, 10, F + 8]).fill(0xffffff).stroke({ width: 1.5, color: ink, join: "round" });
		g.circle(0, F + 0.5, 3.4).fill(0xffffff).stroke({ width: 1.5, color: ink });
	};

	// Builders: the line cook. A red bandana knotted at the back with its tails flying, and a
	// butcher's striped apron with a side towel tucked in its string.
	parts["hat/builder"] = (g) => {
		const cap = [-34, T + 10, -30, T - 4, -14, T - 12, 0, T - 13, 14, T - 12, 30, T - 4, 34, T + 10];
		g.poly([...cap, 30, T + 6, 0, T + 2, -30, T + 6]).fill(KITCHEN.bandana).stroke({ width: W.part, color: ink, join: "round" });
		for (const [x, y] of [[-20, T - 4], [-6, T - 8], [8, T - 7], [22, T - 3], [-12, T + 1], [14, T + 1]] as const) g.circle(x, y, 1.6).fill(0xffffff);
		line(g, [-32, T + 7, 0, T + 2, 32, T + 7], 1.4, 0xb92f2a);
		// The knot and its tails, out behind on the right.
		g.circle(34, T + 6, 4).fill(KITCHEN.bandana).stroke({ width: 1.6, color: ink });
		g.poly([36, T + 4, 50, T - 2, 47, T + 6]).fill(KITCHEN.bandana).stroke({ width: 1.6, color: ink, join: "round" });
		g.poly([36, T + 8, 49, T + 12, 43, T + 15]).fill(KITCHEN.bandana).stroke({ width: 1.6, color: ink, join: "round" });
	};
	parts["front/apron"] = (g) => {
		const y0 = F - 3;
		const y1 = -1;
		const bib = [-13, y0, 13, y0, bodyEdge(y1) - 6, y1, -bodyEdge(y1) + 6, y1];
		g.poly(bib).fill(0xffffff);
		// The butcher's stripes, each from where the bib's widening edge reaches it.
		const end = bodyEdge(y1) - 6;
		for (let x = -30; x <= 30; x += 6) {
			const ys = y0 + 1 + Math.max(0, (Math.abs(x) + 1.5 - 13) / (end - 13)) * (y1 - y0);
			if (ys < y1 - 2) line(g, [x, ys, x, y1 - 1], 2.2, KITCHEN.stripe);
		}
		g.poly(bib).stroke({ width: 1.8, color: ink, join: "round" });
		line(g, [-13, y0, -24, -24], 1.4, ink);
		line(g, [13, y0, 24, -24], 1.4, ink);
		// The waist string, and the towel tucked into it, hanging on the right.
		line(g, [-bodyEdge(F + 6) + 2, F + 6, bodyEdge(F + 6) - 2, F + 6], 1.6, ink);
		g.roundRect(20, F + 4, 10, 14, 2).fill(KITCHEN.towel).stroke({ width: 1.5, color: ink });
		line(g, [21, F + 13, 29, F + 13], 1.2, RED);
	};

	// Scouts: the runner. A backwards cap (the peak out behind) and a black waist apron with an
	// order pad and a pen in its pocket.
	parts["hat/scout"] = (g) => {
		g.moveTo(-24, T + 4).bezierCurveTo(-24, T - 18, 24, T - 18, 24, T + 4).closePath().fill(0x3d6fd6).stroke({ width: W.part, color: ink });
		g.poly([20, T + 1, 44, T + 6, 42, T + 10, 20, T + 6]).fill(0x2f57ad).stroke({ width: W.part, color: ink, join: "round" });
		g.circle(0, T - 12, 2.2).fill(0x2f57ad).stroke({ width: 1.2, color: ink });
		g.roundRect(-10, T - 2, 14, 5, 2).fill(0xffffff).stroke({ width: 1.2, color: ink });
	};
	parts["front/kerchief"] = (g) => {
		g.roundRect(-26, F + 2, 52, 14, 3).fill(0x1f1c28).stroke({ width: 1.8, color: ink });
		g.roundRect(-20, F + 4, 15, 10, 1.5).fill(0x2c2836).stroke({ width: 1.2, color: 0x56506a });
		g.roundRect(-18, F, 11, 9, 1).fill(KITCHEN.ticket).stroke({ width: 1.2, color: ink });
		line(g, [-16, F + 3, -10, F + 3], 0.9, RED);
		line(g, [-16, F + 5.5, -11, F + 5.5], 0.9, 0x9aa3bd);
		g.roundRect(9, F - 3, 2.6, 11, 1).fill(0x3d7dff).stroke({ width: 0.9, color: ink });
	};

	// Explorers: the forager. A bucket hat with a sprig of rosemary in its band, a basket's strap
	// across the front and a mushroom found on the way.
	parts["hat/explorer"] = (g) => {
		g.poly([-38, T + 6, -24, T - 2, 24, T - 2, 38, T + 6, 30, T + 8, -30, T + 8]).fill(0x8a9a5b).stroke({ width: W.part, color: ink, join: "round" });
		g.moveTo(-22, T).bezierCurveTo(-22, T - 22, 22, T - 22, 22, T).closePath().fill(0x9fae6c).stroke({ width: W.part, color: ink });
		g.rect(-22, T - 4, 44, 4).fill(0x6b7a45);
		line(g, [10, T - 3, 22, T - 22], 1.6, 0x5a7a3a);
		for (let k = 0; k < 5; k++) {
			const y = T - 6 - k * 3.6;
			const x = 11.5 + k * 2.1;
			line(g, [x, y, x - 4, y - 2.4], 1.4, KITCHEN.basil);
			line(g, [x, y, x + 3.4, y - 3], 1.4, KITCHEN.basil);
		}
	};
	parts["front/straps"] = (g) => {
		line(g, [-32, -20, 18, F + 14], 4.6, ink);
		line(g, [-32, -20, 18, F + 14], 2.8, 0xc99a6b);
		for (let k = 0; k < 5; k++) line(g, [-27 + k * 9.6, -18 + k * 5.4, -25 + k * 9.6, -16 + k * 5.4], 1, 0x8a5a33);
		// A mushroom in the breast pocket.
		g.roundRect(14, F - 2, 12, 9, 1.5).fill(KITCHEN.whitesShade).stroke({ width: 1.2, color: ink });
		g.rect(18.5, F - 6, 3, 5).fill(KITCHEN.onion).stroke({ width: 1, color: ink });
		g.moveTo(14.5, F - 5).quadraticCurveTo(20, F - 14, 25.5, F - 5).closePath().fill(0xc8743c).stroke({ width: 1.3, color: ink });
		g.circle(18, F - 8, 1).circle(22, F - 9, 0.9).fill(0xffffff);
	};

	// Reviewers: the sous chef, who tastes everything at the pass. A shorter toque, two tasting spoons
	// in the breast pocket, and reading glasses on a chain for the ticket.
	parts["hat/reviewer"] = (g) => toque(g, 20, 54);
	parts["front/bowtie"] = (g) => {
		g.roundRect(9, F - 1, 14, 10, 1.5).fill(KITCHEN.whitesShade).stroke({ width: 1.3, color: ink });
		for (const [x, a] of [[12, -0.12], [18, 0.1]] as const) {
			line(g, [x, F + 2, x + a * 40, F - 9], 1.8, ink);
			line(g, [x, F + 2, x + a * 40, F - 9], 0.9, KITCHEN.steel);
			g.ellipse(x + a * 44, F - 11, 2.4, 3.2).fill(KITCHEN.steel).stroke({ width: 1, color: ink });
		}
	};
	parts["wear/glasses"] = (g) => {
		const y = A.eyeY + 3;
		g.moveTo(-26, -46).quadraticCurveTo(-34, -10, 0, -12).quadraticCurveTo(34, -10, 26, -46).stroke({ width: 1, color: 0xb8962e });
		for (const x of [-A.eyeX, A.eyeX]) g.circle(x, y, 8.4).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 2, color: ink });
		line(g, [-7.6, y - 1, 7.6, y - 1], 1.8, ink);
		line(g, [-24.4, y - 1, -27, -46], 1.5, ink);
		line(g, [24.4, y - 1, 27, -46], 1.5, ink);
	};

	// Verifiers: the one with the thermometer. A bun under a hairnet, and a probe thermometer in the
	// pocket, its dial in the green.
	parts["hat/verifier"] = (g) => {
		g.moveTo(-32, T + 8).bezierCurveTo(-32, T - 16, 32, T - 16, 32, T + 8).closePath().fill({ color: 0xffffff, alpha: 0.35 }).stroke({ width: 1.6, color: ink });
		for (let x = -26; x <= 26; x += 6) line(g, [x, T + 6, x * 0.6, T - 9], 0.8, 0x9aa3bd);
		for (let y = T - 6; y <= T + 4; y += 4) line(g, [-28, y, 28, y], 0.8, 0x9aa3bd);
		g.circle(0, T - 12, 9).fill(0x3a2d28).stroke({ width: W.part, color: ink });
		g.circle(0, T - 12, 9).fill({ color: 0xffffff, alpha: 0.2 });
		for (const k of [-5, 0, 5]) line(g, [-7.6, T - 12 + k, 7.6, T - 12 + k], 0.7, 0xd5dbe6);
		g.roundRect(-33, T + 4, 66, 4, 2).fill(0xffffff).stroke({ width: 1.4, color: ink });
	};
	parts["front/badge"] = (g) => {
		g.roundRect(9, F - 1, 14, 10, 1.5).fill(KITCHEN.whitesShade).stroke({ width: 1.3, color: ink });
		line(g, [16, F + 2, 16, F + 12], 1.4, ink);
		g.circle(16, F - 4, 5).fill(0xffffff).stroke({ width: 1.5, color: ink });
		g.arc(16, F - 4, 3.4, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 1.2, color: p.go });
		line(g, [16, F - 4, 18.4, F - 6.2], 1, RED);
	};

	// Designers: the plater. A short black toque, and a squeeze bottle and plating tweezers in the
	// pocket of the black jacket.
	parts["hat/designer"] = (g) => toque(g, 14, 50, KITCHEN.black, 0x5a5468);
	parts["front/scarf"] = (g) => {
		g.roundRect(8, F - 1, 16, 10, 1.5).fill(KITCHEN.blackShade).stroke({ width: 1.3, color: 0x6a6478 });
		g.roundRect(10, F - 9, 6, 12, 2).fill(KITCHEN.tomato).stroke({ width: 1.2, color: ink });
		g.poly([11.6, F - 9, 14.4, F - 9, 13, F - 13]).fill(0xffffff).stroke({ width: 0.9, color: ink, join: "round" });
		line(g, [19, F + 3, 20.6, F - 11], 1.6, ink);
		line(g, [21.2, F + 3, 21.2, F - 11], 1.6, ink);
		line(g, [19, F + 3, 20.6, F - 11], 0.7, KITCHEN.steel);
		g.circle(-12, -12, 2).circle(-14, -6, 1.4).fill({ color: KITCHEN.tomato, alpha: 0.8 });
	};

	// Held tools -----------------------------------------------------------------------------------

	// The meat mallet, swung like the hammer: a wooden handle, a steel head with teeth on the
	// striking side.
	parts["held/hammer"] = (g) => {
		line(g, [0, 6, 0, -20], 5, ink);
		line(g, [0, 6, 0, -20], 3, KITCHEN.wood);
		g.roundRect(-10, -28, 20, 9, 1.6).fill(KITCHEN.steel).stroke({ width: 2.2, color: ink });
		for (let x = -8.5; x < 8; x += 3.4) g.poly([x, -28, x + 1.7, -29.6, x + 3.4, -28]).fill(KITCHEN.steel).stroke({ width: 0.8, color: ink, join: "round" });
		line(g, [-7, -25.2, 7, -25.2], 1, 0xffffff);
	};
	// The pasta machine's crank: a wooden knob in the palm, the arm, and its hub on the machine.
	parts["held/wrench"] = (g) => {
		g.roundRect(-2.4, -24, 4.8, 22, 2).fill(KITCHEN.steel).stroke({ width: 1.8, color: ink });
		g.circle(0, -24, 9.4).fill(0x8a94ad).stroke({ width: 1.8, color: ink });
		g.circle(0, -24, 4.6).fill(0xdfe4ef).stroke({ width: 1.4, color: ink });
		g.circle(0, -24, 1.6).fill(ink);
		g.roundRect(-4.2, -4, 8.4, 9, 4).fill(KITCHEN.wood).stroke({ width: 1.8, color: ink });
	};
	// A bulb of garlic, held up to squint at (the wrong one).
	parts["held/bolt"] = (g) => {
		g.moveTo(-6, -6).bezierCurveTo(-8, -14, -2, -14, 0, -16).bezierCurveTo(2, -14, 8, -14, 6, -6).quadraticCurveTo(0, -1, -6, -6).closePath().fill(KITCHEN.onion).stroke({ width: 1.6, color: ink, join: "round" });
		line(g, [0, -15, 0, -6], 0.9, 0xc9bfa6);
		line(g, [-3, -13, -3.4, -5], 0.8, 0xc9bfa6);
		line(g, [3, -13, 3.4, -5], 0.8, 0xc9bfa6);
	};
	// A tomato (the right one, at last).
	parts["held/gear"] = (g) => {
		g.circle(0, -11, 8.6).fill(KITCHEN.tomato).stroke({ width: 1.8, color: ink });
		g.star(0, -19, 5, 4.4, 1.8, 0).fill(KITCHEN.basil).stroke({ width: 1, color: ink, join: "round" });
		g.ellipse(-3.6, -13, 2.2, 1.4).fill({ color: 0xffffff, alpha: 0.6 });
	};
	/** A sponge layer with its cream filling, centred at (x, y). */
	const sponge = (g: Graphics, x: number, y: number, w: number, h: number, k = 0) => {
		g.roundRect(x - w / 2, y - h / 2, w, h, 2.4).fill(k % 2 ? 0xffcf7a : KITCHEN.sponge).stroke({ width: 2, color: ink });
		g.rect(x - w / 2 + 1, y - h / 2 + h * 0.4, w - 2, h * 0.22).fill(KITCHEN.cream);
		for (let i = 0; i < 4; i++) g.circle(x - w / 2 + 4 + i * ((w - 8) / 3), y - h / 2 + h * 0.5, 1.1).fill(KITCHEN.berry);
		for (const [dx, dy] of [[-6, -4], [3, 5], [7, -3]] as const) g.circle(x + dx, y + dy, 0.8).fill(0xd9a043);
	};
	parts["held/brick"] = (g) => sponge(g, 0, -10, WORK.brickW, WORK.brickH);
	// The blowtorch, for the crème brûlée: a canister in the hand, the nozzle up, a blue flame.
	parts["held/torch"] = (g) => {
		g.poly([-3, -18, 3, -18, 15, -44, -15, -44]).fill({ color: KITCHEN.flame, alpha: 0.18 });
		g.moveTo(-1.5, -24).quadraticCurveTo(-6, -34, 0, -42).quadraticCurveTo(6, -34, 1.5, -24).closePath().fill({ color: KITCHEN.flame, alpha: 0.85 }).stroke({ width: 1.1, color: ink });
		g.moveTo(-0.6, -25).quadraticCurveTo(-2.4, -31, 0, -35).quadraticCurveTo(2.4, -31, 0.6, -25).closePath().fill(0xdff4ff);
		g.roundRect(-1.4, -24, 2.8, 5, 0.8).fill(0x8a94ad).stroke({ width: 1, color: ink });
		g.roundRect(-3.5, -19, 7, 22, 2.4).fill(KITCHEN.tomato).stroke({ width: 2, color: ink });
		g.roundRect(-5, -21, 10, 5, 1.5).fill(ink);
		g.rect(-3.5, -9, 7, 3).fill(0xffffff);
	};
	// The table plan on a clipboard: the dining room's tables, a red X at the one it's for.
	parts["held/map"] = (g) => {
		g.roundRect(-16, -26, 30, 21, 2).fill(KITCHEN.wood).stroke({ width: 2, color: ink, join: "round" });
		g.rect(-13.5, -23.5, 25, 16).fill(0xffffff);
		for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) g.circle(-10 + c * 6, -19.5 + r * 7, 2).fill(0xbcd6ff);
		line(g, [6, -14.5, 9, -11.5], 1.4, RED);
		line(g, [9, -14.5, 6, -11.5], 1.4, RED);
		g.roundRect(-5, -28.5, 8, 4.5, 1.4).fill(p.steel).stroke({ width: 1.3, color: ink });
	};
	// The pastry brush: a wooden handle, a steel ferrule, golden bristles wet with egg wash.
	parts["held/brush"] = (g) => {
		line(g, [0, 5, 0, -18], 4.4, ink);
		line(g, [0, 5, 0, -18], 2.6, KITCHEN.wood);
		g.rect(-2.6, -22, 5.2, 5).fill(KITCHEN.steel).stroke({ width: 1, color: ink });
		g.moveTo(-3.2, -22).lineTo(-3.6, -30).quadraticCurveTo(0, -33, 3.6, -30).lineTo(3.2, -22).closePath().fill(0xf2c94c).stroke({ width: 1.4, color: ink });
	};

	// Tonight's menu (where the blueprint was): a card with the dishes in lines and a title. Turned,
	// it hangs upside down.
	const menu = (g: Graphics, flip: boolean) => {
		g.roundRect(-29, -14, 58, 25, 1).fill(KITCHEN.cream).stroke({ width: W.part, color: ink });
		const k = flip ? -1 : 1;
		const cy = -1;
		const Y = (v: number) => cy + v * k;
		g.rect(-14, Y(-7) - 1.6, 28, 3.2).fill(KITCHEN.bandana);
		for (const [v, w] of [[-1.5, 36], [3, 28], [7.5, 32]] as const) {
			line(g, [-w / 2, Y(v), w / 2 - 6, Y(v)], 1.1, ink);
			line(g, [w / 2 - 3, Y(v), w / 2, Y(v)], 1.1, KITCHEN.basil);
		}
		g.roundRect(-30, -17, 60, 6, 2).fill(KITCHEN.wood).stroke({ width: 2, color: ink });
	};
	parts["prop/plan"] = (g) => menu(g, false);
	parts["prop/plan2"] = (g) => menu(g, true);
	parts["prop/roll"] = (g) => {
		g.roundRect(-31, -18, 62, 12, 6).fill(KITCHEN.cream).stroke({ width: W.part, color: ink });
		g.rect(-12, -14, 24, 3).fill(KITCHEN.bandana);
		g.ellipse(-31, -12, 3, 6).fill(KITCHEN.wood).stroke({ width: 1.6, color: ink });
		g.ellipse(31, -12, 3, 6).fill(KITCHEN.wood).stroke({ width: 1.6, color: ink });
	};

	/** A plate side on, `w` across, centred at (x, y), with something on it (`food`). */
	const plate = (g: Graphics, x: number, y: number, w: number, a = 0, food = true) => {
		if (food) {
			g.poly(rotRect(x, y - 3, w * 0.5, 5, a)).fill(KITCHEN.meat).stroke({ width: 1.1, color: ink, join: "round" });
			g.circle(x + w * 0.16 * Math.cos(a), y - 5 + w * 0.16 * Math.sin(a), 1.8).fill(KITCHEN.basil).stroke({ width: 0.8, color: ink });
		}
		g.poly(rotRect(x, y, w, 2.6, a)).fill(KITCHEN.plate).stroke({ width: W.fine, color: ink, join: "round" });
	};
	// A plated dish carried to the pass (where the outbox's envelope was).
	parts["held/envelope"] = (g) => {
		g.ellipse(0, -8, 11, 3).fill(KITCHEN.plate).stroke({ width: 1.6, color: ink });
		g.roundRect(-5, -14, 10, 5, 2).fill(KITCHEN.meat).stroke({ width: 1.2, color: ink });
		g.circle(4, -14, 2).fill(KITCHEN.basil).stroke({ width: 0.9, color: ink });
		g.ellipse(0, -8, 6, 1.4).stroke({ width: 0.8, color: 0xd5dbe6 });
	};
	// The PR: a plate under a silver cloche, held up in front, a ticket tucked under its rim.
	parts["prop/bigEnvelope"] = (g) => {
		g.ellipse(0, -4, 23, 3.4).fill(KITCHEN.plate).stroke({ width: W.part, color: ink });
		g.moveTo(-19, -5).bezierCurveTo(-19, -28, 19, -28, 19, -5).closePath().fill(0xdfe4ef).stroke({ width: W.part, color: ink });
		g.moveTo(-12, -9).quadraticCurveTo(-11, -20, -3, -22).stroke({ width: 2, color: 0xffffff, cap: "round" });
		g.circle(0, -23.5, 2.6).fill(KITCHEN.steel).stroke({ width: 1.4, color: ink });
		g.poly(rotRect(15, -3, 9, 6, 0.2)).fill(KITCHEN.ticket).stroke({ width: 1, color: ink, join: "round" });
		line(g, [12.4, -3.6, 17.6, -2.4], 0.8, RED);
	};

	// The work out front (reach.ts WORK) ---------------------------------------------------------

	// The butcher block, where the sawhorse was: an end-grain block on steel legs.
	const block = (g: Graphics) => {
		const { benchL: l, benchR: r, benchTop: t } = WORK;
		for (const [a, b] of [[l + 7, l + 3], [r - 7, r - 3]] as const) {
			line(g, [a, t + 4, b, 0], 4, ink);
			line(g, [a, t + 4, b, 0], 1.8, KITCHEN.steel);
		}
		line(g, [l + 5, t + 14, r - 5, t + 14], 3, ink);
		line(g, [l + 5, t + 14, r - 5, t + 14], 1.2, KITCHEN.steel);
		g.roundRect(l, t, r - l, 7, 1.5).fill(KITCHEN.board).stroke({ width: W.part, color: ink });
		for (let x = l + 6; x < r - 2; x += 6) line(g, [x, t + 1.6, x, t + 5.4], 0.8, 0xc99a6b);
	};
	/** The cutlet on the block, its top at `top`: pounded flatter and wider each strike. */
	const cutlet = (g: Graphics, top: number, strikes: number) => {
		const x = WORK.nailX;
		const t = WORK.benchTop;
		const h = t - top;
		const w = 20 + strikes * 3;
		g.moveTo(x - w / 2, t).quadraticCurveTo(x - w / 2 - 1, top, x - 2, top).quadraticCurveTo(x + w / 2 + 2, top - 0.5, x + w / 2, t).closePath().fill(KITCHEN.meat).stroke({ width: 1.4, color: ink, join: "round" });
		if (h > 4) line(g, [x - w / 4, t - h * 0.45, x + w / 5, t - h * 0.6], 1, 0xffd2c6);
		for (let k = 0; k < strikes; k++) g.circle(x - 6 + k * 6, top + Math.min(2, h / 2), 0.8).fill(0xc96a5a);
	};
	parts["work/nail1"] = (g) => (block(g), cutlet(g, WORK.nailTop[0], 0));
	parts["work/nail2"] = (g) => (block(g), cutlet(g, WORK.nailTop[1], 1));
	parts["work/nail3"] = (g) => (block(g), cutlet(g, WORK.nailTop[2], 2));
	parts["work/bent"] = (g) => {
		// Overdone: the cutlet torn through the middle, and the mallet knocked to the floor.
		block(g);
		const x = WORK.nailX;
		const t = WORK.benchTop;
		const top = WORK.nailTop[2];
		for (const s of [-1, 1] as const) {
			g.moveTo(x + s * 2, t).lineTo(x + s * 13, t).quadraticCurveTo(x + s * 13, top, x + s * 4, top - 1).lineTo(x + s * 1, t - 1).closePath().fill(KITCHEN.meat).stroke({ width: 1.3, color: ink, join: "round" });
		}
		// A scrap flipped up off the tear.
		g.poly([x - 1, top, x + 3, top - 9, x + 6, top - 8, x + 3, top]).fill(KITCHEN.meat).stroke({ width: 1.2, color: ink, join: "round" });
		const mx = WORK.benchR + 3;
		line(g, [mx, -2, mx + 22, -2.6], 4.4, ink);
		line(g, [mx, -2, mx + 22, -2.6], 2.6, KITCHEN.wood);
		g.roundRect(mx + 20, -8, 8, 9, 1.4).fill(KITCHEN.steel).stroke({ width: 1.6, color: ink });
	};

	// The pasta machine, where the machine was: the crank's hub on the nut, a third of a turn a step;
	// a sheet of pasta feeding in at the top and coming out the bottom.
	const pastaMachine = (g: Graphics, step: number) => {
		const { x, y } = WORK.nut;
		// The clamp down to the table edge.
		line(g, [x + 4, y + 18, x + 4, y + 36], 5, ink);
		line(g, [x + 4, y + 18, x + 4, y + 36], 2.6, KITCHEN.steel);
		g.roundRect(x - 12, y + 34, 32, 4, 2).fill(KITCHEN.board).stroke({ width: 1.6, color: ink });
		// The sheet going in at the top, and out under the rollers.
		g.poly([x + 9, y - 12, x + 15, y - 19, x + 20, y - 15, x + 15, y - 10]).fill(0xf7e2a1).stroke({ width: 1.2, color: ink, join: "round" });
		g.roundRect(x - 12, y - 17, 32, 30, 5).fill(0xdfe4ef).stroke({ width: W.part, color: ink });
		g.roundRect(x - 8, y - 14, 24, 5, 2.5).fill({ color: 0xffffff, alpha: 0.5 });
		g.roundRect(x - 2, y + 11, 18, 9, 1.5).fill(0xf7e2a1).stroke({ width: 1.2, color: ink });
		for (let k = 0; k < 3; k++) line(g, [x + k * 5, y + 13, x + k * 5, y + 19], 0.7, 0xd9b45a);
		g.rect(x + 7, y - 6, 10, 2).fill(ink);
		// The hub, marked so the turn shows.
		g.circle(x, y, 8.5).fill(0x8a94ad).stroke({ width: 1.6, color: ink });
		const a = (step * Math.PI) / 9;
		for (let k = 0; k < 3; k++) {
			const b = a + (k * Math.PI * 2) / 3;
			line(g, [x + Math.cos(b) * 2.6, y + Math.sin(b) * 2.6, x + Math.cos(b) * 7, y + Math.sin(b) * 7], 1.4, 0xdfe4ef);
		}
		g.circle(x, y, 2.2).fill(KITCHEN.steelDark).stroke({ width: 1.2, color: ink });
	};
	parts["work/nut1"] = (g) => pastaMachine(g, 0);
	parts["work/nut2"] = (g) => pastaMachine(g, 1);
	parts["work/nut3"] = (g) => pastaMachine(g, 2);

	// A produce crate, where the parts crate was: leeks and carrots sticking out of a slatted box.
	parts["work/crate"] = (g) => {
		line(g, [64, -19, 60, -32], 4.4, ink);
		line(g, [64, -19, 60, -32], 2.8, KITCHEN.basil);
		line(g, [70, -19, 72, -31], 5, ink);
		line(g, [70, -19, 72, -31], 3.2, 0xeef5e0);
		for (const x of [80, 86]) {
			g.poly([x - 2.4, -19, x + 2.4, -19, x + 0.8, -30]).fill(KITCHEN.carrot).stroke({ width: 1.2, color: ink, join: "round" });
			line(g, [x + 0.8, -30, x + 2, -32], 1.4, KITCHEN.basil);
		}
		g.circle(76, -21, 4.4).fill(KITCHEN.tomato).stroke({ width: 1.3, color: ink });
		g.roundRect(54, -21, 40, 21, 1.5).fill(KITCHEN.crust).stroke({ width: W.part, color: ink });
		for (const y of [-14, -7]) line(g, [55, y, 93, y], 1.2, 0xa8713e);
		g.rect(66, -18, 16, 6).fill(0xffffff).stroke({ width: 0.9, color: ink });
	};

	// The layer cake on the block, where the bricks were stacked, rocking `tilt` on a corner.
	const layers = (g: Graphics, tilt: number) => {
		const t = WORK.benchTop;
		const px = tilt < 0 ? 75 : 93;
		g.save();
		g.translateTransform(-px, -t).rotateTransform(tilt * 0.12).translateTransform(px, t);
		const layer = (cx: number, cy: number, k: number) => {
			g.roundRect(cx - 9, cy - 5.5, 18, 11, 2).fill(k % 2 ? 0xffcf7a : KITCHEN.sponge).stroke({ width: 2, color: ink });
			g.rect(cx - 8, cy - 1, 16, 2.4).fill(KITCHEN.cream);
		};
		layer(84, t - 5.5, 0);
		layer(85, t - 16.5, 1);
		layer(83, t - 27.5, 0);
		// Cream on top, and a strawberry.
		g.moveTo(74.5, t - 32).quadraticCurveTo(83, t - 36, 91.5, t - 32).stroke({ width: 2.6, color: KITCHEN.cream, cap: "round" });
		g.circle(83, t - 34, 2.2).fill(KITCHEN.berry).stroke({ width: 1, color: ink });
		g.restore();
	};
	parts["work/stack"] = (g) => (block(g), layers(g, 0));
	parts["work/stackL"] = (g) => (block(g), layers(g, -1));
	parts["work/stackR"] = (g) => (block(g), layers(g, 1));
	parts["work/brick"] = (g) => sponge(g, WORK.brick.x, WORK.brick.y, WORK.brickW, WORK.brickH, 1);

	// The station parts, at reach.ts's working points --------------------------------------------

	// The filing drawer: a lowboy fridge's drawer. Shut, its bar handle is on the working point;
	// pulled out, it comes toward the viewer with its deli tubs standing in it (their lids are where
	// the folder tabs were, walked by the fingertips), one gone in `gap`.
	const lowboy = (g: Graphics, state: "shut" | "out" | "gap") => {
		const rail = (y: number) => g.rect(S.x - 8, y, 36, 2).fill(KITCHEN.steelDark).stroke({ width: 1, color: ink });
		if (state === "shut") {
			rail(S.y - 8);
			g.roundRect(S.x - 5, S.y - 6, 30, 13, 2).fill(KITCHEN.steel).stroke({ width: W.fine + 0.4, color: ink });
			g.rect(S.x + 15, S.y + 2, 7, 3).fill(0x9be3ff).stroke({ width: 0.9, color: ink });
			g.roundRect(S.x - 1, S.y - 1.3, 20, 2.6, 1.3).fill(0xffffff).stroke({ width: 1.4, color: ink });
			rail(S.y + 7);
			return;
		}
		rail(S.y - 8);
		g.rect(S.x - 6, S.y - 6, 32, 5).fill(KITCHEN.steelDark).stroke({ width: 1.2, color: ink });
		const fills = [KITCHEN.carrot, KITCHEN.basil, KITCHEN.onion, KITCHEN.tomato, KITCHEN.basil, 0xf2c94c];
		fills.forEach((c, i) => {
			const x = S.x - 3 + i * 5;
			if (state === "gap" && i === 3) return;
			g.roundRect(x, S.y - 11, 4.4, 7, 0.8).fill(c).stroke({ width: 1, color: ink });
			g.rect(x - 0.3, S.y - 11.4, 5, 1.6).fill(0xffffff).stroke({ width: 0.6, color: ink });
		});
		const o = AT.drawerOut;
		g.poly([S.x - 7, S.y - 2, S.x + 27, S.y - 2, S.x + 27, S.y + 12, S.x - 7, S.y + 12]).fill(KITCHEN.steel).stroke({ width: W.fine + 0.4, color: ink, join: "round" });
		g.roundRect(S.x + o.x - 1, S.y + o.y + 2.2, 20, 2.6, 1.3).fill(0xffffff).stroke({ width: 1.4, color: ink });
	};
	parts["work/cabinet"] = (g) => lowboy(g, "shut");
	parts["work/drawer"] = (g) => lowboy(g, "out");
	parts["work/drawerGap"] = (g) => lowboy(g, "gap");

	// The copier: a sandwich press on an oven. Its lid is the press's ridged top plate (on the same
	// hinge), the glass its bottom plate, the start button a dial and the status light the
	// thermostat's; the jam door the oven's door with its window, and the jam a burnt toastie in it.
	// The out-tray is a board where the toasties land.
	const toastie = (g: Graphics, x: number, y: number, burnt = false) => {
		g.poly([x, y, x + 9, y - 1.4, x + 9.4, y + 1.6, x + 0.4, y + 3]).fill(burnt ? 0x4a3a30 : 0xe8b25c).stroke({ width: 1, color: ink, join: "round" });
		if (!burnt) for (const k of [2.5, 5.5]) line(g, [x + k, y - 0.2, x + k + 0.6, y + 2.4], 0.7, 0x9a6634);
	};
	const press = (
		g: Graphics,
		o: { lid?: number; sheet?: boolean; light?: "go" | "red"; glow?: boolean; copies?: 1 | 2; door?: boolean; jam?: "corner" | "inside" | "tugged"; bang?: boolean; pressed?: boolean },
	) => {
		const lidLen = 30;
		// The board on the far side, and the toasties on it.
		g.poly([S.x + 36, S.y + 8, S.x + 52, S.y + 5, S.x + 52.5, S.y + 7.5, S.x + 36, S.y + 11]).fill(KITCHEN.board).stroke({ width: 1.6, color: ink, join: "round" });
		if (o.copies === 1) toastie(g, S.x + 37, S.y + 4.6);
		if (o.copies === 2) for (let k = 0; k < 3; k++) toastie(g, S.x + 38 + k * 4.2, S.y + 5.6 - k * 1.6);
		// The control plate: the dial and the thermostat light.
		const b = at(AT.button);
		g.roundRect(b.x - 4, b.y - 3, 15, 6, 1.5).fill(KITCHEN.steelDark).stroke({ width: 1.2, color: ink });
		g.circle(b.x, b.y, 3).fill(0xffffff).stroke({ width: 0.9, color: ink });
		line(g, [b.x, b.y, b.x + (o.pressed ? 1.6 : 0), b.y - (o.pressed ? 1.6 : 2.4)], 1.1, ink);
		const bx = b.x + 7;
		const lit = o.light === "red" ? RED : o.light === "go" ? p.go : 0x7a6a4a;
		g.circle(bx, b.y, o.pressed ? 2.4 : 2).fill(lit).stroke({ width: 0.9, color: ink });
		if (o.light === "red") for (const a of o.pressed ? [-2.6, -1.57, -0.5] : [-2.2, -0.9]) line(g, [bx + Math.cos(a) * 3.4, b.y + Math.sin(a) * 3.4, bx + Math.cos(a) * 5.6, b.y + Math.sin(a) * 5.6], 1, RED);
		// The oven door, shut, or dropped open on its bottom hinge.
		const d = at(AT.door);
		const dl = d.x - 5;
		const dt = S.y + 12;
		if (o.door) {
			g.rect(dl, dt, 24, 11).fill(0x2a2430).stroke({ width: 1.4, color: ink });
			for (const x of [dl + 5, dl + 12, dl + 19]) line(g, [x - 2, dt + 8, x + 2, dt + 8], 1, RED);
			const flap = [dl, dt + 11, dl + 24, dt + 11, dl + 27, dt + 17, dl - 3, dt + 17];
			g.poly(flap).fill(KITCHEN.steel).stroke({ width: 1.6, color: ink, join: "round" });
			line(g, [dl + 4, dt + 15.5, dl + 20, dt + 15.5], 1.4, ink);
		} else {
			g.roundRect(dl, dt, 24, 11, 1.5).fill({ color: KITCHEN.steel, alpha: 0.6 }).stroke({ width: 1.2, color: ink, alpha: 0.7 });
			g.roundRect(dl + 4, dt + 3, 16, 6, 1).fill({ color: 0x2a2430, alpha: 0.7 });
			g.rect(d.x - 1.5, d.y - 1, 3, 2).fill(ink);
		}
		// The jammed toastie: a burnt corner poking out of the door, inside, or tugged out.
		const j = at(AT.jam);
		if (o.jam === "corner") {
			g.poly([j.x - 3, dt + 0.5, j.x - 1, dt - 4, j.x + 2, dt - 2.5, j.x + 4, dt - 5, j.x + 5, dt + 0.5]).fill(0x4a3a30).stroke({ width: 1.2, color: ink, join: "round" });
			for (const k of [0, 1]) g.circle(j.x + k * 3, dt - 8 - k * 3, 1.6 + k * 0.6).fill({ color: 0x9aa3bd, alpha: 0.6 });
		}
		if (o.jam === "inside") g.poly([j.x - 4, j.y - 3, j.x, j.y - 5, j.x + 4, j.y - 2, j.x + 3, j.y + 3, j.x - 2, j.y + 4, j.x - 5, j.y + 1]).fill(0x4a3a30).stroke({ width: 1.2, color: ink, join: "round" });
		if (o.jam === "tugged") {
			const e = at(AT.jamOut);
			const top: number[] = [];
			const bot: number[] = [];
			for (let i = 0; i <= 6; i++) {
				const x = j.x + 3 + ((e.x - j.x - 3) * i) / 6;
				top.push(x, j.y - 3 + (i % 2 ? -1.2 : 0.4));
				bot.unshift(x, j.y + 3 + (i % 2 ? 1 : -0.4));
			}
			g.poly([...top, ...bot]).fill(0x4a3a30).stroke({ width: 1.2, color: ink, join: "round" });
		}
		// The bottom plate under a raised lid, and the sandwich laid on it.
		if (o.lid) {
			g.rect(S.x, S.y - 1.5, lidLen - 2, 1.5).fill(KITCHEN.steelDark).stroke({ width: 1, color: ink });
			if (o.sheet) toastie(g, S.x + 8, S.y - 4.4);
		}
		// The lid, about its hinge at the far end, its ridges underneath.
		const hx = S.x + lidLen;
		const hy = S.y - 2;
		g.save();
		g.translateTransform(-hx, -hy).rotateTransform(((o.lid ?? 0) * Math.PI) / 180).translateTransform(hx, hy);
		g.roundRect(S.x - 1, S.y - 4, lidLen + 1, 4, 1.5).fill(0x3a3f5c).stroke({ width: W.fine + 0.2, color: ink });
		for (let x = S.x + 3; x < S.x + lidLen - 2; x += 4) line(g, [x, S.y - 3.2, x + 1.4, S.y - 0.8], 0.8, 0x8a94ad);
		g.roundRect(S.x - 4, S.y - 3.5, 5, 3, 1.4).fill(ink);
		g.restore();
		if (o.glow) {
			// Pressed down: the plates glow and the steam comes off.
			g.rect(S.x, S.y - 0.6, lidLen - 2, 1.4).fill(0xff9a2e);
			for (const x of [S.x + 6, S.x + 16, S.x + 24]) g.moveTo(x, S.y - 3).quadraticCurveTo(x - 3, S.y - 6, x, S.y - 9).stroke({ width: 1.2, color: 0x9aa3bd, cap: "round" });
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

	// The stamp desk: tasting. The stamp is a tasting spoon (its grip the verdict's colour); it dips
	// into the sauce pan (the ink pad's place), then goes to the top bowl, which gets a pick in it,
	// a green tick or a red cross, and is pushed along onto the tasted ones.
	const spoon = (g: Graphics, grip: number) => {
		g.rect(-1.4, -10, 2.8, 13).fill(KITCHEN.steel).stroke({ width: 1.1, color: ink });
		g.roundRect(-2.4, -10.4, 4.8, 6, 2).fill(grip).stroke({ width: 1.1, color: ink });
		g.ellipse(0, 5.6, 6.4, 3).fill(0xdfe4ef).stroke({ width: W.fine, color: ink });
		g.ellipse(0, 6.2, 4.2, 1.6).fill(0xd9824a);
	};
	parts["held/stamp"] = (g) => spoon(g, 0x7a7f92);
	parts["held/stampG"] = (g) => spoon(g, p.go);
	parts["held/stampR"] = (g) => spoon(g, RED);
	const pick = (g: Graphics, x: number, y: number, kind: "ok" | "no") => {
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
		const bowl = (x: number, y: number, mk?: "ok" | "no") => {
			g.moveTo(x - 8, y - 4.6).lineTo(x + 9, y - 4.6).quadraticCurveTo(x + 8, y + 1.4, x + 0.5, y + 1.4).quadraticCurveTo(x - 7, y + 1.4, x - 8, y - 4.6).closePath().fill(KITCHEN.plate).stroke({ width: 1.2, color: ink, join: "round" });
			g.ellipse(x + 0.5, y - 4.6, 7.6, 1.4).fill(0xd9824a).stroke({ width: 0.8, color: ink });
			if (mk) pick(g, x + 2, y - 4.6, mk);
		};
		const pile = at({ x: AT.form.x + 18, y: 0 });
		for (let k = 0; k < 2; k++) bowl(pile.x + (k % 2) * 0.8, pile.y - k * 2.2);
		pick(g, pile.x + 3, pile.y - 5, "ok");
		const f = at(AT.form);
		tasting0(g, f, slid ? undefined : m, bowl);
		if (slid) bowl(f.x + 9, f.y - 1.2, m);
		// The sauce pan: a little steel pan with a long handle toward the character and the verdict
		// on a clip on its rim.
		const i = at(AT.ink);
		g.roundRect(i.x - 6, i.y - 2, 12, 5.5, 1.6).fill(KITCHEN.steel).stroke({ width: 1.6, color: ink });
		g.roundRect(i.x - 5, i.y - 3, 10, 1.8, 0.8).fill(0xd9824a).stroke({ width: 1, color: ink });
		line(g, [i.x - 6, i.y, i.x - 11, i.y + 1.6], 1.8, ink);
		g.rect(i.x + 2, i.y + 0.1, 3, 1.6).fill(verdict);
	};
	const tasting0 = (_g: Graphics, f: { x: number; y: number }, m: "ok" | "no" | undefined, bowl: (x: number, y: number, mk?: "ok" | "no") => void) => {
		bowl(f.x + 0.8, f.y + 2.2);
		bowl(f.x, f.y, m);
	};
	parts["work/forms"] = (g) => tasting(g, p.go);
	parts["work/formsOk"] = (g) => tasting(g, p.go, "ok");
	parts["work/formsSlid"] = (g) => tasting(g, p.go, "ok", true);
	parts["work/formsR"] = (g) => tasting(g, RED);
	parts["work/formsNo"] = (g) => tasting(g, RED, "no");

	// The phone table's notepad: the takeout line's order pad, a carbon duplicate book, with the
	// handset's coiled cord running to the phone.
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
		page(1.4, 0x3a5a9a);
		page(0, 0xe9f3ff);
		line(g, [S.x - 5, S.y - 3, S.x + 15.6, S.y - 3], 1.2, KITCHEN.bandana);
		const bits = [[S.x - 4, S.x + 1], [S.x + 2, S.x + 7], [S.x + 8, S.x + 12]] as const;
		for (let k = 0; k < Math.min(n, 3); k++) {
			const [a, b] = bits[k]!;
			const y = S.y - 1.2 + (k === 1 ? 0.6 : 0);
			const pts: number[] = [];
			for (let x = a; x <= b; x += 1.25) pts.push(x, y + (Math.round((x - a) / 1.25) % 2 ? -0.7 : 0.5));
			line(g, pts, 0.9, ink);
		}
		if (n >= 3) {
			g.circle(S.x + 13, S.y - 0.6, 2.4).stroke({ width: 0.9, color: RED });
		}
		if (flip) {
			g.moveTo(S.x - 5.5, S.y - 4).quadraticCurveTo(S.x - 3, S.y - 13, S.x + 4, S.y - 14).lineTo(S.x + 22, S.y - 12).quadraticCurveTo(S.x + 16, S.y - 10, S.x + 16.5, S.y - 4).closePath()
				.fill(0xe9f3ff).stroke({ width: 1.3, color: ink, join: "round" });
			line(g, [S.x + 3, S.y - 11.5, S.x + 15, S.y - 10.5], 0.9, ink);
		}
	};
	parts["work/note0"] = (g) => orderPad(g, 0);
	parts["work/note1"] = (g) => orderPad(g, 1);
	parts["work/note2"] = (g) => orderPad(g, 2);
	parts["work/note3"] = (g) => orderPad(g, 3);
	parts["work/noteFlip"] = (g) => orderPad(g, 0, true);

	// The outbox: the pass. A steel shelf under a heat lamp's glow; the plate is set down on it and
	// waits there to go out.
	const pass = (g: Graphics, env: 0 | 1 | 2) => {
		const t = at(AT.tray);
		g.rect(t.x - 13, S.y - 7, 34, 6).fill({ color: 0xffb347, alpha: 0.2 });
		g.rect(t.x - 13, S.y + 5, 34, 2).fill(KITCHEN.steelDark).stroke({ width: 1, color: ink });
		for (const x of [t.x - 11, t.x + 17]) g.rect(x, S.y + 1.5, 2.4, 4).fill(KITCHEN.steelDark);
		if (env === 2) plate(g, t.x + 4, S.y - 2.6, 20);
		g.roundRect(t.x - 13, S.y - 1, 34, 2.6, 1).fill(KITCHEN.steel).stroke({ width: W.fine, color: ink });
		if (env === 1) {
			plate(g, t.x + 4, S.y - 9, 20, -0.18);
			for (const x of [t.x - 2, t.x + 10]) line(g, [x, S.y - 21, x, S.y - 17], 1.2, ink);
		}
	};
	parts["work/outbox"] = (g) => pass(g, 0);
	parts["work/mail1"] = (g) => pass(g, 1);
	parts["work/mail2"] = (g) => pass(g, 2);

	// The shredder: the scraps bin. The slot is its swing lid's opening, the pile beside it a stack
	// of peelings on a board; `crunch` while it's swallowing one.
	const scrapsBin = (g: Graphics, n: number, crunch: boolean) => {
		const pl = at(AT.pile);
		g.rect(pl.x - 8, S.y - 0.4, 16, 1.6).fill(KITCHEN.board).stroke({ width: 0.7, color: ink });
		for (let k = 0; k < n; k++) g.poly(rotRect(pl.x + (k % 2 ? 0.8 : -0.6), S.y - 1.2 * (k + 1), 13, 1.2, (k % 2 ? 0.05 : -0.05))).fill(k % 2 ? KITCHEN.carrot : 0xd9c06a).stroke({ width: 0.6, color: ink });
		const s = at(AT.slot);
		g.roundRect(s.x - 13, s.y - 2, 26, 4, 1.6).fill(0x3f8f5f).stroke({ width: 1, color: ink });
		g.roundRect(s.x - 9, s.y - 1.4, 18, 2.8, 1.2).fill(ink);
		line(g, [s.x - 8, s.y, s.x + 8, s.y], 0.8, 0x2a6b45);
		line(g, [s.x - 10, s.y + 2.4, s.x + 10, s.y + 2.4], 1, 0x2a6b45);
		if (crunch) {
			for (const side of [-1, 1]) {
				const x = s.x + side * 15;
				line(g, [x, s.y - 3, x + side * 1.5, s.y - 1.5, x, s.y, x + side * 1.5, s.y + 1.5], 1.1, ink);
				g.circle(s.x + side * 4, s.y - 4, 1.4).fill(KITCHEN.carrot).stroke({ width: 0.7, color: ink });
			}
		}
	};
	parts["work/shred"] = (g) => scrapsBin(g, 5, false);
	parts["work/shred4"] = (g) => scrapsBin(g, 4, false);
	parts["work/shredBuzz"] = (g) => scrapsBin(g, 4, true);

	/** A carrot peeling held by its top going into the bin: `len` of it still shows. */
	const peel = (g: Graphics, len: number) => {
		g.moveTo(-6, 1).lineTo(6, 1).lineTo(4.4, 1 + len).quadraticCurveTo(0, 2 + len, -4.4, 1 + len).closePath().fill(KITCHEN.carrot).stroke({ width: 1.3, color: ink, join: "round" });
		if (len > 5) line(g, [-2, 3, 1.6, len - 0.5], 0.9, 0xffc27a);
	};
	parts["held/slip"] = (g) => {
		g.poly([0, -1.5, 16, -3.5, 17.5, 0.5, 1, 2.5]).fill(KITCHEN.carrot).stroke({ width: 1.3, color: ink, join: "round" });
		line(g, [4, 0.6, 12, -0.6], 0.9, 0xffc27a);
	};
	parts["held/feed1"] = (g) => peel(g, 12);
	parts["held/feed2"] = (g) => peel(g, 7);
	parts["held/feed3"] = (g) => peel(g, 3);

	/** A burnt toastie (the jam, pulled out and balled up), at (x, y), `r` its outline. */
	const burnt = (g: Graphics, x: number, y: number, r: number[]) => {
		const pts = r.flatMap((v, i) => [x + Math.cos((i / r.length) * Math.PI * 2) * v, y + Math.sin((i / r.length) * Math.PI * 2) * v]);
		g.poly(pts).fill(0x4a3a30).stroke({ width: 1.5, color: ink, join: "round" });
		line(g, [x - 3, y - 2, x + 3, y - 2], 1, 0x8a6a50);
		line(g, [x - 2.4, y + 1.6, x + 2.6, y + 1.6], 1, 0x8a6a50);
	};
	parts["held/crumple"] = (g) => burnt(g, 0, -6, [6.4, 5.2, 6.8, 5.6, 6.2, 4.9, 6.6, 5.4, 6, 5.1]);
	parts["fx/toss"] = (g) => {
		g.moveTo(28, -86).quadraticCurveTo(-4, -118, -40, -92).stroke({ width: 1.3, color: ink, alpha: 0.5, cap: "round" });
		burnt(g, -44, -88, [5, 4.2, 5.4, 4.4, 5, 3.9, 5.2, 4.3]);
		for (const k of [0, 1]) g.circle(-40 + k * 4, -97 - k * 4, 1.8 + k * 0.6).fill({ color: 0x9aa3bd, alpha: 0.55 });
	};

	/** An order ticket (where the sticky note was), centred at (x, y): a white slip with a red table
	 * number band and lines; `flap` lifts its free end. */
	const ticket = (g: Graphics, x: number, y: number, flap: boolean) => {
		const s = STICKY / 2;
		const body = flap
			? [x - s, y + s, x + s, y + s, x + s + 0.8, y - s + 3, x + 2, y - s - 2, x - s + 0.2, y - s + 0.6]
			: [x - s, y + s, x + s, y + s, x + s, y - s, x - s, y - s];
		g.poly(body).fill(KITCHEN.ticket).stroke({ width: 1.3, color: ink, join: "round" });
		if (!flap) g.rect(x - s + 0.7, y - s + 1.4, STICKY - 1.4, 2.2).fill(RED);
		line(g, [x - s + 2, y + 0.6, x + s - 3, y + 0.6], 1, ink);
		line(g, [x - s + 2, y + 2.6, x + s - 2, y + 2.6], 1, ink);
		line(g, [x - s + 2, y + 4.4, x + s - 5, y + 4.4], 1, ink);
		for (let k = 0; k < 5; k++) g.poly([x - s + k * 2.4, y + s, x - s + k * 2.4 + 1.2, y + s + 1, x - s + k * 2.4 + 2.4, y + s]).fill(KITCHEN.ticket);
	};
	parts["held/sticky"] = (g) => ticket(g, 0, -12, false);
	parts["held/stickyFlap"] = (g) => ticket(g, 0, -12, true);
	parts["work/stickyOn"] = (g) => {
		g.rect(PLANNER.x - STICKY / 2 + 1.2, PLANNER.y - STICKY / 2 + 1.5, STICKY, STICKY).fill({ color: p.shadow, alpha: 0.14 });
		ticket(g, PLANNER.x, PLANNER.y, false);
	};

	// The in-tray: the mise tray. A hotel pan on the lead's station, the context stacked in it as
	// deli tubs of prep, a tub a bundle of sheets high, so it buries the lead as the sheets did; it
	// sways, a tub slides off the top, and one drops over the side.
	const PREP = [KITCHEN.carrot, KITCHEN.basil, KITCHEN.onion, KITCHEN.tomato, 0xf2c94c, 0xb07ae8];
	const tub = (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		g.rect(x, y, w, h).fill(0xf3f6fb).stroke({ width: 0.9, color: ink });
		g.rect(x + 1, y + h * 0.35, w - 2, h * 0.65 - 0.6).fill(PREP[k % PREP.length]!);
		g.rect(x - 0.6, y - 0.8, w + 1.2, 1.4).fill(0xffffff).stroke({ width: 0.6, color: ink });
	};
	const mise = (g: Graphics, n: number, lean = 0, top?: "slide" | "drop") => {
		const { x, w, base, sheet: h } = TRAY;
		let y = base - 2;
		for (let i = 0; i < n; i += 3) {
			const k = Math.min(3, n - i);
			const up = (i + k) / TRAY_FULL;
			const dx = lean * 9 * up * up + ((i / 3) % 2 ? 1 : -1) * 0.9;
			const row = i / 3;
			const tw = (w - 2) / 3;
			for (let c = 0; c < 3; c++) tub(g, x - w / 2 + 1 + dx + c * tw + 0.4, y - k * h, tw - 0.8, k * h, row * 2 + c);
			y -= k * h;
		}
		g.poly([x - w / 2 - 3, base - 5, x + w / 2 + 3, base - 5, x + w / 2 + 1, base, x - w / 2 - 1, base]).fill(KITCHEN.steel).stroke({ width: 1.4, color: ink, join: "round" });
		line(g, [x - w / 2 - 1, base - 3.4, x + w / 2 + 1, base - 3.4], 0.8, 0xffffff);
		if (top === "slide") {
			tub(g, x + w / 2 + 1, y - 7, 9, 6, 3);
			for (const dy of [-3, 1]) line(g, [x - w / 2 - 3, y + dy, x - w / 2 - 8, y + dy], 1.2, ink);
		}
		if (top === "drop") {
			const fx = x + w / 2 + 15;
			const fy = y + 14;
			g.save();
			g.translateTransform(-fx, -fy).rotateTransform(0.5).translateTransform(fx, fy);
			tub(g, fx - 5, fy - 5, 10, 10, 1);
			g.restore();
			for (const [dx, dy] of [[-7, 4], [7, 6], [2, 9]] as const) g.circle(fx + dx, fy + dy, 1.4).fill(KITCHEN.basil).stroke({ width: 0.6, color: ink });
			line(g, [fx - 5, fy - 11, fx - 2, fy - 15], 1.2, ink);
			line(g, [fx + 3, fy - 11, fx + 7, fy - 14], 1.2, ink);
		}
	};
	parts["work/tray1"] = (g) => mise(g, 3);
	parts["work/tray2"] = (g) => mise(g, 7);
	parts["work/tray3"] = (g) => mise(g, 14);
	parts["work/tray4"] = (g) => mise(g, TRAY_FULL);
	parts["work/tray4L"] = (g) => mise(g, TRAY_FULL, -1);
	parts["work/tray4R"] = (g) => mise(g, TRAY_FULL, 1);
	parts["work/traySlide"] = (g) => mise(g, TRAY_FULL - 1, 1, "slide");
	parts["work/trayDrop"] = (g) => mise(g, TRAY_FULL - 1, 0, "drop");

	// The bell is the paper rig's brass service bell; it calls "service!".
	parts["fx/ding"] = (g, add) => {
		const x = BELL.x;
		const y = BELL.y + 15;
		for (const r of [7, 12]) g.arc(x, y - 3, r, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ width: 1.4, color: ink, alpha: r > 8 ? 0.55 : 1 });
		const t = text("service!", 9, ink, "900");
		t.position.set(x + 20, y - 19);
		t.rotation = 0.12;
		add(t);
	};

	return { name: "kitchen", palette: p, parts };
}
