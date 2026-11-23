// Story and continuity (plan-alive wave 3): a merged PR's reply from the outbox, a red streak gone
// green, a long session's send-off, and "while you were out". Every session and number is invented.
import { describe, expect, test } from "bun:test";
import { direct } from "../src/scene/director/direct";
import type { View } from "../src/scene/director/social";
import { STORY, headlinesFor, regularsOf } from "../src/scene/director/story";
import { DECOR, FACTORY_STORY, KITCHEN_STORY, OFFICE_STORY, boardText, decorFor, frameSpots, regularNames, storyStyle } from "../src/scene/office/decor";
import { REGULAR_NAMES, regularOf } from "../src/scene/rig/roles";
import { type Diary, type DiaryDay, localDay, projectKey } from "../src/shared/diary";
import type { World } from "../src/scene/director/types";
import { FloorPlan } from "../src/scene/office/layout";
import { POSE, duration } from "../src/scene/rig/poses";
import type { Agent, Session, Snapshot } from "../src/watcher/model";

const T0 = Date.UTC(2031, 5, 2, 10, 0);
const SEC = 1000;
const MIN = 60 * SEC;

const builder = (id: string, extra: Partial<Agent> = {}): Agent => ({
	id,
	role: "general-purpose",
	task: `invented task ${id}`,
	depth: 1,
	status: "running",
	lastWriteAt: T0 - SEC,
	activity: { tool: "Edit", at: T0 - SEC },
	children: [],
	...extra,
});

const session = (id: string, extra: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: `Invented work ${id}`,
	cwd: "/Users/you/code/teapot",
	project: "teapot",
	origin: "cli",
	state: "idle",
	stateSince: T0 - 10 * MIN,
	startedAt: T0 - 20 * MIN,
	activity: { tool: "Read", at: T0 - 5 * MIN },
	agents: [],
	children: [],
	...extra,
});

const pr = (state: string) => [{ number: 12, url: "https://example.invalid/pull/12", state }];
const tests = (at: number, exitCode: number, failStreak = exitCode ? 1 : 0) => ({ last: { kind: "test" as const, exitCode, at }, failStreak, repeats: 1, failed: 0, testsFailed: 0 });

function stage() {
	const plan = new FloorPlan();
	let world: World | undefined;
	return {
		step(sessions: Session[], now: number, view?: View) {
			const snap: Snapshot = { at: now, sessions };
			const floor = plan.update(snap);
			const d = direct(world, snap, now, floor, { view });
			world = d.world;
			return { ...d, floor };
		},
		get world() {
			return world!;
		},
	};
}

/** Step the scene at each wake until `until`, collecting the poses an actor took. */
function run(st: ReturnType<typeof stage>, sessions: Session[], from: number, until: number, key: string) {
	const poses: { pose: string; as: string; at: number; walkPose?: string; spot: string }[] = [];
	let now = from;
	let d = st.step(sessions, now);
	for (let i = 0; i < 60 && now < until; i++) {
		const a = d.world.actors[key];
		if (a) poses.push({ pose: a.pose, as: a.as, at: now, walkPose: a.walk && now < a.walk.since + a.walk.ms ? a.walkPose : undefined, spot: a.spot });
		if (d.wake === undefined) break;
		now = d.wake;
		d = st.step(sessions, now);
	}
	return poses;
}

describe("a merged PR", () => {
	test("its lead fetches the reply from the outbox, carries it back, and waves to you", () => {
		const st = stage();
		st.step([session("s1", { prs: pr("OPEN") })], T0);
		const d = st.step([session("s1", { prs: pr("OPEN") })], T0 + SEC);
		expect(d.world.story?.replies).toBeUndefined();
		const merged = [session("s1", { prs: pr("MERGED") })];
		const poses = run(st, merged, T0 + 2 * SEC, T0 + 2 * MIN, "s:s1");
		expect(poses[0]).toMatchObject({ pose: STORY.takePose, spot: expect.stringMatching(/^station:.*outbox/) });
		expect(poses.some((p) => p.walkPose === STORY.walkPose && p.spot === "desk")).toBe(true);
		expect(poses.some((p) => p.pose === STORY.alone && p.spot === "desk")).toBe(true);
		// Over: no reply left in the world.
		expect(st.world.story?.replies).toBeUndefined();
		expect(st.world.actors["s:s1"]!.spot).toBe("desk");
	});

	test("with a busy teammate at the desk, the two celebrate", () => {
		const st = stage();
		const s = (state: string) => [session("s1", { prs: pr(state), agents: [builder("b1")] })];
		st.step(s("OPEN"), T0);
		const lead = run(st, s("MERGED"), T0 + SEC, T0 + 2 * MIN, "s:s1");
		expect(lead.some((p) => p.pose === STORY.cheer && p.as === "lead")).toBe(true);
	});

	test("a PR already merged when the office first sees it is history, not news", () => {
		const st = stage();
		const d = st.step([session("s1", { prs: pr("MERGED") })], T0);
		const e = st.step([session("s1", { prs: pr("MERGED") })], T0 + SEC);
		expect(d.world.story?.replies).toBeUndefined();
		expect(e.world.story?.replies).toBeUndefined();
		expect(e.world.story?.log).toEqual([]);
	});

	test("the same run gives the same story", () => {
		const go = () => {
			const st = stage();
			st.step([session("s1", { prs: pr("OPEN") })], T0);
			return run(st, [session("s1", { prs: pr("MERGED") })], T0 + SEC, T0 + 2 * MIN, "s:s1");
		};
		expect(go()).toEqual(go());
	});
});

describe("a red streak gone green", () => {
	test("two red runs then a green one: a flourish, and the crew look up at it", () => {
		const st = stage();
		const lead = (c: ReturnType<typeof tests>) => session("s1", { state: "busy", commands: c, agents: [builder("b1"), builder("b2")] });
		st.step([lead(tests(T0 - 3 * MIN, 1))], T0);
		st.step([lead(tests(T0 + 30 * SEC, 1, 2))], T0 + 40 * SEC);
		const d = st.step([lead(tests(T0 + 70 * SEC, 0))], T0 + 80 * SEC);
		expect(d.world.actors["s:s1"]!.pose).toBe(STORY.redeemed);
		const crew = ["a:s1:b1", "a:s1:b2"].map((k) => d.world.actors[k]!);
		expect(crew.every((a) => a.pose === "glance" || a.pending?.pose === "glance")).toBe(true);
		expect(d.world.story?.log.map((e) => e.kind)).toEqual(["redeemed"]);
	});

	test("one red run then a green one is just a pass", () => {
		const st = stage();
		const lead = (c: ReturnType<typeof tests>) => session("s1", { state: "busy", commands: c });
		st.step([lead(tests(T0 - 3 * MIN, 0))], T0);
		st.step([lead(tests(T0 + 30 * SEC, 1))], T0 + 40 * SEC);
		const d = st.step([lead(tests(T0 + 70 * SEC, 0))], T0 + 80 * SEC);
		expect(d.world.actors["s:s1"]!.pose).not.toBe(STORY.redeemed);
	});
});

describe("a long session's send-off", () => {
	test("the room waves it off, nearest first, looking at it as it goes", () => {
		const st = stage();
		const long = session("long", { startedAt: T0 - 3 * 60 * MIN });
		const mates = [session("m1"), session("m2")];
		st.step([long, ...mates], T0);
		st.step([long, ...mates], T0 + SEC);
		const d = st.step(mates, T0 + 2 * SEC);
		const s = d.world.story?.sendoffs?.["s:long"];
		expect(s?.wavers.map((w) => w.key).sort()).toEqual(["s:m1", "s:m2"]);
		expect(s!.wavers[0]!.delay).toBe(STORY.firstMs);
		for (const w of s!.wavers) expect(d.world.actors[w.key]!.pending?.pose).toBe(STORY.sendoff);
		// When the wave plays, the waver looks at the one leaving.
		const at = T0 + 2 * SEC + s!.wavers[0]!.delay;
		const e = st.step(mates, at);
		const first = e.world.actors[s!.wavers[0]!.key]!;
		expect(first.pose).toBe(STORY.sendoff);
		expect(first.lookAt).toBe("s:long");
		expect(e.world.story?.log.map((x) => x.kind).sort()).toEqual(["finished", "sendoff"]);
	});

	test("a short session just leaves", () => {
		const st = stage();
		const mates = [session("m1")];
		st.step([session("short"), ...mates], T0);
		const d = st.step(mates, T0 + SEC);
		expect(d.world.story?.sendoffs).toBeUndefined();
	});
});

describe("while you were out", () => {
	test("coming back counts what happened since you went; it stays up a minute and a half", () => {
		const st = stage();
		const long = session("long", { startedAt: T0 - 3 * 60 * MIN, prs: pr("OPEN") });
		st.step([long, session("m1")], T0);
		st.step([{ ...long, prs: pr("MERGED") }, session("m1")], T0 + MIN);
		st.step([session("m1")], T0 + 2 * MIN);
		const back = T0 + 5 * MIN;
		const d = st.step([session("m1")], back, { back, since: T0 + 30 * SEC });
		expect(d.world.story?.headlines).toEqual({ at: back, since: T0 + 30 * SEC, until: back + STORY.headlineMs, counts: { merged: 1, finished: 1, sendoff: 1 } });
		expect(d.wake).toBeLessThanOrEqual(back + STORY.headlineMs);
		const later = st.step([session("m1")], back + STORY.headlineMs, { back, since: T0 + 30 * SEC });
		expect(later.world.story?.headlines).toBeUndefined();
	});

	test("nothing happened: no headlines", () => {
		expect(headlinesFor(undefined, [], { back: 10, since: 0 }, 10, 10)).toBeUndefined();
		expect(headlinesFor(undefined, [{ kind: "merged", at: -5 }], { back: 10, since: 0 }, 10, 10)).toBeUndefined();
	});
});

describe("the walls remember", () => {
	const plan = new FloorPlan();
	const floor = plan.update({ at: T0, sessions: [session("s1"), session("s2", { project: "saucer" })] });
	const room = floor.areas.find((a) => a.kind === "project" && a.name === "teapot")!;
	const today = localDay(T0);
	const diary: Diary = {
		v: 1,
		days: {
			[today]: { counts: { sessions: 3, prsOpened: 2, prsMerged: 1, testsRed: 4, redeemed: 1 }, projects: { [projectKey("teapot")]: { sessions: 2, prsMerged: 1, redeemed: 1 } }, regulars: [], marks: [] },
			[localDay(T0 - 2 * 86_400_000)]: { counts: { prsMerged: 2 }, projects: { [projectKey("teapot")]: { prsMerged: 2 } }, regulars: [], marks: [] },
		},
	};

	test("a framed PR per merge this week in the back wall's gaps, a pennant per day in, a star per fix", () => {
		const d = decorFor(room, { diary, now: T0 })!;
		expect(frameSpots(room).length).toBeGreaterThan(0);
		expect(d.frames.length).toBe(Math.min(3, frameSpots(room).length));
		expect(d.pennants.length).toBe(2);
		expect(d.stars.length).toBe(1);
		// Frames hang between the wall's items, never over one.
		for (const f of d.frames) {
			for (const w of room.wall) {
				const over = f.x < w.rect.x + w.rect.w && f.x + DECOR.frame.w > w.rect.x && f.y < w.rect.y + w.rect.h && f.y + DECOR.frame.h > w.rect.y;
				expect(over).toBe(false);
			}
		}
		// A room with nothing in the diary has no decor.
		expect(decorFor(floor.areas.find((a) => a.name === "saucer")!, { diary, now: T0 })).toBeUndefined();
	});

	test("the lobby board: headlines while they're up, the day's ledger at closing, else the theme's own", () => {
		const headlines = { at: T0, since: T0 - MIN, until: T0 + STORY.headlineMs, counts: { merged: 2, sendoff: 1 } };
		expect(boardText({ diary, headlines, now: T0 + SEC }, OFFICE_STORY, "noon")).toEqual({ title: "WHILE YOU WERE OUT", body: "2 PRs merged\n1 long one waved off" });
		expect(boardText({ diary, headlines, now: T0 + STORY.headlineMs }, OFFICE_STORY, "noon")).toBeUndefined();
		expect(boardText({ diary, now: T0 }, OFFICE_STORY, "dusk")).toEqual({ title: "TODAY'S LEDGER", body: "3 sessions · 2 PRs · 1 merged · 4 red · 1 fixed" });
		expect(boardText({ diary, now: T0 }, FACTORY_STORY, "night")?.title).toBe("SHIFT REPORT");
		expect(boardText({ now: T0 }, OFFICE_STORY, "night")).toBeUndefined();
	});

	test("a theme without story words of its own gets the office's, and colours from its paint", () => {
		const style = storyStyle({ id: "allotment" as never, slab: 1, lawn: 2, light: { lamp: 3, glow: 4, sky: { noon: [5, 6], dusk: [7, 8] } } as never });
		expect(style.words).toBe(OFFICE_STORY);
		expect(style).toMatchObject({ ink: 1, mat: 3, gold: 4, mark: 1, pennants: [4, 5, 2, 8] });
	});

	test("every theme has story words of its own: the Line counts covers", () => {
		expect(storyStyle({ id: "kitchen", slab: 1, lawn: 2, light: { lamp: 3, glow: 4, sky: { noon: [5, 6], dusk: [7, 8] } } } as never).words).toBe(KITCHEN_STORY);
		expect(storyStyle({ id: "factory", slab: 1, lawn: 2, light: { lamp: 3, glow: 4, sky: { noon: [5, 6], dusk: [7, 8] } } } as never).words).toBe(FACTORY_STORY);
	});
});

describe("regulars", () => {
	test("the same project and role is the same regular on any day: key, name and accessory from the key alone", () => {
		const day1 = regularsOf([{ key: "s:x1", kind: "lead", role: "lead", session: "x1" }, { key: "a:x1:q", kind: "crew", role: "Explore", session: "x1" }], { at: T0, sessions: [session("x1")] });
		const day2 = regularsOf([{ key: "s:y9", kind: "lead", role: "lead", session: "y9" }, { key: "a:y9:z", kind: "crew", role: "explorer-ish", session: "y9" }], { at: T0 + 86_400_000, sessions: [session("y9")] });
		const p = projectKey("teapot");
		expect([...day1.values()]).toEqual([`${p}:explorer:0`, `${p}:lead:0`]);
		expect([...day2.values()].sort()).toEqual([...day1.values()].sort());
		expect(regularOf(`${p}:lead:0`)).toEqual(regularOf(`${p}:lead:0`));
		// Two of the same costume in a project are two regulars.
		const two = regularsOf([{ key: "a:x1:a", kind: "crew", role: "scout", session: "x1" }, { key: "a:x1:b", kind: "crew", role: "scout", session: "x1" }], { at: T0, sessions: [session("x1")] });
		expect([...two.values()]).toEqual([`${p}:scout:0`, `${p}:scout:1`]);
	});

	test("names and accessories vary across regulars; a reviewer keeps its own glasses", () => {
		const keys = Array.from({ length: 60 }, (_, i) => `p${i.toString(36)}:builder:0`);
		const rs = keys.map(regularOf);
		expect(new Set(rs.map((r) => r.name)).size).toBeGreaterThan(10);
		expect(rs.some((r) => r.wear === "wear/glasses")).toBe(true);
		expect(rs.some((r) => r.wear === undefined)).toBe(true);
		for (const r of rs) expect(REGULAR_NAMES).toContain(r.name as (typeof REGULAR_NAMES)[number]);
		expect(regularOf("pabc:reviewer:0").wear).toBeUndefined();
	});

	test("you recognise a regular (its name shows) once the diary has seen it on two days", () => {
		const p = projectKey("teapot");
		const day = (k: string, regulars: string[]): [string, DiaryDay] => [k, { counts: {}, projects: {}, regulars, marks: [] }];
		const diary: Diary = { v: 1, days: Object.fromEntries([day(localDay(T0), [`${p}:lead`, `${p}:scout`]), day(localDay(T0 - 86_400_000), [`${p}:lead`])]) };
		const names = regularNames([{ key: "s:a", regular: `${p}:lead:0` }, { key: "a:a:b", regular: `${p}:scout:0` }, { key: "a:a:c" }], { diary, now: T0 });
		expect([...names.keys()]).toEqual(["s:a"]);
		expect(names.get("s:a")).toBe(regularOf(`${p}:lead:0`).name);
	});
});

test("the story's poses exist", () => {
	for (const p of [STORY.takePose, STORY.walkPose, STORY.cheer, STORY.alone, STORY.redeemed, STORY.sendoff]) expect(duration(POSE[p]!.frames)).toBeGreaterThan(0);
});
