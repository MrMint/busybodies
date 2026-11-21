// A running tally of one transcript: the signals the scene's jokes need (the tool that is running,
// failed and retried commands, PRs, compactions, cost, API retries). It reads each transcript once,
// then only the bytes appended since, so a rebuild over a quiet file costs one stat.
//
// The record shapes are internal to the agent tool and change between versions. Everything here
// is optional: a line that doesn't parse, or a record we don't know, is skipped.
import { open, stat } from "node:fs/promises";
import type { ApiRetry, CommandKind, CommandResult, Commands, Compactions, PullRequest, RunningTool } from "./model";

/** A first read starts no further back than this, so one huge transcript can't stall a rebuild. */
export const FIRST_READ_MAX = 32 * 1024 * 1024;
/** A single line longer than this is skipped rather than buffered. */
const LINE_MAX = 8 * 1024 * 1024;
const CHUNK = 1024 * 1024;

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

type Pending = { tool: string; at: number; command?: string };

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
				} else if (r.subtype === "api_error" && typeof r.retryAttempt === "number" && Number.isFinite(at)) {
					this.apiRetry = { attempt: r.retryAttempt, ...(typeof r.maxRetries === "number" ? { max: r.maxRetries } : {}), at };
				}
				return;
		}
	}

	#assistant(r: Record<string, unknown>, at: number): void {
		this.apiRetry = undefined;
		const msg = (r.message ?? {}) as { content?: unknown; usage?: { output_tokens?: unknown } };
		// One API response is written as several records that share a request id, each with the
		// usage so far: count the largest per request.
		const req = typeof r.requestId === "string" ? r.requestId : undefined;
		this.#count(req, typeof msg.usage?.output_tokens === "number" ? msg.usage.output_tokens : 0);
		if (!Array.isArray(msg.content) || !Number.isFinite(at)) return;
		for (const b of msg.content as Record<string, unknown>[]) {
			if (b?.type !== "tool_use" || typeof b.id !== "string" || typeof b.name !== "string") continue;
			const input = (b.input ?? {}) as { command?: unknown };
			this.#pending.set(b.id, { tool: b.name, at, ...(typeof input.command === "string" && b.name === "Bash" ? { command: input.command } : {}) });
		}
	}

	#tokens(line: string): void {
		this.apiRetry = undefined;
		const req = /"requestId":"([^"]+)"/.exec(line)?.[1];
		const out = Number(/"output_tokens":(\d+)/.exec(line)?.[1] ?? 0);
		this.#count(req, out);
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
		const extra = (r.toolUseResult ?? {}) as { interrupted?: unknown; backgroundTaskId?: unknown };
		for (const b of msg.content as Record<string, unknown>[]) {
			if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
			const call = this.#pending.get(b.tool_use_id);
			this.#pending.delete(b.tool_use_id);
			if (call?.command === undefined || extra.interrupted === true || extra.backgroundTaskId !== undefined) continue;
			const text = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? String((b.content[0] as { text?: unknown })?.text ?? "") : "";
			const exit = EXIT.exec(text);
			const exitCode = b.is_error === true ? (exit ? Number(exit[1]) : 1) : 0;
			// A refused or failed-to-start call (no exit code, an error) is not a command that ran.
			if (b.is_error === true && !exit) continue;
			this.#finished(call.command, exitCode, Number.isFinite(at) ? at : call.at, call.at);
		}
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
	}
}

/** Two runs are "the same command" when they differ only in whitespace. */
const normalize = (command: string) => command.trim().replace(/\s+/g, " ");
