// Builds a Snapshot from the files on disk. Reads only what the live sessions need: the registry,
// each live session's transcript tail and subagent metadata, and its desktop index entry.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { FileCache } from "./files";
import type { Agent, AgentStatus, Session, Snapshot } from "./model";
import {
	type AgentMeta,
	type DesktopEntry,
	type RegistryEntry,
	type Roots,
	lastToolCall,
	projectOf,
	projectSlug,
} from "./sources";

/** An unfinished agent whose transcript has been quiet this long is shown as stalled. */
export const STALL_MS = 30 * 60 * 1000;
/** Finished agents stay in the snapshot this long, so the scene can see them leave. */
export const LINGER_MS = 2 * 60 * 1000;
/** A stalled agent is dropped once it has been quiet this long: by then it is surely dead. */
export const ABANDON_MS = 2 * 60 * 60 * 1000;

export function isAlive(pid: number): boolean {
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

	constructor(
		readonly roots: Roots,
		readonly alive: (pid: number) => boolean = isAlive,
		readonly now: () => number = Date.now,
	) {}

	async build(): Promise<Snapshot> {
		const at = this.now();
		const dir = join(this.roots.home, "sessions");
		const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
		const entries = await Promise.all(names.map((n) => this.files.json<RegistryEntry>(join(dir, n))));

		const byHost = new Map<string, Session>();
		const parentHost = new Map<Session, string>();
		const sessions: Session[] = [];
		for (const e of entries) {
			if (!e?.sessionId || typeof e.pid !== "number" || !e.cwd || !this.alive(e.pid)) continue;
			const desk = e.hostSessionId ? await this.#desktop(e.hostSessionId) : undefined;
			const s = await this.#session(e, desk, at);
			sessions.push(s);
			if (e.hostSessionId) byHost.set(e.hostSessionId, s);
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
		return { at, sessions: roots };
	}

	async #session(e: RegistryEntry, desk: DesktopEntry | undefined, at: number): Promise<Session> {
		const cwd = e.cwd!;
		const transcript = await this.#transcript(e.sessionId!, cwd);
		const activity = transcript ? await this.files.fromTail(transcript, lastToolCall) : undefined;
		return {
			id: e.sessionId!,
			pid: e.pid!,
			title: e.name ?? desk?.title ?? projectOf(cwd).project,
			cwd,
			...projectOf(cwd),
			branch: desk?.branch,
			origin: e.entrypoint ?? "unknown",
			state: e.status ?? "unknown",
			stateSince: e.statusUpdatedAt ?? e.startedAt ?? at,
			startedAt: e.startedAt ?? at,
			activity,
			agents: transcript ? await this.#agents(transcript.replace(/\.jsonl$/, ""), at) : [],
			children: [],
		};
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
			const meta = await this.files.json<AgentMeta>(join(dir, name));
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
			const agent: Agent = {
				id,
				role: meta.agentType ?? "agent",
				task: meta.description ?? "",
				model: meta.model,
				depth: meta.spawnDepth ?? 1,
				status,
				lastWriteAt,
				activity,
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
			const entry = await this.files.json<DesktopEntry>(join(d, `${hostId}.json`));
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
