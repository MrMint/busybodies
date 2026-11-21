// An invented busy afternoon, for working on the scene without real sessions: open the scene with
// ?demo (in the app, or in any browser through Vite). Every name here is made up.
import type { Agent, Session, Snapshot } from "../watcher/model";

const NOW = Date.now();
const min = (m: number) => NOW - m * 60_000;

let n = 0;
const agent = (role: string, task: string, status: Agent["status"] = "running", children: Agent[] = [], depth = 1): Agent => ({
	id: `demo-agent-${++n}`,
	role,
	task,
	depth,
	status,
	lastWriteAt: min(status === "stalled" ? 40 : 0.2),
	activity: status === "running" ? { tool: ["Edit", "Bash", "Read", "Grep"][n % 4]!, at: min(0.1) } : undefined,
	children: children.map((c) => ({ ...c, depth: depth + 1 })),
});

const session = (title: string, project: string, state: string, extra: Partial<Session> = {}): Session => ({
	id: `demo-session-${++n}`,
	pid: 1000 + n,
	title,
	cwd: `/Users/you/code/${project}`,
	project,
	origin: "claude-desktop",
	state,
	stateSince: min(state === "busy" ? 3 : 50),
	startedAt: min(120 - n),
	activity: state === "busy" ? { tool: "Bash", at: min(0.2) } : undefined,
	agents: [],
	children: [],
	...extra,
});

export const demoSnapshot: Snapshot = {
	at: NOW,
	sessions: [
		session("Release build: spring cleaning", "teapot", "busy", {
			branch: "release/spring",
			agents: [
				agent("stream-builder", "Rebuild the kettle timer", "running", [agent("scout", "Where is the clock read?")]),
				agent("stream-builder", "Port the steam gauge"),
				agent("stream-builder", "New tea menu"),
				agent("reviewer", "Review the timer diff"),
				agent("verifier", "Walk the brew flow", "running", [agent("scout", "Find the fixture"), agent("scout", "Check the font")]),
				agent("designer", "Draw the empty-pot state", "finished"),
				agent("surveyor", "Inventory every button", "stalled"),
			],
		}),
		session("Why is CI red", "teapot", "busy", { branch: "fix/ci-cache", agents: [agent("Explore", "Read the cache step")] }),
		session("Garden sensors", "greenhouse", "idle", { branch: "main" }),
		session("Tidy the docs", "lantern", "busy", { worktree: "docs-tidy", agents: [agent("sweeper", "Rename old terms")] }),
		session("Night mode colours", "lantern", "idle"),
		session("Bike route import", "pedal", "idle"),
		session("Recipe parser", "pantry", "busy", { agents: [agent("general-purpose", "Parse fractions")] }),
	],
};
