// A running tally of one transcript: the signals the scene's jokes need (the tool that is running,
// failed and retried commands, PRs, compactions, cost, API retries) and the numbers the office
// shows (model family, context used, lines and files changed, todos, tool-call rate). It reads each
// transcript once, then only the bytes appended since, so a rebuild over a quiet file costs one stat.
//
// Only counts and kinds leave: file paths are hashed here and dropped, file text is reduced to line
// counts, and the full model id stays inside the watcher.
//
// The record shapes are internal to the agent tool and change between versions. Everything here
// is optional: a line that doesn't parse, or a record we don't know, is skipped.
import { open, stat } from "node:fs/promises";
import type { ApiRetry, Changes, CommandKind, CommandResult, Commands, Compactions, Context, ModelFamily, PullRequest, RunningTool, Todos, ToolRate } from "./model";
import { contextWindow, modelFamily } from "./models";

/** A first read starts no further back than this, so one huge transcript can't stall a rebuild. */
export const FIRST_READ_MAX = 32 * 1024 * 1024;
/** A single line longer than this is skipped rather than buffered. */
const LINE_MAX = 8 * 1024 * 1024;
const CHUNK = 1024 * 1024;
/** Tool calls and errors are counted over this trailing window. */
export const TOOL_RATE_WINDOW_MS = 60_000;

/** Tests, builds, installs and git, by the command's text. Anything else is "other". */
export function commandKind(command: string): CommandKind {
	const c = command.trim();
	if (/\b(bun|npm|pnpm|yarn|deno)\s+(run\s+)?test\b|\b(pytest|vitest|jest|mocha|rspec|phpunit|ctest)\b|\b(go|cargo|mix|dotnet|swift)\s+test\b|\bxcodebuild\b.*\btest\b|\bplaywright\s+test\b|\bmake\s+(test|check)\b|\bgradlew?\s+test\b/.test(c))
		return "test";
	if (/\b(bun|npm|pnpm|yarn)\s+(run\s+)?build\b|\b(cargo|go|swift|dotnet|zig)\s+build\b|\btsc\b|\bvite\s+build\b|\bwebpack\b|\bxcodebuild\b|\bgradlew?\s+(build|assemble)|\bmake\b|\bcmake\b|\bdocker\s+build\b|\belectrobun\s+build\b/.test(c))
		return "build";
	if (/\b(bun|npm|pnpm|yarn)\s+(install|i|add|ci)\b|\bpip3?\s+install\b|\bbrew\s+install\b|\bcargo\s+(install|fetch)\b|\bgo\s+mod\s+download\b/.test(c))
		return "install";
	if (/^(git|gh)\b/.test(c)) return "git";
	return "other";
}

/** "Exit code 2\n..." is how a failed shell result starts. */
const EXIT = /^Exit code (\d+)/;

/** A file change a call asks for, applied when its result comes back without an error. */
type Change = { file: number; added: number; removed: number; write?: number };
/** Keys read from a plain response record without parsing it. Global, so a search can start mid-line. */
const RE = {
	request: /"requestId":"([^"]+)"/g,
	timestamp: /"timestamp":"([^"]+)"/g,
	output: /"output_tokens":(\d+)/g,
	input: /"input_tokens":(\d+)/g,
	cacheRead: /"cache_read_input_tokens":(\d+)/g,
	cacheCreate: /"cache_creation_input_tokens":(\d+)/g,
	// The model comes first in the records seen so far: no `g`, a plain search from the start.
	model: /"model":"([^"]*)"/,
};

type Pending = { tool: string; at: number; command?: string; change?: Change };

export class TranscriptLedger {
	offset = 0;
	#carry = "";
	#skipping = false;
	#pending = new Map<string, Pending>();
	#lastCommand?: string;
	#lastRequest?: string;
	#lastRequestTokens = 0;

	commands: Commands = { failStreak: 0, repeats: 0, failed: 0, testsFailed: 0 };
	prs: PullRequest[] = [];
	compactions: Compactions = { count: 0 };
	costUSD?: number;
	outputTokens = 0;
	apiRetry?: ApiRetry;
	/** The last request's context, cleared (or set to what is left) by a compaction. */
	context?: Context;
	/** The latest TodoWrite list, as counts. */
	todos?: Todos;
	/** Lines added and removed by successful edits and writes. */
	added = 0;
	removed = 0;
	/** The full model id of the newest response: never leaves the watcher, only its family does. */
	#model?: string;
	/** Hashes of the paths edited or written, and the line count last written to each. */
	#files = new Map<number, number | undefined>();
	/** Times of tool calls and failed tool results, newest last, trimmed to the rate window. */
	#calls: number[] = [];
	#errors: number[] = [];
	#seenCall = false;

	get family(): ModelFamily | undefined {
		return modelFamily(this.#model);
	}

	/** Undefined until a file has been changed. */
	get changes(): Changes | undefined {
		return this.#files.size ? { files: this.#files.size, added: this.added, removed: this.removed } : undefined;
	}

	/** Calls and errors in the window ending at `now`; undefined if the transcript never called a tool. */
	toolRate(now: number): ToolRate | undefined {
		if (!this.#seenCall) return undefined;
		const since = now - TOOL_RATE_WINDOW_MS;
		const n = (l: number[]) => l.reduce((k, t) => k + (t > since && t <= now ? 1 : 0), 0);
		return { calls: n(this.#calls), errors: n(this.#errors), windowMs: TOOL_RATE_WINDOW_MS };
	}

	/** The newest call still waiting for its result. */
	get running(): RunningTool | undefined {
		let newest: Pending | undefined;
		for (const p of this.#pending.values()) if (!newest || p.at >= newest.at) newest = p;
		if (!newest) return undefined;
		return { tool: newest.tool, since: newest.at, ...(newest.command !== undefined ? { kind: commandKind(newest.command) } : {}) };
	}

	/** Reads what was appended since the last call. A file that shrank was replaced: start over. */
	async update(path: string, known?: { size: number }): Promise<void> {
		const s = known ?? (await stat(path).catch(() => undefined));
		if (!s) return;
		if (s.size < this.offset) this.#reset();
		if (s.size === this.offset) return;
		if (this.offset === 0 && s.size > FIRST_READ_MAX) {
			this.offset = s.size - FIRST_READ_MAX;
			this.#skipping = true; // the first line is probably cut: drop it
		}
		const fh = await open(path, "r");
		try {
			while (this.offset < s.size) {
				const buf = Buffer.alloc(Math.min(CHUNK, s.size - this.offset));
				const { bytesRead } = await fh.read(buf, 0, buf.length, this.offset);
				if (bytesRead <= 0) break;
				this.offset += bytesRead;
				this.feed(buf.subarray(0, bytesRead).toString("utf8"));
			}
		} finally {
			await fh.close();
		}
	}

	/** Takes transcript text in any pieces; whole lines are processed as they complete. */
	feed(text: string): void {
		let start = 0;
		for (;;) {
			const nl = text.indexOf("\n", start);
			if (nl < 0) break;
			const piece = text.slice(start, nl);
			start = nl + 1;
			if (this.#skipping) {
				this.#skipping = false;
				this.#carry = "";
				continue;
			}
			const line = this.#carry + piece;
			this.#carry = "";
			this.line(line);
		}
		if (this.#skipping) return;
		this.#carry += text.slice(start);
		if (this.#carry.length > LINE_MAX) {
			this.#carry = "";
			this.#skipping = true;
		}
	}

	line(line: string): void {
		// Cheap text checks first: most lines are none of these, and some are megabytes.
		const has = (s: string) => line.includes(s);
		if (!(has('"tool_use"') || has('"tool_result"') || has('"pr-link"') || has('"cost-state"') || has('"compact_boundary"') || has('"api_error"') || has('"type":"user"') || has('"usage"')))
			return;
		// A plain response record is common and can be large: take its token count without parsing.
		if (!has('"tool_use"') && has('"type":"assistant"')) return this.#tokens(line);
		let r: Record<string, unknown>;
		try {
			r = JSON.parse(line);
		} catch {
			return;
		}
		if (!r || typeof r !== "object") return;
		const at = typeof r.timestamp === "string" ? Date.parse(r.timestamp) : NaN;
		switch (r.type) {
			case "assistant":
				return this.#assistant(r, at);
			case "user":
				return this.#user(r, at);
			case "pr-link":
				return this.#prLink(r, at);
			case "cost-state":
				if (typeof r.totalCostUSD === "number") this.costUSD = r.totalCostUSD;
				return;
			case "system":
				if (r.subtype === "compact_boundary") {
					const meta = (r.compactMetadata ?? {}) as { trigger?: unknown };
					this.compactions = {
						count: this.compactions.count + 1,
						...(Number.isFinite(at) ? { lastAt: at } : {}),
						...(typeof meta.trigger === "string" ? { trigger: meta.trigger } : {}),
					};
					// The context before the boundary is gone; so are its open calls.
					this.#pending.clear();
					const left = (r.compactMetadata as { postTokens?: unknown } | undefined)?.postTokens;
					this.context =
						typeof left === "number" && left >= 0 && Number.isFinite(at)
							? { used: left, ...optional("window", contextWindow(this.#model)), at }
							: undefined;
				} else if (r.subtype === "api_error" && typeof r.retryAttempt === "number" && Number.isFinite(at)) {
					this.apiRetry = { attempt: r.retryAttempt, ...(typeof r.maxRetries === "number" ? { max: r.maxRetries } : {}), at };
				}
				return;
		}
	}

	#assistant(r: Record<string, unknown>, at: number): void {
		this.apiRetry = undefined;
		const msg = (r.message ?? {}) as { content?: unknown; model?: unknown; usage?: Record<string, unknown> };
		// One API response is written as several records that share a request id, each with the
		// usage so far: count the largest per request.
		const req = typeof r.requestId === "string" ? r.requestId : undefined;
		const u = msg.usage ?? {};
		this.#count(req, typeof u.output_tokens === "number" ? u.output_tokens : 0);
		const tok = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
		this.#response(
			typeof msg.model === "string" ? msg.model : undefined,
			typeof u.input_tokens === "number" ? tok(u.input_tokens) + tok(u.cache_read_input_tokens) + tok(u.cache_creation_input_tokens) : undefined,
			at,
			r.isSidechain === true,
		);
		if (!Array.isArray(msg.content) || !Number.isFinite(at)) return;
		for (const b of msg.content as Record<string, unknown>[]) {
			if (b?.type !== "tool_use" || typeof b.id !== "string" || typeof b.name !== "string") continue;
			const input = (b.input && typeof b.input === "object" ? b.input : {}) as Record<string, unknown>;
			this.#called(at);
			if (b.name === "TodoWrite") this.#todoWrite(input);
			const change = requestedChange(b.name, input);
			this.#pending.set(b.id, {
				tool: b.name,
				at,
				...(typeof input.command === "string" && b.name === "Bash" ? { command: input.command } : {}),
				...(change ? { change } : {}),
			});
		}
	}

	/** A plain response record, read as text: these are common and can be megabytes long. */
	#tokens(line: string): void {
		this.apiRetry = undefined;
		// The response text can't hold an unescaped key, and usage, the request id and the time
		// usually follow it: find usage from the end, then read on from there. Only a record laid
		// out the other way round costs a second pass over the text.
		const u = Math.max(0, line.lastIndexOf('"usage":{'));
		const after = (re: RegExp) => {
			re.lastIndex = u;
			const m = re.exec(line);
			if (m || u === 0) return m?.[1];
			re.lastIndex = 0;
			return re.exec(line)?.[1];
		};
		const num = (re: RegExp) => {
			re.lastIndex = u;
			const m = re.exec(line);
			return m ? Number(m[1]) : undefined;
		};
		this.#count(after(RE.request), num(RE.output) ?? 0);
		const input = num(RE.input);
		this.#response(
			RE.model.exec(line)?.[1],
			input === undefined ? undefined : input + (num(RE.cacheRead) ?? 0) + (num(RE.cacheCreate) ?? 0),
			Date.parse(after(RE.timestamp) ?? ""),
			line.includes('"isSidechain":true'),
		);
	}

	/** The model and context of a response record. A placeholder model (an error record) is not a request. */
	#response(model: string | undefined, used: number | undefined, at: number, sidechain: boolean): void {
		if (sidechain || model?.startsWith("<")) return;
		if (model) this.#model = model;
		if (used !== undefined && Number.isFinite(at)) this.context = { used, ...optional("window", contextWindow(this.#model)), at };
	}

	#called(at: number): void {
		this.#seenCall = true;
		push(this.#calls, at);
	}

	#todoWrite(input: Record<string, unknown>): void {
		if (!Array.isArray(input.todos)) return;
		const t: Todos = { pending: 0, active: 0, done: 0 };
		for (const item of input.todos as { status?: unknown }[]) {
			if (item?.status === "pending") t.pending++;
			else if (item?.status === "in_progress") t.active++;
			else if (item?.status === "completed") t.done++;
		}
		this.todos = t;
	}

	#count(req: string | undefined, out: number): void {
		if (req && req === this.#lastRequest) {
			if (out > this.#lastRequestTokens) {
				this.outputTokens += out - this.#lastRequestTokens;
				this.#lastRequestTokens = out;
			}
		} else {
			this.#lastRequest = req;
			this.#lastRequestTokens = out;
			this.outputTokens += out;
		}
	}

	#user(r: Record<string, unknown>, at: number): void {
		const msg = (r.message ?? {}) as { content?: unknown };
		if (!Array.isArray(msg.content)) {
			// A prompt the person typed: whatever was open before it was abandoned.
			if (typeof msg.content === "string" && !r.isMeta) this.#pending.clear();
			return;
		}
		const blocks = msg.content as Record<string, unknown>[];
		if (!r.isMeta && !blocks.some((b) => b?.type === "tool_result")) this.#pending.clear();
		const extra = (r.toolUseResult && typeof r.toolUseResult === "object" ? r.toolUseResult : {}) as {
			interrupted?: unknown;
			backgroundTaskId?: unknown;
			structuredPatch?: unknown;
			filePath?: unknown;
			type?: unknown;
		};
		for (const b of msg.content as Record<string, unknown>[]) {
			if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
			const call = this.#pending.get(b.tool_use_id);
			this.#pending.delete(b.tool_use_id);
			if (b.is_error === true && Number.isFinite(at)) push(this.#errors, at);
			if (call?.change && b.is_error !== true) this.#changed(call.change, extra);
			if (call?.command === undefined || extra.interrupted === true || extra.backgroundTaskId !== undefined) continue;
			const text = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? String((b.content[0] as { text?: unknown })?.text ?? "") : "";
			const exit = EXIT.exec(text);
			const exitCode = b.is_error === true ? (exit ? Number(exit[1]) : 1) : 0;
			// A refused or failed-to-start call (no exit code, an error) is not a command that ran.
			if (b.is_error === true && !exit) continue;
			this.#finished(call.command, exitCode, Number.isFinite(at) ? at : call.at, call.at);
		}
	}

	/**
	 * Counts a change that went through. The tool's own patch of the file, when the result has one
	 * for the same path, is a real diff; otherwise the estimate from the call's input stands.
	 */
	#changed(c: Change, result: { structuredPatch?: unknown; filePath?: unknown; type?: unknown }): void {
		const patch = typeof result.filePath === "string" && hashPath(result.filePath) === c.file ? patchLines(result.structuredPatch) : undefined;
		const known = this.#files.has(c.file);
		const before = this.#files.get(c.file);
		let { added, removed } = c;
		if (patch) ({ added, removed } = patch);
		else if (c.write !== undefined && (known || result.type === "update")) {
			// A Write over a file we've seen: a rewrite. Without a patch, what it replaced is the
			// line count we last saw written there (unknown, so 0, if it was only ever edited).
			removed = before ?? 0;
		}
		this.added += added;
		this.removed += removed;
		this.#files.set(c.file, c.write ?? (before !== undefined ? Math.max(0, before + added - removed) : undefined));
	}

	#finished(command: string, exitCode: number, at: number, calledAt: number): void {
		const kind = commandKind(command);
		const same = normalize(command) === this.#lastCommand;
		this.#lastCommand = normalize(command);
		const c = this.commands;
		const last: CommandResult = { kind, exitCode, at, ...(at >= calledAt ? { durationMs: at - calledAt } : {}) };
		this.commands = {
			last,
			failStreak: exitCode === 0 ? 0 : c.failStreak + 1,
			repeats: same ? c.repeats + 1 : 1,
			failed: c.failed + (exitCode === 0 ? 0 : 1),
			testsFailed: c.testsFailed + (exitCode !== 0 && kind === "test" ? 1 : 0),
		};
	}

	#prLink(r: Record<string, unknown>, at: number): void {
		if (typeof r.prUrl !== "string" || typeof r.prNumber !== "number") return;
		if (this.prs.some((p) => p.url === r.prUrl)) return;
		this.prs.push({
			number: r.prNumber,
			url: r.prUrl,
			...(typeof r.prRepository === "string" ? { repo: r.prRepository } : {}),
			...(Number.isFinite(at) ? { at } : {}),
		});
	}

	#reset(): void {
		const fresh = new TranscriptLedger();
		Object.assign(this, { commands: fresh.commands, prs: [], compactions: fresh.compactions, costUSD: undefined, outputTokens: 0, apiRetry: undefined });
		this.offset = 0;
		this.#carry = "";
		this.#skipping = false;
		this.#pending.clear();
		this.#lastCommand = undefined;
		this.#lastRequest = undefined;
		this.#lastRequestTokens = 0;
		this.context = undefined;
		this.todos = undefined;
		this.added = 0;
		this.removed = 0;
		this.#model = undefined;
		this.#files.clear();
		this.#calls = [];
		this.#errors = [];
		this.#seenCall = false;
	}
}

const optional = <K extends string, V>(key: K, value: V | undefined) =>
	(value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

/** Adds a time and drops those older than the rate window before the newest one. */
function push(list: number[], at: number): void {
	if (!Number.isFinite(at)) return;
	list.push(at);
	if (list.length > 1 && at < list[list.length - 2]!) list.sort((a, b) => a - b);
	const cut = list[list.length - 1]! - TOOL_RATE_WINDOW_MS;
	let drop = 0;
	while (drop < list.length && list[drop]! <= cut) drop++;
	if (drop) list.splice(0, drop);
}

/** A 53-bit hash of a path (cyrb53): the path itself is never kept. */
export function hashPath(path: string): number {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < path.length; i++) {
		const ch = path.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Lines in a text: a trailing newline doesn't start another one. */
export function lineCount(text: string): number {
	if (!text) return 0;
	let n = 1;
	for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) n++;
	return text.endsWith("\n") ? n - 1 : n;
}

/**
 * Lines an Edit adds and removes, from its old and new strings: lines the two share at the start
 * and end are context, not change. An estimate, not a diff.
 */
export function editLines(oldText: string, newText: string): { added: number; removed: number } {
	if (oldText === newText) return { added: 0, removed: 0 };
	const a = oldText ? oldText.split("\n") : [];
	const b = newText ? newText.split("\n") : [];
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let end = 0;
	while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
	return { added: b.length - start - end, removed: a.length - start - end };
}

/** The change a file-editing call asks for, or undefined for any other call. */
function requestedChange(tool: string, input: Record<string, unknown>): Change | undefined {
	const str = (v: unknown) => (typeof v === "string" ? v : "");
	const path = typeof input.file_path === "string" ? input.file_path : typeof input.notebook_path === "string" ? input.notebook_path : undefined;
	if (!path) return undefined;
	const file = hashPath(path);
	switch (tool) {
		case "Edit":
			return { file, ...editLines(str(input.old_string), str(input.new_string)) };
		case "MultiEdit": {
			const c: Change = { file, added: 0, removed: 0 };
			for (const e of Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : []) {
				const d = editLines(str(e?.old_string), str(e?.new_string));
				c.added += d.added;
				c.removed += d.removed;
			}
			return c;
		}
		case "Write": {
			const lines = lineCount(str(input.content));
			return { file, added: lines, removed: 0, write: lines };
		}
		case "NotebookEdit":
			// A cell's old source isn't in the call: a replace counts only the new lines.
			return { file, added: input.edit_mode === "delete" ? 0 : lineCount(str(input.new_source)), removed: 0 };
	}
	return undefined;
}

/** Added and removed lines in the tool's own patch (hunks of "+", "-" and " " lines). */
function patchLines(patch: unknown): { added: number; removed: number } | undefined {
	if (!Array.isArray(patch) || patch.length === 0) return undefined;
	let added = 0;
	let removed = 0;
	for (const h of patch as { lines?: unknown }[]) {
		if (!Array.isArray(h?.lines)) return undefined;
		for (const l of h.lines) {
			if (typeof l !== "string") continue;
			if (l.startsWith("+")) added++;
			else if (l.startsWith("-")) removed++;
		}
	}
	return { added, removed };
}

/** Two runs are "the same command" when they differ only in whitespace. */
const normalize = (command: string) => command.trim().replace(/\s+/g, " ");
