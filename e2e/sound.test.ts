// Sound in headless Chrome, as state (not audio output): with ?sound a demo beat schedules its
// earcon, off screen and in calm mode the AudioContext suspends, and without ?sound (or in the
// compact window) there is no AudioContext at all. Like the other e2e tests, the bundled scene
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
	// Headless Chrome wants a gesture before audio runs; the app is opted in by the tray instead.
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
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

const contextIs = (page: Page, state: string) =>
	page.waitForFunction((s) => window.__busybodies!.sound()?.context === s, state, { timeout: 15_000 });

describe("sound", () => {
	test("off by default: no AudioContext is made", async () => {
		const page = await open("demo&frozen");
		const s = await page.evaluate(() => window.__busybodies!.sound());
		expect(s?.enabled).toBe(false);
		expect(s?.context).toBe("none");
		await page.close();
	}, T);

	test("?sound: a new wait rings the bell, panned to its room; hidden and calm suspend", async () => {
		const page = await open("demo&frozen&sound");
		await contextIs(page, "running");
		const before = await page.evaluate(() => window.__busybodies!.sound()!);
		expect(before.enabled).toBe(true);
		expect(before.live).toBe(true);
		expect(before.tone.running).toBe(true);

		// A demo beat: the first session starts waiting on you.
		const beat = await page.evaluate(() => {
			const b = window.__busybodies!;
			const snap = structuredClone(b.snapshot()!);
			snap.at += 5_000;
			const s = snap.sessions.find((x) => !x.waiting)!;
			s.waiting = { reason: "permission", since: snap.at - 300, source: "hook" };
			b.show(snap);
			return { key: `s:${s.id}`, sound: b.sound()! };
		});
		const bell = beat.sound.last.find((p) => p.kind === "bell");
		expect(bell?.id.startsWith(`bell:${beat.key}:`)).toBe(true);
		expect(bell!.pan).toBeGreaterThanOrEqual(-1);
		expect(bell!.pan).toBeLessThanOrEqual(1);
		expect(bell!.gain).toBe(1);

		// Off screen: suspended, and the room tone's timer stops with it.
		await page.evaluate(() => window.__busybodies!.setVisible(false));
		await contextIs(page, "suspended");
		expect((await page.evaluate(() => window.__busybodies!.sound()!)).tone.running).toBe(false);
		await page.evaluate(() => window.__busybodies!.setVisible(true));
		await contextIs(page, "running");

		// Calm office (the tray's toggle): suspended too, and life off.
		await page.evaluate(() => window.__busybodies!.setToggles({ calm: true }));
		await contextIs(page, "suspended");
		expect(await page.evaluate(() => window.__busybodies!.counters().life)).toBe(false);
		await page.evaluate(() => window.__busybodies!.setToggles({ calm: false }));
		await contextIs(page, "running");
		expect(await page.evaluate(() => window.__busybodies!.counters().life)).toBe(true);

		// Sound off from the tray: suspended, and earcons stay quiet.
		await page.evaluate(() => window.__busybodies!.setToggles({ sound: false }));
		await contextIs(page, "suspended");
		await page.close();
	}, T);

	test("turned on live: the AudioContext is made then, not before", async () => {
		const page = await open("demo&frozen");
		await page.evaluate(() => window.__busybodies!.setToggles({ sound: true }));
		await contextIs(page, "running");
		await page.close();
	}, T);

	test("the compact window never plays sound", async () => {
		const page = await open("demo&frozen&compact&sound");
		expect(await page.evaluate(() => window.__busybodies!.sound())).toBeUndefined();
		await page.close();
	}, T);
});
