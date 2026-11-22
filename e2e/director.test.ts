// The director in the real scene: walks raise the frame rate only while they last, an idle office
// goes back to zero frames once they end, and the inspector reports each character's spot, pose
// and walk. Served from dist/ like frames.test.ts; run with `bun test e2e/`.
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
}, 30_000);

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

describe("walks", () => {
	test("a walk raises the frame rate while it lasts, then the idle office goes quiet", async () => {
		const page = await open("demo=idle");
		expect((await measure(page, 1000)).animationFrames).toBe(0);
		// A new session arrives: its lead walks in from the lobby door.
		await page.evaluate(() => {
			const b = window.__busybodies!;
			const s = structuredClone(b.snapshot()!);
			const first = s.sessions[0]!;
			s.sessions.push({ ...first, id: "e2e-new", title: "Just arrived", startedAt: s.at, children: [], agents: [] });
			b.show(s);
		});
		const during = await page.evaluate(() => ({
			c: window.__busybodies!.counters(),
			walking: window.__busybodies!.entities().filter((e) => e.walk).map((e) => e.key),
		}));
		expect(during.walking).toEqual(["s:e2e-new"]);
		expect(during.c.tickerRunning).toBe(true);
		expect(during.c.maxFPS).toBe(60);
		await page.waitForFunction(() => !window.__busybodies!.counters().tickerRunning, undefined, { timeout: 20_000 });
		const after = await measure(page);
		expect(after.animationFrames).toBe(0);
		expect(after.renders).toBe(0);
		const lead = await page.evaluate(() => window.__busybodies!.entities().find((e) => e.key === "s:e2e-new")!);
		expect(lead.spot).toBe("desk");
		expect(lead.walk).toBe("");
		await page.close();
	}, T);
});

describe("the inspector", () => {
	test("reports every character's spot, pose and walk, and the director's events", async () => {
		const page = await open("demo=day-1&frozen");
		const { list, events, world } = await page.evaluate(() => {
			const b = window.__busybodies!;
			b.step(30);
			return { list: b.entities(), events: b.events(), world: Object.keys(b.world()!.actors).length };
		});
		expect(world).toBe(list.length);
		for (const e of list) {
			expect(typeof e.spot).toBe("string");
			expect(String(e.spot).length).toBeGreaterThan(0);
			expect(typeof e.pose).toBe("string");
			expect(typeof e.walk).toBe("string");
		}
		const walking = list.filter((e) => e.walk);
		expect(walking.map((e) => e.key).sort()).toEqual(["a:demo-session-20:demo-agent-hired-1", "s:demo-session-30"]);
		expect(events.some((e) => e.type === "review" && e.state === "start")).toBe(true);
		expect(events.some((e) => e.type === "handover")).toBe(true);
		await page.close();
	}, T);

	test("waiting on you pulses the room and shows the top pill", async () => {
		const page = await open("demo=day-2&frozen");
		const r = await page.evaluate(() => {
			const b = window.__busybodies!;
			b.step(5);
			const pill = document.querySelector("#hud .waiting") as HTMLElement;
			const lead = b.entities().find((e) => e.key === "s:demo-session-16")!;
			return { pulsing: b.pulsing().areas, pill: pill.hidden ? "" : pill.textContent, pose: String(lead.pose) };
		});
		expect(r.pulsing).toEqual(["room:lanternfish"]);
		expect(r.pill).toBe("1 waiting on you");
		expect(["waiting", "waitingPlease"]).toContain(r.pose);
		await page.close();
	}, T);

	test("a beat of the demo day steps to the same frame every time", async () => {
		const frame = async () => {
			const page = await open("demo=day-3&frozen");
			const out = await page.evaluate(() => {
				const b = window.__busybodies!;
				b.step(45);
				return b.entities().map((e) => `${e.key}:${e.spot}:${e.pose}:${e.frame}:${e.walk}:${e.x},${e.y}`);
			});
			await page.close();
			return out;
		};
		expect(await frame()).toEqual(await frame());
	}, T);
});
