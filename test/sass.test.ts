// The sass module: the line bank against the design board, every detector against invented
// snapshots, the scheduler's limits and cooldowns, and the signs. Every project, title and id
// here is made up.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, Session, Snapshot } from "../src/watcher/model";
import {
	BOARD_LINES,
	Counters,
	LINES,
	NEW_LINES,
	Sass,
	Scheduler,
	TRIGGERS,
	type Trigger,
	type TriggerKind,
	bubbleMs,
	detect,
	fill,
	fitting,
	utcClock,
	utcDay,
	utcHour,
} from "../src/scene/sass";

const MIN = 60_000;
const NOW = Date.parse("2030-04-01T12:00:00Z");
const OPTS = { hour: utcHour, clock: utcClock, day: utcDay };

const session = (id: string, o: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: `Polish the ${id}`,
	cwd: `/work/${o.project ?? "teapot"}`,
	project: "teapot",
	origin: "cli",
	state: "busy",
	stateSince: NOW - MIN,
	startedAt: NOW - 60 * MIN,
	activity: { tool: "Edit", at: NOW - 10_000 },
	agents: [],
	children: [],
	...o,
});
const agent = (id: string, o: Partial<Agent> = {}): Agent => ({
	id,
	role: "general-purpose",
	task: "Find the kettle",
	depth: 1,
	status: "running",
	lastWriteAt: NOW - 10_000,
	children: [],
	...o,
});
const snap = (...sessions: Session[]): Snapshot => ({ at: NOW, sessions });
const kinds = (ts: Trigger[]) => ts.map((t) => t.kind);
const only = (ts: Trigger[], k: TriggerKind) => ts.filter((t) => t.kind === k);

describe("the line bank", () => {
	const html = readFileSync(join(import.meta.dir, "../design/boards/Lines.dc.html"), "utf8");
	const KIND: Record<string, string> = { "": "said", t: "thought", s: "sign" };
	const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
	const onBoard = [...html.matchAll(/<p class="(t|s|)">(.*?)(?: <small>(.*?)<\/small>)?<\/p>/g)].map((m) => ({
		kind: KIND[m[1]!]!,
		text: unescape(m[2]!),
		note: unescape(m[3] ?? ""),
	}));

	test("holds every line of the design board, word for word, and no more", () => {
		const claimed = Number(/(\d+) lines, grouped/.exec(html)?.[1]);
		expect(onBoard.length).toBe(claimed);
		expect(BOARD_LINES.length).toBe(claimed);
		const ours = BOARD_LINES.map((l) => `${l.kind}|${l.boardText ?? l.text}|${l.note}`).sort();
		expect(ours).toEqual(onBoard.map((l) => `${l.kind}|${l.text}|${l.note}`).sort());
		expect(LINES.filter((l) => l.board).length).toBe(claimed);
	});

	test("a templated board line fills back to the board's wording", () => {
		for (const l of BOARD_LINES.filter((x) => x.boardText)) {
			const vars = Object.fromEntries([...l.text.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], "X"]));
			const pattern = new RegExp(`^${fill(l.text, vars)!.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/X/g, ".+")}$`);
			expect(l.boardText!).toMatch(pattern);
		}
	});

	test("is big enough: 150+ lines, 5+ for every trigger", () => {
		expect(LINES.length).toBeGreaterThanOrEqual(150);
		for (const t of TRIGGERS) expect([t, LINES.filter((l) => l.trigger === t).length >= 5]).toEqual([t, true]);
	});

	test("keeps to the voice rules it can check", () => {
		const banned = /\b(claude|anthropic|openai|gpt|gemini|copilot|cursor|github|slack|google|apple|microsoft|stupid|idiot|dumb|hate you|damn|hell|crap)\b/i;
		for (const l of NEW_LINES) expect(`${l.text} ${l.note}`).not.toMatch(banned);
		const texts = LINES.map((l) => l.text);
		expect(new Set(texts).size).toBe(texts.length);
		for (const l of LINES) {
			if (l.kind === "sign") expect(l.place).toBeDefined();
			if (l.min !== undefined && l.max !== undefined) expect(l.min).toBeLessThan(l.max);
		}
	});
});

describe("detect", () => {
	test("nothing happening finds nothing", () => {
		const s = snap(session("a"));
		expect(detect(s, s, NOW, OPTS)).toEqual([]);
	});

	test("waiting on you, with the wait in minutes and the same key all wait long", () => {
		const s = snap(session("a", { waiting: { reason: "permission", since: NOW - 12 * MIN, source: "hook" } }));
		const [w] = only(detect(undefined, s, NOW, OPTS), "waiting");
		expect(w).toMatchObject({ who: "a", role: "lead", magnitude: 12, ongoing: true, tag: "permission", vars: { min: 12 } });
		expect(only(detect(s, s, NOW + 5 * MIN, OPTS), "waiting")[0]).toMatchObject({ key: w!.key, magnitude: 17 });
	});

	test("a failed test, a fail streak, retries, and a teammate's reactions", () => {
		const cmd = (exitCode: number, failStreak: number, repeats: number, at: number) => ({
			last: { kind: "test" as const, exitCode, at },
			failStreak,
			repeats,
			failed: failStreak,
			testsFailed: failStreak,
		});
		const before = snap(session("a", { commands: cmd(1, 2, 2, NOW - 30_000), agents: [agent("b")] }));
		const after = snap(session("a", { commands: cmd(1, 3, 3, NOW - 1_000), agents: [agent("b")] }));
		const ts = detect(before, after, NOW, OPTS);
		expect(only(ts, "testFailed")[0]).toMatchObject({ who: "a", magnitude: 3, ongoing: false });
		expect(only(ts, "retry")[0]).toMatchObject({ magnitude: 3 });
		expect(only(ts, "reaction")[0]).toMatchObject({ who: "b", tag: "red" });
		// The same last command again is no new event.
		expect(detect(after, after, NOW, OPTS)).toEqual([]);
		// Green after red: high five from the teammate.
		const green = snap(session("a", { commands: cmd(0, 0, 1, NOW), agents: [agent("b")] }));
		expect(only(detect(after, green, NOW, OPTS), "reaction")[0]).toMatchObject({ who: "b", tag: "green" });
	});

	test("an old failure on the first snapshot isn't news; a fresh one is", () => {
		const c = (at: number) => ({ last: { kind: "test" as const, exitCode: 1, at }, failStreak: 1, repeats: 1, failed: 1, testsFailed: 1 });
		expect(kinds(detect(undefined, snap(session("a", { commands: c(NOW - 10 * MIN) })), NOW, OPTS))).not.toContain("testFailed");
		expect(kinds(detect(undefined, snap(session("a", { commands: c(NOW - 5_000) })), NOW, OPTS))).toContain("testFailed");
	});

	test("API retries, and running out of them is a crash", () => {
		const a = session("a", { apiRetry: { attempt: 2, max: 10, at: NOW - 1000 } });
		expect(only(detect(snap(session("a")), snap(a), NOW, OPTS), "apiRetry")[0]).toMatchObject({ magnitude: 2, vars: { n: 2 } });
		const out = session("a", { apiRetry: { attempt: 10, max: 10, at: NOW - 500 } });
		expect(kinds(detect(snap(a), snap(out), NOW, OPTS))).toContain("crashed");
	});

	test("a long build, for the lead or for crew, from 20 minutes", () => {
		const s = snap(
			session("a", {
				running: { tool: "Bash", since: NOW - 25 * MIN, kind: "build" },
				agents: [agent("b", { running: { tool: "Bash", since: NOW - 19 * MIN, kind: "test" } }), agent("c", { running: { tool: "Bash", since: NOW - 41 * MIN, kind: "build" } })],
			}),
		);
		const builds = only(detect(s, s, NOW, OPTS), "longBuild");
		expect(builds.map((b) => [b.who, b.magnitude])).toEqual([
			["a", 25],
			["c", 41],
		]);
		expect(builds[0]!.vars.time).toBe(utcClock(NOW - 25 * MIN));
	});

	test("a PR opened, with the count, the crew tag and a teammate's eye roll", () => {
		const crew = [agent("b"), agent("c")];
		const before = snap(session("a", { prs: [{ number: 7, url: "u7" }], agents: crew }));
		const after = snap(session("a", { prs: [{ number: 7, url: "u7" }, { number: 8, url: "u8", at: NOW }], agents: crew }));
		const ts = detect(before, after, NOW, OPTS);
		expect(only(ts, "prOpened")).toHaveLength(1);
		expect(only(ts, "prOpened")[0]).toMatchObject({ magnitude: 2, tag: "crew", vars: { n: 8, count: 2 } });
		expect(only(ts, "reaction")[0]).toMatchObject({ who: "b", tag: "pr" });
		// On the first snapshot, only a recent PR is news.
		expect(kinds(detect(undefined, before, NOW, OPTS))).not.toContain("prOpened");
	});

	test("compaction", () => {
		const a = session("a", { compactions: { count: 1, lastAt: NOW - 2 * MIN } });
		const b = session("a", { compactions: { count: 2, lastAt: NOW } });
		expect(only(detect(snap(a), snap(b), NOW, OPTS), "compacting")[0]).toMatchObject({ magnitude: 2 });
		expect(kinds(detect(snap(b), snap(b), NOW, OPTS))).not.toContain("compacting");
	});

	test("cost milestones, one per new whole cup", () => {
		const at = (outputTokens: number, usd?: number) => snap(session("a", { cost: { outputTokens, usd } }));
		expect(only(detect(at(90_000), at(210_000), NOW, OPTS), "bill")[0]).toMatchObject({ magnitude: 2, vars: { n: 2 } });
		expect(kinds(detect(at(210_000), at(260_000), NOW, OPTS))).not.toContain("bill");
		expect(only(detect(at(0, 39), at(0, 41), NOW, OPTS), "bill")[0]).toMatchObject({ magnitude: 5 });
	});

	test("idle a long time, a busy teammate's side-eye, and waking up", () => {
		const idle = session("a", { state: "idle", stateSince: NOW - 31 * MIN });
		const busy = session("z", { project: "teapot" });
		const ts = detect(snap(idle, busy), snap(idle, busy), NOW, OPTS);
		expect(only(ts, "idle")[0]).toMatchObject({ who: "a", magnitude: 31, ongoing: true });
		expect(only(ts, "reaction")[0]).toMatchObject({ who: "z", tag: "slacker" });
		// A turn that just ended isn't idle yet.
		expect(kinds(detect(undefined, snap(session("a", { state: "idle", stateSince: NOW - MIN })), NOW, OPTS))).toEqual([]);
		const woke = session("a", { state: "busy", stateSince: NOW });
		expect(only(detect(snap(idle), snap(woke), NOW, OPTS), "woken")[0]).toMatchObject({ magnitude: 31 });
	});

	test("idle with a PR up is finished, still open", () => {
		const s = snap(session("a", { state: "idle", stateSince: NOW - 4 * MIN, prs: [{ number: 3, url: "u" }] }));
		expect(only(detect(s, s, NOW, OPTS), "finished")[0]).toMatchObject({ tag: "pr", vars: { time: utcClock(NOW - 4 * MIN) } });
	});

	test("a big crew spawned at once, or one hire at a time with its depth", () => {
		const before = snap(session("a"));
		const four = snap(session("a", { agents: ["b", "c", "d", "e"].map((id) => agent(id)) }));
		expect(kinds(detect(before, four, NOW, OPTS))).toEqual(["bigCrew"]);
		const deep = snap(session("a", { agents: [agent("b", { children: [agent("c", { depth: 2, role: "Explore" })] })] }));
		const mid = snap(session("a", { agents: [agent("b")] }));
		expect(only(detect(mid, deep, NOW, OPTS), "hiring")[0]).toMatchObject({ who: "b", magnitude: 2 });
	});

	test("a stall: busy with no output, or an agent marked stalled", () => {
		const s = snap(session("a", { activity: { tool: "Edit", at: NOW - 9 * MIN }, stateSince: NOW - 20 * MIN, agents: [agent("b", { status: "stalled", lastWriteAt: NOW - 6 * MIN })] }));
		const ts = only(detect(s, s, NOW, OPTS), "stalled");
		expect(ts.map((t) => [t.who, t.magnitude])).toEqual([
			["a", 9],
			["b", 6],
		]);
	});

	test("busy a long stretch is frantic", () => {
		const s = snap(session("a", { stateSince: NOW - 22 * MIN }));
		expect(only(detect(s, s, NOW, OPTS), "busy")[0]).toMatchObject({ magnitude: 22 });
	});

	test("someone finished, a reviewer came back, someone was sent home, the coffee queue", () => {
		const roles = ["reviewer", "general-purpose", "Explore", "general-purpose"];
		const before = snap(session("a", { agents: roles.map((role, i) => agent(`x${i}`, { role })) }));
		const after = snap(session("a", { agents: roles.map((role, i) => agent(`x${i}`, { role, status: i === 3 ? "stopped" : "finished" })) }));
		const ts = detect(before, after, NOW, OPTS);
		expect(only(ts, "review")[0]).toMatchObject({ who: "x0", role: "reviewer", magnitude: 1 });
		expect(only(ts, "finished").map((t) => t.who)).toEqual(["x1", "x2"]);
		expect(only(ts, "paused")[0]).toMatchObject({ who: "x3" });
		expect(only(ts, "coffeeQueue")[0]).toMatchObject({ magnitude: 3, ongoing: true });
	});

	test("a session that vanishes mid-work crashed; a neighbour walks past the smoke", () => {
		const ts = detect(snap(session("a"), session("b")), snap(session("b")), NOW, OPTS);
		expect(only(ts, "crashed")[0]).toMatchObject({ who: "a" });
		expect(only(ts, "reaction")[0]).toMatchObject({ who: "b", tag: "crash" });
	});

	test("late at night, from the local clock", () => {
		const s = snap(session("a"));
		const at = Date.parse("2030-04-01T23:30:00Z");
		expect(only(detect(s, s, at, OPTS), "lateNight")[0]).toMatchObject({ magnitude: 23 });
		expect(only(detect(s, s, at, { ...OPTS, hour: () => 14 }), "lateNight")).toEqual([]);
	});

	test("side sessions count too", () => {
		const s = snap(session("a", { children: [session("k", { waiting: { reason: "question", since: NOW, source: "transcript" } })] }));
		expect(only(detect(s, s, NOW, OPTS), "waiting")[0]!.who).toBe("k");
	});
});

const trig = (o: Partial<Trigger> & { kind: TriggerKind; who: string }): Trigger => ({
	session: o.who,
	project: "teapot",
	role: "lead",
	magnitude: 0,
	key: `${o.kind}:${o.who}`,
	ongoing: false,
	vars: { name: "Polish the kettle" },
	...o,
});

describe("the scheduler", () => {
	const ZOOMED = { zoom: 2 };

	test("caps bubbles by zoom, and lets them in one at a time", () => {
		const ts = ["a", "b", "c", "d", "e", "f"].map((who) => trig({ kind: "prOpened", who, vars: { n: 1, count: 1 } }));
		const wide = new Scheduler({ gapMs: 0 });
		expect(wide.step(NOW, { zoom: 0.4, room: "teapot" }, ts).says).toHaveLength(2);
		const close = new Scheduler({ gapMs: 0 });
		expect(close.step(NOW, ZOOMED, ts).says).toHaveLength(4);
		const gapped = new Scheduler({ gapMs: 1500 });
		expect(gapped.step(NOW, ZOOMED, ts).says).toHaveLength(1);
		expect(gapped.nextWake(NOW)).toBe(NOW + 1500);
		expect(gapped.step(NOW + 1500, ZOOMED).says).toHaveLength(1);
	});

	test("at whole-office zoom only short lines show, unless the camera is on that room", () => {
		const t = trig({ kind: "waiting", who: "a", magnitude: 12, ongoing: true, vars: { min: 12 } });
		for (let i = 0; i < 20; i++) {
			const s = new Scheduler({ seed: i });
			for (const b of s.step(NOW, { zoom: 0.4 }, [t]).says) expect(b.text.length).toBeLessThanOrEqual(30);
		}
		const long = [...Array(40).keys()].flatMap((i) => new Scheduler({ seed: i }).step(NOW, { zoom: 0.4, room: "teapot" }, [t]).says).some((b) => b.text.length > 30);
		expect(long).toBe(true);
	});

	test("keeps a cooldown per character", () => {
		const s = new Scheduler({ gapMs: 0, cooldownMs: 45_000 });
		expect(s.step(NOW, ZOOMED, [trig({ kind: "prOpened", who: "a", key: "p1", vars: { n: 1 } })]).says).toHaveLength(1);
		expect(s.step(NOW + 10_000, ZOOMED, [trig({ kind: "testFailed", who: "a", key: "t1", magnitude: 1 })]).says).toHaveLength(0);
		// The event waits its turn, within its time to live.
		expect(s.step(NOW + 46_000, ZOOMED, []).says).toHaveLength(0);
		const s2 = new Scheduler({ gapMs: 0, cooldownMs: 20_000, eventTtlMs: 30_000 });
		s2.step(NOW, ZOOMED, [trig({ kind: "prOpened", who: "a", key: "p1", vars: { n: 1 } })]);
		s2.step(NOW + 10_000, ZOOMED, [trig({ kind: "testFailed", who: "a", key: "t1", magnitude: 1 })]);
		expect(s2.step(NOW + 21_000, ZOOMED).says.map((b) => b.trigger)).toEqual(["testFailed"]);
	});

	test("never repeats a line for the same character within the hour", () => {
		const s = new Scheduler({ gapMs: 0, cooldownMs: 0, anyoneRepeatMs: 0 });
		const said: string[] = [];
		const n = fitting(trig({ kind: "crashed", who: "a" }), "bubble").length;
		for (let i = 0; i < n + 3; i++) said.push(...s.step(NOW + i * 10_000, ZOOMED, [trig({ kind: "crashed", who: "a", key: `c${i}` })]).says.map((b) => b.text));
		expect(said.length).toBe(n);
		expect(new Set(said).size).toBe(n);
	});

	test("escalates waiting-on-you by the wait, and doesn't repeat a state that hasn't moved", () => {
		const s = new Scheduler({ gapMs: 0, cooldownMs: 30_000, againMs: 8 * MIN });
		const at = (min: number) => trig({ kind: "waiting", who: "a", key: "w", ongoing: true, magnitude: min, vars: { min } });
		const first = s.step(NOW, ZOOMED, [at(0)]).says;
		expect(first).toHaveLength(1);
		expect(first[0]!.line.min ?? 0).toBeLessThan(2);
		// Same tier a minute on: quiet.
		expect(s.step(NOW + MIN, ZOOMED, [at(1)]).says).toHaveLength(0);
		// Crossing the 2-minute tier: says it again, from that tier or higher.
		const second = s.step(NOW + 2 * MIN, ZOOMED, [at(2)]).says;
		expect(second).toHaveLength(1);
		expect(second[0]!.line.min).toBeGreaterThanOrEqual(2);
		const third = s.step(NOW + 10 * MIN, ZOOMED, [at(10)]).says;
		expect(third[0]!.line.min).toBeGreaterThanOrEqual(10);
	});

	test("is deterministic with a seed", () => {
		const run = (seed: number) => {
			const s = new Scheduler({ seed, gapMs: 0 });
			return ["a", "b", "c"].flatMap((who, i) => s.step(NOW + i * 1000, ZOOMED, [trig({ kind: "idle", who, magnitude: 12, ongoing: true, vars: { min: 12 } })]).says.map((b) => b.text));
		};
		expect(run(7)).toEqual(run(7));
		const seeds = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((x) => run(x).join("|")));
		expect(seeds.size).toBeGreaterThan(1);
	});

	test("goes quiet: no wake once bubbles end and nothing is waiting", () => {
		const s = new Scheduler({ gapMs: 0 });
		const [b] = s.step(NOW, ZOOMED, [trig({ kind: "prOpened", who: "a", vars: { n: 3 } })]).says;
		expect(b!.until).toBe(NOW + bubbleMs(b!.text));
		expect(s.nextWake(NOW)).toBe(b!.until);
		s.step(b!.until, ZOOMED, []);
		expect(s.nextWake(b!.until)).toBeUndefined();
	});

	test("an unfillable placeholder skips the line", () => {
		expect(fill("PR #{n}. Frame it.", {})).toBeUndefined();
		expect(fill("PR #{n}. Frame it.", { n: 12 })).toBe("PR #12. Frame it.");
		const s = new Scheduler({ gapMs: 0 });
		for (let i = 0; i < 10; i++) for (const b of s.step(NOW + i * MIN, ZOOMED, [trig({ kind: "prOpened", who: `w${i}`, key: `k${i}`, vars: {} })]).says) expect(b.text).not.toContain("{");
	});
});

describe("signs and gags", () => {
	test("days since a test broke, the fail streak, the PR tally, the coffee count", () => {
		const c = new Counters(OPTS);
		const cmd = (exitCode: number, failStreak: number, at: number, kind: "test" | "build" = "test") => ({ last: { kind, exitCode, at }, failStreak, repeats: 1, failed: 0, testsFailed: 0 });
		let out = c.update(snap(session("a", { commands: cmd(1, 1, NOW - MIN) })), NOW);
		expect(out.get("room:teapot:board")).toBe("Days since a test broke: 0");
		out = c.update(snap(session("a", { commands: cmd(1, 3, NOW) })), NOW);
		expect(out.get("room:teapot:board")).toBe("Fail streak: 3. New personal best.");
		out = c.update(snap(session("a", { commands: cmd(0, 0, NOW + 2 * 24 * 60 * MIN), prs: [{ number: 1, url: "u", at: NOW + 2 * 24 * 60 * MIN }] })), NOW + 2 * 24 * 60 * MIN);
		expect(out.get("room:teapot:board")).toBe("Days since a test broke: 2");
		expect(out.get("room:teapot:sign")).toBe("PRs today: 1. Humility: 0.");
		expect(out.get("kitchen:sign")).toBe("One cup per green build. Today: 1.");
	});

	test("idle time wilts the plant and piles up the mugs", () => {
		const c = new Counters(OPTS);
		const at = (min: number) => c.update(snap(session("a", { state: "idle", stateSince: NOW - min * MIN })), NOW);
		expect([at(0).get("room:teapot:plant"), at(0).get("room:teapot:mugs")]).toEqual(["fresh", "0"]);
		expect([at(16).get("room:teapot:plant"), at(16).get("room:teapot:mugs")]).toEqual(["droopy", "1"]);
		expect([at(45).get("room:teapot:plant"), at(45).get("room:teapot:mugs")]).toEqual(["wilting", "4"]);
		// One busy session keeps the room's plant fresh.
		expect(c.update(snap(session("a", { state: "idle", stateSince: NOW - 45 * MIN }), session("b")), NOW).get("room:teapot:plant")).toBe("fresh");
	});

	test("the fridge note is about whatever most needs a human", () => {
		const c = new Counters(OPTS);
		const note = c.update(
			snap(
				session("a", { title: "Crumb cache", waiting: { reason: "permission", since: NOW - 12 * MIN, source: "hook" } }),
				session("b", { title: "Webhook spike", state: "idle", stateSince: NOW - 31 * MIN }),
			),
			NOW,
		).get("fridge");
		expect(note).toBe("Crumb cache has had its hand up for 10 minutes. It’s fine. Its arm is tired, but it’s fine.");
		expect(c.update(snap(session("b", { title: "Webhook spike", state: "idle", stateSince: NOW - 31 * MIN })), NOW).get("fridge")).toBe(
			"Webhook spike is not asleep. It is “resting its context”. For 30 minutes.",
		);
	});
});

describe("Sass, end to end", () => {
	test("bubbles and signs out, only changed signs, and a quiet office sleeps", () => {
		const sass = new Sass({ ...OPTS, gapMs: 0 });
		const a = session("a", { title: "Crumb cache", waiting: { reason: "permission", since: NOW, source: "hook" } });
		const out = sass.update(snap(a), NOW, { zoom: 2 });
		expect(out.says.map((b) => b.who)).toEqual(["a"]);
		expect(out.signs.some((s) => s.slot === "room:teapot:sign" && s.text.startsWith("Now serving"))).toBe(true);
		// Same snapshot again: no repeat of the signs.
		expect(sass.update(snap(a), NOW + 1000, { zoom: 2 }).signs.filter((s) => s.slot === "room:teapot:sign")).toEqual([]);
		// The next wake is no later than the 2-minute tier.
		expect(sass.nextWake(NOW + 1000)!).toBeLessThanOrEqual(NOW + 2 * MIN);

		const quiet = new Sass({ ...OPTS, gapMs: 0 });
		const asleep = session("q", { state: "idle", stateSince: NOW - MIN });
		quiet.update(snap(asleep), NOW);
		expect(quiet.nextWake(NOW)).toBeUndefined();
	});
});

describe("a recorded day", () => {
	test("replays the same every time, and takes turns", async () => {
		const { parseRecording } = await import("../src/watcher/replay");
		const frames = parseRecording(readFileSync(join(import.meta.dir, "../fixtures/busy-release.ndjson"), "utf8"));
		const run = () => {
			const sass = new Sass({ ...OPTS, seed: 3 });
			const log: string[] = [];
			let maxUp = 0;
			for (let i = 0; i < frames.length; i++) {
				const f = frames[i]!;
				const until = frames[i + 1]?.at ?? f.at + 30 * MIN;
				const take = (at: number, o: ReturnType<Sass["update"]>) => {
					for (const b of o.says) log.push(`${at} ${b.who} ${b.text}`);
					maxUp = Math.max(maxUp, sass.scheduler.active(at).length);
				};
				take(f.at, sass.update(f, f.at, { zoom: 0.4 }));
				for (let t = sass.nextWake(f.at); t !== undefined && t < until; t = sass.nextWake(t)) take(t, sass.tick(t, { zoom: 0.4 }));
			}
			return { log, maxUp };
		};
		const a = run();
		expect(a.log.length).toBeGreaterThan(5);
		expect(a.maxUp).toBeLessThanOrEqual(2);
		expect(run().log).toEqual(a.log);
	});
});
