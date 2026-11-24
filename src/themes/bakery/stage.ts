// The bakery's stage: the cake build, the pastry belt down the hallway and its kiosk and hatch,
// and the staging that says where the crew stands. Split out of scene.ts.
import type { Graphics } from "pixi.js";
import { INK, SHADOW, line } from "../../scene/office/paper";
import type { SceneStaging } from "../../scene/world/staging";
import type { StagePainters } from "../../scene/theme/types";
import { BRASS, CANDY, CHERRY, CHOC, HEAT, IVORY, LEMON, LILAC, MINT, MINT_LIGHT, PINK, PINK_LIGHT, RASPBERRY } from "./palette";
import { croissant, cupcake, donut, eclair, loaf, macaron } from "./pastries";
import { thin } from "./scene";
import { awning } from "./room";

// --- The crew build -------------------------------------------------------------------------------

const SPONGES = [0xffe0a0, 0xffd38a, 0xf7c46c, 0xffe7b0];

const ICINGS = [PINK, MINT, LEMON, LILAC];

/** The crew's tiered cake: sponge after sponge, a frosting band and a drip on each, and a candle with
 * a cherry and a "fresh" flag on top once the PR is up. */
export const CAKE_BUILD = {
	piece: (g: Graphics, x: number, y: number, w: number, h: number, k: number) => {
		// `k` steps by 3 a piece (build.ts): every third piece is a chocolate layer.
		const n = Math.floor(k / 3);
		g.rect(x, y, w, h).fill(n % 3 === 1 ? CHOC : SPONGES[k % SPONGES.length]!);
		const icing = ICINGS[n % ICINGS.length]!;
		g.rect(x, y, w, 2.6).fill(icing);
		g.roundRect(x + 2 + (k % 3) * 2.5, y + 1, 2.2, 3.4 + (k % 2), 1.1).fill(icing);
		g.rect(x, y + h - 2.4, w, 1.6).fill(IVORY);
		g.circle(x + w * 0.7, y + h * 0.55, 0.8).fill(CANDY[k % CANDY.length]!);
		g.rect(x, y, w, h).stroke({ width: 1.4, color: INK });
	},
	flag: (f: Graphics, top: { x: number; y: number }) => {
		f.rect(top.x - 1.6, top.y - 14, 3.2, 14).fill(0xffffff).stroke({ width: 1.1, color: INK });
		f.rect(top.x - 1.6, top.y - 10, 3.2, 2).rect(top.x - 1.6, top.y - 5, 3.2, 2).fill(PINK);
		f.ellipse(top.x, top.y - 18, 2.4, 3.8).fill(HEAT).stroke({ width: 1, color: INK });
		f.ellipse(top.x, top.y - 17.2, 1, 1.8).fill(0xfff3b0);
		f.circle(top.x + 6, top.y - 2.6, 3.2).fill(CHERRY).stroke({ width: 1.2, color: INK });
		f.moveTo(top.x - 5, top.y).lineTo(top.x - 5, top.y - 24).stroke({ width: 1.6, color: INK });
		f.moveTo(top.x - 5, top.y - 24).lineTo(top.x - 20, top.y - 20).lineTo(top.x - 20, top.y - 13).lineTo(top.x - 5, top.y - 15).closePath().fill(PINK).stroke({ width: 1.4, color: INK });
		f.circle(top.x - 12.5, top.y - 18.5, 1.6).fill(0xffffff);
	},
};

/** The order board: the planner as a chalkboard in a scalloped pink frame, three columns of order
 * cards pegged on strings, a card per todo with its session's colour along the top; the boxed ones
 * tied with a ribbon. */
export const BANDS = [0xff5a7a, 0x3d7dff, 0x2fbf83, 0xff9a2e, 0xb07ae8, 0xe8b84a];

// --- Staging (world/staging.ts): the pastry conveyor, the pick-up hatch ---------------------

/** A line's belt (should the bakery ever run its benches as lines): a mint belt in a candy frame. */
function belt(g: Graphics, w: number): void {
	g.rect(4, 2, w, 14).fill(SHADOW);
	for (let x = 10; x < w; x += 120) g.rect(x, 6, 5, 10);
	g.fill(BRASS);
	g.rect(0, -8, w, 8).fill(MINT_LIGHT);
	g.roundRect(-2, 0, w + 4, 8, 2).fill(RASPBERRY).stroke(line(2.5));
	for (let x = 4; x < w; x += 12) g.rect(x, 2, 5, 4);
	g.fill(0xffffff);
	g.moveTo(0, -8).lineTo(w, -8).stroke({ width: 2, color: INK });
}

function slats(g: Graphics, w: number, pitch: number): void {
	for (let x = -pitch; x < w; x += pitch) g.rect(x, -7, 2, 6);
	g.fill({ color: MINT, alpha: 0.8 });
}

function rollers(g: Graphics, w: number, pitch: number): void {
	const cap = pitch + 2;
	for (const x of [-cap + 2, w - 2]) {
		g.roundRect(x, -10, cap, 18, 4).fill(PINK_LIGHT).stroke(line(2.5));
		g.circle(x + cap / 2, -1, 3).fill(RASPBERRY);
	}
}

/** A pastry for each kind of work: a croissant (read), a donut (web), a macaron (search), an éclair
 * (edit), a loaf (shell), a cupcake (test). About 14 px, its base at y = 0. */
function pastry(g: Graphics, kind: string): void {
	switch (kind) {
		case "read":
			croissant(g, 0, 0, 0.85);
			break;
		case "web":
			donut(g, 0, 0, 0.85, PINK, 1);
			break;
		case "search":
			macaron(g, 0, 0, 0.85, MINT);
			break;
		case "edit":
			eclair(g, 0, 0, 0.7);
			break;
		case "test":
			cupcake(g, 0, 0, 0.8, LILAC, LEMON);
			break;
		default:
			loaf(g, 0, 0, 0.75);
	}
}

/** A kiosk round a bench on a line: two candy-cane posts and a striped canopy (a line bay only). */
function kiosk(g: Graphics): void {
	const l = -86;
	const r = 30;
	const top = -124;
	const bottom = -66;
	for (const px of [l, r]) {
		g.rect(px, top, 7, bottom - top).fill(0xffffff).stroke(thin(2));
		for (let y = top + 4; y < bottom; y += 9) g.poly([px, y + 4, px + 7, y, px + 7, y + 3, px, y + 7]).fill(CHERRY);
	}
	awning(g, l - 4, r + 11, top - 6, 8, PINK, 0xffffff, 12);
}

/** The pick-up hatch at the hallway's end: a pink booth, its hatch open on shelves of boxes, an
 * awning over it and the belt running in under it. Its right edge at x = 0. */
function hatch(g: Graphics, h: number): void {
	const w = 56;
	g.rect(-w, 6, w, h - 12).fill(PINK_LIGHT);
	g.rect(-w + 6, 22, w - 12, h * 0.4).fill(0x5a3a44).stroke(thin(2));
	for (let k = 0; k < 2; k++) {
		const sy = 22 + (h * 0.4 * (k + 1)) / 2 - 2;
		g.rect(-w + 6, sy, w - 12, 2).fill(0xffffff);
		for (let i = 0; i < 3; i++) g.rect(-w + 9 + i * 13, sy - 8, 11, 8).fill([PINK, MINT_LIGHT, 0xfff3c4][(i + k) % 3]!).stroke(thin(1));
	}
	awning(g, -w - 4, 2, 9, 7, RASPBERRY, 0xffffff, 8);
	g.rect(-w, h / 2 - 15, w, 30).fill({ color: 0x5a3a44, alpha: 0.85 });
	g.rect(-w, 6, w, h - 12).stroke(line(3));
	g.circle(-w / 2, h - 22, 5).fill(0xf2bd3c).stroke(thin(1.6));
}

/** A PR's cake box riding the hallway's belt: pink, tied with a ribbon and a bow, its base at y = 0. */
function cakeBox(g: Graphics): void {
	g.rect(-13, -18, 26, 18).fill(PINK_LIGHT).stroke(line(2.5));
	g.rect(-14, -20, 28, 4).fill(0xffffff).stroke(thin(1.8));
	g.rect(-1.5, -20, 3, 20).rect(-13, -10, 26, 3).fill(RASPBERRY);
	g.ellipse(-4, -22, 4.4, 2.8).ellipse(4, -22, 4.4, 2.8).fill(RASPBERRY).stroke(thin(1.4));
	g.circle(0, -22, 1.8).fill(RASPBERRY).stroke(thin(1.2));
}

export const BAKERY_STAGE: StagePainters = { belt, slats, rollers, part: pastry, booth: kiosk, dock: hatch, crate: cakeBox };

/** The bakery bakes at its benches (desks), and the hallway is a pastry conveyor: pastries ride it
 * all day, a finished PR's cake box rides it to the pick-up hatch. The café's espresso machine
 * steams, the deck ovens' windows flicker, the marquee bulbs round "Order up!" chase, the tasting
 * table's cake turns on its stand, sprinkles drift down round the giant cupcake. Idle, the bakers sip
 * at the café's lemonade, put their feet up and nap face down on the bench; first, the bakery's own:
 * a cappuccino, a sneaked macaron, a lick of the cake fork, a nap on a flour sack (rig/data/poses.ts). */
export const BAKERY_STAGING: SceneStaging = {
	bay: "desks",
	hall: "conveyor",
	ambient: ["steam", "ovens", "marquee", "cakeStand", "sprinkles", "parade"],
	habits: ["cappuccinoSip", "macaronSneak", "forkLick", "flourNap", "waterCooler", "feetUp", "stretch", "faceDown", "chairSpin", "slowWalk"],
};
