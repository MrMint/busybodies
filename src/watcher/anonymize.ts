// Turns real snapshots into shareable ones. Every title, path, branch, id, task and repository is
// replaced with an invented name; times are shifted to a fixed day. The same input always gets
// the same names, in order of first appearance, so the structure of a day (who spawned whom, which
// sessions share a project) survives. Counters, states, tool names and kinds stay as they are; the
// count-only fields (context, changes, todos, tool rate) are rebuilt field by field, so nothing
// but their numbers and a known model family can ride along.
import type { Agent, Changes, Context, ModelFamily, PullRequest, RunningTool, Session, Snapshot, Todos, ToolRate } from "./model";
import { count } from "./read";

/** Recordings start at this instant, whatever day they were made. */
export const RECORDING_EPOCH = Date.parse("2030-01-07T09:00:00Z");

const PROJECTS = ["teapot", "lantern", "greenhouse", "pedal", "pantry", "kettle", "bramble", "quill", "marmalade", "thimble", "biscuit", "compass", "saucer", "wicker", "pebble", "juniper"];
const WORDS = ["spring", "timer", "gauge", "menu", "crumb", "steam", "lid", "spout", "handle", "cosy", "brew", "pour", "saucer", "sugar", "tray", "leaf"];
const VERBS = ["Fix", "Tidy", "Port", "Draw", "Check", "Rename", "Speed up", "Untangle", "Polish", "Sketch"];
/** Agent roles the agent tool ships with; custom ones are renamed. */
const BUILTIN_ROLES = new Set(["general-purpose", "Explore", "Plan", "statusline-setup", "claude-code-guide", "agent", "fork", "claude"]);
const ROLES = ["stream-builder", "scout", "reviewer", "verifier", "designer", "sweeper", "surveyor", "builder"];
const MODELS = /^(opus|sonnet|haiku|fable|claude-[a-z0-9.-]+|inherit)$/i;
const FAMILIES = new Set<ModelFamily>(["fable", "opus", "sonnet", "haiku", "other"]);

/** A count: a finite, non-negative whole number, or 0. */
const n = (v: unknown) => Math.round(count(v));
const family = (f: unknown) => (FAMILIES.has(f as ModelFamily) ? { family: f as ModelFamily } : {});
const changes = (c: Changes): Changes => ({ files: n(c.files), added: n(c.added), removed: n(c.removed) });
const todos = (t: Todos): Todos => ({ pending: n(t.pending), active: n(t.active), done: n(t.done) });
const tools = (t: ToolRate): ToolRate => ({ calls: n(t.calls), errors: n(t.errors), windowMs: n(t.windowMs) });

/** One anonymizer per recording: it remembers the names it gave out. */
export class Anonymizer {
	#names = new Map<string, Map<string, string>>();
	#shift?: number;

	#name(kind: string, real: string, make: (i: number) => string): string {
		let m = this.#names.get(kind);
		if (!m) this.#names.set(kind, (m = new Map()));
		let v = m.get(real);
		if (v === undefined) m.set(real, (v = make(m.size)));
		return v;
	}

	#t = (t: number) => t + this.#shift!;

	project = (p: string) => this.#name("project", p, (i) => PROJECTS[i % PROJECTS.length]! + (i >= PROJECTS.length ? `-${Math.floor(i / PROJECTS.length) + 1}` : ""));
	#pick = (list: string[], i: number) => list[i % list.length]!;
	#phrase = (i: number) => `${this.#pick(VERBS, i)} the ${this.#pick(WORDS, i * 7 + 3)} ${this.#pick(WORDS, i * 3 + 1)}`;

	snapshot(s: Snapshot): Snapshot {
		this.#shift ??= RECORDING_EPOCH - s.at;
		return { at: this.#t(s.at), sessions: s.sessions.map((x) => this.#session(x)) };
	}

	#session(s: Session): Session {
		const project = this.project(s.project);
		const worktree = s.worktree !== undefined ? this.#name("worktree", s.worktree, (i) => `${this.#pick(WORDS, i)}-${this.#pick(WORDS, i * 5 + 2)}`) : undefined;
		const out: Session = {
			id: this.#name("session", s.id, (i) => `rec-session-${i + 1}`),
			pid: Number(this.#name("pid", String(s.pid), (i) => String(4000 + i))),
			title: this.#name("title", s.title, (i) => this.#phrase(i)),
			cwd: `/Users/you/code/${project}${worktree ? `/.claude/worktrees/${worktree}` : ""}`,
			project,
			...(worktree !== undefined ? { worktree } : {}),
			...(s.branch !== undefined ? { branch: this.#name("branch", s.branch, (i) => (i === 0 ? "main" : `${this.#pick(["fix", "feat", "chore", "release"], i)}/${this.#pick(WORDS, i * 3)}`)) } : {}),
			origin: /^[a-z-]{1,24}$/.test(s.origin) ? s.origin : "unknown",
			state: /^[a-z-]{1,24}$/.test(s.state) ? s.state : "unknown",
			stateSince: this.#t(s.stateSince),
			startedAt: this.#t(s.startedAt),
			...(s.activity ? { activity: { tool: tool(s.activity.tool), at: this.#t(s.activity.at) } } : {}),
			...(s.running ? { running: this.#running(s.running) } : {}),
			...(s.commands ? { commands: { ...s.commands, ...(s.commands.last ? { last: { ...s.commands.last, at: this.#t(s.commands.last.at) } } : {}) } } : {}),
			...(s.waiting ? { waiting: { ...s.waiting, since: this.#t(s.waiting.since) } } : {}),
			...(s.prs ? { prs: s.prs.map((p) => this.#pr(p)) } : {}),
			...(s.compactions ? { compactions: { ...s.compactions, ...(s.compactions.lastAt !== undefined ? { lastAt: this.#t(s.compactions.lastAt) } : {}) } } : {}),
			...(s.cost ? { cost: { ...s.cost } } : {}),
			...(s.apiRetry ? { apiRetry: { ...s.apiRetry, at: this.#t(s.apiRetry.at) } } : {}),
			...family(s.family),
			...(s.context ? { context: this.#context(s.context) } : {}),
			...(s.changes ? { changes: changes(s.changes) } : {}),
			...(s.todos ? { todos: todos(s.todos) } : {}),
			...(s.tools ? { tools: tools(s.tools) } : {}),
			agents: s.agents.map((a) => this.#agent(a)),
			children: s.children.map((c) => this.#session(c)),
		};
		return out;
	}

	#agent(a: Agent): Agent {
		return {
			id: this.#name("agent", a.id, (i) => `rec-agent-${i + 1}`),
			role: BUILTIN_ROLES.has(a.role) ? a.role : this.#name("role", a.role, (i) => this.#pick(ROLES, i)),
			task: this.#name("task", a.task, (i) => this.#phrase(i + 5)),
			...(a.model !== undefined ? { model: MODELS.test(a.model) ? a.model : "model" } : {}),
			depth: a.depth,
			status: a.status,
			lastWriteAt: this.#t(a.lastWriteAt),
			...(a.activity ? { activity: { tool: tool(a.activity.tool), at: this.#t(a.activity.at) } } : {}),
			...(a.running ? { running: this.#running(a.running) } : {}),
			...(a.commands ? { commands: { ...a.commands, ...(a.commands.last ? { last: { ...a.commands.last, at: this.#t(a.commands.last.at) } } : {}) } } : {}),
			...family(a.family),
			...(a.changes ? { changes: changes(a.changes) } : {}),
			...(a.tools ? { tools: tools(a.tools) } : {}),
			children: a.children.map((c) => this.#agent(c)),
		};
	}

	#context(c: Context): Context {
		return { used: n(c.used), ...(c.window !== undefined ? { window: n(c.window) } : {}), at: this.#t(c.at) };
	}

	#running(r: RunningTool): RunningTool {
		return { ...r, tool: tool(r.tool), since: this.#t(r.since) };
	}

	#pr(p: PullRequest): PullRequest {
		const repo = this.#name("repo", p.repo ?? p.url.replace(/\/pull\/\d+.*$/, ""), (i) => `example/${this.#pick(PROJECTS, i)}`);
		const number = Number(this.#name("pr", p.url, (i) => String(100 + i)));
		return {
			number,
			url: `https://github.com/${repo}/pull/${number}`,
			repo,
			...(p.state !== undefined ? { state: p.state } : {}),
			...(p.at !== undefined ? { at: this.#t(p.at) } : {}),
		};
	}
}

/** Built-in tool names are kept; an MCP tool's name says which servers someone has, so it isn't. */
const tool = (name: string) => (/^mcp__/.test(name) ? "mcp" : /^[A-Z][A-Za-z]{1,30}$/.test(name) ? name : "tool");
