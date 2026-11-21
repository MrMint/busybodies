// tools/pose-sheet.ts [out.png]: render every pose's frames into one PNG, in headless Chrome
// against the bundled scene (as e2e/ does). Build first: `hutch pm exec -- vite build`.
// Default output: docs/rig/pose-sheet.png. For the same poses as text: bun tools/pose-dump.ts
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const out = process.argv[2] ?? join(ROOT, "docs/rig/pose-sheet.png");

if (!existsSync(join(DIST, "index.html"))) {
	console.error("dist/ is missing: run `hutch pm exec -- vite build` first");
	process.exit(1);
}

const server = Bun.serve({
	port: 0,
	fetch(req) {
		const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, "");
		const file = Bun.file(join(DIST, path === "/" ? "index.html" : path));
		return file.exists().then((ok) => (ok ? new Response(file) : new Response("not found", { status: 404 })));
	},
});
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
	const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
	page.on("pageerror", (e) => console.error("page error:", e.message));
	await page.goto(`http://localhost:${server.port}/?sheet`);
	await page.waitForFunction(() => (window as unknown as { __sheet?: { ready: boolean } }).__sheet?.ready === true, undefined, { timeout: 30_000 });
	const size = await page.evaluate(() => (window as unknown as { __sheet: { width: number; height: number } }).__sheet);
	await page.setViewportSize({ width: Math.ceil(size.width), height: Math.ceil(size.height) });
	await page.waitForTimeout(200);
	mkdirSync(dirname(out), { recursive: true });
	await page.locator("canvas").screenshot({ path: out });
	console.log(`wrote ${out} (${size.width}×${size.height})`);
} finally {
	await browser.close();
	server.stop(true);
}
