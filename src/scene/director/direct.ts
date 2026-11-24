// The director: snapshot in, world and events out. Pure, so it is unit-tested with invented
// snapshots and replayed fixtures, and the same run always gives the same events.
//
//   direct(prev, snap, now, floor) -> { world, events, wake }
//
// `floor` is the office's floor plan for this snapshot (S2's layout), which says where desks and
// common spots are. The world says who stands where (a named spot and its slot), in which pose,
// and who is walking; the events say what changed. `wake` is the next time the world changes with
// no new snapshot (an acted pose ends, a habit rotates, a build turns long): call again then.
import { seats } from "../world/layout";
import { LEAD_SIZE, crewSize } from "../world/placement";
import { habitsFor } from "../world/staging";
import type { Mood } from "../contract";
import type { Area, Slot, Floor } from "../world/world";
import { OVERLAP, buildSlot, crewPlaces, crewSlot, crewSpots, endGaps, useFor, yieldFrom } from "../world/world";
import { choosePose, hash } from "../rig/player";
import { POSE, poseMs } from "../rig/poses";
import { type Role, roleFor } from "../rig/roles";
import type { Activity, Agent, Commands, RunningTool, Session, Snapshot } from "../../watcher/model";
import { beat, flourishAfter, overlapOf } from "./beats";
import { habitAt } from "./habits";
import { dodges } from "./dodge";
import { atYourDoor, errandPlace, errandUnderWay, newErrands, ongoingErrands, pauseOf, queueUp } from "./errands";
import { HANDOFF, type HandOff, MAIL, type Mail, handOffSlot, pickTaker } from "./handoff";
import { NO_METRICS, changesOf, metricsFor, towerBricks, trayFor } from "./metrics";
import { type Pace, PACE, RUNS, editRate, paceOf, runCooldown } from "./pace";
import { RUSH, type Rush, heatOf, nextDash, nextRush, rushWake } from "./rush";
import { traitOf } from "./traits";
import { type Point, along, pathBetween, walkMs } from "../world/paths";
import { STATION_FOR, STATION_POSE, type StationKind } from "../world/stations";
import { TRIP, type Trip, type Want, planTrips, tripPlace } from "./trips";
import type { Actor, Build, Cue, Run, Seen, World, WorldEvent } from "./types";
import { WORK, WORK_POSE, type Work, type WorkKind, isEdit, nextWork, tempo, tempoWake, workKind } from "./work";
import { faceFront, inCrowd } from "../world/world";
import { HANDOFF_LOOK, NOTICE, NOTICE_POSES, type View, freshReturn, handOffWakes, looksFor, noticeDelay, pairUp, readyAt, rippleDelay, waverOf } from "./social";
import { STORY, type Story, cheersReply, headlinesFor, logOf, replyChoice, replyPlace, replyWakes, replyWalkPose, repliesFor, sendOffHold, sendOffLooks, sendOffsFor, storyNews } from "./story";
import { MIN } from "../../shared/time";

export { runCooldown };
export type { View };


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
	/** The foreman's round: a lead whose crew is working walks over to one of them this often... */
	foremanEveryMs: 40_000,
	/** ...and stays this long, nodding, before walking back to its desk. */
	foremanStayMs: 10_000,
	/** It goes only with this many busy crew around the desk... */
	foremanCrew: 2,
	/** ...and only when its own last tool call is this old, or it is waiting on its crew. */
	foremanQuietMs: 15_000,
	/** A crew build shows for a session with a builder, or this many crew. */
	buildCrew: 3,
	/** The tallest a crew build gets. */
	buildMax: 30,
	/** A brick run: after one sets off, the session's next waits at least this long... */
	runEveryMs: RUNS.everyMs,
	/** ...plus up to this much more, a share picked from the session's id (less as edits pour in: pace.ts). */
	runJitterMs: RUNS.jitterMs,
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
	activity?: Activity;
	commands?: Commands;
	seen: Seen;
	task?: string;
}

/** A character's model personality (traits.ts): crew by their own model, leads by the session's. */
const traitFor = (s: Spec) => traitOf(s.kind === "lead" ? s.session.family : s.agent?.family);
/** How fast a character walks now: its heat pace (pace.ts) times its trait. */
function gaitBase(s: Spec, now: number) {
	const lastAt = Math.max(s.activity?.at ?? -Infinity, s.agent?.lastWriteAt ?? -Infinity);
	const g = paceOf(s.agent ? s.agent.tools : s.session.tools, Number.isFinite(lastAt) ? lastAt : undefined, now);
	return { ...g, speed: g.speed * traitFor(s).walk };
}
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
			activity: s.activity,
			commands: s.commands,
			task: s.title,
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
					rig: roleFor(a.role, a.task),
					mood,
					size: crewSize(a.depth),
					tint: a.role,
					place: a.status === "running" && roleFor(a.role, a.task) === "reviewer" ? "meeting" : mood === "done" ? "out" : "crew",
					busy: a.status === "running",
					since: a.lastWriteAt,
					running: a.running,
					activity: a.activity,
					commands: a.commands,
					task: a.task,
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

// --- Poses -----------------------------------------------------------------------------------------


interface Choice {
	pose: string;
	as: "lead" | "partner";
	acted: boolean;
	/** For a rare roll and the events: which trigger this was. */
	trigger?: string;
	/** When it started, for a pose timed by something else (a hand-off, the outbox): it doesn't
	 * restart while it plays. */
	since?: number;
}

/** The standing pose for a character's mood and running state, when nothing acted is playing. */
function standing(s: Spec, now: number, count: Record<string, number>, work?: Work, life = false, habits?: readonly string[]): Choice {
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
		const byTool = s.kind === "crew" && work ? WORK_POSE[s.rig]?.[work.kind] : undefined;
		return { pose: byTool ?? choosePose("busy", s.key, s.rig).name, as: "lead", acted: false };
	}
	// Idle: one of the seven habits, from the id (habits.ts): with life on, rotating every minute or
	// two and played again every half minute or so; calm, moving on every ten minutes.
	const h = habitAt(s.key, s.since, now, life, habits);
	return { pose: h.pose, as: "lead", acted: false, ...(h.since !== undefined ? { since: h.since } : {}) };
}

/** A new signal since last time, worth an acted pose. */
function acted(s: Spec, was: Seen | undefined, now: number): Choice | undefined {
	const fresh = (at: number | undefined, before: number | undefined) =>
		at !== undefined && at !== before && (was !== undefined || now - at <= RULES.recentMs);
	const newPr = s.seen.prs.some((n) => !(was?.prs ?? []).includes(n)) && (was !== undefined);
	if (newPr) return { pose: "prOpened", as: "lead", acted: true, trigger: "pr" };
	// A builder mid-swing hits its thumb instead.
	if (fresh(s.seen.failAt, was?.failAt)) return { pose: s.rig === "builder" && s.kind === "crew" ? "thumb" : "testFailed", as: "lead", acted: true, trigger: "fail" };
	if (fresh(s.seen.compactAt, was?.compactAt)) return { pose: "stretch", as: "lead", acted: true, trigger: "compact" };
	return undefined;
}

// --- The director -----------------------------------------------------------------------------

/** What the director is told besides the snapshot. */
export interface DirectOptions {
	/** Life on: the window is on screen and the office isn't calm, so idle habits rotate and loop
	 * gently (habits.ts). Off (the default) is calm mode: one habit played once, every ten minutes. */
	life?: boolean;
	/** What the director knows about the viewer (social.ts): when the window came back on screen. */
	view?: View;
}

export function direct(prev: World | undefined, snap: Snapshot, now: number, floor: Floor, opts: DirectOptions = {}): Direction {
	const life = opts.life ?? false;
	// The theme's idle habits (world/staging.ts), or the rig's seven; a line's lead has the booth's.
	const habitsOf = (s: Spec) => habitsFor(floor.staging, s.kind === "lead");
	const view = opts.view;
	const before = prev?.actors ?? {};
	const first = prev === undefined;
	// The stage changed under the cast (a theme switched live): spots that moved with it are taken
	// at once, not walked to, since the whole office was just drawn again.
	const staged = `${floor.staging?.bay ?? "desks"}/${floor.staging?.hall ?? "corridor"}`;
	const restaged = prev !== undefined && (prev.stage ?? "desks/corridor") !== staged;
	const list = specs(snap);
	const places = assign(list, floor, before);
	const events: WorldEvent[] = [];
	const actors: Record<string, Actor> = {};
	const byKey = new Map(list.map((s) => [s.key, s]));
	const wakes: number[] = [];
	// Story (story.ts): a merged PR, a red streak gone green, a long session ending.
	const tale = storyNews(prev?.story, list, before, now);

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

	// News that makes the rest of a crew look up: a red test, or a teammate finishing. The same
	// red test knocks a piece off the session's build.
	const startled = new Map<string, Set<string>>();
	const failed = new Set<string>();
	for (const s of list) {
		const was = before[s.key];
		const fail = acted(s, was?.seen, now)?.trigger === "fail";
		if (fail) failed.add(s.session.id);
		if (fail || (s.kind === "crew" && was && !was.gone && was.mood === "busy" && s.mood === "done")) {
			const set = startled.get(s.session.id) ?? new Set<string>();
			set.add(s.key);
			startled.set(s.session.id, set);
		}
	}
	// Story: a red streak gone green makes the crew look up at whoever fixed it, too.
	for (const key of tale.redeemed) {
		const s = byKey.get(key)!;
		startled.set(s.session.id, new Set([...(startled.get(s.session.id) ?? []), key]));
	}

	// Brick runs under way (at most one per session), and who is out on one: the foreman doesn't
	// visit an empty spot.
	const runs: Runs = { active: new Map(), started: new Map(), dropped: new Set() };
	for (const [id, b] of Object.entries(prev?.builds ?? {})) if (b.run && now < b.run.done) runs.active.set(id, b.run);
	const away = new Set([...runs.active.values()].filter((r) => now < r.lands).map((r) => r.key));

	// What each one is working on (held a few seconds so the pose doesn't flicker), and its news.
	const pre = new Map<string, Pre>();
	for (const s of list) {
		const was = before[s.key];
		const live = was && !was.gone ? was : undefined;
		const want = s.busy ? workKind(s.running, s.activity) : undefined;
		const work = s.busy ? nextWork(live?.work, want, now) : undefined;
		// A quick model's acted pose is over a touch early: the next one overlaps its end (beats.ts).
		const continuing = live?.acted && now < live.poseSince + poseMs(live.pose, live.as) - overlapOf(traitFor(s), live.pose) ? live : undefined;
		pre.set(s.key, { want, work, news: acted(s, was?.seen, now), continuing, follow: followUp(s, live, continuing) ?? flourishAfter(live, continuing, traitFor(s)) });
	}

	// Errands metrics sent people on (the shredder, the planner: errands.ts): whoever is on one is
	// out of trips and rounds until it is done.
	const metricsWas = prev?.metrics ?? NO_METRICS;
	const ongoing = ongoingErrands(before, now, wakes);
	for (const [key, e] of ongoing) {
		if (!places.has(key) || !errandUnderWay(e, now)) continue;
		places.set(key, errandPlace(e));
		away.add(key);
	}

	// Rush: a session whose work is very hot puts its room in rush (rush.ts). The heat counts the
	// edits the build saw up to last time.
	const rush: Record<string, Rush> = {};
	const hotRooms = new Set<string>();
	for (const s of list) {
		if (s.kind !== "lead") continue;
		const id = s.session.id;
		const was = prev?.rush?.[id];
		const edits = prev?.builds[id]?.edits;
		const heat = heatOf(s.session, edits, now);
		const r = s.busy ? nextRush(was, heat, now) : undefined;
		if (r) {
			rush[id] = r;
			const desk = floor.desks.get(id);
			if (desk) hotRooms.add(desk.areaId);
			const w = rushWake(r, now);
			if (w !== undefined) wakes.push(w);
			// The heat drops on its own as edits age out of the last minute.
			const oldest = (edits ?? []).filter((t) => t > now - RUNS.windowMs).sort((a, b) => a - b)[0];
			if (oldest !== undefined) wakes.push(oldest + RUNS.windowMs);
		}
		if (r && !was) events.push({ type: "rush", session: id, at: now, state: "start", heat });
		if (!r && was) events.push({ type: "rush", session: id, at: now, state: "end", heat });
	}
	const rushing = new Set(Object.keys(rush));
	/** How fast someone walks to a place in `area`: its heat's pace, and at least a run in a rush. */
	const gaitOf = (s: Spec, area: string): Pace => {
		const g = gaitBase(s, now);
		return hotRooms.has(area) && g.speed < PACE.speed.run * traitFor(s).walk ? { name: "run", speed: PACE.speed.run * traitFor(s).walk } : g;
	};

	// Hand-offs: back from the filing cabinet (or the card catalogue), a crew member passes its folder
	// to a teammate whose work wants the same station, and that one skips the trip (handoff.ts).
	const handoffs = handOffsFor(list, pre, places, before, prev?.handoffs ?? {}, hiredBy, floor, now, gaitOf, events);
	const takers = new Set(Object.values(handoffs).map((h) => h.taker));
	const handed = new Map<string, number>();
	for (const s of list) {
		const w = pre.get(s.key)!.work;
		const was = before[s.key];
		if (!w) continue;
		if (takers.has(s.key)) handed.set(s.key, w.since);
		else if (was && !was.gone && was.handed === w.since) handed.set(s.key, w.since);
	}

	// Trips: crew whose held work has a station walk to it (or queue for it), leaving their crew spot
	// to come back to. Nobody on a trip is visited on the foreman's round.
	const homes = new Map<string, string>();
	const skip = new Set([...Object.keys(handoffs), ...handed.keys()]);
	const trips = tripsFor(list, pre, places, before, floor, runs, hiredBy, now, wakes, rushing, skip);
	const stationById = new Map(floor.areas.flatMap((a) => a.stations ?? []).map((st) => [st.id, st]));
	const sizes = new Map(list.map((s) => [s.key, s.size]));
	for (const [key, t] of trips) {
		homes.set(key, places.get(key)!.spot);
		places.set(key, tripPlace(t, stationById.get(t.station)!, sizes.get(key)!));
		away.add(key);
	}
	for (const h of Object.values(handoffs)) {
		const taker = places.get(h.taker);
		if (!taker) continue;
		homes.set(h.giver, h.home);
		places.set(h.giver, { spot: `handoff:${h.taker}`, area: taker.area, slot: handOffSlot(taker.slot, sizes.get(h.giver)!) });
		away.add(h.giver);
		wakes.push(h.meets, h.done);
	}

	// The PR goes to the outbox: the lead walks the envelope over, drops it in, walks back.
	const mail = mailFor(list, pre, places, before, prev?.mail ?? {}, stationById, floor, now, gaitOf, events);
	for (const m of Object.values(mail)) {
		const st = stationById.get(m.station)!;
		if (now < m.drops) places.set(m.key, { spot: `station:${st.id}`, area: st.areaId, slot: useFor(st, LEAD_SIZE) });
		wakes.push(m.drops);
		if (m.back !== undefined) wakes.push(m.back, m.back + celebrateMs());
	}
	const mailing = new Set(Object.values(mail).map((m) => m.key));

	// Story: a merged PR's reply lands in the outbox; the lead fetches it and walks it back (story.ts).
	const replies = repliesFor({
		leads: list
			.filter((s) => s.kind === "lead")
			.map((s) => ({
				key: s.key,
				session: s.session.id,
				place: places.get(s.key),
				waiting: s.seen.waiting !== undefined,
				mates: list.filter((m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && places.get(m.key)?.spot.startsWith("crew:")).map((m) => m.key),
			})),
		news: tale,
		was: prev?.story?.replies ?? {},
		before,
		busy: mailing,
		floor,
		now,
		speed: (key, area) => gaitOf(byKey.get(key)!, area).speed,
		where: here,
		events,
	});
	for (const r of Object.values(replies)) {
		const p = replyPlace(r, floor, now);
		if (p) places.set(r.key, p);
		if (now < (r.back ?? r.takes)) away.add(r.key);
		wakes.push(...replyWakes(r));
	}
	const replying = new Set(Object.values(replies).map((r) => r.key));

	// The foreman's round: a lead whose crew is hard at it walks over to look. In a rush, it dashes
	// instead, straight to whoever just went red or has queued longest (rush.ts).
	const visits = foremanVisits(list, places, now, wakes, away);
	for (const s of list) {
		const r = rush[s.session.id];
		if (s.kind !== "lead" || !r || !s.busy || s.seen.waiting !== undefined || mailing.has(s.key)) continue;
		const crew = list.filter((m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && places.has(m.key) && !Object.hasOwn(handoffs, m.key));
		const cands = crew.map((m) => {
			const t = trips.get(m.key);
			return { key: m.key, failAt: m.seen.failAt, queuedSince: t && t.queue > 0 ? t.since : undefined };
		});
		const next = nextDash(r, cands, new Set(crew.map((m) => m.key)), now);
		rush[s.session.id] = next;
		if (!next.dash) continue;
		const p = places.get(next.dash.key)!;
		const x = p.slot.x - p.slot.facing * 34;
		const y = p.slot.y - 10;
		visits.set(s.key, { spot: `dash:${next.dash.key}`, area: p.area, slot: { x, y, depth: y, facing: p.slot.facing } });
		wakes.push(next.dash.since + RUSH.dashStayMs);
	}
	for (const key of mailing) visits.delete(key);
	for (const key of replying) visits.delete(key);

	// Your office: every lead waiting on you queues there with a ticket. And new errands: a
	// compaction sends a lead to the shredder, a todo done sends a note to the planner.
	const queue = queueUp(list, floor, metricsWas);
	for (const [key, q] of queue.places) places.set(key, q);
	const fresh = newErrands({ list, places, before, floor, metrics: metricsWas, ongoing, busyElsewhere: away, now, first, speed: (m) => gaitBase(m as Spec, now).speed });
	const errands = new Map([...ongoing, ...fresh]);
	for (const [key, e] of fresh) {
		for (const t of [e.since, e.since + e.walkMs, e.until]) if (t > now) wakes.push(t);
		if (!errandUnderWay(e, now)) continue;
		places.set(key, errandPlace(e));
		away.add(key);
	}
	for (const key of errands.keys()) if (errandUnderWay(errands.get(key), now)) visits.delete(key);
	for (const [key, v] of visits) places.set(key, v);

	// Staging (social.ts): a crowd's rear members turn to the one in front; finished crew in the
	// kitchen's coffee line pair up facing each other. Spot names stay; only facing changes.
	stage(list, places, floor);

	// The news ripples: each glancer looks up at the nearest one it is about, the nearest glancer
	// first (social.ts).
	const ripple = rippleFor(list, startled, places, before, now);

	// Back on screen after a while away: idle characters look up at you, one waves (social.ts).
	const back = first ? undefined : freshReturn(view, now);
	const lookers: string[] = [];
	if (back !== undefined) {
		for (const s of list) {
			const live = before[s.key];
			if (!live || live.gone !== undefined || live.noticed === back || (live.walk && now < live.walk.since + live.walk.ms)) continue;
			if ((s.kind === "lead" && s.mood === "idle" && s.seen.waiting === undefined) || (s.kind === "crew" && s.mood === "done" && places.has(s.key))) lookers.push(s.key);
		}
	}
	const waver = back !== undefined ? waverOf(lookers, back) : undefined;
	/** Two-handers and celebrations: each looks at the other. */
	const pairs = new Map<string, string>();
	const pair = (a: string, b: string) => {
		pairs.set(a, b);
		pairs.set(b, a);
	};
	for (const [hire, boss] of hiredBy) pair(hire, boss);

	// Story: a long session's lead walks out, and the room waves it off (story.ts).
	const exit = doorPlace(floor);
	const sendoffs = sendOffsFor({
		leaving: tale.leaving,
		was: prev?.story?.sendoffs ?? {},
		before,
		places,
		floor,
		now,
		walkOut: (a) => (exit ? walkMs(pathBetween(floor, a.area, here(a, now), exit.area, exit.slot)) : 0),
	});

	// A PR with a teammate near: the lead celebrates with the first busy crew member at its desk.
	const celebrating = new Map<string, string>();

	for (const s of list) {
		let place = places.get(s.key);
		if (!place) continue;
		const was = before[s.key];
		const count = { ...(was?.count ?? {}) };
		const { want, work, news, continuing, follow } = pre.get(s.key)!;
		const trip = trips.get(s.key);

		let choice: Choice;
		if (work && want && want !== work.kind) wakes.push(work.since + WORK.holdMs);
		let st = standing(s, now, count, work, life, habitsOf(s));
		// Buried in the in-tray: past 95% of the context window, a busy lead at its desk (metrics.ts).
		if (s.kind === "lead" && s.busy && !st.trigger && place.spot === "desk" && st.pose !== "grumpy" && st.pose !== "thinking" && trayFor(s.session.context)?.buried) st = { pose: "buried", as: "lead", acted: false };
		if (visits.has(s.key) && st.pose !== "grumpy") st = { pose: "inspect", as: "lead", acted: false };
		if (trip) st = atStation(st, trip);
		// One wait keeps one pose: the rare roll happens once, when the wait starts.
		if (st.trigger === "waiting" && was && !was.gone && was.seen.waiting === s.seen.waiting) st = { ...st, pose: was.pose };
		const round = roundFor(s, actors, before, places, trip, continuing, now, wakes);
		if (s.mood === "stalled" || s.mood === "done" || st.trigger === "waiting") choice = st;
		else if (hiredBy.has(s.key)) choice = { pose: "handover", as: "partner", acted: true, trigger: "hired" };
		else if (handing.has(s.key)) choice = { pose: "handover", as: "lead", acted: true, trigger: "hire" };
		else if (mailing.has(s.key)) choice = mailChoice(mail[s.session.id]!, now, news);
		// Story: fetching a merged PR's reply, and the teammate who celebrates it (story.ts).
		else if (replying.has(s.key)) choice = replyChoice(replies[s.session.id]!, now);
		else if (cheersReply(replies[s.session.id], s.key, now)) choice = { pose: STORY.cheer, as: "partner", acted: true, trigger: "reply", since: replies[s.session.id]!.back! };
		else if (celebratesMail(mail[s.session.id], s.key, now)) choice = { pose: "celebrate", as: "partner", acted: true, trigger: "pr", since: mail[s.session.id]!.back! };
		else if (Object.hasOwn(handoffs, s.key)) choice = { pose: HANDOFF.pose, as: "lead", acted: true, trigger: "handoff", since: handoffs[s.key]!.since };
		else if (takers.has(s.key) && takingAt(handoffs, s.key, now) !== undefined) choice = { pose: HANDOFF.pose, as: "partner", acted: true, trigger: "handoff", since: takingAt(handoffs, s.key, now)! };
		// The folder's nearly here: a hand goes up for it (social.ts).
		else if (takers.has(s.key) && readyAt(handoffs, s.key, now) !== undefined) choice = { pose: HANDOFF_LOOK.pose, as: "lead", acted: true, trigger: "ready", since: readyAt(handoffs, s.key, now)! };
		else if (news?.trigger === "pr") {
			const mate = list.find((m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && places.get(m.key)?.spot.startsWith("crew:") && !celebrating.has(m.key) && !hiredBy.has(m.key));
			if (s.kind === "lead" && mate) {
				celebrating.set(mate.key, s.key);
				pair(mate.key, s.key);
				choice = { pose: "celebrate", as: "lead", acted: true, trigger: "pr" };
			} else choice = news;
		} else if (celebrating.has(s.key)) choice = { pose: "celebrate", as: "partner", acted: true, trigger: "pr" };
		else if (news?.trigger === "fail" && trip?.queue === 0 && trip.kind === "test") choice = { pose: STATION_POSE.test.bad!, as: "lead", acted: true, trigger: "fail" };
		// Story: a red streak gone green, a little flourish (story.ts).
		else if (tale.redeemed.has(s.key) && !news) choice = { pose: STORY.redeemed, as: "lead", acted: true, trigger: "redeemed" };
		else if (news) choice = news;
		// A red stamp, then the thumb (or the failed-test pose), still at the stamp desk.
		else if (follow) choice = { pose: follow, as: "lead", acted: true };
		// The foreman's round, both ways: the one it came to see looks up at it (social.ts).
		else if (round !== undefined) choice = { pose: "glance", as: "lead", acted: true, trigger: "round", since: round.at };
		else if (!continuing && s.kind === "crew" && s.mood === "busy" && [...(startled.get(s.session.id) ?? [])].some((k) => k !== s.key))
			choice = { pose: "glance", as: "lead", acted: true, trigger: "glance" };
		else if (continuing) choice = { pose: continuing.pose, as: continuing.as, acted: true };
		else choice = st;

		// Metrics' acting: at your door with a ticket (the first one in rings the bell), on an errand,
		// or, for a deliberate model, a beat before an acted pose (errands.ts, beats.ts).
		const live = was && !was.gone ? was : undefined;
		// A look up at you plays through, even for the finished crew (whose standing pose is `done`).
		if (continuing && NOTICE_POSES.has(continuing.pose) && continuing.pose !== NOTICE.ticket) choice = { pose: continuing.pose, as: continuing.as, acted: true };
		let noticed = live?.noticed;
		const q = queue.places.get(s.key);
		const trait = traitFor(s);
		if (q) {
			const t = queue.tickets[s.key]!;
			// The wait gets worse the longer it goes on; a word with the one behind needs someone there.
			const behind = [...queue.places.values()].some((o) => o.k === q.k + 1);
			const door = atYourDoor(t, q.k, live, q.spot, continuing, now, behind);
			if (door.next !== undefined) wakes.push(door.next);
			// The rare waiting variant (a "please" paddle) holds that instead of a ticket.
			const rare = !door.acted && st.trigger === "waiting" && (POSE[st.pose]?.rarity ?? 1) < 1;
			choice = rare ? st : { pose: door.pose, as: "lead", acted: door.acted, ...(door.rang !== undefined ? { trigger: "bell" } : {}) };
			if (door.rang !== undefined) queue.tickets[s.key] = { ...t, rang: door.rang };
			// Back on screen: the ticket goes up for you (social.ts).
			const there = !!live && live.spot === q.spot && !(live.walk && now < live.walk.since + live.walk.ms);
			if (!rare && !door.acted && back !== undefined && noticed !== back && there) {
				choice = { pose: NOTICE.ticket, as: "lead", acted: true, trigger: "notice", since: now };
				noticed = back;
			} else if (!rare && !door.acted && continuing?.pose === NOTICE.ticket) choice = { pose: NOTICE.ticket, as: "lead", acted: true, since: continuing.poseSince };
		}
		const errand = errands.get(s.key);
		const doing = errandUnderWay(errand, now) ? errand : undefined;
		if (doing) choice = { pose: doing.pose, as: "lead", acted: true, ...(doing.since === now ? { trigger: doing.kind } : {}) };
		// About to set off on an errand, a deliberate model takes its beat first, visibly.
		else if (errand && now < errand.since && trait.beat && live && !choice.acted) choice = { pose: trait.beat, as: "lead", acted: false };
		let pending: Actor["pending"];
		// Held back a beat by social.ts: the news's ripple, or a look up at you.
		let held: { pose: string; delay: number; trigger: string } | undefined;
		if (!q && !doing && back !== undefined && lookers.includes(s.key)) {
			const pose = waver === s.key ? NOTICE.wave : NOTICE.look;
			held = { pose, delay: noticeDelay(s.key, back, waver === s.key), trigger: "notice" };
			noticed = back;
		} else if (!q && !doing && choice.trigger === "glance" && (ripple.get(s.key)?.delay ?? 0) > 0) held = { pose: "glance", delay: ripple.get(s.key)!.delay, trigger: "glance" };
		// Story: waving a long session off, the nearest first (story.ts).
		else if (!q && !doing && !mailing.has(s.key) && !replying.has(s.key) && sendOffHold(sendoffs, s.key, now)) held = { pose: STORY.sendoff, delay: sendOffHold(sendoffs, s.key, now)!.delay, trigger: "sendoff" };
		if (held && held.delay <= 0) choice = { pose: held.pose, as: "lead", acted: true, trigger: held.trigger };
		else if (held && live) {
			pending = { pose: held.pose, as: "lead", trigger: held.trigger, at: now + held.delay };
			wakes.push(pending.at);
			choice = { pose: live.pose, as: live.as, acted: false };
		} else if (!q && !doing) ({ choice, pending } = beat(choice, live, continuing, trait, now, wakes));
		const glancing = choice.pose === "glance" || pending?.pose === "glance";
		const reactTo = !glancing ? undefined : choice.trigger === "round" ? round?.lead : (ripple.get(s.key)?.to ?? live?.reactTo);
		const m = mail[s.session.id];
		if (s.kind === "lead" && m?.mate && m.back !== undefined && now >= m.back) pair(m.key, m.mate);
		const rp = replies[s.session.id];
		if (s.kind === "lead" && rp?.mate && rp.back !== undefined && now >= rp.back) pair(rp.key, rp.mate);

		// A brick run: a builder with a new edit walks it to the build, sets it down, walks back.
		// How fast it walks, from how hot its work is (and its model's stride).
		const lastAt = Math.max(s.activity?.at ?? -Infinity, s.agent?.lastWriteAt ?? -Infinity);
		const gait = gaitOf(s, place.area);
		const run = doing ? undefined : brickRun(s, was, place, choice, runs, prev?.builds[s.session.id], visits, byKey, floor, now, gait.speed, rushing.has(s.session.id) ? RUSH.runShare : 1);
		if (run) {
			place = run.place;
			choice = { pose: "place", as: "lead", acted: true, ...(run.run.since === now ? { trigger: "run" } : {}) };
			wakes.push(run.run.lands);
		}

		// The same pose carries on; anything else starts now.
		const same = run
			? was !== undefined && !was.gone && was.pose === "place" && was.poseSince === run.run.since
			: doing
				? live !== undefined && live.pose === doing.pose && live.poseSince === doing.since
				: choice.since !== undefined
					? was !== undefined && !was.gone && was.pose === choice.pose && was.as === choice.as && was.poseSince === choice.since
					: was && !was.gone && was.pose === choice.pose && was.as === choice.as && !(choice.acted && !continuing);
		if (!same && choice.trigger) count[choice.trigger] = (count[choice.trigger] ?? 0) + 1;
		const once = POSE[choice.pose]?.play !== "loop";
		const poseSince = run ? run.run.since : doing ? doing.since : (choice.since ?? (same ? was!.poseSince : now));
		// Found mid-habit (or already stalled, or done) on arrival: start settled, costing nothing.
		const at: "start" | "end" = same ? was!.at : !was && once && !choice.acted && s.mood !== "busy" ? "end" : "start";

		// Movement.
		let walk: Actor["walk"];
		const arriving = !was || was.gone !== undefined;
		// A crew spot can move without changing its name, when a free cell nearby is taken or freed.
		const moved = was !== undefined && (was.slot.x !== place.slot.x || was.slot.y !== place.slot.y) && /^(crew|station|queue):/.test(place.spot);
		if (was && !arriving && !restaged && (was.area !== place.area || was.spot !== place.spot || moved)) {
			const from = here(was, now);
			const path = pathBetween(floor, was.area, from, place.area, place.slot);
			walk = { path, ms: walkMs(path, gait.speed), since: now };
			events.push({ type: "walk", key: s.key, at: now, from: was.spot, to: place.spot, ms: walk.ms });
		} else if (was && !arriving && !restaged && was.walk && now < was.walk.since + was.walk.ms) {
			walk = was.walk;
		} else if (arriving && !first && s.kind === "crew" && !place.spot.startsWith("crew:")) {
			// A new hire whose job is elsewhere (a reviewer) starts at its desk and walks there.
			const desk = floor.desks.get(s.session.id);
			if (desk) {
				const start = crewSlot(desk, 0);
				const path = pathBetween(floor, desk.areaId, start, place.area, place.slot);
				walk = { path, ms: walkMs(path, gait.speed), since: now };
				events.push({ type: "walk", key: s.key, at: now, from: "crew:0", to: place.spot, ms: walk.ms });
			}
		} else if (arriving && !first && s.kind === "lead") {
			// A new session walks in from the lobby door to its desk.
			const door = doorPlace(floor);
			if (door) {
				const path = pathBetween(floor, door.area, door.slot, place.area, place.slot);
				walk = { path, ms: walkMs(path, gait.speed), since: now };
			}
		}
		if (walk) wakes.push(walk.since + walk.ms);
		if (arriving) events.push({ type: "arrive", key: s.key, at: now, spot: place.spot, area: place.area, walk: walk !== undefined });

		if (!same) events.push({ type: "pose", key: s.key, at: now, pose: choice.pose, as: choice.as, acted: choice.acted });
		const tripWas = was && !was.gone ? was.trip : undefined;
		if (trip && tripWas?.station !== trip.station) events.push({ type: "trip", key: s.key, at: now, station: trip.station, state: trip.queue ? "queue" : "start" });
		else if (trip && tripWas && tripWas.queue > 0 && trip.queue === 0) events.push({ type: "trip", key: s.key, at: now, station: trip.station, state: "use" });
		if (tripWas && !trip) events.push({ type: "trip", key: s.key, at: now, station: tripWas.station, state: "end" });
		// Busy loops run at the character's own pace: quick while writing, slow when coasting.
		const pace = s.mood === "busy" && !choice.acted && POSE[choice.pose]?.play === "loop" ? Math.round(tempo(s.key, Number.isFinite(lastAt) ? lastAt : undefined, now) * trait.tempo * 100) / 100 : 1;

		if (choice.pose === "handover" && choice.as === "partner") events.push({ type: "handover", key: hiredBy.get(s.key)!, at: now, to: s.key });

		const inMeeting = place.spot.startsWith("meeting:");
		const wasMeeting = was?.spot.startsWith("meeting:") ?? false;
		if (inMeeting !== wasMeeting && (inMeeting || was)) events.push({ type: "review", key: s.key, at: now, state: inMeeting ? "start" : "end" });

		if (s.kind === "lead" && (s.seen.waiting !== undefined) !== (was?.seen.waiting !== undefined)) {
			if (s.seen.waiting !== undefined || was) events.push({ type: "waiting", key: s.key, at: now, state: s.seen.waiting !== undefined ? "start" : "end", area: floor.desks.get(s.session.id)?.areaId ?? place.area });
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
			work,
			tempo: pace,
			task: s.task,
			...(run ? { home: run.run.from, walkPose: "carry" } : trip ? { home: homes.get(s.key)!, trip } : {}),
			...(walk && walk === was?.walk ? (was.pace ? { pace: was.pace } : {}) : walk && gait.name !== "stroll" ? { pace: gait.name } : {}),
			...(!run && Object.hasOwn(handoffs, s.key) ? { home: handoffs[s.key]!.home } : {}),
			// A walk in a room in rush is a run with papers flying; an envelope is carried with care.
			...(!run && mailing.has(s.key) && now < mail[s.session.id]!.drops
				? { walkPose: MAIL.walkPose }
				: !run && walk && hotRooms.has(place.area)
					? { walkPose: RUSH.walkPose }
					: {}),
			...(handed.has(s.key) ? { handed: handed.get(s.key)! } : {}),
			...(doing && s.kind === "crew" ? { home: doing.from } : {}),
			...(doing?.walkPose ? { walkPose: doing.walkPose } : {}),
			// Story: the merged PR's reply is carried back with care, as the PR went (story.ts).
			...(!run && replying.has(s.key) && replyWalkPose(rp, now) ? { walkPose: replyWalkPose(rp, now)! } : {}),
			...(errand && now < errand.until ? { errand } : {}),
			...(q || (doing && s.kind === "lead") ? { homeArea: floor.desks.get(s.session.id)?.areaId } : {}),
			...(trait.walk !== 1 ? { stride: trait.walk } : {}),
			...(pending ? { pending } : {}),
			...(reactTo ? { reactTo } : {}),
			...(noticed !== undefined ? { noticed } : {}),
		};
		if (s.mood === "busy" && !choice.acted) {
			const w = tempoWake(lastAt, now);
			if (w !== undefined) wakes.push(w);
		}

		// When this picture changes on its own.
		if (choice.acted) wakes.push(poseSince + poseMs(choice.pose, choice.as) - overlapOf(trait, choice.pose));
		if (s.mood === "idle") wakes.push(habitAt(s.key, s.since, now, life, habitsOf(s)).wake);
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
		actors[key] = { ...was, area: to.area, spot: "door", slot: to.slot, walk: { path, ms, since: now, exit: true }, gone: now + ms, pace: undefined, stride: undefined, errand: undefined, pending: undefined };
		events.push({ type: "leave", key, at: now });
		if (was.spot.startsWith("meeting:")) events.push({ type: "review", key, at: now, state: "end" });
		if (was.kind === "lead" && was.seen.waiting !== undefined) events.push({ type: "waiting", key, at: now, state: "end", area: was.homeArea ?? was.area });
		wakes.push(now + ms);
	}

	// Yields: whoever stands on a desk's end place steps aside while a brick run to the build spot in
	// its gap is under way (from setting off to stepping away), then walks back when the run is over.
	// Only that one moves; the row stays as it is.
	for (const a of Object.values(actors)) {
		if (a.kind !== "crew" || a.gone !== undefined || !a.spot.startsWith("crew:") || a.home !== undefined) continue;
		const desk = floor.desks.get(a.session);
		const gap = desk && endGaps(floor, desk).find((g) => g.slot.x === a.slot.x && g.slot.y === a.slot.y);
		const run = gap?.builder !== undefined ? runs.active.get(gap.builder) : undefined;
		if (!gap || !run || now >= run.done || run.key === a.key) continue;
		const to = yieldFrom(gap.slot);
		const was = before[a.key];
		const there = was !== undefined && was.gone === undefined && was.slot.x === to.x && was.slot.y === to.y;
		// The loop just sent it back to the end place: that walk (and its event) is not happening.
		for (let i = events.length - 1; i >= 0; i--) {
			const e = events[i]!;
			if (e.type === "walk" && e.key === a.key && e.at === now) events.splice(i, 1);
		}
		let walk = there && was.walk && now < was.walk.since + was.walk.ms ? was.walk : undefined;
		if (!there) {
			const from = was && was.gone === undefined ? here(was, now) : a.slot;
			const path = pathBetween(floor, a.area, from, a.area, to);
			walk = { path, ms: walkMs(path), since: now };
			events.push({ type: "walk", key: a.key, at: now, from: a.spot, to: a.spot, ms: walk.ms });
			wakes.push(now + walk.ms);
		}
		const { walk: _, ...rest } = a;
		actors[a.key] = { ...rest, slot: to, yielding: true, ...(walk ? { walk } : {}) };
		wakes.push(run.done);
	}

	// Dodges: a walk starting now that would pass through another walker in its area sidesteps. Walks
	// whose timing something else counts on (a brick, a folder, an envelope, a leaver) keep their path.
	const timed = new Set([...runs.active.values()].map((r) => r.key));
	for (const h of Object.values(handoffs)) if (now < h.meets) timed.add(h.giver);
	for (const m of Object.values(mail)) timed.add(m.key);
	for (const key of replying) timed.add(key);
	const walkers = Object.values(actors)
		.filter((a) => a.walk && now < a.walk.since + a.walk.ms)
		.map((a) => ({ key: a.key, area: a.area, walk: a.walk!, free: a.walk!.since === now && !a.walk!.exit && a.gone === undefined && !timed.has(a.key) }));
	for (const [key, d] of dodges(walkers)) {
		const a = actors[key]!;
		actors[key] = { ...a, walk: { ...a.walk!, path: d.walk.path, ms: d.walk.ms } };
		for (const e of events) if (e.type === "walk" && e.key === key && e.at === now) e.ms = d.walk.ms;
		events.push({ type: "dodge", key, at: now, from: d.from });
		wakes.push(now + d.walk.ms);
	}

	// Who looks at whom while they stand there (social.ts); the cue carries it to the character.
	const looks = looksFor(actors, { now, floor, handoffs, pairs });
	for (const a of Object.values(actors)) {
		const l = looks.get(a.key);
		if (l !== undefined) actors[a.key] = { ...a, lookAt: l };
		else if (a.lookAt !== undefined) {
			const { lookAt: _, ...rest } = a;
			actors[a.key] = rest;
		}
	}
	for (const h of Object.values(handoffs)) for (const t of handOffWakes(h)) if (t > now) wakes.push(t);
	// Story: a send-off's wavers look at the one leaving, not at you (story.ts).
	for (const [key, leaver] of sendOffLooks(sendoffs, actors, now)) actors[key] = { ...actors[key]!, lookAt: leaver };

	const builds = buildsFor(list, prev?.builds ?? {}, failed, runs, now, events, wakes);
	const sessions = new Map(list.filter((s) => s.kind === "lead").map((s) => [s.session.id, s.session]));
	const metrics = metricsFor(sessions, metricsWas, actors, floor, queue, now);

	// Story: the log, and "while you were out" on a fresh return (story.ts).
	const log = logOf(prev?.story?.log, tale.entries, now);
	const headlines = headlinesFor(prev?.story?.headlines, log, view, first ? undefined : freshReturn(view, now), now);
	if (headlines) wakes.push(headlines.until);
	for (const s of Object.values(sendoffs)) wakes.push(s.until);
	const story: Story = { ...tale.memo, log };
	if (Object.keys(replies).length) story.replies = replies;
	if (Object.keys(sendoffs).length) story.sendoffs = sendoffs;
	if (headlines) story.headlines = headlines;

	const due = wakes.filter((t) => t > now);
	const world: World = { at: now, actors, builds, metrics, story, stage: staged };
	if (Object.keys(rush).length) world.rush = rush;
	if (Object.keys(handoffs).length) world.handoffs = handoffs;
	if (Object.keys(mail).length) world.mail = mail;
	return { world, events, wake: due.length ? Math.min(...due) : undefined };
}

/** How long a PR's celebration lasts, the longer of its two parts. */
const celebrateMs = () => Math.max(poseMs("celebrate", "lead"), poseMs("celebrate", "partner"));

/**
 * The hand-offs this direction: those still under way, and new ones. A giver is a busy crew member
 * leaving a station whose errand is a folder (it was using it, and its work no longer wants it); its
 * taker is a teammate at its own spot, standing still, whose work wants that same kind of station
 * and hasn't sent it there yet. The giver walks over; the two-hander starts when it gets there.
 */
function handOffsFor(
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
			return m.kind === "crew" && m.mood === "busy" && !hiredBy.has(m.key) && a && !a.trip && still(a) && places.get(m.key)?.spot.startsWith("crew:") && a.handed !== pre.get(m.key)!.work?.since;
		})
		.map((m) => ({ key: m.key, session: m.session.id, kind: stationKind(m, pre.get(m.key)!), since: pre.get(m.key)!.work?.since ?? now }));
	for (const s of list) {
		const a = live(s.key);
		const p = pre.get(s.key)!;
		if (s.kind !== "crew" || s.mood !== "busy" || !a?.trip || a.trip.queue !== 0 || out[s.key] || taken.has(s.key)) continue;
		if (p.news || p.continuing || p.follow || stationKind(s, p) === a.trip.kind) continue;
		const home = places.get(s.key);
		if (!home?.spot.startsWith("crew:")) continue;
		const taker = pickTaker({ key: s.key, session: s.session.id, kind: a.trip.kind }, takers.filter((t) => !out[t.key]), taken);
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
function takingAt(handoffs: Record<string, HandOff>, key: string, now: number): number | undefined {
	const h = Object.values(handoffs).find((x) => x.taker === key);
	return h && now >= h.meets ? h.meets : undefined;
}

/**
 * The leads walking a PR to the outbox. A new PR (a lead at its desk, not waiting on you, in a room
 * with an outbox) sets one off; it drops the envelope when it gets there and `mailDrop` has played,
 * then walks back to its desk and celebrates with a busy teammate (or alone).
 */
function mailFor(
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
function mailChoice(m: Mail, now: number, news: Choice | undefined): Choice {
	if (now < m.drops) return { pose: MAIL.pose, as: "lead", acted: true, ...(news?.trigger === "pr" ? { trigger: "pr" } : {}), since: m.since };
	return { pose: m.mate ? "celebrate" : "prOpened", as: "lead", acted: true, since: m.returns ?? now };
}

/** True while `key` plays its half of the celebration after the lead's walk back from the outbox. */
const celebratesMail = (m: Mail | undefined, key: string, now: number): boolean =>
	m !== undefined && m.mate === key && m.back !== undefined && now >= m.back && now < m.back + poseMs("celebrate", "partner");

/** How far into `place` the brick leaves the builder's hands: the end of the last frame that
 * still shows it (in a hand, or set down out front). The tower takes it from there. */
function handOffMs(): number {
	const frames = POSE.place?.frames ?? [];
	let t = 0;
	let end = 0;
	for (const f of frames) {
		t += f.ms;
		if (f.props.left === "brick" || f.props.right === "brick" || f.props.work === "brick") end = t;
	}
	return end || t;
}

/** What the director works out about each character before anyone moves. */
interface Pre {
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
function followUp(s: Spec, was: Actor | undefined, continuing: Actor | undefined): string | undefined {
	if (!was || continuing || !was.acted || was.pose !== STATION_POSE.test.bad) return undefined;
	return s.rig === "builder" ? "thumb" : "testFailed";
}

/** The station a crew member's work sends it to, if the tool in hand still says so. A shell
 * command or a test sends it to the copier or the stamp desk only while it runs. */
function stationKind(s: Spec, p: Pre): StationKind | undefined {
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
function tripsFor(
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

/** A long build at the copier: a running feud with it, looped until the build ends (instead of the
 * one-off kick, `STATION_POSE.build.bad`). */
export const COPIER_FEUD = "copierFeud";

/** At a station: its work pose (or the feud with the jammed copier on a long build); in its queue, waiting. */
function atStation(st: Choice, trip: Trip): Choice {
	if (trip.queue > 0) return { pose: TRIP.queuePose, as: "lead", acted: false };
	const pose = STATION_POSE[trip.kind];
	if (st.pose === "grumpy") return trip.kind === "build" ? { pose: COPIER_FEUD, as: "lead", acted: false } : st;
	return { pose: pose.work, as: "lead", acted: false };
}

/** Where each lead on its foreman's round stands: just behind one of its busy crew, looking on. */
function foremanVisits(list: Spec[], places: Map<string, Place>, now: number, wakes: number[], away: Set<string>): Map<string, Place> {
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
interface Runs {
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
function brickRun(
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
function buildsFor(
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
function stage(list: Spec[], places: Map<string, Place>, floor: Floor): void {
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
	pairUp(places, floor.areas.find((a) => a.kind === "kitchen"));
}

/** For each crew member startled by news (a red test, a teammate finishing): who it looks at (the
 * nearest one the news is about) and how long after the nearest glancer it looks up. */
function rippleFor(list: Spec[], startled: Map<string, Set<string>>, places: Map<string, Place>, before: Record<string, Actor>, now: number): Map<string, { to: string; delay: number }> {
	const out = new Map<string, { to: string; delay: number }>();
	for (const [session, news] of startled) {
		const from = [...news].map((k) => ({ key: k, at: before[k] ? here(before[k]!, now) : places.get(k)?.slot })).filter((n): n is { key: string; at: Point } => !!n.at);
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
function roundFor(s: Spec, actors: Record<string, Actor>, before: Record<string, Actor>, places: Map<string, Place>, trip: Trip | undefined, continuing: Actor | undefined, now: number, wakes: number[]): { lead: string; at: number } | undefined {
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
	const at = continuing?.pose === "glance" && continuing.reactTo === lead ? continuing.poseSince : w && before[lead]!.spot === a.spot && w.since + w.ms <= now ? w.since + w.ms : undefined;
	if (at === undefined || now >= at + poseMs("glance", "lead")) return undefined;
	if (continuing && continuing.poseSince !== at) return undefined;
	return { lead, at };
}
