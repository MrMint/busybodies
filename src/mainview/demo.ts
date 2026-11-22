// Invented days, for working on the scene without real sessions: open the scene with ?demo (in the
// app, or in any browser through Vite). Every project, title and person here is made up.
//   ?demo         FloorBusy's afternoon: a release crew, a PR party, idle rooms and a coffee queue
//   ?demo=idle    the same office after hours: everyone idle, every agent finished
//   ?demo=one     a single session
//   ?demo=thirty  thirty sessions over eight projects
//   ?demo=release a release with six builders: they walk to the room's stations for their work and
//                 queue for them, a long build kicks the copier, a test goes red at the stamp desk,
//                 one finishes, a PR; builders carry bricks to their crew build (and a two-builder
//                 hotfix next door shares the stations)
//   ?demo=empty   nobody's in; ?demo=nohome: no coding agent found (add &compact for the small window)
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

/** One step of a crew member's day: the tool in hand, and what it has running. */
type Step = { tool: string; run?: "build" | "test" } | "done";
type Script = (t: number) => Step;

/**
 * What each of the release crew has in hand from second `t` of the day. A kind has to hold six
 * seconds before anyone walks for it, so the first trips set off at 6 s.
 */
const RELEASE_SCRIPT: [task: string, script: Script][] = [
	// Edits all day, at its bench: the brick runs.
	["Bump the versions", () => ({ tool: "Edit" })],
	// Reads at the filing cabinet from 6 s, then back to write at 15 s.
	["Changelog entries", (t) => (t < 15 ? { tool: "Read" } : { tool: "Edit" })],
	// Runs the export test: at the stamp desk from 12 s; red at 18 s (a red stamp, then the thumb).
	["Fix the export test", (t) => (t < 3 ? { tool: "Grep" } : t < 18 ? { tool: "Bash", run: "test" } : t < 21 ? { tool: "Bash" } : { tool: "Edit" })],
	// Reads too: queues at the filing cabinet behind the changelog, gives up to write at 12 s.
	["Migrate the settings", (t) => (t < 12 ? { tool: "Read" } : { tool: "Edit" })],
	// A build 25 minutes in: at the copier from 6 s, kicking it; fixed at 27 s.
	["Build the installer", (t) => (t < 27 ? { tool: "Bash", run: "build" } : { tool: "Edit" })],
	// Writes, looks things up at the card catalogue from 15 s, finishes at 24 s.
	["Release notes", (t) => (t < 9 ? { tool: "Write" } : t < 24 ? { tool: "Grep" } : "done")],
];
/** The hotfix pair next door shares the room's stations, at a run (a hot tool rate). */
const HOTFIX_SCRIPT: [task: string, script: Script][] = [
	["Patch the signing step", (t) => (t < 3 ? { tool: "Read" } : { tool: "Edit" })],
	// Builds from 3 s: at 12 s it queues at the copier behind the installer build; edits at 21 s.
	["Retry the upload", (t) => (t < 3 ? { tool: "Read" } : t < 21 ? { tool: "Bash", run: "build" } : { tool: "Edit" })],
];

/** Put a crew member on its step at `at`. A new tool, or every other beat, is a new call. */
function perform(a: Agent, step: Step, at: number, fresh: boolean): void {
	if (step === "done") {
		a.status = "finished";
		a.activity = undefined;
		a.running = undefined;
		return;
	}
	if (a.status !== "running") return;
	if (fresh || a.activity?.tool !== step.tool) {
		a.activity = { tool: step.tool, at };
		a.lastWriteAt = at;
	}
	a.running = step.run ? (a.running?.kind === step.run ? a.running : { tool: step.tool, since: at, kind: step.run }) : undefined;
}

const crewOf = (script: [string, Script][], rate: number) =>
	script.map(([task, play], i) => {
		const a: Agent = { ...agent("general-purpose", task), tools: { calls: rate, errors: 0, windowMs: 60_000 } };
		perform(a, play(0), min(0.05 + i * 0.1), true);
		return a;
	});

/** A release crew: a lead waiting on six builders, each on its own errand. */
function release(): Snapshot {
	n = 0;
	const crew = crewOf(RELEASE_SCRIPT, 6);
	// The installer build has been going a while: long enough to jam the copier.
	crew[4]!.running = { tool: "Bash", since: min(25), kind: "build" };
	return {
		at: NOW,
		sessions: [
			session("Ship release 3.0", "lanternfish", "busy", 40, {
				branch: "release/3.0",
				activity: { tool: "Task", at: min(1) },
				running: { tool: "Task", since: min(1) },
				agents: crew,
			}),
			// A second, smaller crew next door: its own brick runs, on its own cooldown.
			session("Hotfix: installer", "lanternfish", "busy", 20, {
				branch: "fix/installer",
				activity: { tool: "Task", at: min(0.5) },
				running: { tool: "Task", since: min(0.5) },
				agents: crewOf(HOTFIX_SCRIPT, 24),
			}),
			session("Docs sweep", "mossy-docs", "idle", 60, { branch: "docs/sweep" }),
		],
	};
}

/**
 * The release, played forward: a beat every 3 s. Crew walk to the stations their work needs and
 * queue when one is taken (filing cabinet and copier); the long build kicks the copier; a test goes
 * red at the stamp desk at 18 s; a builder finishes at 24 s; the PR goes up at 33 s. Edits keep
 * landing, so bricks run to the builds. Every name is invented.
 */
export function releaseDay(): { after: number; snapshot: Snapshot }[] {
	let snap = release();
	const steps: { after: number; snapshot: Snapshot }[] = [];
	for (let i = 1; i <= 12; i++) {
		const t = i * 3;
		snap = structuredClone(snap);
		const at = NOW + t * 1000;
		snap.at = at;
		const [ship, hotfix] = snap.sessions as [Session, Session];
		ship.agents.forEach((a, k) => perform(a, RELEASE_SCRIPT[k]![1](t), at - k * 50, (i + k) % 2 === 0));
		hotfix.agents.forEach((a, k) => perform(a, HOTFIX_SCRIPT[k]![1](t), at - 1500 - k * 50, (i + k) % 2 === 0));
		if (t === 18) ship.agents[2]!.commands = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at } };
		if (t === 33) ship.prs = [{ number: 300, url: "https://example.invalid/pull/300", at }];
		steps.push({ after: t * 1000, snapshot: snap });
	}
	return steps;
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

/**
 * The FloorBusy day, played forward through the director: five beats a few seconds apart.
 *   +4 s   a reviewer is hired on orbit-kit and walks to the meeting room; a new session arrives
 *   +8 s   the flaky login test waits on you (paddle, pulsing room, top pill); its verifier fails
 *   +12 s  the release opens a PR and celebrates with a scout; Explore, long finished, goes home
 *   +17 s  the wait is answered; the review ends; the webhook spike closes and its lead leaves
 *   +23 s  the new session's build has run long: grumpy
 * Every name is invented; times run from the demo's clock.
 */
export function demoDay(): { after: number; snapshot: Snapshot }[] {
	const base = floorBusy();
	const steps: { after: number; snapshot: Snapshot }[] = [];
	const at = (ms: number) => NOW + ms;
	const clone = (x: Snapshot): Snapshot => structuredClone(x);
	const find = (snap: Snapshot, title: string): Session => {
		const all = (l: Session[]): Session[] => l.flatMap((x) => [x, ...all(x.children)]);
		return all(snap.sessions).find((x) => x.title === title)!;
	};

	let snap = clone(base);
	const beat = (after: number, change: (s: Snapshot) => void) => {
		snap = clone(snap);
		snap.at = at(after);
		change(snap);
		steps.push({ after, snapshot: snap });
	};

	beat(4000, (s) => {
		find(s, "Pagination for /orbits").agents.push({ ...agent("reviewer", "Review page two"), id: "demo-agent-hired-1", lastWriteAt: at(4000) });
		s.sessions.push(session("Hotfix: cursor", "orbit-kit", "busy", 0, { branch: "fix/cursor", startedAt: at(3900), stateSince: at(3900) }));
	});
	beat(8000, (s) => {
		const flaky = find(s, "Flaky login test");
		flaky.state = "idle";
		flaky.waiting = { reason: "permission", since: at(7900), source: "hook" };
		flaky.agents[0]!.commands = { failStreak: 2, repeats: 1, failed: 2, testsFailed: 2, last: { kind: "test", exitCode: 1, at: at(7800) } };
	});
	beat(12000, (s) => {
		const ship = find(s, "Ship release 2.4");
		ship.prs = [{ number: 219, url: "https://example.invalid/pull/219", at: at(11900) }];
		ship.agents = ship.agents.filter((a) => a.role !== "Explore");
	});
	beat(17000, (s) => {
		const flaky = find(s, "Flaky login test");
		flaky.state = "busy";
		flaky.waiting = undefined;
		const orbit = find(s, "Pagination for /orbits");
		const r = orbit.agents.find((a) => a.id === "demo-agent-hired-1")!;
		r.status = "finished";
		s.sessions = s.sessions.filter((x) => x.title !== "Webhook spike");
	});
	beat(23000, (s) => {
		const hot = find(s, "Hotfix: cursor");
		hot.running = { tool: "Bash", since: at(23000) - 25 * 60_000, kind: "build" };
	});
	return steps;
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
		case "release":
			return { snapshot: release(), signs: {} };
		case "crowd-idle":
			return { snapshot: asleep(crowd()), signs: {} };
		// Nobody's in; and nobody's in because no coding agent was found (the shell says which).
		case "empty":
		case "nohome":
			return { snapshot: { at: NOW, sessions: [] }, signs: {} };
		default:
			return { snapshot: floorBusy(), signs: FLOOR_BUSY_SIGNS };
	}
}

/** The busy demo, for tests that edit it. */
export const demoSnapshot = floorBusy();
