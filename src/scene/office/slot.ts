// The narrow interface between the office and its characters. The office decides where everyone
// stands (a Slot: position, depth, facing) and who they are (Who); a character only draws itself.
// The placeholder in src/mainview/placeholder.ts implements this today; the mochi rig (S1) drops in
// by implementing the same Character and passing its factory to the Office.
import type { Container } from "pixi.js";
import type { Slot } from "./world";
import type { LookAt } from "../rig/gaze";

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

/** A point in world pixels. */
export interface Point {
	x: number;
	y: number;
}

/** A walk: the points to follow, how long it takes, and whether the walker leaves at the end. */
export interface Walk {
	path: Point[];
	ms: number;
	/** Fade out at the end: the character is leaving through the door. */
	exit?: boolean;
	/** How far into the walk it already is, in ms (a cue sent mid-walk). */
	elapsed?: number;
}

/**
 * What the director (S4) asks a character to do: a pose, and maybe a walk to get there first. A
 * character that understands cues implements `act`; one that doesn't just stands at its slot.
 */
export interface Cue {
	/** Changes whenever the character must start over: a new pose, or the same pose again. */
	key: string;
	pose: string;
	/** Which part of a two-hander. */
	as: "lead" | "partner";
	/** Passes before holding the last frame; Infinity loops. */
	loops: number;
	/** `end`: start already played through (a character found mid-habit). */
	at: "start" | "end";
	/** Where it stands, by name: `desk`, `crew:3`, `meeting:seat:0`, `kitchen:queue:1`, `door`. */
	spot: string;
	walk?: Walk;
	/** How fast the pose's frames run (1 is as written). Changing it alone doesn't restart the pose. */
	tempo?: number;
	/** The pose played while walking (default `walk`): `carry` takes a brick to the crew's build. */
	walkPose?: string;
	/** How fast the walk's steps run, matching its pace (a jog 1.3, a run 1.65; pace.ts). The walk's
	 * `ms` already covers the ground at that pace. */
	walkTempo?: number;
	/** What to look at while the pose plays (rig/gaze.ts): another character's key, a world point
	 * (the YOU door), or `{ viewer: true }`, out of the screen. The character turns it into a look
	 * against its own facing; a frame with eyes on the work wins. Changing it alone doesn't restart
	 * the pose. */
	lookAt?: LookAt;
}
