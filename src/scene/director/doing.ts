// What each character is doing right now, in words and a glyph, for the closer camera stops: the
// chip over a subagent's head in a room, its tag at the desk, and the card a click opens. Pixi-free,
// from the snapshot alone: a tool's name and kind, never its input (paths and commands stay in the
// watcher).
import type { Agent, CommandKind, RunningTool, Session, Snapshot } from "../../watcher/model";
import { flatSessions } from "../../watcher/model";
import { plumpOf, share } from "../rig/data/plump";
import { MIN } from "../../shared/time";
import type { Doing, DoingIcon } from "../contract";

/** One character's details, for the card a click opens. Counts and kinds only, plus the task. */
export interface Dossier {
	key: string;
	kind: "lead" | "crew";
	/** The agent type, or "lead". */
	role: string;
	/** The agent's task, or the session's title. */
	task: string;
	status: string;
	family?: string;
	/** How full its context is, 0 to 1, when its window is known. */
	context?: number;
	plump?: number;
	doing: Doing;
	/** Tool calls and failed results in the last few minutes. */
	calls?: number;
	errors?: number;
	files?: number;
	added?: number;
	removed?: number;
	/** Who spawned it: the boss's role and task. */
	boss?: { key: string; role: string; task: string };
	/** How many it has spawned that are still out. */
	crew: number;
	/** The red streak, when its last test failed. */
	failStreak?: number;
	/** How long it has been going, ms. */
	age?: number;
	depth?: number;
}

const DOING = {
	/** A call this old shows its time on the chip. */
	longMin: 2,
} as const;

const EDIT = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const SEARCH = new Set(["Grep", "Glob", "LS", "ToolSearch"]);
const WEB = new Set(["WebFetch", "WebSearch"]);
const HIRE = new Set(["Task", "Agent"]);
const PLAN = new Set(["TodoWrite", "ExitPlanMode", "EnterPlanMode"]);
const ASK = new Set(["AskUserQuestion"]);

const RUN_WORD: Record<CommandKind, [DoingIcon, string]> = {
	test: ["test", "running tests"],
	build: ["run", "building"],
	install: ["run", "installing"],
	git: ["run", "using git"],
	other: ["run", "running a command"],
};

/** The icon and verb for a tool by name (and a shell command's kind). */
export function toolDoing(tool: string, kind?: CommandKind): [DoingIcon, string] {
	if (tool === "Read") return ["read", "reading"];
	if (EDIT.has(tool)) return ["edit", tool === "Write" ? "writing" : "editing"];
	if (SEARCH.has(tool)) return ["search", "searching"];
	if (tool === "Bash") return RUN_WORD[kind ?? "other"];
	if (WEB.has(tool)) return ["web", "on the web"];
	if (HIRE.has(tool)) return ["hire", "delegating"];
	if (PLAN.has(tool)) return ["plan", "planning"];
	if (ASK.has(tool)) return ["ask", "asking you"];
	return ["tool", "using a tool"];
}

function doingOf(busy: boolean, running: RunningTool | undefined, last: string | undefined, now: number, status?: string): Doing {
	if (status === "finished" || status === "stopped") return { icon: "done", word: "finished", long: false };
	if (status === "stalled") return { icon: "wait", word: "stalled", long: false };
	if (running) {
		const [icon, word] = toolDoing(running.tool, running.kind);
		return { icon, word, since: running.since, long: now - running.since >= DOING.longMin * MIN };
	}
	if (busy && last) {
		const [icon, word] = toolDoing(last);
		return { icon, word, long: false };
	}
	return busy ? { icon: "plan", word: "thinking", long: false } : { icon: "idle", word: "idle", long: false };
}

/** Every character's dossier this snapshot, by character key (`s:<id>`, `a:<session>:<agent>`). */
export function dossiers(snap: Snapshot): Map<string, Dossier> {
	const out = new Map<string, Dossier>();
	const now = snap.at;
	for (const s of flatSessions(snap.sessions)) addSession(out, s, now);
	return out;
}

function addSession(out: Map<string, Dossier>, s: Session, now: number): void {
	const key = `s:${s.id}`;
	const busy = s.state === "busy";
	out.set(key, {
		key,
		kind: "lead",
		role: "lead",
		task: s.title,
		status: s.waiting ? "waiting on you" : s.state,
		...(s.family ? { family: s.family } : {}),
		...ctx(s.context),
		doing: s.waiting ? { icon: "ask", word: "waiting on you", long: false } : doingOf(busy, s.running, s.activity?.tool, now),
		...rate(s.tools),
		...changes(s.changes),
		crew: s.agents.filter((a) => a.status === "running").length,
		...(s.commands?.failStreak ? { failStreak: s.commands.failStreak } : {}),
		age: now - s.startedAt,
	});
	const visit = (list: Agent[], boss: Dossier) => {
		for (const a of list) {
			const k = `a:${s.id}:${a.id}`;
			const d: Dossier = {
				key: k,
				kind: "crew",
				role: a.role,
				task: a.task,
				status: a.status,
				...(a.family ? { family: a.family } : {}),
				...ctx(a.context),
				doing: doingOf(a.status === "running", a.running, a.activity?.tool, now, a.status),
				...rate(a.tools),
				...changes(a.changes),
				boss: { key: boss.key, role: boss.role, task: boss.task },
				crew: a.children.filter((c) => c.status === "running").length,
				...(a.commands?.failStreak ? { failStreak: a.commands.failStreak } : {}),
				depth: a.depth,
			};
			out.set(k, d);
			visit(a.children, d);
		}
	};
	visit(s.agents, out.get(key)!);
}

const ctx = (c: Session["context"]) => {
	const v = share(c);
	return v === undefined ? {} : { context: v, plump: plumpOf(c)!.level };
};
const rate = (t: Session["tools"]) => (t ? { calls: t.calls, errors: t.errors } : {});
const changes = (c: Session["changes"]) => (c ? { files: c.files, added: c.added, removed: c.removed } : {});
