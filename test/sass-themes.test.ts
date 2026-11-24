// The voice in each theme (src/scene/sass/bank.ts): every theme has its own lines and signs, the
// office's furniture jokes stay in the office, the counters write in the theme's words, and a live
// theme switch takes the old theme's signs down. Every project, title and id here is made up.
import { describe, expect, test } from "bun:test";
import type { Session, Snapshot } from "../src/watcher/model";
import { THEME_IDS } from "../src/themes/ids";
import { wordsFor } from "../src/scene/theme/words";
import { BAKERY_LINES, Counters, FACTORY_LINES, LINES, Sass, TRIGGERS, Voice, sassFor, utcClock, utcDay, utcHour } from "../src/scene/sass";

const MIN = 60_000;
const NOW = Date.parse("2030-04-01T12:00:00Z");
const OPTS = { hour: utcHour, clock: utcClock, day: utcDay };
const session = (id: string, o: Partial<Session> = {}): Session => ({
	id,
	pid: 1,
	title: `Polish the ${id}`,
	cwd: "/work/teapot",
	project: "teapot",
	origin: "cli",
	state: "busy",
	stateSince: NOW - MIN,
	startedAt: NOW - 60 * MIN,
	activity: { tool: "Edit", at: NOW - 10_000 },
	agents: [],
	children: [],
	...o,
});
const snap = (...sessions: Session[]): Snapshot => ({ at: NOW, sessions });
const OWN = { office: LINES, factory: FACTORY_LINES, bakery: BAKERY_LINES };
const VARS = new Set(["name", "min", "n", "count", "time", "time2"]);
const banned = /\b(claude|anthropic|openai|gpt|gemini|copilot|cursor|github|slack|google|apple|microsoft|stupid|idiot|dumb|hate you|damn|hell|crap)\b/i;

describe("each theme's bank", () => {
	for (const id of THEME_IDS) {
		const bank = sassFor(id);
		test(`${id}: 150+ lines, 5+ for every trigger, its own for every trigger`, () => {
			expect(bank.theme).toBe(id);
			expect(bank.lines.length).toBeGreaterThanOrEqual(150);
			for (const t of TRIGGERS) {
				expect([t, bank.lines.filter((l) => l.trigger === t).length >= 5]).toEqual([t, true]);
				expect([t, OWN[id].filter((l) => l.trigger === t).length >= 3]).toEqual([t, true]);
			}
		});

		test(`${id}: keeps the voice rules, and every line can be filled`, () => {
			const texts = bank.lines.map((l) => l.text);
			expect(new Set(texts).size).toBe(texts.length);
			for (const l of OWN[id]) expect(`${l.text} ${l.note}`).not.toMatch(banned);
			for (const l of bank.lines) {
				if (l.kind === "sign") expect(l.place).toBeDefined();
				if (l.min !== undefined && l.max !== undefined) expect(l.min).toBeLessThan(l.max);
				// A reaction without a tag would fire for every kind of reaction.
				if (l.trigger === "reaction") expect(l.tag).toBeDefined();
				for (const m of l.text.matchAll(/\{(\w+)\}/g)) expect(VARS.has(m[1]!)).toBe(true);
			}
		});

		test(`${id}: the counters' signs are in its bank, with their placeholders`, () => {
			const { daysSince, failStreak, prTally, greens } = bank.counters;
			for (const text of [daysSince, failStreak, prTally]) expect(bank.lines.some((l) => l.kind === "sign" && l.text === text)).toBe(true);
			expect([daysSince, failStreak, greens].every((t) => t.includes("{n}"))).toBe(true);
			expect(prTally).toContain("{count}");
		});
	}

	test("the office's furniture stays in the office", () => {
		const outOfOffice = LINES.find((l) => l.text === "Out of office. In the office.")!;
		expect(outOfOffice.office).toBe(true);
		expect(sassFor("office").lines).toContain(outOfOffice);
		for (const id of ["factory", "bakery"] as const) {
			expect(sassFor(id).lines.some((l) => l.office)).toBe(false);
			expect(sassFor(id).lines.some((l) => /\b(office|stapler|water cooler|shredder|plant)\b/i.test(l.text))).toBe(false);
		}
	});

	test("the themes say different things", () => {
		const signs = (id: (typeof THEME_IDS)[number]) =>
			new Set(
				sassFor(id)
					.lines.filter((l) => l.kind === "sign")
					.map((l) => l.text),
			);
		const factory = signs("factory");
		expect([...signs("bakery")].filter((t) => factory.has(t) && !signs("office").has(t))).toEqual([]);
		expect(sassFor("factory").counters.prTally).not.toBe(sassFor("bakery").counters.prTally);
		expect(sassFor(undefined)).toBe(sassFor("office"));
		expect(sassFor("nowhere" as never)).toBe(sassFor("office"));
	});
});

describe("the counters in each theme", () => {
	const cmd = (exitCode: number, failStreak: number, at: number) => ({
		last: { kind: "test" as const, exitCode, at },
		failStreak,
		repeats: 1,
		failed: 0,
		testsFailed: 0,
	});
	const run = (theme: (typeof THEME_IDS)[number]) => {
		const c = new Counters({ ...OPTS, theme });
		const first = c.update(snap(session("a", { commands: cmd(1, 1, NOW - MIN) })), NOW);
		const streak = c.update(snap(session("a", { commands: cmd(1, 3, NOW) })), NOW);
		const later = NOW + 2 * 24 * 60 * MIN;
		const green = c.update(snap(session("a", { commands: cmd(0, 0, later), prs: [{ number: 1, url: "u", at: later }] })), later);
		return {
			days: first.get("room:teapot:board"),
			streak: streak.get("room:teapot:board"),
			pr: green.get("room:teapot:sign"),
			greens: green.get("kitchen:sign"),
		};
	};

	test("the office's, the factory's and the bakery's words", () => {
		expect(run("office")).toEqual({
			days: "Days since a test broke: 0",
			streak: "Fail streak: 3. New personal best.",
			pr: "PRs today: 1. Humility: 0.",
			greens: "One cup per green build. Today: 1.",
		});
		expect(run("factory")).toEqual({
			days: "Days without incident: 0",
			streak: "Rejects this shift: 3. A record.",
			pr: "Crates out today: 1. Modesty: out of stock.",
			greens: "One snack per green build. Today: 1.",
		});
		expect(run("bakery")).toEqual({
			days: "Days since a soufflé fell: 0",
			streak: "Burnt batches: 3. Smoke alarm: hoarse.",
			pr: "Trays out today: 1. Humility: crumbs.",
			greens: "One éclair per green build. Today: 1.",
		});
	});

	test("the fridge note is the theme's", () => {
		const s = snap(session("b", { title: "Webhook spike", state: "idle", stateSince: NOW - 31 * MIN }));
		expect(new Counters({ ...OPTS, theme: "bakery" }).update(s, NOW).get("fridge")).toBe("Webhook spike is not asleep. It is “proofing”. For 30 minutes.");
		expect(new Counters({ ...OPTS, theme: "factory" }).update(s, NOW).get("fridge")).toMatch(/^Webhook spike /);
	});
});

describe("a theme switch", () => {
	test("the bubbles come from the theme's bank", () => {
		const said = (theme: (typeof THEME_IDS)[number]) => {
			const sass = new Sass({ ...OPTS, gapMs: 0, theme });
			const texts = new Set<string>();
			// Naps of a few lengths, sampled across seeds: every bubble is from the theme's bank.
			for (let seed = 1; seed <= 20; seed++) {
				for (const min of [2, 12, 22, 40]) {
					const s = new Sass({ ...OPTS, gapMs: 0, theme, seed });
					for (const b of s.update(snap(session("a", { state: "idle", stateSince: NOW - min * MIN })), NOW, { zoom: 2 }).says) texts.add(b.line.text);
				}
			}
			expect(sass.theme).toBe(theme);
			expect(texts.size).toBeGreaterThan(1);
			return texts;
		};
		for (const id of THEME_IDS) for (const t of said(id)) expect(sassFor(id).lines.some((l) => l.text === t)).toBe(true);
		// And the bakery's naps are the bakery's own at least some of the time.
		expect([...said("bakery")].some((t) => BAKERY_LINES.some((l) => l.text === t))).toBe(true);
	});

	test("live: the old theme's signs come down, the new defaults go back, the counters write again", () => {
		const signs = new Map<string, { title: string; body?: string } | undefined>();
		const stage = {
			say: () => {},
			setSign: (id: string, v: { title: string; body?: string } | undefined) => void signs.set(id, v),
			signs: () => ["room:teapot:sign", "kitchen:sign"].map((id) => ({ id })),
		};
		const v = new Voice(stage, { ...OPTS, gapMs: 0 });
		const s = snap(session("a", { prs: [{ number: 3, url: "u", at: NOW }] }));
		v.run(s, NOW, { zoom: 2 });
		expect(signs.get("room:teapot:sign")?.title).toStartWith("PRS TODAY");
		v.setTheme("bakery", wordsFor("bakery").signs);
		expect(signs.get("room:teapot:sign")).toBeUndefined();
		v.run(s, NOW + 1_000, { zoom: 2 });
		expect(signs.get("room:teapot:sign")).toEqual({ title: "TRAYS OUT TODAY: 1", body: "Humility: crumbs." });
		expect(v.sass.theme).toBe("bakery");
	});
});
