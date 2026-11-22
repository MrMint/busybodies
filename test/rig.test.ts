// The rig's Pixi-free core: frames, pose timing, springs, interpolation and the atlas layout.
import { describe, expect, test } from "bun:test";
import { pack } from "../src/scene/rig/pack";
import { CHANNELS, REST, channels, describe as describeFrame, diff, parseFrame } from "../src/scene/rig/frame";
import { FEEL, Spring, SpringSet, SUBSTEP_S, Tween, ease, lerp } from "../src/scene/rig/motion";
import { choosePose, frameAt, hash, unit } from "../src/scene/rig/player";
import { BEAT_MS, HABITS, POSE, POSES, duration } from "../src/scene/rig/poses";
import { ROLES, roleFor } from "../src/scene/rig/roles";
import { ARMS, FACES, SPOTS, type Arm } from "../src/scene/rig/vocab";
import { HANDOFF, PUPPET_HEIGHT, REACH, STATION, STATION_CREW_PX, TRAY, handAt, solveArm } from "../src/scene/rig/reach";
import { STATION_POSE, STATION_REACH } from "../src/scene/director/stations";

describe("frames", () => {
	test("tokens parse into a complete frame, everything else at rest", () => {
		const f = parseFrame("e-wide al-up hr-trophy bd-fwd x-conf1 w-nail2");
		expect(f.eyes).toBe("wide");
		expect(f.armL).toBe("up");
		expect(f.armR).toBe("rest");
		expect(f.props).toEqual({ right: "trophy", work: "nail2" });
		expect(f.body).toBe("fwd");
		expect(f.fx).toBe("conf1");
		expect(diff(f)).toEqual({ eyes: "wide", armL: "up", body: "fwd", fx: "conf1", holdR: "trophy", work: "nail2" });
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

	test("the body acts, it doesn't squash: no pose scales the body", () => {
		for (const p of POSES) {
			for (const f of [...p.frames, ...(p.partner?.frames ?? [])]) {
				const c = channels(f);
				expect(Math.abs(c.bodySX - 1)).toBeLessThan(0.05);
				expect(Math.abs(c.bodySY - 1)).toBeLessThan(0.05);
				expect(c.hop).toBe(0);
			}
		}
	});

	test("the builder's work changes the work: each work pose shows its prop changing state", () => {
		const states = (name: string) => new Set(POSE[name]!.frames.map((f) => f.props.work ?? ""));
		expect(states("hammer")).toEqual(new Set(["nail1", "nail2", "nail3"]));
		expect(states("tinker")).toEqual(new Set(["nut1", "nut2", "nut3"]));
		expect(states("poke")).toEqual(new Set(["stack", "stackL", "stackR"]));
		expect(POSE.thumb!.frames.at(-1)!.props.work).toBe("bent");
		// The brick goes from the palm to the build: held, then set down where the palm let go.
		expect(POSE.carry!.frames.every((f) => f.props.right === "brick")).toBe(true);
		expect(POSE.place!.frames[0]!.props.right).toBe("brick");
		expect(POSE.place!.frames.some((f) => f.props.work === "brick")).toBe(true);
		// The office draws the brick on its tower as `place` ends: the last frame's hands are empty.
		expect(POSE.place!.frames.at(-1)!.props).toEqual({});
		expect(POSE.place!.play).toBe("once");
		expect(duration(POSE.place!.frames)).toBeGreaterThanOrEqual(1000);
		expect(duration(POSE.place!.frames)).toBeLessThanOrEqual(1500);
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

describe("stations", () => {
	const stationPoses = [...new Set(Object.values(STATION_POSE).flatMap((p) => [p.work, ...(p.bad ? [p.bad] : [])]))];

	test("the working point is STATION_REACH in rig units", () => {
		expect(STATION.x).toBeCloseTo((STATION_REACH.x * PUPPET_HEIGHT) / STATION_CREW_PX, 6);
		expect(STATION.y).toBeCloseTo((STATION_REACH.y * PUPPET_HEIGHT) / STATION_CREW_PX, 6);
	});

	test("every station pose exists: work loops, a bad one plays once, and the queue waits", () => {
		for (const { work, bad } of Object.values(STATION_POSE)) {
			// Work loops while the tool runs; posting the PR is one drop.
			expect(POSE[work]?.play).toBe(work === "mailDrop" ? "once" : "loop");
			expect(POSE[work]?.trigger).toBe("working");
			if (bad) expect(POSE[bad]?.play).toBe("once");
		}
		expect(POSE.queueWait).toMatchObject({ play: "loop", trigger: "working" });
	});

	test("each station arm lands its hand (or what it holds) on the point it was solved for", () => {
		for (const [name, r] of Object.entries(REACH)) {
			expect(ARMS[name as Arm]).toBeDefined();
			const at = handAt(name as Arm, r.body, r.side ?? 1, r.grip);
			const miss = Math.hypot(at.x - r.at.x, at.y - r.at.y);
			if (miss > 1) throw new Error(`ARMS.${name} misses its point by ${miss.toFixed(1)}: re-solve it, solveArm gives ${JSON.stringify(solveArm(r.at, { ...r }))}`);
			// Reachable without locking the elbow straight.
			expect(ARMS[name as Arm][1]).not.toBe(0);
		}
	});

	test("a station arm is used with the body and the hand it was solved for", () => {
		for (const p of POSES) {
			for (const f of p.frames) {
				for (const [arm, side] of [[f.armR, 1], [f.armL, -1]] as const) {
					const r = REACH[arm];
					if (!r) continue;
					if (!r.mirror) expect(`${p.name} ${arm} side ${side}`).toBe(`${p.name} ${arm} side ${r.side ?? 1}`);
					if (!r.torso) expect(`${p.name} ${arm} body ${f.body}`).toBe(`${p.name} ${arm} body ${r.body}`);
				}
			}
		}
	});

	test("the station's parts are drawn in every frame, and the work changes them", () => {
		for (const name of stationPoses) for (const f of POSE[name]!.frames) expect(f.props.work).toBeDefined();
		const states = (name: string) => new Set(POSE[name]!.frames.map((f) => f.props.work));
		expect(states("fileFolder")).toEqual(new Set(["cabinet", "drawer", "drawerGap"]));
		expect(states("cardThumb")).toEqual(new Set(["cards", "cardsA", "cardsB", "cardsGap"]));
		expect(states("copierFeed")).toContain("copy2");
		expect(states("stampGreen")).toContain("formsOk");
		expect(states("phone")).toEqual(new Set(["note0", "note1", "note2", "note3", "noteFlip"]));
		expect(states("shred")).toContain("shredBuzz");
		// Bad news holds: the copier stays jammed, the form keeps its red mark, the letter stays in.
		expect(POSE.copierKick!.frames.at(-1)!.props.work).toBe("jammed");
		expect(POSE.stampRed!.frames.at(-1)!.props.work).toBe("formsNo");
		expect(POSE.mailDrop!.frames.at(-1)!.props.work).toBe("mail2");
		// The ink comes off on the form: the rubber is inked going down and dry coming up.
		const stamp = POSE.stampGreen!.frames;
		const down = stamp.findIndex((f) => f.armR === "stamp");
		expect(stamp[down]!.props.right).toBe("stampG");
		expect(stamp[down + 1]!.props).toMatchObject({ right: "stamp", work: "formsOk" });
	});
});

describe("wave 2", () => {
	const props = (name: string, as: "lead" | "partner" = "lead") => (as === "lead" ? POSE[name]!.frames : POSE[name]!.partner!.frames).map((f) => f.props);

	test("the contract holds: names, triggers and play modes the director plays", () => {
		const want: Record<string, "loop" | "once"> = {
			buried: "loop", ticketWait: "loop", bellRing: "once", stickyCarry: "loop", stickyPost: "once", rushRun: "loop",
			envelopeCarry: "loop", copierFeud: "loop", flourish: "once", handOff: "once",
		};
		for (const [name, play] of Object.entries(want)) expect(POSE[name]).toMatchObject({ play, trigger: "working" });
		expect(POSE.handOff!.partner?.role).toBe("builder");
	});

	test("walk poses step on whole beats, still readable at a run's walkTempo", () => {
		for (const name of ["stickyCarry", "rushRun", "envelopeCarry"]) {
			const fs = POSE[name]!.frames;
			// Legs move every frame or two, and at ×1.65 no frame is shorter than ~75 ms.
			expect(fs.every((f) => f.ms / 1.65 >= 75)).toBe(true);
			expect(new Set(fs.map((f) => f.feet)).size).toBeGreaterThanOrEqual(2);
		}
		// The run leans from the hips and pumps its arms against its legs, without scaling.
		const run = POSE.rushRun!.frames;
		expect(run.every((f) => f.body === "dash" || f.body === "dashUp")).toBe(true);
		expect(run.every((f) => f.armL !== f.armR)).toBe(true);
		expect(run.every((f) => f.fx?.startsWith("rush"))).toBe(true);
		expect(props("stickyCarry").every((p) => p.right?.startsWith("sticky"))).toBe(true);
		expect(props("envelopeCarry").every((p) => p.front === "bigEnvelope")).toBe(true);
	});

	test("the in-tray teeters, and its top sheet goes over the side", () => {
		const ws = props("buried").map((p) => p.work);
		expect(ws.every((w) => w?.startsWith("tray"))).toBe(true);
		for (const w of ["tray4", "tray4L", "tray4R", "traySlide", "trayDrop"] as const) expect(ws).toContain(w);
		expect(ws.indexOf("traySlide")).toBeLessThan(ws.indexOf("trayDrop"));
		// It peers over the pile: the eyes (55 up) clear the pile's top only on the toes.
		expect(-55 - 7).toBeLessThan(TRAY.buried);
		expect(-55).toBeGreaterThan(TRAY.buried);
	});

	test("the bell rings when the palm lands on it, and the ringer keeps its ticket", () => {
		const fs = POSE.bellRing!.frames;
		for (const f of fs) expect(f.props.left).toBe("ticket");
		const strike = fs.findIndex((f) => f.armR === "ring");
		expect(fs[strike]!.props.work).toBe("bellDing");
		expect(fs[strike]!.fx).toBe("ding");
		expect(fs[strike - 1]!.props.work).toBe("bell");
		expect(fs.at(-1)!.props.work).toBe("bell");
		expect(props("ticketWait").every((p) => p.right === "ticket")).toBe(true);
	});

	test("the sticky note goes from the fingertip to the planner, and the hands end empty", () => {
		const fs = POSE.stickyPost!.frames;
		const press = fs.findIndex((f) => f.armR === "stick");
		expect(fs[press - 1]!.props.right).toBe("sticky");
		expect(fs[press]!.props).toEqual({ work: "stickyOn" });
		expect(fs.slice(press).every((f) => f.props.work === "stickyOn")).toBe(true);
		expect(fs.at(-1)!.props.left ?? fs.at(-1)!.props.right).toBeUndefined();
	});

	test("the copier stays jammed through the feud, and the crumpled sheet is gone by the loop", () => {
		const fs = POSE.copierFeud!.frames;
		expect(fs.every((f) => ["jammed", "jabbed", "kicked", "kickSpit", "jam"].includes(f.props.work ?? ""))).toBe(true);
		expect(fs.some((f) => f.feet === "boot")).toBe(true);
		expect(fs.filter((f) => f.armR === "press").every((f) => f.props.work === "jabbed")).toBe(true);
		// The kick spits the sheet out; it's plucked, glared at, tossed.
		const kick = fs.findIndex((f) => f.feet === "boot");
		expect(fs[kick + 1]!.props.work).toBe("kickSpit");
		expect(fs.some((f) => f.props.right === "crumple" && f.armR === "card")).toBe(true);
		expect(fs[0]!.props.right).toBeUndefined();
		expect(fs.at(-1)!.props.right).toBeUndefined();
	});

	test("a hand-off passes one folder: never in two hands, never moving as it changes hands", () => {
		const { gap, hand, folder } = HANDOFF;
		expect(gap as number).toBe(2 * hand.x + folder.from + folder.to);
		const giver = POSE.handOff!.frames;
		const taker = POSE.handOff!.partner!.frames;
		// The taker steps in (at-s2) from its slot to the hand-off distance before it reaches.
		expect(taker[0]!.spot).toBe("here");
		expect(taker.slice(1).every((f) => f.spot === "s2")).toBe(true);
		expect(HANDOFF.slot - SPOTS.s2[0]).toBe(gap);
		let t = 0;
		const at = (fs: typeof giver, ms: number) => {
			let acc = 0;
			return fs.find((f) => (acc += f.ms) > ms)!;
		};
		let passed = false;
		for (; t < duration(giver); t += BEAT_MS) {
			const g = at(giver, t);
			const k = at(taker, t);
			const holders = [g.props.right === "folderOut", k.props.right === "folderOut" || k.props.right === "folderTuck"].filter(Boolean).length;
			expect(holders).toBeLessThanOrEqual(1);
			// While the giver holds it out, the taker's hand is on its far edge (or reaching).
			if (g.props.right === "folderOut" && g.armR === "offer" && k.armR === "offer") passed = true;
		}
		expect(passed).toBe(true);
		// Both hold it at arm's length with the same arm, so the folder sits in the same place:
		// the giver's near edge, mirrored across the gap, is the taker's far edge.
		const near = handAt("offer").x + folder.from;
		const far = handAt("offer").x + folder.to;
		expect(gap - far).toBeCloseTo(near, 0);
		expect(taker.at(-1)!.props.right).toBe("folderTuck");
		expect(giver.at(-1)!.props.right).toBeUndefined();
	});

	test("queueWait keeps the clipboard on the forward side, and rises rather than leans", () => {
		const fs = POSE.queueWait!.frames;
		expect(fs.every((f) => f.props.right === "clipF" && !f.props.left)).toBe(true);
		expect(fs.some((f) => f.body === "peer")).toBe(true);
		expect(fs.some((f) => f.body === "leanR" || f.body === "leanL")).toBe(false);
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

	test("limbs land and the body doesn't wobble: overshoot stays small, only a held tool follows through", () => {
		const peak = (feel: { stiffness: number; damping: number }) => {
			const s = new Spring(0, { ...feel, epsilon: 0.01 });
			s.target = 1;
			let max = 0;
			for (let i = 0; i < 300; i++) max = Math.max(max, s.step(1 / 120));
			return max;
		};
		expect(peak(FEEL.body)).toBeLessThan(1.01);
		expect(peak(FEEL.face)).toBeLessThan(1.01);
		expect(peak(FEEL.limb)).toBeLessThan(1.05);
		expect(peak(FEEL.tool)).toBeGreaterThan(peak(FEEL.limb));
		expect(peak(FEEL.tool)).toBeLessThan(1.12);
		expect(peak({ stiffness: 300, damping: 1 })).toBeLessThanOrEqual(1.0001);
	});

	test("a strike arrives inside a beat", () => {
		// A hammer's swing is one beat (130 ms); the arm must be most of the way there by then.
		const s = new Spring(0, FEEL.limb);
		s.target = 1;
		for (let t = 0; t < 0.13; t += 1 / 240) s.step(1 / 240);
		expect(s.value).toBeGreaterThan(0.85);
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
