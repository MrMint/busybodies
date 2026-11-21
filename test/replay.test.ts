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
