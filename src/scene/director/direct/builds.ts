
import type { Floor } from "../../world/world";
import { OVERLAP, buildSlot } from "../../world/world";
import { hash } from "../../rig/data/player";
import { changesOf, towerBricks } from "../metrics";
import { RUNS, editRate, runCooldown } from "../pace";
import { pathBetween, walkMs } from "../../world/paths";
import { STATION_POSE } from "../../world/stations";
import { TRIP, type Trip } from "../trips";
import type { Actor, Build, Run, WorldEvent } from "../types";
import { isEdit } from "../work";
import type { Spec } from "./specs";
import type { Place } from "./places";
import type { Choice } from "./choice";
import { handOffMs } from "./handoff-mail";
import { RULES, here } from "../direct";

/** A long build at the copier: a running feud with it, looped until the build ends (instead of the
 * one-off kick, `STATION_POSE.build.bad`). */
export const COPIER_FEUD = "copierFeud";

/** At a station: its work pose (or the feud with the jammed copier on a long build); in its queue, waiting. */
export function atStation(st: Choice, trip: Trip): Choice {
	if (trip.queue > 0) return { pose: TRIP.queuePose, as: "lead", acted: false };
	const pose = STATION_POSE[trip.kind];
	if (st.pose === "grumpy") return trip.kind === "build" ? { pose: COPIER_FEUD, as: "lead", acted: false } : st;
	return { pose: pose.work, as: "lead", acted: false };
}

/** Where each lead on its foreman's round stands: just behind one of its busy crew, looking on. */
export function foremanVisits(list: Spec[], places: Map<string, Place>, now: number, wakes: number[], away: Set<string>): Map<string, Place> {
	const out = new Map<string, Place>();
	const every = RULES.foremanEveryMs;
	const from = every - RULES.foremanStayMs;
	for (const s of list) {
		if (s.kind !== "lead" || !s.busy || s.seen.waiting !== undefined) continue;
		const crew = list
			.filter((m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && !away.has(m.key) && places.get(m.key)?.spot.startsWith("crew:"))
			.sort((a, b) => (a.key < b.key ? -1 : 1));
		if (crew.length < RULES.foremanCrew) continue;
		const delegating = /^(Task|Agent)$/.test(s.running?.tool ?? "") || !s.activity || now - s.activity.at >= RULES.foremanQuietMs;
		if (!delegating) {
			if (s.activity) wakes.push(s.activity.at + RULES.foremanQuietMs);
			continue;
		}
		const t = now + (hash(s.key) % every);
		const phase = t % every;
		if (phase < from) {
			wakes.push(now + from - phase);
			continue;
		}
		wakes.push(now + every - phase);
		// On the crew member's outer side, a step back, facing the same way: looking over its shoulder;
		// the turn's crew member, or the next whose shoulder has room (not someone else's place, such
		// as the desk's end place beside the row).
		const others = list.filter((o) => o.session.id === s.session.id && o.kind === "crew").map((o) => places.get(o.key)).filter((o): o is Place => !!o?.spot.startsWith("crew:"));
		const first = (Math.floor(t / every) + hash(s.key)) % crew.length;
		for (let k = 0; k < crew.length; k++) {
			const m = crew[(first + k) % crew.length]!;
			const p = places.get(m.key)!;
			const x = p.slot.x - p.slot.facing * 34;
			const y = p.slot.y - 10;
			if (others.some((o) => o !== p && Math.abs(o.slot.x - x) < OVERLAP.dx && Math.abs(o.slot.y - y) < OVERLAP.dy)) continue;
			out.set(s.key, { spot: `visit:${m.key}`, area: p.area, slot: { x, y, depth: y, facing: p.slot.facing } });
			break;
		}
	}
	return out;
}

/** The brick runs of one direction: under way (by session), set off this time, and dropped. */
export interface Runs {
	active: Map<string, Run>;
	started: Map<string, Run>;
	/** Sessions whose runner stopped mid-carry (finished, stalled, gone): the brick goes straight on. */
	dropped: Set<string>;
}

/**
 * A builder's brick run, if it is on one or sets off now: where it stands (the build) and the run.
 * It sets off with a new edit when its session has no run under way and has waited out its
 * cooldown, and only from its own crew spot, standing still, in no acted pose, with the lead not
 * waiting on you and not looking over its shoulder. On the way back it is an ordinary crew member
 * walking to its spot, so this returns undefined.
 */
export function brickRun(
	s: Spec,
	was: Actor | undefined,
	place: Place,
	choice: Choice,
	runs: Runs,
	build: Build | undefined,
	visits: Map<string, Place>,
	byKey: Map<string, Spec>,
	floor: Floor,
	now: number,
	speed = 1,
	/** The cooldown's share (less in a rush). */
	cool = 1,
): { place: Place; run: Run } | undefined {
	const id = s.session.id;
	const desk = floor.desks.get(id);
	if (s.kind !== "crew" || s.rig !== "builder" || !desk || !build) return undefined;
	const there = { spot: "build", area: desk.areaId, slot: buildSlot(desk) };
	const run = runs.active.get(id);
	if (run?.key === s.key) {
		if (!run.carried || now >= run.lands) return undefined;
		if (s.mood !== "busy") {
			// Finished or stalled with a brick in hand: it goes straight on, and the run is over.
			runs.dropped.add(id);
			runs.active.delete(id);
			return undefined;
		}
		return { place: there, run };
	}
	if (run || s.mood !== "busy" || choice.acted || build.pieces >= RULES.buildMax) return undefined;
	const a = s.activity;
	if (!a || !isEdit(a.tool) || build.seen[s.agent!.id] === a.at) return undefined;
	if (build.ranAt !== undefined && now - build.ranAt < runCooldown(id, editRate(build.edits, now)) * cool) return undefined;
	if (!was || was.gone || was.spot !== place.spot || !place.spot.startsWith("crew:")) return undefined;
	if (was.walk && now < was.walk.since + was.walk.ms) return undefined;
	const lead = `s:${id}`;
	if (byKey.get(lead)?.seen.waiting !== undefined || visits.get(lead)?.spot === `visit:${s.key}`) return undefined;
	const path = pathBetween(floor, place.area, here(was, now), there.area, there.slot);
	const ms = walkMs(path, speed);
	const lands = now + ms + handOffMs();
	const fresh: Run = { key: s.key, from: place.spot, since: now, walkMs: ms, lands, done: lands + ms, carried: true };
	runs.active.set(id, fresh);
	runs.started.set(id, fresh);
	return { place: there, run: fresh };
}

/**
 * Each session's crew build: a piece per edit seen, one off for a red test, a flag for the PR. A
 * builder's edit that sets off a brick run goes on when the brick is set down; every other edit (the
 * lead's, other roles', a second builder's while a run is under way or the session cools down) goes
 * straight on, so the build stays a measure of the work.
 */
export function buildsFor(
	list: Spec[],
	before: Record<string, Build>,
	failed: Set<string>,
	runs: Runs,
	now: number,
	events: WorldEvent[],
	wakes: number[],
): Record<string, Build> {
	const out: Record<string, Build> = {};
	const bySession = new Map<string, Spec[]>();
	for (const s of list) bySession.set(s.session.id, [...(bySession.get(s.session.id) ?? []), s]);
	for (const [id, members] of bySession) {
		const was = before[id];
		const crew = members.filter((m) => m.kind === "crew");
		const session = members[0]!.session;
		// Lines added, when the watcher counts them: then the tower is lines, not edits (metrics.ts).
		const lines = changesOf(session)?.added;
		if (!was && !(crew.some((m) => m.rig === "builder") || crew.length >= RULES.buildCrew || towerBricks(lines ?? 0) > 0)) continue;
		const seen: Record<string, number> = {};
		// Recent edit times, for the session's edit rate (the brick-run cooldown).
		const edits = (was?.edits ?? []).filter((t) => t > now - RUNS.windowMs);
		// A build found mid-session starts with a piece for each busy hand.
		let pieces = was ? was.pieces : Math.min(6, crew.filter((m) => m.busy).length);
		const started = runs.started.get(id);
		for (const m of members) {
			const who = m.agent?.id ?? "lead";
			const a = m.activity;
			if (a && isEdit(a.tool)) {
				seen[who] = a.at;
				if (was && was.seen[who] !== a.at) edits.push(a.at);
				// The runner's edit is in its hands: it goes on when the brick is set down.
				if (was && was.seen[who] !== a.at && started?.key !== m.key) pieces++;
			} else if (was?.seen[who] !== undefined) seen[who] = was.seen[who]!;
		}
		// The brick run: set down at the end of `place`; dropped if the runner stopped or left.
		let run = runs.active.get(id);
		if (run?.carried && !started && !members.some((m) => m.key === run!.key && m.busy)) {
			runs.dropped.add(id);
			run = undefined;
		}
		const landed = !!run && run.carried && now >= run.lands;
		if (landed || runs.dropped.has(id)) pieces++;
		if (landed) run = { ...run!, carried: false };
		if (run) wakes.push(run.carried ? run.lands : run.done);
		pieces = Math.min(RULES.buildMax, pieces);
		// Counting lines, the tower is a brick per ~20 lines added; edits still send brick runs, and
		// a run's brick landing sets the top brick down. A red test knocks one off until it grows.
		const target = lines !== undefined ? towerBricks(lines, RULES.buildMax) : undefined;
		let knocked = target !== undefined && was?.lines !== undefined && target > was.lines ? 0 : (was?.knocked ?? 0);
		if (target !== undefined) pieces = Math.max(0, target - knocked);
		const fell = failed.has(id) && pieces > 0;
		if (fell) {
			pieces--;
			knocked++;
		}
		const topped = (session.prs?.length ?? 0) > 0;
		// The fallen piece lies by the stack until the next one goes on.
		const added = !!was && !fell && (pieces > was.pieces || (target !== undefined && landed && pieces > 0));
		const fellAt = fell ? now : added ? undefined : was?.fellAt;
		const addedAt = added ? now : was?.addedAt;
		const ranAt = started ? now : was?.ranAt;
		const b: Build = {
			session: id,
			pieces,
			topped,
			seen,
			...(fellAt !== undefined ? { fellAt } : {}),
			...(addedAt !== undefined ? { addedAt } : {}),
			...(run ? { run } : {}),
			...(ranAt !== undefined ? { ranAt } : {}),
			...(edits.length ? { edits: edits.slice(-40) } : {}),
			...(target !== undefined ? { lines: target } : {}),
			...(target !== undefined && knocked ? { knocked } : {}),
		};
		out[id] = b;
		if (started) events.push({ type: "build", session: id, at: now, pieces, change: "carry", key: started.key });
		if (!was) events.push({ type: "build", session: id, at: now, pieces, change: "start" });
		else if (fell) events.push({ type: "build", session: id, at: now, pieces, change: "fall" });
		else if (pieces > was.pieces) events.push({ type: "build", session: id, at: now, pieces, change: "add" });
		if (topped && !was?.topped) events.push({ type: "build", session: id, at: now, pieces, change: "top" });
	}
	return out;
}
