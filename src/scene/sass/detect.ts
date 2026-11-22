// Trigger detectors: what in a snapshot, or in the change from the last one, is worth a line.
// Pure: the same two snapshots and clock give the same triggers, in the same order. Events (a PR
// opened, a test going red) fire once, on the change; states (a wait, a long build, a nap) fire
// on every call while they hold, with a magnitude the scheduler uses to escalate.
import type { Agent, Commands, Session, Snapshot } from "../../watcher/model";
import { type Role, type Trigger, type TriggerKind, roleFor } from "./types";

export const MIN = 60_000;

/** The thresholds the detectors use. Exported so tests and the dump can name them. */
export const LIMITS = {
	/** A shell command running this long is a long build. */
	longBuildMs: 20 * MIN,
	/** Busy this long without a break brings out the frantic lines. */
	busyMs: 15 * MIN,
	/** No output this long while busy is a stall. */
	stallMs: 5 * MIN,
	/** Idle this long before the idle lines start (shorter is just a turn ending). */
	idleMs: 3 * MIN,
	/** Idle this long, then busy again, is waking up. */
	wokenMs: 10 * MIN,
	/** Idle this long counts as slacking, for a busy teammate's side-eye. */
	slackerMs: 10 * MIN,
	/** On the first snapshot, events this recent still count. */
	freshMs: MIN,
	/** This many agents spawned in one go is a big crew. */
	bigCrew: 4,
	/** This many finished agents at once is a coffee queue. */
	coffeeQueue: 3,
	/** Late night runs from this hour (local) until `lateUntil`. */
	lateFrom: 23,
	lateUntil: 5,
	/** Cost in cups: dollars per cup, or output tokens per cup when the dollars aren't known. */
	usdPerCup: 8,
	tokensPerCup: 100_000,
} as const;

export interface DetectOptions {
	/** The local hour (0-23) of an epoch-ms time. Default: the machine's clock. */
	hour?: (ms: number) => number;
	/** A local "HH:MM" for an epoch-ms time. Default: the machine's clock. */
	clock?: (ms: number) => string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localHour = (ms: number) => new Date(ms).getHours();
export const localClock = (ms: number) => {
	const d = new Date(ms);
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const utcHour = (ms: number) => new Date(ms).getUTCHours();
export const utcClock = (ms: number) => {
	const d = new Date(ms);
	return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** Every session, side sessions included, depth first. */
export function allSessions(snap: Snapshot | undefined): Session[] {
	const out: Session[] = [];
	const walk = (ss: Session[]) => {
		for (const s of ss) {
			out.push(s);
			walk(s.children ?? []);
		}
	};
	walk(snap?.sessions ?? []);
	return out;
}

/** A character: a session's lead or one of its agents. */
interface Member {
	id: string;
	role: Role;
	session: Session;
	/** The agent, for crew. */
	agent?: Agent;
	/** The id of whoever spawned it: the session or another agent. */
	parent?: string;
	commands?: Commands;
}

/** A session's lead and its whole crew, depth first. */
export function members(s: Session): Member[] {
	const out: Member[] = [{ id: s.id, role: "lead", session: s, commands: s.commands }];
	const walk = (as: Agent[], parent: string) => {
		for (const a of as) {
			out.push({ id: a.id, role: roleFor(a.role), session: s, agent: a, parent, commands: a.commands });
			walk(a.children ?? [], a.id);
		}
	};
	walk(s.agents ?? [], s.id);
	return out;
}

/** Cups of coffee a session has drunk, from its cost. */
export function cups(s: Session): number {
	const c = s.cost;
	if (!c) return 0;
	if (typeof c.usd === "number") return c.usd / LIMITS.usdPerCup;
	return (c.outputTokens ?? 0) / LIMITS.tokensPerCup;
}

const mins = (ms: number) => Math.max(0, Math.floor(ms / MIN));

export function detect(prev: Snapshot | undefined, snap: Snapshot, now: number, opts: DetectOptions = {}): Trigger[] {
	const hour = opts.hour ?? localHour;
	const clock = opts.clock ?? localClock;
	const out: Trigger[] = [];
	const prevSessions = new Map(allSessions(prev).map((s) => [s.id, s]));
	const prevMembers = new Map<string, Member>();
	for (const s of prevSessions.values()) for (const m of members(s)) prevMembers.set(m.id, m);
	/** Was this event time new since the last snapshot? With none, only if it's recent. */
	const fresh = (at: number | undefined, before: number | undefined) =>
		at !== undefined && (prev ? at !== before : now - at < LIMITS.freshMs);

	const sessions = allSessions(snap);
	const push = (kind: TriggerKind, m: Member, magnitude: number, key: string, ongoing: boolean, extra: Partial<Trigger> = {}) =>
		out.push({ kind, who: m.id, session: m.session.id, project: m.session.project, role: m.role, magnitude, key, ongoing, ...extra, vars: { name: m.session.title, ...extra.vars } });

	let finishedCrew: Member[] = [];
	for (const s of sessions) {
		const crew = members(s);
		const lead = crew[0]!;
		const was = prevSessions.get(s.id);
		/** Someone else in the session to react: the lead for crew, the first agent for the lead. */
		const teammate = (m: Member) => crew.find((o) => o.id !== m.id && o.agent?.status !== "finished" && o.agent?.status !== "stopped");

		// Waiting on you, escalating with the wait.
		if (s.waiting) {
			const w = now - s.waiting.since;
			push("waiting", lead, mins(w), `waiting:${s.id}:${s.waiting.since}`, true, { tag: s.waiting.reason, vars: { min: mins(w) } });
		}

		// Commands: failed tests, retries, green after red. Lead and crew alike.
		for (const m of crew) {
			const c = m.commands;
			const last = c?.last;
			const before = prevMembers.get(m.id)?.commands;
			if (!c || !last || !fresh(last.at, before?.last?.at)) continue;
			if (last.exitCode !== 0 && last.kind === "test") {
				push("testFailed", m, c.failStreak, `test:${m.id}:${last.at}`, false, { vars: { n: c.failStreak } });
				const t = c.failStreak >= 3 ? teammate(m) : undefined;
				if (t) push("reaction", t, c.failStreak, `react-red:${m.id}:${last.at}`, false, { tag: "red" });
			}
			if (c.repeats >= 2) push("retry", m, c.repeats, `retry:${m.id}:${last.at}`, false, { vars: { n: c.repeats } });
			if (last.exitCode === 0 && (last.kind === "test" || last.kind === "build") && (before?.failStreak ?? 0) > 0) {
				push("reaction", teammate(m) ?? m, before!.failStreak, `react-green:${m.id}:${last.at}`, false, { tag: "green" });
			}
		}

		// The API being retried, and giving up.
		if (s.apiRetry && fresh(s.apiRetry.at, was?.apiRetry?.at)) {
			const r = s.apiRetry;
			if (r.max !== undefined && r.attempt >= r.max) push("crashed", lead, r.attempt, `crash:${s.id}:${r.at}`, false);
			else push("apiRetry", lead, r.attempt, `api:${s.id}:${r.at}`, false, { vars: { n: r.attempt } });
		}

		// A long build: any shell command running 20 minutes or more.
		for (const m of crew) {
			const r = m.agent ? m.agent.running : s.running;
			if (!r?.kind || now - r.since < LIMITS.longBuildMs) continue;
			push("longBuild", m, mins(now - r.since), `build:${m.id}:${r.since}`, true, { vars: { min: mins(now - r.since), time: clock(r.since) } });
		}

		// Busy a long stretch: frantic. Stalled: busy with no output.
		if (s.state === "busy" && !s.waiting) {
			const quiet = now - Math.max(s.activity?.at ?? s.stateSince, s.stateSince);
			if (!s.running && quiet >= LIMITS.stallMs) {
				push("stalled", lead, mins(quiet), `stall:${s.id}:${s.activity?.at ?? s.stateSince}`, true, { vars: { min: mins(quiet) } });
			} else if (now - s.stateSince >= LIMITS.busyMs) {
				push("busy", lead, mins(now - s.stateSince), `busy:${s.id}:${s.stateSince}`, true);
			}
			const h = hour(now);
			if (h >= LIMITS.lateFrom || h < LIMITS.lateUntil) push("lateNight", lead, h, `late:${s.id}:${Math.floor(now / (24 * 60 * MIN))}`, true);
		}
		for (const m of crew) {
			const a = m.agent;
			if (a?.status === "stalled") push("stalled", m, mins(now - a.lastWriteAt), `stall:${a.id}:${a.lastWriteAt}`, true, { vars: { min: mins(now - a.lastWriteAt) } });
		}

		// Idle, and finished-but-open (idle with a PR up). Waking up after a long idle.
		const prs = s.prs ?? [];
		if (s.state === "idle" && !s.waiting && now - s.stateSince >= LIMITS.idleMs) {
			const idle = mins(now - s.stateSince);
			if (prs.length > 0 && idle < 10) push("finished", lead, idle, `done:${s.id}:${s.stateSince}`, true, { tag: "pr", vars: { time: clock(s.stateSince), time2: clock(s.stateSince + MIN) } });
			else push("idle", lead, idle, `idle:${s.id}:${s.stateSince}`, true, { vars: { min: idle } });
			if (now - s.stateSince >= LIMITS.slackerMs) {
				const busy = sessions.find((o) => o.id !== s.id && o.project === s.project && o.state === "busy" && !o.waiting);
				if (busy) push("reaction", members(busy)[0]!, idle, `react-slacker:${s.id}:${s.stateSince}`, true, { tag: "slacker" });
			}
		}
		if (was && was.state === "idle" && s.state === "busy" && s.stateSince !== was.stateSince) {
			const idled = s.stateSince - was.stateSince;
			if (idled >= LIMITS.wokenMs) push("woken", lead, mins(idled), `woken:${s.id}:${s.stateSince}`, false);
		}

		// PRs opened.
		const seen = new Set((was?.prs ?? []).map((p) => p.number));
		for (const p of prs) {
			if (seen.has(p.number) || (!was && !(p.at !== undefined && now - p.at < 5 * MIN))) continue;
			push("prOpened", lead, prs.length, `pr:${s.id}:${p.number}`, false, { tag: crew.length > 2 ? "crew" : undefined, vars: { n: p.number, count: prs.length } });
			const t = teammate(lead);
			if (t) push("reaction", t, prs.length, `react-pr:${s.id}:${p.number}`, false, { tag: "pr" });
		}

		// Compaction.
		const comp = s.compactions;
		if (comp && comp.count > 0 && (was ? comp.count > (was.compactions?.count ?? 0) : comp.lastAt !== undefined && now - comp.lastAt < LIMITS.freshMs)) {
			push("compacting", lead, comp.count, `compact:${s.id}:${comp.count}`, false);
		}

		// The bill: a new whole cup.
		const cupsNow = Math.floor(cups(s));
		if (was && cupsNow >= 1 && cupsNow > Math.floor(cups(was))) {
			push("bill", lead, cupsNow, `bill:${s.id}:${cupsNow}`, false, { tag: prs.length ? "pr" : undefined, vars: { n: cupsNow } });
		}

		// The crew: hiring, a big crew, reviews, finishing, being sent home.
		if (was) {
			const hires = crew.filter((m) => m.agent && !prevMembers.has(m.id));
			const byParent = new Map(crew.map((m) => [m.id, m]));
			if (hires.length >= LIMITS.bigCrew) push("bigCrew", lead, hires.length, `crew:${s.id}:${hires.map((h) => h.id).join(",")}`, false);
			else {
				for (const h of hires) {
					const parent = byParent.get(h.parent!) ?? lead;
					push("hiring", parent, h.agent!.depth, `hire:${h.id}`, false);
				}
			}
			for (const m of crew) {
				const a = m.agent;
				const before = prevMembers.get(m.id)?.agent;
				if (!a || !before || before.status === a.status) continue;
				if (a.status === "finished") {
					if (m.role === "reviewer") {
						const reviews = crew.filter((o) => o.role === "reviewer" && o.agent?.status === "finished").length;
						push("review", m, reviews, `review:${a.id}`, false);
					} else push("finished", m, 0, `done:${a.id}`, false, { vars: { time: clock(now), time2: clock(now + MIN) } });
				}
				if (a.status === "stopped") push("paused", m, 0, `paused:${a.id}`, false, { vars: { time: clock(now) } });
			}
		}
		finishedCrew = finishedCrew.concat(crew.filter((m) => m.agent?.status === "finished"));
	}

	// The coffee queue: three or more finished agents in the kitchen at once.
	if (finishedCrew.length >= LIMITS.coffeeQueue) {
		const first = [...finishedCrew].sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;
		push("coffeeQueue", first, finishedCrew.length, "coffee", true);
	}

	// A session that vanished mid-work crashed (or was closed while busy: the same smoke).
	const live = new Set(sessions.map((s) => s.id));
	for (const [id, was] of prevSessions) {
		if (live.has(id) || was.state !== "busy" || was.waiting) continue;
		const lead = members(was)[0]!;
		push("crashed", lead, 0, `crash:${id}:gone`, false, { tag: "gone" });
		const near = sessions.find((s) => s.project === was.project);
		if (near) push("reaction", members(near)[0]!, 0, `react-crash:${id}`, false, { tag: "crash" });
	}
	return out;
}
