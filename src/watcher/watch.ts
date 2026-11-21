// Keeps a Snapshot current. File events (FSEvents on macOS) trigger a debounced rebuild; a slow
// timer catches what file events can't see, such as a process exiting. Listeners hear about a
// snapshot only when its content changed.
import { type FSWatcher, watch } from "node:fs";
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
	#fsWatchers: FSWatcher[] = [];
	#hookWatch = false;
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
		this.#watch(join(home, "sessions"), false);
		this.#watch(join(home, "projects"), true, (f) => isLiveProjectFile(f, this.builder.liveProjectDirs));
		if (desktopIndex)
			this.#watch(desktopIndex, true, (f) => f.endsWith(".json") && this.builder.liveHostIds.has(basename(f, ".json")));
		this.#hookWatch = this.#watch(join(home, HOOK_DIR), false, (f) => f === HOOK_EVENTS);
		this.#poll = setInterval(() => {
			// Hooks installed after start: watch their folder once it exists.
			this.#hookWatch ||= this.#watch(join(home, HOOK_DIR), false, (f) => f === HOOK_EVENTS);
			this.#schedule(0);
		}, this.#pollMs);
		await this.#rebuild();
		return this.snapshot!;
	}

	stop(): void {
		this.#fsWatchers.forEach((w) => w.close());
		this.#fsWatchers = [];
		clearTimeout(this.#timer);
		clearInterval(this.#poll);
	}

	#watch(path: string, recursive: boolean, keep: (file: string) => boolean = () => true): boolean {
		try {
			const w = watch(path, { recursive, persistent: true }, (_event, file) => {
				if (!file || keep(String(file))) this.#schedule(this.#debounceMs);
				else this.stats.ignoredEvents++;
			});
			w.on("error", () => w.close());
			this.#fsWatchers.push(w);
			return true;
		} catch {
			// The folder doesn't exist (yet): the poll still picks up changes.
			return false;
		}
	}

	#schedule(delay: number): void {
		if (this.#timer) return;
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
