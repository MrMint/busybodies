// The office's diary: counts and kinds only, saved next to settings.json. Every session here is
// invented, and every file lives in a temp folder.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Diarist, diaryFile, readDiary, writeDiary } from "../src/bun/diary";
import { DIARY, daysSeen, diaryOf, emptyDiary, newMemory, noteSnapshot, projectKey, weekOf } from "../src/shared/diary";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

const H = 3_600_000;
const T0 = Date.UTC(2031, 2, 4, 9);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const session = (id: string, extra: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: "Teach the kettle to whistle in tune",
	cwd: "/Users/you/code/kettle-works",
	project: "kettle-works",
	branch: "tune-the-whistle",
	origin: "cli",
	state: "busy",
	stateSince: T0,
	startedAt: T0,
	agents: [],
	children: [],
	...extra,
});
const agent = (id: string, role: string, extra: Partial<Agent> = {}): Agent => ({ id, role, task: "Look for the spout", depth: 1, status: "running", lastWriteAt: T0, children: [], ...extra });
const snap = (at: number, sessions: Session[]): Snapshot => ({ at, sessions });
const test_ = (at: number, exitCode: number) => ({ last: { kind: "test" as const, exitCode, at }, failStreak: exitCode ? 1 : 0, repeats: 1, failed: 0, testsFailed: 0 });

describe("the diary", () => {
	test("counts sessions, hires, PRs and merges once each, keyed by a hash of the project", () => {
		const mem = newMemory();
		let d = emptyDiary();
		const s = session("s1", { agents: [agent("a1", "Explore"), agent("a2", "code-reviewer")], prs: [{ number: 7, url: "https://example.invalid/pr/7", state: "OPEN" }] });
		d = noteSnapshot(d, mem, snap(T0, [s]), { day });
		const again = noteSnapshot(d, mem, snap(T0 + 1000, [s]), { day });
		expect(again).toBe(d);
		d = noteSnapshot(d, mem, snap(T0 + 2000, [{ ...s, prs: [{ number: 7, url: "https://example.invalid/pr/7", state: "MERGED" }] }]), { day });
		const today = d.days[day(T0)]!;
		expect(today.counts).toEqual({ sessions: 1, hires: 2, prsOpened: 1, prsMerged: 1 });
		const p = projectKey("kettle-works");
		expect(Object.keys(today.projects)).toEqual([p]);
		expect(today.regulars).toEqual([`${p}:explorer`, `${p}:lead`, `${p}:reviewer`]);
	});

	test("nothing in it names the project, the branch, the title, a path or an agent type", () => {
		const mem = newMemory();
		const s = session("s1", { agents: [agent("a1", "kettle-whisperer")], prs: [{ number: 3, url: "https://example.invalid/kettle-works/pull/3", repo: "someone/kettle-works", state: "MERGED" }] });
		const d = noteSnapshot(emptyDiary(), mem, snap(T0, [s]), { day });
		const text = JSON.stringify(d);
		for (const word of ["kettle", "whistle", "tune", "someone", "Users", "code", "example", "Explore", "whisperer", "s1", "a1"]) expect(text).not.toContain(word);
	});

	test("a red streak that goes green is a redemption; one red then green is not", () => {
		const mem = newMemory();
		let d = emptyDiary();
		const at = (n: number, code: number) => snap(T0 + n * 1000, [session("s1", { commands: test_(T0 + n * 1000, code) })]);
		d = noteSnapshot(d, mem, at(1, 0), { day });
		d = noteSnapshot(d, mem, at(2, 1), { day });
		d = noteSnapshot(d, mem, at(3, 0), { day });
		expect(d.days[day(T0)]!.counts.redeemed).toBeUndefined();
		d = noteSnapshot(d, mem, at(4, 1), { day });
		d = noteSnapshot(d, mem, at(5, 1), { day });
		d = noteSnapshot(d, mem, at(6, 0), { day });
		expect(d.days[day(T0)]!.counts).toMatchObject({ testsRed: 3, redeemed: 1 });
	});

	test("a session that ends is finished; a long one is a long one too", () => {
		const mem = newMemory();
		let d = emptyDiary();
		d = noteSnapshot(d, mem, snap(T0, [session("s1"), session("s2", { startedAt: T0 - 3 * H })]), { day });
		d = noteSnapshot(d, mem, snap(T0 + 60_000, []), { day });
		expect(d.days[day(T0)]!.counts).toMatchObject({ finished: 2, longFinished: 1 });
	});

	test("keeps a few weeks, and the week's counts and the days a regular came in add up", () => {
		const mem = newMemory();
		let d = emptyDiary();
		for (let i = 0; i < 30; i++) {
			const at = T0 + i * 24 * H;
			d = noteSnapshot(d, mem, snap(at, [session(`s${i}`, { agents: i % 2 ? [agent(`a${i}`, "scout")] : [] })]), { day });
		}
		expect(Object.keys(d.days).length).toBe(DIARY.keepDays);
		const today = day(T0 + 29 * 24 * H);
		const p = projectKey("kettle-works");
		expect(weekOf(d, p, today)).toEqual({ counts: { sessions: 7, hires: 4, finished: 7, longFinished: 7 }, days: 7 });
		expect(daysSeen(d, `${p}:lead`, today)).toBe(DIARY.keepDays);
		expect(daysSeen(d, `${p}:scout`, today)).toBe(11);
	});

	test("reading anything gives a diary: unknown keys, wrong types and words that aren't hashes are dropped", () => {
		const d = diaryOf({ v: 1, days: { "2031-03-04": { counts: { sessions: 2, bogus: 4, finished: "3" }, projects: { "kettle-works": { sessions: 1 }, pabc: { sessions: 1 } }, regulars: ["pabc:lead", "kettle:lead"], marks: ["abc", "../x"] }, yesterday: {} } });
		expect(d).toEqual({ v: 1, days: { "2031-03-04": { counts: { sessions: 2 }, projects: { pabc: { sessions: 1 } }, regulars: ["pabc:lead"], marks: ["abc"] } } });
		expect(diaryOf("nonsense")).toEqual(emptyDiary());
	});
});

describe("the diary on disk", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "busybodies-diary-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	test("a missing or torn file reads as an empty diary, and a write leaves no temp file", () => {
		const file = diaryFile(dir);
		expect(readDiary(file)).toEqual(emptyDiary());
		writeFileSync(file, '{"v":1,"days":{"2031-03-04":{"counts":{"sessi');
		expect(readDiary(file)).toEqual(emptyDiary());
		writeDiary(file, { v: 1, days: { "2031-03-04": { counts: { sessions: 1 }, projects: {}, regulars: [], marks: [] } } });
		expect(readDiary(file).days["2031-03-04"]!.counts.sessions).toBe(1);
		expect(existsSync(`${file}.tmp`)).toBe(false);
	});

	test("the diarist saves what it noted, and a restart doesn't count the same sessions again", () => {
		const file = diaryFile(dir);
		const a = new Diarist(file, { day, saveMs: 0, now: () => T0 });
		expect(a.note(snap(T0, [session("s1")]))).toBe(true);
		expect(a.note(snap(T0 + 1000, [session("s1")]))).toBe(false);
		const b = new Diarist(file, { day, saveMs: 0, now: () => T0 });
		b.note(snap(T0 + 2000, [session("s1")]));
		expect(b.diary.days[day(T0)]!.counts.sessions).toBe(1);
		expect(JSON.parse(readFileSync(file, "utf8")).days[day(T0)].counts.sessions).toBe(1);
		// Small: one session's day is well under a kilobyte.
		expect(readFileSync(file, "utf8").length).toBeLessThan(400);
	});
});
