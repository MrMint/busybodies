// A busy room turns hectic (plan-next stream C, wave 2): rush, dodges, hand-offs, the copier feud,
// the phone and the outbox. Every project, task and person is invented.
import { describe, expect, test } from "bun:test";
import { cueFor, direct } from "../src/scene/director/direct";
import { COPIER_FEUD } from "../src/scene/director/direct/builds";
import { DODGE, closest, dodges } from "../src/scene/director/dodge";
import { HANDOFF, MAIL } from "../src/scene/director/handoff";
import { PACE } from "../src/scene/director/pace";
import { RUSH, heatOf, nextDash, nextRush } from "../src/scene/director/rush";
import { STATION_POSE } from "../src/scene/world/stations";
import { TRIP } from "../src/scene/director/trips";
import type { World, WorldEvent } from "../src/scene/director/types";
import { demo, releaseDay } from "../src/mainview/demo";
import { FloorPlan } from "../src/scene/world/layout";
import { STATIONS_BASE } from "../src/scene/world/world";
import { POSE, duration } from "../src/scene/rig/data/poses";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

const T0 = Date.UTC(2026, 10, 19, 14, 0);
const SEC = 1000;
const MIN = 60 * SEC;
const rate = (calls: number) => ({ calls, errors: 0, windowMs: 60_000 });

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
const STATION = (kind: string, n = 0) => `station:room:teapot:${kind}:${n}`;

describe("rush", () => {
	test("heat is tool calls a minute across the crew, plus edits", () => {
		const s = release([builder("a", "Edit", T0, { tools: rate(30) }), builder("b", "Read", T0, { tools: rate(20), children: [builder("c", "Read", T0, { tools: rate(10) })] })], { tools: rate(6) });
		expect(heatOf(s, undefined, T0)).toBe(66);
		expect(heatOf(s, [T0 - 2 * MIN, T0 - 10 * SEC, T0 - SEC], T0)).toBe(66 + 2 * RUSH.editWeight);
		// A finished crew member's rate doesn't count.
		expect(heatOf(release([builder("a", "Edit", T0, { tools: rate(30), status: "finished" })]), undefined, T0)).toBe(0);
	});

	test("on at the high line, off only below the low one and never in its first seconds", () => {
		expect(nextRush(undefined, RUSH.onHeat - 1, T0)).toBeUndefined();
		const on = nextRush(undefined, RUSH.onHeat, T0)!;
		expect(on).toMatchObject({ since: T0 });
		// Between the lines it stays on; below the low line, only once it has lasted minMs.
		expect(nextRush(on, RUSH.offHeat, T0 + MIN)).toBeDefined();
		expect(nextRush(on, 0, T0 + RUSH.minMs - 1)).toBeDefined();
		expect(nextRush(on, RUSH.offHeat - 1, T0 + RUSH.minMs)).toBeUndefined();
		// And off, between the lines, it stays off.
		expect(nextRush(undefined, RUSH.onHeat - 1, T0 + MIN)).toBeUndefined();
	});

	test("a heat wobbling across one line never flickers the rush", () => {
		const s = stage();
		const changes: WorldEvent[] = [];
		for (let i = 0; i < 40; i++) {
			// Six crew at 16 a minute (96), then wobbling between 11 and 14 (66-84): in the band.
			const calls = i < 2 ? 16 : i % 2 ? 11 : 14;
			const crew = Array.from({ length: 6 }, (_, k) => builder(`b${k}`, "Grep", T0, { tools: rate(calls) }));
			changes.push(...s.step(snap(T0 + i * 2 * SEC, [release(crew)])).events.filter((e) => e.type === "rush"));
		}
		expect(changes).toEqual([{ type: "rush", session: "rel", at: T0, state: "start", heat: 96 }]);
		// Cooling below the low line ends it.
		const cold = Array.from({ length: 6 }, (_, k) => builder(`b${k}`, "Grep", T0, { tools: rate(2) }));
		const end = s.step(snap(T0 + 90 * SEC, [release(cold)]));
		expect(end.events.filter((e) => e.type === "rush")).toEqual([{ type: "rush", session: "rel", at: T0 + 90 * SEC, state: "end", heat: 12 }]);
		expect(end.world.rush).toBeUndefined();
	});

	test("in a rush, trips set off sooner and every walk is a run with papers flying", () => {
		const hot = (_t: number) => [builder("b0", "Read", T0, { tools: rate(60), lastWriteAt: T0 - 5 * MIN }), builder("b1", "Edit", T0 - 5 * MIN, { tools: rate(40), lastWriteAt: T0 - 5 * MIN })];
		const s = stage();
		s.step(snap(T0, [release(hot(T0))]));
		const d = s.step(snap(T0 + RUSH.tripHoldMs, [release(hot(T0 + RUSH.tripHoldMs))]));
		const b0 = d.world.actors["a:rel:b0"]!;
		expect(RUSH.tripHoldMs).toBeLessThan(TRIP.holdMs);
		expect(b0.spot).toBe(STATION("reference"));
		expect(b0.walkPose).toBe(RUSH.walkPose);
		expect(b0.pace).toBe("run");
		const cue = cueFor(b0, T0 + RUSH.tripHoldMs);
		expect(cue.walkPose).toBe("rushRun");
		expect(cue.walkTempo).toBe(PACE.speed.run);
		// The same crew, calm: it waits out the whole hold, and strolls.
		const calm = (t: number) => hot(t).map((a) => ({ ...a, tools: rate(1) }));
		const c = stage();
		c.step(snap(T0, [release(calm(T0))]));
		expect(c.step(snap(T0 + RUSH.tripHoldMs, [release(calm(T0))])).world.actors["a:rel:b0"]!.spot).toMatch(/^crew:/);
		const go = c.step(snap(T0 + TRIP.holdMs, [release(calm(T0))])).world.actors["a:rel:b0"]!;
		expect(go.spot).toBe(STATION("reference"));
		expect(go.walkPose).toBeUndefined();
	});

	test("the lead's rounds become dashes: to whoever just went red, then whoever has queued longest", () => {
		const r = nextRush(undefined, 100, T0)!;
		const cands = [
			{ key: "q1", queuedSince: T0 - 20 * SEC },
			{ key: "q2", queuedSince: T0 - 30 * SEC },
			{ key: "red", failAt: T0 - SEC },
		];
		const present = new Set(cands.map((c) => c.key));
		const a = nextDash(r, cands, present, T0);
		expect(a.dash).toEqual({ key: "red", since: T0 });
		// It stays a while, then the one queued longest, then the other; then nobody new: no dash.
		expect(nextDash(a, cands, present, T0 + RUSH.dashStayMs - 1).dash?.key).toBe("red");
		const b = nextDash(a, cands, present, T0 + RUSH.dashStayMs);
		expect(b.dash?.key).toBe("q2");
		const c = nextDash(b, cands, present, T0 + 2 * RUSH.dashStayMs);
		expect(c.dash?.key).toBe("q1");
		expect(nextDash(c, cands, present, T0 + 3 * RUSH.dashStayMs).dash).toBeUndefined();
	});

	test("in the director, a rushing lead dashes to a red test at the stamp desk", () => {
		const crew = (t: number) => [
			builder("b0", "Bash", T0, {
				tools: rate(60),
				running: { tool: "Bash", since: T0, kind: "test" },
				...(t >= T0 + 8 * SEC ? { commands: { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at: T0 + 8 * SEC } } } : {}),
			}),
			builder("b1", "Edit", T0, { tools: rate(60) }),
		];
		const s = stage();
		// Its own last call is recent, so no ordinary round: only news sends it.
		const lead = { activity: { tool: "Edit", at: T0 + 7 * SEC }, running: undefined };
		for (const t of [T0, T0 + 4 * SEC]) s.step(snap(t, [release(crew(t), lead)]));
		const d = s.step(snap(T0 + 8 * SEC, [release(crew(T0 + 8 * SEC), lead)]));
		const l = d.world.actors["s:rel"]!;
		expect(l.spot).toBe("dash:a:rel:b0");
		expect(l.pose).toBe("inspect");
		expect(l.walkPose).toBe(RUSH.walkPose);
		expect(d.world.rush!.rel!.dash).toEqual({ key: "a:rel:b0", since: T0 + 8 * SEC });
		const back = s.step(snap(T0 + 8 * SEC + RUSH.dashStayMs, [release(crew(T0 + 8 * SEC), lead)]));
		expect(back.world.actors["s:rel"]!.spot).toBe("desk");
	});

	test("a brick run comes round quicker in a rush", () => {
		const run = (calls: number) => {
			const s = stage();
			const starts: number[] = [];
			for (let i = 0; i < 40; i++) {
				const at = T0 + i * SEC;
				const crew = [builder("b0", "Edit", at, { tools: rate(calls) }), builder("b1", "Edit", at, { tools: rate(calls) })];
				for (const e of s.step(snap(at, [release(crew)])).events) if (e.type === "build" && e.change === "carry") starts.push(e.at);
			}
			return starts;
		};
		const calm = run(1);
		const hot = run(60);
		expect(hot.length).toBeGreaterThan(calm.length);
	});
});

describe("dodges", () => {
	const cross = () => [
		{ key: "a", area: "room", walk: { path: [{ x: 0, y: 100 }, { x: 200, y: 100 }], ms: 2000, since: T0 }, free: true },
		{ key: "b", area: "room", walk: { path: [{ x: 100, y: 0 }, { x: 100, y: 200 }], ms: 2000, since: T0 }, free: true },
	];

	test("two walkers crossing at the same moment: one sidesteps, and they never pass through", () => {
		const [a, b] = cross();
		expect(closest(a!.walk, b!.walk).d).toBeLessThan(DODGE.near);
		const out = dodges(cross());
		expect([...out.keys()]).toEqual(["a"]);
		const d = out.get("a")!;
		expect(d.from).toBe("b");
		expect(d.walk.path.length).toBeGreaterThan(a!.walk.path.length);
		expect(closest(d.walk, b!.walk).d).toBeGreaterThanOrEqual(DODGE.near);
		// It keeps its speed: the detour takes a little longer.
		expect(d.walk.ms).toBeGreaterThan(a!.walk.ms);
		// Deterministic.
		expect(dodges(cross())).toEqual(out);
	});

	test("head on, the same: one steps aside", () => {
		const walkers = [
			{ key: "a", area: "room", walk: { path: [{ x: 0, y: 100 }, { x: 300, y: 100 }], ms: 2000, since: T0 }, free: true },
			{ key: "b", area: "room", walk: { path: [{ x: 300, y: 100 }, { x: 0, y: 100 }], ms: 2000, since: T0 }, free: true },
		];
		const out = dodges(walkers);
		expect(out.size).toBe(1);
		expect(closest(out.get("a")!.walk, walkers[1]!.walk).d).toBeGreaterThanOrEqual(DODGE.near);
	});

	test("only walkers in the same area, at the same moment, and only free ones change", () => {
		const other = cross().map((w, i) => (i ? { ...w, area: "elsewhere" } : w));
		expect(dodges(other).size).toBe(0);
		const later = cross().map((w, i) => (i ? { ...w, walk: { ...w.walk, since: T0 + 5000 } } : w));
		expect(dodges(later).size).toBe(0);
		const fixed = cross().map((w) => ({ ...w, free: w.key === "b" }));
		expect([...dodges(fixed).keys()]).toEqual(["b"]);
		expect(dodges(cross().map((w) => ({ ...w, free: false }))).size).toBe(0);
	});
});

describe("hand-offs", () => {
	test("back from the filing cabinet, a crew member hands its folder to a teammate, who skips the trip", () => {
		const s = stage();
		// b0 reads from the start; b1 edits, then wants to read just as b0 goes back to writing.
		const crew = (t: number) => [
			builder("b0", t < T0 + 20 * SEC ? "Read" : "Edit", t < T0 + 20 * SEC ? T0 : T0 + 20 * SEC),
			builder("b1", t < T0 + 20 * SEC ? "Edit" : "Read", t < T0 + 20 * SEC ? T0 : T0 + 20 * SEC),
		];
		for (const t of [T0, T0 + TRIP.holdMs, T0 + 12 * SEC]) s.step(snap(t, [release(crew(t))]));
		const d = s.step(snap(T0 + 20 * SEC, [release(crew(T0 + 20 * SEC))]));
		const giver = d.world.actors["a:rel:b0"]!;
		const taker = d.world.actors["a:rel:b1"]!;
		expect(d.events).toContainEqual({ type: "handoff", key: "a:rel:b0", at: T0 + 20 * SEC, to: "a:rel:b1", kind: "reference" });
		expect(giver.spot).toBe("handoff:a:rel:b1");
		expect(giver.home).toMatch(/^crew:/);
		expect(giver).toMatchObject({ pose: HANDOFF.pose, as: "lead", poseSince: T0 + 20 * SEC });
		// It walks over and stands facing the taker.
		expect(giver.walk).toBeDefined();
		expect(giver.slot.facing).toBe(taker.slot.facing === 1 ? -1 : 1);
		expect(Math.sign(giver.slot.x - taker.slot.x)).toBe(taker.slot.facing);
		const h = d.world.handoffs!["a:rel:b0"]!;
		expect(h.meets).toBe(T0 + 20 * SEC + giver.walk!.ms);
		// The taker's part starts when the giver gets there.
		expect(taker.pose).not.toBe(HANDOFF.pose);
		expect(d.wake).toBeLessThanOrEqual(h.meets);
		const meet = s.step(snap(h.meets, [release(crew(h.meets))]));
		expect(meet.world.actors["a:rel:b1"]).toMatchObject({ pose: HANDOFF.pose, as: "partner", poseSince: h.meets, spot: taker.spot });
		expect(meet.world.actors["a:rel:b0"]!.spot).toBe("handoff:a:rel:b1");
		// Done: the giver walks home; the taker keeps reading at its bench, past any hold.
		const done = s.step(snap(h.done, [release(crew(h.done))]));
		expect(done.world.actors["a:rel:b0"]!.spot).toBe(giver.home!);
		for (const t of [h.done, T0 + 40 * SEC, T0 + 60 * SEC]) {
			const a = s.step(snap(t, [release(crew(t))])).world.actors["a:rel:b1"]!;
			expect(a.trip).toBeUndefined();
			expect(a.spot).toBe(taker.spot);
			expect(a.handed).toBe(T0 + 20 * SEC);
		}
	});

	test("a teammate who isn't about to need that station gets nothing, and nobody hands over a copier", () => {
		const s = stage();
		const crew = (t: number) => [builder("b0", t < T0 + 20 * SEC ? "Read" : "Edit", t < T0 + 20 * SEC ? T0 : T0 + 20 * SEC), builder("b1", "Grep", T0)];
		for (const t of [T0, T0 + TRIP.holdMs]) s.step(snap(t, [release(crew(t))]));
		const d = s.step(snap(T0 + 20 * SEC, [release(crew(T0 + 20 * SEC))]));
		expect(d.events.some((e) => e.type === "handoff")).toBe(false);
		expect(d.world.actors["a:rel:b0"]!.spot).toMatch(/^crew:/);
		expect(HANDOFF.kinds).not.toContain("build");
	});
});

describe("stations, wave 2", () => {
	test("the strip has the phone and the outbox right after the first four", () => {
		expect(STATIONS_BASE).toEqual(["build", "test", "reference", "search", "web", "outbox"]);
		const floor = new FloorPlan().update(snap(T0, [release([])]));
		const room = floor.areas.find((a) => a.id === "room:teapot")!;
		expect(room.stations.map((st) => st.kind)).toEqual(STATIONS_BASE);
		expect(room.fixtures.some((f) => f.kind === "phone")).toBe(true);
		expect(room.fixtures.some((f) => f.kind === "outbox")).toBe(true);
	});

	test("a held web search walks to the phone", () => {
		const s = stage();
		const crew = () => [builder("b0", "WebSearch", T0)];
		s.step(snap(T0, [release(crew())]));
		const a = s.step(snap(T0 + TRIP.holdMs, [release(crew())])).world.actors["a:rel:b0"]!;
		expect(a.spot).toBe(STATION("web"));
		expect(a.pose).toBe(STATION_POSE.web.work);
	});

	test("a PR: the lead walks the envelope to the outbox, drops it in, walks back and celebrates", () => {
		const s = stage();
		const crew = [builder("b0", "Edit", T0)];
		const pr = [{ number: 5, url: "https://example.invalid/pull/5", at: T0 + SEC }];
		s.step(snap(T0, [release(crew)]));
		const d = s.step(snap(T0 + SEC, [release(crew, { prs: pr })]));
		const lead = d.world.actors["s:rel"]!;
		expect(lead.spot).toBe(STATION("outbox"));
		expect(lead).toMatchObject({ pose: MAIL.pose, walkPose: MAIL.walkPose });
		expect(cueFor(lead, T0 + SEC)).toMatchObject({ walkPose: "envelopeCarry", pose: "mailDrop" });
		expect(d.events).toContainEqual({ type: "trip", key: "s:rel", at: T0 + SEC, station: "room:teapot:outbox:0", state: "start" });
		// The build gets its flag at once; the crew doesn't celebrate yet.
		expect(d.world.builds.rel!.topped).toBe(true);
		expect(d.world.actors["a:rel:b0"]!.pose).not.toBe("celebrate");
		const m = d.world.mail!.rel!;
		expect(m.drops).toBe(T0 + SEC + lead.walk!.ms + duration(POSE[MAIL.pose]!.frames));
		const back = s.step(snap(m.drops, [release(crew, { prs: pr })]));
		const l = back.world.actors["s:rel"]!;
		expect(l.spot).toBe("desk");
		expect(l).toMatchObject({ pose: "celebrate", as: "lead", poseSince: m.drops });
		expect(l.walkPose).toBeUndefined();
		const mb = back.world.mail!.rel!;
		expect(mb.back).toBe(m.drops + l.walk!.ms);
		const home = s.step(snap(mb.back!, [release(crew, { prs: pr })]));
		expect(home.world.actors["a:rel:b0"]).toMatchObject({ pose: "celebrate", as: "partner", poseSince: mb.back });
		// Over: no mail left, and the same PR never sends it again.
		const after = s.step(snap(mb.back! + 20 * SEC, [release(crew, { prs: pr })]));
		expect(after.world.mail).toBeUndefined();
		expect(after.world.actors["s:rel"]!.spot).not.toBe(STATION("outbox"));
	});
});

describe("?demo=release", () => {
	test("shows a rush, dodges, a hand-off, the copier feud and a PR walked to the outbox within ~35 s", () => {
		const plan = new FloorPlan();
		let world: World | undefined;
		let cur = demo("release").snapshot;
		const t0 = cur.at;
		const events: WorldEvent[] = [];
		let wake: number | undefined;
		const step = (s: Snapshot, now: number) => {
			const d = direct(world, s, now, plan.update(s));
			world = d.world;
			wake = d.wake;
			events.push(...d.events);
			// Every dodge keeps the two apart.
			for (const e of d.events) {
				if (e.type !== "dodge") continue;
				const a = d.world.actors[e.key]!.walk!;
				const b = d.world.actors[e.from]!.walk!;
				expect(closest(a, b).d).toBeGreaterThanOrEqual(DODGE.near);
			}
		};
		step(cur, t0);
		for (const b of releaseDay()) {
			let guard = 0;
			while (wake !== undefined && wake < t0 + b.after && guard++ < 500) step(cur, wake);
			cur = b.snapshot;
			step(cur, t0 + b.after);
		}
		const by = (ms: number) => events.filter((e) => e.at <= t0 + ms);
		expect(by(10_000).some((e) => e.type === "rush" && e.state === "start")).toBe(true);
		expect(by(10_000).some((e) => e.type === "pose" && e.pose === COPIER_FEUD)).toBe(true);
		expect(by(30_000).some((e) => e.type === "dodge")).toBe(true);
		expect(by(30_000).some((e) => e.type === "handoff")).toBe(true);
		expect(by(30_000).some((e) => e.type === "trip" && e.station.endsWith(":web:0"))).toBe(true);
		expect(by(35_000).some((e) => e.type === "trip" && e.station.endsWith(":outbox:0") && e.state === "start")).toBe(true);
		expect(by(36_000).some((e) => e.type === "pose" && e.pose === "celebrate")).toBe(true);
		expect(events.some((e) => e.type === "rush" && e.state === "end")).toBe(true);
	});
});
