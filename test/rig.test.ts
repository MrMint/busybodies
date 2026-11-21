// The rig's Pixi-free core: frames, pose timing, springs, interpolation and the atlas layout.
import { describe, expect, test } from "bun:test";
import { pack } from "../src/scene/rig/atlas";
import { CHANNELS, REST, channels, describe as describeFrame, diff, parseFrame } from "../src/scene/rig/frame";
import { FEEL, Spring, SpringSet, SUBSTEP_S, Tween, ease, lerp } from "../src/scene/rig/motion";
import { choosePose, frameAt, hash, unit } from "../src/scene/rig/player";
import { BEAT_MS, HABITS, POSE, POSES, duration } from "../src/scene/rig/poses";
import { ROLES, roleFor } from "../src/scene/rig/roles";
import { FACES } from "../src/scene/rig/vocab";

describe("frames", () => {
	test("tokens parse into a complete frame, everything else at rest", () => {
		const f = parseFrame("e-wide al-up hr-trophy bd-hop x-conf1");
		expect(f.eyes).toBe("wide");
		expect(f.armL).toBe("up");
		expect(f.armR).toBe("rest");
		expect(f.props).toEqual({ right: "trophy" });
		expect(f.body).toBe("hop");
		expect(f.fx).toBe("conf1");
		expect(diff(f)).toEqual({ eyes: "wide", armL: "up", body: "hop", fx: "conf1", holdR: "trophy" });
		expect(describeFrame(parseFrame(""))).toBe("{ rest }");
	});

	test("an unknown token fails loudly", () => {
		expect(() => parseFrame("al-flap")).toThrow(/unknown frame token "al-flap"/);
		expect(() => parseFrame("zz-top")).toThrow();
	});

	test("the right arm mirrors the left", () => {
		const c = channels(parseFrame("al-cheer ar-cheer"));
		expect(c.shoulderR).toBe(-c.shoulderL);
		expect(c.elbowR).toBe(-c.elbowL);
		expect(Object.keys(channels(REST)).sort()).toEqual([...CHANNELS].sort());
	});
});

describe("poses", () => {
	test("every brief pose exists", () => {
		const need = ["typing", "waiting", "waitingPlease", "testFailed", "prOpened", "handover", "asleep", "stalled", "done", "thinking", "celebrate", "grumpy"];
		for (const n of need) expect(POSE[n]).toBeDefined();
		expect(HABITS.map((p) => p.name)).toEqual(["feetUp", "faceDown", "chairSpin", "scrolling", "waterCooler", "stretch", "slowWalk"]);
		expect(POSES.filter((p) => p.rarity < 1).length).toBeGreaterThanOrEqual(1);
		expect(Object.keys(FACES)).toHaveLength(12);
	});

	test("two-handers keep both parts the same length", () => {
		for (const p of POSES.filter((x) => x.partner)) expect(duration(p.partner!.frames)).toBe(duration(p.frames));
	});

	test("every frame lasts whole beats and lines are listed", () => {
		for (const p of POSES) {
			for (const f of [...p.frames, ...(p.partner?.frames ?? [])]) {
				expect(f.ms % BEAT_MS).toBe(0);
				if (f.say) expect(p.lines).toContain(f.say);
			}
		}
	});
});

describe("pose timing", () => {
	const frames = [{ ms: 100 }, { ms: 200 }, { ms: 50 }];

	test("frames advance at their boundaries", () => {
		expect(frameAt(frames, 0, Infinity).index).toBe(0);
		expect(frameAt(frames, 99, Infinity).index).toBe(0);
		expect(frameAt(frames, 100, Infinity).index).toBe(1);
		expect(frameAt(frames, 299, Infinity).index).toBe(1);
		expect(frameAt(frames, 300, Infinity).index).toBe(2);
	});

	test("a loop wraps and counts passes", () => {
		expect(frameAt(frames, 350, Infinity)).toEqual({ index: 0, holding: false, pass: 1 });
		expect(frameAt(frames, 350 * 7 + 120, Infinity)).toEqual({ index: 1, holding: false, pass: 7 });
	});

	test("a once pose holds its last frame", () => {
		expect(frameAt(frames, 349, 1)).toEqual({ index: 2, holding: false, pass: 0 });
		expect(frameAt(frames, 350, 1)).toEqual({ index: 2, holding: true, pass: 1 });
		expect(frameAt(frames, 1e9, 1).holding).toBe(true);
		expect(frameAt(frames, 400, 2).index).toBe(0);
	});

	test("an empty pose holds", () => {
		expect(frameAt([], 50, Infinity).holding).toBe(true);
	});
});

describe("springs", () => {
	test("a spring settles on its target, and snaps there exactly", () => {
		const s = new Spring(0, FEEL.limb);
		s.target = 90;
		let t = 0;
		while (!s.settled && t < 5) {
			s.step(1 / 30);
			t += 1 / 30;
		}
		expect(s.settled).toBe(true);
		expect(s.value).toBe(90);
		expect(s.velocity).toBe(0);
		expect(t).toBeLessThan(1.5);
	});

	test("bouncy feels overshoot, critical damping doesn't", () => {
		const peak = (damping: number) => {
			const s = new Spring(0, { stiffness: 300, damping, epsilon: 0.01 });
			s.target = 1;
			let max = 0;
			for (let i = 0; i < 300; i++) max = Math.max(max, s.step(1 / 120));
			return max;
		};
		expect(peak(FEEL.body.damping)).toBeGreaterThan(1.2);
		expect(peak(1)).toBeLessThanOrEqual(1.0001);
	});

	test("the same time gives the same motion, however it is sliced", () => {
		const run = (slices: number[]) => {
			const s = new Spring(0, FEEL.body);
			s.target = 10;
			for (const dt of slices) s.step(dt);
			return s.value;
		};
		const thirtyFps = Array(15).fill(1 / 30);
		const sixtyFps = Array(30).fill(1 / 60);
		expect(run(thirtyFps)).toBeCloseTo(run(sixtyFps), 10);
		expect(run([0.5])).toBeCloseTo(run(sixtyFps), 10);
		expect(SUBSTEP_S).toBeLessThan(1 / 60);
	});

	test("a set is settled only when every spring is", () => {
		const set = new SpringSet({ a: 0, b: 0 }, () => FEEL.face);
		expect(set.settled).toBe(true);
		set.setTargets({ a: 1, b: 0 });
		expect(set.settled).toBe(false);
		for (let i = 0; i < 120; i++) set.step(1 / 60);
		expect(set.settled).toBe(true);
		expect(set.value("a")).toBe(1);
	});
});

describe("interpolation", () => {
	test("lerp and easings hit their ends", () => {
		expect(lerp(2, 10, 0.25)).toBe(4);
		for (const e of Object.values(ease)) {
			expect(e(0)).toBeCloseTo(0, 10);
			expect(e(1)).toBeCloseTo(1, 10);
		}
		expect(ease.back(0.8)).toBeGreaterThan(1); // overshoots before landing
	});

	test("a tween moves through its easing and stops at the end", () => {
		const t = new Tween(0, 100, 1000, ease.linear);
		expect(t.step(250)).toBe(25);
		expect(t.step(250)).toBe(50);
		expect(t.done).toBe(false);
		expect(t.step(5000)).toBe(100);
		expect(t.done).toBe(true);
		expect(new Tween(0, 1, 0).value).toBe(1);
	});

	test("springing between two frames passes through the frames in between", () => {
		const a = channels(parseFrame("al-low"));
		const b = channels(parseFrame("al-up"));
		const set = new SpringSet(a, () => FEEL.limb);
		set.setTargets(b);
		const seen: number[] = [];
		for (let i = 0; i < 30; i++) {
			set.step(1 / 30);
			seen.push(set.value("shoulderL"));
		}
		expect(seen[0]!).toBeGreaterThan(a.shoulderL);
		expect(seen[0]!).toBeLessThan(b.shoulderL);
		expect(seen.at(-1)).toBe(b.shoulderL);
	});
});

describe("variation", () => {
	test("hashes are stable and spread", () => {
		expect(hash("crowd-1")).toBe(hash("crowd-1"));
		expect(hash("crowd-1")).not.toBe(hash("crowd-2"));
		const u = unit("x", "y");
		expect(u).toBeGreaterThanOrEqual(0);
		expect(u).toBeLessThan(1);
	});

	test("a crowd slacks off in different ways, the same way each time", () => {
		const picks = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const p = choosePose("idle", `agent-${i}`, "builder");
			expect(choosePose("idle", `agent-${i}`, "builder").name).toBe(p.name);
			expect(p.habit).toBe(true);
			picks.add(p.name);
		}
		expect(picks.size).toBe(HABITS.filter((h) => h.trigger === "idle").length);
	});

	test("roles pick their own work, and the rare pose comes up about one time in twenty", () => {
		expect(choosePose("busy", "a", "builder").name).toBe("hammer");
		expect(choosePose("busy", "a", "lead").name).toBe("typing");
		let rare = 0;
		for (let n = 0; n < 2000; n++) if (choosePose("waiting", "lead-1", "lead", n).name === "waitingPlease") rare++;
		expect(rare).toBeGreaterThan(60);
		expect(rare).toBeLessThan(150);
	});

	test("agent types map onto the seven costumes", () => {
		expect(roleFor("reviewer")).toBe("reviewer");
		expect(roleFor("Explore")).toBe("explorer");
		expect(roleFor("scout")).toBe("scout");
		expect(roleFor("verifier")).toBe("verifier");
		expect(roleFor("designer")).toBe("designer");
		expect(roleFor("stream-builder")).toBe("builder");
		expect(roleFor(undefined)).toBe("builder");
		expect(ROLES).toHaveLength(7);
	});
});

describe("atlas layout", () => {
	test("parts pack without overlap, padded, inside the width", () => {
		const parts = Array.from({ length: 60 }, (_, i) => ({ name: `p${i}`, x: -10, y: -20, width: 20 + ((i * 37) % 90), height: 10 + ((i * 53) % 70) }));
		const { slots, width, height } = pack(parts, 512, 3);
		expect(slots).toHaveLength(60);
		for (const a of slots) {
			expect(a.x).toBeGreaterThanOrEqual(3);
			expect(a.x + a.width).toBeLessThanOrEqual(width - 3);
			expect(a.y + a.height).toBeLessThanOrEqual(height);
			for (const b of slots) {
				if (a === b) continue;
				const apart = a.x + a.width + 3 <= b.x || b.x + b.width + 3 <= a.x || a.y + a.height + 3 <= b.y || b.y + b.height + 3 <= a.y;
				expect(apart).toBe(true);
			}
		}
		// The anchor puts the painter's origin back where it drew.
		const s = slots.find((x) => x.name === "p0")!;
		expect(s.ax * s.width).toBeCloseTo(10, 5);
		expect(s.ay * s.height).toBeCloseTo(20, 5);
	});

	test("the layout is stable", () => {
		const parts = [{ name: "b", x: 0, y: 0, width: 5, height: 5 }, { name: "a", x: 0, y: 0, width: 5, height: 5 }];
		expect(pack(parts)).toEqual(pack([...parts].reverse()));
	});
});
