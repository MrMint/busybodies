// Where the agent tool keeps its state, and the shapes we read from it. These formats are internal
// to the tool and change between versions: every field is optional here, and unknown fields and
// record types are ignored.
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";

export interface Roots {
	/** The agent tool's home: sessions/, projects/. Default ~/.claude. */
	home: string;
	/** The desktop app's per-session index, if present. Default is the macOS location. */
	desktopIndex?: string;
}

export function defaultRoots(env = process.env): Roots {
	return {
		home: env.BUSYBODIES_AGENT_HOME ?? join(homedir(), ".claude"),
		desktopIndex:
			env.BUSYBODIES_DESKTOP_INDEX ??
			(process.platform === "darwin"
				? join(homedir(), "Library", "Application Support", "Claude", "claude-code-sessions")
				: undefined),
	};
}

/** sessions/<pid>.json: one per running process. */
export interface RegistryEntry {
	pid?: number;
	sessionId?: string;
	cwd?: string;
	startedAt?: number;
	kind?: string;
	entrypoint?: string;
	/** The desktop app's id for this session, when the desktop app started it. */
	hostSessionId?: string;
	name?: string;
	status?: string;
	statusUpdatedAt?: number;
}

// What JSON.parse gives back is whatever the file holds: a field may be missing, null, or a
// different type after a format change. These keep only the fields with the type we expect, so
// the snapshot code can trust its interfaces (a number for a cwd must never reach a string method).
type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : undefined);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
function pick<T>(fields: { [K in keyof T]: (v: unknown) => T[K] | undefined }, raw: Raw): T {
	const out: Record<string, unknown> = {};
	for (const k in fields) {
		const v = fields[k](raw[k]);
		if (v !== undefined) out[k] = v;
	}
	return out as T;
}

/** A registry file's typed fields; undefined when it isn't a JSON object at all. */
export function registryEntry(raw: unknown): RegistryEntry | undefined {
	const r = obj(raw);
	return r
		? pick<RegistryEntry>(
				{ pid: num, sessionId: str, cwd: str, startedAt: num, kind: str, entrypoint: str, hostSessionId: str, name: str, status: str, statusUpdatedAt: num },
				r,
			)
		: undefined;
}

/** A subagent's meta file's typed fields. */
export function agentMeta(raw: unknown): AgentMeta | undefined {
	const r = obj(raw);
	return r
		? pick<AgentMeta>(
				{ agentType: str, description: str, model: str, spawnDepth: num, parentAgentId: str, finished: bool, stoppedByUser: bool },
				r,
			)
		: undefined;
}

/** A desktop index entry's typed fields (its PR list is checked item by item where it is read). */
export function desktopEntry(raw: unknown): DesktopEntry | undefined {
	const r = obj(raw);
	if (!r) return undefined;
	const from = str(obj(r.spawnedFrom)?.sessionId);
	return {
		...pick<Omit<DesktopEntry, "spawnedFrom" | "prs">>({ title: str, branch: str, isArchived: bool, forkedFromSessionId: str }, r),
		...(from ? { spawnedFrom: { sessionId: from } } : {}),
		...(Array.isArray(r.prs) ? { prs: r.prs as DesktopEntry["prs"] } : {}),
	};
}

/** projects/<slug>/<session>/subagents/agent-<id>.meta.json */
export interface AgentMeta {
	agentType?: string;
	description?: string;
	model?: string;
	spawnDepth?: number;
	parentAgentId?: string;
	finished?: boolean;
	stoppedByUser?: boolean;
}

/** The desktop app's <hostSessionId>.json. */
export interface DesktopEntry {
	title?: string;
	branch?: string;
	isArchived?: boolean;
	spawnedFrom?: { sessionId?: string };
	forkedFromSessionId?: string;
	prs?: { prNumber?: number; url?: string; repo?: string; state?: string }[];
}

/** The tool names a project folder after its cwd, with every character but [A-Za-z0-9-] as "-". */
export const projectSlug = (cwd: string) => cwd.replace(/[^A-Za-z0-9-]/g, "-");

const WORKTREES = `${sep}.claude${sep}worktrees${sep}`;

/** The repository name, and the worktree name when the cwd is an agent worktree. */
export function projectOf(cwd: string): { project: string; worktree?: string } {
	const at = cwd.indexOf(WORKTREES);
	if (at < 0) return { project: basename(cwd) };
	return { project: basename(cwd.slice(0, at)), worktree: cwd.slice(at + WORKTREES.length).split(sep)[0] };
}

const TOOL_USE = /"type":"tool_use","id":"[^"]*","name":"([^"]+)"/g;
const TIMESTAMP = /"timestamp":"([^"]+)"/;

/**
 * The last tool call in a stretch of transcript text (one JSON record per line). Matched as text,
 * not parsed: a record can be megabytes, and the stretch may start mid-record. The call's time is
 * the timestamp that follows it on the same line.
 */
export function lastToolCall(text: string): { tool: string; at: number } | undefined {
	const calls = [...text.matchAll(TOOL_USE)];
	// Newest first. A call quoted inside another record (a tool result echoing a transcript, say)
	// has no timestamp of its own on its line; skip those.
	for (let i = calls.length - 1; i >= 0; i--) {
		const m = calls[i]!;
		const after = m.index + m[0].length;
		const eol = text.indexOf("\n", after);
		const stamp = TIMESTAMP.exec(text.slice(after, eol < 0 ? undefined : eol))?.[1];
		const at = stamp ? Date.parse(stamp) : NaN;
		if (Number.isFinite(at)) return { tool: m[1]!, at };
	}
	return undefined;
}

/** Where the opt-in hook (tools/hooks.ts) appends its events, under the agent home. */
export const HOOK_DIR = "busybodies";
export const HOOK_EVENTS = "events.log";

/** The newest hook event per session. */
export interface HookEvent {
	event: string;
	/** Epoch ms, to the second: the hook stamps it with `date +%s`. */
	at: number;
	/** For a Notification: "permission", "question", "idle" or "other". */
	kind?: string;
}

/**
 * Parses hook lines, "<epoch seconds> <event> <session id> [kind]", newest last. A line cut by a
 * torn tail, or with fields we don't expect, is skipped.
 */
export function hookEvents(text: string): Map<string, HookEvent> {
	const out = new Map<string, HookEvent>();
	for (const line of text.split("\n")) {
		const m = /^(\d{9,11}) ([A-Za-z]+) ([A-Za-z0-9_-]+)(?: ([a-z_]+))?$/.exec(line.trim());
		if (!m) continue;
		out.set(m[3]!, { event: m[2]!, at: Number(m[1]) * 1000, ...(m[4] ? { kind: m[4] } : {}) });
	}
	return out;
}
