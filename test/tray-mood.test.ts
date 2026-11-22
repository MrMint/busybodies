// The tray icon's mood from a snapshot. Every session here is invented.
import { describe, expect, test } from "bun:test";
import { moodOf, summaryOf } from "../src/bun/mood";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

let n = 0;
const agent = (status: Agent["status"]): Agent => ({ id: `a-${++n}`, role: "scout", task: "Look around", depth: 1, status, lastWriteAt: 0, children: [] });
const session = (state: string, extra: Partial<Session> = {}): Session => ({
	id: `s-${++n}`,
	pid: n,
	title: "Invented task",
	cwd: "/Users/you/code/pebble",
	project: "pebble",
	origin: "cli",
	state,
	stateSince: 0,
	startedAt: 0,
	agents: [],
	children: [],
	...extra,
});
const snap = (sessions: Session[]): Snapshot => ({ at: 0, sessions });

describe("tray mood", () => {
	test("an empty office, or no snapshot yet, is idle", () => {
		expect(moodOf(undefined)).toBe("idle");
		expect(moodOf(snap([]))).toBe("idle");
		expect(summaryOf(snap([]))).toBe("Nobody's in");
	});

	test("busy when any session is busy, or an idle session still has a running agent", () => {
		expect(moodOf(snap([session("idle"), session("busy")]))).toBe("busy");
		expect(moodOf(snap([session("idle", { agents: [agent("finished"), agent("running")] })]))).toBe("busy");
		expect(moodOf(snap([session("idle", { agents: [agent("finished")] })]))).toBe("idle");
	});

	test("waiting on you beats busy, even in a side session", () => {
		const side = session("idle", { waiting: { since: 0 } as Session["waiting"] });
		expect(moodOf(snap([session("busy", { children: [side] })]))).toBe("waiting");
		expect(summaryOf(snap([session("busy", { children: [side] })]))).toBe("2 sessions · 1 busy · 1 waiting on you");
	});
});
