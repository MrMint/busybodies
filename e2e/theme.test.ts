// Themes in headless Chrome: ?theme=factory, switching live (as the tray's Theme menu does), and the
// factory's robot arms moving only while they work. Like the other e2e tests, the bundled scene
// from dist/ with ?demo; run with `bun test e2e/`.
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

describe("themes", () => {
	test("?theme=factory: the same floor and cast, factory words, an arm per project bay", async () => {
		const office = await open("demo&frozen");
		const factory = await open("demo&frozen&theme=factory");
		const facts = (p: Page) =>
			p.evaluate(() => {
				const b = window.__busybodies!;
				return {
					theme: b.theme(),
					areas: b.layout()!.areas.map((a) => a.id),
					cast: b.entities().map((e) => e.key).sort(),
					meeting: b.signs().find((s) => s.id === "meeting:sign")?.text?.title,
					arms: b.arms().map((a) => a.area),
				};
			});
		const o = await facts(office);
		const f = await facts(factory);
		expect(o.theme).toBe("office");
		expect(f.theme).toBe("factory");
		expect(f.areas).toEqual(o.areas);
		expect(f.cast).toEqual(o.cast);
		expect(o.meeting).toBe("THIS MEETING");
		expect(f.meeting).toBe("QUALITY CONTROL");
		expect(o.arms).toEqual([]);
		expect(f.arms).toEqual(o.areas.filter((id) => id.startsWith("room:")));
		await office.close();
		await factory.close();
	}, T);

	test("switching live redraws in the new look without a reload, and an idle office stays at zero frames", async () => {
		const page = await open("demo=idle&calm");
		await page.evaluate(() => ((window as unknown as { __loaded: boolean }).__loaded = true));
		const signs = () => page.evaluate(() => Object.fromEntries(window.__busybodies!.signs().map((s) => [s.id, s.text?.title ?? ""])));
		const before = await page.evaluate(() => window.__busybodies!.entities().map((e) => e.key).sort());
		const signsBefore = await signs();
		await page.evaluate(() => window.__busybodies!.setTheme("factory"));
		const after = await page.evaluate(() => {
			const b = window.__busybodies!;
			return {
				theme: b.theme(),
				arms: b.arms().length,
				cast: b.entities().map((e) => e.key).sort(),
				sameDocument: (window as unknown as { __loaded?: boolean }).__loaded === true,
			};
		});
		expect(after.theme).toBe("factory");
		expect(after.sameDocument).toBe(true);
		expect(after.arms).toBeGreaterThan(0);
		expect(after.cast).toEqual(before);
		// A sign still on the office's default takes the factory's; what the voice wrote stays.
		const DEFAULTS: Record<string, [string, string]> = {
			"meeting:sign": ["THIS MEETING", "QUALITY CONTROL"],
			"kitchen:sign": ["1 CUP PER GREEN BUILD", "1 SNACK PER GREEN BUILD"],
			"lobby:frame": ["EMPLOYEE OF THE MONTH", "DAYS WITHOUT INCIDENT"],
			"yours:serving": ["NOW SERVING", "NEXT UP"],
		};
		const signsAfter = await signs();
		for (const [id, [office, factory]] of Object.entries(DEFAULTS)) expect(signsAfter[id]).toBe(signsBefore[id] === office ? factory : signsBefore[id]!);
		expect(Object.entries(DEFAULTS).some(([id, [office]]) => signsBefore[id] === office)).toBe(true);
		// Settled, the switched office is as quiet as before.
		await page.waitForFunction(() => !window.__busybodies!.counters().tickerRunning, undefined, { timeout: 15_000 });
		await page.waitForTimeout(300);
		await page.evaluate(() => window.__busybodies!.resetCounters());
		await page.waitForTimeout(1500);
		const c = await page.evaluate(() => window.__busybodies!.counters());
		expect(c.animationFrames).toBe(0);
		expect(c.renders).toBe(0);
		// And back.
		await page.evaluate(() => window.__busybodies!.setTheme("office"));
		expect(await page.evaluate(() => [window.__busybodies!.theme(), window.__busybodies!.arms().length])).toEqual(["office", 0]);
		await page.close();
	}, T);

	test("a bay's arm works only on a real event, batches mid-move, then is still", async () => {
		const page = await open("demo=release&settle=600000&theme=factory");
		// At rest before anything lands.
		expect(await page.evaluate(() => window.__busybodies!.arms().some((a) => a.moving))).toBe(false);
		// The release plays edits landing on the builds every few seconds: wait for one.
		await page.waitForFunction(() => window.__busybodies!.arms().some((a) => a.moving), undefined, { timeout: 20_000 });
		const moving = await page.evaluate(() => {
			const b = window.__busybodies!;
			b.freeze();
			const arm = b.arms().find((a) => a.moving)!;
			// A piece waits on the arm (hidden until it lets go), as the build's newest.
			return { arm, waiting: b.bricks().some((x) => x.t < 0) };
		});
		expect(moving.arm.jobs[0]!.kind).toBe("place");
		expect(moving.waiting).toBe(true);
		// Mid-move, the frame still fits the draw budget.
		const draws = await page.evaluate(() => {
			const gl = document.querySelector("canvas")!.getContext("webgl2")!;
			let n = 0;
			const de = gl.drawElements.bind(gl);
			const da = gl.drawArrays.bind(gl);
			gl.drawElements = (...a: Parameters<typeof de>) => (n++, de(...a));
			gl.drawArrays = (...a: Parameters<typeof da>) => (n++, da(...a));
			const b = window.__busybodies!;
			b.step(20);
			n = 0;
			b.step(1);
			return n;
		});
		expect(draws).toBeLessThanOrEqual(30);
		// Stepped through, it finishes and is still: no jobs left, back at rest.
		const done = await page.evaluate((area) => {
			const b = window.__busybodies!;
			for (let i = 0; i < 1200 && b.arms().find((a) => a.area === area)!.moving; i++) b.step(1);
			const a = b.arms().find((x) => x.area === area)!;
			const rest = a.base;
			b.step(30);
			return { moving: a.moving, jobs: a.jobs.length, still: b.arms().find((x) => x.area === area)!.base === rest };
		}, moving.arm.area);
		expect(done).toEqual({ moving: false, jobs: 0, still: true });
		await page.close();
	}, T);

	test("the settings cog: pick a theme in the sheet, and this window switches", async () => {
		const page = await open("demo&frozen");
		await page.click("#hud .settings");
		await page.waitForFunction(() => !document.querySelector<HTMLElement>("#bb-settings")!.hidden);
		const marked = () => page.evaluate(() => document.querySelector<HTMLElement>('#bb-settings [aria-checked="true"]')?.dataset.theme);
		expect(await marked()).toBe("office");
		await page.click('#bb-settings [data-theme="factory"]');
		expect(await page.evaluate(() => window.__busybodies!.theme())).toBe("factory");
		expect(await marked()).toBe("factory");
		await page.keyboard.press("Escape");
		expect(await page.evaluate(() => document.querySelector<HTMLElement>("#bb-settings")!.hidden)).toBe(true);
		await page.close();
	}, T);

	test("the top bar fits a narrow window, cog and all", async () => {
		const page = await open("demo&frozen");
		for (const width of [800, 700, 600]) {
			await page.setViewportSize({ width, height: 700 });
			const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll("#hud > *")].filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect().right)));
			expect(right).toBeLessThanOrEqual(width);
		}
		await page.close();
	}, T);
});
