// The watcher against an invented agent home built in a temp folder. Every project, title and id
// here is made up; real session data never belongs in this repo.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCache } from "../src/watcher/files";
import { ABANDON_MS, LINGER_MS, STALL_MS, SnapshotBuilder } from "../src/watcher/snapshot";
import { lastToolCall, projectOf, projectSlug } from "../src/watcher/sources";

const NOW = Date.parse("2030-04-01T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const toolLine = (name: string, msAgo: number) =>
	JSON.stringify({
		message: { content: [{ type: "tool_use", id: `toolu_${name}`, name, input: {} }] },
		type: "assistant",
		timestamp: iso(msAgo),
	});

describe("lastToolCall", () => {
	test("finds the newest call and its own timestamp", () => {
		const text = [toolLine("Read", 9000), toolLine("Edit", 2000), '{"type":"user"}'].join("\n");
		expect(lastToolCall(text)).toEqual({ tool: "Edit", at: NOW - 2000 });
	});

	test("skips a call quoted inside another record", () => {
		const quoted = JSON.stringify({ type: "user", content: '"type":"tool_use","id":"x","name":"Quoted"' });
		expect(lastToolCall([toolLine("Bash", 5000), quoted].join("\n"))?.tool).toBe("Bash");
	});

	test("works on a tail that starts mid-record", () => {
		const line = toolLine("Grep", 1000);
		expect(lastToolCall(line.slice(10))?.tool).toBe("Grep");
	});

	test("returns undefined with no calls", () => {
		expect(lastToolCall('{"type":"user"}\n')).toBeUndefined();
	});
});

describe("paths", () => {
	test("slugs a cwd the way the tool names project folders", () => {
		expect(projectSlug("/Users/you/code/tea.pot")).toBe("-Users-you-code-tea-pot");
	});

	test("names the repository behind an agent worktree", () => {
		expect(projectOf("/Users/you/code/teapot/.claude/worktrees/brew-fix")).toEqual({
			project: "teapot",
			worktree: "brew-fix",
		});
		expect(projectOf("/Users/you/code/teapot")).toEqual({ project: "teapot" });
	});
});

describe("FileCache", () => {
	let dir: string;
	beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), "bb-cache-"))));
	afterEach(() => rm(dir, { recursive: true, force: true }));

	test("keeps the last good value when a file is caught mid-write", async () => {
		const f = join(dir, "a.json");
		const cache = new FileCache();
		await writeFile(f, '{"n":1}');
		expect(await cache.json(f)).toEqual({ n: 1 });
		await writeFile(f, '{"n":');
		await utimes(f, new Date(), new Date(Date.now() + 5000));
		expect(await cache.json(f)).toEqual({ n: 1 });
	});
});

describe("SnapshotBuilder", () => {
	let home: string;
	let desk: string;

	const write = async (path: string, body: unknown, msAgo = 0) => {
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, typeof body === "string" ? body : JSON.stringify(body));
		const t = new Date(NOW - msAgo);
		await utimes(path, t, t);
	};

	const session = (pid: number, id: string, cwd: string, extra: object = {}) =>
		write(join(home, "sessions", `${pid}.json`), {
			pid,
			sessionId: id,
			cwd,
			startedAt: NOW - pid * 1000,
			entrypoint: "claude-desktop",
			status: "busy",
			statusUpdatedAt: NOW - 60_000,
			...extra,
		});

	const agent = (cwd: string, sid: string, id: string, meta: object, logAgo: number) => {
		const dir = join(home, "projects", projectSlug(cwd), sid, "subagents");
		return Promise.all([
			write(join(dir, `agent-${id}.meta.json`), meta, logAgo),
			write(join(dir, `agent-${id}.jsonl`), `${toolLine("Read", logAgo)}\n`, logAgo),
		]);
	};

	const build = (alive: number[]) =>
		new SnapshotBuilder({ home, desktopIndex: desk }, (pid) => alive.includes(pid), () => NOW).build();

	beforeEach(async () => {
		home = await mkdtemp(join(tmpdir(), "bb-home-"));
		desk = await mkdtemp(join(tmpdir(), "bb-desk-"));
	});
	afterEach(async () => {
		await rm(home, { recursive: true, force: true });
		await rm(desk, { recursive: true, force: true });
	});

	test("builds live sessions with their nested agents, and drops dead processes", async () => {
		const cwd = "/Users/you/code/teapot/.claude/worktrees/brew-fix";
		await session(101, "s-teapot", cwd, { name: "Fix the brew timer", hostSessionId: "local_teapot" });
		await session(102, "s-gone", "/Users/you/code/gone");
		await write(join(home, "projects", projectSlug(cwd), "s-teapot.jsonl"), `${toolLine("Edit", 3000)}\n`);
		await agent(cwd, "s-teapot", "lead", { agentType: "stream-builder", description: "Build the timer", spawnDepth: 1, model: "opus" }, 1000);
		await agent(cwd, "s-teapot", "kid", { agentType: "scout", description: "Find the clock", spawnDepth: 2, parentAgentId: "lead" }, 2000);
		await agent(cwd, "s-teapot", "old", { agentType: "reviewer", description: "Review", spawnDepth: 1, finished: true }, LINGER_MS + 60_000);
		await agent(cwd, "s-teapot", "nap", { agentType: "verifier", description: "Check", spawnDepth: 1 }, STALL_MS + 1000);
		await agent(cwd, "s-teapot", "dead", { agentType: "scout", description: "Lost", spawnDepth: 1 }, ABANDON_MS + 1000);
		await write(join(desk, "acct", "org", "local_teapot.json"), { title: "ignored", branch: "brew-fix" });

		const snap = await build([101]);
		expect(snap.sessions).toHaveLength(1);
		const s = snap.sessions[0]!;
		expect(s).toMatchObject({
			title: "Fix the brew timer",
			project: "teapot",
			worktree: "brew-fix",
			branch: "brew-fix",
			state: "busy",
			activity: { tool: "Edit", at: NOW - 3000 },
		});
		// Finished past LINGER_MS: gone. Unfinished but quiet past STALL_MS: shown as stalled.
		expect(s.agents.map((a) => [a.id, a.status])).toEqual([
			["lead", "running"],
			["nap", "stalled"],
		]);
		expect(s.agents[0]).toMatchObject({ role: "stream-builder", model: "opus" });
		expect(s.agents[0]!.children.map((a) => [a.id, a.depth, a.status])).toEqual([["kid", 2, "running"]]);
	});

	test("asks git which repository and branch a session is on, for any worktree layout", async () => {
		const code = await mkdtemp(join(tmpdir(), "bb-code-"));
		try {
			// The main checkout, a worktree in a sibling folder, and one of a bare repository.
			const repo = join(code, "kettle");
			await write(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
			await write(join(repo, ".git", "worktrees", "spout-fix", "HEAD"), "ref: refs/heads/spout-fix\n");
			const sibling = join(code, "kettle-spout-fix");
			await write(join(sibling, ".git"), `gitdir: ${join(repo, ".git", "worktrees", "spout-fix")}\n`);
			await write(join(code, "lid.git", "worktrees", "hinge", "HEAD"), "4f1c0de\n");
			const bare = join(code, "wt", "hinge");
			await write(join(bare, ".git"), "gitdir: ../../lid.git/worktrees/hinge\n");
			await session(401, "s-main", repo);
			await session(402, "s-sibling", sibling);
			await session(403, "s-bare", bare);
			await session(404, "s-plain", "/Users/you/code/pantry");

			const snap = await build([401, 402, 403, 404]);
			const by = new Map(snap.sessions.map((s) => [s.id, s]));
			expect(by.get("s-main")).toMatchObject({ project: "kettle", branch: "main", title: "kettle" });
			expect(by.get("s-main")!.worktree).toBeUndefined();
			expect(by.get("s-sibling")).toMatchObject({ project: "kettle", worktree: "kettle-spout-fix", branch: "spout-fix" });
			// A detached HEAD has no branch.
			expect(by.get("s-bare")).toMatchObject({ project: "lid", worktree: "hinge" });
			expect(by.get("s-bare")!.branch).toBeUndefined();
			// No repository there (or none we can see): the folder's name, as before.
			expect(by.get("s-plain")).toMatchObject({ project: "pantry" });
		} finally {
			await rm(code, { recursive: true, force: true });
		}
	});

	test("nests a side session under the live session that started it", async () => {
		await session(201, "s-lead", "/Users/you/code/teapot", { hostSessionId: "local_lead" });
		await session(202, "s-side", "/Users/you/code/teapot", { hostSessionId: "local_side" });
		await write(join(desk, "a", "o", "local_lead.json"), {});
		await write(join(desk, "a", "o", "local_side.json"), { spawnedFrom: { sessionId: "local_lead" } });

		const snap = await build([201, 202]);
		expect(snap.sessions.map((s) => s.id)).toEqual(["s-lead"]);
		expect(snap.sessions[0]!.children.map((s) => s.id)).toEqual(["s-side"]);
	});

	test("finds a transcript outside the cwd's project folder", async () => {
		await session(301, "s-moved", "/Users/you/code/kettle");
		await write(join(home, "projects", "-somewhere-else", "s-moved.jsonl"), `${toolLine("Grep", 500)}\n`);
		const snap = await build([301]);
		expect(snap.sessions[0]!.activity?.tool).toBe("Grep");
	});
});
