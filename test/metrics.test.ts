// Metrics as things (plan-next stream B): numbers in, thing state out. The mappings, then the
// director acting them out: the in-tray and the shredder, the tower counting lines, the planner,
// your office's queue, and each model's personality. Every session and number is invented.
import { describe, expect, test } from "bun:test";
import { BEATS } from "../src/scene/director/beats";
import { cueFor, direct } from "../src/scene/director/direct";
import { ERRANDS } from "../src/scene/director/errands";
import { METRICS, drawersFor, lampFor, mugsFor, skipLoad, towerBricks, trayFor } from "../src/scene/director/metrics";
import { PACE } from "../src/scene/director/pace";
import { TRAITS } from "../src/scene/director/traits";
import type { World } from "../src/scene/director/types";
import { FloorPlan } from "../src/scene/office/layout";
import { PROPS } from "../src/scene/office/propspots";
import { RIG_PLANNER, bellFrom } from "../src/scene/office/rigpoints";
import { POSE, duration } from "../src/scene/rig/poses";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

const T0 = Date.UTC(2026, 10, 19, 14, 0);
const SEC = 1000;
const MIN = 60 * SEC;
const ctx = (share: number) => ({ used: share * 1_000_000, window: 1_000_000, at: T0 });

const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({
	id,
	role: "general-purpose",
	task: `invented task ${id}`,
	depth: 1,
	status: "running",
	lastWriteAt: T0 - SEC,
	activity: { tool: "Edit", at: T0 - SEC },
	children: [],
	...extra,
});

const session = (id: string, extra: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: `Invented ${id}`,
	cwd: "/Users/you/code/teapot",
	project: "teapot",
	origin: "cli",
	state: "busy",
	stateSince: T0 - 10 * MIN,
	startedAt: T0 - 60 * MIN + id.length,
	activity: { tool: "Read", at: T0 - 30 * SEC },
	agents: [],
	children: [],
	...extra,
});

function stage() {
	const plan = new FloorPlan();
	let world: World | undefined;
	return {
		step(sessions: Session[], now: number) {
			const snap: Snapshot = { at: now, sessions };
			const floor = plan.update(snap);
			const d = direct(world, snap, now, floor);
			world = d.world;
			return { ...d, floor };
		},
	};
}
const actor = (w: World, key: string) => w.actors[key]!;

describe("the mappings", () => {
	test("context fullness is an in-tray pile: none without a window, spilling past 80%, buried past 95%", () => {
		expect(trayFor(undefined)).toBeUndefined();
		expect(trayFor({ used: 500_000, at: T0 })).toBeUndefined();
		expect(trayFor(ctx(0))).toEqual({ sheets: 0, spill: 0, buried: false });
		expect(trayFor(ctx(0.01))!.sheets).toBe(1);
		expect(trayFor(ctx(0.5))).toEqual({ sheets: METRICS.traySheets / 2, spill: 0, buried: false });
		expect(trayFor(ctx(0.79))!.spill).toBe(0);
		expect(trayFor(ctx(0.8))!.spill).toBe(1);
		expect(trayFor(ctx(0.94))).toMatchObject({ buried: false });
		expect(trayFor(ctx(0.96))).toMatchObject({ buried: true, spill: 3 });
		expect(trayFor(ctx(1.4))!.sheets).toBe(METRICS.traySheets);
	});

	test("lines added are bricks: one per 20, log-ish past 200, capped", () => {
		expect([0, 19, 20, 39, 40, 200].map((n) => towerBricks(n))).toEqual([0, 0, 1, 1, 2, 10]);
		expect(towerBricks(400)).toBe(16);
		expect(towerBricks(800)).toBe(22);
		expect(towerBricks(1_000_000)).toBe(30);
		expect(towerBricks(1_000_000, 12)).toBe(12);
		// Never fewer bricks for more lines.
		for (let n = 1; n < 5000; n += 7) expect(towerBricks(n + 7)).toBeGreaterThanOrEqual(towerBricks(n));
	});

	test("removed lines fill a skip in loads, each load twice the last", () => {
		expect([0, 1, 20, 21, 60, 61, 140, 300, 620, 1e6].map(skipLoad)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5, 5]);
	});

	test("files touched are drawers: one per ten, the full ones bulging, four at most", () => {
		expect(drawersFor(0)).toBeUndefined();
		expect(drawersFor(1)).toEqual({ drawers: 1, full: 0 });
		expect(drawersFor(10)).toEqual({ drawers: 1, full: 1 });
		expect(drawersFor(25)).toEqual({ drawers: 3, full: 2 });
		expect(drawersFor(400)).toEqual({ drawers: 4, full: 4 });
	});

	test("cost is mugs, a cup each, up to six", () => {
		expect(mugsFor(session("a"))).toBe(0);
		expect(mugsFor(session("a", { cost: { outputTokens: 350_000 } }))).toBe(3);
		expect(mugsFor(session("a", { cost: { usd: 400, outputTokens: 0 } }))).toBe(6);
	});

	test("the test lamp shows the latest test result, and keeps it through other commands", () => {
		const test = (exitCode: number, at: number) => ({ commands: { failStreak: 0, repeats: 1, failed: 0, testsFailed: 0, last: { kind: "test" as const, exitCode, at } } });
		expect(lampFor([{}])).toEqual({});
		expect(lampFor([test(0, 5), test(1, 9)]).lamp).toBe("red");
		expect(lampFor([test(1, 5), test(0, 9)]).lamp).toBe("green");
		const build = { commands: { failStreak: 0, repeats: 1, failed: 0, testsFailed: 0, last: { kind: "build" as const, exitCode: 0, at: 20 } } };
		expect(lampFor([build], { lamp: "red", at: 9 })).toEqual({ lamp: "red", at: 9 });
	});
});

describe("on the desk", () => {
	test("each desk's things, and the family word for the name card", () => {
		const s = stage();
		const d = s.step([session("a", { family: "opus", context: ctx(0.5), changes: { files: 12, added: 300, removed: 50 }, cost: { outputTokens: 210_000 } })], T0);
		const desk = d.world.metrics!.desks.a!;
		expect(desk).toMatchObject({ tray: { sheets: 8, spill: 0, buried: false }, word: "opus", drawers: { drawers: 2, full: 1 }, skip: 2, mugs: 2 });
		// No family, no window: no word, no pile.
		const e = s.step([session("a")], T0 + SEC);
		expect(e.world.metrics!.desks.a!.word).toBeUndefined();
		expect(e.world.metrics!.desks.a!.tray).toBeUndefined();
	});

	test("past 95% a busy lead at its desk is buried in its in-tray (the rig draws that pile, not the office)", () => {
		const d = stage().step([session("a", { context: ctx(0.97) })], T0);
		expect(actor(d.world, "s:a").pose).toBe("buried");
		expect(d.world.metrics!.desks.a!.tray!.rig).toBe(true);
		// Idle with the same context: not playing buried, so the office draws its pile.
		expect(stage().step([session("a", { state: "idle", context: ctx(0.97) })], T0).world.metrics!.desks.a!.tray!.rig).toBeUndefined();
		const ok = stage().step([session("a", { context: ctx(0.9) })], T0);
		expect(actor(ok.world, "s:a").pose).not.toBe("buried");
	});

	test("a compaction is the lead walking the pile to the shredder, feeding it in, and walking back", () => {
		const s = stage();
		s.step([session("a", { context: ctx(0.9), compactions: { count: 0 } })], T0);
		const go = s.step([session("a", { context: ctx(0.1), compactions: { count: 1, lastAt: T0 + 900 } })], T0 + SEC);
		const lead = actor(go.world, "s:a");
		const st = go.floor.areas.find((a) => a.id === "room:teapot")!.shredder!;
		expect(lead.spot).toBe(`station:${st.id}`);
		expect(lead.slot.facing).toBe(1);
		expect(lead.errand!.until - lead.errand!.since - lead.errand!.walkMs).toBe(duration(POSE.shred!.frames) * ERRANDS.shredLoops);
		// The pile is out with the lead until it's done.
		expect(go.world.metrics!.desks.a!.tray!.out).toBe(true);
		const at = s.step([session("a", { context: ctx(0.1), compactions: { count: 1, lastAt: T0 + 900 } })], lead.errand!.since + lead.errand!.walkMs + 10);
		expect(actor(at.world, "s:a").pose).toBe("shred");
		const back = s.step([session("a", { context: ctx(0.1), compactions: { count: 1, lastAt: T0 + 900 } })], lead.errand!.until);
		expect(actor(back.world, "s:a").spot).toBe("desk");
		expect(actor(back.world, "s:a").walk).toBeDefined();
		expect(back.world.metrics!.desks.a!.tray).toEqual({ sheets: 2, spill: 0, buried: false });
	});
});

describe("the tower counts lines", () => {
	const crew = (added: number[], tool = "Edit", at = T0 - SEC) => added.map((n, i) => agent(`b${i}`, { activity: { tool, at }, changes: { files: 1, added: n, removed: 0 } }));

	test("a brick per ~20 lines across the session and its agents, not one per edit", () => {
		const s = stage();
		const d = s.step([session("rel", { changes: { files: 1, added: 40, removed: 0 }, agents: crew([100, 60, 0]) })], T0);
		expect(d.world.builds.rel!.pieces).toBe(10);
		// A new edit with only a few lines: no new brick yet.
		const e = s.step([session("rel", { changes: { files: 1, added: 40, removed: 0 }, agents: crew([105, 60, 0], "Edit", T0 + 2 * SEC) })], T0 + 3 * SEC);
		expect(e.world.builds.rel!.pieces).toBe(10);
		const f = s.step([session("rel", { changes: { files: 1, added: 40, removed: 0 }, agents: crew([260, 60, 0], "Edit", T0 + 4 * SEC) })], T0 + 5 * SEC);
		expect(f.world.builds.rel!.pieces).toBe(towerBricks(360));
	});

	test("a red test still knocks one off, and it goes back when the lines grow", () => {
		const s = stage();
		s.step([session("rel", { agents: crew([200, 0, 0]) })], T0);
		const red = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test" as const, exitCode: 1, at: T0 + SEC } };
		const fell = s.step([session("rel", { agents: crew([200, 0, 0]).map((a, i) => (i === 1 ? { ...a, commands: red } : a)) })], T0 + 2 * SEC);
		expect(fell.world.builds.rel!.pieces).toBe(9);
		const grown = s.step([session("rel", { agents: crew([240, 0, 0], "Edit", T0 + 3 * SEC).map((a, i) => (i === 1 ? { ...a, commands: red } : a)) })], T0 + 4 * SEC);
		expect(grown.world.builds.rel!.pieces).toBe(towerBricks(240));
	});

	test("a session with no line counts still counts edits, as before", () => {
		const s = stage();
		const a = (at: number) => [agent("b0", { activity: { tool: "Edit", at } }), agent("b1"), agent("b2")];
		const first = s.step([session("rel", { agents: a(T0 - SEC) })], T0).world.builds.rel!.pieces;
		expect(s.step([session("rel", { agents: a(T0 + SEC) })], T0 + 2 * SEC).world.builds.rel!.pieces).toBe(first + 1);
	});
});

describe("the rig's working points", () => {
	test("the in-tray sits at the rig's TRAY for the lead behind its desk", () => {
		// 21 units right of a 72 px lead at (-26, -42), 30 units wide, on the desk top 28 units up.
		const t = PROPS.tray;
		expect(t.x + t.w / 2).toBeCloseTo(-26 + (21 * 72) / 85, 5);
		expect(t.w).toBeCloseTo((30 * 72) / 85, 5);
		expect(t.y).toBeCloseTo(-42 - (28 * 72) / 85, 5);
	});

	test("the bell counter stands under the first ringer's plunger", () => {
		const yours = new FloorPlan().update({ at: T0, sessions: [] }).areas.find((a) => a.kind === "yours")!;
		const front = yours.spots.line![0]!;
		const counter = yours.fixtures.find((f) => f.kind === "bell")!;
		const { plunger, top } = bellFrom(front, 72);
		expect(counter.x).toBe(Math.round(plunger.x));
		// The counter's drawn top (props.ts: 31 px up from its base) is BELL_BASE under the plunger.
		expect(counter.y - 31).toBeCloseTo(top, 0);
		expect(counter.depth).toBeLessThan(front.depth);
	});

	test("a poster stands so its note lands in the planner's DONE column", () => {
		const s = stage();
		s.step([session("a", { todos: { pending: 1, active: 0, done: 0 }, agents: [agent("c0")] })], T0);
		const d = s.step([session("a", { todos: { pending: 0, active: 0, done: 1 }, agents: [agent("c0")] })], T0 + SEC);
		const c = actor(d.world, "a:a:c0");
		const board = d.floor.areas.find((a) => a.id === "room:teapot")!.wall.find((w) => w.kind === "planner")!.rect;
		const note = { x: c.slot.x + (RIG_PLANNER.x * 58) / 85, y: c.slot.y + (RIG_PLANNER.y * 58) / 85 };
		expect(note.x).toBeGreaterThan(board.x + (board.w * 2) / 3);
		expect(note.x).toBeLessThan(board.x + board.w);
		expect(note.y).toBeGreaterThan(board.y);
		expect(note.y).toBeLessThan(board.y + board.h);
		expect(c.slot.facing).toBe(1);
		expect(c.slot.y).toBeGreaterThan(d.floor.areas.find((a) => a.id === "room:teapot")!.floorY);
	});
});

describe("the planner", () => {
	test("a todo done: a crew member walks the note over, posts it, and the column moves", () => {
		const s = stage();
		const crew = [agent("c1"), agent("c0")];
		s.step([session("a", { todos: { pending: 2, active: 1, done: 1 }, agents: crew })], T0);
		const d = s.step([session("a", { todos: { pending: 1, active: 1, done: 2 }, agents: crew })], T0 + SEC);
		const carrier = actor(d.world, "a:a:c0");
		expect(carrier.spot).toBe("planner:a");
		expect(cueFor(carrier, T0 + SEC).walkPose).toBe(ERRANDS.stickyWalk);
		expect(carrier.pose).toBe(ERRANDS.stickyPose);
		expect(carrier.home).toMatch(/^crew:/);
		// The note isn't up until it's posted.
		expect(d.world.metrics!.planners["room:teapot"]).toEqual([{ session: "a", pending: 1, active: 2, done: 1 }]);
		const posted = s.step([session("a", { todos: { pending: 1, active: 1, done: 2 }, agents: crew })], carrier.errand!.until);
		expect(posted.world.metrics!.planners["room:teapot"]).toEqual([{ session: "a", pending: 1, active: 1, done: 2 }]);
		expect(actor(posted.world, "a:a:c0").spot).toBe(carrier.home!);
	});

	test("with no crew free, the lead walks it over", () => {
		const s = stage();
		s.step([session("a", { todos: { pending: 1, active: 0, done: 0 } })], T0);
		const d = s.step([session("a", { todos: { pending: 0, active: 0, done: 1 } })], T0 + SEC);
		expect(actor(d.world, "s:a").spot).toBe("planner:a");
	});
});

describe("your office", () => {
	const wait = (id: string, since: number) => session(id, { state: "idle", waiting: { reason: "permission", since, source: "hook" } });

	test("waiting leads queue with tickets in the order their waits started; the first rings the bell", () => {
		const s = stage();
		s.step([session("a"), session("bb"), session("ccc")], T0);
		// bb started waiting before ccc, though ccc comes first in the snapshot.
		const d = s.step([session("a"), wait("ccc", T0 + 900), wait("bb", T0 + 500)], T0 + SEC);
		const m = d.world.metrics!;
		expect(m.tickets["s:bb"]!.n).toBe(1);
		expect(m.tickets["s:ccc"]!.n).toBe(2);
		expect(m.serving).toBe(1);
		expect(actor(d.world, "s:bb").spot).toBe("yours:line:0");
		expect(actor(d.world, "s:ccc").spot).toBe("yours:line:1");
		expect(actor(d.world, "s:bb").pose).toBe(ERRANDS.ticketPose);
		// The pulse and the pill stay on the lead's own room.
		expect(actor(d.world, "s:bb").homeArea).toBe("room:teapot");
		// At the counter, the first one in rings the bell once; the second never does.
		const walk = actor(d.world, "s:bb").walk!;
		const there = s.step([session("a"), wait("ccc", T0 + 900), wait("bb", T0 + 500)], walk.since + walk.ms);
		expect(actor(there.world, "s:bb").pose).toBe(ERRANDS.bellPose);
		const later = s.step([session("a"), wait("ccc", T0 + 900), wait("bb", T0 + 500)], walk.since + walk.ms + 10 * SEC);
		expect(actor(later.world, "s:bb").pose).toBe(ERRANDS.ticketPose);
		expect(actor(later.world, "s:ccc").pose).toBe(ERRANDS.ticketPose);
	});

	test("answered, the lead walks back to its desk and the queue shuffles up", () => {
		const s = stage();
		s.step([session("a"), session("bb"), session("ccc")], T0);
		s.step([session("a"), wait("ccc", T0 + 900), wait("bb", T0 + 500), wait("a", T0 + 950)], T0 + SEC);
		const d = s.step([session("a", { waiting: { reason: "plan", since: T0 + 950, source: "hook" } }), session("bb"), wait("ccc", T0 + 900)], T0 + 20 * SEC);
		expect(actor(d.world, "s:bb").spot).toBe("desk");
		expect(actor(d.world, "s:bb").walk).toBeDefined();
		expect(actor(d.world, "s:ccc").spot).toBe("yours:line:0");
		expect(actor(d.world, "s:a").spot).toBe("yours:line:1");
		// Tickets keep their numbers; a new wait gets the next one.
		expect(d.world.metrics!.tickets["s:ccc"]!.n).toBe(2);
		expect(d.world.metrics!.serving).toBe(2);
		const again = s.step([session("a"), wait("bb", T0 + 21 * SEC), session("ccc")], T0 + 22 * SEC);
		expect(again.world.metrics!.tickets["s:bb"]!.n).toBe(4);
		expect(again.world.metrics!.serving).toBe(4);
		expect(actor(again.world, "s:bb").spot).toBe("yours:line:0");
	});
});

describe("model personalities", () => {
	const lone = (family: Session["family"]) => [session("rel", { family, agents: [agent("c0", { family, activity: { tool: "Read", at: T0 - SEC } })], todos: { pending: 1, active: 0, done: 0 } })];

	test("walks and poses run at the family's pace", () => {
		const walkOf = (family: Session["family"]) => {
			const s = stage();
			s.step(lone(family), T0);
			const done = lone(family).map((x) => ({ ...x, todos: { pending: 0, active: 0, done: 1 } }));
			const e = actor(s.step(done, T0 + SEC).world, "a:rel:c0").errand!;
			// A deliberate model sets off after its beat.
			expect(e.since).toBe(T0 + SEC + TRAITS[family ?? "other"].pauseMs);
			const c = actor(s.step(done, e.since).world, "a:rel:c0");
			return { ms: e.walkMs, cue: cueFor(c, e.since) };
		};
		const haiku = walkOf("haiku");
		const opus = walkOf("opus");
		expect(haiku.ms).toBeLessThan(opus.ms);
		// The steps keep pace: the heat pace (a jog, for a fresh write) times the family's stride.
		expect(haiku.cue.walkTempo).toBe(Math.round(PACE.speed.jog * TRAITS.haiku.walk * 100) / 100);
		expect(opus.cue.walkTempo).toBe(Math.round(PACE.speed.jog * TRAITS.opus.walk * 100) / 100);
		// A busy loop's tempo carries the family's too.
		const t = (family: Session["family"]) => actor(stage().step(lone(family), T0).world, "a:rel:c0").tempo;
		expect(t("haiku") / t(undefined)).toBeCloseTo(TRAITS.haiku.tempo, 1);
	});

	test("a deliberate model takes a beat before an acted pose", () => {
		const red = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test" as const, exitCode: 1, at: T0 + 900 } };
		const s = stage();
		s.step([session("a", { family: "opus" })], T0);
		const d = s.step([session("a", { family: "opus", commands: red })], T0 + SEC);
		expect(actor(d.world, "s:a").pose).not.toBe("testFailed");
		expect(actor(d.world, "s:a").pending).toMatchObject({ pose: "testFailed", at: T0 + SEC + TRAITS.opus.pauseMs });
		expect(d.wake).toBeLessThanOrEqual(T0 + SEC + TRAITS.opus.pauseMs);
		const e = s.step([session("a", { family: "opus", commands: red })], T0 + SEC + TRAITS.opus.pauseMs);
		expect(actor(e.world, "s:a").pose).toBe("testFailed");
		// A quick one doesn't wait.
		const h = stage();
		h.step([session("a", { family: "haiku" })], T0);
		expect(actor(h.step([session("a", { family: "haiku", commands: red })], T0 + SEC).world, "s:a").pose).toBe("testFailed");
	});

	test("fable now and then adds a flourish after finishing something; others never do", () => {
		let flourishes = 0;
		let others = 0;
		for (let i = 0; i < 40; i++) {
			for (const family of ["fable", "sonnet"] as const) {
				const s = stage();
				const id = `pr${i}`;
				s.step([session(id, { family })], T0);
				const withPr = [session(id, { family, prs: [{ number: i + 1, url: "https://example.invalid/pull/1", at: T0 + 900 }] })];
				// The lead walks the PR to the outbox first (handoff.ts), then celebrates at its desk; fable
				// takes its beat before acting.
				let lead = actor(s.step(withPr, T0 + SEC).world, `s:${id}`);
				let t = T0 + SEC;
				while (lead.pose !== "prOpened" && t < T0 + 30 * SEC) lead = actor(s.step(withPr, (t += 250)).world, `s:${id}`);
				expect(lead.pose).toBe("prOpened");
				// Watch the seconds after the celebration ends (a deliberate model's beat first).
				const end = lead.poseSince + duration(POSE[lead.pose]!.frames);
				let flourished = false;
				// (After the outbox, the celebration holds as long as the two-hander would: celebrateMs.)
				for (t = Math.max(t, end); t < end + 8 * SEC && !flourished; t += 250) flourished = actor(s.step(withPr, t).world, `s:${id}`).pose === BEATS.flourish;
				if (flourished) family === "fable" ? flourishes++ : others++;
			}
		}
		expect(others).toBe(0);
		expect(flourishes).toBeGreaterThan(8);
		expect(flourishes).toBeLessThan(32);
	});
});
