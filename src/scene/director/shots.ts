// Shots: where compact mode's camera looks (plan-alive stream E). The small window can't show the
// whole office at a size where hands and props read, so it cuts between rooms instead: to whatever
// just happened, held a while, and between news it rests on the busiest room. Pure and
// deterministic; the app feeds it and moves the camera only when the stop changes.
//
//   newsFrom(events, world, areaOf, yours) -> the director's events as news in a room
//   scoreByArea(sessions, builds, areaOf, now) -> how busy each project room is (heat, busy leads)
//   nextShot(prev, input)                  -> the shot after this moment: a stop, why, and until when
//   tilesFor(areas, score, rush, waiting)  -> the compact strip's room tiles and their state
//
// Priorities: waiting on you, then a red test, a PR, a rush starting, a compaction, a buried
// in-tray, a feud with the copier (or a grumpy long build). News holds its room for SHOTS.holdMs.
// Hysteresis, so the camera doesn't ping-pong: no cut within SHOTS.minMs of the last one; during a
// hold only news SHOTS.preempt more important cuts away (news in the room on screen just extends
// the hold, with no cut); and the rest shot moves to a busier room only after its own hold, when
// that room is SHOTS.restLead times busier.
import type { Session } from "../../watcher/model";
import { type Stop, sameStop } from "../world/camera";
import { heatOf } from "./rush";
import type { Build, World, WorldEvent } from "./types";
import { flatSessions } from "../../watcher/model";

export type NewsReason = "waiting" | "red" | "pr" | "rush" | "compaction" | "buried" | "feud";
/** Why the camera is where it is: news, or resting (the busiest room, waiting, all idle), or pinned. */
type Reason = NewsReason | "busiest" | "idle" | "pinned";

export const SHOTS = {
	/** News holds its room this long (unless something much more important happens). */
	holdMs: 20_000,
	/** No cut sooner than this after the last one. */
	minMs: 5_000,
	/** News older than this is no longer news. Longer than a hold, so news that waited one out still gets its turn. */
	freshMs: 30_000,
	/** During a hold, only news this much higher in priority cuts away. */
	preempt: 15,
	/** Resting, the camera moves to another room only once it is this many times busier. */
	restLead: 1.5,
	/** A busy session counts this much on top of its heat (a lead thinking makes no calls). */
	busyScore: 5,
	priority: { waiting: 100, red: 70, pr: 60, rush: 50, compaction: 40, buried: 30, feud: 20 } satisfies Record<NewsReason, number>,
} as const;

/** Acted (and standing) poses that are news, by what they mean. */
const POSE_NEWS: Record<string, NewsReason> = {
	prOpened: "pr",
	testFailed: "red",
	thumb: "red",
	stampRed: "red",
	stretch: "compaction",
	shred: "compaction",
	buried: "buried",
	copierFeud: "feud",
	copierKick: "feud",
	grumpy: "feud",
};

/** Something that just happened, in a room. */
export interface News {
	reason: NewsReason;
	area: string;
	at: number;
	/** Who it happened to (an actor key or a session id): with `at` and `reason`, its identity. */
	key: string;
}

const newsId = (n: News): string => `${n.reason}:${n.key}:${n.at}`;

export interface Shot {
	stop: Stop;
	/** The room it frames; none for the whole office. */
	area?: string;
	reason: Reason;
	/** When the camera cut here. */
	since: number;
	/** News holds until then; a rest shot reconsiders a busier room only after it. Infinity: pinned. */
	until: number;
	pinned: boolean;
	/** The news it is showing, if any. */
	news?: string;
}

export interface ShotState {
	shot: Shot;
	/** News already shown (ids), so a hold that ends doesn't cut back to it. */
	shown: string[];
}

/** A room the camera can go to, in reading order. */
export interface ShotArea {
	id: string;
	kind: string;
}

export interface ShotInput {
	now: number;
	/** Recent news (older items are ignored). */
	news: News[];
	areas: ShotArea[];
	/** How busy each project room is (scoreByArea). */
	score: Record<string, number>;
	/** Someone is waiting on you: the camera rests on your office. */
	waiting: boolean;
	/** A room the person pinned: the camera stays there. */
	pinned?: string;
	/** Start over (the first pick, or back on screen): cut straight to the most important thing. */
	fresh?: boolean;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const roomStop = (id: string): Stop => ({ kind: "room", id });
const priorityOf = (s: Shot) => (s.news ? SHOTS.priority[s.reason as NewsReason] : 0);

/** Where to rest between news: your office while someone waits, else the busiest room, else everything. */
function restFor(input: ShotInput): { stop: Stop; area?: string; reason: Reason } {
	const yours = input.areas.find((a) => a.kind === "yours");
	if (input.waiting && yours) return { stop: roomStop(yours.id), area: yours.id, reason: "waiting" };
	let best: ShotArea | undefined;
	for (const a of input.areas) if ((input.score[a.id] ?? 0) > (best ? input.score[best.id]! : 0)) best = a;
	return best ? { stop: roomStop(best.id), area: best.id, reason: "busiest" } : { stop: { kind: "office" }, reason: "idle" };
}

/** The shot after this moment. Returns `prev` itself when nothing changes. */
export function nextShot(prev: ShotState | undefined, input: ShotInput): ShotState {
	const { now } = input;
	const exists = (id: string | undefined) => id === undefined || input.areas.some((a) => a.id === id);
	const shown = prev?.shown ?? [];

	if (input.pinned !== undefined && input.areas.some((a) => a.id === input.pinned)) {
		if (prev?.shot.pinned && prev.shot.area === input.pinned) return prev;
		return { shot: { stop: roomStop(input.pinned), area: input.pinned, reason: "pinned", since: now, until: Infinity, pinned: true }, shown };
	}

	const cur = prev && !prev.shot.pinned && !input.fresh && exists(prev.shot.area) ? prev.shot : undefined;
	const settled = !cur || now - cur.since >= SHOTS.minMs;
	const holding = !!cur?.news && now < cur.until;
	const seen = new Set(shown);
	const fresh = input.news
		.filter((n) => n.at <= now && now - n.at <= SHOTS.freshMs && exists(n.area) && !seen.has(newsId(n)))
		.sort((a, b) => SHOTS.priority[b.reason] - SHOTS.priority[a.reason] || b.at - a.at || cmp(a.area, b.area) || cmp(a.key, b.key));
	// Showing news marks everything fresh in that room as seen: one cut covers a red stamp and the
	// tower piece it knocked off. The list keeps only what is still fresh.
	const live = new Set(input.news.filter((n) => now - n.at <= SHOTS.freshMs).map(newsId));
	const mark = (area: string) => [...shown.filter((id) => live.has(id)), ...fresh.filter((n) => n.area === area).map(newsId)];

	const best = fresh[0];
	if (best) {
		// News in the room on screen: no cut, just a longer hold (and the weightier reason).
		if (cur && cur.area === best.area && cur.stop.kind === "room") {
			const reason = priorityOf(cur) >= SHOTS.priority[best.reason] ? cur.reason : best.reason;
			return { shot: { ...cur, reason, until: now + SHOTS.holdMs, news: newsId(best) }, shown: mark(best.area) };
		}
		if (!cur || (settled && (!holding || SHOTS.priority[best.reason] - priorityOf(cur) >= SHOTS.preempt))) {
			return { shot: { stop: roomStop(best.area), area: best.area, reason: best.reason, since: now, until: now + SHOTS.holdMs, pinned: false, news: newsId(best) }, shown: mark(best.area) };
		}
	}
	if (cur && holding) return prev!;

	const rest = restFor(input);
	const restShot = (): ShotState => ({ shot: { stop: rest.stop, ...(rest.area ? { area: rest.area } : {}), reason: rest.reason, since: now, until: now + SHOTS.holdMs, pinned: false }, shown });
	if (!cur) return restShot();
	if (sameStop(cur.stop, rest.stop)) {
		// Same room, maybe a new reason (the wait ended but the room is still the busiest): no cut.
		if (cur.reason === rest.reason && !cur.news) return prev!;
		return { shot: { ...cur, reason: rest.reason, news: undefined, until: cur.news ? now + SHOTS.holdMs : cur.until }, shown };
	}
	if (!settled) return prev!;
	// Resting on a room that is still busy: move only after the hold, to a room clearly busier.
	if (!cur.news && cur.reason === "busiest" && rest.reason === "busiest") {
		const here = input.score[cur.area!] ?? 0;
		if (here > 0 && (now < cur.until || input.score[rest.area!]! < here * SHOTS.restLead)) return prev!;
	}
	return restShot();
}

/** When the shot changes on its own: a news hold ending. (Rest shots change only with new input.) */
export function shotWake(s: ShotState | undefined, now: number): number | undefined {
	return s?.shot.news && Number.isFinite(s.shot.until) && s.shot.until > now ? s.shot.until : undefined;
}

/**
 * The director's events as news. Pose news is placed where the actor stands; build and rush news
 * in the session's room (`areaOf`); a wait starting at your office (`yours`), where the queue is.
 */
export function newsFrom(events: WorldEvent[], world: World | undefined, areaOf: (session: string) => string | undefined, yours?: string): News[] {
	const out: News[] = [];
	for (const e of events) {
		if (e.type === "pose") {
			const reason = POSE_NEWS[e.pose];
			const a = world?.actors[e.key];
			if (reason && a && !a.gone) out.push({ reason, area: a.area, at: e.at, key: e.key });
		} else if (e.type === "build" && (e.change === "top" || e.change === "fall")) {
			const area = areaOf(e.session);
			if (area) out.push({ reason: e.change === "top" ? "pr" : "red", area, at: e.at, key: e.session });
		} else if (e.type === "rush" && e.state === "start") {
			const area = areaOf(e.session);
			if (area) out.push({ reason: "rush", area, at: e.at, key: e.session });
		} else if (e.type === "waiting" && e.state === "start") {
			out.push({ reason: "waiting", area: yours ?? e.area, at: e.at, key: e.key });
		}
	}
	return out;
}


/** How busy each project room is: its sessions' heat (rush.ts), plus a little per busy session. */
export function scoreByArea(sessions: Session[], builds: Record<string, Build>, areaOf: (session: string) => string | undefined, now: number): Record<string, number> {
	const score: Record<string, number> = {};
	for (const s of flatSessions(sessions)) {
		const area = areaOf(s.id);
		if (!area) continue;
		const n = heatOf(s, builds[s.id]?.edits, now) + (s.state === "busy" ? SHOTS.busyScore : 0);
		score[area] = (score[area] ?? 0) + n;
	}
	return score;
}

type TileState = "waiting" | "rush" | "busy" | "idle";

export interface Tile {
	id: string;
	name: string;
	kind: string;
	state: TileState;
}

/** The compact strip's tiles: every room, tinted by the most pressing thing in it. */
export function tilesFor(areas: (ShotArea & { name: string })[], score: Record<string, number>, rush: Set<string>, waiting: Set<string>): Tile[] {
	return areas.map((a) => ({
		id: a.id,
		name: a.name,
		kind: a.kind,
		state: waiting.has(a.id) ? "waiting" : rush.has(a.id) ? "rush" : (score[a.id] ?? 0) > 0 ? "busy" : "idle",
	}));
}
