import { LEAD_SIZE } from "../world/placement";
import { habitsFor } from "../world/staging";
import type { Floor } from "../world/world";
import { crewSlot, endGaps, useFor, yieldFrom } from "../world/world";
import { POSE, poseMs } from "../rig/data/poses";
import type { Snapshot } from "../../watcher/model";
import { beat, flourishAfter, overlapOf } from "./beats";
import { habitAt } from "./habits";
import { dodges } from "./dodge";
import { atYourDoor, errandPlace, errandUnderWay, newErrands, ongoingErrands, queueUp } from "./errands";
import { HANDOFF, MAIL, handOffSlot } from "./handoff";
import { NO_METRICS, metricsFor, trayFor } from "./metrics";
import { type Pace, PACE, RUNS, runCooldown } from "./pace";
import { RUSH, type Rush, heatOf, nextDash, nextRush, rushWake } from "./rush";
import { pathBetween, walkMs } from "../world/paths";
import { STATION_POSE } from "../world/stations";
import { tripPlace } from "./trips";
import type { Actor, World, WorldEvent } from "./types";
import { WORK, nextWork, tempo, tempoWake, workKind } from "./work";
import { HANDOFF_LOOK, NOTICE, NOTICE_POSES, type View, freshReturn, handOffWakes, looksFor, noticeDelay, readyAt, waverOf } from "./social";
import {
	STORY,
	type Story,
	cheersReply,
	headlinesFor,
	logOf,
	replyChoice,
	replyPlace,
	replyWakes,
	replyWalkPose,
	repliesFor,
	sendOffHold,
	sendOffLooks,
	sendOffsFor,
	storyNews,
} from "./story";
import { MIN } from "../../shared/time";
import { type Spec, gaitBase, specs, traitFor } from "./direct/specs";
import { assign, doorPlace } from "./direct/places";
import { type Choice, acted, standing } from "./direct/choice";
import { celebrateMs, celebratesMail, handOffsFor, mailChoice, mailFor, takingAt } from "./direct/handoff-mail";
import { type Pre, followUp, tripsFor } from "./direct/station-trips";
import { type Runs, atStation, brickRun, buildsFor, foremanVisits } from "./direct/builds";
import { here, rippleFor, roundFor, stage } from "./direct/cue";

export { runCooldown };
export type { View };

/** Crew that just finished alongside a teammate from the same session: a cheer together. */
function finishedTogether(s: Spec, list: Spec[], now: number): boolean {
	if (s.kind !== "crew" || now - s.since > RULES.cheerMs || now < s.since) return false;
	return list.some(
		(m) => m !== s && m.kind === "crew" && m.mood === "done" && m.session.id === s.session.id && Math.abs(m.since - s.since) <= RULES.togetherMs,
	);
}

/** When signals turn into poses. */
export const RULES = {
	/** A shell command running this long makes its owner grumpy at the build. */
	longBuildMin: 20,
	/** Any other tool running this long reads as thinking hard. */
	thinkingMin: 2,
	/** ...and this long, it nods off on its feet, then jolts awake (`asleep`). */
	dozeMin: 8,
	/** Crew that finish within this of a teammate celebrate together, for this long after. */
	togetherMs: 10_000,
	cheerMs: 30_000,
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
	const list = specs(snap, now);
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
		pre.set(s.key, {
			want,
			work,
			news: acted(s, was?.seen, now),
			continuing,
			follow: followUp(s, live, continuing) ?? flourishAfter(live, continuing, traitFor(s)),
		});
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
				mates: list
					.filter((m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && places.get(m.key)?.spot.startsWith("crew:"))
					.map((m) => m.key),
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
		const crew = list.filter(
			(m) => m.session.id === s.session.id && m.kind === "crew" && m.mood === "busy" && places.has(m.key) && !Object.hasOwn(handoffs, m.key),
		);
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
	const fresh = newErrands({
		list,
		places,
		before,
		floor,
		metrics: metricsWas,
		ongoing,
		busyElsewhere: away,
		now,
		first,
		speed: (m) => gaitBase(m as Spec, now).speed,
	});
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
			if ((s.kind === "lead" && s.mood === "idle" && s.seen.waiting === undefined) || (s.kind === "crew" && s.mood === "done" && places.has(s.key)))
				lookers.push(s.key);
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
		if (
			s.kind === "lead" &&
			s.busy &&
			!st.trigger &&
			place.spot === "desk" &&
			st.pose !== "grumpy" &&
			st.pose !== "thinking" &&
			trayFor(s.session.context)?.buried
		)
			st = { pose: "buried", as: "lead", acted: false };
		if (visits.has(s.key) && st.pose !== "grumpy") st = { pose: "inspect", as: "lead", acted: false };
		if (trip) st = atStation(st, trip);
		// One wait keeps one pose: the rare roll happens once, when the wait starts.
		if (st.trigger === "waiting" && was && !was.gone && was.seen.waiting === s.seen.waiting) st = { ...st, pose: was.pose };
		const round = roundFor(s, actors, before, places, trip, continuing, now, wakes);
		// Seen finishing (busy last time, or already cheering): a crew found finished just stands.
		if (s.mood === "done" && (was?.mood === "busy" || was?.pose === "celebrate") && finishedTogether(s, list, now))
			choice = { pose: "celebrate", as: "lead", acted: true, trigger: "together", since: s.since };
		else if (s.mood === "stalled" || s.mood === "done" || st.trigger === "waiting") choice = st;
		else if (hiredBy.has(s.key)) choice = { pose: "handover", as: "partner", acted: true, trigger: "hired" };
		else if (handing.has(s.key)) choice = { pose: "handover", as: "lead", acted: true, trigger: "hire" };
		else if (mailing.has(s.key)) choice = mailChoice(mail[s.session.id]!, now, news);
		// Story: fetching a merged PR's reply, and the teammate who celebrates it (story.ts).
		else if (replying.has(s.key)) choice = replyChoice(replies[s.session.id]!, now);
		else if (cheersReply(replies[s.session.id], s.key, now))
			choice = { pose: STORY.cheer, as: "partner", acted: true, trigger: "reply", since: replies[s.session.id]!.back! };
		else if (celebratesMail(mail[s.session.id], s.key, now))
			choice = { pose: "celebrate", as: "partner", acted: true, trigger: "pr", since: mail[s.session.id]!.back! };
		else if (Object.hasOwn(handoffs, s.key)) choice = { pose: HANDOFF.pose, as: "lead", acted: true, trigger: "handoff", since: handoffs[s.key]!.since };
		else if (takers.has(s.key) && takingAt(handoffs, s.key, now) !== undefined)
			choice = { pose: HANDOFF.pose, as: "partner", acted: true, trigger: "handoff", since: takingAt(handoffs, s.key, now)! };
		// The folder's nearly here: a hand goes up for it (social.ts).
		else if (takers.has(s.key) && readyAt(handoffs, s.key, now) !== undefined)
			choice = { pose: HANDOFF_LOOK.pose, as: "lead", acted: true, trigger: "ready", since: readyAt(handoffs, s.key, now)! };
		else if (news?.trigger === "pr") {
			const mate = list.find(
				(m) =>
					m.session.id === s.session.id &&
					m.kind === "crew" &&
					m.mood === "busy" &&
					places.get(m.key)?.spot.startsWith("crew:") &&
					!celebrating.has(m.key) &&
					!hiredBy.has(m.key),
			);
			if (s.kind === "lead" && mate) {
				celebrating.set(mate.key, s.key);
				pair(mate.key, s.key);
				choice = { pose: "celebrate", as: "lead", acted: true, trigger: "pr" };
			} else choice = news;
		} else if (celebrating.has(s.key)) choice = { pose: "celebrate", as: "partner", acted: true, trigger: "pr" };
		else if (news?.trigger === "fail" && trip?.queue === 0 && trip.kind === "test")
			choice = { pose: STATION_POSE.test.bad!, as: "lead", acted: true, trigger: "fail" };
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
		if (continuing && NOTICE_POSES.has(continuing.pose) && continuing.pose !== NOTICE.ticket)
			choice = { pose: continuing.pose, as: continuing.as, acted: true };
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
			} else if (!rare && !door.acted && continuing?.pose === NOTICE.ticket)
				choice = { pose: NOTICE.ticket, as: "lead", acted: true, since: continuing.poseSince };
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
		} else if (!q && !doing && choice.trigger === "glance" && (ripple.get(s.key)?.delay ?? 0) > 0)
			held = { pose: "glance", delay: ripple.get(s.key)!.delay, trigger: "glance" };
		// Story: waving a long session off, the nearest first (story.ts).
		else if (!q && !doing && !mailing.has(s.key) && !replying.has(s.key) && sendOffHold(sendoffs, s.key, now))
			held = { pose: STORY.sendoff, delay: sendOffHold(sendoffs, s.key, now)!.delay, trigger: "sendoff" };
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
		const run = doing
			? undefined
			: brickRun(
					s,
					was,
					place,
					choice,
					runs,
					prev?.builds[s.session.id],
					visits,
					byKey,
					floor,
					now,
					gait.speed,
					rushing.has(s.session.id) ? RUSH.runShare : 1,
				);
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
		if (trip && tripWas?.station !== trip.station)
			events.push({ type: "trip", key: s.key, at: now, station: trip.station, state: trip.queue ? "queue" : "start" });
		else if (trip && tripWas && tripWas.queue > 0 && trip.queue === 0)
			events.push({ type: "trip", key: s.key, at: now, station: trip.station, state: "use" });
		if (tripWas && !trip) events.push({ type: "trip", key: s.key, at: now, station: tripWas.station, state: "end" });
		// Busy loops run at the character's own pace: quick while writing, slow when coasting.
		const pace =
			s.mood === "busy" && !choice.acted && POSE[choice.pose]?.play === "loop"
				? Math.round(tempo(s.key, Number.isFinite(lastAt) ? lastAt : undefined, now) * trait.tempo * 100) / 100
				: 1;

		if (choice.pose === "handover" && choice.as === "partner") events.push({ type: "handover", key: hiredBy.get(s.key)!, at: now, to: s.key });

		const inMeeting = place.spot.startsWith("meeting:");
		const wasMeeting = was?.spot.startsWith("meeting:") ?? false;
		if (inMeeting !== wasMeeting && (inMeeting || was)) events.push({ type: "review", key: s.key, at: now, state: inMeeting ? "start" : "end" });

		if (s.kind === "lead" && (s.seen.waiting !== undefined) !== (was?.seen.waiting !== undefined)) {
			if (s.seen.waiting !== undefined || was)
				events.push({
					type: "waiting",
					key: s.key,
					at: now,
					state: s.seen.waiting !== undefined ? "start" : "end",
					area: floor.desks.get(s.session.id)?.areaId ?? place.area,
				});
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
			...(s.plump ? { plump: s.plump } : {}),
			...(s.weather ? { weather: s.weather } : {}),
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
		actors[key] = {
			...was,
			area: to.area,
			spot: "door",
			slot: to.slot,
			walk: { path, ms, since: now, exit: true },
			gone: now + ms,
			pace: undefined,
			stride: undefined,
			errand: undefined,
			pending: undefined,
		};
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
	const metrics = metricsFor(sessions, metricsWas, actors, floor, queue, now, wakes);

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
