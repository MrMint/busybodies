// The richer signals (running tool, failed and retried commands, PRs, compaction, cost, API
// retries, waiting on you) against invented transcripts. Every name, id and command here is made
// up; real session data never belongs in this repo.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOL_RATE_WINDOW_MS, TranscriptLedger, commandKind, editLines, lineCount } from "../src/watcher/ledger";
import { contextWindow, modelFamily } from "../src/watcher/models";
import { SnapshotBuilder, waiting } from "../src/watcher/snapshot";
import { hookEvents, projectSlug } from "../src/watcher/sources";

const NOW = Date.parse("2030-04-01T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

let n = 0;
const call = (name: string, msAgo: number, input: object = {}, id = `toolu_${++n}`) =>
	JSON.stringify({ type: "assistant", requestId: `req_${id}`, message: { content: [{ type: "tool_use", id, name, input }], usage: { output_tokens: 10 } }, timestamp: iso(msAgo) });
const result = (id: string, msAgo: number, content: string, isError = false, extra: object = {}) =>
	JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] }, toolUseResult: { interrupted: false, ...extra }, timestamp: iso(msAgo) });

/** A shell command and its result: exit 0 is a success, anything else a failure. */
const shell = (command: string, exit: number, msAgo: number, tookMs = 1000) => {
	const id = `toolu_${++n}`;
	return [call("Bash", msAgo + tookMs, { command }, id), result(id, msAgo, exit === 0 ? "ok" : `Exit code ${exit}\nboom`, exit !== 0)];
};
const ledgerOf = (lines: string[]) => {
	const l = new TranscriptLedger();
	l.feed(`${lines.join("\n")}\n`);
	return l;
};

describe("commandKind", () => {
	test("sorts commands into tests, builds, installs and git", () => {
		expect(commandKind("bun test test/")).toBe("test");
		expect(commandKind("cd app && npm run test -- --watch=false")).toBe("test");
		expect(commandKind("pytest -q kettle/")).toBe("test");
		expect(commandKind("cargo build --release")).toBe("build");
		expect(commandKind("hutch pm exec -- tsc --noEmit")).toBe("build");
		expect(commandKind("pnpm install")).toBe("install");
		expect(commandKind("git push -u origin brew-fix")).toBe("git");
		expect(commandKind("ls -la")).toBe("other");
	});
});

describe("running tool", () => {
	test("is the newest call with no result yet, with its start time and kind", () => {
		const l = ledgerOf([...shell("ls", 0, 50 * MIN), call("Bash", 40 * MIN, { command: "cargo build --release" })]);
		expect(l.running).toEqual({ tool: "Bash", since: NOW - 40 * MIN, kind: "build" });
	});

	test("clears when the result arrives, or the person types a new prompt", () => {
		expect(ledgerOf(shell("make", 0, 1000)).running).toBeUndefined();
		const typed = JSON.stringify({ type: "user", message: { content: "never mind" }, timestamp: iso(0) });
		expect(ledgerOf([call("Read", 5000), typed]).running).toBeUndefined();
	});

	test("has no kind for a tool that isn't a shell command", () => {
		expect(ledgerOf([call("WebSearch", 3000)]).running).toEqual({ tool: "WebSearch", since: NOW - 3000 });
	});
});

describe("failed commands and tests", () => {
	test("counts failures in a row, and resets the streak on a success", () => {
		const l = ledgerOf([...shell("bun test", 1, 9000), ...shell("bun test", 1, 6000), ...shell("bun test", 1, 3000)]);
		expect(l.commands).toMatchObject({ failStreak: 3, failed: 3, testsFailed: 3, last: { kind: "test", exitCode: 1, at: NOW - 3000, durationMs: 1000 } });
		l.feed(`${shell("bun test", 0, 1000).join("\n")}\n`);
		expect(l.commands).toMatchObject({ failStreak: 0, failed: 3, last: { exitCode: 0 } });
	});

	test("reads the exit code from the result text", () => {
		expect(ledgerOf(shell("make lint", 2, 0)).commands.last).toMatchObject({ kind: "build", exitCode: 2 });
	});

	test("ignores a refused call and an interrupted one", () => {
		const id = "toolu_refused";
		const refused = [call("Bash", 2000, { command: "rm -rf build" }, id), result(id, 1000, "Permission denied by the person", true)];
		const id2 = "toolu_stopped";
		const stopped = [call("Bash", 2000, { command: "sleep 99" }, id2), result(id2, 1000, "", false, { interrupted: true })];
		expect(ledgerOf([...refused, ...stopped]).commands).toEqual({ failStreak: 0, repeats: 0, failed: 0, testsFailed: 0 });
	});
});

describe("retries", () => {
	test("counts the same command run again in a row, whitespace aside", () => {
		const l = ledgerOf([...shell("bun test  kettle", 1, 9000), ...shell("bun test kettle", 1, 6000), ...shell(" bun test kettle", 1, 3000)]);
		expect(l.commands.repeats).toBe(3);
		l.feed(`${shell("git status", 0, 1000).join("\n")}\n`);
		expect(l.commands.repeats).toBe(1);
	});

	test("reports an API retry until the next response", () => {
		const err = JSON.stringify({ type: "system", subtype: "api_error", retryAttempt: 3, maxRetries: 10, retryInMs: 4000, timestamp: iso(2000) });
		const l = ledgerOf([err]);
		expect(l.apiRetry).toEqual({ attempt: 3, max: 10, at: NOW - 2000 });
		l.feed(`${JSON.stringify({ type: "assistant", requestId: "req_x", message: { content: [{ type: "text", text: "hi" }], usage: { output_tokens: 5 } }, timestamp: iso(0) })}\n`);
		expect(l.apiRetry).toBeUndefined();
	});
});

describe("PRs, compaction and cost", () => {
	test("collects PR links once each", () => {
		const pr = (num: number) => JSON.stringify({ type: "pr-link", prNumber: num, prUrl: `https://github.com/example/teapot/pull/${num}`, prRepository: "example/teapot", timestamp: iso(num * 1000) });
		expect(ledgerOf([pr(7), pr(7), pr(9)]).prs).toEqual([
			{ number: 7, url: "https://github.com/example/teapot/pull/7", repo: "example/teapot", at: NOW - 7000 },
			{ number: 9, url: "https://github.com/example/teapot/pull/9", repo: "example/teapot", at: NOW - 9000 },
		]);
	});

	test("counts compactions and drops calls the compaction cut off", () => {
		const boundary = (msAgo: number) => JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "auto", preTokens: 1 }, timestamp: iso(msAgo) });
		const l = ledgerOf([boundary(9000), call("Read", 5000), boundary(1000)]);
		expect(l.compactions).toEqual({ count: 2, lastAt: NOW - 1000, trigger: "auto" });
		expect(l.running).toBeUndefined();
	});

	test("takes dollars from the cost record, and counts output tokens once per request", () => {
		const resp = (req: string, out: number) => JSON.stringify({ type: "assistant", requestId: req, message: { content: [{ type: "text", text: "." }], usage: { output_tokens: out } }, timestamp: iso(0) });
		const cost = JSON.stringify({ type: "cost-state", totalCostUSD: 4.25, totalDuration: 1 });
		const l = ledgerOf([resp("req_a", 3), resp("req_a", 40), resp("req_b", 7), cost]);
		expect(l.outputTokens).toBe(47);
		expect(l.costUSD).toBe(4.25);
	});
});

describe("reading", () => {
	test("handles lines split across reads, and junk", () => {
		const l = new TranscriptLedger();
		const text = `not json\n${shell("bun test", 1, 0).join("\n")}\n`;
		for (let i = 0; i < text.length; i += 7) l.feed(text.slice(i, i + 7));
		expect(l.commands.failed).toBe(1);
	});

	test("reads only what was appended, and starts over on a replaced file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "bb-ledger-"));
		try {
			const f = join(dir, "t.jsonl");
			await writeFile(f, `${shell("bun test", 1, 3000).join("\n")}\n`);
			const l = new TranscriptLedger();
			await l.update(f);
			await appendFile(f, `${shell("bun test", 1, 1000).join("\n")}\n`);
			await l.update(f);
			expect(l.commands.failStreak).toBe(2);
			await writeFile(f, `${shell("ls", 0, 0).join("\n")}\n`);
			await l.update(f);
			expect(l.commands).toMatchObject({ failStreak: 0, failed: 0 });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("waiting on you", () => {
	const at = NOW - 30_000;
	test("comes from a hook prompt the transcript hasn't moved past", () => {
		expect(waiting({ event: "Notification", at, kind: "permission" }, undefined, at - 5000)).toEqual({ reason: "permission", since: at, source: "hook" });
		expect(waiting({ event: "Notification", at, kind: "permission" }, undefined, at + 2000)).toBeUndefined();
		expect(waiting({ event: "Notification", at, kind: "idle" }, undefined, at)).toBeUndefined();
		expect(waiting({ event: "UserPromptSubmit", at }, undefined, at)).toBeUndefined();
	});

	test("falls back to an open question or plan tool", () => {
		expect(waiting(undefined, { tool: "AskUserQuestion", since: at }, NOW)).toEqual({ reason: "question", since: at, source: "transcript" });
		expect(waiting(undefined, { tool: "ExitPlanMode", since: at }, NOW)?.reason).toBe("plan");
		expect(waiting(undefined, { tool: "Bash", since: at }, NOW)).toBeUndefined();
	});

	test("parses hook lines, newest per session, skipping torn ones", () => {
		const text = "1900000000 Notification s-a permission\n1900000005 UserPromptSubmit s-a\n1900000007 Notification s-b question\n19000";
		const m = hookEvents(text);
		expect(m.get("s-a")).toEqual({ event: "UserPromptSubmit", at: 1900000005000 });
		expect(m.get("s-b")).toEqual({ event: "Notification", at: 1900000007000, kind: "question" });
		expect(m.size).toBe(2);
	});
});

// Round two: model family, context, changes, todos, tool rate.
const reply = (msAgo: number, model: string, usage: object, extra: object = {}) =>
	JSON.stringify({ type: "assistant", requestId: `req_${++n}`, message: { model, content: [{ type: "text", text: "Brewing." }], usage }, timestamp: iso(msAgo), ...extra });
const usage = (input: number, read: number, created: number) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: created, output_tokens: 5 });
/** A file-changing call, and a result for it: ok, or an error. */
const change = (name: string, input: object, msAgo: number, ok = true, toolUseResult: object = {}) => {
	const id = `toolu_${++n}`;
	const res = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: ok ? "done" : "String not found", is_error: !ok }] }, toolUseResult, timestamp: iso(msAgo - 10) });
	return [call(name, msAgo, input, id), res];
};
const lines = (k: number, word = "brew") => Array.from({ length: k }, (_, i) => `${word} ${i}`).join("\n");

describe("model family", () => {
	test("maps ids to a family, and keeps placeholders out", () => {
		expect(modelFamily("claude-opus-5-5")).toBe("opus");
		expect(modelFamily("claude-sonnet-4-5-20250929")).toBe("sonnet");
		expect(modelFamily("claude-3-5-haiku-20241022")).toBe("haiku");
		expect(modelFamily("claude-fable-5-2")).toBe("fable");
		expect(modelFamily("sonnet")).toBe("sonnet");
		expect(modelFamily("us.anthropic.claude-haiku-5-5")).toBe("haiku");
		expect(modelFamily("teapot-llm-7b")).toBe("other");
		expect(modelFamily("<synthetic>")).toBeUndefined();
		expect(modelFamily("inherit")).toBeUndefined();
		expect(modelFamily(undefined)).toBeUndefined();
	});

	test("comes from the newest real response, on the cheap path and the parsed one", () => {
		const l = ledgerOf([reply(9000, "claude-sonnet-5-5", usage(1, 2, 3)), reply(5000, "<synthetic>", usage(0, 0, 0))]);
		expect(l.family).toBe("sonnet");
		l.feed(`${JSON.stringify({ type: "assistant", message: { model: "claude-haiku-5-5", content: [{ type: "tool_use", id: "toolu_h", name: "Read", input: {} }], usage: usage(1, 1, 1) }, timestamp: iso(1000) })}\n`);
		expect(l.family).toBe("haiku");
	});
});

describe("context", () => {
	test("windows come from a small table; an id it can't place has none", () => {
		expect(contextWindow("claude-opus-5-5")).toBe(1_000_000);
		expect(contextWindow("claude-opus-4-6")).toBe(1_000_000);
		expect(contextWindow("claude-opus-4-1-20250805")).toBe(200_000);
		expect(contextWindow("claude-haiku-4-5-20251001")).toBe(200_000);
		expect(contextWindow("claude-haiku-5-5")).toBe(1_000_000);
		expect(contextWindow("claude-sonnet-4-5[1m]")).toBe(1_000_000);
		expect(contextWindow("claude-3-7-sonnet-20250219")).toBe(200_000);
		expect(contextWindow("claude-fable-5")).toBe(1_000_000);
		expect(contextWindow("teapot-llm-7b")).toBeUndefined();
		expect(contextWindow(undefined)).toBeUndefined();
	});

	test("is the last request's input plus cache reads and writes", () => {
		const l = ledgerOf([reply(9000, "claude-haiku-4-5", usage(10, 20, 30)), reply(4000, "claude-haiku-4-5", usage(3, 150_000, 2_000))]);
		expect(l.context).toEqual({ used: 152_003, window: 200_000, at: NOW - 4000 });
	});

	test("finds usage in a long plain response without parsing it", () => {
		const big = JSON.stringify({ type: "assistant", requestId: "req_big", message: { model: "claude-opus-5-5", content: [{ type: "text", text: `"input_tokens":1 ${"x".repeat(200_000)}` }], usage: { ...usage(7, 70, 700), iterations: [{ input_tokens: 99999 }] } }, timestamp: iso(2000) });
		const l = ledgerOf([big]);
		expect(l.context).toEqual({ used: 777, window: 1_000_000, at: NOW - 2000 });
		expect(l.outputTokens).toBe(5);
	});

	test("an unknown model has no window", () => {
		expect(ledgerOf([reply(1000, "teapot-llm-7b", usage(1, 1, 1))]).context).toEqual({ used: 3, at: NOW - 1000 });
	});

	test("skips error placeholders and side-chain records", () => {
		const l = ledgerOf([reply(9000, "claude-opus-5-5", usage(1, 100, 0)), reply(5000, "<synthetic>", usage(0, 0, 0)), reply(3000, "claude-opus-5-5", usage(1, 5, 0), { isSidechain: true })]);
		expect(l.context?.used).toBe(101);
	});

	test("a compaction resets it to what is left, or clears it", () => {
		const boundary = (msAgo: number, meta: object) => JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "auto", ...meta }, timestamp: iso(msAgo) });
		const l = ledgerOf([reply(9000, "claude-opus-5-5", usage(1, 800_000, 0)), boundary(5000, { preTokens: 800_001, postTokens: 12_000 })]);
		expect(l.context).toEqual({ used: 12_000, window: 1_000_000, at: NOW - 5000 });
		l.feed(`${boundary(3000, {})}\n`);
		expect(l.context).toBeUndefined();
		l.feed(`${reply(1000, "claude-opus-5-5", usage(1, 20_000, 0))}\n`);
		expect(l.context?.used).toBe(20_001);
	});

	test("a torn line keeps the last good value", () => {
		const l = ledgerOf([reply(5000, "claude-opus-5-5", usage(1, 50, 0))]);
		l.feed(`${reply(1000, "claude-opus-5-5", usage(1, 90, 0)).slice(0, 40)}\n{"type":"assistant","usage":{"input_tok\n`);
		expect(l.context?.used).toBe(51);
	});
});

describe("changes", () => {
	test("counts lines", () => {
		expect(lineCount("")).toBe(0);
		expect(lineCount("a")).toBe(1);
		expect(lineCount("a\nb\n")).toBe(2);
		expect(editLines("a\nb\nc", "a\nB\nc")).toEqual({ added: 1, removed: 1 });
		expect(editLines("a\nc", "a\nb1\nb2\nc")).toEqual({ added: 2, removed: 0 });
		expect(editLines("same", "same")).toEqual({ added: 0, removed: 0 });
	});

	test("estimates edits and writes, counting distinct files once", () => {
		const l = ledgerOf([
			...change("Write", { file_path: "/Users/you/code/teapot/spout.ts", content: lines(30) }, 9000),
			...change("Edit", { file_path: "/Users/you/code/teapot/spout.ts", old_string: "brew 3", new_string: "brew 3\nsteep 1\nsteep 2" }, 8000),
			...change("MultiEdit", { file_path: "/Users/you/code/teapot/lid.ts", edits: [{ old_string: lines(4), new_string: lines(1) }, { old_string: "x", new_string: "y" }] }, 7000),
			...change("NotebookEdit", { notebook_path: "/Users/you/code/teapot/brew.ipynb", new_source: lines(5), edit_mode: "insert" }, 6000),
		]);
		expect(l.changes).toEqual({ files: 3, added: 30 + 2 + 0 + 1 + 5, removed: 0 + 3 + 1 });
	});

	test("a Write over a seen file is a rewrite: it replaces the lines last written there", () => {
		const f = "/Users/you/code/teapot/kettle.md";
		const l = ledgerOf([...change("Write", { file_path: f, content: lines(10) }, 9000), ...change("Write", { file_path: f, content: lines(4) }, 5000)]);
		expect(l.changes).toEqual({ files: 1, added: 14, removed: 10 });
	});

	test("prefers the tool's own patch when the result has one for the same file", () => {
		const f = "/Users/you/code/teapot/kettle.md";
		const patch = { filePath: f, type: "update", structuredPatch: [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, lines: [" brew 0", "-brew 1", "+steep 1", " brew 2"] }] };
		const other = { filePath: "/Users/you/code/teapot/other.md", structuredPatch: [{ lines: ["+a", "+b", "+c"] }] };
		const l = ledgerOf([...change("Write", { file_path: f, content: lines(40) }, 9000, true, patch), ...change("Edit", { file_path: f, old_string: "a", new_string: "b" }, 5000, true, other)]);
		expect(l.changes).toEqual({ files: 1, added: 2, removed: 2 });
	});

	test("ignores failed and unanswered calls, and keeps no paths", () => {
		const l = ledgerOf([
			...change("Edit", { file_path: "/Users/you/code/teapot/secret-recipe.ts", old_string: "a", new_string: "b" }, 9000, false),
			call("Write", 1000, { file_path: "/Users/you/code/teapot/pending.ts", content: lines(5) }),
		]);
		expect(l.changes).toBeUndefined();
		l.feed(`${change("Edit", { file_path: "/Users/you/code/teapot/secret-recipe.ts", old_string: "a", new_string: "b" }, 500).join("\n")}\n`);
		expect(JSON.stringify(l.changes)).not.toContain("secret");
		expect(l.changes).toEqual({ files: 1, added: 1, removed: 1 });
	});
});

describe("todos", () => {
	test("are counts from the latest TodoWrite", () => {
		const todo = (statuses: string[], msAgo: number) => call("TodoWrite", msAgo, { todos: statuses.map((status, i) => ({ content: `Invented step ${i}`, status, activeForm: "Brewing" })) });
		const l = ledgerOf([todo(["pending", "pending"], 9000), todo(["completed", "in_progress", "pending", "pending", "mystery"], 3000)]);
		expect(l.todos).toEqual({ pending: 2, active: 1, done: 1 });
		l.feed(`${call("TodoWrite", 1000, { todos: "not a list" })}\n`);
		expect(l.todos).toEqual({ pending: 2, active: 1, done: 1 });
	});
});

describe("tool rate", () => {
	test("counts calls and failed results in the trailing window", () => {
		const l = ledgerOf([call("Read", 5 * MIN), call("Read", 50_000), call("Grep", 20_000), ...shell("bun test", 1, 10_000), result("toolu_nope", 5000, "Permission denied", true)]);
		expect(TOOL_RATE_WINDOW_MS).toBe(60_000);
		expect(l.toolRate(NOW)).toEqual({ calls: 3, errors: 2, windowMs: 60_000 });
		expect(l.toolRate(NOW + 45_000)).toEqual({ calls: 1, errors: 2, windowMs: 60_000 });
		expect(l.toolRate(NOW + 2 * MIN)).toEqual({ calls: 0, errors: 0, windowMs: 60_000 });
	});

	test("is undefined for a transcript with no calls", () => {
		expect(ledgerOf([reply(1000, "claude-opus-5-5", usage(1, 1, 1))]).toolRate(NOW)).toBeUndefined();
	});
});

describe("in the snapshot", () => {
	let home: string;
	let desk: string;
	beforeEach(async () => {
		home = await mkdtemp(join(tmpdir(), "bb-home-"));
		desk = await mkdtemp(join(tmpdir(), "bb-desk-"));
	});
	afterEach(async () => {
		await rm(home, { recursive: true, force: true });
		await rm(desk, { recursive: true, force: true });
	});

	const write = async (path: string, body: string, msAgo = 0) => {
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, body);
		const t = new Date(NOW - msAgo);
		await utimes(path, t, t);
	};

	test("carries every signal for a session and its running agent", async () => {
		const cwd = "/Users/you/code/teapot";
		const dir = join(home, "projects", projectSlug(cwd));
		await write(join(home, "sessions", "501.json"), JSON.stringify({ pid: 501, sessionId: "s-brew", cwd, startedAt: NOW - 3_600_000, status: "busy", hostSessionId: "local_brew" }));
		const pr = JSON.stringify({ type: "pr-link", prNumber: 12, prUrl: "https://github.com/example/teapot/pull/12", timestamp: iso(MIN) });
		await write(join(dir, "s-brew.jsonl"), `${[...shell("bun test", 1, 5 * MIN), pr, call("AskUserQuestion", 2 * MIN)].join("\n")}\n`, 2 * MIN);
		const sub = join(dir, "s-brew", "subagents");
		await write(join(sub, "agent-v1.meta.json"), JSON.stringify({ agentType: "verifier", description: "Walk the brew flow", spawnDepth: 1 }), 1000);
		await write(join(sub, "agent-v1.jsonl"), `${[...shell("bun test", 1, 9000), ...shell("bun test", 1, 4000), call("Bash", 1000, { command: "bun test" })].join("\n")}\n`, 1000);
		await write(join(desk, "a", "o", "local_brew.json"), JSON.stringify({ prs: [{ prNumber: 12, url: "https://github.com/example/teapot/pull/12", state: "OPEN" }, { prNumber: 13, url: "https://github.com/example/teapot/pull/13", repo: "example/teapot", state: "MERGED" }] }));
		// The hook saw a permission prompt after the transcript's last write.
		await write(join(home, "busybodies", "events.log"), `${Math.floor((NOW - MIN) / 1000)} Notification s-brew permission\n`);

		const snap = await new SnapshotBuilder({ home, desktopIndex: desk }, () => true, () => NOW).build();
		const s = snap.sessions[0]!;
		expect(s.running).toEqual({ tool: "AskUserQuestion", since: NOW - 2 * MIN });
		expect(s.waiting).toEqual({ reason: "permission", since: NOW - MIN, source: "hook" });
		expect(s.commands).toMatchObject({ failStreak: 1, testsFailed: 1 });
		expect(s.prs?.map((p) => [p.number, p.state])).toEqual([
			[12, "OPEN"],
			[13, "MERGED"],
		]);
		expect(s.compactions).toEqual({ count: 0 });
		expect(s.cost?.outputTokens).toBe(20);
		const a = s.agents[0]!;
		expect(a.running).toEqual({ tool: "Bash", since: NOW - 1000, kind: "test" });
		expect(a.commands).toMatchObject({ failStreak: 2, repeats: 2 });
	});

	test("carries family, context, changes, todos and tool rate, and only counts", async () => {
		const cwd = "/Users/you/code/kettle";
		const dir = join(home, "projects", projectSlug(cwd));
		await write(join(home, "sessions", "502.json"), JSON.stringify({ pid: 502, sessionId: "s-kettle", cwd, startedAt: NOW - 3_600_000, status: "busy" }));
		const todo = call("TodoWrite", 40_000, { todos: [{ content: "Descale the invented kettle", status: "completed" }, { content: "Polish the spout", status: "in_progress" }] });
		await write(
			join(dir, "s-kettle.jsonl"),
			`${[reply(50_000, "claude-sonnet-5-5", usage(2, 400_000, 98)), todo, ...change("Write", { file_path: "/Users/you/code/kettle/private-notes.md", content: lines(12) }, 30_000)].join("\n")}\n`,
		);
		const sub = join(dir, "s-kettle", "subagents");
		await write(join(sub, "agent-h1.meta.json"), JSON.stringify({ agentType: "scout", description: "Find the lid", model: "claude-haiku-5-5", spawnDepth: 1 }));
		await write(join(sub, "agent-h1.jsonl"), `${change("Edit", { file_path: "/Users/you/code/kettle/lid.ts", old_string: "a", new_string: "b\nc" }, 5000).join("\n")}\n`);
		await write(join(sub, "agent-f1.meta.json"), JSON.stringify({ agentType: "scout", description: "Done already", model: "opus", spawnDepth: 1, finished: true }), 1000);
		await write(join(sub, "agent-f1.jsonl"), `${change("Write", { file_path: "/Users/you/code/kettle/a.ts", content: lines(3) }, 9000).join("\n")}\n`, 1000);

		const s = (await new SnapshotBuilder({ home }, () => true, () => NOW).build()).sessions[0]!;
		expect(s.family).toBe("sonnet");
		expect(s.context).toEqual({ used: 400_100, window: 1_000_000, at: NOW - 50_000 });
		expect(s.changes).toEqual({ files: 1, added: 12, removed: 0 });
		expect(s.todos).toEqual({ pending: 0, active: 1, done: 1 });
		expect(s.tools).toEqual({ calls: 2, errors: 0, windowMs: 60_000 });
		expect(JSON.stringify(s)).not.toContain("private-notes");
		const [finished, scout] = s.agents;
		expect(scout).toMatchObject({ family: "haiku", changes: { files: 1, added: 2, removed: 1 }, tools: { calls: 1, errors: 0 } });
		// A finished agent still shows what it changed, while it lingers.
		expect(finished).toMatchObject({ status: "finished", family: "opus", changes: { files: 1, added: 3, removed: 0 } });
		expect(finished!.running).toBeUndefined();
	});
});

describe("narrowed watch", () => {
	test("only files in a live session's project folder count", async () => {
		const { isLiveProjectFile } = await import("../src/watcher/watch");
		const live = new Set(["-Users-you-code-teapot"]);
		expect(isLiveProjectFile("-Users-you-code-teapot/s-1.jsonl", live)).toBe(true);
		expect(isLiveProjectFile("-Users-you-code-teapot/s-1/subagents/agent-a.meta.json", live)).toBe(true);
		expect(isLiveProjectFile("-Users-you-code-kettle/s-2.jsonl", live)).toBe(false);
		expect(isLiveProjectFile("-Users-you-code-teapot/notes.txt", live)).toBe(false);
	});

	test("the builder reports the live folders and desktop ids", async () => {
		const home = await mkdtemp(join(tmpdir(), "bb-home-"));
		try {
			const cwd = "/Users/you/code/teapot";
			await mkdir(join(home, "sessions"), { recursive: true });
			await writeFile(join(home, "sessions", "9.json"), JSON.stringify({ pid: 9, sessionId: "s-9", cwd, hostSessionId: "local_9" }));
			await mkdir(join(home, "projects", projectSlug(cwd)), { recursive: true });
			await writeFile(join(home, "projects", projectSlug(cwd), "s-9.jsonl"), "");
			const b = new SnapshotBuilder({ home }, () => true, () => NOW);
			await b.build();
			expect([...b.liveProjectDirs]).toEqual([projectSlug(cwd)]);
			expect([...b.liveHostIds]).toEqual(["local_9"]);
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
});
