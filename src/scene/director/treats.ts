// Milestone treats: when the office hits a milestone, a treat appears on the desk that hit it and
// stays there for a while. The day's PRs in a room reaching 5 and then 10 (on the desk of whoever
// opened that PR), or a session's own lines changed (Session.changes) crossing 1,000. Pixi-free:
// the director picks the treat, each theme paints its own (an office cake with a candle, a factory
// oil can with a bow, a bakery croquembouche with a sparkler).
import type { Changes, Session } from "../../watcher/model";
import type { Milestone } from "../contract";
import { localDay } from "../../shared/diary";
import { MIN } from "../../shared/time";

export interface Treat {
	milestone: Milestone;
	/** When the milestone was hit. */
	since: number;
}

export const TREATS = {
	/** The day's PRs in a room that earn a treat, smallest first. */
	prs: [5, 10],
	/** Lines a session has changed (added and removed) that earn one. */
	lines: 1000,
	/** How long a treat stays on the desk. */
	min: 10,
} as const;

/** A session's own lines changed: added and removed. */
const linesOf = (c: Changes | undefined): number => (c ? c.added + c.removed : 0);

const fresh = (t: Treat, now: number) => now >= t.since && now - t.since < TREATS.min * MIN;

/**
 * The PR treats, by session: in each room (project), today's PRs in the order they were opened;
 * the one that made the count reach a milestone puts a treat on its session's desk, for a while.
 * PRs with no time can't say when they were opened, so they don't count.
 */
export function prTreats(sessions: Iterable<Session>, now: number, day: (ms: number) => string = localDay): Map<string, Treat> {
	const today = day(now);
	const rooms = new Map<string, { at: number; n: number; session: string }[]>();
	for (const s of sessions)
		for (const pr of s.prs ?? []) {
			if (pr.at === undefined || pr.at > now || day(pr.at) !== today) continue;
			const list = rooms.get(s.project) ?? [];
			list.push({ at: pr.at, n: pr.number, session: s.id });
			rooms.set(s.project, list);
		}
	const out = new Map<string, Treat>();
	for (const list of rooms.values()) {
		list.sort((a, b) => a.at - b.at || a.n - b.n);
		// The biggest milestone still fresh wins: ten PRs is a bigger cake than five.
		for (const k of [...TREATS.prs].reverse()) {
			const pr = list[k - 1];
			if (!pr) continue;
			const t: Treat = { milestone: k === 10 ? "prs10" : "prs5", since: pr.at };
			if (fresh(t, now)) {
				out.set(pr.session, t);
				break;
			}
		}
	}
	return out;
}

/** What the director remembers of a desk's lines between snapshots. */
export interface LinesSeen {
	lines?: number;
	treat?: Treat;
}

/**
 * The lines treat: a session seen crossing TREATS.lines since the last snapshot gets one now. One
 * already over it on the first look (the app just opened) doesn't: nobody saw it happen.
 */
export function linesTreat(changes: Changes | undefined, was: LinesSeen | undefined, now: number): LinesSeen {
	const lines = linesOf(changes);
	if (was?.lines !== undefined && was.lines < TREATS.lines && lines >= TREATS.lines) return { lines, treat: { milestone: "lines", since: now } };
	return { lines, ...(was?.treat && fresh(was.treat, now) ? { treat: was.treat } : {}) };
}

/** The treat on a desk now: the newer of its PR treat and its lines treat. */
export function treatOn(pr: Treat | undefined, lines: Treat | undefined, now: number): Treat | undefined {
	const live = [pr, lines].filter((t): t is Treat => !!t && fresh(t, now));
	return live.sort((a, b) => b.since - a.since)[0];
}

/** When a treat is cleared away. */
export const treatEnds = (t: Treat): number => t.since + TREATS.min * MIN;
