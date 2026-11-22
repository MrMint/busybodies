// Soaks the scene itself in headless Chrome: a recorded busy day replayed on a loop for a while,
// sampling the page's JS heap, its WebGL textures and the number of characters, to catch leaks
// in the office, the rig, the director or the sass. Headless Chrome keeps drawing however the
// machine's screen is (a real window's webview is throttled when it is hidden or locked).
//   bun tools/soak-scene.ts [--minutes 30] [--fixture busy-release] [--speed 8]
// Renders the bundled scene in dist/ (built if missing).
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const { values: o } = parseArgs({
	options: {
		minutes: { type: "string", default: "30" },
		fixture: { type: "string", default: "busy-release" },
		speed: { type: "string", default: "8" },
	},
});

if (!existsSync(join(DIST, "index.html"))) {
	const build = Bun.spawnSync(["bun", "x", "vite", "build"], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
	if (build.exitCode !== 0) throw new Error("vite build failed");
}
const server = Bun.serve({
	port: 0,
	fetch(req) {
		const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, "");
		const file = Bun.file(join(DIST, path === "/" ? "index.html" : path));
		return file.exists().then((ok) => (ok ? new Response(file) : new Response("not found", { status: 404 })));
	},
});

const browser = await chromium.launch({
	channel: "chrome",
	headless: true,
	args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	// Count live WebGL textures: created minus deleted.
	await page.addInitScript(() => {
		const w = window as unknown as { __textures: number };
		w.__textures = 0;
		const proto = WebGL2RenderingContext.prototype;
		const create = proto.createTexture;
		const del = proto.deleteTexture;
		proto.createTexture = function () {
			w.__textures++;
			return create.call(this);
		};
		proto.deleteTexture = function (t) {
			if (t) w.__textures--;
			return del.call(this, t);
		};
	});
	await page.goto(`http://localhost:${server.port}/?inspect&replay=${o.fixture}&speed=${o.speed}&loop`);
	await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 30_000 });

	const sample = () =>
		page.evaluate(() => {
			(window as unknown as { gc?: () => void }).gc?.();
			const m = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
			const b = window.__busybodies!;
			return { heapMB: m.usedJSHeapSize / 1048576, textures: (window as unknown as { __textures: number }).__textures, characters: b.entities().length, renders: b.counters().renders };
		});
	const minutes = Number(o.minutes);
	const rows: { min: number; heapMB: number; textures: number; characters: number; renders: number }[] = [];
	const t0 = Date.now();
	while (Date.now() - t0 < minutes * 60_000) {
		const s = await sample();
		const min = (Date.now() - t0) / 60_000;
		rows.push({ min, ...s });
		console.log(`${min.toFixed(1).padStart(5)} min  heap ${s.heapMB.toFixed(1).padStart(6)} MB  textures ${String(s.textures).padStart(4)}  characters ${String(s.characters).padStart(3)}  renders ${s.renders}`);
		await page.waitForTimeout(30_000);
	}
	const warm = rows.find((r) => r.min >= 5) ?? rows[0]!;
	const last = rows[rows.length - 1]!;
	const peak = Math.max(...rows.map((r) => r.heapMB));
	console.log(
		`\nheap: start ${rows[0]!.heapMB.toFixed(1)} MB, peak ${peak.toFixed(1)} MB, end ${last.heapMB.toFixed(1)} MB, after warm-up ${(last.heapMB - warm.heapMB >= 0 ? "+" : "") + (last.heapMB - warm.heapMB).toFixed(1)} MB`,
	);
	console.log(`textures: after warm-up ${warm.textures}, end ${last.textures}; renders ${last.renders}`);
} finally {
	await browser.close();
	server.stop(true);
}
