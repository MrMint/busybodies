// Sound's pure parts: which director events become which earcons, the rate limit, the variation
// from an event's id, and pan and loudness. The WebAudio side is checked in e2e/sound.test.ts.
// Actors here are invented and only carry the fields sound reads.
import { describe, expect, test } from "bun:test";
import type { Actor, World, WorldEvent } from "../src/scene/director";
import { BAKERY_STEP, Ears, Gate, LEVEL, LIMITS, MAX_VOICES, RING, Voices, bakeryBeat, hashId, heatOf, loudness, panFor, seq, vary, zoomedArea } from "../src/mainview/sound";

const actor = (key: string, extra: Partial<Actor> = {}, seen: Partial<Actor["seen"]> = {}): Actor =>
	({ key, area: "room:pebble", mood: "idle", seen: { prs: [], hires: [], ...seen }, ...extra }) as Actor;
const world = (...actors: Actor[]): World => ({ at: 0, actors: Object.fromEntries(actors.map((a) => [a.key, a])), builds: {} });

describe("ears", () => {
	test("the first world is the baseline: no bell for a room already waiting", () => {
		const ears = new Ears();
		const first = ears.hear([{ type: "waiting", key: "s:1", at: 1, state: "start", area: "room:pebble" }], world(actor("s:1", {}, { failAt: 5, prs: [3] })));
		expect(first).toEqual([]);
	});

	test("a new wait rings the bell; a new fail, compaction and PR each have theirs", () => {
		const ears = new Ears();
		ears.hear([], world(actor("s:1"), actor("s:2", { homeArea: "room:quartz", area: "lobby" })));
		const events: WorldEvent[] = [{ type: "waiting", key: "s:1", at: 10, state: "start", area: "room:pebble" }];
		const cues = ears.hear(events, world(actor("s:1", {}, { failAt: 9 }), actor("s:2", { homeArea: "room:quartz", area: "lobby" }, { compactAt: 8, prs: [42] })));
		// Ranked: the wait on you first, so a red in the same beat can't crowd out the bell.
		expect(cues.map((c) => [c.kind, c.id, c.area])).toEqual([
			["bell", "bell:s:1:10", "room:pebble"],
			["chime", "chime:s:2:42", "room:quartz"],
			["red", "red:s:1:9", "room:pebble"],
			["rustle", "rustle:s:2:8", "room:quartz"],
		]);
		// The same signals again are not news.
		expect(ears.hear([], world(actor("s:1", {}, { failAt: 9 }), actor("s:2", {}, { compactAt: 8, prs: [42] })))).toEqual([]);
	});

	test("a newcomer's first look is its baseline", () => {
		const ears = new Ears();
		ears.hear([], world(actor("s:1")));
		expect(ears.hear([], world(actor("s:1"), actor("a:9", {}, { failAt: 3, prs: [1] })))).toEqual([]);
	});

	test("a test trip that ends with no new fail is a green stamp; one that went red is not", () => {
		const ears = new Ears();
		const station = "room:pebble:test:0";
		ears.hear([{ type: "trip", key: "a:1", at: 1, station, state: "start" }], world(actor("a:1")));
		const green = ears.hear([{ type: "trip", key: "a:1", at: 20, station, state: "end" }], world(actor("a:1")));
		expect(green).toEqual([{ kind: "stamp", id: "stamp:a:1:20", key: "a:1", area: "room:pebble" }]);
		ears.hear([{ type: "trip", key: "a:1", at: 30, station, state: "start" }], world(actor("a:1")));
		const red = ears.hear([{ type: "trip", key: "a:1", at: 40, station, state: "end" }], world(actor("a:1", {}, { failAt: 35 })));
		expect(red.map((c) => c.kind)).toEqual(["red"]);
	});

	test("the copier feud grinds", () => {
		const ears = new Ears();
		ears.hear([], world(actor("a:1")));
		const cues = ears.hear([{ type: "pose", key: "a:1", at: 5, pose: "copierFeud", as: "lead", acted: false }], world(actor("a:1")));
		expect(cues.map((c) => c.kind)).toEqual(["grind"]);
	});
});

describe("gate", () => {
	test("one per kind every few seconds, a gap between any two, and a cap per window", () => {
		const g = new Gate();
		expect(g.admit("bell", 0)).toBe(true);
		expect(g.admit("bell", 1_000)).toBe(false);
		expect(g.admit("chime", 100)).toBe(false);
		expect(g.admit("chime", LIMITS.gapMs)).toBe(true);
		expect(g.admit("bell", LIMITS.perKindMs)).toBe(true);
		expect(g.admit("red", LIMITS.perKindMs + 1_000)).toBe(true);
		expect(g.admit("rustle", LIMITS.perKindMs + 2_000)).toBe(false);
		expect(g.admit("rustle", LIMITS.windowMs + 1)).toBe(true);
	});
});

describe("voices", () => {
	test("at most MAX_VOICES ring at once; the rest wait their turn, but a bell takes the oldest's place", () => {
		const v = new Voices<string>();
		expect(v.admit("chime", 0, 0 + RING.chime, "chime")).toEqual({ ok: true });
		expect(v.admit("red", 0.6, 0.6 + RING.red, "red")).toEqual({ ok: true });
		expect(MAX_VOICES).toBe(2);
		expect(v.count(0.7)).toBe(2);
		expect(v.admit("stamp", 0.7, 0.95, "stamp")).toEqual({ ok: false });
		expect(v.admit("bell", 0.8, 0.8 + RING.bell, "bell")).toEqual({ ok: true, steal: "chime" });
		// Once the red has rung out, there's room again.
		expect(v.admit("stamp", 1.6, 1.85, "stamp")).toEqual({ ok: true });
		expect(v.count(3)).toBe(0);
	});

	test("every earcon has a ring length and a level, and the mix stays even", () => {
		for (const kind of ["bell", "stamp", "red", "rustle", "chime", "grind"] as const) {
			expect(RING[kind]).toBeGreaterThan(0);
			expect(RING[kind]).toBeLessThan(3);
			expect(LEVEL[kind]).toBeGreaterThan(0);
		}
	});
});

describe("placing and varying", () => {
	test("variation is the same for the same id, and stays small", () => {
		expect(vary("bell:s:1:10")).toEqual(vary("bell:s:1:10"));
		expect(vary("bell:s:1:10")).not.toEqual(vary("bell:s:1:11"));
		for (const id of ["a", "b", "bell:x", "chime:y:42"]) {
			const v = vary(id);
			expect(v.pitch).toBeGreaterThanOrEqual(0.95);
			expect(v.pitch).toBeLessThanOrEqual(1.05);
			expect(v.delay).toBeGreaterThanOrEqual(0);
			expect(v.delay).toBeLessThanOrEqual(0.04);
			// About ±1.5 dB.
			expect(v.level).toBeGreaterThanOrEqual(0.84);
			expect(v.level).toBeLessThanOrEqual(1.16);
		}
		// The level comes from other bits than the pitch: two ids can share one and not the other.
		const ids = Array.from({ length: 64 }, (_, i) => `bell:s:${i}`);
		expect(new Set(ids.map((id) => vary(id).level.toFixed(3))).size).toBeGreaterThan(30);
	});

	test("pan follows the room's screen x; loudness the camera", () => {
		const view = { scale: 1, x: 0, y: 0 };
		expect(panFor({ x: 0, w: 200 }, view, 1000)).toBe(-0.64);
		expect(panFor({ x: 400, w: 200 }, view, 1000)).toBe(0);
		expect(panFor({ x: 900, w: 200 }, view, 1000)).toBe(0.8);
		expect(panFor(undefined, view, 1000)).toBe(0);
		expect(loudness("room:a", undefined)).toBe(1);
		expect(loudness("room:a", "room:a")).toBeGreaterThan(1);
		expect(loudness("room:a", "room:b")).toBeLessThan(1);
		const floor = { areas: [{ id: "room:a", desks: [{ id: "s-1" }] }] } as unknown as Parameters<typeof zoomedArea>[1];
		expect(zoomedArea({ kind: "office" }, floor)).toBeUndefined();
		expect(zoomedArea({ kind: "room", id: "room:a" }, floor)).toBe("room:a");
		expect(zoomedArea({ kind: "desk", id: "s-1" }, floor)).toBe("room:a");
	});

	test("heat: the share of a busy crowd, and full in a rush", () => {
		expect(heatOf(undefined)).toBe(0);
		expect(heatOf(world(actor("a", { mood: "busy" }), actor("b", { mood: "busy" }), actor("c")))).toBeCloseTo(2 / 6);
		expect(heatOf({ ...world(actor("a")), rush: { s: {} as never } })).toBe(1);
	});
});

describe("the bakery's room tone", () => {
	// An hour of quarter-second steps, drawn the way the tone draws them: one number per step from its index.
	const hour = (heat: number) => {
		const n = { steam: 0, door: 0 };
		for (let i = 0; i < 3600 / BAKERY_STEP; i++) {
			const beat = bakeryBeat(seq(hashId(`bakery:${i}`))(), heat);
			if (beat) n[beat]++;
		}
		return n;
	};

	test("steam about once a minute when quiet, every 15 s or so when busy; the door now and then", () => {
		const quiet = hour(0);
		const busy = hour(1);
		expect(quiet.steam).toBeGreaterThan(30);
		expect(quiet.steam).toBeLessThan(110);
		expect(busy.steam).toBeGreaterThan(160);
		expect(busy.steam).toBeLessThan(340);
		expect(quiet.door).toBeGreaterThan(10);
		expect(quiet.door).toBeLessThan(60);
	});

	test("mostly nothing, and the same every time", () => {
		expect(bakeryBeat(0.5, 1)).toBeUndefined();
		expect(bakeryBeat(0, 0)).toBe("steam");
		expect(bakeryBeat(0.005, 0)).toBe("door");
		expect(hour(0.5)).toEqual(hour(0.5));
	});
});
