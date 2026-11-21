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
