// Errands: walks that metrics send people on (plan-next stream B). Pure and deterministic.
//
//   shred    a compaction: the lead walks its in-tray to the room's shredder, feeds it in, walks back
//   sticky   a todo done: a crew member (or the lead) walks the note to the room's planner, posts it
//   queue    waiting on you: the lead takes a ticket and queues at your office, in the order the
//            waits started; the first one in rings the bell; answered, it walks back to its desk
//
// An errand is kept on the actor: it sets off at `since` (after the character's pause, traits.ts),
// arrives `walkMs` later, plays its pose until `until`, then the director walks it home as it
// would anyone whose spot changed.
import { plannerNote, posterFor } from "../world/rigpoints";
import { type Slot, type Floor, shredderUse } from "../world/world";
import { poseMs } from "../rig/data/poses";
import type { Session } from "../../watcher/model";
import type { Metrics, Ticket } from "./metrics";
import { pathBetween, walkMs } from "../world/paths";
import { STATION_POSE } from "../world/stations";
import { traitOf } from "./traits";
import type { Actor } from "./types";

export const ERRANDS = {
	/** Feeding the shredder lasts this many turns of the `shred` loop. */
	shredLoops: 2,
	/** The pose walked in to the planner, and played there. */
	stickyWalk: "stickyCarry",
	stickyPose: "stickyPost",
	/** At your door: holding a ticket (the first, polite stage of WAITING), and the first one in ringing the bell. */
	ticketPose: "ticketPolite",
	bellPose: "bellRing",
} as const;

export interface Place {
	spot: string;
	area: string;
	slot: Slot;
}

export interface Errand {
	kind: "shred" | "sticky";
	session: string;
	/** Where it goes. */
	spot: string;
	area: string;
	slot: Slot;
	/** When the walk sets off: a deliberate character takes a beat first. */
	since: number;
	walkMs: number;
	/** When the act there is over and it walks back. */
	until: number;
	pose: string;
	walkPose?: string;
	/** The spot it goes back to (a crew spot; a lead goes back to its desk). */
	from: string;
	/** The station it uses, for the shredder. */
	station?: string;
}

/** The facts about a character an errand needs (the director's Spec has them all). */
export interface Member {
	key: string;
	kind: "lead" | "crew";
	session: Session;
	agent?: { id: string; family?: Session["family"] };
	busy: boolean;
	mood: string;
	size: number;
	seen: { waiting?: number };
}

const familyOf = (m: Member) => (m.kind === "lead" ? m.session.family : m.agent?.family);
export const pauseOf = (m: Member): number => traitOf(familyOf(m)).pauseMs;

export const errandPlace = (e: Errand): Place => ({ spot: e.spot, area: e.area, slot: e.slot });

/** True from when an errand sets off until it is done there. */
export const errandUnderWay = (e: Errand | undefined, now: number): e is Errand => !!e && now >= e.since && now < e.until;

/** Errands carried over from last time, still to do or under way; wakes for each of their turns. */
export function ongoingErrands(before: Record<string, Actor>, now: number, wakes: number[]): Map<string, Errand> {
	const out = new Map<string, Errand>();
	for (const [key, a] of Object.entries(before)) {
		const e = a.errand;
		if (!e || a.gone !== undefined || now >= e.until) continue;
		out.set(key, e);
		for (const t of [e.since, e.since + e.walkMs, e.until]) if (t > now) wakes.push(t);
	}
	return out;
}

const still = (a: Actor | undefined, now: number) => !!a && a.gone === undefined && !(a.walk && now < a.walk.since + a.walk.ms);

export interface NewErrands {
	list: Member[];
	places: Map<string, Place>;
	before: Record<string, Actor>;
	floor: Floor;
	/** Last direction's metrics: what each desk had seen. */
	metrics: Metrics;
	ongoing: Map<string, Errand>;
	/** Anyone already off somewhere this direction (a trip, a brick run, a round). */
	busyElsewhere: Set<string>;
	now: number;
	first: boolean;
	/** Walk speed for a member (a multiple of the stroll): its heat pace times its trait. */
	speed: (m: Member) => number;
}

/** Errands that start now: a lead's trip to the shredder, a note walked to the planner. */
export function newErrands(x: NewErrands): Map<string, Errand> {
	const out = new Map<string, Errand>();
	if (x.first) return out;
	const taken = new Set([...x.ongoing.values()].map((e) => e.station).filter(Boolean));
	const errandFor = (key: string) => out.get(key) ?? x.ongoing.get(key);
	const go = (m: Member, kind: Errand["kind"], to: Place, pose: string, actMs: number, extra: Partial<Errand>) => {
		const from = x.places.get(m.key)!;
		const was = x.before[m.key]!;
		const path = pathBetween(x.floor, from.area, { x: was.slot.x, y: was.slot.y }, to.area, to.slot);
		const ms = walkMs(path, x.speed(m));
		const since = x.now + pauseOf(m);
		out.set(m.key, { kind, session: m.session.id, ...to, since, walkMs: ms, until: since + ms + actMs, pose, from: from.spot, ...extra });
	};

	for (const lead of x.list) {
		if (lead.kind !== "lead") continue;
		const s = lead.session;
		const desk = x.metrics.desks[s.id];
		const place = x.places.get(lead.key);
		if (!desk || !place) continue;
		const atDesk = (m: Member) =>
			x.places.get(m.key)?.spot === "desk" && m.seen.waiting === undefined && still(x.before[m.key], x.now) && !errandFor(m.key);

		// A compaction: the lead takes the in-tray to the shredder.
		if ((s.compactions?.count ?? 0) > desk.compactions && atDesk(lead)) {
			const st = x.floor.areas.find((a) => a.id === place.area)?.shredder;
			if (st && !taken.has(st.id)) {
				taken.add(st.id);
				go(
					lead,
					"shred",
					{ spot: `station:${st.id}`, area: st.areaId, slot: shredderUse(st, lead.size) },
					STATION_POSE.shredder.work,
					poseMs(STATION_POSE.shredder.work) * ERRANDS.shredLoops,
					{ station: st.id },
				);
			}
		}

		// A todo done: a note walks to the planner (one at a time per session).
		const done = s.todos?.done ?? 0;
		if (desk.todos && done > desk.todos.done && ![...x.ongoing.values(), ...out.values()].some((e) => e.kind === "sticky" && e.session === s.id)) {
			const board = x.floor.areas.find((a) => a.id === place.area)?.wall.find((w) => w.kind === "planner");
			if (!board) continue;
			const crew = x.list
				.filter((m) => m.kind === "crew" && m.session.id === s.id && m.busy && m.mood === "busy" && !x.busyElsewhere.has(m.key) && !errandFor(m.key))
				.filter((m) => x.places.get(m.key)?.spot.startsWith("crew:") && still(x.before[m.key], x.now))
				.sort((a, b) => (a.key < b.key ? -1 : 1));
			const who = crew[0] ?? (atDesk(lead) && !x.busyElsewhere.has(lead.key) ? lead : undefined);
			// It stands so the note it presses on lands in the DONE column (the rig's PLANNER point).
			const feet = who && posterFor(plannerNote(board.rect), who.size);
			if (who && feet)
				go(
					who,
					"sticky",
					{ spot: `planner:${s.id}`, area: place.area, slot: { ...feet, depth: feet.y, facing: 1 } },
					ERRANDS.stickyPose,
					poseMs(ERRANDS.stickyPose),
					{ walkPose: ERRANDS.stickyWalk },
				);
		}
	}
	return out;
}

// --- Your office ---------------------------------------------------------------------------------

export interface Queue {
	/** Where each queuing lead stands (leads past the end of the line wait at their desks). */
	places: Map<string, Place & { k: number }>;
	tickets: Record<string, Ticket>;
	next: number;
	serving?: number;
}

/**
 * Who queues at your office: every lead waiting on you takes a ticket, numbered in the order the
 * waits started (then by key), and keeps it for the whole wait. The line is in ticket order, so
 * when one is answered the rest shuffle up. The first ticket into an empty office rings the bell.
 */
export function queueUp(list: Member[], floor: Floor, was: Metrics): Queue {
	const area = floor.areas.find((a) => a.kind === "yours");
	const line = area?.spots.line ?? [];
	const waiting = list.filter((m) => m.kind === "lead" && m.seen.waiting !== undefined && floor.desks.has(m.session.id));
	const tickets: Record<string, Ticket> = {};
	let next = was.next;
	const fresh: Member[] = [];
	for (const m of waiting) {
		const t = was.tickets[m.key];
		if (t && t.since === m.seen.waiting) tickets[m.key] = t;
		else fresh.push(m);
	}
	fresh.sort((a, b) => a.seen.waiting! - b.seen.waiting! || (a.key < b.key ? -1 : 1));
	for (const m of fresh) {
		const empty = Object.keys(tickets).length === 0;
		tickets[m.key] = { n: next++, since: m.seen.waiting!, bell: empty };
	}
	const order = Object.entries(tickets).sort((a, b) => a[1].n - b[1].n);
	const places = new Map<string, Place & { k: number }>();
	if (area)
		order.forEach(([key], k) => {
			if (k < line.length) places.set(key, { spot: `${area.id}:line:${k}`, area: area.id, slot: line[k]!, k });
		});
	return { places, tickets, next, ...(order.length ? { serving: order[0]![1].n } : {}) };
}

/**
 * Waiting gets worse the longer you leave it (plan-alive stream B): polite with the ticket held up,
 * then a look at the door and a tapping foot, then a sigh and a word with the one behind (only with
 * someone there; alone it keeps tapping), then a slump with the ticket drooping. By time since the
 * wait started, so an office opened mid-wait shows how long it has been.
 */
export const WAITING = {
	stages: [
		{ fromMs: 0, pose: ERRANDS.ticketPose },
		{ fromMs: 45_000, pose: "ticketWait" },
		{ fromMs: 120_000, pose: "ticketChat", behind: true },
		{ fromMs: 300_000, pose: "ticketSlump" },
	],
} as const;

/** The pose for a wait that started at `since`, at `now`, and when it next gets worse. */
export function waitStage(since: number, now: number, behind: boolean): { pose: string; stage: number; next?: number } {
	const stages = WAITING.stages;
	let k = 0;
	for (let i = 0; i < stages.length; i++) if (now - since >= stages[i]!.fromMs) k = i;
	let pose: string = stages[k]!.pose;
	// Nobody behind to talk to: the stage before it.
	if ("behind" in stages[k]! && !behind) pose = stages[k - 1]!.pose;
	const after = stages[k + 1];
	return { pose, stage: k, ...(after ? { next: since + after.fromMs } : {}) };
}

/** What a lead in the queue plays: the bell once (the first one in, when it gets to the counter),
 * then holding its ticket, more fed up the longer it waits; and when that next changes. */
export function atYourDoor(
	t: Ticket,
	k: number,
	was: Actor | undefined,
	spot: string,
	continuing: Actor | undefined,
	now: number,
	behind = false,
): { pose: string; acted: boolean; rang?: number; next?: number } {
	if (continuing?.pose === ERRANDS.bellPose) return { pose: ERRANDS.bellPose, acted: true };
	const arrived = k === 0 && was !== undefined && was.spot === spot && still(was, now);
	if (t.bell && t.rang === undefined && arrived) return { pose: ERRANDS.bellPose, acted: true, rang: now };
	const w = waitStage(t.since, now, behind);
	return { pose: w.pose, acted: false, ...(w.next !== undefined ? { next: w.next } : {}) };
}
