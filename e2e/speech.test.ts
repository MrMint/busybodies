// Voiced lines in headless Chrome, as state: with ?sound a new wait on you speaks its line, from a
// clip when the manifest has one (e2e/fixtures/voice: four tiny synthesised tones, no voices) and
// as babble when it doesn't; without ?sound nothing is spoken. Like the other e2e tests, the bundled
// scene from dist/ with ?demo; run with `bun test e2e/`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const FIXTURES = join(import.meta.dir, "fixtures");
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
			const file = path.startsWith("/fx/") ? Bun.file(join(FIXTURES, path.slice(4))) : Bun.file(join(DIST, path === "/" ? "index.html" : path));
			return file.exists().then((ok) => (ok ? new Response(file) : new Response("not found", { status: 404 })));
		},
	});
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

/**
 * Demo beats: sessions start waiting on you, one by one, until one's bubble is said aloud (the
 * seeded pick may be a thought, which stays silent). Returns that lead's key.
 */
const startWait = (page: Page) =>
	page.evaluate(() => {
		const b = window.__busybodies!;
		let snap = b.snapshot()!;
		for (let i = 0; i < 12; i++) {
			snap = structuredClone(snap);
			snap.at += 5_000;
			const s = snap.sessions.find((x) => !x.waiting);
			if (!s) break;
			s.waiting = { reason: "permission", since: snap.at - 300, source: "hook" };
			b.show(snap);
			const key = `s:${s.id}`;
			if (b.sass()?.bubbles.some((x) => x.key === key && x.kind === "said" && x.trigger === "waiting")) return key;
		}
		return undefined;
	});

const spoken = (page: Page) => page.waitForFunction(() => window.__busybodies!.speech()?.last.length, undefined, { timeout: 15_000 }).then(() => page.evaluate(() => window.__busybodies!.speech()!));

describe("speech", () => {
	test("a new wait speaks its line from a clip, pitched for its character", async () => {
		const page = await open("demo&frozen&sound&speechgrace=0&voicebase=/fx/");
		await page.waitForFunction(() => window.__busybodies!.sound()?.context === "running", undefined, { timeout: 15_000 });
		await page.waitForFunction(() => window.__busybodies!.speech()?.manifest === "ready", undefined, { timeout: 15_000 });
		expect((await page.evaluate(() => window.__busybodies!.speech()!)).clips).toBe(4);
		const key = await startWait(page);
		const s = await spoken(page);
		const line = s.last.at(-1)!;
		expect(line.who).toBe(key);
		expect(line.how).toBe("clip");
		expect(line.file).toMatch(/^office\/[0-9a-f]{16}-o-[ab]\.webm$/);
		expect(Math.abs(line.cents)).toBeLessThanOrEqual(120);
		expect(line.secs).toBeGreaterThan(0.3);
		expect(line.pan).toBeGreaterThanOrEqual(-1);
		expect(line.pan).toBeLessThanOrEqual(1);
		await page.close();
	}, T);

	test("with no clip for the line, it babbles", async () => {
		const page = await open("demo&frozen&sound&speechgrace=0");
		await page.waitForFunction(() => window.__busybodies!.sound()?.context === "running", undefined, { timeout: 15_000 });
		await page.waitForFunction(() => window.__busybodies!.speech()?.manifest === "ready", undefined, { timeout: 15_000 });
		await startWait(page);
		const line = (await spoken(page)).last.at(-1)!;
		expect(line.how).toBe("babble");
		expect(line.file).toBeUndefined();
		await page.close();
	}, T);

	test("without ?sound nothing speaks", async () => {
		const page = await open("demo&frozen&speechgrace=0&voicebase=/fx/");
		await startWait(page);
		await page.waitForTimeout(500);
		const s = await page.evaluate(() => window.__busybodies!.speech());
		expect(s?.last ?? []).toEqual([]);
		expect(s?.manifest ?? "none").toBe("none");
		await page.close();
	}, T);
});
