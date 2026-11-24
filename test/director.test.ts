// The director: invented snapshots in, world and events out. Pure, no Pixi.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Direction, RULES, direct, here } from "../src/scene/director/direct";
import { along, pathBetween, pathLength } from "../src/scene/director/paths";
import type { World } from "../src/scene/director/types";
import { demo, demoDay, releaseDay, stock } from "../src/mainview/demo";
import { FloorPlan } from "../src/scene/world/layout";
import { CARD } from "../src/scene/world/propspots";
import { AISLE, SQUEEZE, bodyRect, crewPlaces, crewSpots, endGaps, faceZone, floorFoot, meets, overlapX, yieldFrom } from "../src/scene/world/world";
import { HABITS, POSE } from "../src/scene/rig/poses";
import { roleFor } from "../src/scene/rig/roles";
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

	test("a PR opened: walked to the outbox, then celebrate with a busy teammate at the desk, else alone", () => {
		const s = stage();
		const crew = [agent("v", "verifier")];
		const both = (prs: boolean) => [session("a", "teapot", { agents: crew, ...(prs ? { prs: pr(7) } : {}) }), session("bb", "kettle", prs ? { prs: pr(8) } : {})];
		const pr = (n: number) => [{ number: n, url: `https://example.invalid/pr/${n}`, at: T0 + 1000 }];
		s.step(snap(T0, both(false)));
		const d = s.step(snap(T0 + 1000, both(true)));
		expect(actor(d.world, "s:a").pose).toBe("mailDrop");
		const drops = Math.max(d.world.mail!.a!.drops, d.world.mail!.bb!.drops);
		const back = s.step(snap(drops, both(true)));
		expect(actor(back.world, "s:a").pose).toBe("celebrate");
		expect(actor(back.world, "s:bb").pose).toBe("prOpened");
		const home = s.step(snap(back.world.mail!.a!.back!, both(true)));
		expect(actor(home.world, "a:a:v")).toMatchObject({ pose: "celebrate", as: "partner" });
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

	test("a compaction sends the lead to the room's shredder with its in-tray", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot", { compactions: { count: 1, lastAt: T0 - 30 * MIN } })]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { compactions: { count: 2, lastAt: T0 + 900 } })]));
		const lead = actor(d.world, "s:a");
		expect(lead.pose).toBe("shred");
		expect(lead.spot).toBe("station:room:teapot:shredder:0");
		expect(lead.walk).toBeDefined();
		expect(lead.homeArea).toBe("room:teapot");
	});
});

describe("waiting on you", () => {
	test("the lead takes a ticket to your office, and events mark the start and end in its room", () => {
		const s = stage();
		s.step(snap(T0, [session("a", "teapot")]));
		const d = s.step(snap(T0 + 1000, [session("a", "teapot", { state: "idle", waiting: { reason: "permission", since: T0 + 900, source: "hook" } })]));
		expect(["ticketPolite", "waitingPlease"]).toContain(actor(d.world, "s:a").pose);
		expect(actor(d.world, "s:a").spot).toBe("yours:line:0");
		expect(d.events.filter((e) => e.type === "waiting")).toEqual([{ type: "waiting", key: "s:a", at: T0 + 1000, state: "start", area: "room:teapot" }]);
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

	test("a general-purpose agent asked to review goes to the meeting room, in a reviewer's costume", () => {
		const s = stage();
		const d = s.step({ at: T0, sessions: [session("a", "kettle", { agents: [agent("r", "general-purpose", { task: "Review the spout change" }), agent("b", "general-purpose", { task: "Fix the lid" })] })] });
		expect(d.world.actors["a:a:r"]!.spot).toMatch(/^meeting:seat:/);
		expect(d.world.actors["a:a:b"]!.spot).not.toMatch(/^meeting:/);
	});

	test("someone else's stock setup still gets a varied crew", () => {
		const looks = new Set(stock().sessions.flatMap((s) => s.agents.map((a) => roleFor(a.role, a.task))));
		expect([...looks].sort()).toEqual(["builder", "designer", "explorer", "reviewer", "scout", "verifier"]);
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

describe("the desk aisle", () => {
	/** Every demo day, played forward like the office does: each step's world and floor. */
	const days = (): [string, { after: number; snapshot: Snapshot }[]][] => [
		["busy", [{ after: 0, snapshot: demo(null).snapshot }, ...demoDay()]],
		["release", [{ after: 0, snapshot: demo("release").snapshot }, ...releaseDay()]],
		["thirty", [{ after: 0, snapshot: demo("thirty").snapshot }]],
		["crowd", [{ after: 0, snapshot: demo("crowd").snapshot }]],
		["release, five more crew", [{ after: 0, snapshot: biggerCrew(demo("release").snapshot, "demo-session-7", 5) }]],
	];
	/** A snapshot with `n` more busy crew at one session: a front-row desk's crew too big for its row
	 * and its end places, so the row squeezes (world.ts SQUEEZE). */
	function biggerCrew(snap: Snapshot, id: string, n: number): Snapshot {
		const copy = structuredClone(snap);
		const find = (list: Session[]): Session | undefined => list.reduce<Session | undefined>((f, x) => f ?? (x.id === id ? x : find(x.children)), undefined);
		const s = find(copy.sessions)!;
		const model = s.agents.find((a) => a.status === "running")!;
		for (let k = 0; k < n; k++) s.agents.push({ ...structuredClone(model), id: `${model.id}-extra-${k}`, children: [] });
		return copy;
	}
	const still = (a: World["actors"][string], now: number) => !a.gone && !(a.walk && now < a.walk.since + a.walk.ms);
	/** Standing at its own spot: still, and not stepped aside for a brick run (a yield is a walk's
	 * cousin, exempt from the aisle's spacing and pills like a walker is: world.ts `yieldFrom`). */
	const placed = (a: World["actors"][string], now: number) => still(a, now) && !a.yielding;
	/** A task pill under a crew member's feet, at its widest (office.ts: 14 characters at 6.5 px). */
	const PILL_W = 54;

	test("crew standing at a desk overlap by under 15% of a body (35% squeezed up), and none stands on a name card", () => {
		let checked = 0;
		let squeezes = 0;
		for (const [name, steps] of days()) {
			const plan = new FloorPlan();
			let world: World | undefined;
			for (const { after, snapshot } of steps) {
				const floor = plan.update(snapshot);
				const now = snapshot.at + after;
				world = direct(world, snapshot, now, floor).world;
				const byDesk = new Map<string, World["actors"][string][]>();
				for (const a of Object.values(world.actors)) {
					if (a.kind !== "crew" || !a.spot.startsWith("crew:") || !placed(a, now)) continue;
					byDesk.set(a.session, [...(byDesk.get(a.session) ?? []), a]);
				}
				const cards = [...floor.desks.values()].map((d) => ({ id: d.id, r: { x: d.at.x - CARD.maxW / 2, y: d.at.y + CARD.top, w: CARD.maxW, h: CARD.foot - CARD.top } }));
				for (const [id, crew] of byDesk) {
					// A desk at the room's front whose crew fill its row, its lent cells and its free
					// ends tightens its row (world.ts SQUEEZE): that row may overlap up to SQUEEZE.overlap.
					const desk = floor.desks.get(id)!;
					const n = Math.max(...crew.map((a) => Number(a.spot.slice(5)) + 1));
					const row = crewSpots(floor, desk).slice(0, 4);
					const squeezed = crewPlaces(floor, desk, n).slice(0, 4).some((p, i) => p.x !== row[i]!.x || p.y !== row[i]!.y);
					if (squeezed) squeezes++;
					for (const [i, a] of crew.entries()) {
						const body = bodyRect(a.slot, a.size);
						for (const c of cards) if (meets(body, c.r)) throw new Error(`${name} +${after}: ${a.key} stands on ${c.id}'s name card`);
						for (const b of crew.slice(i + 1)) {
							const other = bodyRect(b.slot, b.size);
							const limit = (squeezed ? SQUEEZE.overlap : AISLE.overlap) * Math.min(body.w, other.w);
							if (overlapX(body, other) > limit) throw new Error(`${name} +${after}: ${a.key} and ${b.key} at ${id} overlap ${overlapX(body, other).toFixed(1)} px`);
							checked++;
						}
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(20);
		expect(squeezes).toBeGreaterThan(0);
	});

	test("the one on a desk's end place steps aside while a brick run to the build spot in its gap is under way, then back", () => {
		const snapshot = demo(null).snapshot;
		const floor = new FloorPlan().update(snapshot);
		const t0 = snapshot.at;
		const start = direct(undefined, snapshot, t0, floor).world;
		const d = floor.desks.get("demo-session-14")!;
		const gap = endGaps(floor, d)[0]!;
		expect(gap.builder).toBeDefined();
		const ender = Object.values(start.actors).find((a) => a.session === d.id && a.slot.x === gap.slot.x && a.slot.y === gap.slot.y)!;
		expect(ender).toBeDefined();
		// A brick run to the neighbour's build spot, as the director would have it under way.
		const t = t0 + 1000;
		const build = start.builds[gap.builder!] ?? ({ session: gap.builder!, pieces: 1, topped: false, seen: {} } as World["builds"][string]);
		const runner = Object.values(start.actors).find((a) => a.session === gap.builder && a.kind === "crew")?.key ?? "runner";
		const was: World = { ...start, builds: { ...start.builds, [gap.builder!]: { ...build, run: { key: runner, from: "crew:0", since: t, walkMs: 1500, lands: t + 3000, done: t + 4500, carried: true } } } };
		const during = direct(was, snapshot, t, floor);
		const a = during.world.actors[ender.key]!;
		expect(a.yielding).toBe(true);
		expect(a.slot).toEqual(yieldFrom(gap.slot));
		expect(a.walk).toBeDefined();
		// Only that one moves: the row does not reshuffle.
		for (const o of Object.values(during.world.actors)) if (o.session === d.id && o.kind === "crew" && o.key !== ender.key) expect(o.slot).toEqual(start.actors[o.key]!.slot);
		// Held aside while the run lasts, then back to the end place.
		const mid = direct(during.world, snapshot, t + 2000, floor).world.actors[ender.key]!;
		expect(mid.slot).toEqual(yieldFrom(gap.slot));
		const back = direct(direct(during.world, snapshot, t + 2000, floor).world, snapshot, t + 5000, floor).world.actors[ender.key]!;
		expect(back.yielding).toBeUndefined();
		expect(back.slot).toEqual(gap.slot);
		expect(back.walk).toBeDefined();
	});

	test("a standing crew member's feet are always on its own room's floor", () => {
		let checked = 0;
		for (const [name, steps] of days()) {
			const plan = new FloorPlan();
			let world: World | undefined;
			for (const { after, snapshot } of steps) {
				const floor = plan.update(snapshot);
				const now = snapshot.at + after;
				world = direct(world, snapshot, now, floor).world;
				for (const a of Object.values(world.actors)) {
					if (a.kind !== "crew" || !a.spot.startsWith("crew:") || !still(a, now)) continue;
					const room = floor.areas.find((r) => r.id === floor.desks.get(a.session)?.areaId)!;
					const ok = a.slot.y >= room.floorY && a.slot.y <= floorFoot(room) && a.slot.x > room.rect.x + 13 && a.slot.x < room.rect.x + room.rect.w - 13;
					if (!ok) throw new Error(`${name} +${after}: ${a.key} stands at ${a.slot.x},${a.slot.y}, off ${room.id}'s floor`);
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThan(20);
	});

	test("at the desk stop, each crew member's task pill crosses no one's face", () => {
		let pills = 0;
		for (const [name, steps] of days()) {
			const plan = new FloorPlan();
			let world: World | undefined;
			for (const { after, snapshot } of steps) {
				const floor = plan.update(snapshot);
				const now = snapshot.at + after;
				world = direct(world, snapshot, now, floor).world;
				const standing = Object.values(world.actors).filter((a) => placed(a, now));
				for (const a of standing) {
					if (a.kind !== "crew" || !a.task || a.mood === "done" || !a.spot.startsWith("crew:")) continue;
					pills++;
					const pill = { x: a.slot.x - PILL_W / 2, y: a.slot.y + AISLE.pill.gap, w: PILL_W, h: AISLE.pill.h };
					for (const b of standing) {
						// Whoever is at a station or in its queue is acting there, off the desk's floor plan
						// (the strip's queue reaches into the first column's aisle).
						if (b === a || /^(station|queue):/.test(b.spot)) continue;
						if (meets(pill, faceZone(b.slot, b.size))) throw new Error(`${name} +${after}: ${a.key}'s pill crosses ${b.key}'s face`);
					}
				}
			}
		}
		expect(pills).toBeGreaterThan(20);
	});
});
