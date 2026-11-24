// The office floor plan: stable under change, and sane from 1 to 30 sessions. Every project and
// title here is invented.
import { describe, expect, test } from "bun:test";
import { FloorPlan } from "../src/scene/world/layout";
import { demo } from "../src/mainview/demo";
import { LEAD_SIZE } from "../src/scene/world/placement";
import { KITCHEN_WALL, MONITOR, ceilingPanels, deskParts } from "../src/scene/world/propspots";
import { BUILD, DESK_TOP, SEAT, STATIONS_BASE, STATION_CREW, STRIP, type Rect, type Floor, bodyRect, crewPlaces, crewSlot, endPlaces, faceZone, meets } from "../src/scene/world/world";
import type { Agent } from "../src/watcher/model";
import type { Session, Snapshot } from "../src/watcher/model";

const PROJECTS = ["lanternfish", "orbit-kit", "breadbox", "mossy-docs", "kettle-api", "pebble", "quokka", "tinsel", "marmot", "fennel"];

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

/** A seeded generator, so a failing sequence can be replayed. */
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

function checkSane(world: Floor, sessions: Session[]): void {
	const ids = flat(sessions).map((s) => s.id);
	expect([...world.desks.keys()].sort()).toEqual([...ids].sort());
	for (const [i, a] of world.areas.entries()) {
		expect(inside(a.rect, world.bounds)).toBe(true);
		expect(overlaps(a.rect, world.hallway)).toBe(false);
		for (const b of world.areas.slice(i + 1)) expect(overlaps(a.rect, b.rect)).toBe(false);
		for (const d of a.desks) {
			expect(inside(d.cell, a.rect)).toBe(true);
			expect(d.cell.y).toBeGreaterThanOrEqual(a.floorY);
		}
		for (const f of a.fixtures) expect(f.x > a.rect.x && f.x < a.rect.x + a.rect.w && f.y > a.floorY && f.y < a.rect.y + a.rect.h).toBe(true);
		// Every project room has its six stations, in the strip left of the desks, users and queues
		// on the floor.
		if (a.kind === "project") expect(a.stations.map((st) => st.kind).slice(0, STATIONS_BASE.length)).toEqual(STATIONS_BASE);
		for (const st of a.stations) {
			for (const c of a.cells) expect(st.base.x + 30).toBeLessThanOrEqual(c.x);
			for (const p of [st.use, ...st.queue]) {
				expect(p.x > a.rect.x && p.x < a.rect.x + a.rect.w && p.y > a.floorY && p.y < a.rect.y + a.rect.h).toBe(true);
				expect(p.x).toBeLessThan(a.rect.x + STRIP.w + 70);
			}
		}
	}
	const cells = [...world.desks.values()].map((d) => `${d.cell.x},${d.cell.y}`);
	expect(new Set(cells).size).toBe(cells.length);
	// Every project has exactly one room, and its sessions sit in it.
	for (const s of flat(sessions)) expect(world.areas.find((a) => a.desks.some((d) => d.id === s.id))!.name).toBe(s.project);
}

const deskCells = (w: Floor) => new Map([...w.desks].map(([id, d]) => [id, JSON.stringify(d.cell)]));

describe("layout stability", () => {
	test("adding a session moves no other desk", () => {
		const plan = new FloorPlan();
		const list = [session("lanternfish"), session("lanternfish"), session("orbit-kit"), session("breadbox")];
		const before = deskCells(plan.update(snap(list)));
		for (const extra of [session("lanternfish"), session("lanternfish"), session("lanternfish"), session("pebble")]) {
			list.push(extra);
			const after = deskCells(plan.update(snap(list)));
			for (const [id, cell] of before) expect(after.get(id)).toBe(cell);
			for (const [id, cell] of after) before.set(id, cell);
		}
	});

	test("removing a session moves no other desk", () => {
		const plan = new FloorPlan();
		const list = PROJECTS.slice(0, 4).flatMap((p) => [session(p), session(p), session(p)]);
		const before = deskCells(plan.update(snap(list)));
		while (list.length > 1) {
			list.splice(Math.floor(list.length / 2), 1);
			const after = deskCells(plan.update(snap(list)));
			for (const [id, cell] of after) expect(cell).toBe(before.get(id)!);
		}
	});

	test("a random day of arrivals and departures never moves a seated session", () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const r = rng(seed);
			const plan = new FloorPlan();
			let list: Session[] = [];
			const seen = new Map<string, string>();
			for (let step = 0; step < 150; step++) {
				const roll = r();
				if (roll < 0.5 || list.length === 0) {
					const s = session(PROJECTS[Math.floor(r() * 6)]!);
					const parent = r() < 0.2 ? list.find((p) => p.project === s.project) : undefined;
					if (parent) parent.children = [...parent.children, s];
					else list.push(s);
				} else if (list.length > 0) {
					const victim = list[Math.floor(r() * list.length)]!;
					list = list.filter((s) => s !== victim);
				}
				const world = plan.update(snap(list));
				checkSane(world, list);
				for (const [id, cell] of deskCells(world)) {
					if (seen.has(id)) expect(cell).toBe(seen.get(id)!);
					seen.set(id, cell);
				}
				// Rooms never slide along the hallway.
				// Rooms never slide along the hallway while they're in use.
				for (const key of [...seen.keys()]) if (key.startsWith("area:") && !world.areas.some((a) => `area:${a.id}` === key)) seen.delete(key);
				for (const a of world.areas) {
					const key = `area:${a.id}`;
					if (seen.has(key)) expect(`${a.band}:${a.rect.x}`).toBe(seen.get(key)!);
					seen.set(key, `${a.band}:${a.rect.x}`);
				}
			}
		}
	});

	test("rooms keep their place along the hallway as projects come and go", () => {
		const plan = new FloorPlan();
		const a = session("lanternfish");
		const b = session("orbit-kit");
		const c = session("breadbox");
		const w1 = plan.update(snap([a, b, c]));
		const xOf = (w: Floor, name: string) => w.areas.find((r) => r.name === name)!.rect.x;
		const w2 = plan.update(snap([a, c]));
		expect(xOf(w2, "lanternfish")).toBe(xOf(w1, "lanternfish"));
		expect(xOf(w2, "breadbox")).toBe(xOf(w1, "breadbox"));
		expect(w2.areas.some((r) => r.kind === "vacant")).toBe(true);
		// A new project moves into the vacant room rather than building a new one.
		const w3 = plan.update(snap([a, c, session("pebble")]));
		expect(xOf(w3, "pebble")).toBe(xOf(w1, "orbit-kit"));
		expect(w3.bounds.w).toBe(w1.bounds.w);
	});

	test("a side session sits next to the session that started it", () => {
		const plan = new FloorPlan();
		const list = Array.from({ length: 9 }, () => session("lanternfish"));
		const cols = plan.update(snap(list)).areas.find((a) => a.name === "lanternfish")!.cols;
		expect(cols).toBe(3);
		const parent = list[cols + 1]!; // row 1, column 1
		// Free the first desk (far from the parent) and the one beside the parent.
		const rest = list.filter((_, i) => i !== 0 && i !== cols + 2);
		const side = session("lanternfish");
		parent.children = [side];
		const w = plan.update(snap(rest));
		const p = w.desks.get(parent.id)!;
		const s = w.desks.get(side.id)!;
		expect(Math.abs(p.col - s.col) + Math.abs(p.row - s.row)).toBe(1);
		// A plain new session still takes the first free desk.
		const plain = session("lanternfish");
		expect(plan.update(snap([...rest, plain])).desks.get(plain.id)!.cell).toEqual(w.areas.find((a) => a.name === "lanternfish")!.cells[0]!);
	});

	test("the same snapshot gives the same world, whatever order the sessions come in", () => {
		const list = PROJECTS.slice(0, 5).flatMap((p) => [session(p), session(p)]);
		const a = new FloorPlan().update(snap(list));
		const b = new FloorPlan().update(snap([...list].reverse()));
		expect(deskCells(b)).toEqual(deskCells(a));
	});
});

describe("layout scaling", () => {
	for (const count of [1, 2, 3, 5, 8, 12, 20, 30]) {
		test(`${count} sessions spread over projects`, () => {
			const list = Array.from({ length: count }, (_, i) => session(PROJECTS[i % Math.min(PROJECTS.length, Math.ceil(count / 3))]!));
			const world = new FloorPlan().update(snap(list));
			checkSane(world, list);
			// Two bands keep the office roughly screen-shaped: never a thin strip.
			const aspect = world.bounds.w / world.bounds.h;
			expect(aspect).toBeGreaterThan(0.7);
			expect(aspect).toBeLessThan(4.2);
		});
	}

	test("30 sessions in one project make one deep room", () => {
		const list = Array.from({ length: 30 }, () => session("lanternfish"));
		const world = new FloorPlan().update(snap(list));
		checkSane(world, list);
		const room = world.areas.find((a) => a.name === "lanternfish")!;
		expect(room.cols).toBe(4);
		expect(room.rows).toBe(8);
	});

	test("an empty snapshot still has the common areas", () => {
		const world = new FloorPlan().update(snap([]));
		expect(world.areas.map((a) => a.kind)).toEqual(["meeting", "lobby", "yours", "kitchen"]);
		// Your office sits beside the lobby, its way in first on the wall (walks use it), a line to queue in.
		const yours = world.areas.find((a) => a.kind === "yours")!;
		expect(yours.rect.x).toBe(world.areas.find((a) => a.kind === "lobby")!.rect.x + world.areas.find((a) => a.kind === "lobby")!.rect.w);
		expect(yours.wall.find((w) => w.kind === "door" || w.kind === "you")!.kind).toBe("door");
		expect(yours.spots.line!.length).toBeGreaterThanOrEqual(6);
		for (const p of yours.spots.line!) {
			expect(p.x).toBeGreaterThan(yours.rect.x + 20);
			expect(p.x).toBeLessThan(yours.rect.x + yours.rect.w - 20);
			expect(p.y).toBeGreaterThan(yours.floorY);
			expect(p.y).toBeLessThan(yours.rect.y + yours.rect.h - 10);
		}
		expect(world.areas.find((a) => a.kind === "kitchen")!.spots.queue).toHaveLength(5);
	});

	test("crew slots stay inside the desk's cell and don't stack", () => {
		const world = new FloorPlan().update(snap([session("lanternfish")]));
		const d = [...world.desks.values()][0]!;
		const pts = Array.from({ length: 24 }, (_, i) => crewSlot(d, i));
		for (const p of pts) {
			expect(p.x).toBeGreaterThan(d.cell.x - 6);
			expect(p.x).toBeLessThan(d.cell.x + d.cell.w + 6);
			expect(p.y).toBeLessThanOrEqual(d.cell.y + d.cell.h);
		}
		expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(pts.length);
	});
});

describe("stations", () => {
	const crew = (count: number): Agent[] =>
		Array.from({ length: count }, (_, i) => ({ id: `c${i}`, role: "general-purpose", task: "invented", depth: 1, status: "running", lastWriteAt: 0, children: [] }));
	const where = (w: Floor, project: string) =>
		new Map(w.areas.find((a) => a.name === project)!.stations.map((st) => [st.id, JSON.stringify([st.base, st.use, st.queue])]));

	test("stations never move as sessions come and go, above the hallway or below it", () => {
		for (const project of ["lanternfish", "orbit-kit"]) {
			const plan = new FloorPlan();
			// Two projects, so one room is above the hallway and one below.
			const list = [session("lanternfish"), session("orbit-kit")];
			const before = where(plan.update(snap(list)), project);
			expect(before.size).toBe(STATIONS_BASE.length);
			// A room gaining rows (and losing them again) keeps every station where it was.
			const more = [...list, ...Array.from({ length: 6 }, () => session(project))];
			const grown = where(plan.update(snap(more)), project);
			for (const [id, at] of before) expect(grown.get(id)).toBe(at);
			const back = where(plan.update(snap(list)), project);
			expect([...back]).toEqual([...before]);
		}
	});

	test("a big crew in a room with space gets a second station of a kind, on the far end", () => {
		const plan = new FloorPlan();
		const list = Array.from({ length: 7 }, () => session("lanternfish"));
		const small = plan.update(snap(list)).areas.find((a) => a.name === "lanternfish")!;
		expect(small.rows).toBeGreaterThanOrEqual(3);
		expect(small.stations).toHaveLength(STATIONS_BASE.length);
		list[0] = { ...list[0]!, agents: crew(STATION_CREW * 3) };
		const big = plan.update(snap(list)).areas.find((a) => a.name === "lanternfish")!;
		expect(big.stations.map((st) => st.id.split(":").slice(2).join(":"))).toEqual(["build:0", "test:0", "reference:0", "search:0", "web:0", "outbox:0", "build:1", "test:1"]);
		// The base six stay put.
		for (const st of small.stations) expect(big.stations.find((x) => x.id === st.id)!.base).toEqual(st.base);
		// A two-row room has no space for more, however big the crew.
		const tight = new FloorPlan().update(snap([session("pebble", { agents: crew(20) })])).areas.find((a) => a.name === "pebble")!;
		expect(tight.stations).toHaveLength(STATIONS_BASE.length);
	});

	test("each project room has a shredder off the strip, under its back wall by the wall opposite it", () => {
		for (const project of ["lanternfish", "orbit-kit"]) {
			const plan = new FloorPlan();
			const list = [session("lanternfish"), session("orbit-kit")];
			const room = plan.update(snap(list)).areas.find((a) => a.name === project)!;
			const st = room.shredder!;
			expect(room.stations.some((s) => s.kind === "shredder")).toBe(false);
			// By the right wall, just under the back wall; its user to its left, facing it, inside the room.
			expect(st.base.x).toBeGreaterThan(room.rect.x + room.rect.w - 60);
			expect(st.base.y - room.floorY).toBeGreaterThan(0);
			expect(st.base.y - room.floorY).toBeLessThan(40);
			expect(st.use.y).toBeGreaterThan(room.floorY);
			expect(st.use.y).toBeLessThan(room.rect.y + room.rect.h);
			expect(st.use.facing).toBe(1);
			expect(st.use.x).toBeLessThan(st.at.x);
			expect(room.fixtures.some((f) => f.kind === "shredder" && f.x === st.base.x && f.y === st.base.y)).toBe(true);
			const grown = plan.update(snap([...list, ...Array.from({ length: 6 }, () => session(project))])).areas.find((a) => a.name === project)!;
			// It keeps its place on the back wall: fixed below the hallway, moving up with the wall above it.
			if (room.band === "bottom") expect(grown.shredder).toEqual(st);
			else expect(grown.shredder!.base.y - grown.floorY).toBe(st.base.y - room.floorY);
		}
	});
});

describe("the kitchen's back wall", () => {
	test("the mug wall hangs clear of the ceiling panel, the fridge, the sign, the coffee machine and its steam", () => {
		for (const n of [1, 4, 12]) {
			const w = new FloorPlan().update(snap(Array.from({ length: n }, (_, i) => session(`p${i % 5}`))));
			const k = w.areas.find((a) => a.kind === "kitchen")!;
			const m = KITCHEN_WALL.mugWall;
			const mug = { x: k.rect.x + m.x, y: k.rect.y + m.y - 1, w: m.w, h: m.h + 1 };
			expect(mug.y).toBeGreaterThanOrEqual(k.rect.y + KITCHEN_WALL.ceiling);
			const fridge = k.fixtures.find((f) => f.kind === "fridge")!;
			expect(mug.x).toBeGreaterThan(fridge.x + 42);
			for (const it of k.wall) expect(overlaps(mug, it.rect), it.kind).toBe(false);
			const counter = k.fixtures.find((f) => f.kind === "counter")!;
			const c = KITCHEN_WALL.machine;
			const machine = { x: counter.x + c.x0, y: counter.y + c.top, w: c.x1 - c.x0, h: 52 };
			expect(overlaps(mug, machine)).toBe(false);
			// The steam's last visible wisp (past `fadeFrom` of its rise it is all but gone) stays under the shelf.
			const st = KITCHEN_WALL.steam;
			const top = counter.y - st.dy - st.rise * KITCHEN_WALL.wisp.fadeFrom - KITCHEN_WALL.wisp.r;
			expect(top).toBeGreaterThan(mug.y + mug.h);
			// It rises off the cup in front of the machine.
			expect(counter.x - st.dx).toBeGreaterThan(machine.x);
			expect(counter.x - st.dx).toBeLessThan(machine.x + machine.w);
		}
	});
});

test("a room's ceiling panels (one of which flickers) sit evenly along its back wall, inside it", () => {
	for (const w of [180, 430, 830, 1200]) {
		const ps = ceilingPanels({ x: 100, y: -50, w });
		expect(ps.length).toBe(Math.max(1, Math.round(w / 190)));
		for (const p of ps) {
			expect(p.cx - 38).toBeGreaterThanOrEqual(100);
			expect(p.cx + 38).toBeLessThanOrEqual(100 + w);
			expect(p.y).toBe(-45);
		}
	}
});

describe("the lead's face is a keep-out zone", () => {
	test("nothing drawn at a desk in front of its lead covers the lead's face, in the busiest offices", () => {
		const parts = Object.entries(deskParts());
		// The tower is a column from the desk up, at any height; the card and the screen are real.
		expect(parts.map(([k]) => k)).toEqual(expect.arrayContaining(["screen", "build", "tray", "mugs", "lamp", "card"]));
		for (const name of ["thirty", "release", "", "crowd"]) {
			const world = new FloorPlan().update(demo(name || null).snapshot);
			let leads = 0;
			for (const a of world.areas) {
				for (const lead of a.desks) {
					leads++;
					const face = faceZone(lead.lead, LEAD_SIZE);
					// Its own desk and every desk drawn in front of it (lower on the floor).
					for (const d of a.desks) {
						if (d.at.y <= lead.lead.y) continue;
						for (const [part, r] of parts) {
							const at = { ...r, x: r.x + d.at.x, y: r.y + d.at.y };
							if (meets(face, at)) throw new Error(`${name || "busy"}: ${d.id}'s ${part} covers ${lead.id}'s face`);
						}
					}
					// Its face shows over the desk top, mouth included: the top's back edge is below it.
					expect(face.y + face.h).toBeLessThan(lead.at.y + DESK_TOP - 2);
				}
			}
			expect(leads).toBeGreaterThan(1);
		}
	});

	test("the screen is small, at the desk's far end; the build's base at its outer end", () => {
		expect(MONITOR.w * MONITOR.h).toBeLessThanOrEqual(46 * 34);
		const face = faceZone(SEAT, LEAD_SIZE);
		expect(MONITOR.x - MONITOR.w / 2).toBeGreaterThan(face.x + face.w);
		expect(MONITOR.x).toBeGreaterThan(0);
		expect(BUILD.left + BUILD.wide * BUILD.brickW + 3).toBeLessThan(face.x);
		expect(BUILD.left).toBeLessThan(-80);
	});
});

describe("the crew's towers stay in view", () => {
	const LINE = { bay: "line", hall: "conveyor" } as const;
	/** A desk's tower as drawn (propspots.ts `deskParts().build`, strokes included), `courses` high. */
	const tower = (at: { x: number; y: number }, courses: number): Rect => ({
		x: at.x + BUILD.left - 1,
		y: at.y + BUILD.floor - courses * BUILD.brickH - 1,
		w: BUILD.wide * BUILD.brickW + 3 + 2,
		h: courses * BUILD.brickH + 2,
	});
	const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

	test("crew on a desk's end place cover under 15% of any tower, a short one or a tall one, in either staging", () => {
		let ends = 0;
		for (const name of ["", "release", "thirty", "crowd"]) {
			for (const staging of [undefined, LINE]) {
				const world = new FloorPlan().update(demo(name || null).snapshot, staging);
				for (const a of world.areas) {
					for (const d of a.desks) {
						const mine = endPlaces(world, d);
						for (let n = 1; n <= 10; n++) {
							for (const p of crewPlaces(world, d, n)) {
								if (!mine.some((e) => e.x === p.x && e.y === p.y)) continue;
								ends++;
								const body = bodyRect(p, 58);
								for (const other of a.desks) {
									for (const courses of [1, 3, 10]) {
										const t = tower(other.at, courses);
										const covered = area(body, t) / (t.w * t.h);
										if (covered > 0.15) throw new Error(`${name || "busy"}/${staging ? "line" : "desks"}: ${d.id}'s end place covers ${(covered * 100).toFixed(0)}% of ${other.id}'s tower`);
									}
								}
							}
						}
					}
				}
			}
		}
		expect(ends).toBeGreaterThan(5);
	});
});
