// Themes own their staging (plan-alive wave 3, world/staging.ts): the same floor plan, staged as
// the theme says. The office's is the default and changes nothing; the factory's turns each row of a
// bay into a line with a belt, strings the crew along it, and runs the hallway's conveyor to a dock.
// Every project and title here is invented.
import { describe, expect, test } from "bun:test";
import { direct } from "../src/scene/director/direct";
import { HABIT, habitAt } from "../src/scene/director/habits";
import { FloorPlan } from "../src/scene/world/layout";
import { DEFAULT_STAGING, habitsFor, stagingOf } from "../src/scene/world/staging";
import { FACTORY_STAGING } from "../src/themes/factory/staging";
import { CRATE, crateAt, crateRide } from "../src/scene/world/crate";
import { AISLE, BELT, DESK_TOP, type Desk, OVERLAP, ROW, type Rect, SQUEEZE, type Floor, bodyRect, crewPlaces, crewSpots, endPlaces, faceZone, meets, overlapX } from "../src/scene/world/world";
import { LEAD_SIZE } from "../src/scene/world/placement";
import { demo } from "../src/mainview/demo";
import { HABITS, POSE } from "../src/scene/rig/data/poses";
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
function both(sessions: Session[]): { office: Floor; line: Floor } {
	return { office: new FloorPlan().update(snap(sessions)), line: new FloorPlan().update(snap(sessions), LINE) };
}

/** Every desk's crew spots, from the office's view of the world. */
const spotsOf = (w: Floor) => Object.fromEntries([...w.desks.values()].map((d) => [d.id, crewSpots(w, d)]));

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

	/** True if the cell in front of a desk's (a row nearer the room's front) is open floor. */
	const openInFront = (w: Floor, d: Desk) => {
		const a = w.areas.find((x) => x.id === d.areaId)!;
		return a.cells.some((c) => c.x === d.cell.x && c.y === d.cell.y + ROW) && !a.desks.some((o) => o.cell.x === d.cell.x && o.cell.y === d.cell.y + ROW);
	};
	/** Body boxes overlap by at most `cap` of the smaller one. */
	const share = (p: Rect, q: Rect) =>
		(Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y))) / Math.min(p.w * p.h, q.w * q.h);

	test("the crew stand along the belt facing downstream: three behind it and a pair in front over open floor, else four behind it; none on another", () => {
		// A back-row desk whose front-row neighbour has gone: the floor in front of its belt is open.
		const plan = new FloorPlan();
		const six = Array.from({ length: 6 }, () => session("pebble"));
		const full = plan.update(snap(six), LINE);
		const gone = [...full.desks.values()].find((d) => d.row === 0 && full.desks.size > 0 && [...full.desks.values()].some((o) => o.row === 1 && o.col === d.col))!;
		const opened = plan.update(snap(six.filter((x) => x.id !== gone.id)), LINE);
		let open = 0;
		let closed = 0;
		for (const line of [both(sessions).line, opened]) {
			for (const d of line.desks.values()) {
				const belt = line.areas.find((a) => a.id === d.areaId)!.belts!.find((b) => b.desks.includes(d.id))!;
				const spots = crewSpots(line, d).slice(0, openInFront(line, d) ? 5 : 4);
				const behind = spots.filter((s) => s.y < belt.y);
				const front = spots.filter((s) => s.y > belt.depth);
				for (const s of behind) {
					expect(s.facing).toBe(1);
					expect(s.depth).toBeLessThan(belt.depth);
					expect(s.x).toBeGreaterThan(belt.x);
					expect(s.x).toBeLessThan(belt.x + belt.w);
				}
				if (openInFront(line, d)) {
					open++;
					expect(behind).toHaveLength(3);
					expect(front).toHaveLength(2);
					// The pair in front face each other across their work.
					expect(front.map((s) => s.facing).sort()).toEqual([-1, 1]);
					for (const [i, a] of spots.entries()) for (const b of spots.slice(i + 1)) expect(Math.abs(a.x - b.x) >= OVERLAP.dx || Math.abs(a.y - b.y) >= OVERLAP.dy).toBe(true);
				} else {
					// No open floor in front (the room's front row, or a desk in front): four behind the
					// belt at the aisle's places, inside the desk's cell, as clear of each other as the aisle.
					closed++;
					expect(behind).toHaveLength(4);
					for (const s of spots) {
						expect(s.x).toBeGreaterThan(d.cell.x);
						expect(s.x).toBeLessThan(d.cell.x + d.cell.w);
					}
					for (const [i, a] of spots.entries()) for (const b of spots.slice(i + 1)) expect(overlapX(bodyRect(a, 58), bodyRect(b, 58))).toBeLessThanOrEqual(AISLE.overlap * 61);
				}
			}
		}
		expect(open).toBeGreaterThan(0);
		expect(closed).toBeGreaterThan(0);
	});

	test("one to six crew at every line desk: none bunched on another, no lead's face covered, nobody on a desk or booth they stand behind", () => {
		// The demo days' rooms (the busy day's lanternfish has Ship release 2.4 with five out), every
		// desk with the same crew at once, so neighbours' crews meet too.
		for (const name of [null, "release", "thirty", "crowd"] as const) {
			const line = new FloorPlan().update(demo(name).snapshot, LINE);
			for (const a of line.areas) {
				if (a.kind !== "project") continue;
				for (let n = 1; n <= 6; n++) {
					// A desk whose crew outgrow its line and its ends squeezes its row (world.ts SQUEEZE),
					// which may reach into a neighbour's cell: its own crew still keep the cap.
					const squeezed = (d: Desk) => {
						const known = [...crewSpots(line, d), ...endPlaces(line, d)];
						return crewPlaces(line, d, n).some((p) => !known.some((k) => k.x === p.x && k.y === p.y));
					};
					const crew = a.desks.flatMap((d) => crewPlaces(line, d, n).map((p) => ({ d, p, body: bodyRect(p, 58), squeezed: squeezed(d) })));
					for (const [i, c] of crew.entries()) {
						const where = `${name ?? "busy"} ${a.id} n=${n}: ${c.d.id} at ${c.p.x},${c.p.y}`;
						for (const o of crew.slice(i + 1)) {
							if (o.d !== c.d && (c.squeezed || o.squeezed)) continue;
							const s = share(c.body, o.body);
							if (s > SQUEEZE.overlap) throw new Error(`${where} overlaps ${o.d.id} at ${o.p.x},${o.p.y} by ${(s * 100).toFixed(0)}%`);
						}
						for (const lead of a.desks) if (meets(c.body, faceZone(lead.lead, LEAD_SIZE))) throw new Error(`${where} covers ${lead.id}'s face`);
						// Any desk and booth the crew member stands behind, its own included (from the
						// roof to the desk front): no face behind them, and no feet below the roof
						// (factory.ts booth: x -90..45, its roof -128..-120).
						for (const o of a.desks) {
							if (c.p.y >= o.at.y + DESK_TOP) continue;
							const desk = { x: o.at.x - 90, y: o.at.y - 128, w: 180, h: 130 };
							if (meets(faceZone(c.p, 58), desk) || (c.p.x > desk.x && c.p.x < desk.x + desk.w && c.p.y > o.at.y - 120 && c.p.y < o.at.y + 2))
								throw new Error(`${where} stands on ${o.id}'s desk or booth`);
						}
					}
				}
			}
		}
	});

	test("every spot a line desk is lent, past its own, keeps off any booth roof in front of it", () => {
		let behind = 0;
		for (const name of [null, "release", "thirty", "crowd"] as const) {
			const line = new FloorPlan().update(demo(name).snapshot, LINE);
			for (const d of line.desks.values()) {
				const a = line.areas.find((x) => x.id === d.areaId)!;
				for (const p of crewSpots(line, d)) {
					for (const o of a.desks) {
						if (p.y >= o.at.y + DESK_TOP || Math.abs(p.x - o.at.x) > 90) continue;
						behind++;
						// The booth's roof is -128..-120 from the desk front's centre (factory.ts booth).
						expect(p.y, `${name ?? "busy"}: ${d.id}'s spot at ${p.x},${p.y} behind ${o.id}`).toBeLessThanOrEqual(o.at.y - 120);
						expect(meets(faceZone(p, 58), { x: o.at.x - 90, y: o.at.y - 128, w: 180, h: 130 })).toBe(false);
					}
				}
			}
		}
		expect(behind).toBeGreaterThan(0);
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
		const room = (w: Floor) => w.areas.find((a) => a.id === "room:pebble")!;
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
