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
import { buildSlot, crewSlot, crewSpot, crewSpots } from "../office/world";
import { choosePose, hash, unit } from "../rig/player";
import { HABITS, POSE, duration } from "../rig/poses";
import { type Role, roleFor } from "../rig/roles";
import type { Activity, Agent, Commands, RunningTool, Session, Snapshot } from "../../watcher/model";
import { type Point, along, pathBetween, walkMs } from "./paths";
import type { Actor, Build, Cue, Run, Seen, World, WorldEvent } from "./types";
import { WORK, WORK_POSE, type Work, isEdit, nextWork, tempo, tempoWake, workKind } from "./work";

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
	runEveryMs: 20_000,
	/** ...plus up to this much more, a share picked from the session's id. */
	runJitterMs: 8_000,
} as const;

/** How long a session waits between brick runs: 20 to 28 seconds, the same every time for its id. */
export const runCooldown = (session: string): number => RULES.runEveryMs + Math.floor(unit(session, "run") * RULES.runJitterMs);

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
					rig: roleFor(a.role),
					mood,
					size: crewSize(a.depth),
					tint: a.role,
					place: a.status === "running" && /review/i.test(a.role) ? "meeting" : mood === "done" ? "out" : "crew",
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
	// Each desk's crew spots, spaced so their work shows, spilling into free cells nearby.
	const spotsFor = new Map<string, Slot[]>();
	const crewPlace = (s: Spec, i: number): Place | undefined => {
		const desk = floor.desks.get(s.session.id);
		if (!desk) return undefined;
		let spots = spotsFor.get(desk.id);
		if (!spots) spotsFor.set(desk.id, (spots = crewSpots(floor, desk)));
		return { spot: `crew:${i}`, area: desk.areaId, slot: crewSpot(spots, desk, i) };
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
function standing(s: Spec, now: number, count: Record<string, number>, work?: Work): Choice {
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
	// A builder mid-swing hits its thumb instead.
	if (fresh(s.seen.failAt, was?.failAt)) return { pose: s.rig === "builder" && s.kind === "crew" ? "thumb" : "testFailed", as: "lead", acted: true, trigger: "fail" };
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

	// Brick runs under way (at most one per session), and who is out on one: the foreman doesn't
	// visit an empty spot.
	const runs: Runs = { active: new Map(), started: new Map(), dropped: new Set() };
	for (const [id, b] of Object.entries(prev?.builds ?? {})) if (b.run && now < b.run.done) runs.active.set(id, b.run);
	const away = new Set([...runs.active.values()].filter((r) => now < r.lands).map((r) => r.key));

	// The foreman's round: a lead whose crew is hard at it walks over to look.
	const visits = foremanVisits(list, places, now, wakes, away);
	for (const [key, v] of visits) places.set(key, v);

	// A PR with a teammate near: the lead celebrates with the first busy crew member at its desk.
	const celebrating = new Map<string, string>();

	for (const s of list) {
		let place = places.get(s.key);
		if (!place) continue;
		const was = before[s.key];
		const count = { ...(was?.count ?? {}) };
		const continuing = was && !was.gone && was.acted && now < was.poseSince + poseMs(was.pose, was.as) ? was : undefined;

		let choice: Choice;
		const news = acted(s, was?.seen, now);
		// What it is working on, by the tool in hand, held a few seconds so the pose doesn't flicker.
		const want = s.busy ? workKind(s.running, s.activity) : undefined;
		const work = s.busy ? nextWork(was?.gone ? undefined : was?.work, want, now) : undefined;
		if (work && want && want !== work.kind) wakes.push(work.since + WORK.holdMs);
		let st = standing(s, now, count, work);
		if (visits.has(s.key) && st.pose !== "grumpy") st = { pose: "inspect", as: "lead", acted: false };
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
		else if (!continuing && s.kind === "crew" && s.mood === "busy" && [...(startled.get(s.session.id) ?? [])].some((k) => k !== s.key))
			choice = { pose: "glance", as: "lead", acted: true, trigger: "glance" };
		else if (continuing) choice = { pose: continuing.pose, as: continuing.as, acted: true };
		else choice = st;

		// A brick run: a builder with a new edit walks it to the build, sets it down, walks back.
		const run = brickRun(s, was, place, choice, runs, prev?.builds[s.session.id], visits, byKey, floor, now);
		if (run) {
			place = run.place;
			choice = { pose: "place", as: "lead", acted: true, ...(run.run.since === now ? { trigger: "run" } : {}) };
			wakes.push(run.run.lands);
		}

		// The same pose carries on; anything else starts now.
		const same = run
			? was !== undefined && !was.gone && was.pose === "place" && was.poseSince === run.run.since
			: was && !was.gone && was.pose === choice.pose && was.as === choice.as && !(choice.acted && !continuing);
		if (!same && choice.trigger) count[choice.trigger] = (count[choice.trigger] ?? 0) + 1;
		const once = POSE[choice.pose]?.play !== "loop";
		const poseSince = run ? run.run.since : same ? was!.poseSince : now;
		// Found mid-habit (or already stalled, or done) on arrival: start settled, costing nothing.
		const at: "start" | "end" = same ? was!.at : !was && once && !choice.acted && s.mood !== "busy" ? "end" : "start";

		// Movement.
		let walk: Actor["walk"];
		const arriving = !was || was.gone !== undefined;
		// A crew spot can move without changing its name, when a free cell nearby is taken or freed.
		const moved = was !== undefined && (was.slot.x !== place.slot.x || was.slot.y !== place.slot.y) && place.spot.startsWith("crew:");
		if (was && !arriving && (was.area !== place.area || was.spot !== place.spot || moved)) {
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
		// Busy loops run at the character's own pace: quick while writing, slow when coasting.
		const lastAt = Math.max(s.activity?.at ?? -Infinity, s.agent?.lastWriteAt ?? -Infinity);
		const pace = s.mood === "busy" && !choice.acted && POSE[choice.pose]?.play === "loop" ? tempo(s.key, Number.isFinite(lastAt) ? lastAt : undefined, now) : 1;

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
			work,
			tempo: pace,
			task: s.task,
			...(run ? { home: run.run.from, walkPose: "carry" } : {}),
		};
		if (s.mood === "busy" && !choice.acted) {
			const w = tempoWake(lastAt, now);
			if (w !== undefined) wakes.push(w);
		}

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

	const builds = buildsFor(list, prev?.builds ?? {}, failed, runs, now, events, wakes);

	const due = wakes.filter((t) => t > now);
	return { world: { at: now, actors, builds }, events, wake: due.length ? Math.min(...due) : undefined };
}

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
		const m = crew[(Math.floor(t / every) + hash(s.key)) % crew.length]!;
		const p = places.get(m.key)!;
		// On the crew member's outer side, a step back, facing the same way: looking over its shoulder.
		const x = p.slot.x - p.slot.facing * 34;
		const y = p.slot.y - 10;
		out.set(s.key, { spot: `visit:${m.key}`, area: p.area, slot: { x, y, depth: y, facing: p.slot.facing } });
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
	if (build.ranAt !== undefined && now - build.ranAt < runCooldown(id)) return undefined;
	if (!was || was.gone || was.spot !== place.spot || !place.spot.startsWith("crew:")) return undefined;
	if (was.walk && now < was.walk.since + was.walk.ms) return undefined;
	const lead = `s:${id}`;
	if (byKey.get(lead)?.seen.waiting !== undefined || visits.get(lead)?.spot === `visit:${s.key}`) return undefined;
	const path = pathBetween(floor, place.area, here(was, now), there.area, there.slot);
	const ms = walkMs(path);
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
		if (!was && !(crew.some((m) => m.rig === "builder") || crew.length >= RULES.buildCrew)) continue;
		const seen: Record<string, number> = {};
		// A build found mid-session starts with a piece for each busy hand.
		let pieces = was ? was.pieces : Math.min(6, crew.filter((m) => m.busy).length);
		const started = runs.started.get(id);
		for (const m of members) {
			const who = m.agent?.id ?? "lead";
			const a = m.activity;
			if (a && isEdit(a.tool)) {
				seen[who] = a.at;
				// The runner's edit is in its hands: it goes on when the brick is set down.
				if (was && was.seen[who] !== a.at && started?.key !== m.key) pieces++;
			} else if (was?.seen[who] !== undefined) seen[who] = was.seen[who]!;
		}
		// The brick run: set down at the end of `place`; dropped if the runner stopped or left.
		let run = runs.active.get(id);
		if (run && run.carried && !started && !members.some((m) => m.key === run!.key && m.busy)) {
			runs.dropped.add(id);
			run = undefined;
		}
		const landed = !!run && run.carried && now >= run.lands;
		if (landed || runs.dropped.has(id)) pieces++;
		if (landed) run = { ...run!, carried: false };
		if (run) wakes.push(run.carried ? run.lands : run.done);
		pieces = Math.min(RULES.buildMax, pieces);
		const fell = failed.has(id) && pieces > 0;
		if (fell) pieces--;
		const session = members[0]!.session;
		const topped = (session.prs?.length ?? 0) > 0;
		// The fallen piece lies by the stack until the next one goes on.
		const added = !!was && !fell && pieces > was.pieces;
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
	};
}
