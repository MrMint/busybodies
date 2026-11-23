// Looks as render passes (src/mainview/look.ts), in headless Chrome through the scene inspector.
// The pixel look renders the office into a quarter-resolution texture whenever the stage renders,
// so it must keep every frame budget, and clicks and camera moves must work through it. The night
// look holds the light's night phase. Run with `bun test e2e/`.
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
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
}, 120_000);

afterAll(async () => {
	await browser?.close();
	server?.stop(true);
}, 30_000);

async function open(query: string, size = { width: 1280, height: 800 }): Promise<Page> {
	const page = await browser.newPage({ viewport: size });
	await page.goto(`http://localhost:${server.port}/?inspect&${query}`);
	await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
	return page;
}

async function measure(page: Page, ms = 2000) {
	await page.waitForTimeout(300);
	await page.evaluate(() => window.__busybodies!.resetCounters());
	await page.waitForTimeout(ms);
	return page.evaluate(() => window.__busybodies!.counters());
}

describe("the pixel look keeps the frame budgets", () => {
	test("it renders into a quarter-resolution texture", async () => {
		const page = await open("demo=idle&calm&look=pixel");
		const look = await page.evaluate(() => window.__busybodies!.look());
		expect(look).toEqual({ look: "pixel", pixel: { width: 320, height: 200, resolution: 0.25 } });
		await page.close();
	}, T);

	test("an idle calm office still requests no animation frames and renders nothing", async () => {
		const page = await open("demo=idle&calm&look=pixel");
		const c = await measure(page);
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		expect(c.renders).toBe(0);
		await page.close();
	}, T);

	test("a living idle office stays at 30 fps or less: the pass adds no renders", async () => {
		const page = await open("demo=idle&settle=600000&look=pixel");
		const c = await measure(page, 2000);
		expect(c.life).toBe(true);
		expect(c.maxFPS).toBe(30);
		expect(c.renders).toBeGreaterThan(0);
		expect(c.renders).toBeLessThanOrEqual(64);
		await page.close();
	}, T);

	test("a busy office renders at 30 fps or less", async () => {
		const page = await open("demo&look=pixel");
		const c = await measure(page, 2000);
		expect(c.tickerRunning).toBe(true);
		expect(c.maxFPS).toBe(30);
		expect(c.renders).toBeGreaterThan(2);
		expect(c.renders).toBeLessThanOrEqual(64);
		await page.close();
	}, T);

	test("off screen it draws nothing", async () => {
		const page = await open("demo&look=pixel");
		await page.evaluate(() => window.__busybodies!.setVisible(false));
		const c = await measure(page, 1500);
		expect(c.tickerRunning).toBe(false);
		expect(c.renders).toBe(0);
		await page.close();
	}, T);
});

describe("the pixel look keeps input and the camera", () => {
	test("clicking a room zooms to it, and the texture follows a resize", async () => {
		const page = await open("demo=idle&look=pixel");
		const target = await page.evaluate(() => {
			const b = window.__busybodies!;
			const desk = b.layout()!.areas.find((a) => a.name === "orbit-kit")!.desks[0]!;
			const v = b.camera();
			return { x: (desk.cell.x + desk.cell.w / 2) * v.scale + v.x, y: (desk.cell.y + 40) * v.scale + v.y };
		});
		await page.mouse.click(target.x, target.y);
		await page.waitForFunction(() => !window.__busybodies!.camera().moving);
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "room", id: "room:orbit-kit" });
		await page.setViewportSize({ width: 960, height: 600 });
		await page.waitForTimeout(300);
		await page.evaluate(() => window.__busybodies!.step(1));
		expect((await page.evaluate(() => window.__busybodies!.look())).pixel).toEqual({ width: 240, height: 150, resolution: 0.25 });
		await page.close();
	}, T);

	test("switching live, from the settings sheet, and back", async () => {
		const page = await open("demo=idle&calm");
		await page.click("#hud .settings");
		await page.click('#bb-settings [data-look="pixel"]');
		expect((await page.evaluate(() => window.__busybodies!.look())).look).toBe("pixel");
		expect(await page.getAttribute('#bb-settings [data-look="pixel"]', "aria-checked")).toBe("true");
		// A switch is one render, then the calm office is quiet again.
		const c = await measure(page, 1000);
		expect(c.renders).toBe(0);
		await page.evaluate(() => window.__busybodies!.setToggles({ look: "plain" }));
		expect(await page.evaluate(() => window.__busybodies!.look())).toEqual({ look: "plain" });
		await page.close();
	}, T);
});

describe("the night look", () => {
	test("holds the night phase, and gives the hour back when it ends", async () => {
		const page = await open("demo=idle&calm&hour=10&look=night");
		expect(await page.evaluate(() => window.__busybodies!.light().phase)).toBe("night");
		await page.evaluate(() => window.__busybodies!.setToggles({ look: "plain" }));
		const light = await page.evaluate(() => window.__busybodies!.light());
		expect(light.phase).toBe("noon");
		expect(light.hour).toBe(10);
		await page.close();
	}, T);
});
