// Hand-offs between crew and mail to and from your office: who carries what to whom, and when
// they celebrate. Split out of direct.ts by job.
import { LEAD_SIZE } from "../../world/placement";
import type { Area, Floor } from "../../world/world";
import { useFor } from "../../world/world";
import { POSE, poseMs } from "../../rig/data/poses";
import { HANDOFF, type HandOff, MAIL, type Mail, handOffSlot, pickTaker } from "../handoff";
import type { Pace } from "../pace";
import { pathBetween, walkMs } from "../../world/paths";
import type { Actor, WorldEvent } from "../types";
import type { Spec } from "./specs";
import type { Place } from "./places";
import type { Choice } from "./choice";
import { here } from "./cue";
import { type Pre, stationKind } from "./station-trips";

/** How long a PR's celebration lasts, the longer of its two parts. */
export const celebrateMs = () => Math.max(poseMs("celebrate", "lead"), poseMs("celebrate", "partner"));

/**
 * The hand-offs this direction: those still under way, and new ones. A giver is a busy crew member
 * leaving a station whose errand is a folder (it was using it, and its work no longer wants it); its
 * taker is a teammate at its own spot, standing still, whose work wants that same kind of station
 * and hasn't sent it there yet. The giver walks over; the two-hander starts when it gets there.
 */
export function handOffsFor(
	list: Spec[],
	pre: Map<string, Pre>,
	places: Map<string, Place>,
	before: Record<string, Actor>,
	was: Record<string, HandOff>,
	hiredBy: Map<string, string>,
	floor: Floor,
	now: number,
	gaitOf: (s: Spec, area: string) => Pace,
	events: WorldEvent[],
): Record<string, HandOff> {
	const out: Record<string, HandOff> = {};
	const byKey = new Map(list.map((s) => [s.key, s]));
	const live = (k: string) => {
		const a = before[k];
		return a && !a.gone ? a : undefined;
	};
	for (const [g, h] of Object.entries(was)) {
		if (now < h.done && byKey.get(g)?.mood === "busy" && byKey.get(h.taker)?.mood === "busy" && places.has(h.taker)) out[g] = h;
	}
	const taken = new Set(Object.values(out).map((h) => h.taker));
	const still = (a: Actor) => !a.walk || now >= a.walk.since + a.walk.ms;
	const takers = list
		.filter((m) => {
			const a = live(m.key);
			return (
				m.kind === "crew" &&
				m.mood === "busy" &&
				!hiredBy.has(m.key) &&
				a &&
				!a.trip &&
				still(a) &&
				places.get(m.key)?.spot.startsWith("crew:") &&
				a.handed !== pre.get(m.key)!.work?.since
			);
		})
		.map((m) => ({ key: m.key, session: m.session.id, kind: stationKind(m, pre.get(m.key)!), since: pre.get(m.key)!.work?.since ?? now }));
	for (const s of list) {
		const a = live(s.key);
		const p = pre.get(s.key)!;
		if (s.kind !== "crew" || s.mood !== "busy" || !a?.trip || a.trip.queue !== 0 || out[s.key] || taken.has(s.key)) continue;
		if (p.news || p.continuing || p.follow || stationKind(s, p) === a.trip.kind) continue;
		const home = places.get(s.key);
		if (!home?.spot.startsWith("crew:")) continue;
		const taker = pickTaker(
			{ key: s.key, session: s.session.id, kind: a.trip.kind },
			takers.filter((t) => !out[t.key]),
			taken,
		);
		if (!taker) continue;
		const there = places.get(taker)!;
		const slot = handOffSlot(there.slot, s.size);
		const path = pathBetween(floor, a.area, here(a, now), there.area, slot);
		const meets = now + walkMs(path, gaitOf(s, there.area).speed);
		const done = meets + Math.max(poseMs(HANDOFF.pose, "lead"), poseMs(HANDOFF.pose, "partner"));
		out[s.key] = { giver: s.key, taker, kind: a.trip.kind, since: now, meets, done, home: home.spot };
		taken.add(taker);
		events.push({ type: "handoff", key: s.key, at: now, to: taker, kind: a.trip.kind });
	}
	return out;
}

/** When a taker's part of a hand-off starts, if it is playing now. */
export function takingAt(handoffs: Record<string, HandOff>, key: string, now: number): number | undefined {
	const h = Object.values(handoffs).find((x) => x.taker === key);
	return h && now >= h.meets ? h.meets : undefined;
}

/**
 * The leads walking a PR to the outbox. A new PR (a lead at its desk, not waiting on you, in a room
 * with an outbox) sets one off; it drops the envelope when it gets there and `mailDrop` has played,
 * then walks back to its desk and celebrates with a busy teammate (or alone).
 */
export function mailFor(
	list: Spec[],
	pre: Map<string, Pre>,
	places: Map<string, Place>,
	before: Record<string, Actor>,
	was: Record<string, Mail>,
	stations: Map<string, NonNullable<Area["stations"]>[number]>,
	floor: Floor,
	now: number,
	gaitOf: (s: Spec, area: string) => Pace,
	events: WorldEvent[],
): Record<string, Mail> {
	const out: Record<string, Mail> = {};
	for (const s of list) {
		if (s.kind !== "lead") continue;
		const a = before[s.key];
		if (!a || a.gone || s.seen.waiting !== undefined) continue;
		const desk = places.get(s.key);
		const id = s.session.id;
		let m: Mail | undefined = was[id];
		if (m && m.back !== undefined && now >= m.back + celebrateMs()) m = undefined;
		if (!m && pre.get(s.key)!.news?.trigger === "pr" && desk?.spot === "desk") {
			const st = floor.areas.find((x) => x.id === desk.area)?.stations?.find((x) => x.kind === "outbox");
			if (!st) continue;
			const use = useFor(st, LEAD_SIZE);
			const path = pathBetween(floor, a.area, here(a, now), st.areaId, use);
			const drops = now + walkMs(path, gaitOf(s, st.areaId).speed) + poseMs(MAIL.pose, "lead");
			m = { key: s.key, station: st.id, pr: s.seen.prs[s.seen.prs.length - 1] ?? 0, since: now, drops };
			events.push({ type: "trip", key: s.key, at: now, station: st.id, state: "start" });
		}
		if (!m) continue;
		if (now >= m.drops && m.returns === undefined && desk) {
			// The envelope is in: back to the desk, and the celebration when it gets there.
			const path = pathBetween(floor, a.area, here(a, now), desk.area, desk.slot);
			const back = now + walkMs(path, gaitOf(s, desk.area).speed);
			const mate = list.find((x) => x.session.id === id && x.kind === "crew" && x.mood === "busy" && places.get(x.key)?.spot.startsWith("crew:"));
			m = { ...m, returns: now, back, ...(mate ? { mate: mate.key } : {}) };
			events.push({ type: "trip", key: s.key, at: now, station: m.station, state: "end" });
		}
		if (!stations.has(m.station)) continue;
		out[id] = m;
	}
	return out;
}

/** The lead's pose on its way to the outbox and back: `mailDrop` there, then the celebration (or
 * the PR pose, alone) once it is back. */
export function mailChoice(m: Mail, now: number, news: Choice | undefined): Choice {
	if (now < m.drops) return { pose: MAIL.pose, as: "lead", acted: true, ...(news?.trigger === "pr" ? { trigger: "pr" } : {}), since: m.since };
	return { pose: m.mate ? "celebrate" : "prOpened", as: "lead", acted: true, since: m.returns ?? now };
}

/** True while `key` plays its half of the celebration after the lead's walk back from the outbox. */
export const celebratesMail = (m: Mail | undefined, key: string, now: number): boolean =>
	m !== undefined && m.mate === key && m.back !== undefined && now >= m.back && now < m.back + poseMs("celebrate", "partner");

/** How far into `place` the brick leaves the builder's hands: the end of the last frame that
 * still shows it (in a hand, or set down out front). The tower takes it from there. */
export function handOffMs(): number {
	const frames = POSE.place?.frames ?? [];
	let t = 0;
	let end = 0;
	for (const f of frames) {
		t += f.ms;
		if (f.props.left === "brick" || f.props.right === "brick" || f.props.work === "brick") end = t;
	}
	return end || t;
}
