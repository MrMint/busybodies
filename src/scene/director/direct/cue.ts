import type { Floor } from "../../world/world";
import { crewSpots } from "../../world/world";
import { POSE, poseMs } from "../../rig/data/poses";
import { PACE } from "../pace";
import { type Point, along } from "../../world/paths";
import type { Trip } from "../trips";
import type { Actor, Cue } from "../types";
import { faceFront, inCrowd } from "../../world/world";
import { pairUp, rippleDelay } from "../social";
import type { Spec } from "./specs";
import type { Place } from "./places";

/** Where an actor is at `now`: partway along its walk, or at its slot. */
export function here(a: Actor, now: number): Point {
	if (a.walk && now < a.walk.since + a.walk.ms) {
		const p = along(a.walk.path, now - a.walk.since, a.walk.ms);
		return { x: p.x, y: p.y };
	}
	return { x: a.slot.x, y: a.slot.y };
}

/** What a character is told to do: its cue. The key changes whenever it must start over. */
export function cueFor(a: Actor, now: number): Cue {
	const pose = POSE[a.pose];
	const loops = pose?.play === "loop" ? Infinity : 1;
	const walk = a.walk && now < a.walk.since + a.walk.ms ? a.walk : undefined;
	return {
		key: `${a.pose}|${a.as}|${a.poseSince}|${walk ? walk.since : ""}`,
		pose: a.pose,
		as: a.as,
		loops,
		at: a.at,
		spot: a.spot,
		...(walk ? { walk: { path: walk.path, ms: walk.ms, exit: walk.exit, elapsed: now - walk.since } } : {}),
		...(a.tempo !== 1 ? { tempo: a.tempo } : {}),
		...(walk && a.walkPose ? { walkPose: a.walkPose } : {}),
		...(walk && (a.pace || a.stride) ? { walkTempo: Math.round((a.pace ? PACE.speed[a.pace] : 1) * (a.stride ?? 1) * 100) / 100 } : {}),
		...(a.lookAt !== undefined ? { lookAt: a.lookAt } : {}),
	};
}

// --- The social layer's director side (plan-alive stream A; the rules are in social.ts) -----------

/**
 * Staging: crew in a desk's crowd (past the spaced spots) whose spot stands just behind another's
 * turn to face it (world/world.ts `faceFront`); finished crew in the kitchen's coffee line pair up
 * facing each other (`pairUp`). Only facing changes, so nobody walks for it.
 */
export function stage(list: Spec[], places: Map<string, Place>, floor: Floor): void {
	const byDesk = new Map<string, string[]>();
	for (const s of list) {
		const p = places.get(s.key);
		if (s.kind !== "crew" || !p?.spot.startsWith("crew:")) continue;
		byDesk.set(s.session.id, [...(byDesk.get(s.session.id) ?? []), s.key]);
	}
	for (const [id, keys] of byDesk) {
		const desk = floor.desks.get(id);
		if (!desk || keys.length < 2) continue;
		const spots = crewSpots(floor, desk);
		const turned = faceFront(keys.map((k) => ({ slot: places.get(k)!.slot, turn: inCrowd(spots, Number(places.get(k)!.spot.slice(5))) })));
		keys.forEach((k, i) => {
			const p = places.get(k)!;
			if (turned[i] !== p.slot) places.set(k, { ...p, slot: turned[i]! });
		});
	}
	pairUp(
		places,
		floor.areas.find((a) => a.kind === "kitchen"),
	);
}

/** For each crew member startled by news (a red test, a teammate finishing): who it looks at (the
 * nearest one the news is about) and how long after the nearest glancer it looks up. */
export function rippleFor(
	list: Spec[],
	startled: Map<string, Set<string>>,
	places: Map<string, Place>,
	before: Record<string, Actor>,
	now: number,
): Map<string, { to: string; delay: number }> {
	const out = new Map<string, { to: string; delay: number }>();
	for (const [session, news] of startled) {
		const from = [...news]
			.map((k) => ({ key: k, at: before[k] ? here(before[k]!, now) : places.get(k)?.slot }))
			.filter((n): n is { key: string; at: Point } => !!n.at);
		if (!from.length) continue;
		const near: { key: string; to: string; d: number }[] = [];
		for (const s of list) {
			if (s.session.id !== session || s.kind !== "crew" || s.mood !== "busy" || news.has(s.key)) continue;
			const p = places.get(s.key)?.slot;
			if (!p) continue;
			let best = from[0]!;
			let d = Infinity;
			for (const n of from) {
				const dn = Math.hypot(n.at.x - p.x, n.at.y - p.y);
				if (dn < d) {
					d = dn;
					best = n;
				}
			}
			near.push({ key: s.key, to: best.key, d });
		}
		const nearest = Math.min(...near.map((n) => n.d));
		for (const n of near) out.set(n.key, { to: n.to, delay: rippleDelay(n.d, nearest) });
	}
	return out;
}

/**
 * The foreman's round, the crew's side: when its lead gets to it (`visit:` or `dash:` its key), a
 * busy crew member at its spot looks up at it, once, from the moment the lead arrives. Leads are
 * directed before their crew, so this direction's lead is already in `actors`.
 */
export function roundFor(
	s: Spec,
	actors: Record<string, Actor>,
	before: Record<string, Actor>,
	places: Map<string, Place>,
	trip: Trip | undefined,
	continuing: Actor | undefined,
	now: number,
	wakes: number[],
): { lead: string; at: number } | undefined {
	if (s.kind !== "crew" || s.mood !== "busy" || trip || !places.get(s.key)?.spot.startsWith("crew:")) return undefined;
	const lead = `s:${s.session.id}`;
	const a = actors[lead];
	if (!a || a.spot.slice(a.spot.indexOf(":") + 1) !== s.key || !/^(visit|dash):/.test(a.spot)) return undefined;
	if (a.walk && now < a.walk.since + a.walk.ms) {
		wakes.push(a.walk.since + a.walk.ms);
		return undefined;
	}
	// It arrived at the end of last time's walk; already looking up, it carries on.
	const w = before[lead]?.walk;
	const at =
		continuing?.pose === "glance" && continuing.reactTo === lead
			? continuing.poseSince
			: w && before[lead]!.spot === a.spot && w.since + w.ms <= now
				? w.since + w.ms
				: undefined;
	if (at === undefined || now >= at + poseMs("glance", "lead")) return undefined;
	if (continuing && continuing.poseSince !== at) return undefined;
	return { lead, at };
}
