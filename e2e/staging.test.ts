// Themes own their staging (office/staging.ts, office/ambient.ts), in headless Chrome: the factory's
// lines, booths and conveyor as data, parts on the belts only while a kind of work is held, the belt
// and the ambient life on the life clock (still when calm), a PR's crate riding to the dock, and the
// frame budgets with all of it on. Like the other e2e tests, the bundled scene from dist/ with ?demo.
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
	browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
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

async function measure(page: Page, ms = 2000) {
	await page.waitForTimeout(300);
	await page.evaluate(() => window.__busybodies!.resetCounters());
	await page.waitForTimeout(ms);
	return page.evaluate(() => window.__busybodies!.counters());
}

describe("staging", () => {
	test("the factory stages lines: a belt per row with a desk, a booth per desk, the conveyor to the dock", async () => {
		const factory = await open("demo&frozen&theme=factory");
		const office = await open("demo&frozen");
		const facts = (p: Page) =>
			p.evaluate(() => {
				const b = window.__busybodies!;
				const s = b.staging();
				const rooms = b.layout()!.areas.filter((a) => a.kind === "project");
				return {
					bay: s.bay,
					hall: s.hall,
					ambient: [...s.ambient],
					belts: s.belts.map((x) => x.id).sort(),
					rows: rooms.flatMap((a) => [...new Set(a.desks.map((d) => d.row))].map((r) => `${a.id}:belt:${r}`)).sort(),
					desks: rooms.reduce((n, a) => n + a.desks.length, 0),
					pieces: s.pieces,
					conveyor: s.conveyor,
					hallway: b.layout()!.hallway,
					rooms: b.layout()!.areas.length,
				};
			});
		const f = await facts(factory);
		const o = await facts(office);
		expect([f.bay, f.hall]).toEqual(["line", "conveyor"]);
		expect(f.belts).toEqual(f.rows);
		expect(f.pieces.booth).toBe(f.desks);
		expect(f.pieces.dock).toBe(1);
		expect(f.pieces.vent).toBeGreaterThan(0);
		expect(f.conveyor!.x1).toBe(f.hallway.x + f.hallway.w);
		expect(f.ambient).toEqual(["beacon", "pilot", "vents", "sparks"]);
		// Every bay's press has its pilot lamp; every office room a tube that flickers.
		expect(f.pieces.pilot).toBeGreaterThan(0);
		expect(f.pieces.flicker ?? 0).toBe(0);
		// The office keeps its desks and corridor, with its own ambient life.
		expect([o.bay, o.hall]).toEqual(["desks", "corridor"]);
		expect(o.belts).toEqual([]);
		expect(o.conveyor).toBeUndefined();
		expect(o.pieces.belt ?? 0).toBe(0);
		expect(o.pieces.booth ?? 0).toBe(0);
		expect(o.pieces.steam).toBe(1);
		expect(o.pieces.fan).toBe(1);
		expect(o.pieces.led).toBeGreaterThan(0);
		expect(o.pieces.flicker).toBe(o.rooms);
		await factory.close();
		await office.close();
	}, T);

	test("the bakery stages desks and a pastry conveyor: pastries ride the hall, ovens glow, the cake turns", async () => {
		const page = await open("demo&frozen&theme=bakery");
		const s = await page.evaluate(() => {
			const b = window.__busybodies!;
			const s = b.staging();
			return { bay: s.bay, hall: s.hall, ambient: [...s.ambient], belts: s.belts.length, pieces: s.pieces, conveyor: s.conveyor, rooms: b.layout()!.areas.filter((a) => a.kind === "project").length };
		});
		expect([s.bay, s.hall]).toEqual(["desks", "conveyor"]);
		expect(s.belts).toBe(0);
		expect(s.conveyor).toBeDefined();
		expect(s.ambient).toEqual(["steam", "ovens", "marquee", "cakeStand", "sprinkles", "parade"]);
		expect(s.pieces).toMatchObject({ dock: 1, parade: 1, steam: 1, marquee: 1, cake: 1, sprinkles: 1, oven: s.rooms });
		expect(s.pieces.booth ?? 0).toBe(0);
		await page.close();
	}, T);

	test("tool calls ride the belts as parts only while a kind is held; idle, the belts run empty", async () => {
		const page = await open("demo&settle=600000&theme=factory");
		const busy = await page.evaluate(() => window.__busybodies!.staging());
		expect(busy.parts).toBeGreaterThan(0);
		expect(busy.pieces.parts).toBeGreaterThan(0);
		const idle = await page.evaluate(() => {
			const b = window.__busybodies!;
			const s = structuredClone(b.snapshot()!);
			type S = (typeof s.sessions)[number];
			const nap = (x: S): void => {
				x.state = "idle";
				x.running = undefined;
				x.agents = [];
				x.children.forEach(nap);
			};
			s.sessions.forEach(nap);
			b.show(s);
			return b.staging();
		});
		expect(idle.parts).toBe(0);
		expect(idle.pieces.parts ?? 0).toBe(0);
		expect(idle.pieces.sparks ?? 0).toBe(0);
		expect(idle.pieces.belt).toBe(busy.pieces.belt);
		await page.close();
	}, T);

	test("the belts and the ambient life run on the life clock: stepped with life they move, calm they hold", async () => {
		for (const [query, moves] of [
			["demo=idle&frozen&theme=factory", true],
			["demo=idle&frozen&calm&theme=factory", false],
		] as const) {
			const page = await open(query);
			const t = await page.evaluate(() => {
				const b = window.__busybodies!;
				b.step(1);
				const a = b.staging().lifeMs;
				b.step(60);
				return [a, b.staging().lifeMs];
			});
			if (moves) expect(t[1]! - t[0]!).toBeGreaterThan(900);
			else expect(t[1]).toBe(t[0]);
			await page.close();
		}
	}, T);

	test("a PR's crate starts where the arm sets it down, rides the hallway's conveyor to the dock, then it is gone and nothing moves for it", async () => {
		const page = await open("demo&settle=600000&theme=factory");
		const ride = await page.evaluate(() => {
			const b = window.__busybodies!;
			b.freeze();
			const s = structuredClone(b.snapshot()!);
			const busy = s.sessions.find((x) => x.state === "busy" && !(x.prs ?? []).length)!;
			busy.prs = [{ number: 4242, url: "https://example.invalid/pull/4242", at: s.at }];
			b.show(s);
			const start = b.staging().crates;
			const desk = b.layout()!.areas.flatMap((a) => a.desks.map((d) => ({ d, rect: a.rect }))).find((x) => x.d.id === busy.id)!;
			const belt = b.staging().conveyor!.y + 9;
			// Ten frames a render: the ride is ~400 frames, and a render per frame is slow headless.
			let steps = 0;
			while (b.staging().crates.length && steps < 1200) {
				b.step(10);
				steps += 10;
			}
			return { start, steps, after: b.staging().crates.length, dock: b.staging().conveyor!.dock.x, bay: desk.rect, belt };
		});
		expect(ride.start).toHaveLength(1);
		expect(ride.start[0]!.x).toBeLessThan(ride.dock);
		// On the bay's loading dock, by its left wall where the arm sets it down, not mid-bay on the belt.
		expect(ride.start[0]!.x).toBeGreaterThan(ride.bay.x);
		expect(ride.start[0]!.x).toBeLessThan(ride.bay.x + ride.bay.w / 3);
		expect(ride.start[0]!.y).not.toBe(ride.belt);
		expect(ride.steps).toBeGreaterThan(60);
		expect(ride.after).toBe(0);
		await page.close();
	}, T);
});

describe("frame budgets with the factory's staging", () => {
	test("a calm idle factory makes zero animation frames", async () => {
		const page = await open("demo=idle&calm&theme=factory");
		const c = await measure(page);
		expect(c.life).toBe(false);
		expect(c.tickerRunning).toBe(false);
		expect(c.animationFrames).toBe(0);
		expect(c.renders).toBe(0);
		await page.close();
	}, T);

	test("a living idle factory (belts, vents, habits) stays at 30 fps or less", async () => {
		const page = await open("demo=idle&settle=600000&theme=factory");
		const c = await measure(page, 2000);
		expect(c.life).toBe(true);
		expect(c.tickerRunning).toBe(true);
		expect(c.maxFPS).toBe(30);
		expect(c.renders).toBeGreaterThan(0);
		expect(c.renders).toBeLessThanOrEqual(64); // 30 fps over 2 s, plus slack for timer edges
		await page.close();
	}, T);

	test("a living idle office (steam, the fan, the printer's light) stays at 30 fps or less", async () => {
		const page = await open("demo=idle&settle=600000");
		const c = await measure(page, 2000);
		expect(c.maxFPS).toBe(30);
		expect(c.renders).toBeLessThanOrEqual(64);
		await page.close();
	}, T);
});
