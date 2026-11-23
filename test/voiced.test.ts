// Voiced lines' pure parts: the corpus per theme, line keys, take choice, pitch, babble and the
// turn taking. The WebAudio player is checked in e2e/speech.test.ts.
import { describe, expect, test } from "bun:test";
import { THEME_IDS } from "../src/scene/theme/id";
import { SPEECH_LIMITS as L, type Heard, Mouth, VOICED, babbleHz, babbleOf, corpus, lineKey, ownVoice, pickTake, pitchCents, templated, voicesFor } from "../src/scene/sass/voiced";

const said = (who: string, text: string, trigger: Heard["trigger"] = "waiting"): Heard => ({ who, text, kind: "said", trigger });

describe("corpus", () => {
	test("every theme has said key-beat lines, each once, and no signs or thoughts", () => {
		for (const theme of THEME_IDS) {
			const lines = corpus(theme);
			expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length);
			const beats = lines.filter((l) => l.beat);
			for (const t of VOICED) expect(beats.some((l) => l.trigger === t)).toBe(true);
			expect(beats.filter((l) => !l.templated).length).toBeGreaterThan(8);
		}
	});

	test("a theme speaks its own words", () => {
		expect(corpus("bakery").some((l) => l.text === "Chef? A tiny taste?")).toBe(true);
		expect(corpus("office").some((l) => l.text === "Chef? A tiny taste?")).toBe(false);
	});

	test("lines with placeholders are marked for babble", () => {
		expect(templated("Finished at {time}. Scrolling since {time2}.")).toBe(true);
		expect(templated("Done. Vibing until someone closes me.")).toBe(false);
		expect(corpus("office").find((l) => l.text.includes("{time}"))?.templated).toBe(true);
	});
});

describe("keys and takes", () => {
	test("a key is stable, ignores spacing, and changes with the words", () => {
		expect(lineKey("No rush. Some rush.")).toMatch(/^[0-9a-f]{16}$/);
		expect(lineKey("  No rush.  Some rush. ")).toBe(lineKey("No rush. Some rush."));
		expect(lineKey("No rush. Some rush!")).not.toBe(lineKey("No rush. Some rush."));
	});

	test("a character keeps its own voice when the line has it, else takes turns", () => {
		const voices = ["a", "b", "c", "d"];
		const takes = voicesFor("k1", voices, 2).map((v) => ({ voice: v, file: `${v}.webm`, ms: 900 }));
		expect(takes.length).toBe(2);
		const who = ["s:1", "s:2", "s:3", "s:4", "s:5", "s:6"].find((w) => takes.some((t) => t.voice === ownVoice(w, voices)))!;
		expect(pickTake(takes, who, voices, 0)?.voice).toBe(ownVoice(who, voices));
		expect(pickTake(takes, who, voices, 5)?.voice).toBe(ownVoice(who, voices));
		const stranger = ["s:1", "s:2", "s:3", "s:4", "s:5", "s:6"].find((w) => !takes.some((t) => t.voice === ownVoice(w, voices)))!;
		expect(pickTake(takes, stranger, voices, 0)).not.toEqual(pickTake(takes, stranger, voices, 1));
		expect(pickTake([], "s:1", voices, 0)).toBeUndefined();
	});

	test("lines spread over the pool", () => {
		const pool = ["a", "b", "c", "d", "e", "f"];
		const starts = new Set(corpus("office").map((l) => voicesFor(l.key, pool, 1)[0]));
		expect(starts.size).toBeGreaterThan(3);
		expect(voicesFor("x", pool, 10).length).toBe(6);
	});

	test("pitch and babble come from the id, within range", () => {
		for (const w of ["s:1", "a:1:2", "s:zzz"]) {
			expect(Math.abs(pitchCents(w))).toBeLessThanOrEqual(120);
			expect(pitchCents(w)).toBe(pitchCents(w));
			expect(babbleHz(w)).toBeGreaterThanOrEqual(170);
			expect(babbleHz(w)).toBeLessThanOrEqual(300);
		}
		expect(babbleOf("Small question?").tune).toBe("rise");
		expect(babbleOf("Back! Refreshed!").tune).toBe("bright");
		expect(babbleOf("I was resting my context.").syllables).toBeGreaterThan(3);
	});
});

describe("mouth", () => {
	test("quiet through the grace, then one key beat at a time", () => {
		const m = new Mouth();
		expect(m.choose([said("s:1", "No rush. Some rush.")], 0)).toBeUndefined();
		m.live(0);
		expect(m.choose([said("s:1", "No rush. Some rush.")], L.graceMs - 1)).toBeUndefined();
		const t = L.graceMs;
		const got = m.choose([said("s:2", "I was resting my context.", "woken"), said("s:1", "No rush. Some rush.")], t);
		expect(got?.who).toBe("s:1");
		expect(m.choose([said("s:2", "I was resting my context.", "woken")], t + 1_000)).toBeUndefined();
		expect(m.choose([said("s:2", "I was resting my context.", "woken")], t + L.gapMs)?.who).toBe("s:2");
	});

	test("thoughts, other triggers, repeats and a chatty character stay quiet", () => {
		const m = new Mouth();
		m.live(0);
		let t = L.graceMs;
		expect(m.choose([{ ...said("s:1", "Hmm."), kind: "thought" }], t)).toBeUndefined();
		expect(m.choose([said("s:1", "Pass the clamp.", "chatter")], t)).toBeUndefined();
		expect(m.choose([said("s:1", "No rush. Some rush.")], t)).toBeDefined();
		t += L.gapMs;
		expect(m.choose([said("s:1", "Whenever you are ready.")], t)).toBeUndefined();
		expect(m.choose([said("s:2", "No rush. Some rush.")], t)).toBeUndefined();
		t = L.graceMs + L.perWhoMs;
		expect(m.choose([said("s:1", "Whenever you are ready.")], t)).toBeDefined();
		expect(m.turns.get(lineKey("No rush. Some rush."))).toBe(1);
	});

	test("at most a few a minute; going quiet restarts the grace", () => {
		const m = new Mouth();
		m.live(0);
		let n = 0;
		for (let t = L.graceMs; t < L.graceMs + L.windowMs; t += L.gapMs) if (m.choose([said(`s:${t}`, `Line ${t}.`)], t)) n++;
		expect(n).toBe(L.perWindow);
		m.live(undefined);
		m.live(500_000);
		expect(m.choose([said("s:x", "Fresh line.")], 500_000 + 1)).toBeUndefined();
	});
});

describe("the recording plan (tools/voice.ts)", async () => {
	const { plan, sigOf, toRecord, requestBody, TERMS_OK } = await import("../tools/voice");
	const { CAST } = await import("../tools/voice-cast");
	const o = { takes: 2, all: false, model: TERMS_OK[0] };

	test("every key-beat line with no placeholder, in two voices, and only what's missing", () => {
		const fresh = plan({ version: 1, themes: {} }, ["office"], o);
		expect(fresh.length).toBe(toRecord("office", false).length * 2);
		expect(fresh.every((j) => !templated(j.line.text) && j.line.beat && j.why === "new")).toBe(true);
		const j = fresh[0]!;
		const take = { voice: j.voice.id, sig: sigOf(o.model, "office", j.voice), model: o.model, file: "x.webm", ms: 1, bytes: 1, status: "approved" as const, at: "" };
		const work = { version: 1 as const, themes: { office: { [j.line.key]: { text: j.line.text, trigger: j.line.trigger, role: j.line.role, takes: [take] } } } };
		expect(plan(work, ["office"], o).length).toBe(fresh.length - 1);
		take.status = "redo" as never;
		expect(plan(work, ["office"], o).find((x) => x.line.key === j.line.key && x.voice.id === j.voice.id)?.why).toBe("redo");
		take.status = "approved" as never;
		take.sig = "old";
		expect(plan(work, ["office"], o).find((x) => x.line.key === j.line.key && x.voice.id === j.voice.id)?.why).toBe("changed");
	});

	test("each theme casts six to eight distinct voices, and a request asks for audio in one", () => {
		for (const t of THEME_IDS) {
			expect(CAST[t].length).toBeGreaterThanOrEqual(6);
			expect(CAST[t].length).toBeLessThanOrEqual(8);
			expect(new Set(CAST[t].map((v) => v.id)).size).toBe(CAST[t].length);
		}
		const body = requestBody("bakery", { text: "Chef? A tiny taste?" }, CAST.bakery[0]!);
		expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
		expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(CAST.bakery[0]!.voice);
		expect(body.contents[0]!.parts[0]!.text.endsWith("Chef? A tiny taste?")).toBe(true);
	});
});

describe("auditions and Gemini 3.8 (tools/voice.ts)", async () => {
	const { auditionLines, auditionPlan, requestBody, estimate, isV38 } = await import("../tools/voice");
	const { CAST, PREBUILT, DELIVERIES } = await import("../tools/voice-cast");
	const empty = { takes: {}, picks: {}, pitch: {}, notes: {} };

	test("a theme's sample lines: one per key beat in its words, then the reactions", () => {
		const lines = auditionLines("bakery");
		expect(lines.length).toBe(VOICED.length + 6);
		expect(lines.slice(-3).every((l) => l.includes("<"))).toBe(true);
		expect(corpus("bakery").some((l) => l.text === lines[0])).toBe(true);
		expect(lines.every((l) => !templated(l))).toBe(true);
		// Mochi-speak's vocal tags are 3.8's: an older model would read them aloud, so it skips them.
		const old = auditionPlan(empty, "bakery", { models: ["gemini-3.1-flash-tts-preview"], voices: ["Puck"], deliveries: ["plain"] });
		expect(old.length).toBe(VOICED.length + 3);
	});

	test("every model, voice, delivery and line once; recorded ones are skipped", () => {
		const o = { models: ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts"], voices: [...PREBUILT], deliveries: Object.keys(DELIVERIES) };
		const jobs = auditionPlan(empty, "office", o);
		expect(jobs.length).toBe(PREBUILT.length * Object.keys(DELIVERIES).length * (2 * auditionLines("office").length - 3));
		expect(new Set(jobs.map((j) => j.file)).size).toBe(jobs.length);
		const j = jobs[0]!;
		const done = { ...empty, takes: { [j.file]: { theme: "office" as const, model: j.model, voice: j.voice.voice, delivery: j.delivery, n: j.n, text: j.line.text, ms: 1 } } };
		expect(auditionPlan(done, "office", o).length).toBe(jobs.length - 1);
		// A fake take stands in for a fake run, never for a real one.
		done.takes[j.file].model = "fake";
		expect(auditionPlan(done, "office", { ...o, fake: true }).length).toBe(jobs.length - 1);
		expect(auditionPlan(done, "office", o).length).toBe(jobs.length);
	});

	test("Gemini 3.8 reads the text word for word, with the style in speech_metadata", () => {
		expect(isV38("gemini-3.8-flash-tts")).toBe(true);
		const v = CAST.office[0]!;
		const old = requestBody("office", { text: "Hm?" }, v, "gemini-3.1-flash-tts-preview").contents[0]!.parts[0]!;
		const neu = requestBody("office", { text: "Hm?" }, v, "gemini-3.8-flash-tts").contents[0]!.parts[0]! as { text: string; speech_metadata?: { style: string } };
		expect(old.text.endsWith("Hm?")).toBe(true);
		expect(old.text.length).toBeGreaterThan(20);
		expect(neu.text).toBe("Hm?");
		expect(neu.speech_metadata?.style).toContain(v.style);
	});

	test("3.8 is cheaper at list price for the same speech", () => {
		const items = [{ prompt: "x".repeat(200), text: "No rush. Some rush." }];
		expect(estimate(items.map((i) => ({ ...i, model: "gemini-3.8-flash-tts" }))).usd).toBeLessThan(estimate(items.map((i) => ({ ...i, model: "gemini-3.1-flash-tts-preview" }))).usd);
	});
});

describe("the sound lab's parts: syllables and the murmur", async () => {
	const { segment, envelope, GRAIN_DEFAULTS } = await import("../tools/voice-grains");
	const { MURMUR_LIMITS, MOCHI_KEY, grainPlan, voiceMode, wordsOf } = await import("../src/scene/sass/voiced");

	test("cutting: voiced runs, long ones split at their dip, crumbs dropped, a little air kept", () => {
		// 10 ms frames: 0.2 s quiet, 0.6 s voiced with a dip in the middle, 0.2 s quiet, a 30 ms blip.
		const env = [...Array(20).fill(-80), ...Array(28).fill(-10), -25, -25, ...Array(30).fill(-10), ...Array(20).fill(-80), -10, -10, -10, ...Array(10).fill(-80)];
		const g = segment(env);
		expect(g.length).toBe(2);
		expect(g[0]![0]).toBeCloseTo(0.2 - GRAIN_DEFAULTS.padSec, 3);
		expect(g[1]![1]).toBeCloseTo(0.8 + GRAIN_DEFAULTS.padSec, 3);
		for (const [a, b] of g) expect(b - a).toBeLessThanOrEqual(GRAIN_DEFAULTS.maxSec + 2 * GRAIN_DEFAULTS.padSec + 1e-9);
		expect(segment([])).toEqual([]);
		const tone = new Float32Array(2400).map((_, i) => Math.sin(i / 5) * 0.5);
		expect(envelope(tone, 24_000).length).toBe(10);
	});

	const bank = [
		{ file: "a.webm", at: [[0, 0.2], [0.25, 0.4], [0.5, 0.7]] as [number, number][] },
		{ file: "b.webm", at: [[0.1, 0.3]] as [number, number][] },
	];

	test("a line becomes syllables: as many as its vowels, capped, never the same twice running, the same every time", () => {
		const p = grainPlan("s:1", "I was resting my context.", bank);
		expect(p.length).toBe(babbleOf("I was resting my context.").syllables);
		expect(grainPlan("s:1", "I was resting my context.", bank)).toEqual(p);
		expect(grainPlan("s:2", "I was resting my context.", bank)).not.toEqual(p);
		for (let i = 1; i < p.length; i++) expect(`${p[i]!.file}${p[i]!.start}`).not.toBe(`${p[i - 1]!.file}${p[i - 1]!.start}`);
		expect(grainPlan("s:1", "I was resting my context, and then some more, and more.", bank, { max: 4 }).length).toBe(4);
		expect(grainPlan("s:1", "Hello.", [])).toEqual([]);
	});

	// A bank with pitches and levels, as tools/voice-grains.ts measures them: one breath (no pitch),
	// one squeak an octave and a half up, one quiet syllable.
	const sung = [
		{ file: "a.webm", at: [[0, 0.2], [0.25, 0.4], [0.5, 0.7], [0.8, 0.95]] as [number, number][], hz: [300, 320, null, 900], db: [-18, -20, -30, -15] },
		{ file: "b.webm", at: [[0.1, 0.3], [0.4, 0.6], [0.7, 0.85]] as [number, number][], hz: [280, 310, 340], db: [-19, -28, -18] },
	];

	test("smooth: words drive the pauses, every syllable lands in the key, a word keeps to one take", () => {
		const text = "Done before lunch, taking lunch anyway.";
		const p = grainPlan("s:1", text, sung);
		expect(p.length).toBe(wordsOf(text).reduce((n, w) => n + w.syllables, 0));
		// No breath and no squeak.
		for (const g of p) expect(`${g.file}@${g.start}`).not.toMatch(/a\.webm@0\.(5|8)$/);
		// Each syllable's own pitch plus its shift is a note of the key.
		const hzOf = (g: (typeof p)[number]) => sung.find((c) => c.file === g.file)!.hz[sung.find((c) => c.file === g.file)!.at.findIndex(([a]) => a === g.start)]!;
		for (const g of p) {
			const semis = 12 * Math.log2(hzOf(g) / MOCHI_KEY.rootHz) + g.cents / 100;
			const inKey = ((Math.round(semis) % 12) + 12) % 12;
			expect(Math.abs(semis - Math.round(semis))).toBeLessThan(0.02);
			expect(MOCHI_KEY.scale as readonly number[]).toContain(inKey);
		}
		// Inside a word syllables overlap; the comma pauses longer than a word break.
		expect(p.some((g) => g.gap < 0)).toBe(true);
		expect(Math.max(...p.map((g) => g.gap))).toBeGreaterThanOrEqual(0.16);
		// The quiet syllable is brought up, the loud ones down.
		const quiet = p.find((g) => g.file === "b.webm" && g.start === 0.4);
		if (quiet) expect(quiet.gain).toBeGreaterThan(1);
	});

	test("smooth: the raw switch, and a bank with no pitches, give the first cut", () => {
		expect(grainPlan("s:1", "Hello there.", sung, { raw: true }).every((g) => g.gap > 0)).toBe(true);
		expect(grainPlan("s:1", "Hello there.", bank).every((g) => g.gap > 0)).toBe(true);
	});

	test("words: syllables per word, and the pause each word ends on", () => {
		expect(wordsOf("No rush. Some rush.")).toEqual([
			{ syllables: 1, pause: "word" },
			{ syllables: 1, pause: "stop" },
			{ syllables: 1, pause: "word" },
			{ syllables: 1, pause: "end" },
		]);
		expect(wordsOf("Finished at {time}, scrolling.").map((w) => w.pause)).toEqual(["word", "word", "comma", "end"]);
		expect(wordsOf("Pa-ta-taa! <laugh>").length).toBe(1);
	});

	test("the tune: a question ends up, a full stop ends down", () => {
		const q = grainPlan("s:1", "Is this binder load-bearing?", bank);
		const d = grainPlan("s:1", "Done before lunch. Taking lunch anyway.", bank);
		expect(q.at(-1)!.cents).toBeGreaterThan(q[0]!.cents);
		expect(d.at(-1)!.cents).toBeLessThan(d[0]!.cents);
	});

	test("the murmur takes the other said bubbles, more often than the front, never key beats", () => {
		const m = new Mouth({ graceMs: 0, murmur: true });
		m.live(0);
		expect(m.choose([said("s:1", "No rush. Some rush.")], 1)).toBeUndefined();
		expect(m.choose([said("s:1", "Pass the clamp.", "chatter")], 1)?.who).toBe("s:1");
		expect(m.choose([said("s:2", "Left a bit.", "chatter")], 1 + MURMUR_LIMITS.gapMs - 1)).toBeUndefined();
		expect(m.choose([said("s:2", "Left a bit.", "chatter")], 1 + MURMUR_LIMITS.gapMs)?.who).toBe("s:2");
		expect(MURMUR_LIMITS.gapMs).toBeLessThan(L.gapMs);
	});

	test("?voice= picks a mode, and anything else is the synth", () => {
		expect(voiceMode("syllables")).toBe("syllables");
		expect(voiceMode("loud")).toBe("synth");
		expect(voiceMode(null)).toBe("synth");
	});
});
