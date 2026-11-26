// The delight passes: context worn as plump (a plain mochi to a ripe plum), weather over a head, what
// each character is doing for the closer stops and the card, and the director's new beats (dozing
// on a long call, finishing together). Round two: milestone treats, cobwebs on long-idle desks,
// dozing at a station, and plum hands on their work. Every session and number here is invented.
import { describe, expect, test } from "bun:test";
import { PLUMP_AT, PLUMP_SHAPE, RIPE, bodyPart, plumpOf, plumpOffsets } from "../src/scene/rig/data/plump";
import { WEATHER, weatherOf } from "../src/scene/director/weather";
import { dossiers, toolDoing } from "../src/scene/director/doing";
import { RULES, direct } from "../src/scene/director/direct";
import { FloorPlan } from "../src/scene/world/layout";
import { ranFor } from "../src/shared/time";
import type { Agent, Commands, Session, Snapshot } from "../src/watcher/model";
import { TREATS, linesTreat, prTreats, treatOn } from "../src/scene/director/treats";
import { COBWEB, cobwebFor } from "../src/scene/director/cobwebs";
import { TRIP } from "../src/scene/director/trips";
import { localDay } from "../src/shared/diary";
import { WORK_ARMS, frontSpread, handAt, plumpArm, workPoint } from "../src/scene/rig/data/reach";
import { POSES } from "../src/scene/rig/data/poses";
import { channels, channelsAt } from "../src/scene/rig/data/frame";
import type { Arm, Body } from "../src/scene/rig/data/vocab";
import type { PlumpLevel } from "../src/scene/rig/data/plump";

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
		// Shoulders go out, but only part of the way: a plum's arms are re-solved onto their work
		// (reach.ts plumpArm), and shoulders far out would make them stretch further to get there.
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

describe("milestone treats", () => {
	const pr = (number: number, at: number | undefined) => ({ number, url: `https://example.invalid/pull/${number}`, ...(at !== undefined ? { at } : {}) });
	const prs = (from: number, n: number, at: (i: number) => number) => Array.from({ length: n }, (_, i) => pr(from + i, at(i)));

	test("a room's fifth PR today puts a cake on the desk that opened it; the tenth, a bigger one", () => {
		// Two sessions in one room: four PRs from one, the fifth from the other.
		const a = session("s1", { project: "room", prs: prs(1, 4, (i) => NOW - (40 - i) * MIN) });
		const b = session("s2", { project: "room", prs: [pr(9, NOW - 2 * MIN)] });
		const five = prTreats([a, b], NOW);
		expect(five.get("s2")).toEqual({ milestone: "prs5", since: NOW - 2 * MIN });
		expect(five.has("s1")).toBe(false);
		// Ten: the bigger milestone wins while it is fresh.
		const c = session("s3", { project: "room", prs: prs(20, 5, (i) => NOW - (5 - i) * 1000) });
		expect(prTreats([a, b, c], NOW).get("s3")).toEqual({ milestone: "prs10", since: NOW - 1000 });
		// Another room counts its own.
		expect(prTreats([a, session("s4", { project: "other", prs: [pr(30, NOW - 1000)] })], NOW).size).toBe(0);
	});

	test("only today's PRs with a time count, and a treat is cleared away after a while", () => {
		const day = (ms: number) => localDay(ms);
		const yesterday = NOW - 24 * 60 * MIN;
		const old = session("s1", { prs: [...prs(1, 4, () => yesterday), pr(5, NOW - MIN)] });
		expect(prTreats([old], NOW, day).size).toBe(0);
		const untimed = session("s1", { prs: [...prs(1, 4, () => undefined as unknown as number), pr(5, NOW - MIN)] });
		expect(prTreats([untimed], NOW, day).size).toBe(0);
		const s = session("s1", { prs: prs(1, 5, (i) => NOW - (5 - i) * MIN) });
		expect(prTreats([s], NOW, day).get("s1")?.milestone).toBe("prs5");
		expect(prTreats([s], NOW + TREATS.min * MIN, day).size).toBe(0);
	});

	test("crossing a thousand lines changed, seen happening, earns a treat; already over on the first look doesn't", () => {
		const under = { files: 3, added: 600, removed: 300 };
		const over = { files: 4, added: 700, removed: 320 };
		const first = linesTreat(under, undefined, NOW);
		expect(first).toEqual({ lines: 900 });
		const crossed = linesTreat(over, first, NOW + 1000);
		expect(crossed.treat).toEqual({ milestone: "lines", since: NOW + 1000 });
		// It stays for a while, then it's gone; and it doesn't come back for staying over.
		expect(linesTreat(over, crossed, NOW + 5 * MIN).treat).toEqual(crossed.treat);
		expect(linesTreat(over, crossed, NOW + 1000 + TREATS.min * MIN).treat).toBeUndefined();
		expect(linesTreat(over, undefined, NOW).treat).toBeUndefined();
	});

	test("a desk shows the newer of its treats", () => {
		const p = { milestone: "prs5" as const, since: NOW - 3 * MIN };
		const l = { milestone: "lines" as const, since: NOW - MIN };
		expect(treatOn(p, l, NOW)).toEqual(l);
		expect(treatOn(p, undefined, NOW)).toEqual(p);
		expect(treatOn(p, undefined, NOW + TREATS.min * MIN)).toBeUndefined();
	});

	test("the director puts the treat on the desk and wakes to clear it away", () => {
		const plan = new FloorPlan();
		const before: Snapshot = { at: NOW - 3000, sessions: [session("s1", { changes: { files: 2, added: 900, removed: 10 } })] };
		const first = direct(undefined, before, NOW - 3000, plan.update(before));
		expect(first.world.metrics!.desks.s1!.treat).toBeUndefined();
		const after: Snapshot = { at: NOW, sessions: [session("s1", { changes: { files: 2, added: 990, removed: 30 } })] };
		const d = direct(first.world, after, NOW, plan.update(after));
		expect(d.world.metrics!.desks.s1!.treat).toBe("lines");
		expect(d.wake).toBeLessThanOrEqual(NOW + TREATS.min * MIN);
	});
});

describe("cobwebs on long-idle desks", () => {
	const DAY = 24 * 60 * MIN;

	test("a desk idle for days gathers one, in a corner picked by its id", () => {
		const idle = session("s1", { state: "idle", stateSince: NOW - (COBWEB.days + 1) * DAY });
		const corner = cobwebFor(idle, NOW);
		expect(["screenL", "screenR", "desk"]).toContain(corner!);
		expect(cobwebFor(idle, NOW + DAY)).toBe(corner!);
		// Different desks don't all pick the same corner.
		const corners = new Set(Array.from({ length: 12 }, (_, i) => cobwebFor({ ...idle, id: `s${i}` }, NOW)));
		expect(corners.size).toBeGreaterThan(1);
	});

	test("not on a desk idle for less, a busy one, or one waiting on you", () => {
		expect(cobwebFor(session("s1", { state: "idle", stateSince: NOW - (COBWEB.days - 0.5) * DAY }), NOW)).toBeUndefined();
		expect(cobwebFor(session("s1", { state: "busy", stateSince: NOW - 5 * DAY }), NOW)).toBeUndefined();
		const waiting = session("s1", { state: "idle", stateSince: NOW - 5 * DAY, waiting: { reason: "question", since: NOW - MIN, source: "hook" } });
		expect(cobwebFor(waiting, NOW)).toBeUndefined();
	});

	test("the director hands the desk its cobweb", () => {
		const snap: Snapshot = { at: NOW, sessions: [session("s1", { state: "idle", stateSince: NOW - 3 * DAY, startedAt: NOW - 4 * DAY })] };
		const d = direct(undefined, snap, NOW, new FloorPlan().update(snap));
		expect(d.world.metrics!.desks.s1!.cobweb).toBe(cobwebFor(snap.sessions[0]!, NOW)!);
	});
});

describe("dozing at a station", () => {
	test("a very long web call still walks to the phone, and nods off on hold there", () => {
		const fetch = (at: number): Snapshot => ({
			at,
			sessions: [
				session("s1", {
					agents: [
						agent("a1", {
							activity: { tool: "WebFetch", at: NOW - 9 * MIN },
							running: { tool: "WebFetch", since: NOW - (RULES.dozeMin + 1) * MIN },
						}),
					],
				}),
			],
		});
		const plan = new FloorPlan();
		let d = direct(undefined, fetch(NOW), NOW, plan.update(fetch(NOW)));
		for (let t = NOW + 1000; t <= NOW + TRIP.holdMs + 2000; t += 1000) d = direct(d.world, fetch(t), t, plan.update(fetch(t)));
		const a = d.world.actors["a:s1:a1"]!;
		expect(a.trip?.kind).toBe("web");
		expect(a.pose).toBe("asleep");
	});
});

describe("plum hands on their work", () => {
	// Every work arm as the poses use it: which arm, which side, on which body.
	const uses = new Map<string, { arm: Arm; side: 1 | -1; body: Body }>();
	for (const p of POSES)
		for (const f of [...p.frames, ...(p.partner?.frames ?? [])])
			for (const [arm, side] of [
				[f.armR, 1],
				[f.armL, -1],
			] as const)
				if (WORK_ARMS.has(arm)) uses.set(`${arm}|${side}|${f.body}`, { arm, side, body: f.body });
	const LEVELS: PlumpLevel[] = [1, 2, 3];

	test("at every plump, every hand on a station, the bench or the keyboard lands exactly on its work", () => {
		expect(uses.size).toBeGreaterThan(40);
		for (const level of LEVELS)
			for (const { arm, side, body } of uses.values()) {
				const r = plumpArm(arm, body, side, level)!;
				const at = handAt(r.arm, body, side, undefined, { level, stretch: r.stretch });
				const want = workPoint(arm, body, side, level);
				const miss = Math.hypot(at.x - want.x, at.y - want.y);
				if (miss > 0.5) throw new Error(`plump ${level}: ${arm} (side ${side}, ${body}) misses its work by ${miss.toFixed(2)}`);
			}
	});

	test("stations and the bench are the plain mochi's points; work in front spreads with the shoulders", () => {
		for (const level of LEVELS) {
			const phone = workPoint("jot1", "up", 1, level);
			expect(phone).toEqual(handAt("jot1", "up", 1));
			expect(workPoint("hit2", "rest", 1, level)).toEqual(handAt("hit2", "rest", 1));
			const plain = handAt("type1", "rest", -1);
			const typing = workPoint("type1", "rest", -1, level);
			expect(typing.x).toBeCloseTo(plain.x - frontSpread(level), 6);
			expect(typing.y).toBeCloseTo(plain.y, 6);
		}
		expect(frontSpread(1)).toBeLessThan(frontSpread(2));
		expect(frontSpread(2)).toBeLessThan(frontSpread(3));
	});

	test("a short arm stretches only as far as it must, and a family of arms stretches as one", () => {
		let stretched = 0;
		for (const level of LEVELS)
			for (const { arm, side, body } of uses.values()) {
				const r = plumpArm(arm, body, side, level)!;
				expect(r.stretch).toBeGreaterThanOrEqual(1);
				expect(r.stretch).toBeLessThan(1.6);
				if (r.stretch > 1) stretched++;
			}
		// Most work is reached as the arm is.
		expect(stretched).toBeLessThan((uses.size * LEVELS.length) / 2);
		// Typing hands share one stretch, so the arm doesn't pump in length as it types.
		expect(plumpArm("type1", "rest", 1, 3)!.stretch).toBe(plumpArm("type3", "rest", 1, 3)!.stretch);
		// The plain mochi is untouched, and so is an arm that isn't on any work.
		expect(plumpArm("type1", "rest", 1, 0)).toBeUndefined();
		expect(plumpArm("wave1", "rest", 1, 3)).toBeUndefined();
	});

	test("a frame's targets: the plain mochi's as written, a plum's work arms re-solved", () => {
		const typing = POSES.find((p) => p.name === "typing")!.frames[0]!;
		expect(channelsAt(typing, 0)).toEqual(channels(typing));
		const plum = channelsAt(typing, 3);
		expect(plum.shoulderL).not.toBe(channels(typing).shoulderL);
		expect(plum.legL).toBe(channels(typing).legL);
	});
});
