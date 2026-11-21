// What the watcher knows about the agents on this machine. The scene draws from a Snapshot and
// nothing else, so these types are the contract between capture and drawing.

/** The last tool call seen in a transcript. */
export interface Activity {
	tool: string;
	/** Epoch ms of the record that made the call. */
	at: number;
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
	agents: Agent[];
	/** Sessions this one started (side sessions and forks) that are still running. */
	children: Session[];
}

export interface Snapshot {
	at: number;
	sessions: Session[];
}
