// Cached file reads. Each read stats the file first and re-reads only when its mtime moved, so a
// rebuild over unchanged files costs a handful of stat calls. A file caught mid-write (bad JSON)
// keeps its last good value.
import type { Stats } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";

type Entry<T> = { mtimeMs: number; value: T };

export class FileCache {
	#entries = new Map<string, Entry<unknown>>();

	/** Parsed JSON, or undefined when the file is missing or has never parsed. */
	async json<T>(path: string): Promise<T | undefined> {
		return this.#load(path, async () => JSON.parse(await readFile(path, "utf8")) as T);
	}

	/** A small file's text, or undefined when it is missing. */
	async text(path: string): Promise<string | undefined> {
		return this.#load(path, () => readFile(path, "utf8"));
	}

	/**
	 * Reads ever larger tails of a file until `find` returns a value, and caches that value until
	 * the file changes. Most answers sit in the last few KB, but one record can be megabytes.
	 */
	async fromTail<T>(path: string, find: (text: string) => T | undefined, sizes = [64 * 1024, 512 * 1024, 4 * 1024 * 1024]): Promise<T | undefined> {
		return this.#load(path, async (size) => {
			const fh = await open(path, "r");
			try {
				for (const bytes of sizes) {
					const start = Math.max(0, size - bytes);
					const buf = Buffer.alloc(size - start);
					await fh.read(buf, 0, buf.length, start);
					const found = find(buf.toString("utf8"));
					if (found !== undefined || start === 0) return found;
				}
				return undefined;
			} finally {
				await fh.close();
			}
		});
	}

	async mtime(path: string): Promise<number | undefined> {
		return (await this.stat(path))?.mtimeMs;
	}

	/** A file's stats, taken at most once between sweeps: one rebuild sees one moment per file. */
	stat(path: string): Promise<Stats | undefined> {
		let s = this.#stats.get(path);
		if (!s) this.#stats.set(path, (s = stat(path).catch(() => undefined)));
		return s;
	}

	#stats = new Map<string, Promise<Stats | undefined>>();

	/** Forget files not read since the last sweep, so the cache can't outgrow the live set. */
	sweep(): void {
		this.#stats.clear();
		for (const p of this.#entries.keys()) if (!this.#touched.has(p)) this.#entries.delete(p);
		this.#touched.clear();
	}

	#touched = new Set<string>();

	async #load<T>(path: string, load: (size: number) => Promise<T>): Promise<T | undefined> {
		this.#touched.add(path);
		const s = await this.stat(path);
		if (!s) {
			this.#entries.delete(path);
			return undefined;
		}
		const hit = this.#entries.get(path) as Entry<T> | undefined;
		if (hit && hit.mtimeMs === s.mtimeMs) return hit.value;
		try {
			const value = await load(s.size);
			this.#entries.set(path, { mtimeMs: s.mtimeMs, value });
			return value;
		} catch {
			return hit?.value;
		}
	}
}
