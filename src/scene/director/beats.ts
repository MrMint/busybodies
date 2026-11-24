// Beats: how a model's personality (traits.ts) shows in its acting. A deliberate character takes a
// beat before an acted pose (`pauseMs`), and the beat is acting (plan-alive stream B): it plays its
// trait's `beat` pose through it (opus considers, chin on a hand; sonnet nods), or, with none, the
// last pose holds. A quick character overlaps: its acted pose counts as over `overlapMs` early, so
// the next one starts while the last frame is still settling. A flamboyant one now and then adds a
// `flourish` after finishing something. Pure and deterministic: whether a flourish happens comes
// from the actor's key and when the finished pose started.
import { unit } from "../rig/data/player";
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
	deferrable: new Set(["prOpened", "testFailed", "thumb", "stretch", "glance", "stampRed"]),
	/** A quick character cuts these short by its overlap: nothing else is timed on their end. */
	overlaps: new Set(["prOpened", "testFailed", "thumb", "stretch", "glance", "stampRed", "flourish"]),
	/** Finishing one of these may earn a flourish... */
	finishes: new Set(["prOpened", "celebrate", "handover", "stickyPost", "mailDrop", "bellRing"]),
	/** ...this often. */
	flourishShare: 0.5,
	flourish: "flourish",
} as const;

/** The part of a trait a beat needs. */
export type Pause = Pick<Trait, "pauseMs" | "beat">;

/**
 * The acted pose to play now, given a deliberate character's pause. A new acted pose for a
 * character with a pause is held back (a wake is booked) while it plays its beat pose, or holds the
 * old one; when the beat is over it plays, unless something newer took its place.
 */
export function beat(
	choice: Acting,
	live: Actor | undefined,
	continuing: Actor | undefined,
	pause: Pause,
	now: number,
	wakes: number[],
): { choice: Acting; pending?: Pending } {
	const p = live?.pending;
	const waiting = (): Acting => ({ pose: pause.beat ?? live!.pose, as: pause.beat ? "lead" : live!.as, acted: false });
	if (p && !continuing) {
		if (now >= p.at) return choice.acted ? { choice } : { choice: { pose: p.pose, as: p.as, acted: true, trigger: p.trigger } };
		wakes.push(p.at);
		return { choice: waiting(), pending: p };
	}
	if (!live || continuing || !choice.acted || pause.pauseMs <= 0 || !BEATS.deferrable.has(choice.pose)) return { choice };
	const at = now + pause.pauseMs;
	wakes.push(at);
	return { choice: waiting(), pending: { pose: choice.pose, as: choice.as, trigger: choice.trigger, at } };
}

/** How much sooner than its frames say an acted pose counts as over, for this character. */
export const overlapOf = (trait: Pick<Trait, "overlapMs">, pose: string): number => (BEATS.overlaps.has(pose) ? trait.overlapMs : 0);

/** A flourish after finishing something, for a character whose trait has them, about half the time. */
export function flourishAfter(live: Actor | undefined, continuing: Actor | undefined, trait: Trait): string | undefined {
	if (!trait.flourish || !live || continuing || !live.acted || !BEATS.finishes.has(live.pose)) return undefined;
	return unit(`${live.key}|${live.poseSince}`, "flourish") < BEATS.flourishShare ? BEATS.flourish : undefined;
}
