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

import { ATLAS_WIDTH, PAD, type PartBounds, RESOLUTION, type Slot, pack } from "./pack";

export { ATLAS_WIDTH, PAD, RESOLUTION, pack, type PartBounds, type Slot };

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
