// Keeps a Snapshot current. File events (FSEvents on macOS) trigger a debounced rebuild; a slow
// timer catches what file events can't see, such as a process exiting. Listeners hear about a
// snapshot only when its content changed.
import { type FSWatcher, statSync, watch } from "node:fs";
import { basename, join, sep } from "node:path";
import type { Snapshot } from "./model";
import { SnapshotBuilder } from "./snapshot";
import { HOOK_DIR, HOOK_EVENTS, type Roots, defaultRoots } from "./sources";

/**
 * Whether a file event under projects/ can change the snapshot: only files in a folder that holds
 * a live session's transcript can. A new session shows up through the registry first.
 */
export function isLiveProjectFile(file: string, liveDirs: ReadonlySet<string>): boolean {
	if (!(file.endsWith(".jsonl") || file.endsWith(".meta.json"))) return false;
	return liveDirs.has(file.split(sep)[0]!);
}

interface WatchTarget {
	path: string;
	recursive: boolean;
	keep: (file: string) => boolean;
	w?: FSWatcher;
	/** The folder's inode when the watch was made: a new one means it was removed and made again. */
	ino?: number;
	closed?: boolean;
}

function inodeOf(path: string): number | undefined {
	try {
		return statSync(path).ino;
	} catch {
		return undefined;
	}
}

export interface WatcherOptions {
	roots?: Roots;
	/** Quiet time after a file event before rebuilding. */
	debounceMs?: number;
	/** Rebuild at least this often, for process exits and stalls. */
	pollMs?: number;
}

export interface WatcherStats {
	rebuilds: number;
	/** File events that were dropped because no live session could be affected. */
	ignoredEvents: number;
	changes: number;
	lastBuildMs: number;
}

export class Watcher {
	readonly builder: SnapshotBuilder;
	readonly stats: WatcherStats = { rebuilds: 0, ignoredEvents: 0, changes: 0, lastBuildMs: 0 };
	snapshot?: Snapshot;

	#listeners = new Set<(s: Snapshot) => void>();
	#targets: WatchTarget[] = [];
	#stopped = false;
	#timer?: ReturnType<typeof setTimeout>;
	#poll?: ReturnType<typeof setInterval>;
	#building = false;
	#again = false;
	#lastKey = "";
	#debounceMs: number;
	#pollMs: number;

	constructor(opts: WatcherOptions = {}) {
		this.builder = new SnapshotBuilder(opts.roots ?? defaultRoots());
		this.#debounceMs = opts.debounceMs ?? 250;
		this.#pollMs = opts.pollMs ?? 5000;
	}

	onChange(fn: (s: Snapshot) => void): () => void {
		this.#listeners.add(fn);
		return () => this.#listeners.delete(fn);
	}

	async start(): Promise<Snapshot> {
		const { home, desktopIndex } = this.builder.roots;
		this.#stopped = false;
		this.#targets = [
			{ path: join(home, "sessions"), recursive: false, keep: () => true },
			{ path: join(home, "projects"), recursive: true, keep: (f) => isLiveProjectFile(f, this.builder.liveProjectDirs) },
			...(desktopIndex
				? [{ path: desktopIndex, recursive: true, keep: (f: string) => f.endsWith(".json") && this.builder.liveHostIds.has(basename(f, ".json")) }]
				: []),
			{ path: join(home, HOOK_DIR), recursive: false, keep: (f) => f === HOOK_EVENTS },
		];
		this.#refreshWatches();
		this.#poll = setInterval(() => {
			// A folder made after start (hooks installed later), or one removed and made again (the
			// agent home moved away and back): watch what is there now.
			this.#refreshWatches();
			this.#schedule(0);
		}, this.#pollMs);
		await this.#rebuild();
		return this.snapshot!;
	}

	/** Stop every file watch and timer; nothing fires after this, so the process can exit. */
	stop(): void {
		this.#stopped = true;
		for (const t of this.#targets) this.#unwatch(t);
		clearTimeout(this.#timer);
		this.#timer = undefined;
		clearInterval(this.#poll);
		this.#poll = undefined;
	}

	/** Open file watches currently held (for tests and the soak). */
	get watchCount(): number {
		return this.#targets.filter((t) => t.w).length;
	}

	#refreshWatches(): void {
		for (const t of this.#targets) {
			const ino = inodeOf(t.path);
			if (t.w && (t.closed || ino !== t.ino)) this.#unwatch(t);
			if (!t.w && ino !== undefined) this.#watch(t, ino);
		}
	}

	#unwatch(t: WatchTarget): void {
		try {
			t.w?.close();
		} catch {
			// Already closed.
		}
		t.w = undefined;
		t.ino = undefined;
		t.closed = false;
	}

	#watch(t: WatchTarget, ino: number): void {
		try {
			const w = watch(t.path, { recursive: t.recursive, persistent: true }, (_event, file) => {
				if (!file || t.keep(String(file))) this.#schedule(this.#debounceMs);
				else this.stats.ignoredEvents++;
			});
			w.on("error", () => (t.closed = true));
			t.w = w;
			t.ino = ino;
		} catch {
			// The folder doesn't exist (yet): the poll still picks up changes, and watches it once it does.
		}
	}

	#schedule(delay: number): void {
		if (this.#timer || this.#stopped) return;
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			void this.#rebuild();
		}, delay);
	}

	async #rebuild(): Promise<void> {
		if (this.#building) {
			this.#again = true;
			return;
		}
		this.#building = true;
		try {
			const t0 = performance.now();
			const snap = await this.builder.build();
			this.stats.rebuilds++;
			this.stats.lastBuildMs = performance.now() - t0;
			const key = JSON.stringify(snap.sessions);
			this.snapshot = snap;
			if (this.#stopped) return;
			if (key !== this.#lastKey) {
				this.#lastKey = key;
				this.stats.changes++;
				this.#listeners.forEach((fn) => fn(snap));
			}
		} finally {
			this.#building = false;
			if (this.#again) {
				this.#again = false;
				this.#schedule(this.#debounceMs);
			}
		}
	}
}
