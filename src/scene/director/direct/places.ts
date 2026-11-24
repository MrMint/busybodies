
import type { Area, Slot, Floor } from "../../world/world";
import { crewPlaces } from "../../world/world";
import type { Actor } from "../types";
import type { Spec } from "./specs";

// --- Spots ----------------------------------------------------------------------------------------

/** Named common spots, in the order finished agents fill them (as S2's provisional placement did). */
const OUT_ORDER: [kind: Area["kind"], spot: string, from: number, to: number][] = [
	["kitchen", "queue", 0, 3],
	["lobby", "nap", 0, 1],
	["kitchen", "cooler", 0, 2],
	["kitchen", "queue", 3, 5],
	["lobby", "sofa", 0, 2],
	["kitchen", "sofa", 0, 2],
];

export interface Place {
	spot: string;
	area: string;
	slot: Slot;
}

function commonSpots(floor: Floor, kind: Area["kind"], name: string, from = 0, to = Infinity): Place[] {
	const area = floor.areas.find((a) => a.kind === kind);
	if (!area) return [];
	return (area.spots[name] ?? []).slice(from, to).map((slot, i) => ({ spot: `${area.id}:${name}:${from + i}`, area: area.id, slot }));
}

/** The lobby door, where people come in and go out. */
export function doorPlace(floor: Floor): Place | undefined {
	return commonSpots(floor, "lobby", "door")[0];
}

/** Give every spec a place: keep last time's if it still fits, then fill the rest in order. */
export function assign(list: Spec[], floor: Floor, prev: Record<string, Actor>): Map<string, Place> {
	const out = new Map<string, Place>();
	const taken = new Set<string>();
	const meeting = commonSpots(floor, "meeting", "seat");
	const outs = OUT_ORDER.flatMap(([k, n, a, b]) => commonSpots(floor, k, n, a, b));
	const crewTaken = new Map<string, Set<number>>();
	// Each desk's crew spots, spaced so their work shows, spilling into free cells nearby (or, in a
	// desk at the room's front, squeezing up so nobody stands outside the room): placed once every
	// crew member has its number, since the squeeze depends on how many there are.
	const crewAt: { key: string; desk: string; i: number }[] = [];
	const crewPlace = (s: Spec, i: number): Place | undefined => {
		const desk = floor.desks.get(s.session.id);
		if (!desk) return undefined;
		crewAt.push({ key: s.key, desk: desk.id, i });
		return { spot: `crew:${i}`, area: desk.areaId, slot: desk.lead };
	};
	const takeCrew = (s: Spec, i: number) => {
		const set = crewTaken.get(s.session.id) ?? new Set<number>();
		crewTaken.set(s.session.id, set);
		if (set.has(i)) return false;
		set.add(i);
		return true;
	};

	// Pass 1: leads at their desks, and anyone whose old spot still suits them.
	for (const s of list) {
		const desk = floor.desks.get(s.session.id);
		if (!desk) continue;
		if (s.place === "desk") {
			out.set(s.key, { spot: "desk", area: desk.areaId, slot: desk.lead });
			continue;
		}
		const was = prev[s.key];
		if (!was || was.gone) continue;
		// A builder off on a brick run keeps its crew spot for when it comes back.
		const spot = was.home ?? was.spot;
		if (s.place === "crew" && spot.startsWith("crew:") && was.session === s.session.id) {
			const i = Number(spot.slice(5));
			if (takeCrew(s, i)) out.set(s.key, crewPlace(s, i)!);
		} else if (s.place === "meeting" || s.place === "out") {
			const pool = s.place === "meeting" ? meeting : outs;
			const p = pool.find((x) => x.spot === was.spot);
			if (p && !taken.has(p.spot)) {
				taken.add(p.spot);
				out.set(s.key, p);
			}
		}
	}
	// Pass 2: everyone else takes the first free spot of their kind.
	for (const s of list) {
		if (out.has(s.key) || !floor.desks.get(s.session.id)) continue;
		if (s.place === "meeting" || s.place === "out") {
			const pool = s.place === "meeting" ? meeting : outs;
			const p = pool.find((x) => !taken.has(x.spot));
			if (p) {
				taken.add(p.spot);
				out.set(s.key, p);
				continue;
			}
		}
		// Around the desk (also the fallback when the common spots are full).
		let i = 0;
		while (!takeCrew(s, i)) i++;
		out.set(s.key, crewPlace(s, i)!);
	}
	const count = new Map<string, number>();
	for (const c of crewAt) count.set(c.desk, Math.max(count.get(c.desk) ?? 0, c.i + 1));
	const slots = new Map([...count].map(([id, n]) => [id, crewPlaces(floor, floor.desks.get(id)!, n)]));
	for (const c of crewAt) out.set(c.key, { ...out.get(c.key)!, slot: slots.get(c.desk)![c.i]! });
	return out;
}
