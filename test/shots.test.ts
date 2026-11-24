// The shot picker (src/scene/director/shots.ts): compact mode's camera direction, as pure data.
import { describe, expect, test } from "bun:test";
import { type News, type ShotInput, type ShotState, SHOTS, newsFrom, nextShot, scoreByArea, shotWake, tilesFor } from "../src/scene/director/shots";
import type { World, WorldEvent } from "../src/scene/director/types";
import type { Session } from "../src/watcher/model";

const T0 = 1_000_000;
const AREAS = [
	{ id: "room:teapot", kind: "project" },
	{ id: "room:kettle", kind: "project" },
	{ id: "room:spoon", kind: "project" },
	{ id: "meeting", kind: "meeting" },
	{ id: "yours", kind: "yours" },
	{ id: "lobby", kind: "lobby" },
];
const input = (now: number, o: Partial<ShotInput> = {}): ShotInput => ({ now, news: [], areas: AREAS, score: {}, waiting: false, ...o });
const news = (reason: News["reason"], area: string, at: number, key = `s:${area}`): News => ({ reason, area, at, key });

/** Run the picker over a sequence of inputs, as the app does. */
function run(steps: ShotInput[], from?: ShotState): ShotState[] {
	const out: ShotState[] = [];
	let s = from;
	for (const i of steps) out.push((s = nextShot(s, i)));
	return out;
}

describe("resting", () => {
	test("all idle: the whole office; busy: the busiest room; someone waiting: your office", () => {
		expect(nextShot(undefined, input(T0)).shot).toMatchObject({ stop: { kind: "office" }, reason: "idle" });
		expect(nextShot(undefined, input(T0, { score: { "room:teapot": 10, "room:kettle": 30 } })).shot).toMatchObject({
			stop: { kind: "room", id: "room:kettle" },
			reason: "busiest",
		});
		expect(nextShot(undefined, input(T0, { score: { "room:kettle": 30 }, waiting: true })).shot).toMatchObject({
			stop: { kind: "room", id: "yours" },
			reason: "waiting",
		});
	});

	test("ties go to the first room in reading order", () => {
		expect(nextShot(undefined, input(T0, { score: { "room:spoon": 10, "room:teapot": 10 } })).shot.area).toBe("room:teapot");
	});

	test("hysteresis: the rest moves only after its hold, and only to a clearly busier room", () => {
		const first = nextShot(undefined, input(T0, { score: { "room:teapot": 20, "room:kettle": 10 } }));
		expect(first.shot.area).toBe("room:teapot");
		// Kettle edges ahead: no move during the hold, nor after it while it is less than 1.5× busier.
		const [a, b] = run(
			[
				input(T0 + 10_000, { score: { "room:teapot": 20, "room:kettle": 50 } }),
				input(T0 + SHOTS.holdMs + 1, { score: { "room:teapot": 20, "room:kettle": 25 } }),
			],
			first,
		);
		expect(a!.shot.area).toBe("room:teapot");
		expect(b!.shot.area).toBe("room:teapot");
		expect(b).toBe(a!); // nothing changed: the same state back
		const c = nextShot(b, input(T0 + SHOTS.holdMs + 2, { score: { "room:teapot": 20, "room:kettle": 31 } }));
		expect(c.shot).toMatchObject({ area: "room:kettle", reason: "busiest", since: T0 + SHOTS.holdMs + 2 });
	});

	test("a rest room going quiet gives way (after the minimum), down to the whole office", () => {
		const first = nextShot(undefined, input(T0, { score: { "room:teapot": 20 } }));
		expect(nextShot(first, input(T0 + 1000, { score: {} })).shot.area).toBe("room:teapot");
		expect(nextShot(first, input(T0 + SHOTS.minMs, { score: {} })).shot.stop).toEqual({ kind: "office" });
	});
});

describe("news", () => {
	test("cuts to the room where it happened and holds it", () => {
		const rest = nextShot(undefined, input(T0, { score: { "room:teapot": 20 } }));
		const at = T0 + 8000;
		const s = nextShot(rest, input(at, { score: { "room:teapot": 20 }, news: [news("pr", "room:kettle", at)] }));
		expect(s.shot).toMatchObject({ stop: { kind: "room", id: "room:kettle" }, reason: "pr", since: at, until: at + SHOTS.holdMs });
		expect(shotWake(s, at)).toBe(at + SHOTS.holdMs);
		// Held while it lasts, even with the busiest room elsewhere...
		expect(nextShot(s, input(at + 10_000, { score: { "room:teapot": 99 }, news: [news("pr", "room:kettle", at)] })).shot.area).toBe("room:kettle");
		// ...then back to the rest, and the same news doesn't bring it back.
		const after = nextShot(s, input(at + SHOTS.holdMs, { score: { "room:teapot": 99 }, news: [news("pr", "room:kettle", at)] }));
		expect(after.shot).toMatchObject({ area: "room:teapot", reason: "busiest" });
		expect(shotWake(after, at + SHOTS.holdMs)).toBeUndefined();
	});

	test("no cut within the minimum of the last one", () => {
		const rest = nextShot(undefined, input(T0));
		const at = T0 + 1000;
		const early = nextShot(rest, input(at, { news: [news("red", "room:kettle", at)] }));
		expect(early).toBe(rest);
		const later = nextShot(early, input(T0 + SHOTS.minMs, { news: [news("red", "room:kettle", at)] }));
		expect(later.shot).toMatchObject({ area: "room:kettle", reason: "red" });
	});

	test("during a hold only much weightier news cuts away; the rest waits its turn", () => {
		const at = T0;
		const held = nextShot(undefined, input(at, { news: [news("pr", "room:kettle", at)] }));
		expect(held.shot.reason).toBe("pr");
		// A red test elsewhere (70 vs 60): not enough to cut away mid-hold.
		const n2 = [news("pr", "room:kettle", at), news("red", "room:spoon", at + 6000)];
		expect(nextShot(held, input(at + 6000, { news: n2 })).shot.area).toBe("room:kettle");
		// Someone waiting on you (100): cuts to your office.
		const n3 = [...n2, news("waiting", "yours", at + 7000)];
		const wait = nextShot(held, input(at + 7000, { news: n3, waiting: true }));
		expect(wait.shot).toMatchObject({ area: "yours", reason: "waiting" });
		// When the wait's hold ends, the red test (still fresh) gets its turn, then the rest (your office).
		const red = nextShot(wait, input(at + 7000 + SHOTS.holdMs, { news: n3, waiting: true }));
		expect(red.shot).toMatchObject({ area: "room:spoon", reason: "red" });
		const back = nextShot(red, input(at + 7000 + 2 * SHOTS.holdMs, { news: n3, waiting: true }));
		expect(back.shot).toMatchObject({ area: "yours", reason: "waiting" });
		expect(back.shot.news).toBeUndefined();
	});

	test("news in the room on screen extends the hold with no cut, keeping the weightier reason", () => {
		const held = nextShot(undefined, input(T0, { news: [news("red", "room:kettle", T0)] }));
		const more = nextShot(held, input(T0 + 15_000, { news: [news("red", "room:kettle", T0), news("feud", "room:kettle", T0 + 15_000, "a:x")] }));
		expect(more.shot).toMatchObject({ area: "room:kettle", reason: "red", since: T0, until: T0 + 15_000 + SHOTS.holdMs });
	});

	test("stale news is ignored; the weightiest fresh news goes first, then the newest", () => {
		const s = nextShot(undefined, input(T0 + SHOTS.freshMs + 1, { news: [news("waiting", "yours", T0)] }));
		expect(s.shot.reason).toBe("idle");
		const n = [news("feud", "room:teapot", T0 + 3), news("red", "room:spoon", T0 + 1), news("red", "room:kettle", T0 + 2)];
		expect(nextShot(undefined, input(T0 + 5, { news: n })).shot.area).toBe("room:kettle");
	});

	test("a room that vanishes is dropped at once", () => {
		const held = nextShot(undefined, input(T0, { news: [news("pr", "room:kettle", T0)] }));
		const gone = nextShot(held, input(T0 + 100, { areas: AREAS.filter((a) => a.id !== "room:kettle"), score: { "room:spoon": 3 } }));
		expect(gone.shot.area).toBe("room:spoon");
	});

	test("no ping-pong: two rooms trading news every few seconds make at most one cut per hold", () => {
		let s = nextShot(undefined, input(T0, { score: { "room:teapot": 10 } }));
		const all: News[] = [];
		let cuts = 0;
		for (let t = 1; t <= 60; t++) {
			const now = T0 + t * 2000;
			all.push(news(t % 2 ? "red" : "pr", t % 2 ? "room:kettle" : "room:spoon", now, `k${t}`));
			const next = nextShot(s, input(now, { score: { "room:teapot": 10 }, news: all.filter((n) => now - n.at <= SHOTS.freshMs) }));
			if (next.shot.since !== s.shot.since) cuts++;
			s = next;
		}
		// 120 s of news every 2 s: a cut at most every hold (20 s), plus the first.
		expect(cuts).toBeLessThanOrEqual(120_000 / SHOTS.holdMs + 1);
		expect(cuts).toBeGreaterThan(0);
	});
});

describe("pinning and starting over", () => {
	test("a pinned room holds the camera whatever happens; unpinned, news is back", () => {
		const pinned = nextShot(undefined, input(T0, { pinned: "room:spoon" }));
		expect(pinned.shot).toMatchObject({ stop: { kind: "room", id: "room:spoon" }, reason: "pinned", pinned: true, until: Infinity });
		expect(shotWake(pinned, T0)).toBeUndefined();
		const n = [news("waiting", "yours", T0 + 1000)];
		expect(nextShot(pinned, input(T0 + 1000, { pinned: "room:spoon", news: n, waiting: true }))).toBe(pinned);
		const free = nextShot(pinned, input(T0 + 2000, { news: n, waiting: true }));
		expect(free.shot).toMatchObject({ area: "yours", reason: "waiting", pinned: false });
	});

	test("fresh (back on screen) skips the minimum and the hold: straight to the most important thing", () => {
		const held = nextShot(undefined, input(T0, { news: [news("feud", "room:kettle", T0)] }));
		const n = [news("feud", "room:kettle", T0), news("compaction", "room:spoon", T0 + 500)];
		expect(nextShot(held, input(T0 + 1000, { news: n })).shot.area).toBe("room:kettle");
		expect(nextShot(held, input(T0 + 1000, { news: n, fresh: true })).shot.area).toBe("room:spoon");
	});

	test("deterministic: the same inputs give the same shots", () => {
		const steps = [
			input(T0, { score: { "room:teapot": 4 } }),
			input(T0 + 9000, { news: [news("rush", "room:kettle", T0 + 9000)] }),
			input(T0 + 40_000, { score: { "room:spoon": 9 } }),
		];
		expect(run(steps)).toEqual(run(steps));
	});
});

describe("from the director", () => {
	const world = {
		at: T0,
		actors: {
			"s:a": { key: "s:a", area: "room:teapot" },
			"a:a:1": { key: "a:a:1", area: "room:teapot" },
			"s:b": { key: "s:b", area: "yours", gone: T0 + 5 },
		},
		builds: {},
	} as unknown as World;
	const areaOf = (s: string) => ({ a: "room:teapot", b: "room:kettle" })[s];

	test("events become news: poses where the actor stands, builds and rush in the session's room, waits at your office", () => {
		const events: WorldEvent[] = [
			{ type: "pose", key: "a:a:1", at: T0, pose: "stampRed", as: "lead", acted: true },
			{ type: "pose", key: "s:a", at: T0, pose: "typing", as: "lead", acted: false },
			{ type: "pose", key: "s:a", at: T0, pose: "copierFeud", as: "lead", acted: false },
			{ type: "pose", key: "s:b", at: T0, pose: "prOpened", as: "lead", acted: true },
			{ type: "build", session: "b", at: T0, pieces: 4, change: "top" },
			{ type: "build", session: "b", at: T0, pieces: 3, change: "add" },
			{ type: "rush", session: "a", at: T0, state: "start", heat: 95 },
			{ type: "rush", session: "a", at: T0, state: "end", heat: 40 },
			{ type: "waiting", key: "s:a", at: T0, state: "start", area: "room:teapot" },
		];
		expect(newsFrom(events, world, areaOf, "yours")).toEqual([
			{ reason: "red", area: "room:teapot", at: T0, key: "a:a:1" },
			{ reason: "feud", area: "room:teapot", at: T0, key: "s:a" },
			{ reason: "pr", area: "room:kettle", at: T0, key: "b" },
			{ reason: "rush", area: "room:teapot", at: T0, key: "a" },
			{ reason: "waiting", area: "yours", at: T0, key: "s:a" },
		]);
	});

	test("scores add heat and busy sessions by room; tiles show the most pressing state", () => {
		const s = (id: string, state: string, children: Session[] = []) =>
			({ id, state, project: "p", origin: "cli", stateSince: T0, startedAt: T0, agents: [], children }) as unknown as Session;
		const score = scoreByArea(
			[s("a", "busy", [s("c", "busy")]), s("b", "idle")],
			{},
			(id) => ({ a: "room:teapot", c: "room:teapot", b: "room:kettle" })[id],
			T0,
		);
		expect(score).toEqual({ "room:teapot": 2 * SHOTS.busyScore, "room:kettle": 0 });
		const named = AREAS.slice(0, 5).map((a) => ({ ...a, name: a.id }));
		expect(tilesFor(named, score, new Set(["room:kettle"]), new Set(["room:spoon", "yours"])).map((t) => t.state)).toEqual([
			"busy",
			"rush",
			"waiting",
			"idle",
			"waiting",
		]);
	});
});
