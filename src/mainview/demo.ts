// Invented days, for working on the scene without real sessions: open the scene with ?demo (in the
// app, or in any browser through Vite). Every project, title and person here is made up.
//   ?demo         FloorBusy's afternoon: a release crew, a PR party, idle rooms and a coffee queue
//   ?demo=idle    the same office after hours: everyone idle, every agent finished
//   ?demo=one     a single session
//   ?demo=thirty  thirty sessions over eight projects
// The clock is fixed, so the same demo always draws the same frames.
import type { SignText } from "../scene/office/paper";
import type { Agent, Session, Snapshot } from "../watcher/model";

/** 14:32 on an invented Thursday, local time. */
const NOW = new Date(2026, 10, 19, 14, 32).getTime();
const min = (m: number) => NOW - m * 60_000;

let n = 0;
const TOOLS = ["Edit", "Bash", "Read", "Grep"];

function agent(role: string, task: string, status: Agent["status"] = "running", children: Agent[] = [], depth = 1): Agent {
	const id = `demo-agent-${++n}`;
	return {
		id,
		role,
		task,
		depth,
		status,
		lastWriteAt: min(status === "stalled" ? 40 : 0.2),
		activity: status === "running" ? { tool: TOOLS[n % 4]!, at: min(0.1) } : undefined,
		children: children.map((c) => relevel(c, depth + 1)),
	};
}
const relevel = (a: Agent, depth: number): Agent => ({ ...a, depth, children: a.children.map((c) => relevel(c, depth + 1)) });

function session(title: string, project: string, state: string, started: number, extra: Partial<Session> = {}): Session {
	const id = `demo-session-${++n}`;
	return {
		id,
		pid: 1000 + n,
		title,
		cwd: `/Users/you/code/${project}`,
		project,
		origin: "claude-desktop",
		state,
		stateSince: min(state === "busy" ? 3 : 31),
		startedAt: min(started),
		activity: state === "busy" ? { tool: TOOLS[n % 4]!, at: min(0.2) } : undefined,
		agents: [],
		children: [],
		...extra,
	};
}

function floorBusy(): Snapshot {
	n = 0;
	return {
		at: NOW,
		sessions: [
			session("Ship release 2.4", "lanternfish", "busy", 320, {
				branch: "release/2.4",
				agents: [
					agent("scout", "Find callers of saveDraft", "running", [agent("scout", "Also find callers", "running", [agent("scout", "Actually looking")])]),
					agent("reviewer", "PR #212, round 2"),
					agent("designer", "Empty state for exports"),
					agent("verifier", "Staging walkthrough", "stalled"),
					agent("Explore", "Map the export module", "finished"),
					agent("scout", "Count the flags", "finished"),
				],
				children: [
					session("Export endpoint", "lanternfish", "busy", 200, { worktree: "export-endpoint", agents: [agent("verifier", "Run export tests")] }),
					session("Settings screen", "lanternfish", "busy", 190, { worktree: "settings-screen", agents: [agent("scout", "Where is the toggle read?")] }),
					session("Fork: slow CI?", "lanternfish", "idle", 150, { branch: "fork/slow-ci" }),
				],
			}),
			session("Flaky login test", "lanternfish", "busy", 100, { branch: "fix/flaky-login", agents: [agent("verifier", "Same red. Hello again.")] }),
			session("Pagination for /orbits", "orbit-kit", "busy", 260, {
				branch: "feat/pagination",
				agents: [agent("builder", "Page two"), agent("verifier", "Page two loads"), agent("verifier", "Old cursor test", "finished")],
			}),
			session("Rename everything", "orbit-kit", "busy", 90, { branch: "chore/rename", agents: [agent("scout", "Find usages of paginate")] }),
			session("Crumb cache rewrite", "breadbox", "idle", 240, { branch: "crumb-cache", agents: [agent("scout", "Paused by you", "stalled")] }),
			session("Changelog draft", "mossy-docs", "idle", 230, { branch: "docs/changelog", agents: [agent("builder", "Sent home by you", "stopped")] }),
			session("Docs sweep", "mossy-docs", "busy", 60, { branch: "docs/sweep" }),
			session("Webhook spike", "kettle-api", "idle", 210, { branch: "spike/webhooks" }),
		],
	};
}

/** What the sass engine would have written on the walls by now (lines from design/boards/Lines). */
const FLOOR_BUSY_SIGNS: Record<string, SignText> = {
	"room:lanternfish:board": { title: "DAYS SINCE A TEST BROKE: 0", body: "previous records: 3, 1, 2" },
	"room:lanternfish:sign": { title: "CAUTION", body: "scouts running" },
	"room:orbit-kit:sign": { title: "PRS TODAY: 4", body: "Humility: 0" },
	"room:orbit-kit:board": { title: "PAGE 2 LOADS", body: "Nobody touch anything." },
	"room:breadbox:sign": { title: "NOW SERVING: NOBODY", body: "Your number: 1" },
	"room:mossy-docs:sign": { title: "THE COMPACTOR", body: "Memories in. Vibes out." },
	"room:kettle-api:sign": { title: "IDLE: 31 MIN", body: "Plant: also idle." },
	"meeting:board": { title: "PR #212 · round 2", body: "Same diff. Same no." },
};

/** The same office after hours: every session idle, every agent finished. */
export const asleep = (snap: Snapshot): Snapshot => {
	const rest = (a: Agent): Agent => ({ ...a, status: "finished", activity: undefined, children: a.children.map(rest) });
	const nap = (s: Session): Session => ({ ...s, state: "idle", activity: undefined, agents: s.agents.map(rest), children: s.children.map(nap) });
	return { ...snap, sessions: snap.sessions.map(nap) };
};

function one(): Snapshot {
	n = 0;
	return { at: NOW, sessions: [session("Tidy the docs", "pebble", "busy", 30, { branch: "docs/tidy", agents: [agent("scout", "Find old terms")] })] };
}

function thirty(): Snapshot {
	n = 0;
	const projects = ["lanternfish", "orbit-kit", "breadbox", "mossy-docs", "kettle-api", "pebble", "quokka", "tinsel"];
	const roles = ["scout", "builder", "verifier", "reviewer", "designer", "Explore"];
	const sessions = Array.from({ length: 30 }, (_, i) =>
		session(`Task ${i + 1}`, projects[(i * 5) % projects.length]!, i % 3 === 2 ? "idle" : "busy", 300 - i * 7, {
			branch: `task-${i + 1}`,
			agents: Array.from({ length: i % 4 }, (_, k) => agent(roles[(i + k) % roles.length]!, `Step ${k + 1}`, k === 3 ? "finished" : "running")),
		}),
	);
	return { at: NOW, sessions };
}

/** 200 characters: 40 sessions, each a lead and four crew in every role and state. The rig's load
 * test (e2e/rig.test.ts); `crowd-idle` is the same crowd after hours. */
function crowd(): Snapshot {
	n = 0;
	const projects = ["lanternfish", "orbit-kit", "breadbox", "mossy-docs", "kettle-api", "pebble", "quokka", "tinsel"];
	const roles = ["scout", "builder", "verifier", "reviewer", "designer", "Explore"];
	const states: Agent["status"][] = ["running", "running", "running", "stalled", "finished"];
	const sessions = Array.from({ length: 40 }, (_, i) =>
		session(`Task ${i + 1}`, projects[i % projects.length]!, i % 4 === 3 ? "idle" : "busy", 400 - i * 7, {
			branch: `task-${i + 1}`,
			agents: Array.from({ length: 4 }, (_, k) => agent(roles[(i + k) % roles.length]!, `Step ${k + 1}`, states[(i + k) % states.length])),
		}),
	);
	return { at: NOW, sessions };
}

export interface DemoDay {
	snapshot: Snapshot;
	signs: Record<string, SignText>;
}

export function demo(name: string | null): DemoDay {
	switch (name) {
		case "idle":
			return { snapshot: asleep(floorBusy()), signs: FLOOR_BUSY_SIGNS };
		case "one":
			return { snapshot: one(), signs: {} };
		case "thirty":
			return { snapshot: thirty(), signs: {} };
		case "crowd":
			return { snapshot: crowd(), signs: {} };
		case "crowd-idle":
			return { snapshot: asleep(crowd()), signs: {} };
		default:
			return { snapshot: floorBusy(), signs: FLOOR_BUSY_SIGNS };
	}
}

/** The busy demo, for tests that edit it. */
export const demoSnapshot = floorBusy();
