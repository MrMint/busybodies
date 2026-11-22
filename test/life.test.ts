// Life (src/scene/rig/life.ts): blinks and glances are a pure function of id and time.
import { describe, expect, test } from "bun:test";
import { BLINK_MS, blinking, glancing, lifeAt } from "../src/scene/rig/life";

const ids = Array.from({ length: 40 }, (_, i) => `s:life-${i}`);

describe("life", () => {
	test("the same id and time always give the same beat", () => {
		for (const id of ids) for (let ms = 0; ms < 30_000; ms += 97) expect(lifeAt(id, ms, "rest")).toEqual(lifeAt(id, ms, "rest"));
	});

	test("everyone blinks a few times a minute, briefly, and not in step", () => {
		const firsts = new Set<number>();
		for (const id of ids) {
			let blinks = 0;
			let shut = 0;
			let was = false;
			let first = -1;
			for (let ms = 0; ms < 60_000; ms += 10) {
				const b = blinking(id, ms);
				if (b && !was) {
					blinks++;
					if (first < 0) first = ms;
				}
				if (b) shut += 10;
				was = b;
			}
			expect(blinks).toBeGreaterThanOrEqual(10);
			expect(blinks).toBeLessThanOrEqual(30);
			// Eyes are shut well under a tenth of the time.
			expect(shut / 60_000).toBeLessThan(0.08);
			firsts.add(Math.round(first / 100));
		}
		expect(firsts.size).toBeGreaterThan(ids.length / 2);
		expect(BLINK_MS).toBeLessThan(200);
	});

	test("glances come now and then, small, and come back", () => {
		for (const id of ids) {
			let away = 0;
			for (let ms = 0; ms < 120_000; ms += 50) {
				const [x, y] = glancing(id, ms);
				if (x || y) away += 50;
				expect(Math.abs(x)).toBeLessThanOrEqual(3.5);
				expect(Math.abs(y)).toBeLessThanOrEqual(3);
			}
			expect(away / 120_000).toBeLessThan(0.4);
		}
	});

	test("shut or sleepy eyes don't blink", () => {
		for (const id of ids) for (let ms = 0; ms < 20_000; ms += 10) {
			expect(lifeAt(id, ms, "closed").blink).toBe(false);
			expect(lifeAt(id, ms, "star").blink).toBe(false);
		}
	});
});
