// Themes own their staging (plan-alive wave 3, office/staging.ts): the same floor plan, staged as
// the theme says. The office's is the default and changes nothing; the factory's turns each row of a
// bay into a line with a belt, strings the crew along it, and runs the hallway's conveyor to a dock.
// Every project and title here is invented.
import { describe, expect, test } from "bun:test";
import { direct } from "../src/scene/director/direct";
import { HABIT, habitAt } from "../src/scene/director/habits";
import { FloorPlan } from "../src/scene/office/layout";
import { DEFAULT_STAGING, habitsFor, stagingOf } from "../src/scene/office/staging";
import { FACTORY_STAGING } from "../src/scene/theme/factory-staging";
import { CRATE, crateAt, crateRide } from "../src/scene/office/crate";
import { BELT, OVERLAP, type World, crewSpots } from "../src/scene/office/world";
import { HABITS, POSE } from "../src/scene/rig/poses";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

let n = 0;
const session = (project: string, extra: Partial<Session> = {}): Session => ({
	id: `s-${++n}`,
	pid: n,
	title: `Task ${n}`,
	cwd: `/work/${project}`,
	project,
	origin: "cli",
	state: "busy",
	stateSince: 0,
	startedAt: n,
	agents: [],
	children: [],
	...extra,
});
const snap = (sessions: Session[]): Snapshot => ({ at: 0, sessions });

const LINE = { bay: "line", hall: "conveyor", ambient: [], habits: ["drumSit", "palletCards", "vendingKick"] } as const;

/** The same sessions in two plans, one per staging. */
function both(sessions: Session[]): { office: World; line: World } {
	return { office: new FloorPlan().update(snap(sessions)), line: new FloorPlan().update(snap(sessions), LINE) };
}

/** Every desk's crew spots, from the office's view of the world. */
const spotsOf = (w: World) => Object.fromEntries([...w.desks.values()].map((d) => [d.id, crewSpots(w, d)]));

describe("the staging grammar", () => {
	const sessions = [...Array.from({ length: 5 }, () => session("lanternfish")), session("orbit-kit"), session("orbit-kit")];

	test("a theme without a staging gets the office's: desks, a corridor, the rig's habits, nothing ambient", () => {
		expect(stagingOf(undefined)).toBe(DEFAULT_STAGING);
		expect(stagingOf({})).toEqual({ bay: "desks", hall: "corridor", ambient: [] });
		const w = new FloorPlan().update(snap(sessions));
		expect(w.staging).toEqual({ bay: "desks", hall: "corridor" });
		expect(w.conveyor).toBeUndefined();
		for (const a of w.areas) expect(a.belts).toBeUndefined();
	});

	test("staging never moves a room, a desk, a lead or a station: only the crew's spots and what the floor adds", () => {
		const { office, line } = both(sessions);
		expect(line.bounds).toEqual(office.bounds);
		expect(line.areas.map((a) => [a.id, a.rect, a.cells, a.stations, a.fixtures, a.wall])).toEqual(office.areas.map((a) => [a.id, a.rect, a.cells, a.stations, a.fixtures, a.wall]));
		expect([...line.desks.values()]).toEqual([...office.desks.values()]);
		expect(spotsOf(line)).not.toEqual(spotsOf(office));
	});

	test("a line bay has a belt across each row with a desk on it, in front of the desks, its row's cells end to end", () => {
		const { line } = both(sessions);
		for (const a of line.areas) {
			if (a.kind !== "project") {
				expect(a.belts).toBeUndefined();
				continue;
			}
			const rows = new Set(a.desks.map((d) => d.row));
			expect(a.belts!.map((b) => b.row).sort()).toEqual([...rows].sort());
			for (const b of a.belts!) {
				const cells = a.cells.slice(b.row * a.cols, (b.row + 1) * a.cols);
				expect(b.x).toBe(cells[0]!.x + BELT.inset);
				expect(b.x + b.w).toBe(cells.at(-1)!.x + cells.at(-1)!.w - BELT.inset);
				expect(b.id).toBe(`${a.id}:belt:${b.row}`);
				expect(b.desks).toEqual(a.desks.filter((d) => d.row === b.row).sort((p, q) => p.col - q.col).map((d) => d.id));
				for (const id of b.desks) {
					const d = line.desks.get(id)!;
					// In front of the desk (and its lead), inside its cell; its front draws over the crew behind it.
					expect(b.y).toBeGreaterThan(d.at.y);
					expect(b.y).toBeLessThan(d.cell.y + d.cell.h);
					expect(b.depth).toBeGreaterThan(b.y);
				}
			}
		}
	});

	test("the crew stand along the belt: three behind it facing downstream, a pair in front, none on another", () => {
		const { line } = both(sessions);
		for (const d of line.desks.values()) {
			const belt = line.areas.find((a) => a.id === d.areaId)!.belts!.find((b) => b.desks.includes(d.id))!;
			const spots = crewSpots(line, d).slice(0, 5);
			const behind = spots.filter((s) => s.y < belt.y);
			const front = spots.filter((s) => s.y > belt.depth);
			expect(behind).toHaveLength(3);
			expect(front).toHaveLength(2);
			for (const s of behind) {
				expect(s.facing).toBe(1);
				expect(s.depth).toBeLessThan(belt.depth);
				expect(s.x).toBeGreaterThan(belt.x);
				expect(s.x).toBeLessThan(belt.x + belt.w);
			}
			// The pair in front face each other across their work.
			expect(front.map((s) => s.facing).sort()).toEqual([-1, 1]);
			for (const [i, a] of spots.entries()) for (const b of spots.slice(i + 1)) expect(Math.abs(a.x - b.x) >= OVERLAP.dx || Math.abs(a.y - b.y) >= OVERLAP.dy).toBe(true);
		}
	});

	test("a conveyor hall runs the hallway's length to the dock at its right end", () => {
		const { line } = both(sessions);
		const c = line.conveyor!;
		expect(c.x0).toBe(line.hallway.x);
		expect(c.x1).toBe(line.hallway.x + line.hallway.w);
		expect(c.y).toBe(line.hallway.y + line.hallway.h / 2);
		expect(c.dock.x).toBeLessThan(c.x1);
		expect(c.dock.x).toBeGreaterThan(c.x1 - 60);
	});

	test("belts follow their rows: a new row's line appears, an emptied one goes, the rest stay put", () => {
		const plan = new FloorPlan();
		const list = Array.from({ length: 2 }, () => session("pebble"));
		const one = plan.update(snap(list), LINE);
		const room = (w: World) => w.areas.find((a) => a.id === "room:pebble")!;
		expect(room(one).belts!.map((b) => b.row)).toEqual([0]);
		const more = [...list, session("pebble"), session("pebble")];
		const two = plan.update(snap(more), LINE);
		expect(room(two).belts!.map((b) => b.row)).toEqual([0, 1]);
		expect(room(two).belts![0]).toMatchObject({ x: room(one).belts![0]!.x, y: room(one).belts![0]!.y, w: room(one).belts![0]!.w });
		const back = plan.update(snap(list), LINE);
		expect(room(back).belts!.map((b) => b.row)).toEqual([0]);
	});
});

describe("the theme's idle habits", () => {
	const T0 = 1_700_000_000_000;
	const set: readonly string[] = LINE.habits;

	test("a theme's habits exist as poses, played by name, never by the idle trigger: the office keeps its seven", () => {
		for (const name of set) {
			expect(POSE[name]).toBeDefined();
			expect(POSE[name]!.play).toBe("once");
			expect(POSE[name]!.habit).toBeUndefined();
		}
		expect(HABITS.map((h) => h.name)).not.toContain("drumSit");
	});

	test("the rotation draws only from the theme's set, the same way each time; none is the rig's seven", () => {
		const rig = new Set(HABITS.map((h) => h.name));
		const seen = new Set<string>();
		for (let i = 0; i < 40; i++) {
			for (const life of [true, false]) {
				const h = habitAt(`s:${i}`, T0, T0 + 7 * HABIT.gridMs, life, set);
				expect(set).toContain(h.pose);
				expect(habitAt(`s:${i}`, T0, T0 + 7 * HABIT.gridMs, life, set)).toEqual(h);
				seen.add(h.pose);
			}
			expect(rig.has(habitAt(`s:${i}`, T0, T0, true).pose)).toBe(true);
			expect(habitAt(`s:${i}`, T0, T0, true, [])).toEqual(habitAt(`s:${i}`, T0, T0, true));
		}
		expect(seen.size).toBe(set.length);
	});

	test("the timing is the theme's habits' too: the same grid and wakes as the rig's", () => {
		for (let i = 0; i < 20; i++) {
			const a = habitAt(`s:${i}`, T0, T0 + 90_000, true, set);
			const b = habitAt(`s:${i}`, T0, T0 + 90_000, true);
			expect(a.wake).toBe(b.wake);
			expect(a.since).toBe(b.since);
		}
	});
});

describe("the foreman's booth habits", () => {
	const lead = FACTORY_STAGING.leadHabits!;

	test("a line's lead plays the booth's habits; its crew, and any lead off a line, the theme's", () => {
		expect(habitsFor(FACTORY_STAGING, true)).toEqual(lead);
		expect(habitsFor(FACTORY_STAGING, false)).toEqual(FACTORY_STAGING.habits!);
		expect(habitsFor({ ...FACTORY_STAGING, bay: "desks" }, true)).toEqual(FACTORY_STAGING.habits!);
		expect(habitsFor({ bay: "line", hall: "conveyor", habits: ["drumSit"] }, true)).toEqual(["drumSit"]);
		expect(habitsFor(undefined, true)).toBeUndefined();
	});

	test("they read over the bench: nothing sat on or laid out on the floor, hands up at the head, never by the idle trigger", () => {
		const high = new Set(["face", "head", "ear", "sip", "up", "cheer", "hi", "wave1", "wave2"]);
		for (const name of lead) {
			const p = POSE[name]!;
			expect(p).toBeDefined();
			expect(p.frames.some((f) => high.has(f.armL) || high.has(f.armR)), name).toBe(true);
			for (const f of p.frames) {
				expect(f.props.back).toBeUndefined();
				expect(f.props.front).toBeUndefined();
				expect(f.props.work).toBeUndefined();
				expect(["rest", "tip"]).toContain(f.feet);
				expect(f.body).not.toBe("nap");
			}
			if (!HABITS.some((h) => h.name === name)) expect(p.habit).toBeUndefined();
		}
	});

	test("the director gives an idle foreman, up in its booth, only the booth's habits", () => {
		const T = 5_000_000;
		const seen = new Set<string>();
		for (let i = 0; i < 12; i++) {
			const s = snap([session(`kettle-${i}`, { state: "idle", stateSince: 0 })]);
			const floor = new FloorPlan().update(s, FACTORY_STAGING);
			const d = direct(undefined, s, T + i * 61_000, floor, { life: true });
			for (const a of Object.values(d.world.actors)) if (a.spot === "desk") seen.add(a.pose);
		}
		expect(seen.size).toBeGreaterThan(1);
		for (const p of seen) expect(lead).toContain(p);
	});
});

describe("a change of stage", () => {
	test("switched live, the cast takes the new stage's spots at once instead of walking over", () => {
		const agent = (id: string, status: Agent["status"]): Agent => ({ id, role: "scout", task: "Invented", depth: 1, status, lastWriteAt: 0, children: [] });
		const crew = session("teapot", { state: "idle", agents: [agent("a1", "finished"), agent("a2", "running"), agent("a3", "running"), agent("a4", "running")] });
		const s = snap([crew]);
		const T = 1_000_000;
		const office = direct(undefined, s, T, new FloorPlan().update(s));
		expect(office.world.stage).toBe("desks/corridor");
		const line = new FloorPlan().update(s, LINE);
		const switched = direct(office.world, s, T + 5_000, line);
		const crewKeys = Object.keys(switched.world.actors).filter((k) => k.startsWith("a:"));
		// The stage really moved them, and nobody walks for it.
		expect(crewKeys.some((k) => switched.world.actors[k]!.slot.x !== office.world.actors[k]!.slot.x || switched.world.actors[k]!.slot.y !== office.world.actors[k]!.slot.y)).toBe(true);
		expect(switched.events.filter((e) => e.type === "walk")).toEqual([]);
		for (const k of crewKeys) expect(switched.world.actors[k]!.walk).toBeUndefined();
		expect(switched.world.stage).toBe("line/conveyor");
		// On the same stage, a spot that moves is still walked to.
		expect(direct(switched.world, s, T + 10_000, line).world.stage).toBe("line/conveyor");
	});
});


describe("a PR crate's ride", () => {
	const from = { x: 380, y: -330 };
	const ride = crateRide(from, 40, 2400, 1600);

	test("it is the arm's crate until the arm lets go, then shows just where it was set down, at the arm's size", () => {
		expect(crateAt(ride, 1599).visible).toBe(false);
		expect(crateAt(ride, 1600)).toMatchObject({ x: from.x, y: from.y, scale: CRATE.armScale, visible: true, alpha: 1 });
		expect(crateAt(ride, 1600 + CRATE.hold - 1)).toMatchObject({ x: from.x, y: from.y, alpha: 1 });
	});

	test("it drops down the dock's chute, pops up on the belt in line with the dock, then rides the belt to the hallway's dock", () => {
		const gone = crateAt(ride, 1600 + CRATE.hold + CRATE.drop);
		expect(gone.alpha).toBe(0);
		expect(gone.x).toBe(from.x);
		const up = crateAt(ride, 1600 + CRATE.hold + CRATE.drop + CRATE.pop);
		expect(up).toMatchObject({ x: from.x, y: 40, scale: 1, alpha: 1 });
		let was = up;
		for (let t = 1600 + CRATE.hold + CRATE.drop + CRATE.pop; t <= ride.delay + ride.ms; t += 50) {
			const at = crateAt(ride, t);
			expect(at.y).toBe(40);
			expect(at.x).toBeGreaterThanOrEqual(was.x);
			was = at;
		}
		const end = crateAt(ride, ride.delay + ride.ms);
		expect(end.x).toBe(2400);
		expect(end.alpha).toBe(0);
	});

	test("without the arm's word it pops up on the belt after the fallback delay, at full size", () => {
		const bare = crateRide({ x: 700, y: 40 }, 40, 2400);
		expect(bare.delay).toBe(CRATE.delay);
		expect(bare.chute).toBe(false);
		expect(crateAt(bare, CRATE.delay - 1).visible).toBe(false);
		expect(crateAt(bare, CRATE.delay + CRATE.pop)).toMatchObject({ x: 700, y: 40, scale: 1, alpha: 1 });
	});
});
