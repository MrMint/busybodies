// Theme parity: every theme in every key state, in the full office and the compact window. A theme
// is the same cast and the same director in a different place (src/themes/ids.ts), so for each state the
// test reads the scene as data in the office and in each other theme and checks the essentials: the
// page comes up without a thrown error, the same characters are on the floor, the rooms are staged
// (the same areas, the theme's staging, every sign slot written), and nothing is left in the
// office's words. A broken theme fails here before anyone sees it. Like the other e2e tests, the
// bundled scene from dist/ with ?demo; run with `bun test e2e/`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";
import { THEME_IDS, type ThemeId } from "../src/themes/ids";
import { wordsFor } from "../src/scene/theme/words";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const T = { timeout: 90_000 };

/**
 * The key states, as demo fixtures: `frames` steps the frozen scene into the state's walks; `beats`
 * plays a demo's later snapshots through the director (the story's beats are timers, which a frozen
 * scene doesn't run).
 */
interface State {
	name: string;
	demo: string;
	frames?: number;
	/** Nobody's in: only the night watch keeps the office company. */
	empty?: boolean;
	/** Also in the compact window. */
	compact?: boolean;
}

const STATES: State[] = [
	{ name: "empty office", demo: "empty", empty: true, compact: true },
	{ name: "idle, after a compaction", demo: "idle", compact: true },
	{ name: "busy", demo: "", compact: true },
	{ name: "waiting on you", demo: "day-2", frames: 40, compact: true },
	{ name: "a PR and home time", demo: "day-3", frames: 150 },
	{ name: "the release rush", demo: "release", frames: 300 },
	{ name: "story beats", demo: "story", frames: 60 },
	{ name: "many sessions", demo: "thirty" },
];

/**
 * Known gaps, by theme and state name, each with where it is being fixed. The test still runs: it is
 * expected to fail (`test.failing`), so when the fix lands it starts passing and this entry must go.
 */
const KNOWN: Partial<Record<ThemeId, Record<string, string>>> = {};

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

beforeAll(async () => {
	if (!existsSync(join(DIST, "index.html"))) {
		const build = Bun.spawnSync(["bun", "x", "vite", "build"], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
		if (build.exitCode !== 0) throw new Error("vite build failed");
	}
	server = Bun.serve({
		port: 0,
		fetch(req) {
			const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, "");
			const file = Bun.file(join(DIST, path === "/" ? "index.html" : path));
			return file.exists().then((ok) => (ok ? new Response(file) : new Response("not found", { status: 404 })));
		},
	});
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
}, 120_000);

afterAll(async () => {
	await browser?.close();
	server?.stop(true);
}, 30_000);

/** What the scene says about itself in a state: read as data, never pixels. */
interface Facts {
	errors: string[];
	theme: string;
	sessions: number;
	cast: string[];
	/** Characters that are on the floor: drawn, with a size, inside the world. */
	placed: number;
	areas: string[];
	staging: { bay: string; hall: string; ambient: string[] };
	signs: Record<string, string>;
	/** Compact: the room tiles under the picture. */
	tiles: string[];
}

async function facts(theme: ThemeId, s: State, compact: boolean): Promise<Facts> {
	const page: Page = await browser.newPage({ viewport: compact ? { width: 440, height: 340 } : { width: 1280, height: 800 } });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	// A missing favicon and the like is the test server's, not the scene's.
	page.on("console", (m) => void (m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text())));
	try {
		await page.goto(`http://localhost:${server.port}/?inspect&frozen&hour=14&demo=${s.demo}&theme=${theme}${compact ? "&compact" : ""}`);
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 30_000 });
		const f = await page.evaluate((frames) => {
			const b = window.__busybodies!;
			b.step(frames);
			const people = b.entities();
			return {
				theme: b.theme(),
				sessions: b.snapshot()?.sessions.length ?? 0,
				cast: people.map((e) => e.key).sort(),
				placed: people.filter((e) => Number(e.size) > 0).length,
				areas: b.layout()!.areas.map((a) => a.id),
				staging: { bay: b.staging().bay, hall: b.staging().hall, ambient: [...b.staging().ambient] },
				signs: Object.fromEntries(b.signs().map((x) => [x.id, x.text?.title ?? ""])),
				tiles: [...document.querySelectorAll<HTMLElement>("#bb-tiles .tile")].map((t) => t.textContent?.trim() ?? ""),
			};
		}, s.frames ?? 12);
		return { errors, ...f };
	} finally {
		await page.close();
	}
}

const OFFICE = wordsFor("office");
/** The office's own sign titles and common-area names: another theme shows its own. */
const OFFICE_SIGNS = new Set(Object.values(OFFICE.signs).map((x) => x.title));
const OFFICE_AREAS = new Set(Object.values(OFFICE.areas));

for (const compact of [false, true]) {
	describe(`theme parity, ${compact ? "the compact window" : "the full office"}`, () => {
		for (const s of STATES.filter((x) => !compact || x.compact)) {
			const office = { facts: undefined as Promise<Facts> | undefined };
			const reference = () => (office.facts ??= facts("office", s, compact));
			for (const id of THEME_IDS) {
				const known = KNOWN[id]?.[s.name];
				const run = known ? test.failing : test;
				run(
					`${id}: ${s.name}${known ? ` (known: ${known})` : ""}`,
					async () => {
						const [o, f] = await Promise.all([reference(), id === "office" ? reference() : facts(id, s, compact)]);
						// It came up, in this theme, without a thrown error.
						expect(f.errors).toEqual([]);
						expect(f.theme).toBe(id);
						// The same floor: rooms are layout, not paint.
						expect(f.areas).toEqual(o.areas);
						expect(f.areas.length).toBeGreaterThan(0);
						// The same characters, and all of them on the floor.
						expect(f.sessions).toBe(o.sessions);
						expect(f.cast).toEqual(o.cast);
						if (s.empty) expect(f.cast.length).toBe(1);
						else expect(f.cast.length).toBeGreaterThanOrEqual(f.sessions);
						expect(f.placed).toBe(f.cast.length);
						// The rooms are staged: a bay and a hall, something moving on its own, the same sign
						// slots as the office with the theme's own defaults up, and none in the office's words.
						expect(f.staging.bay).toMatch(/^(desks|line)$/);
						expect(f.staging.hall).toMatch(/^(corridor|conveyor)$/);
						expect(f.staging.ambient.length).toBeGreaterThan(0);
						expect(Object.keys(f.signs).sort()).toEqual(Object.keys(o.signs).sort());
						for (const slot of [...Object.keys(wordsFor(id).signs), "yours:serving"])
							expect({ slot, title: (f.signs[slot] ?? "").length > 0 }).toEqual({ slot, title: true });
						for (const [slot, title] of Object.entries(f.signs)) {
							if (id !== "office") expect({ slot, office: OFFICE_SIGNS.has(title) }).toEqual({ slot, office: false });
						}
						// Compact's room tiles: one per room in the office, the common areas in this theme's words.
						expect(f.tiles.length).toBe(o.tiles.length);
						if (id !== "office") expect(f.tiles.filter((t) => OFFICE_AREAS.has(t))).toEqual([]);
					},
					T,
				);
			}
		}
	});
}
