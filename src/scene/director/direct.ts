// The director: snapshot in, world and events out. Pure, so it is unit-tested with invented
// snapshots and replayed fixtures, and the same run always gives the same events.
//
//   direct(prev, snap, now, floor) -> { world, events, wake }
//
// `floor` is the office's floor plan for this snapshot (S2's layout), which says where desks and
// common spots are. The world says who stands where (a named spot and its slot), in which pose,
// and who is walking; the events say what changed. `wake` is the next time the world changes with
// no new snapshot (an acted pose ends, a habit rotates, a build turns long): call again then.
import { seats } from "../office/layout";
import { LEAD_SIZE, crewOf } from "../office/placement";
import type { Mood } from "../office/slot";
import type { Area, Slot, World as Floor } from "../office/world";
import { crewSlot } from "../office/world";
import { choosePose, hash } from "../rig/player";
import { HABITS, POSE, duration } from "../rig/poses";
import { type Role, roleFor } from "../rig/roles";
import type { Agent, Commands, RunningTool, Session, Snapshot } from "../../watcher/model";
import { type Point, along, pathBetween, walkMs } from "./paths";
import type { Actor, Cue, Seen, World, WorldEvent } from "./types";

const MIN = 60_000;

/** When signals turn into poses. */
export const RULES = {
	/** A shell command running this long makes its owner grumpy at the build. */
	longBuildMin: 20,
	/** Any other tool running this long reads as thinking hard. */
	thinkingMin: 2,
	/** An idle character moves on to its next slacking habit this often. */
	habitRotateMin: 10,
	/** The same command this many times in a row is a retry streak: grumpy. */
	retries: 3,
	/** An API retry this recent: grumpy. */
	apiRetryMin: 5,
	/** On the first snapshot, events older than this are history, not news. */
	recentMs: 60_000,
} as const;

export interface Direction {
	world: World;
	events: WorldEvent[];
	/** When to call again with no new snapshot, or undefined if nothing is due. */
	wake?: number;
}

/** Facts about one character from the snapshot, before the director decides anything. */
interface Spec {
	key: string;
	kind: "lead" | "crew";
	session: Session;
	agent?: Agent;
	boss?: string;
	role: string;
	rig: Role;
	mood: Mood;
	size: number;
	tint: string;
	/** Where it belongs: at its desk, around it, in the meeting room, or out (finished). */
	place: "desk" | "crew" | "meeting" | "out";
	busy: boolean;
	since: number;
	running?: RunningTool;
	commands?: Commands;
	seen: Seen;
}

const crewSize = (depth: number) => Math.max(40, 58 - (depth - 1) * 8);
const agentMood = (a: Agent): Mood => (a.status === "running" ? "busy" : a.status === "stalled" ? "stalled" : "done");

function specs(snap: Snapshot): Spec[] {
	const out: Spec[] = [];
	for (const { session: s } of seats(snap.sessions)) {
		const lead = `s:${s.id}`;
		const failAt = s.commands?.last && s.commands.last.exitCode !== 0 ? s.commands.last.at : undefined;
		out.push({
			key: lead,
			kind: "lead",
			session: s,
			role: "lead",
			rig: "lead",
			mood: s.state === "busy" ? "busy" : "idle",
			size: LEAD_SIZE,
			tint: s.project,
			place: "desk",
			busy: s.state === "busy",
			since: s.stateSince,
			running: s.running,
			commands: s.commands,
			seen: {
				waiting: s.waiting?.since,
				failAt,
				prs: (s.prs ?? []).map((p) => p.number).sort((a, b) => a - b),
				compactAt: s.compactions?.lastAt,
				apiRetryAt: s.apiRetry?.at,
				repeats: s.commands?.repeats,
				hires: s.agents.map((a) => a.id),
			},
		});
		const visit = (list: Agent[], boss: string) => {
			for (const a of list) {
				const key = `a:${s.id}:${a.id}`;
				const mood = agentMood(a);
				out.push({
					key,
					kind: "crew",
					session: s,
					agent: a,
					boss,
					role: a.role,
					rig: roleFor(a.role),
					mood,
					size: crewSize(a.depth),
					tint: a.role,
					place: a.status === "running" && /review/i.test(a.role) ? "meeting" : mood === "done" ? "out" : "crew",
					busy: a.status === "running",
					since: a.lastWriteAt,
					running: a.running,
					commands: a.commands,
					seen: {
						failAt: a.commands?.last && a.commands.last.exitCode !== 0 ? a.commands.last.at : undefined,
						prs: [],
						repeats: a.commands?.repeats,
						hires: a.children.map((c) => c.id),
					},
				});
				visit(a.children, key);
			}
		};
		visit(s.agents, lead);
	}
	return out;
}

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

interface Place {
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
function doorPlace(floor: Floor): Place | undefined {
	return commonSpots(floor, "lobby", "door")[0];
}

/** Give every spec a place: keep last time's if it still fits, then fill the rest in order. */
function assign(list: Spec[], floor: Floor, prev: Record<string, Actor>): Map<string, Place> {
	const out = new Map<string, Place>();
	const taken = new Set<string>();
	const meeting = commonSpots(floor, "meeting", "seat");
	const outs = OUT_ORDER.flatMap(([k, n, a, b]) => commonSpots(floor, k, n, a, b));
	const crewTaken = new Map<string, Set<number>>();
	const crewPlace = (s: Spec, i: number): Place | undefined => {
		const desk = floor.desks.get(s.session.id);
		return desk ? { spot: `crew:${i}`, area: desk.areaId, slot: crewSlot(desk, i) } : undefined;
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
		if (s.place === "crew" && was.spot.startsWith("crew:") && was.session === s.session.id) {
			const i = Number(was.spot.slice(5));
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
	return out;
}

// --- Poses -----------------------------------------------------------------------------------------

const poseMs = (name: string, as: "lead" | "partner") => {
	const p = POSE[name];
	if (!p) return 0;
	return duration(as === "partner" && p.partner ? p.partner.frames : p.frames);
};

interface Choice {
	pose: string;
	as: "lead" | "partner";
	acted: boolean;
	/** For a rare roll and the events: which trigger this was. */
	trigger?: string;
}

/** The standing pose for a character's mood and running state, when nothing acted is playing. */
function standing(s: Spec, now: number, count: Record<string, number>): Choice {
	if (s.mood === "stalled") return { pose: "stalled", as: "lead", acted: false };
	if (s.mood === "done") return { pose: "done", as: "lead", acted: false };
	if (s.seen.waiting !== undefined) return { pose: choosePose("waiting", s.key, s.rig, count.waiting ?? 0).name, as: "lead", acted: false, trigger: "waiting" };
	if (s.busy) {
		const run = s.running;
		const ranMin = run ? (now - run.since) / MIN : 0;
		if (run?.kind && ranMin >= RULES.longBuildMin) return { pose: "grumpy", as: "lead", acted: false };
		if ((s.commands?.repeats ?? 1) >= RULES.retries) return { pose: "grumpy", as: "lead", acted: false };
		if (s.seen.apiRetryAt !== undefined && now - s.seen.apiRetryAt < RULES.apiRetryMin * MIN) return { pose: "grumpy", as: "lead", acted: false };
		if (run && !run.kind && ranMin >= RULES.thinkingMin) return { pose: "thinking", as: "lead", acted: false };
		return { pose: choosePose("busy", s.key, s.rig).name, as: "lead", acted: false };
	}
	// Idle: one of the seven habits, from the id, moving on to the next every few minutes.
	const turn = Math.max(0, Math.floor((now - s.since) / (RULES.habitRotateMin * MIN)));
	return { pose: HABITS[(hash(s.key) + turn) % HABITS.length]!.name, as: "lead", acted: false };
}

/** A new signal since last time, worth an acted pose. */
function acted(s: Spec, was: Seen | undefined, now: number): Choice | undefined {
	const fresh = (at: number | undefined, before: number | undefined) =>
		at !== undefined && at !== before && (was !== undefined || now - at <= RULES.recentMs);
	const newPr = s.seen.prs.some((n) => !(was?.prs ?? []).includes(n)) && (was !== undefined);
	if (newPr) return { pose: "prOpened", as: "lead", acted: true, trigger: "pr" };
	if (fresh(s.seen.failAt, was?.failAt)) return { pose: "testFailed", as: "lead", acted: true, trigger: "fail" };
	if (fresh(s.seen.compactAt, was?.compactAt)) return { pose: "stretch", as: "lead", acted: true, trigger: "compact" };
	return undefined;
}

// --- The director -----------------------------------------------------------------------------

export function direct(prev: World | undefined, snap: Snapshot, now: number, floor: Floor): Direction {
	const before = prev?.actors ?? {};
	const first = prev === undefined;
	const list = specs(snap);
	const places = assign(list, floor, before);
	const events: WorldEvent[] = [];
	const actors: Record<string, Actor> = {};
	const byKey = new Map(list.map((s) => [s.key, s]));
	const wakes: number[] = [];

	// Hires since last time: the boss hands over, the new hire plays the other half.
	const hiredBy = new Map<string, string>();
	if (!first) {
		for (const s of list) {
			const was = before[s.key]?.seen.hires ?? [];
			for (const id of s.seen.hires) {
				const hire = `a:${s.session.id}:${id}`;
				if (!was.includes(id) && !before[hire] && byKey.get(hire)?.mood === "busy") hiredBy.set(hire, s.key);
			}
		}
	}
	const handing = new Set(hiredBy.values());

	// A PR with a teammate near: the lead celebrates with the first busy crew member at its desk.
	const celebrating = new Map<string, string>();

	for (const s of list) {
		const place = places.get(s.key);
		if (!place) continue;
		const was = before[s.key];
		const count = { ...(was?.count ?? {}) };
		const continuing = was && !was.gone && was.acted && now < was.poseSince + poseMs(was.pose, was.as) ? was : undefined;

		let choice: Choice;
		const news = acted(s, was?.seen, now);
		let st = standing(s, now, count);
		// One wait keeps one pose: the rare roll happens once, when the wait starts.
		if (st.trigger === "waiting" && was && !was.gone && was.seen.waiting === s.seen.waiting) st = { ...st, pose: was.pose };
		if (s.mood === "stalled" || s.mood === "done" || st.trigger === "waiting") choice = st;
		else if (hiredBy.has(s.key)) choice = { pose: "handover", as: "partner", acted: true, trigger: "hired" };
		else if (handing.has(s.key)) choice = { pose: "handover", as: "lead", acted: true, trigger: "hire" };
		else if (news?.trigger === "pr") {
			const mate = list.find((m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && places.get(m.key)?.spot.startsWith("crew:") && !celebrating.has(m.key) && !hiredBy.has(m.key));
			if (s.kind === "lead" && mate) {
				celebrating.set(mate.key, s.key);
				choice = { pose: "celebrate", as: "lead", acted: true, trigger: "pr" };
			} else choice = news;
		} else if (celebrating.has(s.key)) choice = { pose: "celebrate", as: "partner", acted: true, trigger: "pr" };
		else if (news) choice = news;
		else if (continuing) choice = { pose: continuing.pose, as: continuing.as, acted: true };
		else choice = st;

		// The same pose carries on; anything else starts now.
		const same = was && !was.gone && was.pose === choice.pose && was.as === choice.as && !(choice.acted && !continuing);
		if (!same && choice.trigger) count[choice.trigger] = (count[choice.trigger] ?? 0) + 1;
		const once = POSE[choice.pose]?.play !== "loop";
		const poseSince = same ? was!.poseSince : now;
		// Found mid-habit (or already stalled, or done) on arrival: start settled, costing nothing.
		const at: "start" | "end" = same ? was!.at : !was && once && !choice.acted && s.mood !== "busy" ? "end" : "start";

		// Movement.
		let walk: Actor["walk"];
		const arriving = !was || was.gone !== undefined;
		if (was && !arriving && (was.area !== place.area || was.spot !== place.spot)) {
			const from = here(was, now);
			const path = pathBetween(floor, was.area, from, place.area, place.slot);
			walk = { path, ms: walkMs(path), since: now };
			events.push({ type: "walk", key: s.key, at: now, from: was.spot, to: place.spot, ms: walk.ms });
		} else if (was && !arriving && was.walk && now < was.walk.since + was.walk.ms) {
			walk = was.walk;
		} else if (arriving && !first && s.kind === "crew" && !place.spot.startsWith("crew:")) {
			// A new hire whose job is elsewhere (a reviewer) starts at its desk and walks there.
			const desk = floor.desks.get(s.session.id);
			if (desk) {
				const start = crewSlot(desk, 0);
				const path = pathBetween(floor, desk.areaId, start, place.area, place.slot);
				walk = { path, ms: walkMs(path), since: now };
				events.push({ type: "walk", key: s.key, at: now, from: "crew:0", to: place.spot, ms: walk.ms });
			}
		} else if (arriving && !first && s.kind === "lead") {
			// A new session walks in from the lobby door to its desk.
			const door = doorPlace(floor);
			if (door) {
				const path = pathBetween(floor, door.area, door.slot, place.area, place.slot);
				walk = { path, ms: walkMs(path), since: now };
			}
		}
		if (walk) wakes.push(walk.since + walk.ms);
		if (arriving) events.push({ type: "arrive", key: s.key, at: now, spot: place.spot, area: place.area, walk: walk !== undefined });

		if (!same) events.push({ type: "pose", key: s.key, at: now, pose: choice.pose, as: choice.as, acted: choice.acted });
		if (choice.pose === "handover" && choice.as === "partner") events.push({ type: "handover", key: hiredBy.get(s.key)!, at: now, to: s.key });

		const inMeeting = place.spot.startsWith("meeting:");
		const wasMeeting = was?.spot.startsWith("meeting:") ?? false;
		if (inMeeting !== wasMeeting && (inMeeting || was)) events.push({ type: "review", key: s.key, at: now, state: inMeeting ? "start" : "end" });

		if (s.kind === "lead" && (s.seen.waiting !== undefined) !== (was?.seen.waiting !== undefined)) {
			if (s.seen.waiting !== undefined || was) events.push({ type: "waiting", key: s.key, at: now, state: s.seen.waiting !== undefined ? "start" : "end", area: place.area });
		}

		actors[s.key] = {
			key: s.key,
			kind: s.kind,
			session: s.session.id,
			agent: s.agent?.id,
			boss: s.boss,
			role: s.role,
			mood: s.mood,
			size: s.size,
			tint: s.tint,
			area: place.area,
			spot: place.spot,
			slot: place.slot,
			pose: choice.pose,
			as: choice.as,
			poseSince,
			acted: choice.acted,
			at,
			walk,
			seen: s.seen,
			count,
		};

		// When this picture changes on its own.
		if (choice.acted) wakes.push(poseSince + poseMs(choice.pose, choice.as));
		if (s.mood === "idle") wakes.push(s.since + (Math.floor((now - s.since) / (RULES.habitRotateMin * MIN)) + 1) * RULES.habitRotateMin * MIN);
		if (s.busy && s.running) {
			for (const m of [RULES.thinkingMin, RULES.longBuildMin]) if (now < s.running.since + m * MIN) wakes.push(s.running.since + m * MIN);
		}
		if (s.seen.apiRetryAt !== undefined && now < s.seen.apiRetryAt + RULES.apiRetryMin * MIN) wakes.push(s.seen.apiRetryAt + RULES.apiRetryMin * MIN);
	}

	// Whoever is gone from the snapshot walks out through the lobby door, then leaves the stage.
	const door = doorPlace(floor);
	for (const [key, was] of Object.entries(before)) {
		if (actors[key]) continue;
		if (was.gone !== undefined) {
			if (now < was.gone) {
				actors[key] = was;
				wakes.push(was.gone);
			}
			continue;
		}
		if (first) continue;
		const from = here(was, now);
		const to = door ?? { spot: "door", area: was.area, slot: was.slot };
		const path = pathBetween(floor, was.area, from, to.area, to.slot);
		const ms = walkMs(path);
		actors[key] = { ...was, area: to.area, spot: "door", slot: to.slot, walk: { path, ms, since: now, exit: true }, gone: now + ms };
		events.push({ type: "leave", key, at: now });
		if (was.spot.startsWith("meeting:")) events.push({ type: "review", key, at: now, state: "end" });
		if (was.kind === "lead" && was.seen.waiting !== undefined) events.push({ type: "waiting", key, at: now, state: "end", area: was.area });
		wakes.push(now + ms);
	}

	const due = wakes.filter((t) => t > now);
	return { world: { at: now, actors }, events, wake: due.length ? Math.min(...due) : undefined };
}

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
	};
}
