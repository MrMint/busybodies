// The way out and long runs: the shutdown steps, a watcher that lets the process exit once it is
// stopped, and one that keeps watching when the agent home goes away and comes back. Every file
// lives in a temp folder; every name is invented.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shutdown } from "../src/bun/shutdown";
import { Watcher } from "../src/watcher/watch";

const until = async (ok: () => boolean, ms = 3000) => {
	const end = Date.now() + ms;
	while (!ok() && Date.now() < end) await Bun.sleep(20);
	return ok();
};

describe("shutdown", () => {
	test("runs every step once, in order, even past one that throws", () => {
		const ran: string[] = [];
		const logs: string[] = [];
		const s = shutdown((l) => logs.push(l));
		s.add("watcher", () => ran.push("watcher"));
		s.add("broken", () => {
			throw new Error("no");
		});
		s.add("diary", () => ran.push("diary"));
		expect(s.run("quit")).toBe(true);
		expect(s.run("exit")).toBe(false);
		expect(ran).toEqual(["watcher", "diary"]);
		expect(s.done).toBe(true);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("failed: broken (no)");
	});
});

describe("exit", () => {
	let home: string;
	beforeEach(async () => {
		home = await mkdtemp(join(tmpdir(), "bb-exit-"));
		for (const d of ["sessions", "projects", "busybodies"]) await mkdir(join(home, d));
	});
	afterEach(() => rm(home, { recursive: true, force: true }));

	// A child bun runs the main process's lifecycle without the windows: the watcher on a home with
	// every folder watched, a diary with a save held back, then the shutdown steps. If any watch,
	// timer or interval were left behind, the child would never exit on its own.
	test("once the shutdown steps run, nothing keeps the process alive", async () => {
		const script = `
			import { Watcher } from ${JSON.stringify(join(import.meta.dir, "../src/watcher/watch"))};
			import { Diarist } from ${JSON.stringify(join(import.meta.dir, "../src/bun/diary"))};
			import { shutdown } from ${JSON.stringify(join(import.meta.dir, "../src/bun/shutdown"))};
			const watcher = new Watcher({ roots: { home: ${JSON.stringify(home)} }, pollMs: 50 });
			const diarist = new Diarist(${JSON.stringify(join(home, "diary.json"))}, { saveMs: 60_000 });
			const exit = shutdown(() => {});
			exit.add("watcher", () => watcher.stop());
			exit.add("diary", () => diarist.flush());
			await watcher.start();
			console.log("watches", watcher.watchCount);
			setTimeout(() => exit.run("quit"), 200);
		`;
		const t0 = performance.now();
		const child = Bun.spawn(["bun", "-e", script], { stdout: "pipe", stderr: "pipe" });
		const timeout = setTimeout(() => child.kill(), 5000);
		const code = await child.exited;
		clearTimeout(timeout);
		const out = await new Response(child.stdout).text();
		expect(out).toContain("watches 3");
		expect(code).toBe(0);
		expect(performance.now() - t0).toBeLessThan(4000);
	});
});

describe("Watcher over a long run", () => {
	let base: string;
	let home: string;
	beforeEach(async () => {
		base = await mkdtemp(join(tmpdir(), "bb-long-"));
		home = join(base, "home");
	});
	afterEach(() => rm(base, { recursive: true, force: true }));

	test("watches the agent home again when it goes away and comes back", async () => {
		await mkdir(join(home, "sessions"), { recursive: true });
		await mkdir(join(home, "projects"), { recursive: true });
		const w = new Watcher({ roots: { home }, pollMs: 50, debounceMs: 10 });
		try {
			await w.start();
			expect(w.watchCount).toBe(2);
			await rm(home, { recursive: true, force: true });
			expect(await until(() => w.watchCount === 0)).toBe(true);
			await mkdir(join(home, "sessions"), { recursive: true });
			await mkdir(join(home, "projects"), { recursive: true });
			await mkdir(join(home, "busybodies"), { recursive: true });
			expect(await until(() => w.watchCount === 3)).toBe(true);
			// And it reads what the new home holds: a live session (this process) shows up.
			await writeFile(join(home, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "s-back", cwd: "/Users/you/code/teapot" }));
			expect(await until(() => w.snapshot?.sessions.some((s) => s.id === "s-back") ?? false)).toBe(true);
		} finally {
			w.stop();
		}
		expect(w.watchCount).toBe(0);
	});

	test("hears nothing after it is stopped", async () => {
		await mkdir(join(home, "sessions"), { recursive: true });
		const w = new Watcher({ roots: { home }, pollMs: 20, debounceMs: 5 });
		let heard = 0;
		w.onChange(() => heard++);
		await w.start();
		w.stop();
		const before = heard;
		await writeFile(join(home, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "s-late", cwd: "/Users/you/code/kettle" }));
		await Bun.sleep(150);
		expect(heard).toBe(before);
	});
});
