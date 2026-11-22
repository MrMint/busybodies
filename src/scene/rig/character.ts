// The rig behind the office's Character interface (src/scene/office/slot.ts): one mochi puppet per
// character, acting out its mood until the director (S4) drives poses from real events.
import type { Character, CharacterFactory, Mood, Slot, Who } from "../office/slot";
import type { Atlas } from "./atlas";
import { choosePose, hash } from "./player";
import { Puppet } from "./puppet";
import { COSTUMES, roleFor } from "./roles";
import { ACCENTS } from "./theme";

/** A standing mochi is about this tall in rig units, ground to the top of the body. */
export const PUPPET_HEIGHT = 85;

const TRIGGER = { busy: "busy", idle: "idle", stalled: "stalled", done: "finished" } as const;

class RigCharacter implements Character {
	readonly puppet: Puppet;
	#who: Who;
	#facing: 1 | -1 = 1;

	constructor(atlas: Atlas, who: Who) {
		this.#who = who;
		const role = who.kind === "lead" ? "lead" : roleFor(who.role);
		// The office draws real desks, so the rig's own stays off.
		this.puppet = new Puppet(atlas, { id: who.key, role, accent: ACCENTS[hash(who.tint) % ACCENTS.length], desk: false });
		this.#size();
		this.#act(who.mood, true);
	}

	get view() {
		return this.puppet;
	}

	get animating(): boolean {
		return this.puppet.animating;
	}

	update(who: Who): void {
		const prev = this.#who;
		this.#who = who;
		if (who.size !== prev.size) this.#size();
		if (who.mood !== prev.mood) this.#act(who.mood, false);
	}

	place(slot: Slot): void {
		this.puppet.position.set(slot.x, slot.y);
		this.#facing = slot.facing;
		this.#size();
	}

	tick(dt: number): void {
		this.puppet.tick(dt);
	}

	rewind(): void {
		this.puppet.rewind();
	}

	inspect() {
		const s = this.puppet.state();
		return {
			mood: this.#who.mood,
			size: Math.round(this.#who.size),
			lift: Math.round(this.puppet.lift * 100) / 100,
			role: s.role,
			pose: s.pose,
			frame: s.frame,
			frames: s.frames,
			params: Object.entries(s.params)
				.map(([k, v]) => `${k}:${v}`)
				.join(" "),
		};
	}

	destroy(): void {
		this.puppet.destroy({ children: true });
	}

	#size(): void {
		const s = (this.#who.size / PUPPET_HEIGHT) * COSTUMES[this.puppet.role].scale;
		this.puppet.scale.set(s * this.#facing, s);
	}

	/** A character found idle is already mid-habit, settled, and costs nothing to draw; one that goes
	 * idle while watched plays its habit through, then settles. */
	#act(mood: Mood, first: boolean): void {
		this.puppet.play(choosePose(TRIGGER[mood], this.#who.key, this.puppet.role), { snap: first, at: first && mood !== "busy" ? "end" : "start" });
		this.puppet.alpha = mood === "done" ? 0.6 : 1;
	}
}

/** A factory of mochi characters drawing from `atlas`. */
export function rigCharacters(atlas: Atlas): CharacterFactory {
	return (who) => new RigCharacter(atlas, who);
}
