// The building's outside: the lawn it stands on, its shadow from the phase's light, and a yard
// round it (trees and bushes for the office, bollards and pallets for the factory), lit for the
// phase. Drawn when the building's size or the phase changes; the tree tops shift a touch with
// the camera (a little parallax), which costs nothing extra: they move only while the camera does.
// The lawn itself is the renderer's background colour, lit for the phase, so it costs no fill; the
// yard's things are baked sprites (many small vector shapes on the lawn cost far more to draw each
// frame than a few textured quads).
import { Container, Graphics, type Renderer, Rectangle, Sprite, type Texture } from "pixi.js";
import { type Phase, SHADOW } from "./daylight";
import { mul } from "./light";
import { INK, line, noise } from "./paper";
import type { SceneLight } from "../theme/types";
import type { Rect } from "./world";

/** Tree tops move this share of the camera's offset from the building's centre. */
const PARALLAX = 0.035;

type Kind = "canopy" | "trunk" | "bush" | "bollard" | "pallet" | "tuft" | "gravel";

export class Outside extends Container {
	#ground = new Graphics({ label: "ground" });
	#base = new Container({ label: "base" });
	#tops = new Container({ label: "tops" });
	#textures = new Map<Kind, { tex: Texture; anchor: { x: number; y: number } }>();
	#sig = "";
	#centre = { x: 0, y: 0 };
	#renderer: Renderer;

	constructor(renderer: Renderer) {
		super({ label: "outside" });
		this.#renderer = renderer;
		this.addChild(this.#ground, this.#base, this.#tops);
	}

	/** Draw it for this building (`slab`: the building's base) in this light, if anything changed. */
	update(slab: Rect, lawn: number, light: SceneLight, phase: Phase): void {
		const sig = JSON.stringify([slab, lawn, light.yard, phase]);
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
		const put = (layer: Container, kind: Kind, x: number, y: number, size: number) => {
			const t = this.#texture(kind);
			const sprite = new Sprite(t.tex);
			sprite.anchor.set(t.anchor.x, t.anchor.y);
			sprite.scale.set(size);
			sprite.position.set(x, y);
			sprite.tint = tint;
			layer.addChild(sprite);
		};
		// Tufts of grass (or gravel), from noise, in a band round the building.
		const tuft: Kind = light.yard === "trees" ? "tuft" : "gravel";
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
			put(this.#base, tuft, x!, y!, 0.8 + noise(i, 3, 21) * 0.5);
		}
		// The yard: a tree's trunk stays on the ground and its top drifts a touch with the camera.
		for (const p of yardSpots(slab, light.yard)) {
			if (p.kind === "canopy") {
				put(this.#base, "trunk", p.x, p.y, p.size);
				put(this.#tops, "canopy", p.x, p.y - 24 * p.size, p.size);
			} else put(this.#base, p.kind, p.x, p.y, p.size);
		}
	}

	/** The camera moved: its centre in world pixels. Tree tops lean away from it a little. */
	parallax(x: number, y: number): void {
		this.#tops.position.set((x - this.#centre.x) * -PARALLAX, (y - this.#centre.y) * -PARALLAX);
	}

	/** A yard thing, drawn once round its base (0, 0), with its shadow where it has one. */
	#texture(kind: Kind): { tex: Texture; anchor: { x: number; y: number } } {
		const had = this.#textures.get(kind);
		if (had) return had;
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
			case "tuft":
				g.moveTo(-5, 0).lineTo(-7, -7).moveTo(0, 0).lineTo(0, -9).moveTo(5, 0).lineTo(7, -6).stroke({ width: 2.2, color: 0x6cc489, cap: "round" });
				break;
			case "gravel":
				g.circle(-4, -1, 2).circle(2, -2, 2.4).circle(6, 0, 1.6).fill(0x9d9584);
				break;
		}
		const b = g.getLocalBounds();
		const frame = new Rectangle(Math.floor(b.x) - 3, Math.floor(b.y) - 3, Math.ceil(b.width) + 6, Math.ceil(b.height) + 6);
		const tex = this.#renderer.generateTexture({ target: g, frame, resolution: 3, antialias: true });
		g.destroy();
		const t = { tex, anchor: { x: -frame.x / frame.width, y: -frame.y / frame.height } };
		this.#textures.set(kind, t);
		return t;
	}

	override destroy(): void {
		for (const t of this.#textures.values()) t.tex.destroy(true);
		this.#textures.clear();
		super.destroy({ children: true });
	}
}

/** Where the yard's things stand, round the building: from noise, so the same every load. */
function yardSpots(slab: Rect, yard: "trees" | "yard"): { kind: Kind; x: number; y: number; size: number }[] {
	const out: { kind: Kind; x: number; y: number; size: number }[] = [];
	const step = yard === "trees" ? 150 : 190;
	const along = (x0: number, x1: number, y: number, dir: 1 | -1, seed: number) => {
		let i = 0;
		for (let x = x0; x < x1; x += step, i++) {
			const n = noise(i, seed, 31);
			if (n < 0.35) continue;
			const dist = 60 + noise(i, seed, 32) * 160;
			const kind: Kind = yard === "trees" ? (n > 0.62 ? "canopy" : "bush") : n > 0.7 ? "pallet" : "bollard";
			const px = x + (noise(i, seed, 33) - 0.5) * 70;
			out.push({ kind, x: px, y: y + dir * dist + (dir > 0 ? (kind === "canopy" ? 60 : 30) : 0), size: 0.85 + noise(i, seed, 34) * 0.4 });
		}
	};
	along(slab.x - 260, slab.x + slab.w + 260, slab.y, -1, 1);
	along(slab.x - 260, slab.x + slab.w + 260, slab.y + slab.h, 1, 2);
	// A few down each end.
	for (const [i, side] of [-1, 1].entries()) {
		for (let k = 0; k < 3; k++) {
			const n = noise(k, 3 + i, 31);
			if (n < 0.4) continue;
			const x = side < 0 ? slab.x - 90 - noise(k, 3 + i, 32) * 120 : slab.x + slab.w + 90 + noise(k, 3 + i, 32) * 120;
			const y = slab.y + ((k + 0.5) / 3) * slab.h;
			out.push({ kind: yard === "trees" ? (n > 0.7 ? "canopy" : "bush") : n > 0.75 ? "pallet" : "bollard", x, y, size: 0.85 + noise(k, 5 + i, 34) * 0.4 });
		}
	}
	return out.sort((a, b) => a.y - b.y);
}
