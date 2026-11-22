// A recorded fixture (fixtures/*.ndjson) plays in the bundled scene with ?replay=<name>&speed=N.
// Needs Google Chrome installed; run with `bun test e2e/`.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { parseRecording } from "../src/watcher/replay";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const FIXTURE = "busy-release";

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

test(
	"plays the recorded frames in order, with times moved to now",
	async () => {
		const frames = parseRecording(readFileSync(join(ROOT, "fixtures", `${FIXTURE}.ndjson`), "utf8"));
		const span = frames.at(-1)!.at - frames[0]!.at;
		const speed = Math.max(1, Math.ceil(span / 4000)); // the whole recording in about 4 s
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await page.goto(`http://localhost:${server.port}/?inspect&replay=${FIXTURE}&speed=${speed}`);
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 15_000 });
		const first = await page.evaluate(() => window.__busybodies!.snapshot()!);
		expect(Math.abs(first.at - Date.now())).toBeLessThan(60_000);
		expect(first.sessions.map((s) => s.id)).toEqual(frames[0]!.sessions.map((s) => s.id));
		await page.waitForTimeout(span / speed + 1500);
		const last = await page.evaluate(() => window.__busybodies!.snapshot()!);
		expect(last.sessions.map((s) => s.id)).toEqual(frames.at(-1)!.sessions.map((s) => s.id));
		expect(last.at - first.at).toBeGreaterThan(0);
		await page.close();
	},
	{ timeout: 60_000 },
);
