// The mochi rig under load: 200 puppets on screen hold the same frame budgets as the office (zero
// frames when idle, at most 30 fps when busy), and the inspector reports each one's role, pose and
// frame. Served from dist/ like frames.test.ts; run with `bun test e2e/`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const T = { timeout: 60_000 };

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
});

async function open(query: string): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	await page.goto(`http://localhost:${server.port}/?inspect&${query}`);
	await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 20_000 });
	return page;
}

async function measure(page: Page, ms = 2000) {
	await page.waitForTimeout(300);
	await page.evaluate(() => window.__busybodies!.resetCounters());
	await page.waitForTimeout(ms);
	return page.evaluate(() => window.__busybodies!.counters());
}

describe("200 puppets", () => {
	test("an idle crowd requests no animation frames and renders nothing", async () => {
		const page = await open("crowd=200&idle");
		expect(await page.evaluate(() => window.__busybodies!.entities().length)).toBe(200);
		const c = await measure(page);
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		expect(c.renders).toBe(0);
		await page.close();
	}, T);

	test("a busy crowd renders at no more than 30 fps", async () => {
		const page = await open("crowd=200");
		const c = await measure(page, 2000);
		expect(c.tickerRunning).toBe(true);
		expect(c.maxFPS).toBe(30);
		expect(c.renders).toBeGreaterThan(2);
		expect(c.renders).toBeLessThanOrEqual(64);
		await page.close();
	}, T);

	test("every character reports its role, pose and frame", async () => {
		const page = await open("crowd=200");
		const list = await page.evaluate(() => window.__busybodies!.entities());
		const roles = new Set(list.map((e) => e.role));
		expect(roles.size).toBe(7);
		const poses = new Set(list.map((e) => e.pose));
		expect(poses.size).toBeGreaterThan(8);
		for (const e of list) {
			expect(typeof e.pose).toBe("string");
			expect(e.frame).toBeGreaterThanOrEqual(0);
			expect(e.frame!).toBeLessThan(e.frames!);
			expect(e.params).toBeDefined();
		}
		await page.close();
	}, T);

	test("a frozen crowd steps to the same frame every time, however long it ran first", async () => {
		const frame = async (ranMs: number) => {
			const page = await open("crowd=200");
			await page.waitForTimeout(ranMs);
			const snap = await page.evaluate(() => {
				const b = window.__busybodies!;
				b.freeze();
				b.step(45);
				return b.entities().map((e) => `${e.key}:${e.pose}:${e.frame}:${e.lift}`);
			});
			await page.close();
			return snap;
		};
		expect(await frame(0)).toEqual(await frame(1500));
	}, T);
});

describe("the office in mochi", () => {
	test("characters wear their roles and play their moods", async () => {
		const page = await open("demo");
		const list = await page.evaluate(() => window.__busybodies!.entities());
		const lead = list.find((e) => e.key.startsWith("s:") && e.mood === "busy")!;
		expect(lead.role).toBe("lead");
		expect(lead.pose).toBe("typing");
		expect(list.find((e) => e.mood === "stalled")!.pose).toBe("stalled");
		expect(list.find((e) => e.mood === "done")!.pose).toBe("done");
		expect(new Set(list.map((e) => e.role)).size).toBeGreaterThanOrEqual(5);
		await page.close();
	}, T);
});
