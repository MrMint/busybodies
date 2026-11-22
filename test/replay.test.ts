// Anonymizing and replaying recordings, with invented snapshots.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Anonymizer, RECORDING_EPOCH } from "../src/watcher/anonymize";
import type { Session, Snapshot } from "../src/watcher/model";
import { parseRecording, replay, shiftTimes } from "../src/watcher/replay";

const T = Date.parse("2031-06-01T10:00:00Z");
const session = (id: string, title: string, project: string, extra: Partial<Session> = {}): Session => ({
	id,
	pid: 777,
	title,
	cwd: `/home/me/private/${project}`,
	project,
	branch: "secret-branch",
	origin: "cli",
	state: "busy",
	stateSince: T - 60_000,
	startedAt: T - 3_600_000,
	running: { tool: "mcp__acme-internal__deploy", since: T - 5000 },
	prs: [{ number: 4242, url: "https://github.com/acme/hush/pull/4242", repo: "acme/hush", state: "OPEN", at: T - 1000 }],
	agents: [{ id: "a-real", role: "acme-secret-role", task: "Read the payroll table", depth: 1, status: "running", lastWriteAt: T, children: [] }],
	children: [],
	...extra,
});
const snap = (at: number, sessions: Session[]): Snapshot => ({ at, sessions });

describe("Anonymizer", () => {
	test("replaces every private string and keeps the structure", () => {
		const real = snap(T, [session("s1", "Payroll migration", "hush", { children: [session("s2", "Payroll side quest", "hush")] })]);
		const out = new Anonymizer().snapshot(real);
		const text = JSON.stringify(out);
		for (const secret of ["home/me", "private", "hush", "acme", "Payroll", "payroll", "secret", "s1", "a-real", "4242", "777"]) expect(text).not.toContain(secret);
		expect(out.at).toBe(RECORDING_EPOCH);
		const s = out.sessions[0]!;
		expect(s.children[0]!.project).toBe(s.project); // same real project, same invented one
		expect(s.running).toEqual({ tool: "mcp", since: RECORDING_EPOCH - 5000 });
		expect(s.stateSince).toBe(RECORDING_EPOCH - 60_000);
		expect(s.prs![0]).toMatchObject({ state: "OPEN", url: `https://github.com/${s.prs![0]!.repo}/pull/${s.prs![0]!.number}` });
		expect(s.agents[0]).toMatchObject({ depth: 1, status: "running" });
	});

	test("passes round-two counts and families through, and nothing else", () => {
		const sneaky = { path: "/home/me/private/hush/notes.md" };
		const real = snap(T, [
			session("s1", "Payroll", "hush", {
				family: "opus",
				context: { used: 412_000, window: 1_000_000, at: T - 2000, ...sneaky } as Session["context"],
				changes: { files: 3, added: 120, removed: 40, ...sneaky } as Session["changes"],
				todos: { pending: 2, active: 1, done: 4, ...sneaky } as Session["todos"],
				tools: { calls: 18, errors: 2, windowMs: 60_000, ...sneaky } as Session["tools"],
				agents: [{ id: "a1", role: "Explore", task: "Payroll", depth: 1, status: "running", lastWriteAt: T, family: "claude-opus-5-5-secret" as never, changes: { files: 1, added: 9, removed: 0 }, tools: { calls: 4, errors: 0, windowMs: 60_000 }, children: [] }],
			}),
		]);
		const out = new Anonymizer().snapshot(real);
		expect(JSON.stringify(out)).not.toContain("private");
		const s = out.sessions[0]!;
		expect(s.family).toBe("opus");
		expect(s.context).toEqual({ used: 412_000, window: 1_000_000, at: RECORDING_EPOCH - 2000 });
		expect(s.changes).toEqual({ files: 3, added: 120, removed: 40 });
		expect(s.todos).toEqual({ pending: 2, active: 1, done: 4 });
		expect(s.tools).toEqual({ calls: 18, errors: 2, windowMs: 60_000 });
		const a = s.agents[0]!;
		expect(a.family).toBeUndefined(); // not a family name: dropped
		expect(a).toMatchObject({ changes: { files: 1, added: 9, removed: 0 }, tools: { calls: 4, errors: 0, windowMs: 60_000 } });
	});

	test("round-trips the new fields through a recording", () => {
		const frame = snap(T, [session("s1", "A", "p", { family: "haiku", context: { used: 9000, at: T - 1000 }, changes: { files: 2, added: 5, removed: 1 }, todos: { pending: 1, active: 0, done: 2 }, tools: { calls: 3, errors: 1, windowMs: 60_000 } })]);
		const recorded = new Anonymizer().snapshot(frame);
		const [back] = parseRecording(`${JSON.stringify(recorded)}\n`);
		expect(back).toEqual(recorded);
		const shown: Snapshot[] = [];
		replay([back!], (x) => shown.push(x), { now: () => 50_000, setTimer: (fn) => fn() });
		const s = shown[0]!.sessions[0]!;
		// The context's time moves with the frame; the counts don't.
		expect(shown[0]!.at - s.context!.at).toBe(1000);
		expect(s).toMatchObject({ family: "haiku", changes: { files: 2, added: 5, removed: 1 }, todos: { pending: 1, active: 0, done: 2 }, tools: { calls: 3, errors: 1, windowMs: 60_000 } });
	});

	test("is deterministic, and stable across frames", () => {
		const frames = [snap(T, [session("s1", "A", "p")]), snap(T + 1000, [session("s1", "A", "p"), session("s9", "B", "q")])];
		const run = () => {
			const a = new Anonymizer();
			return frames.map((f) => a.snapshot(f));
		};
		expect(run()).toEqual(run());
		const [f1, f2] = run();
		expect(f2!.sessions[0]!.id).toBe(f1!.sessions[0]!.id);
		expect(f2!.at - f1!.at).toBe(1000);
	});
});

describe("replay", () => {
	const frames = [snap(T, [session("s1", "A", "p")]), snap(T + 4000, []), snap(T + 8000, [])];

	test("parses NDJSON, skipping torn lines", () => {
		const text = `${frames.map((f) => JSON.stringify(f)).join("\n")}\n{"at":`;
		expect(parseRecording(text)).toHaveLength(3);
	});

	test("shows frames at their gaps over speed, with times moved to now", () => {
		const timers: [number, () => void][] = [];
		const shown: Snapshot[] = [];
		replay(frames, (s) => shown.push(s), { speed: 4, now: () => 100_000, setTimer: (fn, ms) => timers.push([ms, fn]) });
		expect(timers.map(([ms]) => ms)).toEqual([0, 1000, 2000]);
		timers.forEach(([, fn]) => fn());
		expect(shown.map((s) => s.at)).toEqual([100_000, 101_000, 102_000]);
		// Durations inside a frame stay as recorded.
		expect(shown[0]!.at - shown[0]!.sessions[0]!.running!.since).toBe(5000);
	});

	test("shiftTimes moves only time fields", () => {
		expect(shiftTimes({ at: 1, pid: 1, x: [{ since: 2, number: 3 }] }, 10)).toEqual({ at: 11, pid: 1, x: [{ since: 12, number: 3 }] });
	});
});

describe("committed fixtures", () => {
	const dir = join(import.meta.dir, "..", "fixtures");
	const names = readdirSync(dir).filter((f) => f.endsWith(".ndjson"));
	test("exist and parse", () => {
		expect(names.length).toBeGreaterThan(0);
		for (const n of names) expect(parseRecording(readFileSync(join(dir, n), "utf8")).length).toBeGreaterThan(1);
	});

	test("hold only invented paths", () => {
		for (const n of names)
			for (const f of parseRecording(readFileSync(join(dir, n), "utf8"))) {
				const all = (l: Session[]): Session[] => l.flatMap((s) => [s, ...all(s.children)]);
				for (const s of all(f.sessions)) expect(s.cwd.startsWith("/Users/you/code/")).toBe(true);
			}
	});
});
