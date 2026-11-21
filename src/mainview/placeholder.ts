// The placeholder Busybody behind the office's Character interface (src/scene/office/slot.ts),
// until the mochi rig (S1) provides its own factory.
import type { Slot } from "../scene/office/world";
import type { Character, CharacterFactory, Who } from "../scene/office/slot";
import { Busybody } from "./busybody";

const PALETTE = [0xff8fab, 0x8fd3ff, 0xffd166, 0x9be7a0, 0xc3a6ff, 0xffb38a, 0x7fe0d4, 0xf5a3e0];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

class Placeholder implements Character {
	#body: Busybody;
	#who: Who;

	constructor(who: Who) {
		this.#who = who;
		this.#body = Placeholder.#make(who);
	}

	static #make(who: Who): Busybody {
		const b = new Busybody(PALETTE[hash(who.tint) % PALETTE.length]!, who.size, (hash(who.key) % 628) / 100);
		b.setMood(who.mood);
		return b;
	}

	get view() {
		return this.#body;
	}

	get animating(): boolean {
		return this.#body.animating;
	}

	update(who: Who): void {
		if (who.size !== this.#who.size || who.tint !== this.#who.tint) {
			// A new size means a new drawing: swap the body in place.
			const old = this.#body;
			this.#body = Placeholder.#make(who);
			this.#body.position.copyFrom(old.position);
			this.#body.zIndex = old.zIndex;
			old.parent?.addChild(this.#body);
			old.destroy({ children: true });
		}
		this.#body.setMood(who.mood);
		this.#who = who;
	}

	place(slot: Slot): void {
		this.#body.position.set(slot.x, slot.y);
	}

	tick(dt: number): void {
		this.#body.tick(dt);
	}

	inspect() {
		return { mood: this.#who.mood, size: Math.round(this.#body.size), lift: Math.round(-this.#body.rig.y * 100) / 100, role: this.#who.role };
	}

	destroy(): void {
		this.#body.destroy({ children: true });
	}
}

export const placeholders: CharacterFactory = (who) => new Placeholder(who);
