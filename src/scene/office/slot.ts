// The narrow interface between the office and its characters. The office decides where everyone
// stands (a Slot: position, depth, facing) and who they are (Who); a character only draws itself.
// The placeholder in src/mainview/placeholder.ts implements this today; the mochi rig (S1) drops in
// by implementing the same Character and passing its factory to the Office.
import type { Container } from "pixi.js";
import type { Slot } from "./world";

export type { Slot };

export type Mood = "busy" | "idle" | "stalled" | "done";

/** Who stands in a slot. Everything a character needs to choose its look and pose. */
export interface Who {
	/** Stable for the character's life: "s:<session id>" or "a:<session id>:<agent id>". */
	key: string;
	kind: "lead" | "crew";
	/** The agent's role ("scout", "reviewer", ...), or "lead". */
	role: string;
	mood: Mood;
	/** Height in world pixels. */
	size: number;
	/** A key to pick a colour from, so one project's leads match: the project, or the role. */
	tint: string;
}

export interface Character {
	/** Added to the office's depth-sorted layer. The office sets its zIndex from the slot's depth. */
	readonly view: Container;
	/** True while it has frames to play; the office keeps the ticker running while any is. */
	readonly animating: boolean;
	/** Same key, new facts: change mood, size or look. */
	update(who: Who): void;
	/** Stand here. Position the view's origin at the feet and face the slot's way. */
	place(slot: Slot): void;
	/** Advance one frame; `dt` is in 60 fps frames (1 is 1/60 s). */
	tick(dt: number): void;
	/** What the inspector reports about this character, besides its key and position. */
	inspect(): Record<string, string | number>;
	/** Optional: back to the start of its pose, settled (the inspector's freeze, so step(n) is the
	 * same however long the page ran first). */
	rewind?(): void;
	destroy(): void;
}

export type CharacterFactory = (who: Who) => Character;
