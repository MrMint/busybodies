// Deterministic screenshots of named scene states, plus one contact sheet of them all.
//   bun tools/shoot.ts [--out artifacts/shots] [--only floor-busy,room-kitchen] [--dpr 1] [--check] [--theme factory]
//   bun tools/shoot.ts --theme office,factory,bakery   every state in each theme, the sheet a state per row
// A state that doesn't come up (a thrown error, a timeout) is a captioned gap on the sheet, not the
// end of the run.
// Each state is a demo fixture, a camera stop and a window size. The scene starts with its clock
// stopped (?frozen) and is stepped a fixed number of frames, so two runs give the same pixels on
// the same machine; --check renders every state twice and fails if any pair differs. Renders the
// bundled scene in dist/ (built if missing) in headless Chrome, in software, like the e2e tests.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium } from "playwright-core";

/** Where to point the camera: a room by its name, or a desk by its session's title; "shot": where
 * compact's following camera put it (mainview/shots.ts). */
type Aim = { kind: "office" } | { kind: "room"; name: string } | { kind: "desk"; title: string } | { kind: "shot" };

interface State {
	name: string;
	/** The ?demo fixture: "" for FloorBusy's day, "idle", "one", "thirty", or "day-N" (the demo day's Nth beat). */
	demo: string;
	aim: Aim;
	size: [number, number];
	/** Frames to step the frozen scene before the shot. */
	frames?: number;
	/** More of the URL's query, such as "compact" or "about". */
	query?: string;
	/** The hour the light is for (?hour=): pinned, so shots never depend on the clock (default 14). */
	hour?: number;
}

const BOARD: [number, number] = [1440, 900];
const STATES: State[] = [
	{ name: "floor-busy", demo: "", aim: { kind: "office" }, size: BOARD },
	{ name: "room-lanternfish", demo: "", aim: { kind: "room", name: "lanternfish" }, size: BOARD },
	{ name: "room-kitchen", demo: "", aim: { kind: "room", name: "kitchen" }, size: BOARD },
	{ name: "room-meeting", demo: "", aim: { kind: "room", name: "meeting room" }, size: BOARD },
	{ name: "room-orbit-kit", demo: "", aim: { kind: "room", name: "orbit-kit" }, size: BOARD },
	{ name: "desk-ship-release", demo: "", aim: { kind: "desk", title: "Ship release 2.4" }, size: BOARD },
	{ name: "floor-idle", demo: "idle", aim: { kind: "office" }, size: BOARD },
	{ name: "floor-one", demo: "one", aim: { kind: "office" }, size: BOARD },
	{ name: "floor-thirty", demo: "thirty", aim: { kind: "office" }, size: BOARD },
	{ name: "floor-busy-small", demo: "", aim: { kind: "office" }, size: [960, 600] },
	// The demo day through the director (S4): each beat, a second or so into its walks.
	{ name: "day-0-start", demo: "day-0", aim: { kind: "office" }, size: BOARD, frames: 60 },
	{ name: "day-1-review-and-arrival", demo: "day-1", aim: { kind: "office" }, size: BOARD, frames: 90 },
	{ name: "day-2-waiting-on-you", demo: "day-2", aim: { kind: "room", name: "lanternfish" }, size: BOARD, frames: 40 },
	{ name: "day-3-pr-and-home-time", demo: "day-3", aim: { kind: "room", name: "lanternfish" }, size: BOARD, frames: 50 },
	{ name: "day-3-leaving", demo: "day-3", aim: { kind: "office" }, size: BOARD, frames: 150 },
	{ name: "day-4-review-done", demo: "day-4", aim: { kind: "office" }, size: BOARD, frames: 120 },
	{ name: "day-5-long-build", demo: "day-5", aim: { kind: "room", name: "orbit-kit" }, size: BOARD, frames: 600 },
	// The voice (S5): bubbles from the sass engine, and the signs and whiteboards its counters write.
	{ name: "voice-floor-busy", demo: "", aim: { kind: "office" }, size: BOARD },
	{ name: "voice-floor-idle", demo: "idle", aim: { kind: "office" }, size: BOARD },
	{ name: "voice-waiting-on-you", demo: "day-2", aim: { kind: "room", name: "lanternfish" }, size: BOARD, frames: 40 },
	{ name: "voice-pr-and-home-time", demo: "day-3", aim: { kind: "office" }, size: BOARD, frames: 50 },
	{ name: "voice-kitchen", demo: "idle", aim: { kind: "room", name: "kitchen" }, size: BOARD },
	// The app around the office (S6): empty states, About, and the compact floating window.
	{ name: "empty-office", demo: "empty", aim: { kind: "office" }, size: BOARD },
	{ name: "no-agent-found", demo: "nohome", aim: { kind: "office" }, size: BOARD },
	{ name: "about", demo: "", aim: { kind: "office" }, size: BOARD, query: "about" },
	{ name: "compact-busy", demo: "", aim: { kind: "office" }, size: [440, 340], query: "compact" },
	{ name: "compact-empty", demo: "empty", aim: { kind: "office" }, size: [440, 340], query: "compact" },
	// Compact as a live camera: the room its first shot cuts to, with the room tiles under it.
	{ name: "compact-cut", demo: "", aim: { kind: "shot" }, size: [440, 340], query: "compact" },
	{ name: "compact-cut-release", demo: "release", aim: { kind: "shot" }, size: [440, 340], query: "compact" },
	{ name: "compact-cut-waiting", demo: "day-2", aim: { kind: "shot" }, size: [440, 340], query: "compact", frames: 40 },
	// The living office (waves 1 and 2): stations, desk props, the crew build, your office.
	{ name: "release-floor", demo: "release", aim: { kind: "office" }, size: BOARD },
	{ name: "release-room", demo: "release", aim: { kind: "room", name: "lanternfish" }, size: BOARD },
	{ name: "release-desk", demo: "release", aim: { kind: "desk", title: "Ship release 3.0" }, size: BOARD },
	{ name: "room-your-office", demo: "day-2", aim: { kind: "room", name: "your office" }, size: BOARD, frames: 40 },
	{ name: "room-lobby", demo: "idle", aim: { kind: "room", name: "lobby" }, size: BOARD },
	// Lived in (stream C): time of day, lamps, focus light, the view out, the paper pass.
	{ name: "floor-busy-morning", demo: "", aim: { kind: "office" }, size: BOARD, hour: 8 },
	{ name: "floor-busy-afternoon", demo: "", aim: { kind: "office" }, size: BOARD, hour: 16 },
	{ name: "floor-busy-dusk", demo: "", aim: { kind: "office" }, size: BOARD, hour: 19 },
	{ name: "floor-busy-night", demo: "", aim: { kind: "office" }, size: BOARD, hour: 23 },
	{ name: "floor-idle-night", demo: "idle", aim: { kind: "office" }, size: BOARD, hour: 2 },
	{ name: "room-lanternfish-night", demo: "", aim: { kind: "room", name: "lanternfish" }, size: BOARD, hour: 23 },
	{ name: "room-lanternfish-morning", demo: "", aim: { kind: "room", name: "lanternfish" }, size: BOARD, hour: 8 },
	{ name: "desk-ship-release-dusk", demo: "", aim: { kind: "desk", title: "Ship release 2.4" }, size: BOARD, hour: 19 },
	{ name: "compact-busy-night", demo: "", aim: { kind: "office" }, size: [440, 340], query: "compact", hour: 23 },
];

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");

const { values: o } = parseArgs({
	options: {
		out: { type: "string", default: join(ROOT, "artifacts", "shots") },
		only: { type: "string" },
		dpr: { type: "string", default: "1" },
		check: { type: "boolean", default: false },
		build: { type: "boolean", default: false },
		title: { type: "string", default: "Busybodies · tools/shoot.ts" },
		/** The scene theme (src/scene/theme/id.ts): every state in that theme. Several, comma
		 * separated: every state in each, side by side on the sheet (shots in a folder per theme). */
		theme: { type: "string" },
	},
});

if (o.build || !existsSync(join(DIST, "index.html"))) {
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

async function shoot(browser: Browser, s: State, dpr: number, theme: string | undefined): Promise<Buffer> {
	const page = await browser.newPage({ viewport: { width: s.size[0], height: s.size[1] }, deviceScaleFactor: dpr });
	const thrown: string[] = [];
	page.on("pageerror", (e) => thrown.push(e.message));
	await page.goto(`http://localhost:${server.port}/?inspect&frozen&demo=${s.demo}&hour=${s.hour ?? 14}${s.query ? `&${s.query}` : ""}${theme ? `&theme=${theme}` : ""}`);
	try {
		await page.waitForFunction(() => window.__busybodies?.ready === true, undefined, { timeout: 30_000 });
	} catch (e) {
		await page.close();
		throw new Error(thrown[0] ?? String(e).split("\n")[0]);
	}
	await page.evaluate(
		({ aim, frames }) => {
			const b = window.__busybodies!;
			const layout = b.layout()!;
			const flat = (l: { id: string; title: string; children: never[] }[]): { id: string; title: string }[] =>
				l.flatMap((x) => [x, ...flat(x.children)]);
			let stop: Parameters<typeof b.goTo>[0] = { kind: "office" };
			if (aim.kind === "room") stop = { kind: "room", id: layout.areas.find((a) => a.name === aim.name)!.id };
			if (aim.kind === "desk") stop = { kind: "desk", id: flat(b.snapshot()!.sessions as never).find((x) => x.title === aim.title)!.id };
			if (aim.kind !== "shot") b.goTo(stop, false);
			b.step(frames);
		},
		{ aim: s.aim, frames: s.frames ?? 12 },
	);
	// Let text and cache textures settle into the frame, then take it.
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	const png = await page.screenshot({ type: "png" });
	await page.close();
	return png;
}

interface Shot {
	name: string;
	png?: Buffer;
	/** Why there is no picture: the state didn't come up. */
	error?: string;
	size: [number, number];
}

const escape = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function contactSheet(shots: Shot[], title: string, cols = 3): string {
	const figs = shots
		.map((s) =>
			s.png
				? `<figure><img src="data:image/png;base64,${s.png.toString("base64")}" style="aspect-ratio:${s.size[0]}/${s.size[1]}"><figcaption>${s.name} · ${s.size[0]}×${s.size[1]}</figcaption></figure>`
				: `<figure><div class="gap" style="aspect-ratio:${s.size[0]}/${s.size[1]}">didn't come up:<br>${escape(s.error ?? "")}</div><figcaption>${s.name} · ${s.size[0]}×${s.size[1]}</figcaption></figure>`,
		)
		.join("");
	return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:20px;background:#1b2140;font:700 14px ui-rounded,system-ui,sans-serif;color:#fff}
h1{margin:0 0 14px;font-size:20px}main{display:grid;grid-template-columns:repeat(${cols},480px);gap:16px}
figure{margin:0}img{display:block;width:480px;border-radius:8px;background:#bfe8c6}figcaption{margin-top:5px;opacity:.85}
.gap{box-sizing:border-box;width:480px;padding:24px;border-radius:8px;background:#5a1f2e;color:#ffd6dc;font-size:15px}
</style><h1>${title}</h1><main>${figs}</main>`;
}

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
	const only = o.only ? new Set(o.only.split(",")) : undefined;
	const states = STATES.filter((s) => !only || only.has(s.name));
	const dpr = Number(o.dpr);
	const themes = o.theme ? o.theme.split(",") : [undefined];
	const many = themes.length > 1;
	const shots: Shot[] = [];
	let mismatches = 0;
	let gaps = 0;
	for (const theme of themes) mkdirSync(many ? join(o.out!, theme!) : o.out!, { recursive: true });
	// A state per row, a theme per column, when there are several.
	for (const s of states) {
		for (const theme of themes) {
			const name = many ? `${theme} · ${s.name}` : s.name;
			const file = join(many ? join(o.out!, theme!) : o.out!, `${s.name}.png`);
			let png: Buffer;
			try {
				png = await shoot(browser, s, dpr, theme);
			} catch (e) {
				gaps++;
				shots.push({ name, error: (e as Error).message, size: s.size });
				console.log(`GAP   ${name}: ${(e as Error).message}`);
				continue;
			}
			if (o.check) {
				const again = await shoot(browser, s, dpr, theme);
				const same = png.equals(again);
				if (!same) mismatches++;
				console.log(`${same ? "same " : "DIFF "} ${name}`);
			}
			writeFileSync(file, png);
			shots.push({ name, png, size: s.size });
			if (!o.check) console.log(`shot  ${name}`);
		}
	}
	const cols = many ? themes.length : 3;
	const sheet = await browser.newPage({ viewport: { width: 20 * 2 + 480 * cols + 16 * (cols - 1), height: 400 } });
	await sheet.setContent(contactSheet(shots, o.title!, cols));
	await sheet.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
	writeFileSync(join(o.out!, "contact-sheet.png"), await sheet.screenshot({ type: "png", fullPage: true }));
	console.log(`wrote ${shots.length - gaps} shots and contact-sheet.png to ${o.out}${gaps ? `; ${gaps} state(s) didn't come up` : ""}`);
	if (gaps) process.exitCode = 1;
	if (mismatches) {
		console.error(`${mismatches} state(s) rendered differently on a second run`);
		process.exitCode = 1;
	}
} finally {
	await browser.close();
	server.stop(true);
}
