// Frame budgets, checked in headless Chrome through the scene inspector (window.__busybodies).
// The bundled scene is served from dist/ (built here if missing) with ?demo, so no app and no real
// sessions are needed. Needs Google Chrome installed; run with `bun test e2e/`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const T = { timeout: 30_000 };

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
	browser = await chromium.launch({
		channel: "chrome",
		headless: true,
		args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	});
}, 120_000);

afterAll(async () => {
	await browser?.close();
	server?.stop(true);
});

async function open(query: string): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	await page.goto(`http://localhost:${server.port}/?inspect&${query}`);
	await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
	return page;
}

/** Counters over a quiet window of `ms`, after letting the scene settle. */
async function measure(page: Page, ms = 2000) {
	await page.waitForTimeout(300);
	await page.evaluate(() => window.__busybodies!.resetCounters());
	await page.waitForTimeout(ms);
	return page.evaluate(() => window.__busybodies!.counters());
}

describe("frame budgets", () => {
	test("an idle office requests no animation frames and renders nothing", async () => {
		const page = await open("demo=idle");
		const c = await measure(page);
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		expect(c.renders).toBe(0);
		await page.close();
	}, T);

	test("a busy office renders at no more than 30 fps", async () => {
		const page = await open("demo");
		const c = await measure(page, 2000);
		expect(c.tickerRunning).toBe(true);
		expect(c.maxFPS).toBe(30);
		// It is animating. Only a floor: a 2-core CI runner rendering in software manages ~6 fps.
		expect(c.renders).toBeGreaterThan(2);
		expect(c.renders).toBeLessThanOrEqual(64); // 30 fps over 2 s, plus slack for timer edges
		await page.close();
	}, T);

	test("the loop stops once everyone goes idle", async () => {
		const page = await open("demo");
		await page.evaluate(() => {
			const b = window.__busybodies!;
			const s = structuredClone(b.snapshot()!);
			type A = (typeof s.sessions)[number]["agents"][number];
			const rest = (a: A): A => ({ ...a, status: "finished", children: a.children.map(rest) });
			for (const x of s.sessions) {
				x.state = "idle";
				x.agents = x.agents.map(rest);
			}
			b.show(s);
		});
		// Characters that go idle while we watch play a slacking habit through, then settle.
		await page.waitForFunction(() => !window.__busybodies!.counters().tickerRunning, undefined, { timeout: 15_000 });
		const c = await measure(page);
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		await page.close();
	}, T);
});

describe("inspector", () => {
	test("lists every character with a mood", async () => {
		const page = await open("demo");
		const moods = await page.evaluate(() =>
			window.__busybodies!.entities().reduce<Record<string, number>>((m, e) => ((m[e.mood] = (m[e.mood] ?? 0) + 1), m), {}),
		);
		expect(moods).toEqual({ busy: 15, idle: 3, stalled: 1, done: 1 });
		await page.close();
	}, T);

	test("a frozen scene steps to the same frame every time", async () => {
		const frame = async () => {
			const page = await open("demo");
			const lifts = await page.evaluate(() => {
				const b = window.__busybodies!;
				b.freeze();
				b.step(10);
				return b.entities().map((e) => `${e.key}:${e.lift}`);
			});
			await page.close();
			return lifts;
		};
		expect(await frame()).toEqual(await frame());
	}, T);
});
