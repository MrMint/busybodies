// Motion grammar (plan-alive stream B): walks with a start and a stop inside their own ms, rounded
// corners, loops that break their own rhythm now and then, idle habits that live while life is on,
// traits as acting, and a wait that gets worse. Pure logic only; every session is invented.
import { describe, expect, test } from "bun:test";
import { BEATS } from "../src/scene/director/beats";
import { cueFor, direct } from "../src/scene/director/direct";
import { WAITING, waitStage } from "../src/scene/director/errands";
import { HABIT, habitAt } from "../src/scene/director/habits";
import { GAIT, along, lookMs, pathLength, pointAt, progress, walkMs } from "../src/scene/world/paths";
import { TRAITS } from "../src/scene/director/traits";
import type { World } from "../src/scene/director/types";
import { FloorPlan } from "../src/scene/world/layout";
import { channels } from "../src/scene/rig/data/frame";
import { frameAt, passBeat } from "../src/scene/rig/data/player";
import { HABITS, POSE, POSES, duration } from "../src/scene/rig/data/poses";
import type { Session, Snapshot } from "../src/watcher/model";

const T0 = Date.UTC(2026, 10, 19, 14, 0);
const SEC = 1000;
const MIN = 60 * SEC;

const session = (id: string, extra: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: `Invented ${id}`,
	cwd: "/Users/you/code/teapot",
	project: "teapot",
	origin: "cli",
	state: "busy",
	stateSince: T0 - 10 * MIN,
	startedAt: T0 - 60 * MIN + id.length,
	activity: { tool: "Read", at: T0 - 30 * SEC },
	agents: [],
	children: [],
	...extra,
});

function stage(life = false) {
	const plan = new FloorPlan();
	let world: World | undefined;
	return {
		step(sessions: Session[], now: number) {
			const snap: Snapshot = { at: now, sessions };
			const d = direct(world, snap, now, plan.update(snap), { life });
			world = d.world;
			return d;
		},
	};
}

describe("a walk's start, stride and stop", () => {
	test("the feet wait through the look, then the distance eases in and out, arriving exactly on time", () => {
		for (const total of [600, 1200, 3000, 9000]) {
			const look = lookMs(total);
			expect(look).toBeLessThanOrEqual(GAIT.lookMs);
			expect(progress(0, total)).toBe(0);
			expect(progress(look, total)).toBe(0);
			expect(progress(total, total)).toBe(1);
			expect(progress(total - 1, total)).toBeLessThan(1);
			// Never backwards, never past the end.
			let last = 0;
			for (let t = 0; t <= total; t += 5) {
				const p = progress(t, total);
				expect(p).toBeGreaterThanOrEqual(last - 1e-12);
				expect(p).toBeLessThanOrEqual(1);
				last = p;
			}
			// Slow off the mark and slow into the stop, quicker in the middle.
			const v = (t: number) => (progress(t + 10, total) - progress(t, total)) / 10;
			const mid = look + (total - look) / 2;
			expect(v(look)).toBeLessThan(v(mid));
			expect(v(total - 11)).toBeLessThan(v(mid));
		}
		expect(lookMs(9000)).toBe(GAIT.lookMs);
	});

	test("the walk's ms are the arrival, so a brick, a folder or an envelope timed on them still lands", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 300, y: 0 },
			{ x: 300, y: 200 },
		];
		const ms = walkMs(path);
		expect(along(path, ms, ms)).toMatchObject({ x: 300, y: 200 });
		expect(along(path, ms - 50, ms).y).toBeLessThan(200);
		expect(along(path, 0, ms)).toMatchObject({ x: 0, y: 0 });
	});

	test("corners are rounded inside the corner, and the path is smooth", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
		];
		const len = pathLength(path);
		const at = pointAt(path, 100);
		// Cut inside the corner, never outside the two segments.
		expect(at.x).toBeLessThan(100);
		expect(at.y).toBeGreaterThan(0);
		for (let d = 0; d <= len; d += 1) {
			const p = pointAt(path, d);
			expect(p.x).toBeLessThanOrEqual(100 + 1e-9);
			expect(p.y).toBeGreaterThanOrEqual(-1e-9);
			const q = pointAt(path, d + 1);
			expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(1.01);
		}
		// Straight before and after the bend, and the ends are the ends.
		expect(pointAt(path, 100 - GAIT.corner - 1)).toMatchObject({ y: 0, dx: 1 });
		expect(pointAt(path, 0)).toMatchObject({ x: 0, y: 0 });
		expect(pointAt(path, len)).toMatchObject({ x: 100, y: 100 });
	});
});

describe("breaking the metronome", () => {
	test("a beat lasts exactly as long as the pose's own pass, and keeps the body unsquashed", () => {
		const withBeats = POSES.filter((p) => p.beats);
		expect(withBeats.map((p) => p.name).sort()).toEqual(["hammer", "queueWait", "typing"]);
		for (const p of withBeats) {
			expect(p.play).toBe("loop");
			for (const b of p.beats!.passes) {
				expect(duration(b.frames)).toBe(duration(p.frames));
				for (const f of b.frames) {
					const c = channels(f);
					expect(Math.abs(c.bodySX - 1)).toBeLessThan(0.05);
					expect(Math.abs(c.bodySY - 1)).toBeLessThan(0.05);
				}
			}
		}
		// The hammerer's check still drives one nail down and ends where the loop starts over.
		const check = POSE.hammer!.beats!.passes[0]!.frames;
		expect(new Set(check.map((f) => f.props.work))).toEqual(new Set(["nail1", "nail2", "nail3"]));
		expect(check.at(-1)!.props.work).toBe(POSE.hammer!.frames.at(-1)!.props.work);
		// The queuer checks the one ahead with the clipboard still forward, rising rather than leaning.
		const ahead = POSE.queueWait!.beats!.passes[0]!.frames;
		expect(ahead.every((f) => f.props.right === "clipF" && !f.props.left)).toBe(true);
		expect(ahead.some((f) => f.body === "leanR" || f.body === "leanL")).toBe(false);
		// The typist reads with its chin on a hand.
		expect(POSE.typing!.beats!.passes[0]!.frames.some((f) => f.armR === "chin")).toBe(true);
	});

	test("which pass breaks the loop is picked from the id, the pose and the pass: never the first, never twice running", () => {
		const picks = (id: string) => Array.from({ length: 400 }, (_, n) => passBeat(id, "typing", n, 1, 0.22));
		const a = picks("s:alpha");
		expect(picks("s:alpha")).toEqual(a);
		expect(picks("s:beta")).not.toEqual(a);
		expect(a[0]).toBe(0);
		for (let n = 1; n < a.length; n++) expect(a[n]! > 0 && a[n - 1]! > 0).toBe(false);
		const share = a.filter((x) => x > 0).length / a.length;
		expect(share).toBeGreaterThan(0.08);
		expect(share).toBeLessThan(0.3);
		expect(passBeat("s:alpha", "typing", 5, 0, 1)).toBe(0);
	});

	test("frameAt plays the picked pass, and its frames, at the same pass boundaries", () => {
		const base = [{ ms: 100 }, { ms: 100 }];
		const alt = [{ ms: 50 }, { ms: 150 }];
		const passes = { sets: [alt], pick: (pass: number) => (pass === 2 ? 1 : 0) };
		expect(frameAt(base, 150, Infinity, passes)).toEqual({ index: 1, holding: false, pass: 0, beat: 0 });
		expect(frameAt(base, 400 + 60, Infinity, passes)).toEqual({ index: 1, holding: false, pass: 2, beat: 1 });
		expect(frameAt(base, 400 + 40, Infinity, passes)).toEqual({ index: 0, holding: false, pass: 2, beat: 1 });
		expect(frameAt(base, 600 + 60, Infinity, passes).beat).toBe(0);
		// Without passes, as before.
		expect(frameAt(base, 460, Infinity)).toEqual({ index: 0, holding: false, pass: 2 });
	});
});

describe("idle habits", () => {
	test("calm mode keeps one habit for ten minutes", () => {
		const h = habitAt("s:idle", T0, T0 + 3 * MIN, false);
		expect(h.since).toBeUndefined();
		expect(h.wake).toBe(T0 + HABIT.calmRotateMs);
		expect(habitAt("s:idle", T0, T0 + 9 * MIN, false).pose).toBe(h.pose);
		expect(habitAt("s:idle", T0, T0 + 10 * MIN, false).pose).not.toBe(h.pose);
	});

	test("with life on, a habit plays again every 20 to 30 s and moves on every minute or two, on a 5 s grid", () => {
		for (const key of ["s:a", "s:bb", "a:x:y", "s:night"]) {
			const seen = new Set<string>();
			let changes = 0;
			let last = habitAt(key, T0, T0, true);
			let t = T0;
			while (t < T0 + 10 * MIN) {
				const h = habitAt(key, T0, t, true);
				expect(h.wake).toBeGreaterThan(t);
				expect(h.wake % HABIT.gridMs).toBe(0);
				expect(h.wake - h.since!).toBeLessThanOrEqual(HABIT.replayMs[1]);
				expect(habitAt(key, T0, t, true)).toEqual(h);
				seen.add(h.pose);
				if (h.pose !== last.pose) changes++;
				last = h;
				t = h.wake;
			}
			// Ten minutes: five to ten habits, every one of them a real habit.
			expect(changes).toBeGreaterThanOrEqual(4);
			expect(changes).toBeLessThanOrEqual(10);
			for (const p of seen) expect(HABITS.some((x) => x.name === p)).toBe(true);
		}
	});

	test("the director replays the habit with life on, and books a wake for it; calm, it holds", () => {
		const idle = [session("a", { state: "idle", stateSince: T0 - 5 * MIN })];
		const live = stage(true);
		const d = live.step(idle, T0);
		const a = d.world.actors["s:a"]!;
		expect(d.wake).toBeLessThanOrEqual(T0 + HABIT.replayMs[1]);
		const next = live.step(idle, d.wake!);
		const b = next.world.actors["s:a"]!;
		expect(b.poseSince).toBe(d.wake!);
		expect(b.at).toBe("start");
		expect(next.events.some((e) => e.type === "pose" && e.key === "s:a")).toBe(true);
		expect(a.poseSince).toBeLessThan(b.poseSince);
		const calm = stage(false);
		const c = calm.step(idle, T0);
		expect(c.wake).toBe(T0 - 5 * MIN + HABIT.calmRotateMs);
		expect(calm.step(idle, T0 + MIN).events).toEqual([]);
	});
});

describe("traits as acting", () => {
	const red = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test" as const, exitCode: 1, at: T0 + 900 } };

	test("opus considers, chin on a hand, through its pause; sonnet nods; the beat lasts as long as its pose", () => {
		for (const [family, pose] of [
			["opus", "consider"],
			["sonnet", "nod"],
		] as const) {
			expect(TRAITS[family].beat).toBe(pose);
			expect(duration(POSE[pose]!.frames)).toBe(TRAITS[family].pauseMs);
			const s = stage();
			s.step([session("a", { family })], T0);
			const d = s.step([session("a", { family, commands: red })], T0 + SEC);
			expect(d.world.actors["s:a"]).toMatchObject({ pose, acted: false, pending: { pose: "testFailed" } });
			const e = s.step([session("a", { family, commands: red })], T0 + SEC + TRAITS[family].pauseMs);
			expect(e.world.actors["s:a"]!.pose).toBe("testFailed");
		}
		expect(POSE.consider!.frames.some((f) => f.armR === "chin" && f.look === "upR")).toBe(true);
	});

	test("haiku overlaps: its acted pose counts as over a touch early", () => {
		const ms = duration(POSE.testFailed!.frames);
		for (const family of ["haiku", undefined] as const) {
			const s = stage();
			s.step([session("a", { family })], T0);
			const d = s.step([session("a", { family, commands: red })], T0 + SEC);
			expect(d.world.actors["s:a"]!.pose).toBe("testFailed");
			const overlap = family ? TRAITS[family].overlapMs : 0;
			expect(d.wake).toBe(T0 + SEC + ms - overlap);
			const after = s.step([session("a", { family, commands: red })], T0 + SEC + ms - TRAITS.haiku.overlapMs);
			expect(after.world.actors["s:a"]!.pose === "testFailed").toBe(!family);
		}
		expect(BEATS.overlaps.has("testFailed")).toBe(true);
	});
});

describe("waiting gets worse", () => {
	test("polite, then the door and a foot, then a word with the one behind, then a slump", () => {
		const since = T0;
		expect(waitStage(since, T0 + 10 * SEC, true)).toEqual({ pose: "ticketPolite", stage: 0, next: T0 + WAITING.stages[1].fromMs });
		expect(waitStage(since, T0 + 60 * SEC, true).pose).toBe("ticketWait");
		expect(waitStage(since, T0 + 3 * MIN, true)).toEqual({ pose: "ticketChat", stage: 2, next: T0 + WAITING.stages[3].fromMs });
		// Nobody behind: it keeps tapping instead.
		expect(waitStage(since, T0 + 3 * MIN, false).pose).toBe("ticketWait");
		expect(waitStage(since, T0 + 30 * MIN, false)).toEqual({ pose: "ticketSlump", stage: 3 });
		for (const st of WAITING.stages) expect(POSE[st.pose]?.play).toBe("loop");
		expect(POSE.ticketSlump!.frames.every((f) => f.props.right === "ticket" && f.body === "slump")).toBe(true);
	});

	test("in your office, the wait wakes the director at each stage, with no frames booked between", () => {
		const wait = (id: string, since: number) => session(id, { state: "idle", waiting: { reason: "permission", since, source: "hook" } });
		const s = stage();
		s.step([session("a"), session("bb")], T0);
		const line = () => [wait("a", T0 + 500), wait("bb", T0 + 600)];
		const d = s.step(line(), T0 + SEC);
		expect(d.wake).toBeLessThanOrEqual(T0 + 500 + WAITING.stages[1].fromMs);
		// Past the walk and the bell: the stages, by how long each has waited.
		const at = (ms: number) => s.step(line(), T0 + ms).world.actors;
		expect(at(15 * SEC)["s:a"]!.pose).toBe("bellRing");
		expect(at(30 * SEC)["s:a"]!.pose).toBe("ticketPolite");
		expect(at(60 * SEC)["s:a"]!.pose).toBe("ticketWait");
		// The first in line has someone behind to sigh to; the last doesn't.
		const later = at(3 * MIN);
		expect(later["s:a"]!.pose).toBe("ticketChat");
		expect(later["s:bb"]!.pose).toBe("ticketWait");
		expect(at(6 * MIN)["s:bb"]!.pose).toBe("ticketSlump");
		expect(cueFor(at(7 * MIN)["s:bb"]!, T0 + 7 * MIN).loops).toBe(Infinity);
	});
});
