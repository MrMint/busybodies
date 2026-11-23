// Signs and gags: counters that drive the room signs and whiteboards ("days since a test broke",
// the PR tally, the coffee count), idle time that drives the background gags (the plant wilts,
// the mugs pile up), and the one note on the fridge about whatever most needs a human. Pure apart
// from the counters it keeps between snapshots.
import type { Snapshot } from "../../watcher/model";
import { LIMITS, MIN, allSessions, crewCount, localClock, members, type DetectOptions } from "./detect";
import { LINES } from "./lines";
import { fill } from "./scheduler";
import { type LineVars, type Role, type SignPlace, hash } from "./types";

/** The office's slot for a place: room places belong to the project's room. */
export function slotName(place: SignPlace, project: string): string {
	switch (place) {
		case "sign":
		case "board":
		case "desk":
		case "plant":
		case "mugs":
			return `room:${project}:${place}`;
		default:
			return place;
	}
}

export interface CounterOptions extends DetectOptions {
	/** A local calendar day for an epoch-ms time, for "today". Default: the machine's clock. */
	day?: (ms: number) => string;
}

export const localDay = (ms: number) => new Date(ms).toDateString();
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The plant, by how long its room has been idle. */
export const plantFor = (idleMin: number) => (idleMin >= 30 ? "wilting" : idleMin >= 15 ? "droopy" : "fresh");
/** The mug pile, by how long its room has been idle: one mug per 10 minutes, up to 6. */
export const mugsFor = (idleMin: number) => Math.min(6, Math.floor(idleMin / 10));

const bank = (text: string) => {
	const l = LINES.find((x) => x.kind === "sign" && x.text === text);
	if (!l) throw new Error(`not in the line bank: ${text}`);
	return l.text;
};
const DAYS_SINCE = bank("Days since a test broke: {n}");
const FAIL_STREAK = bank("Fail streak: {n}. New personal best.");
const PR_TALLY = bank("PRs today: {count}. Humility: 0.");
const fridgeLines = (tag: string) => LINES.filter((l) => l.trigger === "fridge" && l.tag === tag);

interface RoomCount {
	lastTestFailAt?: number;
}

export class Counters {
	readonly #opts: CounterOptions;
	#rooms = new Map<string, RoomCount>();
	#greens = { day: "", n: 0 };
	#seenCmd = new Map<string, number>();

	constructor(opts: CounterOptions = {}) {
		this.#opts = opts;
	}

	/** Reads a snapshot into the counters, then returns the text every counter slot should show. */
	update(snap: Snapshot, now: number): Map<string, string> {
		const day = this.#opts.day ?? localDay;
		const clock = this.#opts.clock ?? localClock;
		const hour = this.#opts.hour ?? ((ms: number) => new Date(ms).getHours());
		const today = day(now);
		if (this.#greens.day !== today) this.#greens = { day: today, n: 0 };
		const out = new Map<string, string>();
		const sessions = allSessions(snap);
		const projects = [...new Set(sessions.map((s) => s.project))].sort();

		for (const s of sessions) {
			for (const m of members(s)) {
				const last = m.commands?.last;
				if (!last || this.#seenCmd.get(m.id) === last.at) continue;
				this.#seenCmd.set(m.id, last.at);
				if (last.kind === "test" && last.exitCode !== 0) {
					const r = this.#room(s.project);
					r.lastTestFailAt = Math.max(r.lastTestFailAt ?? 0, last.at);
				}
				if ((last.kind === "test" || last.kind === "build") && last.exitCode === 0 && day(last.at) === today) this.#greens.n++;
			}
		}

		for (const p of projects) {
			const ss = sessions.filter((s) => s.project === p);
			const crew = ss.flatMap(members);
			const streak = Math.max(0, ...crew.map((m) => m.commands?.failStreak ?? 0));
			const failAt = this.#rooms.get(p)?.lastTestFailAt;
			if (streak >= 3) out.set(slotName("board", p), fill(FAIL_STREAK, { n: streak })!);
			else if (failAt !== undefined) out.set(slotName("board", p), fill(DAYS_SINCE, { n: Math.max(0, Math.floor((now - failAt) / (24 * 60 * MIN))) })!);

			const prs = ss.flatMap((s) => s.prs ?? []).filter((pr) => pr.at === undefined || day(pr.at) === today);
			if (prs.length) out.set(slotName("sign", p), fill(PR_TALLY, { count: prs.length })!);

			// The room's gags run on how long the whole room has been idle.
			const allIdle = ss.every((s) => s.state === "idle" && !s.waiting);
			const idleMin = allIdle ? Math.floor((now - Math.max(...ss.map((s) => s.stateSince))) / MIN) : 0;
			out.set(slotName("plant", p), plantFor(idleMin));
			out.set(slotName("mugs", p), String(mugsFor(idleMin)));
		}
		if (this.#greens.n > 0) out.set("kitchen:sign", `One cup per green build. Today: ${this.#greens.n}.`);

		const note = this.#fridge(snap, now, clock, hour);
		if (note) out.set("fridge", note);
		return out;
	}

	#room(p: string): RoomCount {
		let r = this.#rooms.get(p);
		if (!r) this.#rooms.set(p, (r = {}));
		return r;
	}

	/** The one note on the fridge: the most pressing thing in the office, minutes rounded to 5. */
	#fridge(snap: Snapshot, now: number, clock: (ms: number) => string, hour: (ms: number) => number): string | undefined {
		const five = (ms: number) => Math.floor(ms / MIN / 5) * 5;
		const sessions = allSessions(snap);
		const concerns: { tag: string; vars: LineVars; key: string; crew?: Partial<Record<Role, number>> }[] = [];
		const waiting = sessions.filter((s) => s.waiting && now - s.waiting.since >= 5 * MIN).sort((a, b) => a.waiting!.since - b.waiting!.since)[0];
		if (waiting) concerns.push({ tag: "waiting", key: waiting.id, vars: { name: waiting.title, min: five(now - waiting.waiting!.since) } });
		for (const s of sessions) {
			for (const m of members(s)) {
				const r = m.agent ? m.agent.running : s.running;
				if (r?.kind && now - r.since >= LIMITS.longBuildMs) concerns.push({ tag: "build", key: m.id, vars: { time: clock(r.since) } });
			}
		}
		const streak = sessions.flatMap(members).sort((a, b) => (b.commands?.failStreak ?? 0) - (a.commands?.failStreak ?? 0))[0];
		if (streak && (streak.commands?.failStreak ?? 0) >= 3) concerns.push({ tag: "red", key: streak.id, vars: { n: streak.commands!.failStreak } });
		const deep = sessions.filter((s) => members(s).some((m) => (m.agent?.depth ?? 0) >= 3));
		if (deep.length) concerns.push({ tag: "crew", key: "crew", vars: {}, crew: crewCount(deep) });
		const stalled = sessions.find((s) => s.state === "busy" && !s.running && !s.waiting && now - (s.activity?.at ?? s.stateSince) >= 7 * MIN);
		if (stalled) concerns.push({ tag: "stalled", key: stalled.id, vars: { name: stalled.title, min: five(now - (stalled.activity?.at ?? stalled.stateSince)) } });
		const h = hour(now);
		if ((h >= LIMITS.lateFrom || h < LIMITS.lateUntil) && sessions.some((s) => s.state === "busy")) concerns.push({ tag: "late", key: "late", vars: {} });
		const done = sessions.find((s) => s.state === "idle" && (s.prs ?? []).length > 0 && now - s.stateSince >= 10 * MIN);
		if (done) concerns.push({ tag: "done", key: done.id, vars: {} });
		const idle = sessions.filter((s) => s.state === "idle" && !s.waiting && now - s.stateSince >= 20 * MIN).sort((a, b) => a.stateSince - b.stateSince)[0];
		if (idle) concerns.push({ tag: "idle", key: idle.id, vars: { name: idle.title, min: five(now - idle.stateSince) } });

		for (const c of concerns) {
			const lines = fridgeLines(c.tag).filter((l) => !l.needs || (c.crew?.[l.needs.role] ?? 0) >= l.needs.n);
			if (!lines.length) continue;
			const l = lines[hash(`${c.tag}|${c.key}`) % lines.length]!;
			const text = fill(l.text, c.vars);
			if (text) return text;
		}
		return undefined;
	}
}
