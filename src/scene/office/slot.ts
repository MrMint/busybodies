// The narrow interface between the office and its characters. The office decides where everyone
// stands (a Slot: position, depth, facing) and who they are (Who); a character only draws itself.
// The placeholder in src/mainview/placeholder.ts implements this today; the mochi rig (S1) drops in
// by implementing the same Character and passing its factory to the Office.
import type { Container } from "pixi.js";
import type { Slot } from "../world/world";
import type { Cue, Who } from "../contract";

export type { Slot };

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
	/** Optional: take a cue from the director. */
	act?(cue: Cue): void;
	/** Optional: true while walking. The office lets each walker keep its own depth (walks run at
	 * the ambient 30 fps). */
	readonly moving?: boolean;
	/** Optional: life on or off (blinks and glances while the app is on screen; src/scene/rig/life.ts). */
	life?: boolean;
	/** Optional: true while life keeps it moving with nothing else to play. */
	readonly alive?: boolean;
	/** Optional: true when what it plays is ambient (an idle or finished character's habit, not a
	 * walk): the office draws that at the life rate, not the acting rate. */
	readonly ambient?: boolean;
	/** Optional: back to the start of its pose, settled (the inspector's freeze, so step(n) is the
	 * same however long the page ran first). */
	rewind?(): void;
	destroy(): void;
}

export type CharacterFactory = (who: Who) => Character;

