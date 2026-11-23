// Themes without a renderer: the words each theme uses, the saved setting, and the factory's robot
// arm as plain motion (it moves only while it has a job, and lets go when the office expects).
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSettings, settingsFile, writeSettings } from "../src/bun/settings";
import { ARM, ArmPlan, solve } from "../src/scene/theme/armplan";
import { THEME_IDS, themeId } from "../src/scene/theme/id";
import { FACTORY_WORDS, KITCHEN_WORDS, OFFICE_WORDS, wordsFor } from "../src/scene/theme/words";
import { FloorPlan } from "../src/scene/office/layout";

describe("theme words", () => {
	test("?theme= picks a known theme, anything else is the office", () => {
		expect(themeId("factory")).toBe("factory");
		expect(themeId("kitchen")).toBe("kitchen");
		expect(themeId("office")).toBe("office");
		expect(themeId("castle")).toBe("office");
		expect(themeId(null)).toBe("office");
	});

	test("every theme names every common area and fills the same sign slots", () => {
		for (const id of THEME_IDS) {
			const w = wordsFor(id);
			for (const k of ["meeting", "lobby", "yours", "kitchen", "vacant"] as const) {
				expect(w.areas[k].length).toBeGreaterThan(0);
				expect(w.subs[k].length).toBeGreaterThan(0);
			}
			expect(Object.keys(w.signs).sort()).toEqual(Object.keys(OFFICE_WORDS.signs).sort());
			expect(w.serving(3).body).toBe("No. 3");
			expect(w.columns).toHaveLength(3);
		}
		expect(FACTORY_WORDS.areas.kitchen).toBe("break room");
		expect(FACTORY_WORDS.areas.yours).toBe("foreman's office");
		// The Line: review at the pass, waiting on you is "Service!", the planner is the ticket rail.
		expect(KITCHEN_WORDS.areas.meeting).toBe("the pass");
		expect(KITCHEN_WORDS.serving(undefined).title).toBe("SERVICE!");
		expect(KITCHEN_WORDS.columns).toEqual(["ORDERED", "FIRING", "SERVED"]);
	});

	test("the layout names areas with the office's words in any theme (the name is its identity)", () => {
		const world = new FloorPlan().update({ at: 0, sessions: [] } as never);
		expect(world.areas.map((a) => a.name)).toEqual(["meeting room", "lobby", "your office", "kitchen"]);
	});
});

describe("settings", () => {
	test("a missing or torn file gives the defaults; a change is saved and keeps unknown keys", () => {
		const dir = mkdtempSync(join(tmpdir(), "bb-settings-"));
		const file = settingsFile(dir);
		expect(readSettings(file).theme).toBe("office");
		writeFileSync(file, "{ torn");
		expect(readSettings(file).theme).toBe("office");
		writeFileSync(file, JSON.stringify({ theme: "castle", later: 1 }));
		expect(readSettings(file).theme).toBe("office");
		writeSettings(file, { theme: "factory" });
		expect(readSettings(file).theme).toBe("factory");
		expect(JSON.parse(readFileSync(file, "utf8")).later).toBe(1);
	});
});

describe("the robot arm", () => {
	const arm = () => new ArmPlan(1000, 120);

	test("at rest it is still: stepping it does nothing", () => {
		const a = arm();
		expect(a.moving).toBe(false);
		const rest = a.pose;
		expect(a.step(1000)).toBe(false);
		expect(a.pose).toEqual(rest);
	});

	test("a piece: it carries it over, lets go when it said it would, and comes back still", () => {
		const a = arm();
		const at = { x: 1300, y: 300 };
		const release = a.place(at)!;
		expect(release).toBeGreaterThan(0);
		expect(a.moving).toBe(true);
		expect(a.pose.holding).toBe(true);
		a.step(release - 1);
		expect(a.pose.holding).toBe(true);
		// Just before it lets go, the piece hangs over its spot.
		expect(Math.abs(a.pose.wrist.x - at.x)).toBeLessThan(1);
		expect(Math.abs(a.pose.wrist.y + ARM.hold - at.y)).toBeLessThan(2);
		a.step(2);
		expect(a.pose.holding).toBe(false);
		const ms = a.jobs[0]!.ms;
		a.step(ms);
		expect(a.moving).toBe(false);
		expect(a.pose).toEqual(a.rest);
		expect(a.step(16)).toBe(false);
	});

	test("jobs queue: each lets go after the ones ahead, and past the queue a piece lands without it", () => {
		const a = arm();
		const r1 = a.place({ x: 1200, y: 300 })!;
		const r2 = a.place({ x: 1250, y: 300 })!;
		expect(r2).toBeGreaterThan(r1 + 200);
		a.place({ x: 1300, y: 300 });
		expect(a.place({ x: 1350, y: 300 })).toBeUndefined();
		expect(a.jobs).toHaveLength(ARM.queue + 1);
	});

	test("the PR's crate: picked up empty-handed, carried to the dock, let go there", () => {
		const a = arm();
		const from = { x: 1250, y: 300 };
		const to = { x: 1045, y: 400 };
		const release = a.ship(from, to)!;
		expect(a.pose.holding).toBe(false);
		a.step(release - 1);
		expect(a.pose.holding).toBe(true);
		expect(Math.abs(a.pose.wrist.x - to.x)).toBeLessThan(1);
		a.step(10_000);
		expect(a.moving).toBe(false);
	});

	test("the joints reach the wrist, with the elbow above the line to it", () => {
		const shoulder = { x: 0, y: 0 };
		for (const wrist of [
			{ x: 40, y: 14 },
			{ x: 30, y: 300 },
			{ x: -40, y: 200 },
			{ x: 200, y: 60 },
		]) {
			const j = solve(shoulder, wrist);
			expect(Math.hypot(j.elbow.x, j.elbow.y)).toBeCloseTo(ARM.upper, 5);
			const end = { x: j.elbow.x + Math.cos(j.fore) * j.length, y: j.elbow.y + Math.sin(j.fore) * j.length };
			expect(end.x).toBeCloseTo(wrist.x, 5);
			expect(end.y).toBeCloseTo(wrist.y, 5);
			// Above the shoulder-to-wrist line (smaller y at the elbow's x).
			const t = wrist.x !== 0 ? j.elbow.x / wrist.x : 0;
			if (t > 0 && t < 1) expect(j.elbow.y).toBeLessThan(wrist.y * t + 1e-6);
		}
	});
});
