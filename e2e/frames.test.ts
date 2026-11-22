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
}, 30_000);

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

	test("a busy room with several walkers still renders at no more than 30 fps", async () => {
		// Walks run at the ambient rate: with trips, brick runs and rounds, a busy room has someone
		// walking nearly all the time, and it must not pin the app at 60.
		const page = await open("demo=release&settle=600000");
		await page.evaluate(() => {
			const b = window.__busybodies!;
			const s = structuredClone(b.snapshot()!);
			const first = s.sessions[0]!;
			// Six new sessions in the busy room: six leads walking in from the lobby door at once.
			for (let i = 0; i < 6; i++) s.sessions.push({ ...first, id: `e2e-walker-${i}`, title: `Walker ${i}`, startedAt: s.at + i, children: [], agents: [] });
			b.show(s);
		});
		const walkers = await page.evaluate(() => window.__busybodies!.entities().filter((e) => e.walk).length);
		expect(walkers).toBeGreaterThanOrEqual(6);
		await page.evaluate(() => window.__busybodies!.resetCounters());
		await page.waitForTimeout(2000);
		const c = await page.evaluate(() => window.__busybodies!.counters());
		expect(await page.evaluate(() => window.__busybodies!.entities().filter((e) => e.walk).length)).toBeGreaterThan(0);
		expect(c.tickerRunning).toBe(true);
		expect(c.maxFPS).toBe(30);
		// Only a floor (it is animating): six walkers rendered in software on a loaded runner can be slow.
		expect(c.renders).toBeGreaterThan(0);
		expect(c.renders).toBeLessThanOrEqual(64);
		await page.close();
	}, T);

	test("the loop stops once everyone goes idle", async () => {
		const page = await open("demo");
		await page.evaluate(() => {
			const b = window.__busybodies!;
			const s = structuredClone(b.snapshot()!);
			type S = (typeof s.sessions)[number];
			type A = S["agents"][number];
			const rest = (a: A): A => ({ ...a, status: "finished", children: a.children.map(rest) });
			const nap = (x: S): void => {
				x.state = "idle";
				x.agents = x.agents.map(rest);
				x.children.forEach(nap);
			};
			s.sessions.forEach(nap);
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

describe("draw calls", () => {
	test("a busy frame of the FloorBusy day takes at most 30 WebGL draws", async () => {
		// Static rooms are cached textures and furniture, labels and characters batch; a regression
		// here (a new unbatchable Graphics per desk, say) shows up long before it shows in fps.
		const page = await open("demo&frozen");
		const draws = await page.evaluate(() => {
			const gl = document.querySelector("canvas")!.getContext("webgl2")!;
			let n = 0;
			const de = gl.drawElements.bind(gl);
			const da = gl.drawArrays.bind(gl);
			gl.drawElements = (...a: Parameters<typeof de>) => (n++, de(...a));
			gl.drawArrays = (...a: Parameters<typeof da>) => (n++, da(...a));
			const b = window.__busybodies!;
			b.step(1);
			n = 0;
			b.step(1);
			return n;
		});
		expect(draws).toBeGreaterThan(0);
		expect(draws).toBeLessThanOrEqual(30);
		await page.close();
	}, T);
});

describe("camera", () => {
	test("a move runs the ticker at 60 fps only while moving, then the idle office goes quiet", async () => {
		const page = await open("demo=idle");
		const during = await page.evaluate(() => {
			const b = window.__busybodies!;
			b.goTo({ kind: "room", id: "room:lanternfish" });
			return b.counters();
		});
		expect(during.tickerRunning).toBe(true);
		expect(during.maxFPS).toBe(60);
		await page.waitForFunction(() => !window.__busybodies!.camera().moving, undefined, { timeout: 10_000 });
		const c = await measure(page);
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		const cam = await page.evaluate(() => window.__busybodies!.camera());
		expect(cam.stop).toEqual({ kind: "room", id: "room:lanternfish" });
		// Static layers were re-baked at the zoomed-in scale.
		expect(cam.bake).toBeGreaterThan(1);
		await page.close();
	}, T);

	test("keys step between rooms and back to the whole office", async () => {
		const page = await open("demo=idle");
		await page.keyboard.press("n");
		await page.waitForFunction(() => !window.__busybodies!.camera().moving);
		const first = await page.evaluate(() => window.__busybodies!.camera().stop);
		expect(first).toEqual({ kind: "room", id: "meeting" });
		await page.keyboard.press("n");
		await page.waitForFunction(() => !window.__busybodies!.camera().moving);
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "room", id: "room:lanternfish" });
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !window.__busybodies!.camera().moving);
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "office" });
		await page.close();
	}, T);

	test("clicking a room zooms to it, and a desk in it zooms to the desk", async () => {
		const page = await open("demo=idle");
		const target = await page.evaluate(() => {
			const b = window.__busybodies!;
			const desk = b.layout()!.areas.find((a) => a.name === "orbit-kit")!.desks[0]!;
			const v = b.camera();
			return { id: desk.id, x: (desk.cell.x + desk.cell.w / 2) * v.scale + v.x, y: (desk.cell.y + 40) * v.scale + v.y };
		});
		await page.mouse.click(target.x, target.y);
		await page.waitForFunction(() => !window.__busybodies!.camera().moving);
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "room", id: "room:orbit-kit" });
		const again = await page.evaluate((id) => {
			const b = window.__busybodies!;
			const desk = b.layout()!.areas.flatMap((a) => a.desks).find((d) => d.id === id)!;
			const v = b.camera();
			return { x: (desk.cell.x + desk.cell.w / 2) * v.scale + v.x, y: (desk.cell.y + 40) * v.scale + v.y };
		}, target.id);
		await page.mouse.click(again.x, again.y);
		await page.waitForFunction(() => !window.__busybodies!.camera().moving);
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "desk", id: target.id });
		await page.close();
	}, T);
});

describe("the app around the office", () => {
	test("an empty office is never blank: a night watch naps, a sign explains, and it costs no frames", async () => {
		const page = await open("demo=empty");
		const keys = await page.evaluate(() => window.__busybodies!.entities().map((e) => e.key));
		expect(keys).toEqual(["night-watch"]);
		const card = page.locator(".bb-card");
		await expect(card.isVisible()).resolves.toBe(true);
		expect(await card.innerText()).toContain("Nobody's in");
		const c = await measure(page);
		expect(c.animationFrames).toBe(0);
		await page.close();
	}, T);

	test("with no coding agent found, it says so plainly", async () => {
		const page = await open("demo=nohome");
		const text = await page.locator(".bb-card").innerText();
		expect(text).toContain("No coding agent found");
		expect(text).toContain("BUSYBODIES_AGENT_HOME");
		await page.close();
	}, T);

	test("About says what it reads and that nothing leaves the machine; Escape closes it", async () => {
		const page = await open("demo=idle");
		await page.click("#hud .about");
		const about = page.locator("#bb-about");
		await page.waitForFunction(() => !document.querySelector<HTMLElement>("#bb-about")!.hidden);
		const text = await about.innerText();
		expect(text).toContain("Read-only");
		expect(text).toContain("Nothing you're working on");
		await page.keyboard.press("Escape");
		expect(await page.evaluate(() => document.querySelector<HTMLElement>("#bb-about")!.hidden)).toBe(true);
		// Escape closed About without also moving the camera.
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "office" });
		await page.close();
	}, T);

	test("compact mode: a slim draggable strip over a transparent office, still idle at zero frames", async () => {
		const page = await browser.newPage({ viewport: { width: 440, height: 300 } });
		await page.goto(`http://localhost:${server.port}/?inspect&demo=idle&compact`);
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
		const hud = await page.evaluate(() => {
			const bar = document.getElementById("hud")!;
			return { compact: bar.classList.contains("compact"), drag: bar.classList.contains("electrobun-webkit-app-region-drag"), height: bar.offsetHeight };
		});
		expect(hud).toEqual({ compact: true, drag: true, height: 34 });
		expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
		const c = await measure(page);
		expect(c.animationFrames).toBe(0);
		await page.close();
	}, T);
});

describe("leaks", () => {
	test("a replayed busy day keeps its GPU buffers flat: bubbles and labels free their geometry", async () => {
		// Before the fix, every bubble and label the office destroyed kept its GraphicsContext and
		// its WebGL buffers: about 8 a second at this speed, and the heap grew ~17 MB a minute.
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await page.addInitScript(() => {
			const w = window as unknown as { __buffers: number };
			w.__buffers = 0;
			const proto = WebGL2RenderingContext.prototype;
			const create = proto.createBuffer;
			const del = proto.deleteBuffer;
			proto.createBuffer = function () {
				w.__buffers++;
				return create.call(this);
			};
			proto.deleteBuffer = function (b) {
				if (b) w.__buffers--;
				return del.call(this, b);
			};
		});
		await page.goto(`http://localhost:${server.port}/?inspect&replay=busy-release&speed=16&loop`);
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
		const buffers = () => page.evaluate(() => (window as unknown as { __buffers: number }).__buffers);
		await page.waitForTimeout(4000);
		const before = await buffers();
		await page.waitForTimeout(12_000);
		const after = await buffers();
		expect(after - before).toBeLessThan(24);
		await page.close();
	}, 45_000);
});

describe("inspector", () => {
	test("lists every character with a mood", async () => {
		const page = await open("demo");
		const moods = await page.evaluate(() =>
			window.__busybodies!.entities().reduce<Record<string, number>>((m, e) => ((m[e.mood] = (m[e.mood] ?? 0) + 1), m), {}),
		);
		expect(moods).toEqual({ busy: 18, idle: 4, stalled: 2, done: 4 });
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
