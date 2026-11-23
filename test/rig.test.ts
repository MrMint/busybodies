// The rig's Pixi-free core: frames, pose timing, springs, interpolation, the atlas layout, and the
// themes' painters, measured through a stand-in for pixi.js.
import { describe, expect, mock, test } from "bun:test";
import { pack } from "../src/scene/rig/pack";
import { CHANNELS, REST, channels, describe as describeFrame, diff, parseFrame } from "../src/scene/rig/frame";
import { FEEL, Spring, SpringSet, SUBSTEP_S, Tween, ease, lerp } from "../src/scene/rig/motion";
import { choosePose, frameAt, hash, unit } from "../src/scene/rig/player";
import { BEAT_MS, HABITS, POSE, POSES, duration } from "../src/scene/rig/poses";
import { ROLES, roleFor } from "../src/scene/rig/roles";
import { ARMS, FACES, SPOTS, type Arm } from "../src/scene/rig/vocab";
import { HANDOFF, PUPPET_HEIGHT, REACH, STATION, STATION_CREW_PX, TRAY, WORK, handAt, solveArm } from "../src/scene/rig/reach";
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

	test("the agent tool's own types get costumes too", () => {
		expect(roleFor("Plan")).toBe("designer");
		expect(roleFor("claude-code-guide")).toBe("scout");
		expect(roleFor("code-reviewer")).toBe("reviewer");
		expect(roleFor("test-runner")).toBe("verifier");
		// A role's own name maps to itself, so a chosen costume survives another pass.
		for (const r of ROLES) expect(roleFor(r)).toBe(r);
	});

	test("a generic type's task picks its costume, by the first thing it is asked to do", () => {
		expect(roleFor("general-purpose", "Find where the timer is set")).toBe("scout");
		expect(roleFor("general-purpose", "Research how sessions are stored")).toBe("scout");
		expect(roleFor("general-purpose", "Review the diff for regressions")).toBe("reviewer");
		expect(roleFor("general-purpose", "Run the tests and confirm they pass")).toBe("verifier");
		expect(roleFor("general-purpose", "Design the settings screen")).toBe("designer");
		expect(roleFor("general-purpose", "Implement drift correction")).toBe("builder");
		expect(roleFor("general-purpose", "Find and fix the leak")).toBe("scout");
		expect(roleFor("general-purpose", "Fix the failing test")).toBe("builder");
		expect(roleFor("general-purpose", "Write tests for the parser")).toBe("builder");
		expect(roleFor(undefined, "Explore the oven module")).toBe("explorer");
		// Nothing to go on: a builder, as before.
		expect(roleFor("general-purpose", "Kettle stuff")).toBe("builder");
		expect(roleFor("general-purpose")).toBe("builder");
		// A type that names its job wins over its task.
		expect(roleFor("reviewer", "Fix the typo")).toBe("reviewer");
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

// The themes' painters, measured without a renderer: a stand-in for pixi.js records where each
// painter draws (a conservative box: control points, shapes' boxes, half a stroke's width), so the
// tests can check a theme's parts and pack them as the atlas does. CI runs without pixi.js.
type Box = { x0: number; y0: number; x1: number; y1: number };
type M = [number, number, number, number, number, number];
class FakeGraphics {
	box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
	#m: M = [1, 0, 0, 1, 0, 0];
	#stack: M[] = [];
	#path: [number, number][] = [];
	#done = false;
	#pt(x: number, y: number) {
		if (this.#done) {
			this.#path = [];
			this.#done = false;
		}
		const [a, b, c, d, tx, ty] = this.#m;
		this.#path.push([a * x + c * y + tx, b * x + d * y + ty]);
		return this;
	}
	#boxPts(x0: number, y0: number, x1: number, y1: number) {
		return this.#pt(x0, y0).#pt(x1, y0).#pt(x1, y1).#pt(x0, y1);
	}
	#commit(pad: number) {
		for (const [x, y] of this.#path) {
			this.box.x0 = Math.min(this.box.x0, x - pad);
			this.box.y0 = Math.min(this.box.y0, y - pad);
			this.box.x1 = Math.max(this.box.x1, x + pad);
			this.box.y1 = Math.max(this.box.y1, y + pad);
		}
		this.#done = true;
		return this;
	}
	/** Pixi's draw-time transforms apply after the transform so far (scene-graphics.md). */
	#then([A, B, C, D, TX, TY]: M) {
		const [a, b, c, d, tx, ty] = this.#m;
		this.#m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * tx + C * ty + TX, B * tx + D * ty + TY];
		return this;
	}
	moveTo(x: number, y: number) { return this.#pt(x, y); }
	lineTo(x: number, y: number) { return this.#pt(x, y); }
	quadraticCurveTo(cx: number, cy: number, x: number, y: number) { return this.#pt(cx, cy).#pt(x, y); }
	bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number) { return this.#pt(ax, ay).#pt(bx, by).#pt(x, y); }
	closePath() { return this; }
	poly(pts: number[]) {
		for (let i = 0; i < pts.length; i += 2) this.#pt(pts[i]!, pts[i + 1]!);
		return this;
	}
	rect(x: number, y: number, w: number, h: number) { return this.#boxPts(x, y, x + w, y + h); }
	roundRect(x: number, y: number, w: number, h: number) { return this.#boxPts(x, y, x + w, y + h); }
	circle(x: number, y: number, r: number) { return this.#boxPts(x - r, y - r, x + r, y + r); }
	ellipse(x: number, y: number, rx: number, ry: number) { return this.#boxPts(x - rx, y - ry, x + rx, y + ry); }
	arc(x: number, y: number, r: number) { return this.#boxPts(x - r, y - r, x + r, y + r); }
	star(x: number, y: number, _n: number, r: number) { return this.#boxPts(x - r, y - r, x + r, y + r); }
	regularPoly(x: number, y: number, r: number) { return this.#boxPts(x - r, y - r, x + r, y + r); }
	fill() { return this.#commit(0); }
	stroke(s?: { width?: number }) { return this.#commit((s?.width ?? 1) / 2); }
	save() {
		this.#stack.push(this.#m);
		return this;
	}
	restore() {
		this.#m = this.#stack.pop() ?? [1, 0, 0, 1, 0, 0];
		return this;
	}
	translateTransform(x: number, y: number) { return this.#then([1, 0, 0, 1, x, y]); }
	rotateTransform(a: number) { return this.#then([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); }
}
class FakeText {
	anchor = { set() {} };
	position = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
	rotation = 0;
	size: number;
	length: number;
	constructor(o: { text: string; style: { fontSize: number } }) {
		this.size = o.style.fontSize;
		this.length = o.text.length;
	}
}
mock.module("pixi.js", () => ({ Graphics: FakeGraphics, Text: FakeText, Container: class {} }));

describe("themes", async () => {
	const { paperTheme } = await import("../src/scene/rig/theme");
	const { factoryTheme, FACTORY_REPAINTS, FACTORY_EXTRAS } = await import("../src/scene/rig/factory");
	const { ATLAS_WIDTH, PAD, RESOLUTION } = await import("../src/scene/rig/pack");
	const paper = paperTheme();
	const factory = factoryTheme();
	const measure = (t: typeof paper) =>
		new Map(
			Object.keys(t.parts).map((name) => {
				const g = new FakeGraphics();
				t.parts[name]!(g as never, (c) => {
					const tx = c as unknown as FakeText;
					const w = tx.size * tx.length * 0.6;
					g.box.x0 = Math.min(g.box.x0, tx.position.x - w / 2);
					g.box.x1 = Math.max(g.box.x1, tx.position.x + w / 2);
					g.box.y0 = Math.min(g.box.y0, tx.position.y - tx.size / 2);
					g.box.y1 = Math.max(g.box.y1, tx.position.y + tx.size / 2);
				});
				return [name, g.box] as const;
			}),
		);
	const paperBox = measure(paper);
	const factoryBox = measure(factory);

	test("the factory paints every part the paper rig does, repainting the gear and stations on purpose", () => {
		expect(factory.name).toBe("factory");
		for (const name of Object.keys(paper.parts)) expect(factory.parts[name], name).toBeDefined();
		for (const name of FACTORY_REPAINTS) {
			expect(paper.parts[name], `${name} is a paper part`).toBeDefined();
			expect(factory.parts[name], `${name} is repainted`).not.toBe(paper.parts[name]);
		}
		// Everything else is inherited on purpose: faces, hands, limbs, the builder's work, effects.
		// (The painters are fresh closures per theme, so inherited ones are compared by what they draw.)
		const repainted = new Set<string>(FACTORY_REPAINTS);
		for (const name of Object.keys(paper.parts)) if (!repainted.has(name)) expect(factoryBox.get(name), name).toEqual(paperBox.get(name)!);
		// The only new parts are the role leg and arm the puppet looks for.
		expect(Object.keys(factory.parts).filter((n) => !paper.parts[n]).sort()).toEqual([...FACTORY_EXTRAS].sort());
	});

	test("every factory part draws something, and a repainted station part or prop keeps its size", () => {
		for (const [name, b] of factoryBox) expect(b.x1 - b.x0, name).toBeGreaterThan(0);
		// The solved reaches land on the business ends: a repaint stays within a few units of the
		// paper part's extent on every side, so nothing moves out from under a hand.
		// Except where no hand works it any more: the carton lying on the pallet (mail2) stands taller
		// than the flat envelope did, after the hand has let go of it.
		const free = new Set(["work/mail2"]);
		for (const name of FACTORY_REPAINTS.filter((n) => /^(work|held|prop)\//.test(n) && !free.has(n))) {
			const a = paperBox.get(name)!;
			const b = factoryBox.get(name)!;
			for (const k of ["x0", "y0", "x1", "y1"] as const) expect(Math.abs(a[k] - b[k]), `${name} ${k}`).toBeLessThan(6);
		}
	});

	test("the factory atlas packs within the atlas limits", () => {
		const bounds = [...factoryBox].map(([name, b]) => ({ name, x: b.x0, y: b.y0, width: Math.max(1, b.x1 - b.x0), height: Math.max(1, b.y1 - b.y0) }));
		const { width, height } = pack(bounds, ATLAS_WIDTH, PAD);
		expect(width * RESOLUTION).toBeLessThanOrEqual(4096);
		expect(height * RESOLUTION).toBeLessThanOrEqual(4096);
	});

	describe("the office", async () => {
		const { officeTheme, OFFICE_REPAINTS, OFFICE_EXTRAS } = await import("../src/scene/rig/office");
		const { rigTheme } = await import("../src/scene/rig/themes");
		const office = officeTheme();
		const officeBox = measure(office);
		const repainted = new Set<string>(OFFICE_REPAINTS);

		test("the office's rig is the office theme; the factory keeps its own", () => {
			expect(rigTheme("office").name).toBe("office");
			expect(rigTheme("factory").name).toBe("factory");
		});

		test("the office repaints the costumes and the builder's work by name, and nothing else", () => {
			for (const name of Object.keys(paper.parts)) expect(office.parts[name], name).toBeDefined();
			for (const name of OFFICE_REPAINTS) {
				expect(paper.parts[name], `${name} is a paper part`).toBeDefined();
				expect(office.parts[name], `${name} is repainted`).not.toBe(paper.parts[name]);
			}
			for (const name of Object.keys(paper.parts)) if (!repainted.has(name)) expect(officeBox.get(name), name).toEqual(paperBox.get(name)!);
			expect(Object.keys(office.parts).filter((n) => !paper.parts[n]).sort()).toEqual([...OFFICE_EXTRAS].sort());
			// No hard hat, apron, kerchief or pith helmet is left in the office: every hat and front piece is its own.
			for (const n of Object.keys(paper.parts).filter((n) => /^(hat|front)\//.test(n))) expect(repainted.has(n), n).toBe(true);
		});

		test("every piece of construction gear is repainted, and the factory keeps it", () => {
			const gear = ["held/hammer", "held/wrench", "held/bolt", "held/gear", "held/brick", "work/nail1", "work/nail2", "work/nail3", "work/bent", "work/nut1", "work/nut2", "work/nut3", "work/crate", "work/stack", "work/stackL", "work/stackR", "work/brick", "prop/plan", "prop/plan2", "prop/roll"];
			for (const n of gear) expect(repainted.has(n), n).toBe(true);
			for (const n of ["held/hammer", "work/nail1", "work/stack", "work/brick", "work/nut1"]) expect(factoryBox.get(n), n).toEqual(paperBox.get(n)!);
		});

		test("a repainted prop keeps its size and its working ends, so the solved reaches still land", () => {
			for (const [name, b] of officeBox) expect(b.x1 - b.x0, name).toBeGreaterThan(0);
			// Except where no hand meets the prop's far edge: the laser pointer's beam is thinner than the
			// torch's cone (the hand holds the pen, where the torch's handle was).
			const free = new Set(["held/torch"]);
			for (const name of OFFICE_REPAINTS.filter((n) => /^(work|held|prop)\//.test(n) && !free.has(n))) {
				const a = paperBox.get(name)!;
				const b = officeBox.get(name)!;
				for (const k of ["x0", "y0", "x1", "y1"] as const) expect(Math.abs(a[k] - b[k]), `${name} ${k}`).toBeLessThan(6);
			}
			// The sheaf's top is where the nail's head was at each strike, so the stapler lands on it.
			(["work/nail1", "work/nail2", "work/nail3"] as const).forEach((n, i) => expect(Math.abs(officeBox.get(n)!.y0 - WORK.nailTop[i]!), n).toBeLessThan(2.5));
		});

		test("the office atlas packs within the atlas limits", () => {
			const bounds = [...officeBox].map(([name, b]) => ({ name, x: b.x0, y: b.y0, width: Math.max(1, b.x1 - b.x0), height: Math.max(1, b.y1 - b.y0) }));
			const { width, height } = pack(bounds, ATLAS_WIDTH, PAD);
			expect(width * RESOLUTION).toBeLessThanOrEqual(4096);
			expect(height * RESOLUTION).toBeLessThanOrEqual(4096);
		});
	});

	describe("the bakery (still the Line's kit until wave 4 repaints it)", async () => {
		const { bakeryTheme, BAKERY_REPAINTS } = await import("../src/scene/rig/bakery");
		const { rigTheme } = await import("../src/scene/rig/themes");
		const { THEME_IDS } = await import("../src/scene/theme/id");
		const kitchen = bakeryTheme();
		const kitchenBox = measure(kitchen);
		const repainted = new Set<string>(BAKERY_REPAINTS);

		test("every theme has its own rig, named for it", () => {
			for (const id of THEME_IDS) expect(rigTheme(id).name).toBe(id);
		});

		test("the kitchen repaints the costumes, the builder's work and the stations by name, and nothing else", () => {
			for (const name of Object.keys(paper.parts)) expect(kitchen.parts[name], name).toBeDefined();
			for (const name of BAKERY_REPAINTS) {
				expect(paper.parts[name], `${name} is a paper part`).toBeDefined();
				expect(kitchen.parts[name], `${name} is repainted`).not.toBe(paper.parts[name]);
			}
			for (const name of Object.keys(paper.parts)) if (!repainted.has(name)) expect(kitchenBox.get(name), name).toEqual(paperBox.get(name)!);
			// No new parts: the kitchen dresses the slots the paper rig has.
			expect(Object.keys(kitchen.parts).filter((n) => !paper.parts[n])).toEqual([]);
			// Every hat and front piece is the kitchen's own (no hard hat or pith helmet on the line),
			// and so is every body (chef whites).
			for (const n of Object.keys(paper.parts).filter((n) => /^(hat|front|body)\//.test(n))) expect(repainted.has(n), n).toBe(true);
			// The construction gear and the office's stations are all kitchen kit.
			for (const n of ["held/hammer", "work/nail1", "work/stack", "work/nut1", "work/copier", "work/forms", "work/outbox", "work/tray4", "work/cabinet", "prop/bigEnvelope"]) expect(repainted.has(n), n).toBe(true);
		});

		test("a repainted prop or station part keeps its size and its working ends, so the solved reaches still land", () => {
			for (const [name, b] of kitchenBox) expect(b.x1 - b.x0, name).toBeGreaterThan(0);
			for (const name of BAKERY_REPAINTS.filter((n) => /^(work|held|prop)\//.test(n))) {
				const a = paperBox.get(name)!;
				const b = kitchenBox.get(name)!;
				for (const k of ["x0", "y0", "x1", "y1"] as const) expect(Math.abs(a[k] - b[k]), `${name} ${k}`).toBeLessThan(6);
			}
			// The cutlet's top is where the nail's head was at each strike, so the mallet lands on it.
			(["work/nail1", "work/nail2", "work/nail3"] as const).forEach((n, i) => expect(Math.abs(kitchenBox.get(n)!.y0 - WORK.nailTop[i]!), n).toBeLessThan(2.5));
		});

		test("the kitchen atlas packs within the atlas limits", () => {
			const bounds = [...kitchenBox].map(([name, b]) => ({ name, x: b.x0, y: b.y0, width: Math.max(1, b.x1 - b.x0), height: Math.max(1, b.y1 - b.y0) }));
			const { width, height } = pack(bounds, ATLAS_WIDTH, PAD);
			expect(width * RESOLUTION).toBeLessThanOrEqual(4096);
			expect(height * RESOLUTION).toBeLessThanOrEqual(4096);
		});
	});
});
