import type { Floor } from "../../world/world";
import { pauseOf } from "../errands";
import { RUSH } from "../rush";
import { STATION_FOR, STATION_POSE, type StationKind } from "../../world/stations";
import { TRIP, type Trip, type Want, planTrips } from "../trips";
import type { Actor } from "../types";
import type { Work, WorkKind } from "../work";
import type { Spec } from "./specs";
import type { Place } from "./places";
import type { Choice } from "./choice";
import type { Runs } from "./builds";

/** What the director works out about each character before anyone moves. */
export interface Pre {
	/** The kind of work the tool in hand says, and the kind showing (held). */
	want?: WorkKind;
	work?: Work;
	news?: Choice;
	/** An acted pose still playing from last time. */
	continuing?: Actor;
	/** An acted pose to play now that the last one ended (the thumb after a red stamp). */
	follow?: string;
}

/** After a red stamp at the stamp desk: the thumb for a builder, the failed-test pose for anyone else. */
export function followUp(s: Spec, was: Actor | undefined, continuing: Actor | undefined): string | undefined {
	if (!was || continuing || !was.acted || was.pose !== STATION_POSE.test.bad) return undefined;
	return s.rig === "builder" ? "thumb" : "testFailed";
}

/** The station a crew member's work sends it to, if the tool in hand still says so. A shell
 * command or a test sends it to the copier or the stamp desk only while it runs. */
export function stationKind(s: Spec, p: Pre): StationKind | undefined {
	const w = p.work;
	if (!w || p.want !== w.kind) return undefined;
	const kind = STATION_FOR[w.kind];
	if (!kind) return undefined;
	if ((w.kind === "shell" || w.kind === "test") && !s.running) return undefined;
	return kind;
}

/**
 * Who goes to a station this time. A busy crew member at its crew spot (not carrying a brick, not
 * just hired) goes once its work kind has held for TRIP.holdMs; it stays while the kind holds, and
 * while it is mid-way through something acted there (a red stamp and the thumb after it).
 */
export function tripsFor(
	list: Spec[],
	pre: Map<string, Pre>,
	places: Map<string, Place>,
	before: Record<string, Actor>,
	floor: Floor,
	runs: Runs,
	hiredBy: Map<string, string>,
	now: number,
	wakes: number[],
	/** Sessions in rush: a held kind sends its crew sooner (rush.ts). */
	rushing: Set<string> = new Set(),
	/** Crew who don't go this time: handing a folder over, or handed one (handoff.ts). */
	skip: Set<string> = new Set(),
): Map<string, Trip> {
	const wants: Want[] = [];
	for (const s of list) {
		if (s.kind !== "crew" || !s.busy || s.mood !== "busy" || hiredBy.has(s.key) || skip.has(s.key)) continue;
		const place = places.get(s.key);
		const was = before[s.key];
		if (!place?.spot.startsWith("crew:") || !was || was.gone) continue;
		const r = runs.active.get(s.session.id);
		if (r?.key === s.key && r.carried && now < r.lands) continue;
		const stations = floor.areas.find((a) => a.id === place.area)?.stations ?? [];
		if (!stations.length) continue;
		const p = pre.get(s.key)!;
		const stay = was.trip !== undefined && (p.news !== undefined || p.continuing !== undefined || p.follow !== undefined);
		let kind = stationKind(s, p);
		// In a rush trips go sooner; a deliberate model takes a beat more before setting off (traits.ts).
		const hold = (rushing.has(s.session.id) ? RUSH.tripHoldMs : TRIP.holdMs) + pauseOf(s);
		if (kind && was.trip?.kind !== kind && now - p.work!.since < hold) {
			wakes.push(p.work!.since + hold);
			kind = undefined;
		}
		wants.push({ key: s.key, stations, kind, stay, was: was.trip, since: p.work?.since ?? now });
	}
	return planTrips(wants, now);
}
