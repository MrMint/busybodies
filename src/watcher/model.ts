// What the watcher knows about the agents on this machine. The scene draws from a Snapshot and
// nothing else, so these types are the contract between capture and drawing.

/** The last tool call seen in a transcript. */
export interface Activity {
	tool: string;
	/** Epoch ms of the record that made the call. */
	at: number;
}

/** What a shell command was for, guessed from its text. Only the kind leaves the watcher. */
export type CommandKind = "test" | "build" | "install" | "git" | "other";

/** A tool call that has started and not returned yet. */
export interface RunningTool {
	tool: string;
	/** Epoch ms the call was made. How long it has run is `Snapshot.at - since`. */
	since: number;
	/** For a shell command: what it is for. */
	kind?: CommandKind;
}

/** The last shell command that finished. */
export interface CommandResult {
	kind: CommandKind;
	/** 0 for success. */
	exitCode: number;
	/** Epoch ms of the result. */
	at: number;
	/** From the call to its result, when both were seen. */
	durationMs?: number;
}

/** Shell commands in one transcript, as counters the jokes can read. */
export interface Commands {
	last?: CommandResult;
	/** Commands that failed in a row, ending with the last one. 0 after a success. */
	failStreak: number;
	/** Times the last command ran in a row with the same text. 1 means no retry. */
	repeats: number;
	/** Failed commands seen in this transcript, and how many of those were test runs. */
	failed: number;
	testsFailed: number;
}

/** A pull request the session opened or linked. */
export interface PullRequest {
	number: number;
	url: string;
	repo?: string;
	/** "OPEN", "MERGED", "CLOSED", when the desktop index knows it. */
	state?: string;
	/** Epoch ms of the transcript's PR-link record; absent when only the desktop index has it. */
	at?: number;
}

/** The session squeezing its context. */
export interface Compactions {
	count: number;
	/** Epoch ms of the last one. */
	lastAt?: number;
	/** "auto" or "manual", as the tool reports it. */
	trigger?: string;
}

interface Cost {
	/**
	 * Dollars, from the tool's own cost record. It writes one when a session exits, so a live
	 * session shows its cost up to its last resume, or nothing.
	 */
	usd?: number;
	/** Output tokens counted from the transcript's API responses: grows live. */
	outputTokens: number;
}

/** The API call is being retried after an error. */
export interface ApiRetry {
	attempt: number;
	max?: number;
	/** Epoch ms of the error. */
	at: number;
}

/** How full a session's (or an agent's) context is, from the last API request's input tokens. */
export interface Context {
	/** Tokens the last request sent: input plus cache reads and writes. */
	used: number;
	/** The model's window, when the model is known; no window means no meter. */
	window?: number;
	/** Epoch ms of that request. */
	at: number;
}

/** What the session (or agent) has changed, as counts only: never paths or text. */
export interface Changes {
	/** Distinct files edited or written. */
	files: number;
	/** Lines added and removed, from Edit/MultiEdit/Write inputs: an estimate, not a diff. */
	added: number;
	removed: number;
}

/** The latest todo list, as counts only. */
export interface Todos {
	pending: number;
	active: number;
	done: number;
}

/** How hard it is working: tool calls and failed tool results in the last `windowMs`. */
export interface ToolRate {
	calls: number;
	errors: number;
	windowMs: number;
}

/** A model family, as plain text: never a full model id, never a logo. */
export type ModelFamily = "fable" | "opus" | "sonnet" | "haiku" | "other";

type WaitingReason = "permission" | "question" | "plan" | "other";

/** The session is stopped until the person answers. */
export interface Waiting {
	reason: WaitingReason;
	/** Epoch ms it started waiting. */
	since: number;
	/** "hook" (opt-in, reliable), "transcript" (a question or plan tool is open). */
	source: "hook" | "transcript";
}

export type AgentStatus = "running" | "finished" | "stopped" | "stalled";

export interface Agent {
	id: string;
	/** The agent definition it was spawned as: "Explore", "reviewer", "general-purpose", ... */
	role: string;
	/** The short task description its parent gave it. */
	task: string;
	model?: string;
	/** 1 for an agent the session spawned, 2 for one an agent spawned, and so on. */
	depth: number;
	status: AgentStatus;
	/** Epoch ms of the agent's last transcript write. */
	lastWriteAt: number;
	activity?: Activity;
	running?: RunningTool;
	commands?: Commands;
	/** Plan-next stream A: optional, absent until the watcher fills them. */
	family?: ModelFamily;
	/** How full its own context is: a subagent has a window of its own. */
	context?: Context;
	changes?: Changes;
	tools?: ToolRate;
	children: Agent[];
}

export interface Session {
	id: string;
	pid: number;
	title: string;
	cwd: string;
	/** The repository folder's name; for a worktree, the repository it belongs to. */
	project: string;
	worktree?: string;
	branch?: string;
	/** Where it was started: "claude-desktop", "cli", ... as the agent tool reports it. */
	origin: string;
	/** As the agent tool reports it: "busy" and "idle" so far. */
	state: string;
	stateSince: number;
	startedAt: number;
	activity?: Activity;
	running?: RunningTool;
	commands?: Commands;
	waiting?: Waiting;
	/** The new fields are optional so snapshots built by hand (the demo, older recordings) still fit. */
	prs?: PullRequest[];
	compactions?: Compactions;
	cost?: Cost;
	apiRetry?: ApiRetry;
	/** Plan-next stream A: optional, absent until the watcher fills them. */
	family?: ModelFamily;
	context?: Context;
	changes?: Changes;
	todos?: Todos;
	tools?: ToolRate;
	agents: Agent[];
	/** Sessions this one started (side sessions and forks) that are still running. */
	children: Session[];
}

export interface Snapshot {
	at: number;
	sessions: Session[];
}

/** Every session in a tree, side sessions included, depth first. */
export const flatSessions = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flatSessions(s.children)]);
