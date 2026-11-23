// Compact mode as a live camera (mainview/shots.ts), in headless Chrome through the inspector: it
// opens on a shot, cuts to news with a camera move at 60 fps, then goes quiet; the room tiles are
// tinted by state and pin the camera. Run with `bun test e2e/`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";
import type { Snapshot } from "../src/watcher/model";

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
	const page = await browser.newPage({ viewport: { width: 440, height: 300 } });
	await page.goto(`http://localhost:${server.port}/?inspect&compact&${query}`);
	await page.waitForFunction(() => window.__busybodies?.ready === true && !!window.__busybodies.shot(), undefined, { timeout: 15_000 });
	return page;
}

const shot = (page: Page) => page.evaluate(() => window.__busybodies!.shot()!);

/** The snapshot `ms` on: unchanged, or with one session's PR opened just then. */
function later(s: Snapshot, ms: number, pr = false): Snapshot {
	const at = s.at + ms;
	const [first, ...rest] = s.sessions;
	return { at, sessions: pr ? [{ ...first!, prs: [{ number: 777, url: "https://example.invalid/pull/777", at }] }, ...rest] : s.sessions };
}

/** Let the news the idle demo opens on (a compaction) go stale: the camera rests on the whole office. */
async function settle(page: Page): Promise<Snapshot> {
	const s = await page.evaluate(() => window.__busybodies!.snapshot()!);
	await page.evaluate((x) => window.__busybodies!.show(x), later(s, 60_000));
	await page.waitForFunction(() => !window.__busybodies!.camera().moving, undefined, { timeout: 10_000 });
	return s;
}

describe("compact: a live camera", () => {
	test("an idle office rests on the whole office; news cuts with a 60 fps camera move, then it goes quiet (calm)", async () => {
		// The voice is held back (?settle): this measures the camera, and a bubble is a render.
		const page = await open("demo=idle&calm&settle=600000");
		const first = await shot(page);
		expect(first.cuts).toBe(0);
		const s = await settle(page);
		const rest = await shot(page);
		expect(rest).toMatchObject({ stop: { kind: "office" }, reason: "idle", pinned: false });
		expect(rest.tiles.every((t) => t.state === "idle")).toBe(true);

		await page.evaluate((x) => window.__busybodies!.show(x), later(s, 70_000, true));
		const cut = await shot(page);
		expect(cut).toMatchObject({ reason: "pr", cuts: rest.cuts + 1, pinned: false });
		expect(cut.stop.kind).toBe("room");
		const during = await page.evaluate(() => ({ moving: window.__busybodies!.camera().moving, fps: window.__busybodies!.counters().maxFPS }));
		expect(during).toEqual({ moving: true, fps: 60 });

		// The move ends, the PR is played out, and the room on camera stops drawing.
		await page.waitForFunction(() => !window.__busybodies!.camera().moving, undefined, { timeout: 10_000 });
		expect((await page.evaluate(() => window.__busybodies!.camera())).stop).toEqual(cut.stop);
		// The lead plays the PR, walks it to the outbox and back (timed wake-ups), then nothing moves:
		// a whole window with no frames, still on the same shot.
		const windows: number[] = [];
		for (let i = 0; i < 12 && windows.at(-1) !== 0; i++) {
			await page.evaluate(() => window.__busybodies!.resetCounters());
			await page.waitForTimeout(1500);
			const c = await page.evaluate(() => window.__busybodies!.counters());
			windows.push(c.animationFrames + c.renders);
		}
		console.log("frames per 1.5 s window after the cut:", windows.join(" "));
		expect(windows.at(-1)).toBe(0);
		expect((await shot(page)).stop).toEqual(cut.stop);
		await page.close();
	}, T);

	test("tiles: one per room under the picture; clicking one pins the camera there, clicking again lets it go", async () => {
		const page = await open("demo&frozen");
		const tiles = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#bb-tiles .tile")].map((b) => ({ area: b.dataset.area, cls: b.className, bottom: b.getBoundingClientRect().bottom })));
		const layout = await page.evaluate(() => window.__busybodies!.layout()!.areas.map((a) => a.id));
		expect(tiles.map((t) => t.area)).toEqual(layout);
		expect(tiles.some((t) => t.cls.includes("busy"))).toBe(true);
		for (const t of tiles) expect(t.bottom).toBeLessThanOrEqual(300);
		// The canvas leaves room for the strip.
		expect(await page.evaluate(() => document.querySelector("canvas")!.getBoundingClientRect().height)).toBeLessThan(300);

		const target = layout.find((id) => id !== (tiles.find((t) => t.cls.includes(" on"))?.area))!;
		await page.click(`#bb-tiles .tile[data-area="${target}"]`);
		expect(await shot(page)).toMatchObject({ stop: { kind: "room", id: target }, reason: "pinned", pinned: true, until: null });
		expect(await page.evaluate(() => !document.querySelector<HTMLElement>("#bb-tiles .unpin")!.hidden)).toBe(true);
		await page.click(`#bb-tiles .tile[data-area="${target}"]`);
		const free = await shot(page);
		expect(free.pinned).toBe(false);
		expect(await page.evaluate(() => document.querySelector<HTMLElement>("#bb-tiles .unpin")!.hidden)).toBe(true);
		await page.close();
	}, T);

	test("no cuts while hidden; back on screen it cuts straight to the news", async () => {
		const page = await open("demo=idle&calm");
		const s = await settle(page);
		const rest = await shot(page);
		await page.evaluate(() => window.__busybodies!.setVisible(false));
		await page.evaluate((x) => window.__busybodies!.show(x), later(s, 70_000, true));
		expect(await shot(page)).toMatchObject({ stop: { kind: "office" }, cuts: rest.cuts });
		expect((await page.evaluate(() => window.__busybodies!.camera())).stop).toEqual({ kind: "office" });
		await page.evaluate(() => window.__busybodies!.setVisible(true));
		const back = await shot(page);
		expect(back).toMatchObject({ reason: "pr", cuts: rest.cuts + 1 });
		expect((await page.evaluate(() => window.__busybodies!.camera())).stop).toEqual(back.stop);
		await page.close();
	}, T);

	test("the full office doesn't follow unless asked (?follow)", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await page.goto(`http://localhost:${server.port}/?inspect&demo&frozen`);
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
		expect(await page.evaluate(() => window.__busybodies!.shot())).toBeUndefined();
		expect(await page.evaluate(() => window.__busybodies!.camera().stop)).toEqual({ kind: "office" });
		expect(await page.evaluate(() => document.getElementById("bb-tiles"))).toBeNull();
		await page.close();
	}, T);
});
