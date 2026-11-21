// Keeps a Snapshot current. File events (FSEvents on macOS) trigger a debounced rebuild; a slow
// timer catches what file events can't see, such as a process exiting. Listeners hear about a
// snapshot only when its content changed.
import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "./model";
import { SnapshotBuilder } from "./snapshot";
import { type Roots, defaultRoots } from "./sources";

export interface WatcherOptions {
	roots?: Roots;
	/** Quiet time after a file event before rebuilding. */
	debounceMs?: number;
	/** Rebuild at least this often, for process exits and stalls. */
	pollMs?: number;
}

export interface WatcherStats {
	rebuilds: number;
	changes: number;
	lastBuildMs: number;
}

export class Watcher {
	readonly builder: SnapshotBuilder;
	readonly stats: WatcherStats = { rebuilds: 0, changes: 0, lastBuildMs: 0 };
	snapshot?: Snapshot;

	#listeners = new Set<(s: Snapshot) => void>();
	#fsWatchers: FSWatcher[] = [];
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
		this.#watch(join(home, "projects"), true, (f) => f.endsWith(".jsonl") || f.endsWith(".meta.json"));
		if (desktopIndex) this.#watch(desktopIndex, true, (f) => f.endsWith(".json"));
		this.#poll = setInterval(() => this.#schedule(0), this.#pollMs);
		await this.#rebuild();
		return this.snapshot!;
	}

	stop(): void {
		this.#fsWatchers.forEach((w) => w.close());
		this.#fsWatchers = [];
		clearTimeout(this.#timer);
		clearInterval(this.#poll);
	}

	#watch(path: string, recursive: boolean, keep: (file: string) => boolean = () => true): void {
		try {
			const w = watch(path, { recursive, persistent: true }, (_event, file) => {
				if (!file || keep(String(file))) this.#schedule(this.#debounceMs);
			});
			w.on("error", () => w.close());
			this.#fsWatchers.push(w);
		} catch {
			// The folder doesn't exist (yet): the poll still picks up changes.
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
