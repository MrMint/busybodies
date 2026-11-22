// A busy crew, directed: builders act out the tool in hand at their own pace, look up when a
// teammate's test goes red, the lead walks its rounds, and the crew's build grows on the desk.
import { describe, expect, test } from "bun:test";
import { RULES, cueFor, direct, runCooldown } from "../src/scene/director/direct";
import type { World } from "../src/scene/director/types";
import { WORK, WORK_POSE, nextWork, tempo, workKind } from "../src/scene/director/work";
import { FloorPlan } from "../src/scene/office/layout";
import { crewSpots } from "../src/scene/office/world";
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
		const a = later.world.actors["a:rel:b0"]!;
		expect(a.pose).toBe("rummage");
		// Coasting: same pose, slower, same cue key.
		const cold = s.step(snap(T0 + 3 * MIN, [release([builder("b0", "Grep", T0 + 2 * SEC)])]));
		const b = cold.world.actors["a:rel:b0"]!;
		expect(b.pose).toBe("rummage");
		expect(b.tempo).toBeLessThan(a.tempo);
		expect(cueFor(b, T0 + 3 * MIN).key).toBe(cueFor(a, T0 + WORK.holdMs).key);
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
		for (const i of [1, 2, 3, 4, 5]) expect(d.world.actors[`a:rel:b${i}`]!.pose).toBe("glance");
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
		expect(d.world.actors["a:rel:b0"]!.pose).toBe("glance");
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

