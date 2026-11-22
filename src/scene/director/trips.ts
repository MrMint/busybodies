// Trips: a busy crew member whose held work kind has a station walks to it, works there, and walks
// back to its crew spot when its work changes (plan-next stream C). One user per station; the next
// ones queue beside it, and anyone who finds every station and queue of its kind full stays at its
// bench. Pure and deterministic: who goes first is decided by when its kind started, then its key.
import { type Station, useFor } from "../office/world";
import type { StationKind } from "./stations";

/** A crew member's trip, kept on the actor between directions. */
export interface Trip {
	/** The station's id (`<area>:<kind>:<n>`). */
	station: string;
	kind: StationKind;
	/** 0: using it. k: k-th in its queue. */
	queue: number;
	/** When it got to this station (or its queue). */
	since: number;
}

export const TRIP = {
	/** A kind must have shown this long (and still be the tool in hand) before anyone walks for it:
	 * the work hold, so a single Read never sends anyone across the room. */
	holdMs: 6_000,
	/** What a queuer plays while it waits: a clipboard, a tapping foot, a lean to look past the one ahead. */
	queuePose: "queueWait",
} as const;

/** One crew member's claim on a station this direction. */
export interface Want {
	key: string;
	/** The stations it may use: its own room's. */
	stations: Station[];
	/** The kind of station its held work wants, if any. */
	kind?: StationKind;
	/** Keep last time's trip as it is (it is mid-way through something acted there). */
	stay?: boolean;
	/** Its trip last time. */
	was?: Trip;
	/** When its work kind started: earlier goes first. */
	since: number;
}

const order = (a: { t: number; key: string }, b: { t: number; key: string }) => a.t - b.t || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Every trip this direction, by actor key. */
export function planTrips(wants: Want[], now: number): Map<string, Trip> {
	const out = new Map<string, Trip>();
	const users = new Map<string, string>();
	const queues = new Map<string, string[]>();
	const byId = new Map(wants.flatMap((w) => w.stations).map((s) => [s.id, s]));
	const use = (w: Want, st: Station) => {
		users.set(st.id, w.key);
		out.set(w.key, { station: st.id, kind: st.kind, queue: 0, since: w.was?.station === st.id && w.was.queue === 0 ? w.was.since : now });
	};
	const wait = (w: Want, st: Station) => {
		const q = queues.get(st.id) ?? [];
		q.push(w.key);
		queues.set(st.id, q);
		out.set(w.key, { station: st.id, kind: st.kind, queue: q.length, since: w.was?.station === st.id ? w.was.since : now });
	};
	const kindOf = (w: Want) => (w.stay ? w.was?.kind : w.kind);
	const live = wants.filter((w) => kindOf(w) !== undefined);

	// Whoever was using a station keeps it while its work still wants that kind (or it is mid-act).
	const rest: Want[] = [];
	for (const w of [...live].sort((a, b) => order({ t: a.since, key: a.key }, { t: b.since, key: b.key }))) {
		const st = w.was && w.was.queue === 0 && w.was.kind === kindOf(w) ? byId.get(w.was.station) : undefined;
		if (st && !users.has(st.id)) use(w, st);
		else rest.push(w);
	}
	// Then the queue, in the order it formed, then newcomers in the order their work started.
	const queued = (w: Want) => w.was !== undefined && w.was.queue > 0 && w.was.kind === kindOf(w);
	const line = rest.filter(queued).sort((a, b) => a.was!.since - b.was!.since || a.was!.queue - b.was!.queue || order({ t: 0, key: a.key }, { t: 0, key: b.key }));
	const fresh = rest.filter((w) => !queued(w)).sort((a, b) => order({ t: a.since, key: a.key }, { t: b.since, key: b.key }));
	for (const w of [...line, ...fresh]) {
		const kind = kindOf(w)!;
		const mine = w.was && w.was.kind === kind ? byId.get(w.was.station) : undefined;
		const options = w.stations.filter((s) => s.kind === kind);
		const free = (mine && !users.has(mine.id) ? mine : undefined) ?? options.find((s) => !users.has(s.id));
		if (free) {
			use(w, free);
			continue;
		}
		const room = (s: Station) => (queues.get(s.id)?.length ?? 0) < s.queue.length;
		const shortest = (mine && room(mine) ? mine : undefined) ?? options.filter(room).sort((a, b) => (queues.get(a.id)?.length ?? 0) - (queues.get(b.id)?.length ?? 0))[0];
		if (shortest) wait(w, shortest);
	}
	return out;
}

/** Where a trip stands: the station's use spot (for a user `size` px tall), or its queue slot. */
export function tripPlace(t: Trip, st: Station, size: number): { spot: string; area: string; slot: Station["use"] } {
	return t.queue === 0
		? { spot: `station:${st.id}`, area: st.areaId, slot: useFor(st, size) }
		: { spot: `queue:${st.id}:${t.queue - 1}`, area: st.areaId, slot: st.queue[t.queue - 1]! };
}
