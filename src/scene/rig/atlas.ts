// The part atlas: every painter in a theme is drawn once into one texture at startup, and each part
// becomes a sub-texture of it. A crowd of puppets then draws as sprites from a single texture
// source, which batches into a handful of draw calls however many characters are on screen.
//
// Layout: parts are shelf-packed in name order into a strip ATLAS_WIDTH rig units wide, with
// PAD units of clear space around each so filtering never bleeds a neighbour in. Each part keeps
// its painter's own origin as the sprite anchor, so a sprite at (0, 0) draws exactly where the
// painter drew. The atlas is baked at RESOLUTION pixels per rig unit, so a mochi stays crisp up
// to ~200 px wide, and carries mipmaps so a whole-office zoom stays smooth.
import { Container, Graphics, Rectangle, type Renderer, Texture } from "pixi.js";
import type { Theme } from "./theme";

export const ATLAS_WIDTH = 1024;
export const PAD = 3;
export const RESOLUTION = 2;

export interface Slot {
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Anchor (0..1) that puts the painter's origin at the sprite's position. */
	ax: number;
	ay: number;
}

export interface PartBounds {
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Shelf-pack part bounds into rows ATLAS_WIDTH wide. Pure, so the layout is unit-tested. */
export function pack(parts: PartBounds[], width = ATLAS_WIDTH, pad = PAD): { slots: Slot[]; width: number; height: number } {
	const slots: Slot[] = [];
	let x = pad;
	let y = pad;
	let row = 0;
	// Tallest first keeps shelves tight; ties broken by name, so the layout is stable.
	const order = [...parts].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name));
	for (const p of order) {
		const w = Math.ceil(p.width);
		const h = Math.ceil(p.height);
		if (w + pad * 2 > width) throw new Error(`part ${p.name} is wider than the atlas`);
		if (x + w + pad > width) {
			x = pad;
			y += row + pad;
			row = 0;
		}
		slots.push({ name: p.name, x, y, width: w, height: h, ax: -p.x / w, ay: -p.y / h });
		x += w + pad;
		row = Math.max(row, h);
	}
	return { slots, width, height: Math.ceil(y + row + pad) };
}

export class Atlas {
	readonly textures = new Map<string, Texture>();
	readonly slots = new Map<string, Slot>();

	private constructor(
		readonly theme: Theme,
		readonly texture: Texture,
		slots: Slot[],
	) {
		for (const s of slots) {
			this.slots.set(s.name, s);
			this.textures.set(
				s.name,
				new Texture({ source: texture.source, frame: new Rectangle(s.x, s.y, s.width, s.height), defaultAnchor: { x: s.ax, y: s.ay } }),
			);
		}
	}

	/** Paint every part of `theme` and bake them into one texture. */
	static build(renderer: Renderer, theme: Theme): Atlas {
		const drawn: { name: string; node: Container; bounds: PartBounds }[] = [];
		for (const name of Object.keys(theme.parts).sort()) {
			const node = new Container();
			const g = new Graphics();
			node.addChild(g);
			theme.parts[name]!(g, (c) => node.addChild(c));
			const b = node.getLocalBounds();
			drawn.push({ name, node, bounds: { name, x: b.x, y: b.y, width: Math.max(1, b.width), height: Math.max(1, b.height) } });
		}
		const { slots, width, height } = pack(drawn.map((d) => d.bounds));
		const sheet = new Container();
		const at = new Map(slots.map((s) => [s.name, s]));
		for (const d of drawn) {
			const s = at.get(d.name)!;
			d.node.position.set(s.x - d.bounds.x, s.y - d.bounds.y);
			sheet.addChild(d.node);
		}
		const texture = renderer.generateTexture({
			target: sheet,
			frame: new Rectangle(0, 0, width, height),
			resolution: RESOLUTION,
			antialias: true,
			textureSourceOptions: { autoGenerateMipmaps: true, scaleMode: "linear" },
		});
		texture.source.updateMipmaps();
		sheet.destroy({ children: true, context: true, style: true });
		return new Atlas(theme, texture, slots);
	}

	get(name: string): Texture {
		const t = this.textures.get(name);
		if (!t) throw new Error(`no part "${name}" in the ${this.theme.name} atlas`);
		return t;
	}

	has(name: string): boolean {
		return this.textures.has(name);
	}

	/** The baked size, in pixels. */
	get pixels(): { width: number; height: number } {
		return { width: this.texture.source.pixelWidth, height: this.texture.source.pixelHeight };
	}

	destroy(): void {
		for (const t of this.textures.values()) t.destroy(false);
		this.texture.destroy(true);
	}
}
