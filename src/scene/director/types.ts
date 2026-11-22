// The director's words: who is on stage, what each one is doing, and what changed. Pure data, so a
// world can be compared, logged and replayed.
import type { Cue, Mood, Walk, Who } from "../office/slot";
import type { Slot } from "../office/world";

export type { Cue, Walk };

export interface Actor {
	key: string;
	kind: Who["kind"];
	/** The session it belongs to (a lead's own). */
	session: string;
	/** The agent's id, for crew. */
	agent?: string;
	/** Who hired it: the lead's or the parent agent's key. */
	boss?: string;
	/** The agent type ("scout", "reviewer", ...), or "lead". */
	role: string;
	mood: Mood;
	size: number;
	tint: string;
	area: string;
	spot: string;
	slot: Slot;
	pose: string;
	as: "lead" | "partner";
	/** When the pose started (ms). An acted pose holds until its frames run out. */
	poseSince: number;
	/** A one-off acted pose (failed test, PR, handover...), as opposed to the standing pose for the mood. */
	acted: boolean;
	at: "start" | "end";
	/** A walk in progress: started at `since`. */
	walk?: Walk & { since: number };
	/** Leaving the office: gone once this time passes. */
	gone?: number;
	/** What the director last saw, to tell a new event from the same state. */
	seen: Seen;
	/** How many times each trigger has fired for this actor: seeds rare variants. */
	count: Record<string, number>;
}

/** The signals an actor's pose is chosen from, as last seen. */
export interface Seen {
	waiting?: number;
	failAt?: number;
	prs: number[];
	compactAt?: number;
	apiRetryAt?: number;
	repeats?: number;
	hires: string[];
}

/** Everyone on stage, by key. */
export interface World {
	at: number;
	actors: Record<string, Actor>;
}

export type WorldEvent =
	| { type: "arrive"; key: string; at: number; spot: string; area: string; walk: boolean }
	| { type: "leave"; key: string; at: number }
	| { type: "walk"; key: string; at: number; from: string; to: string; ms: number }
	| { type: "pose"; key: string; at: number; pose: string; as: "lead" | "partner"; acted: boolean }
	| { type: "handover"; key: string; at: number; to: string }
	| { type: "review"; key: string; at: number; state: "start" | "end" }
	| { type: "waiting"; key: string; at: number; state: "start" | "end"; area: string };
