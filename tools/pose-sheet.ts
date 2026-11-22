// tools/pose-sheet.ts [out.png] [--only=a,b] [--zoom=3] [--theme=factory] [--base=http://localhost:5194]:
// render every pose's frames into one PNG, in headless Chrome against the bundled scene (as e2e/
// does). Build first: `hutch pm exec -- vite build`. Default output: docs/rig/pose-sheet.png, or
// docs/rig/pose-sheet-<theme>.png with `--theme` (the rig's parts for that theme). `--only` and
// `--zoom` shoot a close-up of some poses (the sheet's own ?only= and &zoom=); `--base` shoots a
// running dev server instead of dist/, for a quick look while posing. `--parts=n` renders the sheet in n
// pieces and stitches them (default 3 for the full sheet, which is too tall for one canvas).
// For the same poses as text: bun tools/pose-dump.ts
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const theme = flag("theme");
const out = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(ROOT, `docs/rig/pose-sheet${theme && theme !== "office" ? `-${theme}` : ""}.png`);
const query = new URLSearchParams({ sheet: "" });
if (theme) query.set("theme", theme);
if (flag("only")) query.set("only", flag("only")!);
if (flag("zoom")) query.set("zoom", flag("zoom")!);
const base = flag("base");

if (!base && !existsSync(join(DIST, "index.html"))) {
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
	// A full sheet is taller than headless Chrome will capture from one WebGL canvas: render it in
	// parts (the sheet's &part=k/n) and stitch them in a 2D canvas.
	const parts = Number(flag("parts")) || (flag("only") ? 1 : 3);
	const shots: { png: string; width: number; height: number }[] = [];
	for (let k = 0; k < parts; k++) {
		const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
		page.on("pageerror", (e) => console.error("page error:", e.message));
		query.set("part", `${k}/${parts}`);
		await page.goto(`${base ?? `http://localhost:${server.port}`}/?${query.toString().replace("sheet=", "sheet")}`);
		await page.waitForFunction(() => (window as unknown as { __sheet?: { ready: boolean } }).__sheet?.ready === true, undefined, { timeout: 30_000 });
		const size = await page.evaluate(() => (window as unknown as { __sheet: { width: number; height: number } }).__sheet);
		const w = Math.ceil(size.width);
		const h = Math.ceil(size.height);
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(200);
		shots.push({ png: (await page.locator("canvas").screenshot()).toString("base64"), width: w, height: h });
		await page.close();
	}
	const page = await browser.newPage();
	const png = await page.evaluate(async (shots) => {
		const W = Math.max(...shots.map((s) => s.width));
		const H = shots.reduce((n, s) => n + s.height, 0);
		const c = document.createElement("canvas");
		c.width = W;
		c.height = H;
		const g = c.getContext("2d")!;
		g.fillStyle = "#f8f6f1";
		g.fillRect(0, 0, W, H);
		let y = 0;
		for (const s of shots) {
			const img = new Image();
			img.src = `data:image/png;base64,${s.png}`;
			await img.decode();
			g.drawImage(img, 0, y);
			y += s.height;
		}
		return c.toDataURL("image/png").split(",")[1]!;
	}, shots);
	mkdirSync(dirname(out), { recursive: true });
	await Bun.write(out, Buffer.from(png, "base64"));
	const W = Math.max(...shots.map((s) => s.width));
	const H = shots.reduce((n, s) => n + s.height, 0);
	console.log(`wrote ${out} (${W}×${H}, ${parts} part${parts > 1 ? "s" : ""})`);
} finally {
	await browser.close();
	server.stop(true);
}
