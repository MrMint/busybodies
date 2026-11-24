// The building's outside: the lawn it stands on, its shadow from the phase's light, and a yard
// round it (trees and bushes for the office, bollards and pallets for the factory), lit for the
// phase. Drawn when the building's size or the phase changes; the tree tops shift a touch with
// the camera (a little parallax), which costs nothing extra: they move only while the camera does.
// The lawn itself is the renderer's background colour, lit for the phase, so it costs no fill; the
// yard's things are baked sprites (many small vector shapes on the lawn cost far more to draw each
// frame than a few textured quads).
import { Container, Graphics, type Renderer, Rectangle, Sprite, Texture } from "pixi.js";
import { type Phase, SHADOW } from "../world/daylight";
import { mul } from "./light";
import { INK, line, noise } from "./paper";
import type { SceneLight } from "../theme/types";
import type { Rect } from "../world/world";

/** Tree tops move this share of the camera's offset from the building's centre. */
const PARALLAX = 0.035;

type Kind =
	| "canopy"
	| "trunk"
	| "poplar"
	| "ball"
	| "bush"
	| "flowers-pink"
	| "flowers-yellow"
	| "flowers-lilac"
	| "tuft"
	| "stone"
	| "bollard"
	| "pallet"
	| "drum"
	| "crates"
	| "gravel"
	| "slab";

const KINDS: Kind[] = [
	"canopy",
	"trunk",
	"poplar",
	"ball",
	"bush",
	"flowers-pink",
	"flowers-yellow",
	"flowers-lilac",
	"tuft",
	"stone",
	"bollard",
	"pallet",
	"drum",
	"crates",
	"gravel",
	"slab",
];

/** A tree's crown: drawn in the tops (they drift with the camera) at this height up its trunk. */
const CROWN: Partial<Record<Kind, number>> = { canopy: 24, poplar: 24, ball: 24 };
/** How far each thing reaches above its base, at size 1 (a tree's crown included): so one below
 * the building never tucks its top under the slab. */
const REACH: Partial<Record<Kind, number>> = { canopy: 92, poplar: 122, ball: 76, bush: 38, pallet: 28, drum: 36, crates: 44, bollard: 36 };

export class Outside extends Container {
	#ground = new Graphics({ label: "ground" });
	#base = new Container({ label: "base" });
	#tops = new Container({ label: "tops" });
	#textures = new Map<Kind, { tex: Texture; anchor: { x: number; y: number } }>();
	#atlas?: Texture;
	#sig = "";
	#centre = { x: 0, y: 0 };
	#renderer: Renderer;

	constructor(renderer: Renderer) {
		super({ label: "outside" });
		this.#renderer = renderer;
		this.addChild(this.#ground, this.#base, this.#tops);
	}

	/** Draw it for this building (`slab`: the building's base) in this light, if anything changed.
	 * `door`: where the path starts, at the slab's edge under the lobby. */
	update(slab: Rect, lawn: number, light: SceneLight, phase: Phase, door?: { x: number; y: number }): void {
		const sig = JSON.stringify([slab, lawn, light.yard, phase, door]);
		if (sig === this.#sig) return;
		this.#sig = sig;
		this.#centre = { x: slab.x + slab.w / 2, y: slab.y + slab.h / 2 };
		const tint = light.outside[phase];
		this.#renderer.background.color = mul(lawn, tint);
		// The building's shadow on the lawn: two stacked offsets, like paper layers; only the strips
		// that show past the slab, so the lawn isn't filled twice under the building.
		const g = this.#ground.clear();
		const s = SHADOW[phase];
		for (const k of [3, 1.5]) {
			const dx = s.x * k;
			const dy = s.y * k;
			if (dx > 0) g.rect(slab.x + slab.w, slab.y + dy, dx, slab.h);
			if (dx < 0) g.rect(slab.x + dx, slab.y + dy, -dx, slab.h);
			if (dy > 0) g.rect(slab.x + dx, slab.y + slab.h, slab.w, dy);
			g.fill({ color: INK, alpha: 0.12 });
		}
		for (const c of [...this.#base.removeChildren(), ...this.#tops.removeChildren()]) c.destroy();
		const put = (layer: Container, kind: Kind, x: number, y: number, size: number, flip = false, rot = 0) => {
			const t = this.#texture(kind);
			const sprite = new Sprite(t.tex);
			sprite.anchor.set(t.anchor.x, t.anchor.y);
			sprite.scale.set(flip ? -size : size, size);
			sprite.rotation = rot;
			sprite.position.set(x, y);
			sprite.tint = tint;
			layer.addChild(sprite);
		};
		const trees = light.yard === "trees";
		// The path from the lobby out across the lawn: stepping stones (or the works' walkway slabs).
		const path = door ? pathFrom(door) : undefined;
		if (path) for (const st of path.stones) put(this.#base, trees ? "stone" : "slab", st.x, st.y, st.size, st.flip, st.rot);
		// Tufts of grass (or gravel), from noise, in a band round the building, off the path.
		const tuft: Kind = trees ? "tuft" : "gravel";
		for (let i = 0; i < 70; i++) {
			const side = i % 4;
			const t = noise(i, 1, 21);
			const d = 30 + noise(i, 2, 21) * 300;
			const [x, y] =
				side === 0
					? [slab.x - 300 + t * (slab.w + 600), slab.y - d]
					: side === 1
						? [slab.x - 300 + t * (slab.w + 600), slab.y + slab.h + d]
						: side === 2
							? [slab.x - d, slab.y + t * slab.h]
							: [slab.x + slab.w + d, slab.y + t * slab.h];
			if (path?.near(x!, y!, 30)) continue;
			put(this.#base, tuft, x!, y!, 0.8 + noise(i, 3, 21) * 0.5);
		}
		// The yard: a tree's trunk stays on the ground and its crown drifts a touch with the camera.
		for (const p of yardSpots(slab, light.yard, path)) {
			const crown = CROWN[p.kind];
			if (crown !== undefined) {
				put(this.#base, "trunk", p.x, p.y, p.size * (p.kind === "ball" ? 0.8 : 1));
				put(this.#tops, p.kind, p.x, p.y - crown * p.size, p.size, p.flip);
			} else put(this.#base, p.kind, p.x, p.y, p.size, p.flip);
		}
	}

	/** The camera moved: its centre in world pixels. Tree tops lean away from it a little. */
	parallax(x: number, y: number): void {
		this.#tops.position.set((x - this.#centre.x) * -PARALLAX, (y - this.#centre.y) * -PARALLAX);
	}

	#texture(kind: Kind): { tex: Texture; anchor: { x: number; y: number } } {
		if (!this.#textures.size) this.#bakeAtlas();
		return this.#textures.get(kind)!;
	}

	/** Every yard thing, both themes', baked once into one texture, each a frame of it: the lawn's
	 * sprites then share one texture source, so they batch with the rooms' textures instead of
	 * taking a draw call of their own. */
	#bakeAtlas(): void {
		const sheet = new Container();
		const placed: { kind: Kind; frame: Rectangle; base: { x: number; y: number } }[] = [];
		let x = 0;
		let y = 0;
		let rowH = 0;
		for (const kind of KINDS) {
			const g = this.#draw(kind);
			const b = g.getLocalBounds();
			const w = Math.ceil(b.width) + 8;
			const h = Math.ceil(b.height) + 8;
			if (x + w > 520) {
				x = 0;
				y += rowH;
				rowH = 0;
			}
			// The frame's top-left in the sheet; the thing drawn so its bounds start 4 px inside it.
			g.position.set(x + 4 - Math.floor(b.x), y + 4 - Math.floor(b.y));
			sheet.addChild(g);
			// Its frame in the sheet, and where its base (0, 0) lands in that frame.
			placed.push({ kind, frame: new Rectangle(x, y, w, h), base: { x: 4 - Math.floor(b.x), y: 4 - Math.floor(b.y) } });
			x += w;
			rowH = Math.max(rowH, h);
		}
		const atlas = this.#renderer.generateTexture({ target: sheet, frame: new Rectangle(0, 0, 520, y + rowH), resolution: 3, antialias: true });
		sheet.destroy({ children: true });
		for (const p of placed) {
			const { base } = p;
			const tex = new Texture({
				source: atlas.source,
				frame: new Rectangle(atlas.frame.x + p.frame.x, atlas.frame.y + p.frame.y, p.frame.width, p.frame.height),
			});
			this.#textures.set(p.kind, { tex, anchor: { x: base.x / p.frame.width, y: base.y / p.frame.height } });
		}
		this.#atlas = atlas;
	}

	/** A yard thing, drawn round its base (0, 0), with its shadow where it has one. */
	#draw(kind: Kind): Graphics {
		const g = new Graphics();
		const shadow = (rx: number, ry: number) => g.ellipse(4, 2, rx, ry).fill({ color: INK, alpha: 0.14 });
		switch (kind) {
			case "canopy":
				// One outline round the clump: the circles in ink a little larger, then in green.
				g.circle(-14, -8, 26).circle(14, -12, 28).circle(0, -32, 28).fill(INK);
				g.circle(-14, -8, 24).circle(14, -12, 26).circle(0, -32, 26).fill(0x41b866);
				g.circle(-6, -28, 9).circle(14, -18, 6).fill({ color: 0xffffff, alpha: 0.22 });
				break;
			case "trunk":
				shadow(26, 8);
				g.roundRect(-4, -30, 8, 30, 3).fill(0x8a5a3c).stroke(line(3));
				break;
			case "bush":
				shadow(22, 6);
				g.ellipse(-12, -14, 18, 16).ellipse(12, -15, 19, 17).ellipse(0, -22, 17, 15).fill(INK);
				g.ellipse(-12, -14, 16, 14).ellipse(12, -15, 17, 15).ellipse(0, -22, 15, 13).fill(0x52c476);
				break;
			case "bollard":
				shadow(13, 5);
				g.roundRect(-7, -34, 14, 34, 6).fill(0xffc928).stroke(line(3));
				g.rect(-7, -24, 14, 5).rect(-7, -14, 14, 5).fill(INK);
				break;
			case "pallet":
				shadow(34, 6);
				g.rect(-30, -14, 60, 14).fill(0xd9a066).stroke(line(3));
				g.rect(-24, -24, 22, 12).rect(2, -26, 24, 14).fill(0xc9a77a).stroke(line(2.5));
				break;
			case "poplar":
				// A tall narrow tree: one long crown, a seam of leaf marks down it.
				g.ellipse(0, -48, 18, 50).fill(INK);
				g.ellipse(0, -48, 16, 48).fill(0x2fa860);
				g.ellipse(-5, -62, 5, 18).fill({ color: 0xffffff, alpha: 0.2 });
				for (let k = 0; k < 5; k++) g.moveTo(-6 + (k % 2) * 8, -82 + k * 14).lineTo(-1 + (k % 2) * 8, -76 + k * 14);
				g.stroke({ width: 1.6, color: INK, alpha: 0.35, cap: "round" });
				break;
			case "ball":
				// A small round tree: a ball of leaves on its stick.
				g.circle(0, -22, 24).fill(INK);
				g.circle(0, -22, 22).fill(0x5ccf7f);
				g.circle(-8, -30, 7).fill({ color: 0xffffff, alpha: 0.24 });
				break;
			case "flowers-pink":
			case "flowers-yellow":
			case "flowers-lilac": {
				// A low clump of flowers: leaves, then the blooms with their middles.
				const bloom = kind === "flowers-pink" ? 0xff8fa3 : kind === "flowers-yellow" ? 0xffd166 : 0xb69cff;
				shadow(15, 4);
				g.ellipse(-7, -4, 9, 5).ellipse(6, -5, 10, 6).ellipse(0, -8, 8, 5).fill(INK);
				g.ellipse(-7, -4, 7.5, 3.8).ellipse(6, -5, 8.5, 4.6).ellipse(0, -8, 6.5, 3.8).fill(0x52c476);
				const at: [number, number][] = [
					[-9, -8],
					[-2, -12],
					[6, -10],
					[11, -6],
					[1, -5],
					[-5, -3],
				];
				for (const [bx, by] of at) g.circle(bx, by, 3.3).fill(bloom).stroke({ width: 1.2, color: INK });
				for (const [bx, by] of at) g.circle(bx, by, 1).fill(kind === "flowers-yellow" ? 0xff8a3d : 0xfff3b0);
				break;
			}
			case "stone":
				g.roundRect(-13, -7, 26, 14, 7).fill(0xf3ecda).stroke({ width: 2, color: INK, alpha: 0.45 });
				g.roundRect(-8, -4, 9, 3, 1.5).fill({ color: INK, alpha: 0.06 });
				break;
			case "slab":
				g.rect(-20, -9, 40, 18).fill(0xd3cfc6).stroke({ width: 2, color: INK, alpha: 0.4 });
				g.rect(-20, -9, 4, 18).rect(16, -9, 4, 18).fill(0xffc928);
				break;
			case "drum":
				shadow(14, 4);
				g.roundRect(-11, -32, 22, 32, 3).fill(0x3d7dff).stroke(line(2.5));
				g.rect(-11, -22, 22, 2).rect(-11, -11, 22, 2).fill(INK);
				g.ellipse(0, -32, 11, 3).fill(0x6f9cff).stroke({ width: 1.8, color: INK });
				break;
			case "crates":
				shadow(30, 6);
				g.rect(-26, -24, 26, 24).rect(2, -20, 22, 20).fill(0xc9a77a).stroke(line(2.5));
				g.rect(-16, -44, 24, 20).fill(0xd6b48a).stroke(line(2.5));
				g.moveTo(-26, 0).lineTo(0, -24).moveTo(2, 0).lineTo(24, -20).moveTo(-16, -24).lineTo(8, -44).stroke({ width: 1.5, color: INK, alpha: 0.45 });
				break;
			case "tuft":
				g.moveTo(-5, 0).lineTo(-7, -7).moveTo(0, 0).lineTo(0, -9).moveTo(5, 0).lineTo(7, -6).stroke({ width: 2.2, color: 0x6cc489, cap: "round" });
				break;
			case "gravel":
				g.circle(-4, -1, 2).circle(2, -2, 2.4).circle(6, 0, 1.6).fill(0x9d9584);
				break;
		}
		return g;
	}

	override destroy(): void {
		for (const t of this.#textures.values()) t.tex.destroy();
		this.#textures.clear();
		this.#atlas?.destroy(true);
		super.destroy({ children: true });
	}
}

/** Where the yard's things stand, round the building: a jittered grid over the lawn, kept where a
 * density says so. The density frames the building's corners with clusters, thins out toward the
 * building (only flowers and bushes come near it) and the middle of its long sides, and clumps by a
 * slow noise; the kind follows the distance (tall trees far out, flowers close in). All from the
 * position, so the same every load. Nothing stands on the path, and nothing below the building
 * reaches up under the slab. */
interface Spot {
	kind: Kind;
	x: number;
	y: number;
	size: number;
	flip: boolean;
}

const CELL = 58;
const FLOWERS: Kind[] = ["flowers-pink", "flowers-yellow", "flowers-lilac"];

function yardSpots(slab: Rect, yard: "trees" | "yard", path: Path | undefined): Spot[] {
	const out: Spot[] = [];
	const trees = yard === "trees";
	const x0 = slab.x - 460;
	const y0 = slab.y - 380;
	const corners = [
		[slab.x, slab.y],
		[slab.x + slab.w, slab.y],
		[slab.x, slab.y + slab.h],
		[slab.x + slab.w, slab.y + slab.h],
	] as const;
	const cols = Math.ceil((slab.w + 920) / CELL);
	const rows = Math.ceil((slab.h + 760) / CELL);
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < cols; i++) {
			const x = x0 + (i + 0.15 + noise(i, j, 36) * 0.7) * CELL;
			const y = y0 + (j + 0.15 + noise(i, j, 37) * 0.7) * CELL;
			const dx = Math.max(slab.x - x, 0, x - slab.x - slab.w);
			const dyTop = slab.y - y;
			const dyBottom = y - slab.y - slab.h;
			const d = Math.hypot(dx, Math.max(dyTop, 0, dyBottom));
			if (d < 14) continue;
			if (path?.near(x, y, 30)) continue;
			const c = Math.min(...corners.map(([cx, cy]) => Math.hypot(x - cx, y - cy)));
			const corner = Math.exp(-((c / 300) ** 2));
			const near = smooth(12, 140, d);
			const clump = 0.35 + 1.3 * slow(x / 230, y / 230, 38);
			// The works' yard is sparser and keeps to its corners: about half as many things, few of them
			// out along the sides, so the apron isn't peppered.
			const p = trees ? (0.05 + 0.55 * corner) * (0.3 + 0.7 * near) * clump : (0.012 + 0.34 * corner) * (0.3 + 0.7 * near) * clump;
			if (noise(i, j, 41) >= p) continue;
			const r = noise(i, j, 42);
			let kind: Kind;
			if (trees) {
				if (d < 60) kind = r < 0.7 ? ("flowers" as Kind) : "bush";
				else if (d < 140) kind = r < 0.35 ? ("flowers" as Kind) : r < 0.65 ? "bush" : r < 0.85 ? "ball" : "poplar";
				else kind = r < 0.15 ? ("flowers" as Kind) : r < 0.35 ? "bush" : r < 0.55 ? "ball" : r < 0.55 + 0.25 * (0.5 + corner) ? "poplar" : "canopy";
			} else {
				if (d < 60) continue;
				kind = d < 140 ? (r < 0.6 ? "bollard" : "drum") : r < 0.35 ? "pallet" : r < 0.65 ? "crates" : r < 0.85 ? "drum" : "bollard";
			}
			if ((kind as string) === "flowers") kind = FLOWERS[Math.min(2, Math.floor(slow(x / 340, y / 340, 39) * 3))]!;
			const big = kind === "canopy" || kind === "poplar" || kind === "ball";
			const flowers = FLOWERS.includes(kind);
			let size = (big ? 0.78 + 0.22 * near : flowers ? 1.25 : 0.7) + noise(i, j, 43) * (big ? 0.42 : 0.5);
			// Below the building, nothing tall enough to reach under the slab; beside it, no crown
			// wider than the gap.
			const reach = (REACH[kind] ?? 16) * size;
			if (dyBottom > 0 && dx === 0 && dyBottom < reach + 6) {
				if (!big) continue;
				kind = dyBottom < 46 ? FLOWERS[i % 3]! : "bush";
				size = 0.8;
			}
			if (big && dx > 0 && dx < 44 * size && y > slab.y) kind = "bush";
			out.push({ kind, x, y, size, flip: noise(i, j, 44) > 0.5 });
		}
	}
	return out.sort((a, b) => a.y - b.y);
}

const smooth = (a: number, b: number, v: number) => {
	const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** Smooth value noise, 0 to 1: the lattice's noise, blended between its corners. */
function slow(x: number, y: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = smooth(0, 1, x - ix);
	const fy = smooth(0, 1, y - iy);
	const n = (a: number, b: number) => noise(ix + a + 1000, iy + b + 1000, seed);
	return (n(0, 0) * (1 - fx) + n(1, 0) * fx) * (1 - fy) + (n(0, 1) * (1 - fx) + n(1, 1) * fx) * fy;
}

/** The path out from the lobby: down across the lawn in a lazy S, as stepping stones in pairs. */
interface Path {
	stones: { x: number; y: number; size: number; flip: boolean; rot: number }[];
	/** True if (x, y) is within `r` of the path's middle. */
	near(x: number, y: number, r: number): boolean;
}

const PATH = { length: 760, step: 24, half: 26 } as const;

function pathFrom(door: { x: number; y: number }): Path {
	const xAt = (y: number) => {
		const t = (y - door.y) / PATH.length;
		return door.x + Math.sin(t * Math.PI * 2.2) * 38 * Math.min(1, t * 4);
	};
	const stones: Path["stones"] = [];
	for (let y = door.y + 12, k = 0; y < door.y + PATH.length; y += PATH.step, k++) {
		const x = xAt(y);
		// One stone a step, left then right of the line, each a little off.
		const side = k % 2 ? 1 : -1;
		const sx = x + side * 7 + (noise(k, side, 45) - 0.5) * 5;
		stones.push({
			x: sx,
			y: y + (noise(k, side, 46) - 0.5) * 3,
			size: 1.25 + noise(k, side, 47) * 0.3,
			flip: noise(k, side, 48) > 0.5,
			rot: (noise(k, side, 49) - 0.5) * 0.3,
		});
	}
	return {
		stones,
		near: (x, y, r) => y > door.y - r && y < door.y + PATH.length + r && Math.abs(x - xAt(Math.max(door.y, y))) < PATH.half + r,
	};
}
