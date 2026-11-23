// Work sounds' pure parts: what a character sounds like, how likely a sound is on a step, the
// budget and its order, and notes in the key. The WebAudio side plays in the sound lab (?lab).
import { describe, expect, test } from "bun:test";
import { BUDGET, PALETTE, type Source, chance, hitsOn, keyNote, workSoundOf } from "../src/mainview/worksound";
import { MOCHI_KEY } from "../src/scene/sass/voiced";
import { THEME_IDS } from "../src/scene/theme/id";

const src = (key: string, kind: Source["kind"], near = false): Source => ({ key, kind, tempo: 1, area: near ? "room:pebble" : "room:moss", near });

describe("work sounds", () => {
	test("a busy character sounds like its work, or the station it's using; idle, queued or gone, nothing", () => {
		expect(workSoundOf({ mood: "busy", work: { kind: "edit" } })).toBe("type");
		expect(workSoundOf({ mood: "busy", work: { kind: "edit" }, trip: { kind: "test", queue: 0 } })).toBe("stamp");
		expect(workSoundOf({ mood: "busy", work: { kind: "edit" }, trip: { kind: "test", queue: 2 } })).toBe("type");
		expect(workSoundOf({ mood: "idle", work: { kind: "edit" } })).toBeUndefined();
		expect(workSoundOf({ mood: "busy", gone: 5, work: { kind: "edit" } })).toBeUndefined();
		expect(workSoundOf({ mood: "busy" })).toBeUndefined();
	});

	test("machines and stamps land on beats; typing follows the tempo", () => {
		expect(chance("machine", 4, 1)).toBeGreaterThan(0);
		expect(chance("machine", 5, 1)).toBe(0);
		expect(chance("stamp", 8, 1)).toBeGreaterThan(0);
		expect(chance("stamp", 4, 1)).toBe(0);
		expect(chance("type", 3, 1.25)).toBeGreaterThan(chance("type", 3, 0.8));
	});

	test("a step holds at most the budget, the room in view first, and the same every time", () => {
		const many = Array.from({ length: 20 }, (_, i) => src(`a:${i}`, "type", i < 3));
		let near = 0;
		for (let step = 0; step < 64; step++) {
			const far = hitsOn(many, step, false);
			expect(far.length).toBeLessThanOrEqual(BUDGET.far);
			const zoomed = hitsOn(many, step, true);
			expect(zoomed.length).toBeLessThanOrEqual(BUDGET.near);
			expect(hitsOn(many, step, true)).toEqual(zoomed);
			// A near hit is never behind a far one.
			const firstFar = zoomed.findIndex((h) => !h.near);
			if (firstFar >= 0) expect(zoomed.slice(firstFar).every((h) => !h.near)).toBe(true);
			near += zoomed.filter((h) => h.near).length;
		}
		expect(near).toBeGreaterThan(10);
	});

	test("turns: over a while, most of a busy crowd gets heard", () => {
		const many = Array.from({ length: 12 }, (_, i) => src(`a:${i}`, "type"));
		const heard = new Set<string>();
		for (let step = 0; step < 256; step++) for (const h of hitsOn(many, step, false)) heard.add(h.key);
		expect(heard.size).toBeGreaterThanOrEqual(10);
	});

	test("pitched sounds use the mochis' key, and every theme has every sound", () => {
		for (const r of [0, 0.3, 0.7, 0.99]) {
			const hz = keyNote(1000, r);
			expect(hz).toBeGreaterThanOrEqual(1000);
			const semis = Math.round(12 * Math.log2(hz / MOCHI_KEY.rootHz));
			expect(MOCHI_KEY.scale as readonly number[]).toContain(((semis % 12) + 12) % 12);
		}
		for (const t of THEME_IDS) expect(Object.keys(PALETTE[t]).sort()).toEqual(["chirp", "drop", "flip", "machine", "riffle", "shred", "stamp", "type"]);
	});
});
