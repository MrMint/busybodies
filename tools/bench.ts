// What a frame of the scene costs, in headless Chrome on the GPU: main-thread CPU per second of
// wall time, renders, and (with --profile) where that time goes, by function.
//   bun tools/bench.ts [--dist dist] [--secs 6] [--theme office,factory,bakery] [--only idle,busy] [--profile] [--top 30]
// Each scene is a ?demo fixture. `cpu` is Chrome's TaskDuration (everything the renderer's main
// thread ran: script, style, layout, GL calls) over the window, as % of one core; `script` is the
// JavaScript part of it. tools/profile.sh measures the real app (Bun and WebContent); this one
// isolates the scene from the app and the window and gives the same numbers on a loaded machine
// more steadily, since it is a ratio of the page's own time. For readable --profile names, build
// unminified: `hutch pm exec -- vite build --minify false --outDir <dir>` and pass --dist <dir>.
import { existsSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values: o } = parseArgs({
	options: {
		dist: { type: "string", default: "dist" },
		secs: { type: "string", default: "6" },
		theme: { type: "string", default: "office,factory,bakery" },
		only: { type: "string" },
		profile: { type: "boolean", default: false },
		top: { type: "string", default: "30" },
		software: { type: "boolean", default: false },
	},
});

const SCENES: { name: string; query: string }[] = [
	{ name: "idle", query: "demo=idle" },
	{ name: "idle-calm", query: "demo=idle&calm" },
	{ name: "busy", query: "demo&settle=600000" },
	{ name: "crowd-idle", query: "demo=crowd-idle" },
	{ name: "crowd", query: "demo=crowd" },
	{ name: "room", query: "demo&settle=600000&room=1" },
];

const DIST = resolve(o.dist!);
if (!existsSync(join(DIST, "index.html"))) throw new Error(`no build in ${DIST}: run vite build first`);
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
	args: o.software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--ignore-gpu-blocklist"],
});

interface Node {
	id: number;
	callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
	hitCount?: number;
}

const secs = Number(o.secs);
const themes = o.theme!.split(",");
const only = o.only?.split(",");
const totals = new Map<string, number>();
for (const theme of themes)
	for (const scene of SCENES) {
		if (only && !only.includes(scene.name)) continue;
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
		await page.goto(`http://localhost:${server.port}/?inspect&hour=14&theme=${theme}&${scene.query.replace("&room=1", "")}`);
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 30_000 });
		if (scene.query.includes("room=1")) {
			// The camera on the first room, settled.
			await page.evaluate(() => {
				const b = window.__busybodies!;
				const a = b.layout()!.areas[0]!;
				b.goTo({ kind: "room", id: a.id }, false);
			});
		}
		await page.waitForTimeout(1500);
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Performance.enable");
		if (o.profile) {
			await cdp.send("Profiler.enable");
			await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
			await cdp.send("Profiler.start");
		}
		const metric = async () =>
			Object.fromEntries(
				((await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]),
			);
		await page.evaluate(() => window.__busybodies!.resetCounters());
		const m0 = await metric();
		await page.waitForTimeout(secs * 1000);
		const m1 = await metric();
		const c = await page.evaluate(() => window.__busybodies!.counters());
		const wall = m1.Timestamp! - m0.Timestamp!;
		const cpu = ((m1.TaskDuration! - m0.TaskDuration!) / wall) * 100;
		const script = ((m1.ScriptDuration! - m0.ScriptDuration!) / wall) * 100;
		const perFrame = c.renders ? ((m1.TaskDuration! - m0.TaskDuration!) * 1000) / c.renders : 0;
		console.log(
			`${theme.padEnd(8)} ${scene.name.padEnd(11)} cpu ${cpu.toFixed(1).padStart(5)}%  script ${script.toFixed(1).padStart(5)}%  renders ${String(c.renders).padStart(4)} (${(c.renders / wall).toFixed(1)}/s)  ${perFrame.toFixed(2)} ms/frame`,
		);
		if (o.profile) {
			const { profile } = (await cdp.send("Profiler.stop")) as { profile: { nodes: Node[]; samples: number[]; timeDeltas: number[] } };
			const self = new Map<number, number>();
			profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
			const total = [...self.values()].reduce((a, b) => a + b, 0);
			const byFn = new Map<string, number>();
			for (const n of profile.nodes) {
				const f = n.callFrame;
				if (f.functionName === "(idle)" || f.functionName === "(program)") continue;
				const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
				byFn.set(key, (byFn.get(key) ?? 0) + (self.get(n.id) ?? 0));
			}
			const busy = [...byFn.values()].reduce((a, b) => a + b, 0);
			console.log(`   sampled ${(total / 1000).toFixed(0)} ms, busy ${(busy / 1000).toFixed(0)} ms; top self time:`);
			for (const [k, v] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, Number(o.top))) {
				console.log(`   ${((v / busy) * 100).toFixed(1).padStart(5)}%  ${k}`);
				totals.set(k, (totals.get(k) ?? 0) + v);
			}
		}
		await page.close();
	}
await browser.close();
server.stop(true);
