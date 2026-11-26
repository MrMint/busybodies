// The delight pass: context worn as plump (a plain mochi to a ripe plum), weather over a head, what
// each character is doing for the closer stops and the card, and the director's new beats (dozing
// on a long call, finishing together). Every session and number here is invented.
import { describe, expect, test } from "bun:test";
import { PLUMP_AT, PLUMP_SHAPE, RIPE, bodyPart, plumpOf, plumpOffsets } from "../src/scene/rig/data/plump";
import { WEATHER, weatherOf } from "../src/scene/director/weather";
import { dossiers, toolDoing } from "../src/scene/director/doing";
import { RULES, direct } from "../src/scene/director/direct";
import { FloorPlan } from "../src/scene/world/layout";
import { ranFor } from "../src/shared/time";
import type { Agent, Commands, Session, Snapshot } from "../src/watcher/model";

const NOW = Date.UTC(2026, 10, 19, 14, 32);
const MIN = 60_000;
const ctx = (share: number) => ({ used: Math.round(share * 200_000), window: 200_000, at: NOW });

function agent(id: string, extra: Partial<Agent> = {}): Agent {
	return { id, role: "scout", task: `Task ${id}`, depth: 1, status: "running", lastWriteAt: NOW, children: [], ...extra };
}

function session(id: string, extra: Partial<Session> = {}): Session {
	return {
		id,
		pid: 1,
		title: `Session ${id}`,
		cwd: "/tmp/invented",
		project: "invented",
		origin: "cli",
		state: "busy",
		stateSince: NOW - MIN,
		startedAt: NOW - 30 * MIN,
		agents: [],
		children: [],
		...extra,
	};
}

describe("plump: context worn as the body", () => {
	test("no window, no plump: the plain mochi", () => {
		expect(plumpOf(undefined)).toBeUndefined();
		expect(plumpOf({ used: 5000, at: NOW })).toBeUndefined();
	});

	test("levels start at their shares, and past 95% the plum is ripe", () => {
		expect(plumpOf(ctx(0.1))).toEqual({ level: 0, ripe: false });
		expect(plumpOf(ctx(PLUMP_AT[1]))).toEqual({ level: 1, ripe: false });
		expect(plumpOf(ctx(0.7))).toEqual({ level: 2, ripe: false });
		expect(plumpOf(ctx(0.9))).toEqual({ level: 3, ripe: false });
		expect(plumpOf(ctx(RIPE))).toEqual({ level: 3, ripe: true });
		expect(plumpOf(ctx(1.4))).toEqual({ level: 3, ripe: true });
	});

	test("each level is wider and taller, and the parts move out and up with it", () => {
		for (let i = 1; i < PLUMP_SHAPE.length; i++) {
			expect(PLUMP_SHAPE[i]!.w).toBeGreaterThan(PLUMP_SHAPE[i - 1]!.w);
			expect(PLUMP_SHAPE[i]!.h).toBeGreaterThan(PLUMP_SHAPE[i - 1]!.h);
		}
		expect(plumpOffsets(0)).toEqual({ top: -0, face: -0, cheekX: 0, cheekY: -0, shoulderX: 0, shoulderY: -0, legX: 0 });
		const plum = plumpOffsets(3);
		// Shoulders go out, but only part of the way: the arms' reaches were solved for the plain body.
		expect(plum.shoulderX).toBeGreaterThan(15);
		expect(plum.shoulderX).toBeLessThan(plum.cheekX);
		expect(plum.top).toBeLessThan(-30);
		// The face rises far less than the dome: it stays small and low on a plum.
		expect(Math.abs(plum.face)).toBeLessThan(Math.abs(plum.top) / 2);
	});

	test("the plain body keeps its part name; the plum sizes are their own parts", () => {
		expect(bodyPart("lead", 0)).toBe("body/lead");
		expect(bodyPart("scout", 3)).toBe("body/scout~g3");
		expect(bodyPart("scout", 3, true)).toBe("body/scout~ripe");
	});

	test("the director hands a lead the session's plump and crew their own", () => {
		const snap: Snapshot = {
			at: NOW,
			sessions: [session("s1", { context: ctx(0.97), agents: [agent("a1", { context: ctx(0.5) }), agent("a2")] })],
		};
		const d = direct(undefined, snap, NOW, new FloorPlan().update(snap));
		expect(d.world.actors["s:s1"]!.plump).toEqual({ level: 3, ripe: true });
		expect(d.world.actors["a:s1:a1"]!.plump).toEqual({ level: 1, ripe: false });
		expect(d.world.actors["a:s1:a2"]!.plump).toBeUndefined();
	});
});

describe("weather over a head", () => {
	const red = (k: number): Commands => ({ failStreak: k, repeats: 1, failed: k, testsFailed: k, last: { kind: "test", exitCode: 1, at: NOW - 1000 } });

	test("rain on a red streak, or on a run of failed tool results", () => {
		expect(weatherOf(red(1), undefined, NOW)).toBeUndefined();
		expect(weatherOf(red(WEATHER.rainStreak), undefined, NOW)).toBe("rain");
		expect(weatherOf(undefined, { calls: 10, errors: WEATHER.rainErrors, windowMs: 5 * MIN }, NOW)).toBe("rain");
	});

	test("sun for a while after a test goes green, only when tests had failed", () => {
		const green = (at: number, testsFailed = 2): Commands => ({
			failStreak: 0,
			repeats: 1,
			failed: testsFailed,
			testsFailed,
			last: { kind: "test", exitCode: 0, at },
		});
		expect(weatherOf(green(NOW - 1000), undefined, NOW)).toBe("sun");
		expect(weatherOf(green(NOW - 1000, 0), undefined, NOW)).toBeUndefined();
		expect(weatherOf(green(NOW - WEATHER.sunMin * MIN - 1), undefined, NOW)).toBeUndefined();
	});
});

describe("what each character is doing", () => {
	test("tools become a glyph and a verb; a shell command by its kind", () => {
		expect(toolDoing("Read")).toEqual(["read", "reading"]);
		expect(toolDoing("Grep")).toEqual(["search", "searching"]);
		expect(toolDoing("Edit")).toEqual(["edit", "editing"]);
		expect(toolDoing("Bash", "test")).toEqual(["test", "running tests"]);
		expect(toolDoing("Agent")).toEqual(["hire", "delegating"]);
		expect(toolDoing("mcp__something__else")).toEqual(["tool", "using a tool"]);
	});

	test("a dossier per character: counts, the context share, the boss, and a long call's start", () => {
		const scout = agent("a2", { depth: 2, running: { tool: "Grep", since: NOW - 5 * MIN }, context: ctx(0.7) });
		const snap: Snapshot = {
			at: NOW,
			sessions: [
				session("s1", {
					context: ctx(0.3),
					tools: { calls: 12, errors: 1, windowMs: 5 * MIN },
					agents: [agent("a1", { children: [scout], changes: { files: 3, added: 40, removed: 2 } }), agent("a3", { status: "finished" })],
				}),
			],
		};
		const d = dossiers(snap);
		const lead = d.get("s:s1")!;
		expect(lead).toMatchObject({ kind: "lead", context: 0.3, plump: 0, calls: 12, errors: 1, crew: 1 });
		expect(d.get("a:s1:a1")).toMatchObject({ files: 3, added: 40, removed: 2, crew: 1, boss: { key: "s:s1", role: "lead" } });
		expect(d.get("a:s1:a2")).toMatchObject({ depth: 2, plump: 2, boss: { key: "a:s1:a1", role: "scout" } });
		expect(d.get("a:s1:a2")!.doing).toEqual({ icon: "search", word: "searching", since: NOW - 5 * MIN, long: true });
		expect(d.get("a:s1:a3")!.doing.icon).toBe("done");
	});

	test("a long call's time reads in seconds, minutes, then hours", () => {
		expect(ranFor(12_000)).toBe("12s");
		expect(ranFor(4 * MIN)).toBe("4m");
		expect(ranFor(90 * MIN)).toBe("2h");
	});
});

describe("the director's new beats", () => {
	test("a call running past dozeMin nods off on its feet", () => {
		const snap: Snapshot = {
			at: NOW,
			sessions: [session("s1", { agents: [agent("a1", { running: { tool: "WebFetch", since: NOW - (RULES.dozeMin + 1) * MIN } })] })],
		};
		const d = direct(undefined, snap, NOW, new FloorPlan().update(snap));
		expect(d.world.actors["a:s1:a1"]!.pose).toBe("asleep");
	});

	test("crew seen finishing within seconds of each other celebrate together; a lone finisher, or one found finished, doesn't", () => {
		const done = (id: string, at: number) => agent(id, { status: "finished", lastWriteAt: at });
		const busy: Snapshot = { at: NOW - 5000, sessions: [session("s1", { agents: [agent("a1"), agent("a2"), agent("a3")] })] };
		const plan = new FloorPlan();
		const first = direct(undefined, busy, NOW - 5000, plan.update(busy));
		const together: Snapshot = { at: NOW, sessions: [session("s1", { agents: [done("a1", NOW - 2000), done("a2", NOW - 1000), agent("a3")] })] };
		const d = direct(first.world, together, NOW, plan.update(together));
		expect(d.world.actors["a:s1:a1"]!.pose).toBe("celebrate");
		expect(d.world.actors["a:s1:a2"]!.pose).toBe("celebrate");
		// Found already finished on the first look: no cheer (an office opened after hours stays still).
		const cold = direct(undefined, together, NOW, new FloorPlan().update(together));
		expect(cold.world.actors["a:s1:a1"]!.pose).not.toBe("celebrate");
		const alone: Snapshot = { at: NOW, sessions: [session("s1", { agents: [done("a1", NOW - 2000), done("a2", NOW - 5 * MIN), agent("a3")] })] };
		const e = direct(first.world, alone, NOW, new FloorPlan().update(alone));
		expect(e.world.actors["a:s1:a1"]!.pose).not.toBe("celebrate");
	});
});
