// Story and continuity (plan-alive wave 3): the beats that make the office remember. Pure and
// deterministic, like the rest of the director; direct.ts calls in at a few clearly marked places.
//
//   reply      a PR the session opened is merged: a reply envelope lands in the room's outbox, the
//              lead walks over, takes it out, carries it back to the desk and celebrates (with a busy
//              teammate, or with a wave to you). The framed PR on the wall is the office's
//              (office/story.ts, from the diary).
//   redeemed   a red test streak (DIARY.reds failed runs in a row) goes green: the one who fixed it
//              does a little flourish, and its crew look up at it (the same ripple a red test makes).
//   send-off   a long session (DIARY.longMs) ends: as its lead walks out, whoever stands in its room
//              (and in the lobby and kitchen, by the door) waves it off, the nearest first, looking
//              at it as it goes.
//   regulars   the same project and role is the same character every day (`regularsOf`; rig/data/roles.ts
//              says what a regular looks like and is called)
//   headlines  back on screen after a while away (the director's `view`), the lobby board says what
//              happened while you were out: counts of the beats above, kept a minute and a half.
//
// The memory the beats need between snapshots (merged PRs seen, each one's red tests in a row, which
// sessions are long) lives in `World.story`, so a replay gives the same story.
import { LEAD_SIZE } from "../world/placement";
import type { Slot, Floor } from "../world/world";
import { useFor } from "../world/world";
import { poseMs } from "../rig/data/poses";
import { roleFor } from "../rig/data/roles";
import { DIARY, projectKey } from "../../shared/diary";
import type { Commands, Session, Snapshot } from "../../watcher/model";
import { pathBetween, walkMs } from "../world/paths";
import type { View } from "./social";
import type { Actor, WorldEvent } from "./types";
import { flatSessions } from "../../watcher/model";

export const STORY = {
	/** The lead's part at the outbox: reaching in for the reply. */
	takePose: "mailDrop",
	/** Walking the reply back to the desk. */
	walkPose: "envelopeCarry",
	/** Back at the desk with a teammate near... */
	cheer: "celebrate",
	/** ...or alone: a wave to you. */
	alone: "wave",
	/** A red streak gone green. */
	redeemed: "flourish",
	/** Waving a long session off. */
	sendoff: "wave",
	/** At most this many wave, the nearest first, this far apart (and the first after `firstMs`). */
	wavers: 5,
	firstMs: 300,
	stepMs: 260,
	/** The lobby board's "while you were out" stays up this long. */
	headlineMs: 90_000,
	/** The log keeps this much history, and at most this many entries. */
	logMs: 12 * 3_600_000,
	logMax: 200,
} as const;

/** What the story logs, for the headlines. */
export type StoryKind = "opened" | "merged" | "redeemed" | "sendoff" | "finished";

export interface StoryEntry {
	kind: StoryKind;
	at: number;
}

/** A lead fetching a merged PR's reply from the outbox, kept by session id. */
export interface Reply {
	key: string;
	station: string;
	pr: number;
	/** Sets off for the outbox. */
	since: number;
	/** Has the reply in hand (there, and `takePose` played): the walk back starts. */
	takes: number;
	/** The walk back started. */
	returns?: number;
	/** Back at the desk: the celebration starts. */
	back?: number;
	/** The teammate it celebrates with, if any. */
	mate?: string;
}

/** A long session's lead walking out, and who waves it off: by the leaver's key. */
export interface SendOff {
	at: number;
	/** The leaver is gone after this. */
	until: number;
	wavers: { key: string; delay: number }[];
}

/** "While you were out": the beats between going off screen and coming back, counted. */
export interface Headlines {
	/** When you came back (the view's `back`). */
	at: number;
	/** When you went (the view's `since`). */
	since: number;
	until: number;
	counts: Partial<Record<StoryKind, number>>;
}

export interface Story {
	/** Merged PR numbers seen, and every PR number seen, by session id. */
	merged: Record<string, number[]>;
	prs: Record<string, number[]>;
	/** Each character's last test result seen (its time) and its failed runs in a row, by key. */
	tests: Record<string, { at: number; reds: number }>;
	/** Leads whose session has run long enough for a send-off. */
	long: string[];
	replies?: Record<string, Reply>;
	sendoffs?: Record<string, SendOff>;
	log: StoryEntry[];
	headlines?: Headlines;
}

/** What story.ts needs to know about each character. */
export interface Member {
	key: string;
	kind: "lead" | "crew";
	session: Session;
	commands?: Commands;
}

/** The news this direction: what direct.ts acts on. */
export interface StoryNews {
	/** Leads with a newly merged PR (its number), by session id. */
	merged: Map<string, number>;
	/** Characters whose red streak just went green. */
	redeemed: Set<string>;
	/** Long sessions' leads walking out now. */
	leaving: string[];
	/** The memory for the next direction (before the replies, send-offs and log are added). */
	memo: Pick<Story, "merged" | "prs" | "tests" | "long">;
	/** What to log. */
	entries: StoryEntry[];
}

const mergedOf = (s: Session) =>
	(s.prs ?? [])
		.filter((p) => p.state?.toUpperCase() === "MERGED")
		.map((p) => p.number)
		.sort((a, b) => a - b);

/**
 * Read the snapshot's story news. A world with no story yet (the first snapshot, or an older
 * recording's world) only remembers: what is already merged or red is history, not news.
 */
export function storyNews(was: Story | undefined, list: Member[], before: Record<string, Actor>, now: number): StoryNews {
	const quiet = was === undefined;
	const memo: StoryNews["memo"] = { merged: {}, prs: {}, tests: {}, long: [] };
	const out: StoryNews = { merged: new Map(), redeemed: new Set(), leaving: [], memo, entries: [] };
	const here = new Set(list.map((m) => m.key));
	for (const m of list) {
		const t = m.commands?.last;
		const prev = was?.tests[m.key];
		if (t?.kind === "test") {
			if (prev?.at === t.at) memo.tests[m.key] = prev;
			else if (t.exitCode !== 0) memo.tests[m.key] = { at: t.at, reds: prev ? prev.reds + 1 : Math.max(1, m.commands?.failStreak ?? 1) };
			else {
				if (!quiet && prev && prev.reds >= DIARY.reds) {
					out.redeemed.add(m.key);
					out.entries.push({ kind: "redeemed", at: now });
				}
				memo.tests[m.key] = { at: t.at, reds: 0 };
			}
		} else if (prev) memo.tests[m.key] = prev;
		if (m.kind !== "lead") continue;
		const id = m.session.id;
		const merged = mergedOf(m.session);
		const prs = (m.session.prs ?? []).map((p) => p.number).sort((a, b) => a - b);
		memo.merged[id] = merged;
		memo.prs[id] = prs;
		if (!quiet) {
			const fresh = merged.filter((n) => !(was.merged[id] ?? []).includes(n));
			if (fresh.length && was.prs[id] !== undefined) {
				out.merged.set(id, fresh[fresh.length - 1]!);
				for (const _ of fresh) out.entries.push({ kind: "merged", at: now });
			}
			if (was.prs[id] !== undefined) for (const n of prs) if (!was.prs[id]!.includes(n)) out.entries.push({ kind: "opened", at: now });
		}
		if (now - m.session.startedAt >= DIARY.longMs) memo.long.push(m.key);
	}
	if (!quiet) {
		for (const [key, a] of Object.entries(before)) {
			if (a.kind !== "lead" || a.gone !== undefined || here.has(key)) continue;
			out.entries.push({ kind: "finished", at: now });
			if (was.long.includes(key)) {
				out.leaving.push(key);
				out.entries.push({ kind: "sendoff", at: now });
			}
		}
	}
	return out;
}

const cheerMs = () => Math.max(poseMs(STORY.cheer, "lead"), poseMs(STORY.cheer, "partner"), poseMs(STORY.alone));

/** A lead that might fetch a reply. */
export interface ReplyLead {
	key: string;
	session: string;
	/** Where it is placed this direction (its desk, unless something else has it). */
	place?: { spot: string; area: string; slot: Slot };
	waiting: boolean;
	/** Busy crew at their crew spots, who might celebrate with it. */
	mates: string[];
}

/**
 * The replies under way, and new ones. A newly merged PR sends its lead (at its desk, not waiting on
 * you, not walking a PR of its own to the outbox) to the room's outbox; it takes the reply out when
 * it gets there and `takePose` has played, walks back and celebrates.
 */
export function repliesFor(x: {
	leads: ReplyLead[];
	news: StoryNews;
	was: Record<string, Reply>;
	before: Record<string, Actor>;
	/** Leads busy with something else that has its own timing (the outbox's own walk). */
	busy: Set<string>;
	floor: Floor;
	now: number;
	/** World px per second for this lead walking into this area. */
	speed: (key: string, area: string) => number;
	where: (a: Actor, now: number) => { x: number; y: number };
	events: WorldEvent[];
}): Record<string, Reply> {
	const out: Record<string, Reply> = {};
	const { now, floor } = x;
	for (const l of x.leads) {
		const a = x.before[l.key];
		if (!a || a.gone !== undefined) continue;
		let r: Reply | undefined = x.was[l.session];
		if (r && r.back !== undefined && now >= r.back + cheerMs()) r = undefined;
		const pr = x.news.merged.get(l.session);
		if (!r && pr !== undefined && !l.waiting && !x.busy.has(l.key) && l.place?.spot === "desk") {
			const st = floor.areas.find((ar) => ar.id === l.place!.area)?.stations?.find((s) => s.kind === "outbox");
			if (!st) continue;
			const path = pathBetween(floor, a.area, x.where(a, now), st.areaId, useFor(st, LEAD_SIZE));
			r = { key: l.key, station: st.id, pr, since: now, takes: now + walkMs(path, x.speed(l.key, st.areaId)) + poseMs(STORY.takePose) };
			x.events.push({ type: "trip", key: l.key, at: now, station: st.id, state: "start" });
		}
		if (!r) continue;
		if (now >= r.takes && r.returns === undefined && l.place) {
			const path = pathBetween(floor, a.area, x.where(a, now), l.place.area, l.place.slot);
			const back = now + walkMs(path, x.speed(l.key, l.place.area));
			r = { ...r, returns: now, back, ...(l.mates[0] ? { mate: l.mates[0] } : {}) };
			x.events.push({ type: "trip", key: l.key, at: now, station: r.station, state: "end" });
		}
		out[l.session] = r;
	}
	return out;
}

/** Where a lead fetching a reply stands now: at the outbox until it has it (then its own place). */
export function replyPlace(r: Reply, floor: Floor, now: number): { spot: string; area: string; slot: Slot } | undefined {
	if (now >= r.takes) return undefined;
	const st = floor.areas.flatMap((a) => a.stations ?? []).find((s) => s.id === r.station);
	return st ? { spot: `station:${st.id}`, area: st.areaId, slot: useFor(st, LEAD_SIZE) } : undefined;
}

/** The fetching lead's pose: reaching into the outbox, then (from the walk back) the celebration. */
export function replyChoice(r: Reply, now: number): { pose: string; as: "lead"; acted: true; since: number; trigger?: string } {
	if (now < r.takes) return { pose: STORY.takePose, as: "lead", acted: true, since: r.since, ...(r.since === now ? { trigger: "reply" } : {}) };
	return { pose: r.mate ? STORY.cheer : STORY.alone, as: "lead", acted: true, since: r.returns ?? now };
}

/** True while `key` plays the partner's half of a reply's celebration. */
export const cheersReply = (r: Reply | undefined, key: string, now: number): boolean =>
	r !== undefined && r.mate === key && r.back !== undefined && now >= r.back && now < r.back + poseMs(STORY.cheer, "partner");

/** The times a reply changes on its own. */
export const replyWakes = (r: Reply): number[] => [r.takes, ...(r.back !== undefined ? [r.back, r.back + cheerMs()] : [])];

/** The walk pose of a lead on a reply's walk back. */
export const replyWalkPose = (r: Reply | undefined, now: number): string | undefined =>
	r && r.returns !== undefined && r.back !== undefined && now < r.back ? STORY.walkPose : undefined;

/**
 * Who waves off each long session leaving now: whoever stands still in its room, the lobby or the
 * kitchen, the nearest to it first, a beat apart. The leaver's crew leave with it, so they don't wave.
 */
export function sendOffsFor(x: {
	leaving: string[];
	was: Record<string, SendOff>;
	before: Record<string, Actor>;
	/** Everyone on stage this direction, and where they are placed. */
	places: Map<string, { area: string; slot: Slot }>;
	floor: Floor;
	now: number;
	/** How long the leaver's walk out takes (it ends with it gone). */
	walkOut: (a: Actor) => number;
}): Record<string, SendOff> {
	const out: Record<string, SendOff> = {};
	for (const [key, s] of Object.entries(x.was)) if (x.now < s.until) out[key] = s;
	const common = new Set(x.floor.areas.filter((a) => a.kind === "lobby" || a.kind === "kitchen").map((a) => a.id));
	for (const key of x.leaving) {
		const a = x.before[key];
		if (!a) continue;
		const room = a.homeArea ?? a.area;
		const cands: { key: string; d: number }[] = [];
		for (const [k, p] of x.places) {
			const b = x.before[k];
			if (!b || b.gone !== undefined || b.session === a.session) continue;
			if (b.walk && x.now < b.walk.since + b.walk.ms) continue;
			if (p.area !== room && !common.has(p.area)) continue;
			cands.push({ key: k, d: Math.hypot(p.slot.x - a.slot.x, p.slot.y - a.slot.y) + (p.area === room ? 0 : 10_000) });
		}
		cands.sort((p, q) => p.d - q.d || (p.key < q.key ? -1 : 1));
		const wavers = cands.slice(0, STORY.wavers).map((c, i) => ({ key: c.key, delay: STORY.firstMs + i * STORY.stepMs }));
		out[key] = { at: x.now, until: x.now + x.walkOut(a), wavers };
	}
	return out;
}

/** A waver's wave, held back its beat, if it is one this direction (the send-off started now). */
export function sendOffHold(sendoffs: Record<string, SendOff>, key: string, now: number): { delay: number; leaver: string } | undefined {
	for (const [leaver, s] of Object.entries(sendoffs)) {
		if (s.at !== now) continue;
		const w = s.wavers.find((v) => v.key === key);
		if (w) return { delay: w.delay, leaver };
	}
	return undefined;
}

/** Wavers look at the one leaving while they wave and it is still on its way out. */
export function sendOffLooks(sendoffs: Record<string, SendOff>, actors: Record<string, Actor>, now: number): Map<string, string> {
	const out = new Map<string, string>();
	for (const [leaver, s] of Object.entries(sendoffs)) {
		if (now >= s.until || !actors[leaver]) continue;
		for (const w of s.wavers) {
			const a = actors[w.key];
			if (a && a.gone === undefined && (a.pose === STORY.sendoff || a.pending?.pose === STORY.sendoff)) out.set(w.key, leaver);
		}
	}
	return out;
}

/**
 * Who is which regular (rig/data/roles.ts): `<project key>:<role>:<n>`, the project hashed as the diary
 * hashes it, the role the costume, and `n` its place among the same costume in that project, in the
 * order of their keys. Characters whose session the snapshot no longer has get none.
 */
export function regularsOf(actors: Pick<Actor, "key" | "kind" | "role" | "session" | "task">[], snap: Snapshot): Map<string, string> {
	const projects = new Map(flatSessions(snap.sessions).map((s) => [s.id, projectKey(s.project)]));
	const groups = new Map<string, string[]>();
	for (const a of [...actors].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))) {
		const p = projects.get(a.session);
		if (!p) continue;
		const g = `${p}:${a.kind === "lead" ? "lead" : roleFor(a.role, a.task)}`;
		groups.set(g, [...(groups.get(g) ?? []), a.key]);
	}
	const out = new Map<string, string>();
	for (const [g, keys] of groups) keys.forEach((k, i) => out.set(k, `${g}:${i}`));
	return out;
}

/** The log with this direction's entries, trimmed to the last few hours. */
export function logOf(was: StoryEntry[] | undefined, entries: StoryEntry[], now: number): StoryEntry[] {
	const all = [...(was ?? []), ...entries].filter((e) => e.at > now - STORY.logMs);
	return all.length > STORY.logMax ? all.slice(-STORY.logMax) : all;
}

/**
 * "While you were out": on a fresh return (the view's `back`, with `since` when you went), the
 * log's entries between the two, counted. The last headlines stay up until they run out; a new
 * return replaces them. None when nothing happened.
 */
export function headlinesFor(
	was: Headlines | undefined,
	log: StoryEntry[],
	view: View | undefined,
	fresh: number | undefined,
	now: number,
): Headlines | undefined {
	const since = view?.since;
	if (fresh !== undefined && since !== undefined && was?.at !== fresh) {
		const counts: Headlines["counts"] = {};
		for (const e of log) if (e.at >= since && e.at <= fresh) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
		if (Object.keys(counts).length) return { at: fresh, since, until: fresh + STORY.headlineMs, counts };
		return undefined;
	}
	return was && now < was.until ? was : undefined;
}
