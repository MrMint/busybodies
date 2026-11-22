// The light layer in headless Chrome (plan-alive stream C): ?hour= pins the phase, the light is
// re-baked only when what it shows changes, the camera's room becomes a stage, night costs no more
// draw calls than day, and a calm office at night is still silent. Like the other e2e tests, the
// bundled scene from dist/ with ?demo; run with `bun test e2e/`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const T = { timeout: 45_000 };

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

async function open(query: string): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	await page.goto(`http://localhost:${server.port}/?inspect&${query}`);
	await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
	return page;
}

describe("light", () => {
	test("?hour= pins the phase; the light re-bakes when the phase or the stage changes, not per frame", async () => {
		const page = await open("demo&frozen&hour=23");
		const night = await page.evaluate(() => window.__busybodies!.light());
		expect(night).toMatchObject({ phase: "night", hour: 23, forced: true, glow: true });
		expect(night.lamps).toBeGreaterThan(0);
		const after = await page.evaluate(() => {
			const b = window.__busybodies!;
			const bakes = b.light().bakes;
			b.step(30);
			const stepped = b.light().bakes;
			b.setHour(22); // still night: nothing to re-bake
			const same = b.light().bakes;
			b.setHour(12);
			return { bakes, stepped, same, noon: b.light() };
		});
		expect(after.stepped).toBe(after.bakes);
		expect(after.same).toBe(after.bakes);
		expect(after.noon.phase).toBe("noon");
		expect(after.noon.bakes).toBe(after.bakes + 1);
		expect(after.noon.lamps).toBe(0);
		expect(after.noon.glow).toBe(false);
		// The camera's room is the stage; at the office stop nothing is.
		const focus = await page.evaluate(() => {
			const b = window.__busybodies!;
			b.goTo({ kind: "room", id: "room:lanternfish" }, false);
			const room = b.light().focus;
			b.goTo({ kind: "office" }, false);
			return { room, office: b.light().focus ?? null };
		});
		expect(focus).toEqual({ room: "room:lanternfish", office: null });
		await page.close();
	}, T);

	test("an idle office at night in calm mode still makes no frames: the light is baked", async () => {
		const page = await open("demo=idle&calm&hour=2");
		await page.waitForTimeout(300);
		await page.evaluate(() => window.__busybodies!.resetCounters());
		await page.waitForTimeout(1500);
		const c = await page.evaluate(() => window.__busybodies!.counters());
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		expect(c.renders).toBe(0);
		await page.close();
	}, T);

	for (const theme of ["office", "factory"])
		test(`a busy night frame in the ${theme} stays within the draw budget, at a room stop too`, async () => {
			const page = await open(`demo&frozen&hour=23&theme=${theme}`);
			const draws = await page.evaluate(() => {
				const gl = document.querySelector("canvas")!.getContext("webgl2")!;
				let n = 0;
				const de = gl.drawElements.bind(gl);
				const da = gl.drawArrays.bind(gl);
				gl.drawElements = (...a: Parameters<typeof de>) => (n++, de(...a));
				gl.drawArrays = (...a: Parameters<typeof da>) => (n++, da(...a));
				const b = window.__busybodies!;
				const count = () => {
					b.step(1);
					n = 0;
					b.step(1);
					return n;
				};
				const office = count();
				b.goTo({ kind: "room", id: "room:lanternfish" }, false);
				return { office, room: count() };
			});
			expect(draws.office).toBeGreaterThan(0);
			expect(draws.office).toBeLessThanOrEqual(30);
			expect(draws.room).toBeLessThanOrEqual(30);
			await page.close();
		}, T);
});
