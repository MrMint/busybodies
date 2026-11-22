// The light as data (plan-alive stream C): time-of-day phases from the hour, when the next one
// starts, the sun's window, the rush flicker, and the back walls' signs clear of head height.
import { describe, expect, test } from "bun:test";
// Pixi-free imports only: rig.test.ts mocks pixi.js for the whole run.
import { PHASES, PHASE_START, SHADOW, flicker, glassOf, msToNextPhase, panesOf, phaseOf, sunSpot } from "../src/scene/office/daylight";
import { FloorPlan, SIGN_FOOT } from "../src/scene/office/layout";
import { WALL } from "../src/scene/office/world";
import { LEAD_SIZE } from "../src/scene/office/placement";

/** The two themes' windows (theme/office.ts, theme/factory.ts OFFICE_LIGHT / FACTORY_LIGHT). */
const WINDOWS = [
	{ window: { inset: 5, panes: 2, transom: false, bar: 5 } },
	{ window: { inset: 4, height: 42, panes: 4, transom: true, bar: 2.5 } },
];

describe("time of day", () => {
	test("each hour falls in one phase, in the PaperNight order", () => {
		const by = Array.from({ length: 24 }, (_, h) => phaseOf(h));
		expect(by.slice(0, 6).every((p) => p === "night")).toBe(true);
		expect(by.slice(6, 10).every((p) => p === "morning")).toBe(true);
		expect(by.slice(10, 15).every((p) => p === "noon")).toBe(true);
		expect(by.slice(15, 18).every((p) => p === "afternoon")).toBe(true);
		expect(by.slice(18, 20).every((p) => p === "dusk")).toBe(true);
		expect(by.slice(20).every((p) => p === "night")).toBe(true);
		// ?hour= is forgiving: it wraps.
		expect(phaseOf(26)).toBe("night");
		expect(phaseOf(-1)).toBe("night");
		expect(phaseOf(14.9)).toBe("noon");
	});

	test("the next phase starts on its hour; the light is re-baked then and only then", () => {
		const at = (h: number, m = 0) => new Date(2026, 10, 22, h, m, 0, 0);
		expect(msToNextPhase(at(8, 30))).toBe(90 * 60_000); // to 10:00, noon
		expect(msToNextPhase(at(10))).toBe(5 * 3600_000); // to 15:00
		expect(msToNextPhase(at(19, 59))).toBe(60_000); // to 20:00, night
		expect(msToNextPhase(at(23))).toBe(7 * 3600_000); // through midnight to 06:00
		for (const p of PHASES) expect(phaseOf(PHASE_START[p])).toBe(p);
	});

	test("shadows fall away from the low sun: right in the morning, left late in the day", () => {
		expect(SHADOW.morning.x).toBeGreaterThan(0);
		expect(SHADOW.afternoon.x).toBeLessThan(0);
		expect(SHADOW.dusk.x).toBeLessThan(0);
		expect(Math.abs(SHADOW.noon.x)).toBeLessThan(Math.abs(SHADOW.morning.x));
	});
});

describe("the view out", () => {
	const windows = [
		{ x: 900, y: -400, w: 116, h: 74 },
		{ x: 100, y: -400, w: 116, h: 74 },
		{ x: 500, y: 140, w: 116, h: 74 },
	];

	test("the sun rises in the east window, sets in the west, the moon rides high in the middle", () => {
		expect(sunSpot(windows, "morning")!.x).toBe(100);
		expect(sunSpot(windows, "afternoon")!.x).toBe(900);
		expect(sunSpot(windows, "dusk")).toMatchObject({ x: 900, kind: "setting" });
		expect(sunSpot(windows, "night")).toMatchObject({ x: 500, kind: "moon" });
		expect(sunSpot(windows, "noon")).toBeUndefined();
		expect(sunSpot([], "morning")).toBeUndefined();
	});

	test("the glass sits inside each theme's window frame, and its panes tile it", () => {
		for (const light of WINDOWS) {
			const r = windows[0]!;
			const g = glassOf(r, light);
			expect(g.x).toBeGreaterThan(r.x);
			expect(g.x + g.w).toBeLessThan(r.x + r.w);
			expect(g.y + g.h).toBeLessThan(r.y + r.h);
			const panes = panesOf(g, light);
			expect(panes).toHaveLength(light.window.panes);
			const last = panes[panes.length - 1]!;
			expect(last.x + last.w).toBeCloseTo(g.x + g.w, 5);
		}
	});
});

describe("rush", () => {
	test("a rush room's light stutters now and then, and is steady most of the time", () => {
		const seed = 12345;
		const frames = Array.from({ length: 600 }, (_, i) => flicker(i * (1000 / 30), seed));
		const dark = frames.filter((a) => a > 0).length;
		expect(dark).toBeGreaterThan(0);
		expect(dark / frames.length).toBeLessThan(0.15);
		expect(Math.max(...frames)).toBeLessThanOrEqual(0.4);
		// Pure: the same clock gives the same flicker.
		expect(frames).toEqual(Array.from({ length: 600 }, (_, i) => flicker(i * (1000 / 30), seed)));
	});
});

describe("signs clear of head height", () => {
	test("every sign, whiteboard and frame ends above the head of a lead at the back row", () => {
		const s = (id: string, project: string, at: number) => ({ id, pid: 1, title: id, cwd: "/x", project, origin: "cli", state: "busy", stateSince: 0, startedAt: at, agents: [], children: [] });
		const world = new FloorPlan().update({ at: 0, sessions: [s("a", "alpha", 1), s("b", "alpha", 2), s("c", "beta", 3), s("d", "gamma", 4)] } as never);
		// A back-row lead stands 36 px into the floor; its head (and a hat) reach LEAD_SIZE + 8 above.
		const head = 36 - LEAD_SIZE - 8;
		let n = 0;
		for (const a of world.areas) {
			for (const w of a.wall) {
				if (w.kind !== "sign" && w.kind !== "whiteboard" && w.kind !== "frame") continue;
				n++;
				expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(a.floorY + head);
			}
		}
		expect(n).toBeGreaterThan(4);
		expect(SIGN_FOOT).toBeLessThan(WALL + head + 1);
	});
});
