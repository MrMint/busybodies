// The hook installer, against a temp agent home only. Never point these at a real one.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookEvents } from "../src/watcher/sources";
import { HOOK_SCRIPT, install, status, uninstall } from "../tools/hooks";

let home: string;
beforeEach(async () => (home = await mkdtemp(join(tmpdir(), "bb-hooks-"))));
afterEach(async () => {
	await chmod(join(home, "busybodies"), 0o755).catch(() => {});
	await rm(home, { recursive: true, force: true });
});

const ORIGINAL = `{
    "model": "opus",
    "hooks": {
        "Stop": [
            { "hooks": [ { "type": "command", "command": "say done" } ] }
        ]
    },
    "permissions": { "allow": ["Bash(ls:*)"] }
}`; // four-space indent, inline arrays, no final newline: a rewrite would show

describe("hooks installer", () => {
	test("install, status, uninstall leaves the settings byte-identical", async () => {
		const file = join(home, "settings.json");
		await writeFile(file, ORIGINAL);
		expect((await status(home)).installed).toEqual([]);

		await install(home);
		const st = await status(home);
		expect(st).toMatchObject({ installed: ["Notification", "UserPromptSubmit", "Stop"], missing: [], script: true });
		const s = JSON.parse(await readFile(file, "utf8"));
		expect(s.model).toBe("opus");
		expect(s.hooks.Stop).toHaveLength(2); // the person's own Stop hook stays
		expect(await install(home)).toBe("already installed");

		await uninstall(home);
		expect(await readFile(file, "utf8")).toBe(ORIGINAL);
		expect(await readdir(home)).toEqual(["settings.json"]);
	});

	test("removes a settings file it created", async () => {
		await install(home);
		expect((await status(home)).missing).toEqual([]);
		await uninstall(home);
		expect(await readdir(home)).toEqual([]);
	});

	test("keeps changes the person made while it was installed", async () => {
		const file = join(home, "settings.json");
		await writeFile(file, ORIGINAL);
		await install(home);
		const s = JSON.parse(await readFile(file, "utf8"));
		s.theme = "dark";
		await writeFile(file, JSON.stringify(s, null, 4));
		await uninstall(home);
		const after = JSON.parse(await readFile(file, "utf8"));
		expect(after).toEqual({ ...JSON.parse(ORIGINAL), theme: "dark" });
	});

	test("refuses a settings file that doesn't parse, and changes nothing", async () => {
		const file = join(home, "settings.json");
		await writeFile(file, "{ not json");
		await expect(install(home)).rejects.toThrow();
		expect(await readFile(file, "utf8")).toBe("{ not json");
		expect(await readdir(home)).toEqual(["settings.json"]);
	});
});

describe("the hook script", () => {
	const run = (event: string, json: string) => {
		const t0 = performance.now();
		const p = Bun.spawnSync(["/bin/sh", join(home, "busybodies", "hook.sh"), event], { stdin: Buffer.from(json) });
		return { code: p.exitCode, ms: performance.now() - t0, stderr: p.stderr.toString() };
	};
	const setup = async () => {
		await mkdir(join(home, "busybodies"), { recursive: true });
		await writeFile(join(home, "busybodies", "hook.sh"), HOOK_SCRIPT);
	};

	test("appends one line the watcher reads, with no prompt text", async () => {
		await setup();
		run("Notification", JSON.stringify({ session_id: "s-kettle", hook_event_name: "Notification", notification_type: "permission_prompt", message: "needs your permission to use Bash" }));
		run("Notification", JSON.stringify({ session_id: "s-pot", message: "Claude is waiting for your input" }));
		run("UserPromptSubmit", JSON.stringify({ session_id: "s-pot", prompt: "a secret plan" }));
		const log = await readFile(join(home, "busybodies", "events.log"), "utf8");
		expect(log).not.toContain("secret");
		expect(log.trim().split("\n")).toHaveLength(3);
		const ev = hookEvents(log);
		expect(ev.get("s-kettle")).toMatchObject({ event: "Notification", kind: "permission" });
		expect(ev.get("s-pot")).toMatchObject({ event: "UserPromptSubmit" });
		expect(Math.abs(ev.get("s-pot")!.at - Date.now())).toBeLessThan(5000);
	});

	test("exits 0 within 50 ms even when it can't write", async () => {
		await setup();
		await mkdir(join(home, "busybodies", "events.log")); // a folder where the file should be
		const json = JSON.stringify({ session_id: "s-kettle", notification_type: "permission_prompt" });
		run("Notification", json); // warm the disk cache
		for (let i = 0; i < 5; i++) {
			const r = run("Notification", json);
			expect(r.code).toBe(0);
			expect(r.stderr).toBe("");
			expect(r.ms).toBeLessThan(50);
		}
		await rm(join(home, "busybodies", "events.log"), { recursive: true });
		await chmod(join(home, "busybodies"), 0o555); // and a folder it can't write to
		const r = run("Stop", json);
		expect(r).toMatchObject({ code: 0, stderr: "" });
		expect(r.ms).toBeLessThan(50);
	});

	test("ignores input with no session id", async () => {
		await setup();
		expect(run("Stop", "garbage").code).toBe(0);
		expect(await readdir(join(home, "busybodies"))).toEqual(["hook.sh"]);
	});
});
