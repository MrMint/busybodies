// The director: invented snapshots in, world and events out. Pure, no Pixi.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Direction, RULES, direct, here } from "../src/scene/director/direct";
import { along, pathBetween, pathLength } from "../src/scene/director/paths";
import type { World } from "../src/scene/director/types";
import { FloorPlan } from "../src/scene/office/layout";
import { HABITS, POSE } from "../src/scene/rig/poses";
import { parseRecording } from "../src/watcher/replay";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

const T0 = Date.UTC(2026, 10, 19, 14, 0);
const MIN = 60_000;

const agent = (id: string, role: string, extra: Partial<Agent> = {}): Agent => ({
	id,
	role,
	task: "invented task",
	depth: 1,
	status: "running",
	lastWriteAt: T0,
	children: [],
	...extra,
});

const session = (id: string, project: string, extra: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: `Session ${id}`,
	cwd: `/Users/you/code/${project}`,
	project,
	origin: "cli",
	state: "busy",
	stateSince: T0 - 5 * MIN,
	startedAt: T0 - 60 * MIN + id.length,
	agents: [],
	children: [],
	...extra,
});

/** A small director harness: one floor plan, folded snapshot by snapshot like the office does. */
function stage() {
	const plan = new FloorPlan();
	let world: World | undefined;
	const all: Direction[] = [];
	return {
		step(snap: Snapshot, now = snap.at): Direction {
			const floor = plan.update(snap);
			const d = direct(world, snap, now, floor);
			world = d.world;
			all.push(d);
			return d;
		},
		get world() {
			return world!;
		},
		all,
	};
}

const snap = (at: number, sessions: Session[]): Snapshot => ({ at, sessions });
const actor = (w: World, key: string) => w.actors[key]!;

describe("standing poses", () => {
	test("busy leads type and builders hammer; long tool runs think, long builds sulk", () => {
		const s = stage();
		const d = s.step(
			snap(T0, [
				session("a", "teapot", { agents: [agent("b1", "stream-builder")] }),
				session("bb", "teapot", { running: { tool: "Task", since: T0 - 3 * MIN } }),
				session("ccc", "teapot", { running: { tool: "Bash", since: T0 - 25 * MIN, kind: "build" } }),
			]),
		);
		expect(actor(d.world, "s:a").pose).toBe("typing");
		expect(actor(d.world, "a:a:b1").pose).toBe("hammer");
		expect(actor(d.world, "s:bb").pose).toBe("thinking");
		expect(actor(d.world, "s:ccc").pose).toBe("grumpy");
	});

	test("a build turns long on its own, and the director asks to be woken for it", () => {
		const s = stage();
		const run = { tool: "Bash", since: T0, kind: "build" as const };
		const d = s.step(snap(T0, [session("a", "teapot", { running: run })]));
		expect(actor(d.world, "s:a").pose).toBe("typing");
		expect(d.wake).toBe(T0 + RULES.thinkingMin * MIN);
		const later = s.step(snap(T0, [session("a", "teapot", { running: run })]), T0 + RULES.longBuildMin * MIN);
		expect(actor(later.world, "s:a").pose).toBe("grumpy");
	});

	test("idle characters slack off in a habit picked from their id, rotating slowly", () => {
		const s = stage();
		const idle = (at: number) => snap(at, Array.from({ length: 14 }, (_, i) => session(`idle${i}`, "teapot", { state: "idle", stateSince: T0 })));
		const d = s.step(idle(T0));
		const habits = new Set(HABITS.map((h) => h.name));
		const first = Object.values(d.world.actors).map((a) => a.pose);
		for (const p of first) expect(habits.has(p)).toBe(true);
		expect(new Set(first).size).toBeGreaterThan(3);
		// Found idle: start settled, mid-habit.
		for (const a of Object.values(d.world.actors)) expect(a.at).toBe("end");
		const same = s.step(idle(T0 + MIN));
		expect(Object.values(same.world.actors).map((a) => a.pose)).toEqual(first);
		expect(same.events).toEqual([]);
		const rotated = s.step(idle(T0 + RULES.habitRotateMin * MIN));
		const next = Object.values(rotated.world.actors).map((a) => a.pose);
		next.forEach((p, i) => expect(p).not.toBe(first[i]));
	});

	test("stalled agents gather cobwebs; retries and API retries make grumpy", () => {
		const s = stage();
		const d = s.step(
			snap(T0, [
				session("a", "teapot", { agents: [agent("x", "scout", { status: "stalled" })], commands: { failStreak: 0, repeats: 4, failed: 0, testsFailed: 0 } }),
				session("bb", "teapot", { apiRetry: { attempt: 2, at: T0 - MIN } }),
			]),
		);
		expect(actor(d.world, "a:a:x").pose).toBe("stalled");
		expect(actor(d.world, "a:a:x").at).toBe("end");
		expect(actor(d.world, "s:a").pose).toBe("grumpy");
		expect(actor(d.world, "s:bb").pose).toBe("grumpy");
	});
});

describe("acted poses", () => {
	test("a failed test plays the failed pose once, then back to work", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot")]));
		const fail = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test" as const, exitCode: 1, at: T0 + 1000 } };
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { commands: fail })]));
		const a = actor(d.world, "s:a");
		expect(a.pose).toBe("testFailed");
		expect(a.acted).toBe(true);
		expect(d.events).toContainEqual({ type: "pose", key: "s:a", at: T0 + 1000, pose: "testFailed", as: "lead", acted: true });
		const len = POSE.testFailed!.frames.reduce((n, f) => n + f.ms, 0);
		expect(d.wake).toBe(T0 + 1000 + len);
		// The same failure on the next snapshot changes nothing.
		expect(s.step(snap(T0 + 2000, [session("a", "teapot", { commands: fail })])).events).toEqual([]);
		const after = s.step(snap(T0 + 1000 + len, [session("a", "teapot", { commands: fail })]));
		expect(actor(after.world, "s:a").pose).toBe("typing");
	});

	test("an old failure on the first snapshot is history, not news", () => {
		const fail = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test" as const, exitCode: 1, at: T0 - 10 * MIN } };
		const d = stage().step(snap(T0, [session("a", "teapot", { commands: fail })]));
		expect(actor(d.world, "s:a").pose).toBe("typing");
	});

	test("a PR opened: celebrate with a busy teammate at the desk, else alone", () => {
		const s = stage();
		const crew = [agent("v", "verifier")];
		s.step(snap(T0, [session("a", "teapot", { agents: crew }), session("bb", "kettle")]));
		const pr = (n: number) => [{ number: n, url: `https://example.invalid/pr/${n}`, at: T0 + 1000 }];
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { agents: crew, prs: pr(7) }), session("bb", "kettle", { prs: pr(8) })]));
		expect(actor(d.world, "s:a").pose).toBe("celebrate");
		expect(actor(d.world, "a:a:v")).toMatchObject({ pose: "celebrate", as: "partner" });
		expect(actor(d.world, "s:bb").pose).toBe("prOpened");
	});

	test("a new subagent: the boss hands over and the hire plays the other half", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot")]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { agents: [agent("new", "scout")] })]));
		expect(actor(d.world, "s:a")).toMatchObject({ pose: "handover", as: "lead" });
		expect(actor(d.world, "a:a:new")).toMatchObject({ pose: "handover", as: "partner", spot: "crew:0" });
		expect(d.events).toContainEqual({ type: "handover", key: "s:a", at: T0 + 1000, to: "a:a:new" });
		expect(d.events).toContainEqual({ type: "arrive", key: "a:a:new", at: T0 + 1000, spot: "crew:0", area: actor(d.world, "s:a").area, walk: false });
	});

	test("a compaction stretches", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot", { compactions: { count: 1, lastAt: T0 - 30 * MIN } })]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { compactions: { count: 2, lastAt: T0 + 900 } })]));
		expect(actor(d.world, "s:a").pose).toBe("stretch");
	});
});

describe("waiting on you", () => {
	test("the paddle goes up, and events mark the start and end", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot")]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { state: "idle", waiting: { reason: "permission", since: T0 + 900, source: "hook" } })]));
		expect(["waiting", "waitingPlease"]).toContain(actor(d.world, "s:a").pose);
		expect(d.events.filter((e) => e.type === "waiting")).toEqual([{ type: "waiting", key: "s:a", at: T0 + 1000, state: "start", area: actor(d.world, "s:a").area }]);
		const still = s.step(snap(T0 + 5000, [session("a", "teapot", { state: "idle", waiting: { reason: "permission", since: T0 + 900, source: "hook" } })]));
		expect(still.events).toEqual([]);
		const done = s.step(snap(T0 + 9000, [session("a", "teapot")]));
		expect(done.events.filter((e) => e.type === "waiting").map((e) => (e as { state: string }).state)).toEqual(["end"]);
	});

	test("the rare variant comes up about one wait in twenty, the same way every run", () => {
		const run = () => {
			let rare = 0;
			for (let i = 0; i < 400; i++) {
				const d = stage().step(snap(T0, [session(`w${i}`, "teapot", { state: "idle", waiting: { reason: "question", since: T0, source: "transcript" } })]));
				if (actor(d.world, `s:w${i}`).pose === "waitingPlease") rare++;
			}
			return rare;
		};
		const n = run();
		expect(n).toBeGreaterThan(8);
		expect(n).toBeLessThan(40);
		expect(run()).toBe(n);
	});
});

describe("movement", () => {
	test("an unrelated change moves no one", () => {
		const s = stage();
		const day = (tool: string) =>
			snap(T0, [
				session("a", "teapot", { agents: [agent("x", "scout"), agent("y", "builder"), agent("r", "reviewer")], activity: { tool, at: T0 } }),
				session("bb", "kettle", { agents: [agent("z", "designer")] }),
			]);
		const first = s.step(day("Edit"));
		const second = s.step(day("Bash"));
		expect(second.events).toEqual([]);
		for (const [k, a] of Object.entries(second.world.actors)) {
			expect(a.slot).toEqual(first.world.actors[k]!.slot);
			expect(a.walk).toBeUndefined();
		}
	});

	test("a reviewer walks to the meeting room and back, along the hallway", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot", { agents: [agent("r", "reviewer", { status: "stalled" })] })]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { agents: [agent("r", "reviewer")] })]));
		const r = actor(d.world, "a:a:r");
		expect(r.spot).toMatch(/^meeting:seat:/);
		expect(d.events).toContainEqual({ type: "review", key: "a:a:r", at: T0 + 1000, state: "start" });
		const w = d.events.find((e) => e.type === "walk");
		expect(w).toMatchObject({ key: "a:a:r", from: "crew:0" });
		// The walk passes through the hallway (y between 0 and its height).
		expect(r.walk!.path.some((p) => p.y > 0 && p.y < 130)).toBe(true);
		const back = s.step(snap(T0 + 60_000, [session("a", "teapot", { agents: [agent("r", "reviewer", { status: "stalled" })] })]));
		expect(back.events).toContainEqual({ type: "review", key: "a:a:r", at: T0 + 60_000, state: "end" });
	});

	test("finished agents walk to the kitchen, then out of the door, then leave the stage", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot", { agents: [agent("x", "scout")] })]));
		const done = s.step(snap(T0 + 1000, [session("a", "teapot", { agents: [agent("x", "scout", { status: "finished" })] })]));
		const x = actor(done.world, "a:a:x");
		expect(x.spot).toMatch(/^kitchen:queue:0$/);
		expect(x.pose).toBe("done");
		const gone = s.step(snap(T0 + 3 * MIN, [session("a", "teapot")]));
		const out = actor(gone.world, "a:a:x");
		expect(gone.events).toContainEqual({ type: "leave", key: "a:a:x", at: T0 + 3 * MIN });
		expect(out.walk!.exit).toBe(true);
		expect(out.spot).toBe("door");
		expect(gone.wake).toBe(out.gone);
		const later = s.step(snap(out.gone!, [session("a", "teapot")]));
		expect(later.world.actors["a:a:x"]).toBeUndefined();
	});

	test("a newly hired reviewer starts at the desk and walks to the meeting room", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot")]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { agents: [agent("r", "reviewer")] })]));
		const r = actor(d.world, "a:a:r");
		expect(r.spot).toMatch(/^meeting:seat:/);
		expect(d.events).toContainEqual({ type: "review", key: "a:a:r", at: T0 + 1000, state: "start" });
		expect(r.walk).toBeDefined();
		expect(r.walk!.path[0]!.y).toBeLessThan(0); // the desk, up in the room above the hallway
	});

	test("a new session walks in from the lobby door to its desk", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot")]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot"), session("bb", "teapot")]));
		const b = actor(d.world, "s:bb");
		expect(d.events).toContainEqual({ type: "arrive", key: "s:bb", at: T0 + 1000, spot: "desk", area: b.area, walk: true });
		expect(here(b, T0 + 1000).y).toBeGreaterThan(130); // starts in the lobby, below the hallway
		expect(here(b, T0 + 1000 + b.walk!.ms)).toEqual({ x: b.slot.x, y: b.slot.y });
	});

	test("walks go room to hallway to room, never through a wall", () => {
		const floor = new FloorPlan().update(snap(T0, [session("a", "teapot")]));
		const room = floor.areas.find((a) => a.kind === "project")!;
		const kitchen = floor.areas.find((a) => a.kind === "kitchen")!;
		const from = floor.desks.get("a")!.lead;
		const to = kitchen.spots.queue![0]!;
		const path = pathBetween(floor, room.id, from, kitchen.id, to);
		const inside = (p: { x: number; y: number }) =>
			(p.y >= floor.hallway.y && p.y <= floor.hallway.y + floor.hallway.h) ||
			floor.areas.some((a) => p.x >= a.rect.x && p.x <= a.rect.x + a.rect.w && p.y >= a.floorY && p.y <= a.rect.y + a.rect.h) ||
			// Through a wall only at a door.
			floor.areas.some((a) => a.wall.some((w) => w.kind === "door" && p.x >= w.rect.x && p.x <= w.rect.x + w.rect.w && p.y >= a.rect.y && p.y <= a.floorY));
		// Sample every 10 px along the path.
		const len = pathLength(path);
		for (let d = 0; d <= len; d += 10) expect(inside(along(path, d, len))).toBe(true);
	});
});

describe("replay", () => {
	test("the recorded fixture plays through the director to the same events every time", () => {
		const frames = parseRecording(readFileSync(join(import.meta.dir, "../fixtures/busy-release.ndjson"), "utf8"));
		expect(frames.length).toBeGreaterThan(5);
		const run = () => {
			const s = stage();
			for (const f of frames) s.step(f);
			return s.all.flatMap((d) => d.events);
		};
		const a = run();
		expect(a.length).toBeGreaterThan(0);
		expect(run()).toEqual(a);
		const kinds = new Set(a.map((e) => e.type));
		expect(kinds.has("pose")).toBe(true);
	});
});
