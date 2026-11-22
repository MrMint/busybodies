// Rush: a room whose work is very hot turns hectic (plan-next stream C, wave 2). Walks become a run
// with papers flying, trips and brick runs come quicker, and the lead stops strolling its rounds and
// dashes straight to whoever just went red, or has queued longest. Pure and deterministic.
//
//   heatOf(session, edits, now)   -> tool calls a minute across the session and its crew, plus
//                                    RUSH.editWeight per edit seen in the last minute
//   nextRush(was, heat, now)      -> on at RUSH.onHeat, off below RUSH.offHeat (and never within
//                                    RUSH.minMs of starting), so it doesn't flicker
//   nextDash(rush, candidates, now) -> the lead's dash target, if any
import type { Agent, Session } from "../../watcher/model";
import { editRate, perMinute } from "./pace";

export const RUSH = {
	/** Heat to go into rush: e.g. 6 crew at 15 calls a minute, or 60 calls and 15 edits a minute. */
	onHeat: 90,
	/** Heat below which rush ends (once it has lasted `minMs`): the hysteresis band. */
	offHeat: 60,
	/** Each edit a minute counts as this many more tool calls (an edit is a call already). */
	editWeight: 2,
	/** A rush lasts at least this long. */
	minMs: 15_000,
	/** In rush, a held kind sends its crew member to the station after this long (6 s calm). */
	tripHoldMs: 3_000,
	/** In rush, the brick-run cooldown is this share of the calm one. */
	runShare: 0.5,
	/** The walk pose of everyone walking in a room in rush. */
	walkPose: "rushRun",
	/** A red test this recent is news the lead dashes to. */
	redMs: 20_000,
	/** How long the lead stands at the one it dashed to before the next dash (or its desk). */
	dashStayMs: 6_000,
} as const;

/** A session's rush, kept in the world between directions. */
export interface Rush {
	/** When it started. */
	since: number;
	/** The heat last seen. */
	heat: number;
	/** The lead's dash under way: to whom, since when. */
	dash?: { key: string; since: number };
	/** When the lead last dashed to each crew member, so it goes to news, not round in circles. */
	visited: Record<string, number>;
}

const agentCalls = (list: Agent[]): number =>
	list.reduce((n, a) => n + (a.status === "running" ? (perMinute(a.tools) ?? 0) : 0) + agentCalls(a.children), 0);

/** How hot a session's work is: tool calls a minute (its own and its running crew's), plus edits. */
export function heatOf(session: Session, edits: number[] | undefined, now: number): number {
	const calls = (perMinute(session.tools) ?? 0) + agentCalls(session.agents);
	return Math.round(calls + RUSH.editWeight * editRate(edits, now));
}

/** The rush after this direction: on at onHeat, off below offHeat once it has lasted minMs. */
export function nextRush(was: Rush | undefined, heat: number, now: number): Rush | undefined {
	if (was) return heat >= RUSH.offHeat || now - was.since < RUSH.minMs ? { ...was, heat } : undefined;
	return heat >= RUSH.onHeat ? { since: now, heat, visited: {} } : undefined;
}

/** When a rush that has cooled may end on its own. */
export const rushWake = (r: Rush | undefined, now: number): number | undefined =>
	r && r.heat < RUSH.offHeat && now < r.since + RUSH.minMs ? r.since + RUSH.minMs : undefined;

/** A crew member the lead might dash to: when its test went red, when it started queueing. */
export interface DashCandidate {
	key: string;
	failAt?: number;
	queuedSince?: number;
}

/**
 * The lead's dash: it stays with the one it dashed to for dashStayMs (while that one is still a
 * candidate's teammate on stage), then goes to the newest red test it hasn't been to since, else the
 * one queued longest it hasn't been to since it started waiting. None: no dash.
 */
export function nextDash(r: Rush, cands: DashCandidate[], present: Set<string>, now: number): Rush {
	if (r.dash && now < r.dash.since + RUSH.dashStayMs && present.has(r.dash.key)) return r;
	const seen = (k: string) => r.visited[k] ?? -Infinity;
	const byKey = (a: DashCandidate, b: DashCandidate) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
	const red = cands.filter((c) => c.failAt !== undefined && now - c.failAt < RUSH.redMs && seen(c.key) < c.failAt).sort((a, b) => b.failAt! - a.failAt! || byKey(a, b));
	const queued = cands.filter((c) => c.queuedSince !== undefined && seen(c.key) < c.queuedSince).sort((a, b) => a.queuedSince! - b.queuedSince! || byKey(a, b));
	const to = red[0] ?? queued[0];
	const visited = Object.fromEntries(Object.entries(r.visited).filter(([k]) => present.has(k)));
	if (!to) return { since: r.since, heat: r.heat, visited };
	return { since: r.since, heat: r.heat, dash: { key: to.key, since: now }, visited: { ...visited, [to.key]: now } };
}
