// Records the README's GIF from the invented demo day: a frozen scene stepped frame by frame (so
// two runs match, whatever the machine's load), touring the office, a busy room and the kitchen.
//   bun tools/record-gif.ts [--out docs/media/office.gif] [--fps 12] [--width 800]
// Needs Google Chrome and ffmpeg. Every text the frames draw (the snapshot, the signs, the top
// bar) is written beside the frames and run through tools/scan-private.sh, so the GIF's source
// is checked for private data like any tracked file.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const { values: o } = parseArgs({
	options: {
		out: { type: "string", default: join(ROOT, "docs", "media", "office.gif") },
		fps: { type: "string", default: "12" },
		width: { type: "string", default: "800" },
		frames: { type: "string", default: join(ROOT, "artifacts", "gif-frames") },
	},
});
const fps = Number(o.fps);
const width = Number(o.width);
const height = Math.round((width * 10) / 16);
/** 60 fps scene frames per GIF frame. */
const STEP = Math.round(60 / fps);

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

rmSync(o.frames!, { recursive: true, force: true });
mkdirSync(o.frames!, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const texts = new Set<string>();
let n = 0;
try {
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
	await page.goto(`http://localhost:${server.port}/?inspect&frozen&demo=day-1`);
	await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 20_000 });

	const frame = async () => {
		await page.evaluate((step) => window.__busybodies!.step(step), STEP);
		await page.screenshot({ path: join(o.frames!, `${String(++n).padStart(4, "0")}.png`) });
	};
	const hold = async (seconds: number) => {
		for (let i = 0; i < seconds * fps; i++) await frame();
	};
	const go = async (stop: unknown) => {
		await page.evaluate((s) => window.__busybodies!.goTo(s as never, true), stop);
		do await frame();
		while (await page.evaluate(() => window.__busybodies!.camera().moving));
		texts.add(await page.evaluate(() => JSON.stringify({ hud: document.body.innerText, snapshot: window.__busybodies!.snapshot(), signs: window.__busybodies!.signs() })));
	};
	const room = (name: string) => page.evaluate((n) => window.__busybodies!.layout()!.areas.find((a) => a.name === n)!.id, name);

	texts.add(await page.evaluate(() => JSON.stringify({ hud: document.body.innerText, snapshot: window.__busybodies!.snapshot(), signs: window.__busybodies!.signs() })));
	await hold(2.5);
	await go({ kind: "room", id: await room("lanternfish") });
	await hold(3);
	await go({ kind: "room", id: "kitchen" });
	await hold(2);
	await go({ kind: "office" });
	await hold(1.5);
} finally {
	await browser.close();
	server.stop(true);
}

const textFile = join(o.frames!, "drawn-text.txt");
writeFileSync(textFile, [...texts].join("\n"));
const scan = Bun.spawnSync([join(ROOT, "tools", "scan-private.sh"), textFile], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
if (scan.exitCode !== 0) throw new Error("the GIF's source frames carry private data; not writing the GIF");

mkdirSync(join(o.out!, ".."), { recursive: true });
const palette = join(o.frames!, "palette.png");
const run = (args: string[]) => {
	const r = Bun.spawnSync(["ffmpeg", "-loglevel", "error", "-y", ...args], { stdout: "inherit", stderr: "inherit" });
	if (r.exitCode !== 0) throw new Error(`ffmpeg ${args.join(" ")} failed`);
};
const input = ["-framerate", String(fps), "-i", join(o.frames!, "%04d.png")];
run([...input, "-vf", "palettegen=max_colors=128:stats_mode=diff", palette]);
run([...input, "-i", palette, "-lavfi", "paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", o.out!]);
console.log(`wrote ${n} frames (${(n / fps).toFixed(1)} s) to ${o.out}`);
