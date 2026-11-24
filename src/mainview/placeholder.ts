// The placeholder Busybody behind the office's Character interface (src/scene/office/slot.ts),
// until the mochi rig (S1) provides its own factory. Each look (colour, size, mood) is drawn once
// and baked into a texture that every character with that look shares, so a crowd batches into a
// few draw calls instead of one vector draw per body; the bounce moves the sprite.
import { Container, Rectangle, type Renderer, Sprite, type Texture } from "pixi.js";
import type { Character, CharacterFactory } from "../scene/office/slot";
import type { Who } from "../scene/contract";
import type { Slot } from "../scene/world/world";
import { Busybody } from "./busybody";

const PALETTE = [0xff8fab, 0x8fd3ff, 0xffd166, 0x9be7a0, 0xc3a6ff, 0xffb38a, 0x7fe0d4, 0xf5a3e0];
import { hash31 as hash } from "../shared/hash";
/** Baked at 4x: sharp from the whole office up to a room, a little soft at the desk stop. */
const RESOLUTION = 4;

interface Look {
	texture: Texture;
	anchor: { x: number; y: number };
}

class Placeholder implements Character {
	readonly view = new Container();
	#sprite = new Sprite();
	#who: Who;
	#phase: number;
	#looks: (who: Who) => Look;

	constructor(who: Who, looks: (who: Who) => Look) {
		this.#looks = looks;
		this.#who = who;
		this.#phase = (hash(who.key) % 628) / 100;
		this.view.addChild(this.#sprite);
		this.#dress();
	}

	get animating(): boolean {
		return this.#who.mood === "busy";
	}

	#dress(): void {
		const look = this.#looks(this.#who);
		this.#sprite.texture = look.texture;
		this.#sprite.anchor.set(look.anchor.x, look.anchor.y);
		this.#sprite.y = 0;
		this.#sprite.scale.set(1);
		// A bake ignores the body's own alpha, so the finished fade goes on the view.
		this.view.alpha = this.#who.mood === "done" ? 0.6 : 1;
	}

	update(who: Who): void {
		const changed = who.mood !== this.#who.mood || who.size !== this.#who.size || who.tint !== this.#who.tint;
		this.#who = who;
		if (changed) this.#dress();
	}

	place(slot: Slot): void {
		this.view.position.set(slot.x, slot.y);
	}

	/** One frame of typing: a quick bounce with squash, about the feet. */
	tick(dt: number): void {
		if (this.#who.mood !== "busy") return;
		this.#phase += 0.35 * dt;
		const b = Math.abs(Math.sin(this.#phase));
		this.#sprite.y = -b * this.#who.size * 0.08;
		this.#sprite.scale.set(1 + (1 - b) * 0.05, 1 - (1 - b) * 0.05);
	}

	inspect() {
		return { mood: this.#who.mood, size: Math.round(this.#who.size), lift: Math.round(-this.#sprite.y * 100) / 100, role: this.#who.role };
	}

	destroy(): void {
		this.view.destroy({ children: true });
	}
}

/** A factory of placeholders that share baked looks through `renderer`. */
export function placeholders(renderer: Renderer): CharacterFactory {
	const looks = new Map<string, Look>();
	const lookFor = (who: Who): Look => {
		const colour = PALETTE[hash(who.tint) % PALETTE.length]!;
		const key = `${colour}|${who.size}|${who.mood}`;
		let look = looks.get(key);
		if (!look) {
			const body = new Busybody(colour, who.size);
			body.setMood(who.mood);
			const b = body.getLocalBounds();
			const frame = new Rectangle(Math.floor(b.x) - 2, Math.floor(b.y) - 2, Math.ceil(b.width) + 4, Math.ceil(b.height) + 4);
			const texture = renderer.generateTexture({ target: body, frame, resolution: RESOLUTION, antialias: true });
			look = { texture, anchor: { x: -frame.x / frame.width, y: -frame.y / frame.height } };
			looks.set(key, look);
			body.destroy({ children: true, context: true });
		}
		return look;
	};
	return (who) => new Placeholder(who, lookFor);
}
