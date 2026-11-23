// Themes own their staging (plan-alive wave 3, office/staging.ts): the same floor plan, staged as
// the theme says. The office's is the default and changes nothing; the factory's turns each row of a
// bay into a line with a belt, strings the crew along it, and runs the hallway's conveyor to a dock.
// Every project and title here is invented.
import { describe, expect, test } from "bun:test";
import { HABIT, habitAt } from "../src/scene/director/habits";
import { FloorPlan } from "../src/scene/office/layout";
import { DEFAULT_STAGING, stagingOf } from "../src/scene/office/staging";
import { BELT, OVERLAP, type World, crewSpots } from "../src/scene/office/world";
import { HABITS, POSE } from "../src/scene/rig/poses";
import type { Session, Snapshot } from "../src/watcher/model";

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
