// A busy crew, directed: builders act out the tool in hand at their own pace, look up when a
// teammate's test goes red, the lead walks its rounds, and the crew's build grows on the desk.
import { describe, expect, test } from "bun:test";
import { COPIER_FEUD, RULES, cueFor, direct, runCooldown } from "../src/scene/director/direct";
import type { World } from "../src/scene/director/types";
import { PACE, RUNS, editRate, paceOf } from "../src/scene/director/pace";
import { STATION_POSE, STATION_REACH } from "../src/scene/director/stations";
import { TRIP } from "../src/scene/director/trips";
import { WORK, WORK_POSE, nextWork, tempo, workKind } from "../src/scene/director/work";
import { FloorPlan } from "../src/scene/office/layout";
import { STATION_CREW_PX, crewSpots } from "../src/scene/office/world";
import { POSE, duration } from "../src/scene/rig/poses";
import { detect } from "../src/scene/sass/detect";
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

function stage() {
	const plan = new FloorPlan();
	let world: World | undefined;
	return {
		step(snap: Snapshot, now = snap.at) {
			const d = direct(world, snap, now, plan.update(snap));
			world = d.world;
			return d;
		},
	};
}
const snap = (at: number, sessions: Session[]): Snapshot => ({ at, sessions });
const six = (tools: string[], at = T0 - SEC) => tools.map((t, i) => builder(`b${i}`, t, at));

describe("work kinds", () => {
	test("a running shell command wins; tools map to read, search, edit and shell", () => {
		expect(workKind({ tool: "Bash", since: T0, kind: "test" }, { tool: "Edit", at: T0 })).toBe("test");
		expect(workKind({ tool: "Bash", since: T0, kind: "build" }, undefined)).toBe("shell");
		expect(workKind(undefined, { tool: "Read", at: T0 })).toBe("read");
		expect(workKind(undefined, { tool: "Grep", at: T0 })).toBe("search");
		expect(workKind(undefined, { tool: "Write", at: T0 })).toBe("edit");
		expect(workKind(undefined, { tool: "mcp__thing__do", at: T0 })).toBeUndefined();
	});

	test("a kind holds a few seconds before the next tool can change it", () => {
		const w = nextWork(undefined, "read", T0)!;
		expect(nextWork(w, "edit", T0 + WORK.holdMs - 1)).toBe(w);
		expect(nextWork(w, "edit", T0 + WORK.holdMs)).toEqual({ kind: "edit", since: T0 + WORK.holdMs });
		expect(nextWork(w, undefined, T0 + 99 * MIN)).toBe(w);
	});

	test("tempo: quick while writing, slow when coasting, a little different for everyone", () => {
		const hot = tempo("a", T0 - SEC, T0);
		const cold = tempo("a", T0 - 5 * MIN, T0);
		expect(hot).toBeGreaterThan(cold);
		expect(tempo("a", T0 - SEC, T0)).toBe(hot);
		const crew = ["a", "b", "c", "d", "e", "f"].map((k) => tempo(k, T0 - SEC, T0));
		expect(new Set(crew).size).toBeGreaterThan(3);
	});
});

describe("a busy crew", () => {
	test("six builders act out six tools, each at its own pace", () => {
		const d = stage().step(snap(T0, [release(six(["Edit", "Read", "Grep", "Edit", "Write", "Read"]))]));
		const poses = [0, 1, 2, 3, 4, 5].map((i) => d.world.actors[`a:rel:b${i}`]!.pose);
		expect(poses).toEqual(["hammer", "blueprint", "rummage", "hammer", "hammer", "blueprint"]);
		const paces = [0, 1, 2, 3, 4, 5].map((i) => d.world.actors[`a:rel:b${i}`]!.tempo);
		expect(new Set(paces).size).toBeGreaterThan(3);
		for (const p of ["blueprint", "rummage", "tinker", "poke", "thumb", "glance", "inspect"]) expect(POSE[p]).toBeDefined();
	});

	test("a shell command running is tinkering; a test run is poking", () => {
		const d = stage().step(
			snap(T0, [
				release([
					builder("b0", "Bash", T0 - SEC, { running: { tool: "Bash", since: T0 - SEC, kind: "build" } }),
					builder("b1", "Bash", T0 - SEC, { running: { tool: "Bash", since: T0 - SEC, kind: "test" } }),
				]),
			]),
		);
		expect(d.world.actors["a:rel:b0"]!.pose).toBe("tinker");
		expect(d.world.actors["a:rel:b1"]!.pose).toBe("poke");
	});

	test("a new tool changes the pose only after the hold, and a new pace doesn't restart it", () => {
		// (A search, not an edit: a builder's new edit would set off a brick run.)
		const s = stage();
		s.step(snap(T0, [release([builder("b0", "Read", T0)])]));
		const soon = s.step(snap(T0 + 2 * SEC, [release([builder("b0", "Grep", T0 + 2 * SEC)])]));
		expect(soon.world.actors["a:rel:b0"]!.pose).toBe("blueprint");
		expect(soon.wake).toBeLessThanOrEqual(T0 + WORK.holdMs);
		const later = s.step(snap(T0 + WORK.holdMs, [release([builder("b0", "Grep", T0 + 2 * SEC)])]));
		expect(later.world.actors["a:rel:b0"]!.pose).toBe("rummage");
		// Held another hold: off to the card catalogue, thumbing through it.
		const there = s.step(snap(T0 + 2 * WORK.holdMs, [release([builder("b0", "Grep", T0 + 2 * SEC)])]));
		const a = there.world.actors["a:rel:b0"]!;
		expect(a.pose).toBe(STATION_POSE.search.work);
		// Coasting: same pose, slower, same cue key.
		const cold = s.step(snap(T0 + 3 * MIN, [release([builder("b0", "Grep", T0 + 2 * SEC)])]));
		const b = cold.world.actors["a:rel:b0"]!;
		expect(b.pose).toBe(STATION_POSE.search.work);
		expect(b.tempo).toBeLessThan(a.tempo);
		expect(cueFor(b, T0 + 3 * MIN).key).toBe(cueFor(a, T0 + 3 * MIN).key);
		expect(cueFor(b, T0 + 3 * MIN).tempo).toBe(b.tempo);
	});

	test("a red test: the builder hits its thumb, the others look up, the build loses a piece", () => {
		const s = stage();
		const crew = six(["Edit", "Edit", "Edit", "Read", "Read", "Read"]);
		const first = s.step(snap(T0, [release(crew)]));
		const before = first.world.builds.rel!.pieces;
		const red = structuredClone(crew);
		red[0]!.commands = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at: T0 + SEC } };
		const d = s.step(snap(T0 + SEC, [release(red)]));
		expect(d.world.actors["a:rel:b0"]!.pose).toBe("thumb");
		// The look ripples out from the nearest (social.ts): each one glances now, or has it booked.
		for (const i of [1, 2, 3, 4, 5]) {
			const a = d.world.actors[`a:rel:b${i}`]!;
			expect(a.pose === "glance" || a.pending?.pose === "glance").toBe(true);
			expect(a.reactTo).toBe("a:rel:b0");
		}
		expect([1, 2, 3, 4, 5].some((i) => d.world.actors[`a:rel:b${i}`]!.pose === "glance")).toBe(true);
		const last = Math.max(...[1, 2, 3, 4, 5].map((i) => d.world.actors[`a:rel:b${i}`]!.pending?.at ?? 0));
		if (last > 0) {
			const all = s.step(snap(T0 + SEC, [release(red)]), last);
			for (const i of [1, 2, 3, 4, 5]) expect(all.world.actors[`a:rel:b${i}`]!).toMatchObject({ pose: "glance", lookAt: "a:rel:b0" });
		}
		expect(d.world.builds.rel!.pieces).toBe(before - 1);
		expect(d.world.builds.rel!.fellAt).toBe(T0 + SEC);
		expect(d.events).toContainEqual({ type: "build", session: "rel", at: T0 + SEC, pieces: before - 1, change: "fall" });
	});

	test("a teammate finishing makes the others look up", () => {
		const s = stage();
		const crew = six(["Edit", "Edit", "Edit", "Read", "Read", "Read"]);
		s.step(snap(T0, [release(crew)]));
		const done = structuredClone(crew);
		done[5]!.status = "finished";
		const d = s.step(snap(T0 + SEC, [release(done)]));
		const b0 = d.world.actors["a:rel:b0"]!;
		expect(b0.pose === "glance" || b0.pending?.pose === "glance").toBe(true);
		expect(b0.reactTo).toBe("a:rel:b5");
		expect(d.world.actors["a:rel:b5"]!.pose).toBe("done");
	});
});

describe("the foreman's round", () => {
	/** When the lead of session "rel" next starts a visit, stepping a second at a time from T0. */
	function times() {
		const s = stage();
		const crew = six(["Edit", "Read", "Grep", "Edit", "Write", "Read"]);
		let was = "";
		let visit: number | undefined;
		for (let t = T0; t < T0 + 2 * RULES.foremanEveryMs && visit === undefined; t += SEC) {
			const spot = s.step(snap(t, [release(crew)])).world.actors["s:rel"]!.spot;
			if (was === "desk" && spot.startsWith("visit:")) visit = t;
			was = spot;
		}
		return { crew, visit: visit! };
	}

	test("a lead waiting on a busy crew walks over to one of them, looks, and walks back", () => {
		const { crew, visit } = times();
		expect(visit).toBeDefined();
		const s = stage();
		const at = s.step(snap(visit - SEC, [release(crew)]));
		expect(at.world.actors["s:rel"]!.spot).toBe("desk");
		const go = s.step(snap(visit, [release(crew)]));
		const lead = go.world.actors["s:rel"]!;
		expect(lead.spot).toMatch(/^visit:a:rel:b\d$/);
		expect(lead.pose).toBe("inspect");
		expect(go.events.some((e) => e.type === "walk" && e.key === "s:rel")).toBe(true);
		expect(go.wake).toBeDefined();
		const back = s.step(snap(visit + RULES.foremanStayMs, [release(crew)]));
		expect(back.world.actors["s:rel"]!.spot).toBe("desk");
	});

	test("a lead busy with its own tools, or with too small a crew, stays at its desk", () => {
		const { crew, visit } = times();
		const own = stage().step(snap(visit, [release(crew, { activity: { tool: "Edit", at: visit - SEC }, running: undefined })]));
		expect(own.world.actors["s:rel"]!.spot).toBe("desk");
		const small = stage().step(snap(visit, [release(crew.slice(0, 1))]));
		expect(small.world.actors["s:rel"]!.spot).toBe("desk");
	});
});

describe("the crew's build", () => {
	test("starts with a piece per busy hand, grows per new edit, and gets a flag for the PR", () => {
		const s = stage();
		const crew = six(["Edit", "Read", "Read", "Read", "Read", "Read"]);
		const d0 = s.step(snap(T0, [release(crew)]));
		expect(d0.world.builds.rel).toMatchObject({ pieces: 6, topped: false });
		// The same edit seen again counts once; two new edits add two: one straight on, one carried
		// over by its builder.
		expect(s.step(snap(T0 + SEC, [release(crew)])).world.builds.rel!.pieces).toBe(6);
		const more = structuredClone(crew);
		more[0]!.activity = { tool: "Edit", at: T0 + 2 * SEC };
		more[1]!.activity = { tool: "Write", at: T0 + 2 * SEC };
		const two = s.step(snap(T0 + 2 * SEC, [release(more)])).world.builds.rel!;
		expect(two.pieces).toBe(7);
		expect(two.run?.key).toBe("a:rel:b0");
		const pr = s.step(snap(two.run!.lands, [release(more, { prs: [{ number: 7, url: "https://example.invalid/7", at: two.run!.lands }] })]));
		expect(pr.world.builds.rel!.topped).toBe(true);
		expect(pr.events).toContainEqual({ type: "build", session: "rel", at: two.run!.lands, pieces: 8, change: "top" });
	});

	test("a session with no builders and a small crew has no build", () => {
		const scouts = [builder("s0", "Read", T0, { role: "scout" })];
		expect(stage().step(snap(T0, [release(scouts)])).world.builds.rel).toBeUndefined();
	});
});

describe("brick runs", () => {
	/** A lead busy at its own desk (not on its rounds), reading. */
	const busyLead = (at: number): Partial<Session> => ({ activity: { tool: "Read", at }, running: undefined });
	/** When the brick leaves the builder's hands in `place`: the end of the last frame showing it. */
	const placeMs = () => {
		let t = 0;
		let end = 0;
		for (const f of POSE.place!.frames) {
			t += f.ms;
			if ([f.props.left, f.props.right, f.props.work].includes("brick")) end = t;
		}
		expect(end).toBeGreaterThan(0);
		expect(end).toBeLessThan(duration(POSE.place!.frames));
		return end;
	};
	/** The crew with builder `i` making a new edit at `at`. */
	const edit = (crew: Agent[], i: number, at: number) => {
		const next = structuredClone(crew);
		next[i]!.activity = { tool: "Edit", at };
		next[i]!.lastWriteAt = at;
		return next;
	};
	/** Two builders, the build started, and b0 setting off with a new edit at T0 + 1 s. */
	function setOff() {
		const s = stage();
		let crew = six(["Read", "Read"]);
		const first = s.step(snap(T0, [release(crew, busyLead(T0))]));
		crew = edit(crew, 0, T0 + SEC);
		const go = s.step(snap(T0 + SEC, [release(crew, busyLead(T0 + SEC))]));
		return { s, crew, first, go, run: go.world.builds.rel!.run! };
	}

	test("a builder's new edit sets it off with a brick: it walks to the build carrying it", () => {
		const { first, go, run } = setOff();
		const b0 = go.world.actors["a:rel:b0"]!;
		expect(b0.spot).toBe("build");
		expect(b0.home).toBe(first.world.actors["a:rel:b0"]!.spot);
		expect(b0.pose).toBe("place");
		const cue = cueFor(b0, T0 + SEC);
		expect(cue.walkPose).toBe("carry");
		expect(cue.walk?.ms).toBe(run.walkMs);
		expect(cue.pose).toBe("place");
		// The brick is in its hands, not yet on the build.
		expect(go.world.builds.rel!.pieces).toBe(first.world.builds.rel!.pieces);
		expect(run).toMatchObject({ key: "a:rel:b0", since: T0 + SEC, carried: true });
		expect(run.lands).toBe(T0 + SEC + run.walkMs + placeMs());
		expect(go.events).toContainEqual({ type: "build", session: "rel", at: T0 + SEC, pieces: first.world.builds.rel!.pieces, change: "carry", key: "a:rel:b0" });
		expect(go.wake).toBeLessThanOrEqual(run.lands);
	});

	test("the brick goes on at the end of place, and the builder walks back to its spot", () => {
		const { s, crew, first, run } = setOff();
		const pieces = first.world.builds.rel!.pieces;
		const before = s.step(snap(run.lands - 1, [release(crew, busyLead(run.lands - 1))]));
		expect(before.world.builds.rel!.pieces).toBe(pieces);
		expect(before.world.actors["a:rel:b0"]!.spot).toBe("build");
		// The same cue all the way there: the walk and the pose are not restarted.
		expect(cueFor(before.world.actors["a:rel:b0"]!, run.lands - 1).key).toBe(cueFor(s.step(snap(T0 + SEC, [release(crew, busyLead(T0 + SEC))])).world.actors["a:rel:b0"]!, T0 + SEC).key);
	});

	test("landing: a piece, an add event, and the walk back in the plain walk", () => {
		const { s, crew, first, run } = setOff();
		const pieces = first.world.builds.rel!.pieces;
		const d = s.step(snap(run.lands, [release(crew, busyLead(run.lands))]));
		expect(d.world.builds.rel!.pieces).toBe(pieces + 1);
		expect(d.world.builds.rel!.addedAt).toBe(run.lands);
		expect(d.events).toContainEqual({ type: "build", session: "rel", at: run.lands, pieces: pieces + 1, change: "add" });
		const b0 = d.world.actors["a:rel:b0"]!;
		expect(b0.spot).toBe(run.from);
		// Back to its work pose (whichever the tool in hand says by then).
		expect(b0.pose).toBe(WORK_POSE.builder![b0.work!.kind]!);
		const cue = cueFor(b0, run.lands);
		expect(cue.walk).toBeDefined();
		expect(cue.walkPose).toBeUndefined();
		expect(d.events.some((e) => e.type === "walk" && e.key === "a:rel:b0" && e.to === run.from)).toBe(true);
		// Back at its spot, the run is over.
		const home = s.step(snap(run.done, [release(crew, busyLead(run.done))]));
		expect(home.world.builds.rel!.run).toBeUndefined();
		expect(home.world.builds.rel!.pieces).toBe(pieces + 1);
	});

	test("one runner at a time: a second builder's edit during a run goes straight on", () => {
		const { s, crew, first } = setOff();
		const pieces = first.world.builds.rel!.pieces;
		const next = edit(crew, 1, T0 + 2 * SEC);
		const d = s.step(snap(T0 + 2 * SEC, [release(next, busyLead(T0 + 2 * SEC))]));
		expect(d.world.builds.rel!.pieces).toBe(pieces + 1);
		expect(d.world.builds.rel!.run!.key).toBe("a:rel:b0");
		expect(d.world.actors["a:rel:b1"]!.spot).toMatch(/^crew:/);
	});

	test("the cooldown: edits go straight on until it has passed, then the next builder runs", () => {
		const { s, crew, run } = setOff();
		const cool = runCooldown("rel");
		expect(cool).toBeGreaterThanOrEqual(RULES.runEveryMs);
		expect(cool).toBeLessThan(RULES.runEveryMs + RULES.runJitterMs);
		s.step(snap(run.done, [release(crew, busyLead(run.done))]));
		const soon = T0 + SEC + cool - SEC;
		const early = s.step(snap(soon, [release(edit(crew, 1, soon), busyLead(soon))]));
		expect(early.world.builds.rel!.run).toBeUndefined();
		expect(early.world.actors["a:rel:b1"]!.spot).toMatch(/^crew:/);
		const late = T0 + SEC + cool;
		const d = s.step(snap(late, [release(edit(edit(crew, 1, soon), 1, late), busyLead(late))]));
		expect(d.world.builds.rel!.run?.key).toBe("a:rel:b1");
		expect(d.world.actors["a:rel:b1"]!.spot).toBe("build");
	});

	test("nobody runs while the lead waits on you, or from an acted pose", () => {
		const s = stage();
		const crew = six(["Read", "Read"]);
		const waiting: Partial<Session> = { ...busyLead(T0), state: "idle", waiting: { reason: "permission", since: T0, source: "hook" } };
		s.step(snap(T0, [release(crew, waiting)]));
		const d = s.step(snap(T0 + SEC, [release(edit(crew, 0, T0 + SEC), waiting)]));
		expect(d.world.builds.rel!.run).toBeUndefined();
		expect(d.world.actors["a:rel:b0"]!.spot).toMatch(/^crew:/);

		// A red test and an edit at once: it hits its thumb and stays put; the edit goes straight on.
		const t = stage();
		const p0 = t.step(snap(T0, [release(crew, busyLead(T0))])).world.builds.rel!.pieces;
		const red = edit(crew, 0, T0 + SEC);
		red[0]!.commands = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at: T0 + SEC } };
		const r = t.step(snap(T0 + SEC, [release(red, busyLead(T0 + SEC))]));
		expect(r.world.actors["a:rel:b0"]!.pose).toBe("thumb");
		expect(r.world.builds.rel!.run).toBeUndefined();
		// One on for the edit, one off for the red test.
		expect(r.world.builds.rel!.pieces).toBe(p0);
	});

	test("a lead's edit goes straight on; a runner that finishes mid-carry puts its brick on", () => {
		const s = stage();
		const crew = six(["Read", "Read"]);
		const p0 = s.step(snap(T0, [release(crew, busyLead(T0))])).world.builds.rel!.pieces;
		const own = s.step(snap(T0 + SEC, [release(crew, { activity: { tool: "Write", at: T0 + SEC }, running: undefined })]));
		expect(own.world.builds.rel!.pieces).toBe(p0 + 1);
		expect(own.world.builds.rel!.run).toBeUndefined();

		const { s: t, crew: c, first, run } = setOff();
		const done = structuredClone(c);
		done[0]!.status = "finished";
		const d = t.step(snap(run.since + 200, [release(done, busyLead(run.since + 200))]));
		expect(d.world.builds.rel!.pieces).toBe(first.world.builds.rel!.pieces + 1);
		expect(d.world.builds.rel!.run).toBeUndefined();
		expect(d.world.actors["a:rel:b0"]!.spot).not.toBe("build");
	});

	test("the same snapshots always give the same runs", () => {
		const play = () => {
			const s = stage();
			let crew = six(["Edit", "Read", "Grep", "Edit", "Write", "Read"]);
			const out: unknown[] = [];
			for (let i = 0; i < 40; i++) {
				const at = T0 + i * 1500;
				if (i % 2) crew = edit(crew, i % 6, at);
				const d = s.step(snap(at, [release(crew)]));
				out.push(d.world.builds.rel, d.events.filter((e) => e.type === "build"));
			}
			return out;
		};
		const a = play();
		expect(play()).toEqual(a);
		expect(JSON.stringify(a)).toContain('"change":"carry"');
	});
});

describe("crew chatter", () => {
	test("a big crew busy across two snapshots talks shop, one line per stretch", () => {
		const crew = six(["Edit", "Read", "Grep", "Edit", "Write", "Read"]);
		const a = snap(T0, [release(crew)]);
		const ts = detect(a, a, T0, { hour: () => 14, clock: () => "14:00" }).filter((t) => t.kind === "chatter");
		expect(ts).toHaveLength(1);
		expect(ts[0]!.who).toMatch(/^b\d$/);
		// A fresh crew, just hired, leaves the line to the big-crew trigger.
		const hired = detect(snap(T0, [release([])]), a, T0, { hour: () => 14, clock: () => "14:00" });
		expect(hired.some((t) => t.kind === "chatter")).toBe(false);
	});
});

describe("crew spots", () => {
	test("six crew get room for their work: spaced in the desk's cell, then the free cell in front", () => {
		const plan = new FloorPlan();
		const floor = plan.update(snap(T0, [release(six(["Edit", "Edit", "Edit", "Edit", "Edit", "Edit"]))]));
		const desk = floor.desks.get("rel")!;
		const spots = crewSpots(floor, desk);
		expect(spots.length).toBeGreaterThanOrEqual(6);
		// Two in a row with their work between them stand at least 120 px apart; back to back, 90.
		for (const a of spots)
			for (const b of spots) {
				if (a === b || a.y !== b.y || a.x > b.x) continue;
				expect(b.x - a.x).toBeGreaterThanOrEqual(a.facing === 1 && b.facing === -1 ? 120 : 90);
			}
		// A free cell is lent to one desk only.
		const other = { ...release([]), id: "other", startedAt: T0 - 30 * MIN };
		const two = new FloorPlan().update(snap(T0, [release([]), other]));
		const a = crewSpots(two, two.desks.get("rel")!).slice(4);
		const b = crewSpots(two, two.desks.get("other")!).slice(4);
		for (const p of a) expect(b.some((q) => q.x === p.x && q.y === p.y)).toBe(false);
	});
});


describe("stations and trips", () => {
	const STATION = (kind: string, n = 0) => `station:room:teapot:${kind}:${n}`;
	/** Step the crew through `times`, the same crew each time unless `at` changes it. */
	const run = (s: ReturnType<typeof stage>, times: number[], crew: (t: number) => Agent[], extra: Partial<Session> = {}) =>
		times.map((t) => s.step(snap(t, [release(crew(t), extra)])));

	test("a held read walks to the filing cabinet, works facing it, and walks back when it edits", () => {
		const s = stage();
		const readAt = (t: number) => [builder("b0", t < T0 + 20 * SEC ? "Read" : "Edit", t < T0 + 20 * SEC ? T0 : T0 + 20 * SEC)];
		const [first, early] = run(s, [T0, T0 + 5 * SEC], readAt);
		const home = first!.world.actors["a:rel:b0"]!.spot;
		expect(home).toMatch(/^crew:/);
		// A single call's worth of reading sends nobody: it has to hold first.
		expect(early!.world.actors["a:rel:b0"]!.spot).toBe(home);
		expect(early!.wake).toBeLessThanOrEqual(T0 + TRIP.holdMs);
		const [go] = run(s, [T0 + TRIP.holdMs], readAt);
		const b0 = go!.world.actors["a:rel:b0"]!;
		expect(b0.spot).toBe(STATION("reference"));
		expect(b0.home).toBe(home);
		expect(b0.pose).toBe(STATION_POSE.reference.work);
		expect(b0.trip).toMatchObject({ kind: "reference", queue: 0, since: T0 + TRIP.holdMs });
		expect(go!.events).toContainEqual({ type: "trip", key: "a:rel:b0", at: T0 + TRIP.holdMs, station: "room:teapot:reference:0", state: "start" });
		expect(go!.events.some((e) => e.type === "walk" && e.key === "a:rel:b0" && e.to === STATION("reference"))).toBe(true);
		// It stands facing the station, its feet STATION_REACH from the working point.
		const floor = new FloorPlan().update(snap(T0, [release(readAt(T0))]));
		const st = floor.areas.find((a) => a.id === "room:teapot")!.stations.find((x) => x.kind === "reference")!;
		expect(b0.slot).toEqual(st.use);
		expect(b0.slot.facing).toBe(-1);
		expect(st.at.x - b0.slot.x).toBe(-STATION_REACH.x);
		expect(st.at.y - b0.slot.y).toBe(STATION_REACH.y);
		// Still reading: it stays. Editing again: back to its own spot.
		const [stay, back] = run(s, [T0 + 15 * SEC, T0 + 20 * SEC], readAt);
		expect(stay!.world.actors["a:rel:b0"]!.spot).toBe(STATION("reference"));
		const b = back!.world.actors["a:rel:b0"]!;
		expect(b.spot).toBe(home);
		expect(b.trip).toBeUndefined();
		expect(back!.events).toContainEqual({ type: "trip", key: "a:rel:b0", at: T0 + 20 * SEC, station: "room:teapot:reference:0", state: "end" });
		expect(back!.events.some((e) => e.type === "walk" && e.key === "a:rel:b0" && e.to === home)).toBe(true);
	});

	test("a smaller crew member stands closer, so its hands still meet the working point", () => {
		const s = stage();
		const small = (t: number) => [builder("b0", "Read", T0, { depth: 3 })];
		run(s, [T0], small);
		const [d] = run(s, [T0 + TRIP.holdMs], small);
		const b0 = d!.world.actors["a:rel:b0"]!;
		expect(b0.size).toBeLessThan(STATION_CREW_PX);
		const floor = new FloorPlan().update(snap(T0, [release(small(T0))]));
		const st = floor.areas.find((a) => a.id === "room:teapot")!.stations.find((x) => x.kind === "reference")!;
		const k = b0.size / STATION_CREW_PX;
		expect(Math.abs(b0.slot.x - st.at.x - STATION_REACH.x * k)).toBeLessThanOrEqual(0.5);
		expect(Math.abs(st.at.y - b0.slot.y - STATION_REACH.y * k)).toBeLessThanOrEqual(0.5);
		// Drawn in front of the station's body, whatever its size.
		expect(b0.slot.depth).toBeGreaterThan(st.base.y);
	});

	test("a quick look never makes a trip; a finished shell command doesn't send anyone to the copier", () => {
		const s = stage();
		// Edits, one Read in between, edits again: the read never holds while it is the tool in hand.
		const tool = (t: number) => (t === T0 + 7 * SEC ? "Read" : "Edit");
		const ds = run(s, [T0, T0 + 7 * SEC, T0 + 9 * SEC, T0 + 13 * SEC, T0 + 20 * SEC], (t) => [builder("b0", tool(t), t === T0 + 7 * SEC ? t : T0)]);
		for (const d of ds) expect(d.world.actors["a:rel:b0"]!.trip).toBeUndefined();
		// A Bash call that has ended: shell work, but nothing running, so no copier.
		const t = stage();
		const done = run(t, [T0, T0 + 10 * SEC], () => [builder("b0", "Bash", T0)]);
		expect(done[1]!.world.actors["a:rel:b0"]!.pose).toBe("tinker");
		expect(done[1]!.world.actors["a:rel:b0"]!.trip).toBeUndefined();
		// While it runs, it goes.
		const building = run(stage(), [T0, T0 + 10 * SEC], () => [builder("b0", "Bash", T0, { running: { tool: "Bash", since: T0, kind: "build" } })]);
		expect(building[1]!.world.actors["a:rel:b0"]!.spot).toBe(STATION("build"));
		expect(building[1]!.world.actors["a:rel:b0"]!.pose).toBe(STATION_POSE.build.work);
	});

	test("one user per station: the next two queue beside it, a fourth stays at its bench", () => {
		const s = stage();
		const readers = (t: number) => ["b0", "b1", "b2", "b3"].map((id, i) => builder(id, i === 0 && t >= T0 + 20 * SEC ? "Edit" : "Read", i === 0 && t >= T0 + 20 * SEC ? t : T0));
		const [, d] = run(s, [T0, T0 + TRIP.holdMs], readers);
		const a = (k: string) => d!.world.actors[`a:rel:${k}`]!;
		expect(a("b0").spot).toBe(STATION("reference"));
		expect(a("b1").spot).toBe("queue:room:teapot:reference:0:0");
		expect(a("b2").spot).toBe("queue:room:teapot:reference:0:1");
		expect(a("b3").spot).toMatch(/^crew:/);
		expect(a("b1").pose).toBe(TRIP.queuePose);
		expect(a("b1").trip).toMatchObject({ queue: 1 });
		expect(d!.events).toContainEqual({ type: "trip", key: "a:rel:b1", at: T0 + TRIP.holdMs, station: "room:teapot:reference:0", state: "queue" });
		// The user goes back to edit: the line moves up, and on its way it hands its folder to the
		// fourth, so that one never joins the line (handoff.ts).
		const [up] = run(s, [T0 + 20 * SEC], readers);
		const u = (k: string) => up!.world.actors[`a:rel:${k}`]!;
		expect(u("b0").spot).toBe("handoff:a:rel:b3");
		expect(u("b1").spot).toBe(STATION("reference"));
		expect(u("b1").pose).toBe(STATION_POSE.reference.work);
		expect(u("b2").spot).toBe("queue:room:teapot:reference:0:0");
		expect(u("b3").spot).toMatch(/^crew:/);
		expect(u("b3").trip).toBeUndefined();
		expect(up!.events).toContainEqual({ type: "trip", key: "a:rel:b1", at: T0 + 20 * SEC, station: "room:teapot:reference:0", state: "use" });
	});

	test("a long build at the copier jams it: a running feud, looped until the build ends", () => {
		const s = stage();
		const running = { tool: "Bash", since: T0 - (RULES.longBuildMin + 5) * MIN, kind: "build" as const };
		const crew = (t: number) => [builder("b0", t < T0 + 40 * SEC ? "Bash" : "Edit", t < T0 + 40 * SEC ? T0 : t, t < T0 + 40 * SEC ? { running } : {})];
		const [first, d, later, done] = run(s, [T0, T0 + TRIP.holdMs, T0 + 30 * SEC, T0 + 40 * SEC], crew);
		expect(first!.world.actors["a:rel:b0"]!.pose).toBe("grumpy");
		const b0 = d!.world.actors["a:rel:b0"]!;
		expect(b0.spot).toBe(STATION("build"));
		expect(b0.pose).toBe(COPIER_FEUD);
		expect(POSE[COPIER_FEUD]!.play).toBe("loop");
		expect(cueFor(b0, T0 + TRIP.holdMs).loops).toBe(Infinity);
		// Still feuding, the same pose carrying on; the build ends and it walks back.
		expect(later!.world.actors["a:rel:b0"]).toMatchObject({ pose: COPIER_FEUD, poseSince: b0.poseSince });
		expect(done!.world.actors["a:rel:b0"]!.spot).toMatch(/^crew:/);
	});

	test("a red test at the stamp desk: a red stamp, then the thumb, then back to the bench", () => {
		const s = stage();
		const testing = [builder("b0", "Bash", T0, { running: { tool: "Bash", since: T0, kind: "test" } })];
		run(s, [T0], () => testing);
		const [at] = run(s, [T0 + TRIP.holdMs], () => testing);
		expect(at!.world.actors["a:rel:b0"]!.spot).toBe(STATION("test"));
		expect(at!.world.actors["a:rel:b0"]!.pose).toBe(STATION_POSE.test.work);
		const red = [builder("b0", "Bash", T0 + 8 * SEC, { commands: { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at: T0 + 8 * SEC } } })];
		const [stamp] = run(s, [T0 + 8 * SEC], () => red);
		const b0 = stamp!.world.actors["a:rel:b0"]!;
		expect(b0.spot).toBe(STATION("test"));
		expect(b0.pose).toBe(STATION_POSE.test.bad!);
		const stampEnd = T0 + 8 * SEC + duration(POSE[STATION_POSE.test.bad!]!.frames);
		expect(stamp!.wake).toBeLessThanOrEqual(stampEnd);
		const [thumb] = run(s, [stampEnd], () => red);
		expect(thumb!.world.actors["a:rel:b0"]!.pose).toBe("thumb");
		expect(thumb!.world.actors["a:rel:b0"]!.spot).toBe(STATION("test"));
		const [home] = run(s, [stampEnd + duration(POSE.thumb!.frames)], () => red);
		expect(home!.world.actors["a:rel:b0"]!.spot).toMatch(/^crew:/);
	});

	test("a lead on its rounds never visits an empty bench", () => {
		const crew = (t: number) => six(["Read", "Read", "Read", "Read", "Read", "Read"], T0).map((a) => ({ ...a, lastWriteAt: t }));
		const s = stage();
		let visits = 0;
		for (let t = T0; t < T0 + 2 * RULES.foremanEveryMs; t += SEC) {
			const d = s.step(snap(t, [release(crew(t))]));
			const spot = d.world.actors["s:rel"]!.spot;
			if (!spot.startsWith("visit:")) continue;
			visits++;
			expect(d.world.actors[spot.slice(6)]!.trip).toBeUndefined();
		}
		expect(visits).toBeGreaterThan(0);
	});

	test("the same snapshots always give the same trips", () => {
		const play = () => {
			const s = stage();
			const out: unknown[] = [];
			const tools = ["Read", "Grep", "Edit", "Read", "Grep", "Read"];
			for (let i = 0; i < 40; i++) {
				const at = T0 + i * 1500;
				const crew = six(tools.map((t, k) => ((i + k) % 9 < 5 ? t : "Edit")), at);
				const d = s.step(snap(at, [release(crew)]));
				out.push(d.events.filter((e) => e.type === "trip" || e.type === "walk"));
			}
			return out;
		};
		const a = play();
		expect(play()).toEqual(a);
		expect(JSON.stringify(a)).toContain('"type":"trip"');
	});
});

describe("pace", () => {
	test("stroll, jog, run: from the tool rate when the snapshot has it, else from a recent write", () => {
		const rate = (calls: number) => ({ calls, errors: 0, windowMs: 60_000 });
		expect(paceOf(undefined, undefined, T0).name).toBe("stroll");
		expect(paceOf(undefined, T0 - 5 * SEC, T0).name).toBe("jog");
		expect(paceOf(undefined, T0 - MIN, T0).name).toBe("stroll");
		expect(paceOf(rate(2), T0 - MIN, T0).name).toBe("stroll");
		expect(paceOf(rate(PACE.jogPerMin), T0 - MIN, T0).name).toBe("jog");
		expect(paceOf(rate(PACE.jogPerMin), T0 - SEC, T0).name).toBe("run");
		expect(paceOf(rate(PACE.runPerMin), undefined, T0).name).toBe("run");
		expect(paceOf(rate(PACE.runPerMin), undefined, T0).speed).toBeGreaterThan(paceOf(rate(PACE.jogPerMin), undefined, T0).speed);
	});

	test("a hot crew member gets there sooner, and its steps quicken to match", () => {
		const trip = (tools?: { calls: number; errors: number; windowMs: number }) => {
			const s = stage();
			const crew = [builder("b0", "Read", T0 - 5 * MIN, { lastWriteAt: T0 - 5 * MIN, ...(tools ? { tools } : {}) })];
			s.step(snap(T0, [release(crew)]));
			const a = s.step(snap(T0 + TRIP.holdMs, [release(crew)])).world.actors["a:rel:b0"]!;
			return { ms: a.walk!.ms, cue: cueFor(a, T0 + TRIP.holdMs) };
		};
		const calm = trip();
		const hot = trip({ calls: 30, errors: 0, windowMs: 60_000 });
		expect(hot.ms).toBeLessThan(calm.ms);
		expect(Math.abs(hot.ms * PACE.speed.run - calm.ms)).toBeLessThan(5);
		expect(calm.cue.walkTempo).toBeUndefined();
		expect(hot.cue.walkTempo).toBe(PACE.speed.run);
	});

	test("the brick-run cooldown shrinks with the edit rate, to no less than 40%", () => {
		const calm = runCooldown("rel");
		expect(runCooldown("rel", RUNS.calmPerMin)).toBe(calm);
		expect(runCooldown("rel", 12)).toBeLessThan(calm);
		expect(runCooldown("rel", 200)).toBe(Math.round(calm * RUNS.floor));
		expect(editRate([T0 - 2 * MIN, T0 - 30 * SEC, T0 - SEC, T0 + SEC], T0)).toBe(2);
	});

	test("the build remembers its recent edits", () => {
		const s = stage();
		let crew = six(["Read", "Read"]);
		s.step(snap(T0, [release(crew)]));
		for (let i = 1; i <= 5; i++) {
			crew = structuredClone(crew);
			crew[1]!.activity = { tool: "Edit", at: T0 + i * SEC };
			s.step(snap(T0 + i * SEC, [release(crew)]));
		}
		const d = s.step(snap(T0 + 6 * SEC, [release(crew)]));
		expect(editRate(d.world.builds.rel!.edits, T0 + 6 * SEC)).toBe(5);
	});
});
