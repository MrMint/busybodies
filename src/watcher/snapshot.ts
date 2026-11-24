// Builds a Snapshot from the files on disk. Reads only what the live sessions need: the registry,
// each live session's transcript tail and subagent metadata, and its desktop index entry.
import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { FileCache } from "./files";
import { gitInfo } from "./git";
import { TranscriptLedger } from "./ledger";
import { modelFamily } from "./models";
import type { Agent, AgentStatus, PullRequest, RunningTool, Session, Snapshot, Waiting } from "./model";
import {
	type DesktopEntry,
	agentMeta,
	desktopEntry,
	registryEntry,
	HOOK_DIR,
	HOOK_EVENTS,
	type HookEvent,
	type RegistryEntry,
	type Roots,
	hookEvents,
	lastToolCall,
	projectOf,
	projectSlug,
} from "./sources";
import { optional } from "./read";

/** An unfinished agent whose transcript has been quiet this long is shown as stalled. */
export const STALL_MS = 30 * 60 * 1000;
/** Finished agents stay in the snapshot this long, so the scene can see them leave. */
export const LINGER_MS = 2 * 60 * 1000;
/** A stalled agent is dropped once it has been quiet this long: by then it is surely dead. */
export const ABANDON_MS = 2 * 60 * 60 * 1000;

/** Tools that stop and wait for the person while they run. */
const WAITING_TOOLS: Record<string, Waiting["reason"]> = { AskUserQuestion: "question", ExitPlanMode: "plan" };

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

export class SnapshotBuilder {
	readonly files = new FileCache();
	#desktopDirs?: string[];
	#transcripts = new Map<string, string>();
	#ledgers = new Map<string, TranscriptLedger>();
	#ledgersUsed = new Set<string>();
	#hooks = new Map<string, HookEvent>();

	/** Folders (relative to projects/) that hold a live transcript, for narrowing the file watch. */
	liveProjectDirs = new Set<string>();
	/** Desktop index ids of live sessions. */
	liveHostIds = new Set<string>();

	constructor(
		readonly roots: Roots,
		readonly alive: (pid: number) => boolean = isAlive,
		readonly now: () => number = Date.now,
	) {}

	async build(): Promise<Snapshot> {
		const at = this.now();
		const dir = join(this.roots.home, "sessions");
		const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
		const entries = (await Promise.all(names.map((n) => this.files.json<unknown>(join(dir, n))))).map(registryEntry);
		this.#hooks =
			(await this.files.fromTail(join(this.roots.home, HOOK_DIR, HOOK_EVENTS), hookEvents, [64 * 1024])) ?? new Map();
		this.liveProjectDirs = new Set();
		this.liveHostIds = new Set();

		const byHost = new Map<string, Session>();
		const parentHost = new Map<Session, string>();
		const sessions: Session[] = [];
		for (const e of entries) {
			if (!e?.sessionId || typeof e.pid !== "number" || !e.cwd || !this.alive(e.pid)) continue;
			let desk: DesktopEntry | undefined;
			let s: Session;
			try {
				desk = e.hostSessionId ? await this.#desktop(e.hostSessionId) : undefined;
				s = await this.#session(e, desk, at);
			} catch (err) {
				// One session's odd files must never stop the whole office from updating.
				console.warn(`[busybodies] skipped a session this round: ${err instanceof Error ? err.message : err}`);
				continue;
			}
			sessions.push(s);
			if (e.hostSessionId) {
				byHost.set(e.hostSessionId, s);
				this.liveHostIds.add(e.hostSessionId);
			}
			const parent = desk?.spawnedFrom?.sessionId ?? desk?.forkedFromSessionId;
			if (parent) parentHost.set(s, parent);
		}

		const roots: Session[] = [];
		for (const s of sessions) {
			const parent = byHost.get(parentHost.get(s) ?? "");
			if (parent && parent !== s) parent.children.push(s);
			else roots.push(s);
		}
		const byStart = (a: Session, b: Session) => a.startedAt - b.startedAt;
		const sortTree = (list: Session[]) => {
			list.sort(byStart);
			list.forEach((s) => sortTree(s.children));
		};
		sortTree(roots);
		this.files.sweep();
		for (const p of this.#ledgers.keys()) if (!this.#ledgersUsed.has(p)) this.#ledgers.delete(p);
		this.#ledgersUsed.clear();
		return { at, sessions: roots };
	}

	async #session(e: RegistryEntry, desk: DesktopEntry | undefined, at: number): Promise<Session> {
		const cwd = e.cwd!;
		const transcript = await this.#transcript(e.sessionId!, cwd);
		const activity = transcript ? await this.files.fromTail(transcript, lastToolCall) : undefined;
		const ledger = transcript ? await this.#ledger(transcript) : new TranscriptLedger();
		if (transcript) this.liveProjectDirs.add(relative(join(this.roots.home, "projects"), dirname(transcript)));
		const running = ledger.running;
		const mtime = transcript ? await this.files.mtime(transcript) : undefined;
		// The agent tool's own worktree folders say their repository by path; git says it for any
		// layout, and knows the branch when the desktop app doesn't.
		const git = await gitInfo(cwd, this.files);
		const own = projectOf(cwd);
		const place = own.worktree || !git.project ? own : { project: git.project, ...optional("worktree", git.worktree) };
		return {
			id: e.sessionId!,
			pid: e.pid!,
			title: e.name ?? desk?.title ?? place.project,
			cwd,
			...place,
			branch: desk?.branch ?? git.branch,
			origin: e.entrypoint ?? "unknown",
			state: e.status ?? "unknown",
			stateSince: e.statusUpdatedAt ?? e.startedAt ?? at,
			startedAt: e.startedAt ?? at,
			activity,
			...(running ? { running } : {}),
			...(ledger.commands.repeats > 0 ? { commands: ledger.commands } : {}),
			...optional("waiting", waiting(this.#hooks.get(e.sessionId!), running, mtime)),
			prs: mergePrs(ledger.prs, desk?.prs),
			compactions: ledger.compactions,
			cost: { ...(ledger.costUSD !== undefined ? { usd: ledger.costUSD } : {}), outputTokens: ledger.outputTokens },
			...(ledger.apiRetry ? { apiRetry: ledger.apiRetry } : {}),
			...optional("family", ledger.family),
			...optional("context", ledger.context),
			...optional("changes", ledger.changes),
			...optional("todos", ledger.todos),
			...optional("tools", ledger.toolRate(at)),
			agents: transcript ? await this.#agents(transcript.replace(/\.jsonl$/, ""), at) : [],
			children: [],
		};
	}

	async #ledger(path: string): Promise<TranscriptLedger> {
		let l = this.#ledgers.get(path);
		if (!l) this.#ledgers.set(path, (l = new TranscriptLedger()));
		this.#ledgersUsed.add(path);
		const s = await this.files.stat(path);
		if (s) await l.update(path, s).catch(() => {});
		return l;
	}

	/** The session's transcript: under its cwd's project folder, or wherever a search finds it. */
	async #transcript(sessionId: string, cwd: string): Promise<string | undefined> {
		const known = this.#transcripts.get(sessionId);
		if (known && (await this.files.mtime(known)) !== undefined) return known;
		const projects = join(this.roots.home, "projects");
		const file = `${sessionId}.jsonl`;
		let found: string | undefined = join(projects, projectSlug(cwd), file);
		if ((await this.files.mtime(found)) === undefined) {
			found = undefined;
			for (const d of await readdir(projects).catch(() => [] as string[])) {
				const p = join(projects, d, file);
				if ((await this.files.mtime(p)) !== undefined) {
					found = p;
					break;
				}
			}
		}
		if (found) this.#transcripts.set(sessionId, found);
		return found;
	}

	async #agents(sessionDir: string, at: number): Promise<Agent[]> {
		const dir = join(sessionDir, "subagents");
		const metas = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".meta.json"));
		const byId = new Map<string, Agent>();
		const parentOf = new Map<Agent, string | undefined>();
		for (const name of metas) {
			const id = name.replace(/^agent-/, "").replace(/\.meta\.json$/, "");
			const meta = agentMeta(await this.files.json<unknown>(join(dir, name)));
			if (!meta) continue;
			const log = join(dir, `agent-${id}.jsonl`);
			const lastWriteAt = (await this.files.mtime(log)) ?? (await this.files.mtime(join(dir, name))) ?? 0;
			const status: AgentStatus = meta.stoppedByUser
				? "stopped"
				: meta.finished
					? "finished"
					: at - lastWriteAt > STALL_MS
						? "stalled"
						: "running";
			const quiet = at - lastWriteAt;
			if (status === "stalled" ? quiet > ABANDON_MS : status !== "running" && quiet > LINGER_MS) continue;
			const activity = status === "running" ? await this.files.fromTail(log, lastToolCall) : undefined;
			// Every agent still shown keeps its counts; only a running one has a running tool.
			const ledger = await this.#ledger(log);
			const live = status === "running";
			const running = live ? ledger.running : undefined;
			const agent: Agent = {
				id,
				role: meta.agentType ?? "agent",
				task: meta.description ?? "",
				model: meta.model,
				depth: meta.spawnDepth ?? 1,
				status,
				lastWriteAt,
				activity,
				...(running ? { running } : {}),
				...(live && ledger.commands.repeats > 0 ? { commands: ledger.commands } : {}),
				...optional("family", ledger.family ?? modelFamily(meta.model)),
				...optional("changes", ledger.changes),
				...optional("tools", ledger.toolRate(at)),
				children: [],
			};
			byId.set(id, agent);
			parentOf.set(agent, meta.parentAgentId);
		}
		const top: Agent[] = [];
		for (const [agent, parentId] of parentOf) {
			const parent = parentId ? byId.get(parentId) : undefined;
			(parent ?? { children: top }).children.push(agent);
		}
		// Sorted by id, so the order is stable between snapshots and desks don't reshuffle.
		const sortTree = (list: Agent[]) => {
			list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
			list.forEach((a) => sortTree(a.children));
		};
		sortTree(top);
		return top;
	}

	/** The desktop app's entry for a session. Its folders are found once and then reused. */
	async #desktop(hostId: string): Promise<DesktopEntry | undefined> {
		const root = this.roots.desktopIndex;
		if (!root) return undefined;
		this.#desktopDirs ??= await nestedDirs(root, 2);
		for (const d of this.#desktopDirs) {
			const entry = desktopEntry(await this.files.json<unknown>(join(d, `${hostId}.json`)));
			if (entry) return entry;
		}
		this.#desktopDirs = undefined; // a new account folder may have appeared; look again next time
		return undefined;
	}
}

async function nestedDirs(root: string, depth: number): Promise<string[]> {
	let level = [root];
	for (let i = 0; i < depth; i++) {
		const next: string[] = [];
		for (const d of level) {
			const ents = await readdir(d, { withFileTypes: true }).catch(() => []);
			for (const e of ents) if (e.isDirectory()) next.push(join(d, e.name));
		}
		level = next;
	}
	return level;
}


/**
 * Waiting on the person: the hook's last word for this session was a prompt that nothing has
 * answered yet (the transcript hasn't moved since), or a tool that asks the person is open.
 */
export function waiting(hook: HookEvent | undefined, running: RunningTool | undefined, transcriptMtime: number | undefined): Waiting | undefined {
	if (hook?.event === "Notification" && hook.kind !== "idle") {
		// The hook's clock has whole seconds: a transcript write in the same second still counts as before.
		const answered = transcriptMtime !== undefined && transcriptMtime >= hook.at + 1000;
		if (!answered) {
			const reason = hook.kind === "permission" || hook.kind === "question" ? hook.kind : "other";
			return { reason, since: hook.at, source: "hook" };
		}
	}
	const reason = running ? WAITING_TOOLS[running.tool] : undefined;
	return reason && running ? { reason, since: running.since, source: "transcript" } : undefined;
}

/** PR links from the transcript, then any the desktop index adds; the index knows their state. */
function mergePrs(fromTranscript: PullRequest[], fromDesk: DesktopEntry["prs"]): PullRequest[] {
	const out = fromTranscript.map((p) => ({ ...p }));
	for (const d of Array.isArray(fromDesk) ? fromDesk : []) {
		if (typeof d?.url !== "string" || typeof d.prNumber !== "number") continue;
		const known = out.find((p) => p.url === d.url);
		if (known) {
			if (typeof d.state === "string") known.state = d.state;
		} else {
			out.push({ number: d.prNumber, url: d.url, ...(typeof d.repo === "string" ? { repo: d.repo } : {}), ...(typeof d.state === "string" ? { state: d.state } : {}) });
		}
	}
	return out;
}
