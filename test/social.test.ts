// The social layer (plan-alive stream A): gaze turned into rig units, the red test's ripple, the
// foreman's round both ways, waiting leads looking at the YOU door, hand-off anticipation, staging,
// and the cast noticing you when you come back. Every session and number is invented.
import { describe, expect, test } from "bun:test";
import { RULES, cueFor, direct } from "../src/scene/director/direct";
import { HANDOFF } from "../src/scene/director/handoff";
import { HANDOFF_LOOK, NOTICE, RIPPLE, type View, freshReturn, pairUp, rippleDelay, waverOf, youDoor } from "../src/scene/director/social";
import { TRIP } from "../src/scene/director/trips";
import type { World } from "../src/scene/director/types";
import { FloorPlan } from "../src/scene/office/layout";
import { CROWD, OVERLAP, crewSpot, crewSpots, crowdSlot, faceFront, restagger } from "../src/scene/office/world";
import { AT_VIEWER, GAZE, aimAt } from "../src/scene/rig/gaze";
import { POSE, duration } from "../src/scene/rig/poses";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

const T0 = Date.UTC(2026, 10, 19, 14, 0);
const SEC = 1000;
const MIN = 60 * SEC;

const builder = (id: string, tool = "Edit", at = T0 - SEC, extra: Partial<Agent> = {}): Agent => ({
	id,
	role: "general-purpose",
	task: `invented task ${id}`,
	depth: 1,
	status: "running",
	lastWriteAt: at,
	activity: { tool, at },
	children: [],
	...extra,
});

const release = (agents: Agent[], extra: Partial<Session> = {}): Session => ({
	id: "rel",
	pid: 1,
	title: "Ship the invented release",
	cwd: "/Users/you/code/teapot",
	project: "teapot",
	origin: "cli",
	state: "busy",
	stateSince: T0 - 10 * MIN,
	startedAt: T0 - 60 * MIN,
	activity: { tool: "Task", at: T0 - 2 * MIN },
	running: { tool: "Task", since: T0 - 2 * MIN },
	agents,
	children: [],
	...extra,
});

const idle = (id: string, extra: Partial<Session> = {}): Session => ({
	...release([], { id, title: `Invented ${id}`, state: "idle", startedAt: T0 - 60 * MIN + id.length, activity: { tool: "Read", at: T0 - 5 * MIN }, running: undefined }),
	...extra,
});

function stage() {
	const plan = new FloorPlan();
	let world: World | undefined;
	return {
		step(sessions: Session[], now: number, view?: View) {
			const snap: Snapshot = { at: now, sessions };
			const floor = plan.update(snap);
			const d = direct(world, snap, now, floor, view);
			world = d.world;
			return { ...d, floor };
		},
	};
}
const six = (tools: string[]) => tools.map((t, i) => builder(`b${i}`, t));

describe("gaze in rig units", () => {
	test("a target to the side is a full side look with side eyes; behind is over the shoulder", () => {
		const me = { x: 100, y: 100 };
		const right = aimAt(me, 1, { x: 300, y: 100 });
		expect(right).toEqual({ x: GAZE.x, y: 0, side: true });
		// Facing left, the same target is behind: the look goes the other way.
		expect(aimAt(me, -1, { x: 300, y: 100 })).toEqual({ x: -GAZE.x, y: 0, side: true });
	});

	test("clamped to the face's range; height on screen counts for half; near targets look less", () => {
		const me = { x: 0, y: 0 };
		const up = aimAt(me, 1, { x: 0, y: -400 });
		expect(up.y).toBe(-GAZE.up);
		expect(up.side).toBe(false);
		const down = aimAt(me, 1, { x: 0, y: 400 });
		expect(down.y).toBe(GAZE.down);
		// 45 degrees on screen is a shallower look: the floor is seen at an angle.
		const diag = aimAt(me, 1, { x: 100, y: 100 });
		expect(Math.abs(diag.x)).toBeGreaterThan(Math.abs(diag.y));
		// Past 70% of the side range the eyes go side; under it they don't.
		expect(aimAt(me, 1, { x: 100, y: -130 }).side).toBe(true);
		expect(aimAt(me, 1, { x: 60, y: -200 }).side).toBe(false);
		const near = aimAt(me, 1, { x: 6, y: 0 });
		expect(near.x).toBeLessThan(GAZE.x / 2);
		expect(aimAt(me, 1, me)).toEqual({ x: 0, y: 0, side: false });
		expect(AT_VIEWER.side).toBe(false);
	});
});

describe("the ripple", () => {
	test("the nearest looks first; 180 ms more per 60 px further; capped", () => {
		expect(rippleDelay(50, 50)).toBe(0);
		expect(rippleDelay(110, 50)).toBe(RIPPLE.msPer60px);
		expect(rippleDelay(170, 50)).toBe(2 * RIPPLE.msPer60px);
		expect(rippleDelay(99_999, 0)).toBe(RIPPLE.maxMs);
	});

	test("a red test: every teammate looks at the failer, in order of distance", () => {
		const s = stage();
		const crew = six(["Edit", "Edit", "Edit", "Read", "Read", "Read"]);
		s.step([release(crew)], T0);
		const red = structuredClone(crew);
		red[0]!.commands = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at: T0 + SEC } };
		const d = s.step([release(red)], T0 + SEC);
		const fail = d.world.actors["a:rel:b0"]!.slot;
		const mates = [1, 2, 3, 4, 5].map((i) => d.world.actors[`a:rel:b${i}`]!);
		const at = (a: (typeof mates)[number]) => (a.pose === "glance" ? T0 + SEC : a.pending!.at);
		const dist = (a: (typeof mates)[number]) => Math.hypot(a.slot.x - fail.x, a.slot.y - fail.y);
		const byDist = [...mates].sort((a, b) => dist(a) - dist(b));
		for (let i = 1; i < byDist.length; i++) expect(at(byDist[i]!)).toBeGreaterThanOrEqual(at(byDist[i - 1]!));
		expect(at(byDist[0]!)).toBe(T0 + SEC);
		expect(d.world.actors[byDist[0]!.key]!.lookAt).toBe("a:rel:b0");
		// Each one's booked glance plays at its time, looking at the failer, and the wake is booked.
		const second = byDist.find((a) => a.pending)!;
		expect(d.wake).toBeLessThanOrEqual(second.pending!.at);
		const later = s.step([release(red)], second.pending!.at);
		expect(later.world.actors[second.key]).toMatchObject({ pose: "glance", lookAt: "a:rel:b0", poseSince: second.pending!.at });
		expect(cueFor(later.world.actors[second.key]!, second.pending!.at).lookAt).toBe("a:rel:b0");
	});
});

describe("the foreman's round, both ways", () => {
	test("the lead looks at the one it visits; when it gets there, that one looks up at it", () => {
		const crew = six(["Edit", "Read", "Grep", "Edit", "Write", "Read"]);
		const s = stage();
		let go: ReturnType<typeof s.step> | undefined;
		for (let t = T0; t < T0 + 2 * RULES.foremanEveryMs && !go; t += SEC) {
			const d = s.step([release(crew)], t);
			const lead = d.world.actors["s:rel"]!;
			if (lead.spot.startsWith("visit:") && lead.walk?.since === t) go = d;
		}
		expect(go).toBeDefined();
		const lead = go!.world.actors["s:rel"]!;
		const key = lead.spot.slice("visit:".length);
		// While it walks, no aim; there, it looks at the crew member and the crew member looks up.
		expect(lead.lookAt).toBeUndefined();
		const arrive = lead.walk!.since + lead.walk!.ms;
		expect(go!.wake).toBeLessThanOrEqual(arrive);
		const there = s.step([release(crew)], arrive);
		expect(there.world.actors["s:rel"]!.lookAt).toBe(key);
		expect(there.world.actors[key]).toMatchObject({ pose: "glance", reactTo: "s:rel", lookAt: "s:rel", poseSince: arrive });
		// Once: the glance plays through, then it is back to work.
		const after = s.step([release(crew)], arrive + duration(POSE.glance!.frames) + 10);
		expect(after.world.actors[key]!.pose).not.toBe("glance");
		if (after.world.actors["s:rel"]!.spot === lead.spot) expect(after.world.actors["s:rel"]!.lookAt).toBe(key);
	});
});

describe("waiting on you", () => {
	test("a waiting lead looks at the YOU door, in the queue and from its desk", () => {
		const s = stage();
		const wait = (id: string, since: number) => idle(id, { waiting: { reason: "permission", since, source: "hook" } });
		s.step([idle("a"), idle("bb")], T0);
		const d = s.step([wait("a", T0 + 500), idle("bb")], T0 + SEC);
		const door = youDoor(d.floor)!;
		expect(door).toBeDefined();
		const a = d.world.actors["s:a"]!;
		// Walking to the line: no aim yet. In line, the door.
		expect(a.lookAt).toBeUndefined();
		// At the counter it rings the bell first (looking at the bell), then waits watching the door.
		const arrive = a.walk!.since + a.walk!.ms;
		const ring = s.step([wait("a", T0 + 500), idle("bb")], arrive);
		expect(ring.world.actors["s:a"]!.pose).toBe("bellRing");
		expect(ring.world.actors["s:a"]!.lookAt).toBeUndefined();
		const there = s.step([wait("a", T0 + 500), idle("bb")], arrive + duration(POSE.bellRing!.frames) + 10);
		expect(there.world.actors["s:a"]!.lookAt).toEqual(door);
		expect(cueFor(there.world.actors["s:a"]!, arrive + 5 * SEC).lookAt).toEqual(door);
		expect(there.world.actors["s:bb"]!.lookAt).toBeUndefined();
	});
});

describe("hand-off anticipation", () => {
	test("the taker looks up 1.5 s before the giver gets there and raises a hand before contact", () => {
		const s = stage();
		const crew = (t: number) => [
			builder("b0", t < T0 + 20 * SEC ? "Read" : "Edit", t < T0 + 20 * SEC ? T0 : T0 + 20 * SEC),
			builder("b1", t < T0 + 20 * SEC ? "Edit" : "Read", t < T0 + 20 * SEC ? T0 : T0 + 20 * SEC),
		];
		for (const t of [T0, T0 + TRIP.holdMs, T0 + 12 * SEC]) s.step([release(crew(t))], t);
		const d = s.step([release(crew(T0 + 20 * SEC))], T0 + 20 * SEC);
		const h = d.world.handoffs!["a:rel:b0"]!;
		expect(h).toBeDefined();
		const look = h.meets - HANDOFF_LOOK.lookMs;
		// A short walk: it looks up as soon as the giver sets off.
		expect(d.world.actors["a:rel:b1"]!.lookAt).toBe(T0 + 20 * SEC >= look ? "a:rel:b0" : undefined);
		const ready = h.meets - HANDOFF_LOOK.readyMs;
		const now = T0 + 20 * SEC;
		expect(d.wake).toBeLessThanOrEqual(Math.min(...[look, ready, h.meets].filter((t) => t > now)));
		if (look > now) {
			const up = s.step([release(crew(look))], look);
			expect(up.world.actors["a:rel:b1"]!.lookAt).toBe("a:rel:b0");
			expect(up.world.actors["a:rel:b1"]!.pose).not.toBe(HANDOFF_LOOK.pose);
		}
		// (A walk shorter than the raise finds the hand already up.)
		const hand = ready > now ? s.step([release(crew(ready))], ready) : d;
		expect(hand.world.actors["a:rel:b1"]).toMatchObject({ pose: HANDOFF_LOOK.pose, poseSince: ready, lookAt: "a:rel:b0" });
		// The raised hand holds until contact, then the two-hander as before.
		expect(duration(POSE[HANDOFF_LOOK.pose]!.frames)).toBeLessThanOrEqual(HANDOFF_LOOK.readyMs);
		const meet = s.step([release(crew(h.meets))], h.meets);
		expect(meet.world.actors["a:rel:b1"]).toMatchObject({ pose: HANDOFF.pose, as: "partner", lookAt: "a:rel:b0" });
		expect(meet.world.actors["a:rel:b0"]!.lookAt).toBe("a:rel:b1");
	});
});

describe("staging", () => {
	const desk = () => {
		const floor = new FloorPlan().update({ at: T0, sessions: [release(six(["Edit", "Edit", "Edit", "Edit", "Edit", "Edit"]))] });
		return { floor, desk: floor.desks.get("rel")! };
	};

	test("the crowd: a loose arc facing the lead, in the desk's cell, nobody square behind anyone", () => {
		const { floor, desk: d } = desk();
		const spots = crewSpots(floor, d);
		// One full arc (three rows); past that a very big crew still crowds.
		const all = Array.from({ length: spots.length + CROWD.perRow * CROWD.rows }, (_, i) => crewSpot(spots, d, i));
		const crowd = all.slice(spots.length);
		for (const p of crowd) {
			expect(Math.abs(p.x - d.at.x)).toBeLessThanOrEqual(CROWD.reach);
			expect(p.y).toBeLessThanOrEqual(d.cell.y + d.cell.h);
			expect(p.facing).toBe(p.x < d.lead.x ? 1 : -1);
		}
		for (let i = spots.length; i < all.length; i++)
			for (let j = 0; j < i; j++) expect(Math.abs(all[i]!.x - all[j]!.x) < OVERLAP.dx && Math.abs(all[i]!.y - all[j]!.y) < OVERLAP.dy).toBe(false);
		// The outer ones stand further back: it bends round the desk.
		expect(crowdSlot(d, 0).y).toBeLessThan(crowdSlot(d, 2).y);
		// A spot's place depends only on the spots before it: crew:i means the same place however big the crew.
		expect(crewSpot(spots, d, spots.length + 3)).toEqual(all[spots.length + 3]!);
	});

	test("restagger steps a spot off one it would stand on; the rear of a close pair faces the front one", () => {
		const { desk: d } = desk();
		const front = { x: d.at.x, y: d.at.y + 60, depth: d.at.y + 60, facing: 1 as const };
		const moved = restagger({ ...front, y: front.y - 5, depth: front.y - 5 }, [front], d);
		expect(Math.abs(moved.x - front.x) >= OVERLAP.dx || Math.abs(moved.y - front.y) >= OVERLAP.dy).toBe(true);
		const rear = { x: d.at.x + 20, y: d.at.y + 46, depth: d.at.y + 46, facing: 1 as const };
		const [r, f] = faceFront([
			{ slot: rear, turn: true },
			{ slot: front, turn: true },
		]);
		expect(r!.facing).toBe(-1);
		expect(f).toBe(front);
		// Spaced spots keep their facing.
		expect(faceFront([{ slot: rear, turn: false }, { slot: front, turn: true }])[0]).toBe(rear);
	});

	test("finished crew in the kitchen's coffee line pair up facing each other", () => {
		const { floor } = desk();
		const kitchen = floor.areas.find((a) => a.kind === "kitchen")!;
		const line = kitchen.spots.queue!;
		const places = new Map(
			[0, 1, 2].map((i) => [`k${i}`, { spot: `${kitchen.id}:queue:${i}`, area: kitchen.id, slot: line[i]! }] as const),
		);
		pairUp(places, kitchen);
		expect(places.get("k0")!.slot.facing).toBe(1);
		expect(places.get("k1")!.slot.facing).toBe(-1);
		// Without a partner, it keeps facing the counter.
		expect(places.get("k2")!.slot.facing).toBe(line[2]!.facing);
		expect(places.get("k0")!.spot).toBe(`${kitchen.id}:queue:0`);
	});

	test("the director pairs them up too, without walking anyone", () => {
		const s = stage();
		const crew = six(["Edit", "Edit", "Edit", "Edit", "Edit", "Edit"]);
		s.step([release(crew)], T0);
		const done = crew.map((a, i) => (i < 2 ? { ...a, status: "finished" as const } : a));
		const d = s.step([release(done)], T0 + SEC);
		const out = [0, 1].map((i) => d.world.actors[`a:rel:b${i}`]!);
		expect(out.map((a) => a.spot.replace(/^.*:queue:/, "q"))).toEqual(["q0", "q1"]);
		expect(out.map((a) => a.slot.facing)).toEqual([1, -1]);
	});
});

describe("they notice you", () => {
	const wait = (id: string, since: number) => idle(id, { waiting: { reason: "permission", since, source: "hook" } });
	const office = () => [idle("a"), idle("bb"), idle("ccc"), wait("dddd", T0 - 5 * MIN), release(six(["Edit", "Edit"]))];

	test("back on screen: idle characters look up at you, one waves, the waiting lead holds its ticket up", () => {
		const s = stage();
		s.step(office(), T0);
		const settled = s.step(office(), T0 + MIN);
		expect(settled.world.actors["s:a"]!.lookAt).toBeUndefined();
		const back = T0 + 2 * MIN;
		const d = s.step(office(), back, { back });
		const idleKeys = ["s:a", "s:bb", "s:ccc"];
		const waver = waverOf(idleKeys, back)!;
		expect(idleKeys).toContain(waver);
		// Each looks up now or a beat later (one of three slots); the waver on the second.
		for (const k of idleKeys) {
			const a = d.world.actors[k]!;
			const pose = k === waver ? NOTICE.wave : NOTICE.look;
			expect(a.noticed).toBe(back);
			if (a.pose === pose) expect(a.lookAt).toEqual({ viewer: true });
			else expect(a.pending?.pose).toBe(pose);
		}
		expect(d.world.actors[waver]!.pending!.at).toBe(back + NOTICE.slotMs);
		// The busy crew don't stop work, and the waiting lead raises its ticket.
		expect(d.world.actors["a:rel:b0"]!.pose).not.toBe(NOTICE.look);
		expect(d.world.actors["s:dddd"]).toMatchObject({ pose: NOTICE.ticket, lookAt: { viewer: true }, noticed: back });
		// A beat later everyone is looking; then it plays out and the office goes back to normal.
		const all = s.step(office(), back + NOTICE.slotMs * NOTICE.slots, { back });
		for (const k of idleKeys) expect(all.world.actors[k]!.pose).toBe(k === waver ? NOTICE.wave : NOTICE.look);
		const over = Math.max(...[NOTICE.look, NOTICE.wave, NOTICE.ticket].map((p) => duration(POSE[p]!.frames)));
		const later = s.step(office(), back + NOTICE.slotMs * NOTICE.slots + over + 10, { back });
		for (const k of [...idleKeys, "s:dddd"]) {
			expect([NOTICE.look, NOTICE.wave, NOTICE.ticket]).not.toContain(later.world.actors[k]!.pose);
			expect(later.world.actors[k]!.lookAt).not.toEqual({ viewer: true });
		}
	});

	test("one return is one look; stale or missing returns do nothing", () => {
		expect(freshReturn(undefined, T0)).toBeUndefined();
		expect(freshReturn({ back: T0 }, T0 + NOTICE.freshMs)).toBeUndefined();
		expect(freshReturn({ back: T0 }, T0 + 10)).toBe(T0);
		const s = stage();
		s.step(office(), T0);
		const back = T0 + MIN;
		s.step(office(), back, { back });
		for (let k = 1; k < NOTICE.slots; k++) s.step(office(), back + k * NOTICE.slotMs, { back });
		const again = s.step(office(), back + 900, { back });
		for (const k of ["s:a", "s:bb", "s:ccc"]) {
			const a = again.world.actors[k]!;
			// Still the same notice, not a second one started over.
			expect(a.poseSince).toBeLessThanOrEqual(back + NOTICE.slotMs * (NOTICE.slots - 1));
		}
		// The first look at the office isn't a return.
		const fresh = stage().step(office(), T0, { back: T0 });
		expect(fresh.world.actors["s:a"]!.pose).not.toBe(NOTICE.look);
	});
});
