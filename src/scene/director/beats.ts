// Beats: how a model's personality (traits.ts) shows in its acting. A deliberate character takes a
// beat before an acted pose (`pauseMs`: the pose waits, the last one holds); a flamboyant one now
// and then adds a `flourish` after finishing something. Pure and deterministic: whether a flourish
// happens comes from the actor's key and when the finished pose started.
import { unit } from "../rig/player";
import type { Trait } from "./traits";
import type { Actor } from "./types";

/** An acted pose held back a beat. */
export interface Pending {
	pose: string;
	as: "lead" | "partner";
	trigger?: string;
	/** When it plays. */
	at: number;
}

export interface Acting {
	pose: string;
	as: "lead" | "partner";
	acted: boolean;
	trigger?: string;
}

export const BEATS = {
	/** A beat before these (two-handers, runs and errands keep their timing). */
	deferrable: new Set(["prOpened", "testFailed", "thumb", "stretch", "glance", "flourish", "stampRed"]),
	/** Finishing one of these may earn a flourish... */
	finishes: new Set(["prOpened", "celebrate", "handover", "stickyPost", "mailDrop", "bellRing"]),
	/** ...this often. */
	flourishShare: 0.5,
	flourish: "flourish",
} as const;

/**
 * The acted pose to play now, given a deliberate character's pause. A new acted pose for a
 * character with a pause is held back (the old pose holds, a wake is booked); when the beat is
 * over it plays, unless something newer took its place.
 */
export function beat(choice: Acting, live: Actor | undefined, continuing: Actor | undefined, pauseMs: number, now: number, wakes: number[]): { choice: Acting; pending?: Pending } {
	const p = live?.pending;
	if (p && !continuing) {
		if (now >= p.at) return choice.acted ? { choice } : { choice: { pose: p.pose, as: p.as, acted: true, trigger: p.trigger } };
		wakes.push(p.at);
		return { choice: { pose: live!.pose, as: live!.as, acted: false }, pending: p };
	}
	if (!live || continuing || !choice.acted || pauseMs <= 0 || !BEATS.deferrable.has(choice.pose)) return { choice };
	const at = now + pauseMs;
	wakes.push(at);
	return { choice: { pose: live.pose, as: live.as, acted: false }, pending: { pose: choice.pose, as: choice.as, trigger: choice.trigger, at } };
}

/** A flourish after finishing something, for a character whose trait has them, about half the time. */
export function flourishAfter(live: Actor | undefined, continuing: Actor | undefined, trait: Trait): string | undefined {
	if (!trait.flourish || !live || continuing || !live.acted || !BEATS.finishes.has(live.pose)) return undefined;
	return unit(`${live.key}|${live.poseSince}`, "flourish") < BEATS.flourishShare ? BEATS.flourish : undefined;
}
