// Invented days, for working on the scene without real sessions: open the scene with ?demo (in the
// app, or in any browser through Vite). Every project, title and person here is made up.
//   ?demo         FloorBusy's afternoon: a release crew, a PR party, idle rooms and a coffee queue
//   ?demo=idle    the same office after hours: everyone idle, every agent finished
//   ?demo=one     a single session
//   ?demo=thirty  thirty sessions over eight projects
//   ?demo=release a release with six builders: they walk to the room's stations for their work and
//                 queue for them, a long build feuds with the copier, one is on the phone, the work
//                 heats up into a rush (runs, papers flying, the lead dashing about, walkers dodging),
//                 a folder is handed over, a test goes red at the stamp desk, one finishes, a PR is
//                 walked to the outbox; builders carry bricks to their crew build (and a two-builder
//                 hotfix next door shares the stations)
//   ?demo=story   story and continuity: a red streak goes green, a merged PR's reply is fetched from
//                 the outbox, a long session is waved off; the rooms wear a week of decor from an
//                 invented diary (`__busybodies.away(ms)` then shows "while you were out")
//   ?demo=stock   someone else's setup: stock subagent types, terminal sessions, no desktop app
//   ?demo=empty   nobody's in; ?demo=nohome: no coding agent found (add &compact for the small window)
// The clock is fixed, so the same demo always draws the same frames.
import type { SignText } from "../scene/office/paper";
import { sassFor } from "../scene/sass/bank";
import { type Line, LINES, linesIn } from "../scene/sass/lines";
import { fill } from "../scene/sass/scheduler";
import { signText } from "../scene/sass/voice";
import { DEFAULT_THEME, type ThemeId } from "../themes/ids";
import { type Diary, DIARY_KINDS, type DiaryDay, localDay, projectKey } from "../shared/diary";
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

/** A context this full of a 1M window, as of `at` (metrics: the in-tray). */
const ctx = (share: number, at = NOW) => ({ used: Math.round(share * 1_000_000), window: 1_000_000, at });
/** A last test result (metrics: the desk's lamp). */
const tested = (ok: boolean, at = min(2)): Agent["commands"] => ({
	failStreak: ok ? 0 : 1,
	repeats: 1,
	failed: ok ? 0 : 1,
	testsFailed: ok ? 0 : 1,
	last: { kind: "test", exitCode: ok ? 0 : 1, at },
});

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
				// Nearly out of room: papers sliding off its in-tray.
				family: "opus",
				context: ctx(0.93),
				changes: { files: 34, added: 1240, removed: 380 },
				todos: { pending: 3, active: 2, done: 6 },
				cost: { outputTokens: 520_000 },
				agents: [
					agent("scout", "Find callers of saveDraft", "running", [
						agent("scout", "Also find callers", "running", [agent("scout", "Actually looking")]),
					]),
					agent("reviewer", "PR #212, round 2"),
					agent("designer", "Empty state for exports"),
					agent("verifier", "Staging walkthrough", "stalled"),
					agent("Explore", "Map the export module", "finished"),
					agent("scout", "Count the flags", "finished"),
				],
				children: [
					session("Export endpoint", "lanternfish", "busy", 200, {
						worktree: "export-endpoint",
						family: "sonnet",
						context: ctx(0.42),
						changes: { files: 6, added: 140, removed: 20 },
						commands: tested(true),
						agents: [agent("verifier", "Run export tests")],
					}),
					session("Settings screen", "lanternfish", "busy", 190, {
						worktree: "settings-screen",
						family: "haiku",
						context: ctx(0.18),
						agents: [agent("scout", "Where is the toggle read?")],
					}),
					session("Fork: slow CI?", "lanternfish", "idle", 150, { branch: "fork/slow-ci" }),
				],
			}),
			session("Flaky login test", "lanternfish", "busy", 100, {
				branch: "fix/flaky-login",
				family: "sonnet",
				context: ctx(0.55),
				agents: [agent("verifier", "Same red. Hello again.")],
			}),
			session("Pagination for /orbits", "orbit-kit", "busy", 260, {
				branch: "feat/pagination",
				// Over 80%: papers sliding off. It compacts at +17 s and walks the pile to the shredder.
				family: "haiku",
				context: ctx(0.86),
				compactions: { count: 1, lastAt: min(90) },
				changes: { files: 12, added: 260, removed: 90 },
				todos: { pending: 3, active: 1, done: 2 },
				cost: { outputTokens: 210_000 },
				commands: tested(true),
				agents: [agent("builder", "Page two"), agent("verifier", "Page two loads"), agent("verifier", "Old cursor test", "finished")],
			}),
			session("Rename everything", "orbit-kit", "busy", 90, {
				branch: "chore/rename",
				family: "fable",
				context: ctx(0.3),
				changes: { files: 48, added: 60, removed: 610 },
				agents: [agent("scout", "Find usages of paginate")],
			}),
			session("Crumb cache rewrite", "breadbox", "idle", 240, { branch: "crumb-cache", agents: [agent("scout", "Paused by you", "stalled")] }),
			session("Changelog draft", "mossy-docs", "idle", 230, { branch: "docs/changelog", agents: [agent("builder", "Sent home by you", "stopped")] }),
			// Buried to the eyebrows in its in-tray.
			session("Docs sweep", "mossy-docs", "busy", 60, {
				branch: "docs/sweep",
				family: "sonnet",
				context: ctx(0.97),
				changes: { files: 22, added: 90, removed: 40 },
				cost: { outputTokens: 160_000 },
			}),
			session("Webhook spike", "kettle-api", "idle", 210, { branch: "spike/webhooks" }),
		],
	};
}

/** What the sass engine would have written on the walls by now that is the same in any theme
 * (lines from design/boards/Lines). */
const FLOOR_BUSY_SIGNS: Record<string, SignText> = {
	"room:orbit-kit:board": { title: "PAGE 2 LOADS", body: "Nobody touch anything." },
	"meeting:board": { title: "PR #212 · round 2", body: "Same diff. Same no." },
};

/** The first room sign `theme`'s bank says for a trigger, as the voice would write it. */
function roomSign(theme: ThemeId, trigger: Line["trigger"]): SignText {
	const l = sassFor(theme).lines.find((x) => x.trigger === trigger && x.place === "sign");
	return signText(l?.text ?? trigger);
}

/** A bank line's sign as `theme` words it (sass/lines.ts `themed`), `{min}` filled in. */
function bankSign(theme: ThemeId, office: string, idleMin = 0): SignText {
	const i = LINES.findIndex((l) => l.text === office);
	const text = i < 0 ? office : linesIn(theme)[i]!.text;
	return signText(text.replace("{min}", String(idleMin)));
}

/** FloorBusy's walls in `theme`'s words: the bank's lines follow the theme, the rest are neutral. */
const floorBusySigns = (theme: ThemeId): Record<string, SignText> => ({
	...FLOOR_BUSY_SIGNS,
	// The counters' signs and the room signs in the theme's own words (sass/bank.ts, signs.ts).
	"room:lanternfish:board": { ...signText(fill(sassFor(theme).counters.daysSince, { n: 0 })!), body: "previous records: 3, 1, 2" },
	"room:orbit-kit:sign": signText(fill(sassFor(theme).counters.prTally, { count: 4 })!),
	"room:lanternfish:sign": roomSign(theme, "hiring"),
	"room:mossy-docs:sign": roomSign(theme, "compacting"),
	"room:breadbox:sign": bankSign(theme, "Now serving: nobody. Your number: 1."),
	"room:kettle-api:sign": bankSign(theme, "Idle: {min} min. Plant: also idle.", 31),
});

/** The same office after hours: every session idle, every agent finished. */
const asleep = (snap: Snapshot): Snapshot => {
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
 * seconds before anyone walks for it (three in a rush), so the first trips set off at 6 s.
 */
const RELEASE_SCRIPT: [task: string, script: Script][] = [
	// Edits all day, at its bench: the brick runs.
	["Bump the versions", () => ({ tool: "Edit" })],
	// Reads at the filing cabinet from 6 s; back to write at 18 s, it hands its folder on.
	["Changelog entries", (t) => (t < 18 ? { tool: "Read" } : { tool: "Edit" })],
	// Runs the export test: at the stamp desk from 9 s; red at 21 s (a red stamp, then the thumb).
	["Fix the export test", (t) => (t < 3 ? { tool: "Grep" } : t < 21 ? { tool: "Bash", run: "test" } : t < 24 ? { tool: "Bash" } : { tool: "Edit" })],
	// Reads too: queues at the filing cabinet behind the changelog, gives up to write at 12 s; wants
	// to read again at 18 s, just as the changelog comes back, and takes its folder instead.
	["Migrate the settings", (t) => (t < 12 ? { tool: "Read" } : t < 18 ? { tool: "Edit" } : t < 30 ? { tool: "Read" } : { tool: "Edit" })],
	// A build 25 minutes in: at the copier from 6 s, feuding with it; fixed at 27 s.
	["Build the installer", (t) => (t < 27 ? { tool: "Bash", run: "build" } : { tool: "Edit" })],
	// Writes, then searches the web on the phone from 12 s, writes again at 21 s, finishes at 24 s.
	["Release notes", (t) => (t < 9 ? { tool: "Write" } : t < 21 ? { tool: "WebSearch" } : t < 24 ? { tool: "Edit" } : "done")],
];
/** The release crew's tool rate (calls a minute, each): it heats up into a rush at 6 s, and cools
 * from 27 s (the rush ends once the heat has dropped below the line, rush.ts). */
const releaseRate = (t: number) => (t < 6 ? 6 : t < 27 ? 16 : 2);
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

/** A crew of mixed models: each family walks and works at its own pace (director/traits.ts). */
const FAMILIES: Agent["family"][] = ["haiku", "sonnet", "opus", "fable", "haiku", "sonnet"];

const crewOf = (script: [string, Script][], rate: number) =>
	script.map(([task, play], i) => {
		const a: Agent = {
			...agent("general-purpose", task),
			tools: { calls: rate, errors: 0, windowMs: 60_000 },
			family: FAMILIES[i % FAMILIES.length],
			changes: { files: 2 + i, added: 30 + i * 12, removed: 6 + i * 3 },
		};
		perform(a, play(0), min(0.05 + i * 0.1), true);
		return a;
	});

/** A release crew: a lead waiting on six builders, each on its own errand. */
function release(): Snapshot {
	n = 0;
	const crew = crewOf(RELEASE_SCRIPT, releaseRate(0));
	// The installer build has been going a while: long enough to jam the copier.
	crew[4]!.running = { tool: "Bash", since: min(25), kind: "build" };
	return {
		at: NOW,
		sessions: [
			session("Ship release 3.0", "lanternfish", "busy", 40, {
				branch: "release/3.0",
				activity: { tool: "Task", at: min(1) },
				running: { tool: "Task", since: min(1) },
				// A deliberate lead, its in-tray nearly full (papers sliding off); it compacts at 12 s.
				family: "opus",
				context: ctx(0.88),
				compactions: { count: 0 },
				todos: { pending: 4, active: 1, done: 2 },
				cost: { outputTokens: 380_000 },
				agents: crew,
			}),
			// A second, smaller crew next door: its own brick runs, on its own cooldown.
			session("Hotfix: installer", "lanternfish", "busy", 20, {
				branch: "fix/installer",
				activity: { tool: "Task", at: min(0.5) },
				running: { tool: "Task", since: min(0.5) },
				family: "haiku",
				context: ctx(0.35),
				commands: tested(true),
				cost: { outputTokens: 120_000 },
				agents: crewOf(HOTFIX_SCRIPT, 20),
			}),
			session("Docs sweep", "mossy-docs", "idle", 60, {
				branch: "docs/sweep",
				family: "fable",
				context: ctx(0.22),
				changes: { files: 9, added: 120, removed: 45 },
			}),
		],
	};
}

/**
 * The release, played forward: a beat every 3 s. Crew walk to the stations their work needs and
 * queue when one is taken (filing cabinet and copier); the long build feuds with the copier; one
 * searches the web on the phone; from 6 s the room is in a rush (walkers run with papers flying,
 * sidestep each other, and the lead dashes to whoever is queued or red); at 18 s a folder is handed
 * over instead of a second trip to the cabinet; a test goes red at the stamp desk at 21 s; a builder
 * finishes at 24 s; the PR goes up at 30 s and the lead walks it to the outbox. Edits keep landing,
 * so bricks run to the builds. Every name is invented.
 */
export function releaseDay(): { after: number; snapshot: Snapshot }[] {
	let snap = release();
	const steps: { after: number; snapshot: Snapshot }[] = [];
	for (let i = 1; i <= 12; i++) {
		const t = i * 3;
		snap = structuredClone(snap);
		const at = NOW + t * 1000;
		snap.at = at;
		const [ship, hotfix, docs] = snap.sessions as [Session, Session, Session];
		ship.agents.forEach((a, k) => {
			perform(a, RELEASE_SCRIPT[k]![1](t), at - k * 50, (i + k) % 2 === 0);
			if (a.tools) a.tools = { ...a.tools, calls: releaseRate(t) };
		});
		hotfix.agents.forEach((a, k) => perform(a, HOTFIX_SCRIPT[k]![1](t), at - 1500 - k * 50, (i + k) % 2 === 0));
		// Every edit adds lines: the towers count them.
		for (const a of [...ship.agents, ...hotfix.agents])
			if (a.activity && a.activity.at > at - 3000 && /Edit|Write/.test(a.activity.tool))
				a.changes = { ...a.changes!, added: a.changes!.added + 14, removed: a.changes!.removed + 3 };
		if (t === 21) ship.agents[2]!.commands = { failStreak: 1, repeats: 1, failed: 1, testsFailed: 1, last: { kind: "test", exitCode: 1, at } };
		if (t === 30) ship.prs = [{ number: 300, url: "https://example.invalid/pull/300", at }];
		// The in-tray fills until it buries the lead at 9 s; a compaction at 12 s sends it to the shredder (back well before the PR at 30 s).
		if (t < 12) ship.context = ctx(Math.min(0.97, 0.88 + t * 0.01), at);
		if (t === 12) {
			ship.compactions = { count: 1, lastAt: at - 200, trigger: "auto" };
			ship.context = ctx(0.08, at - 200);
		}
		// Todos done at 9 s and 21 s: a crew member walks each note to the planner.
		if (t === 9) ship.todos = { pending: 3, active: 1, done: 3 };
		if (t === 21) ship.todos = { pending: 2, active: 1, done: 4 };
		// Two sessions wait on you: they queue at your office, the first one in rings the bell.
		if (t === 6) docs.waiting = { reason: "permission", since: at - 300, source: "hook" };
		if (t === 12) hotfix.waiting = { reason: "question", since: at - 300, source: "transcript" };
		if (t === 30) hotfix.waiting = undefined;
		steps.push({ after: t * 1000, snapshot: snap });
	}
	return steps;
}

/**
 * Someone else's setup: the agent tool's own subagent types only (general-purpose, Explore, Plan),
 * terminal sessions with no desktop app, so no titles from it, and branches from git. The crew's
 * costumes come from what each one was asked to do.
 */
export function stock(): Snapshot {
	n = 0;
	const cli = (title: string, project: string, state: string, started: number, extra: Partial<Session> = {}) =>
		session(title, project, state, started, { origin: "cli", ...extra });
	return {
		at: NOW,
		sessions: [
			cli("breadbox", "breadbox", "busy", 50, {
				branch: "main",
				agents: [
					agent("general-purpose", "Find where the crust timer is set"),
					agent("general-purpose", "Fix the timer rounding"),
					agent("general-purpose", "Review the diff for regressions"),
					agent("Explore", "Explore the oven module"),
				],
			}),
			cli("breadbox", "breadbox", "busy", 20, {
				worktree: "loaf-sizes",
				branch: "loaf-sizes",
				agents: [agent("Plan", "Plan the loaf size migration"), agent("general-purpose", "Run the tests and confirm they pass")],
			}),
			cli("orbit-kit", "orbit-kit", "busy", 35, {
				branch: "fix/drift",
				agents: [agent("general-purpose", "Implement drift correction"), agent("claude-code-guide", "Look up how hooks are configured", "finished")],
			}),
			cli("mossy-docs", "mossy-docs", "idle", 90, { branch: "main" }),
		],
	};
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
		const orbit = find(s, "Pagination for /orbits");
		orbit.agents.push({ ...agent("reviewer", "Review page two"), id: "demo-agent-hired-1", lastWriteAt: at(4000) });
		// A todo done: the builder walks its note to the planner.
		orbit.todos = { pending: 2, active: 1, done: 3 };
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
		// A second session waits on you: two in the queue at your office.
		const rename = find(s, "Rename everything");
		rename.state = "idle";
		rename.waiting = { reason: "question", since: at(11800), source: "transcript" };
	});
	beat(17000, (s) => {
		const flaky = find(s, "Flaky login test");
		flaky.state = "busy";
		flaky.waiting = undefined;
		const orbit = find(s, "Pagination for /orbits");
		const r = orbit.agents.find((a) => a.id === "demo-agent-hired-1")!;
		r.status = "finished";
		// A compaction: the pile goes to the shredder.
		orbit.compactions = { count: 2, lastAt: at(16900), trigger: "auto" };
		orbit.context = ctx(0.09, at(16900));
		s.sessions = s.sessions.filter((x) => x.title !== "Webhook spike");
	});
	beat(23000, (s) => {
		const hot = find(s, "Hotfix: cursor");
		hot.running = { tool: "Bash", since: at(23000) - 25 * 60_000, kind: "build" };
		const rename = find(s, "Rename everything");
		rename.state = "busy";
		rename.waiting = undefined;
	});
	return steps;
}

/** The story demo's office: a release with a PR up and a verifier on a red streak; a long refactor
 * winding down next door, with a teammate to wave it off. */
function story(): Snapshot {
	const red = (k: number, at: number): Agent["commands"] => ({
		failStreak: k,
		repeats: 1,
		failed: k,
		testsFailed: k,
		last: { kind: "test", exitCode: 1, at },
	});
	const kettle = session("Ship the whistle", "kettle-works", "busy", 50, {
		branch: "release/whistle",
		prs: [{ number: 31, url: "https://example.invalid/pull/31", state: "OPEN", at: min(4) }],
		agents: [agent("general-purpose", "Tune the spout"), { ...agent("verifier", "Run the kettle tests"), commands: red(1, min(1)) }],
	});
	const long = session("Long refactor of the saucers", "teacup", "idle", 200, { branch: "refactor/saucers" });
	const mate = session("Tidy the cupboard", "teacup", "idle", 40, { branch: "tidy" });
	// Fixed ids, so the story day's beats are the same sessions however often this is built.
	kettle.id = "demo-story-kettle";
	kettle.agents.forEach((a, i) => (a.id = `demo-story-crew-${i}`));
	long.id = "demo-story-long";
	mate.id = "demo-story-mate";
	return { at: NOW, sessions: [kettle, long, mate] };
}

/**
 * The story demo's beats, a few seconds apart:
 *   +3 s   the verifier's test goes red again: a streak
 *   +6 s   and green: the redemption (a flourish; the crew look up)
 *   +9 s   PR 31 is merged: the lead fetches the reply from the outbox
 *   +18 s  the long refactor ends: the room waves it off
 */
export function storyDay(): { after: number; snapshot: Snapshot }[] {
	const steps: { after: number; snapshot: Snapshot }[] = [];
	let snap = story();
	const beat = (after: number, change: (s: Snapshot) => void) => {
		snap = structuredClone(snap);
		snap.at = NOW + after;
		change(snap);
		steps.push({ after, snapshot: snap });
	};
	const kettle = (s: Snapshot) => s.sessions.find((x) => x.project === "kettle-works")!;
	beat(3000, (s) => {
		kettle(s).agents[1]!.commands = { failStreak: 2, repeats: 1, failed: 2, testsFailed: 2, last: { kind: "test", exitCode: 1, at: NOW + 2900 } };
	});
	beat(6000, (s) => {
		kettle(s).agents[1]!.commands = { failStreak: 0, repeats: 1, failed: 2, testsFailed: 2, last: { kind: "test", exitCode: 0, at: NOW + 5900 } };
	});
	beat(9000, (s) => {
		kettle(s).prs = [{ number: 31, url: "https://example.invalid/pull/31", state: "MERGED", at: min(4) }];
	});
	beat(18000, (s) => {
		s.sessions = s.sessions.filter((x) => x.title !== "Long refactor of the saucers");
	});
	return steps;
}

/**
 * An invented week in the diary for the demo's projects (the six days before the demo's day): a
 * few PRs merged, a red streak fixed, days in. Today fills in from the demo's own snapshots.
 */
export function demoDiary(snapshot: Snapshot): Diary {
	const projects = [...new Set(snapshot.sessions.map((s) => s.project))].sort();
	const days: Record<string, DiaryDay> = {};
	for (let back = 6; back >= 1; back--) {
		const key = localDay(NOW - back * 24 * 3_600_000);
		const d: DiaryDay = { counts: {}, projects: {}, regulars: [], marks: [] };
		for (const [i, p] of projects.entries()) {
			// Not every project comes in every day: a pattern from its place in the list.
			if ((back + i) % 3 === 0) continue;
			const k = projectKey(p);
			const c = {
				sessions: 1 + ((back + i) % 3),
				prsOpened: (back + i) % 2,
				prsMerged: (back * (i + 1)) % 3 === 1 ? 1 : 0,
				testsRed: (back + 2 * i) % 4,
				redeemed: back === 2 + (i % 3) ? 1 : 0,
			};
			d.projects[k] = Object.fromEntries(Object.entries(c).filter(([, v]) => v > 0));
			for (const kind of DIARY_KINDS) if (d.projects[k]![kind]) d.counts[kind] = (d.counts[kind] ?? 0) + d.projects[k]![kind]!;
			d.regulars.push(`${k}:lead`);
			// Some days the crew came in too: regulars you'd know by name.
			if ((back + i) % 2 === 0) d.regulars.push(`${k}:builder`, `${k}:verifier`);
		}
		d.regulars.sort();
		days[key] = d;
	}
	return { v: 1, days };
}

export interface DemoDay {
	snapshot: Snapshot;
	signs: Record<string, SignText>;
}

export function demo(name: string | null, theme: ThemeId = DEFAULT_THEME): DemoDay {
	switch (name) {
		case "idle":
			return { snapshot: asleep(floorBusy()), signs: floorBusySigns(theme) };
		case "one":
			return { snapshot: one(), signs: {} };
		case "thirty":
			return { snapshot: thirty(), signs: {} };
		case "crowd":
			return { snapshot: crowd(), signs: {} };
		case "release":
			return { snapshot: release(), signs: {} };
		case "story":
			return { snapshot: story(), signs: {} };
		case "stock":
			return { snapshot: stock(), signs: {} };
		case "crowd-idle":
			return { snapshot: asleep(crowd()), signs: {} };
		// Nobody's in; and nobody's in because no coding agent was found (the shell says which).
		case "empty":
		case "nohome":
			return { snapshot: { at: NOW, sessions: [] }, signs: {} };
		default:
			return { snapshot: floorBusy(), signs: floorBusySigns(theme) };
	}
}
