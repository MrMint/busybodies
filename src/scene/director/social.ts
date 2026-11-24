// The social layer (plan-alive stream A): who looks at whom, and the small reactions that come with
// it. Pure and deterministic, like the rest of the director.
//
//   ripple    a red test (or a teammate finishing) makes the crew look up at whoever it was, the
//             nearest first, the rest after RIPPLE.msPer60px for each 60 px further away
//   round     the foreman's round both ways: the lead looks at the one it visits, who looks up at it
//   door      waiting leads look at the YOU door
//   hand-off  the taker looks up when the giver is HANDOFF_LOOK.lookMs out, raises a hand before contact
//   kitchen   finished crew in the kitchen's coffee line pair up facing each other
//   notice    back on screen after a while away (the director's `view`), idle characters look up
//             at you, one waves, and waiting leads hold their tickets up
//
// `looksFor` turns the world into each actor's `lookAt`, which the cue carries to the character
// (rig/data/gaze.ts turns it into a look against its facing).
import type { LookAt } from "../rig/data/gaze";
import { hash } from "../rig/data/player";
import type { Area, Slot, Floor } from "../world/world";
import type { HandOff } from "./handoff";
import type { Actor } from "./types";

/** What the director knows about the viewer (main.ts feeds it from page visibility). */
export interface View {
	/** When the window came back on screen after a while away (director time). */
	back?: number;
	/** When it went off screen before that (director time): "while you were out" (story.ts). */
	since?: number;
}

export const RIPPLE = {
	/** The glance starts this much later for each 60 px further from the news than the nearest. */
	msPer60px: 180,
	/** No glance waits longer than this. */
	maxMs: 1500,
} as const;

/** How long after the nearest glancer each glancer looks up: `dist` from the news, `nearest` the
 * nearest glancer's distance. */
export function rippleDelay(dist: number, nearest: number): number {
	return Math.min(RIPPLE.maxMs, Math.round(((Math.max(0, dist - nearest) / 60) * RIPPLE.msPer60px) / 10) * 10);
}

export const HANDOFF_LOOK = {
	/** The taker looks up at the giver this long before it gets there... */
	lookMs: 1500,
	/** ...and raises a hand this long before (`handReady`'s length: it holds the raised hand). */
	readyMs: 520,
	pose: "handReady",
} as const;

/** When a taker starts to raise its hand for this hand-off, if it is in that window now. */
export function readyAt(handoffs: Record<string, HandOff>, key: string, now: number): number | undefined {
	const h = Object.values(handoffs).find((x) => x.taker === key);
	if (!h) return undefined;
	const at = h.meets - HANDOFF_LOOK.readyMs;
	return now >= at && now < h.meets ? at : undefined;
}

/** The wakes a hand-off needs for its anticipation: the look up, then the hand. */
export const handOffWakes = (h: HandOff): number[] => [h.meets - HANDOFF_LOOK.lookMs, h.meets - HANDOFF_LOOK.readyMs];

export const NOTICE = {
	/** Away at least this long before coming back counts (main.ts measures it). */
	awayMs: 45_000,
	/** A direction this soon after coming back still starts the notice. */
	freshMs: 1500,
	/** Lookers start a beat apart: one of this many slots... */
	slots: 3,
	/** ...this far apart. The one who waves goes on the second. */
	slotMs: 260,
	look: "lookUp",
	wave: "wave",
	ticket: "ticketHigh",
} as const;

export const NOTICE_POSES: ReadonlySet<string> = new Set([NOTICE.look, NOTICE.wave, NOTICE.ticket]);

/** The return the director should act on now, if any. */
export function freshReturn(view: View | undefined, now: number): number | undefined {
	const b = view?.back;
	return b !== undefined && now >= b && now - b < NOTICE.freshMs ? b : undefined;
}

/** Who waves: one of the lookers, picked from their keys and the moment. */
export function waverOf(keys: string[], back: number): string | undefined {
	let best: string | undefined;
	let low = Infinity;
	for (const k of keys) {
		const h = hash(`${k}|${back}|wave`);
		if (h < low) {
			low = h;
			best = k;
		}
	}
	return best;
}

/** How long after coming back a looker looks up. */
export function noticeDelay(key: string, back: number, waves: boolean): number {
	if (waves) return NOTICE.slotMs;
	return (hash(`${key}|${back}|notice`) % NOTICE.slots) * NOTICE.slotMs;
}

/** The YOU door's middle, at about face height for someone looking at it from the floor. */
export function youDoor(floor: Floor): { x: number; y: number } | undefined {
	const area = floor.areas.find((a) => a.kind === "yours");
	const door = area?.wall.find((w) => w.kind === "you");
	return door ? { x: Math.round(door.rect.x + door.rect.w / 2), y: Math.round(door.rect.y + door.rect.h * 0.5) } : undefined;
}

/**
 * Finished crew in the kitchen's coffee line pair up facing each other: spots 0 and 1 make a pair,
 * 2 and 3, and so on; one left without its partner keeps facing the counter. Spot names don't
 * change, only which way each one faces.
 */
export function pairUp(places: Map<string, { spot: string; area: string; slot: Slot }>, kitchen: Area | undefined): void {
	if (!kitchen) return;
	const prefix = `${kitchen.id}:queue:`;
	const at = new Map<number, string>();
	for (const [key, p] of places) if (p.spot.startsWith(prefix)) at.set(Number(p.spot.slice(prefix.length)), key);
	for (const [i, key] of at) {
		const mate = i % 2 === 0 ? i + 1 : i - 1;
		if (!at.has(mate)) continue;
		const p = places.get(key)!;
		const facing: 1 | -1 = i % 2 === 0 ? 1 : -1;
		if (p.slot.facing !== facing) places.set(key, { ...p, slot: { ...p.slot, facing } });
	}
}

export interface LookFacts {
	now: number;
	floor: Floor;
	handoffs: Record<string, HandOff>;
	/** Two-handers and celebrations: each one looks at the other. */
	pairs: Map<string, string>;
}

const walking = (a: Actor, now: number) => !!a.walk && now < a.walk.since + a.walk.ms;

/**
 * What each actor looks at, by key (actors not in the map look where their pose looks). In order:
 * nobody aims while walking; noticing you looks out of the screen; a glance looks at whoever it is
 * for; a hand-off's two look at each other (the taker from `lookMs` before the giver arrives); the
 * foreman looks at the one it visits; pairs look at each other; a waiting lead looks at the YOU door.
 */
export function looksFor(actors: Record<string, Actor>, x: LookFacts): Map<string, LookAt> {
	const out = new Map<string, LookAt>();
	const door = youDoor(x.floor);
	const takerOf = new Map(Object.values(x.handoffs).map((h) => [h.taker, h]));
	for (const a of Object.values(actors)) {
		if (a.gone !== undefined || walking(a, x.now)) continue;
		const there = (k: string | undefined) => (k && actors[k] && actors[k]!.gone === undefined ? k : undefined);
		let at: LookAt | undefined;
		if (NOTICE_POSES.has(a.pose)) at = { viewer: true };
		else if (a.pose === "glance") at = there(a.reactTo);
		else if (Object.hasOwn(x.handoffs, a.key) && x.now >= x.handoffs[a.key]!.meets) at = there(x.handoffs[a.key]!.taker);
		else if (takerOf.has(a.key) && x.now >= takerOf.get(a.key)!.meets - HANDOFF_LOOK.lookMs) at = there(takerOf.get(a.key)!.giver);
		else if (/^(visit|dash):/.test(a.spot)) at = there(a.spot.slice(a.spot.indexOf(":") + 1));
		else if (x.pairs.has(a.key)) at = there(x.pairs.get(a.key));
		else if (a.kind === "lead" && a.seen.waiting !== undefined && a.pose !== "bellRing" && door) at = door;
		if (at !== undefined) out.set(a.key, at);
	}
	return out;
}
