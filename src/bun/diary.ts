// The diary on disk: `diary.json` in the app's data folder, next to settings.json, never in the
// repo. What goes in it is counts and kinds only (src/shared/diary.ts says what, and why nothing
// in it names a project or a person). Reading is forgiving: a missing, torn or hand-edited file
// gives what can be read of it, or an empty diary. Writing is a temporary file renamed over the
// old one, so a crash mid-write never leaves half a diary; and it is held back a little, so a busy
// office writes it every few seconds at most, not on every snapshot.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Diary, type DiaryMemory, type NoteOptions, diaryOf, emptyDiary, localDay, newMemory, noteSnapshot, prune } from "../shared/diary";
import type { Snapshot } from "../watcher/model";

export const diaryFile = (dataDir: string) => join(dataDir, "diary.json");

export function readDiary(file: string): Diary {
	try {
		return diaryOf(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return emptyDiary();
	}
}

export function writeDiary(file: string, diary: Diary): void {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(diary)}\n`);
	renameSync(tmp, file);
}

export interface DiaristOptions extends NoteOptions {
	/** Hold writes back this long after a change (default 5 s). 0 writes at once. */
	saveMs?: number;
	/** The clock, for pruning on load (default Date.now). */
	now?: () => number;
}

/** Keeps the diary: reads it once, notes each snapshot, saves when it changed. */
export class Diarist {
	readonly file: string;
	#diary: Diary;
	#mem: DiaryMemory = newMemory();
	#opts: DiaristOptions;
	#timer?: ReturnType<typeof setTimeout>;
	#dirty = false;

	constructor(file: string, opts: DiaristOptions = {}) {
		this.file = file;
		this.#opts = opts;
		const day = opts.day ?? localDay;
		this.#diary = prune(readDiary(file), day((opts.now ?? Date.now)()));
	}

	get diary(): Diary {
		return this.#diary;
	}

	/** Note a snapshot. True when the diary changed (send it to the windows). */
	note(snap: Snapshot): boolean {
		const next = noteSnapshot(this.#diary, this.#mem, snap, this.#opts);
		if (next === this.#diary) return false;
		this.#diary = next;
		this.#dirty = true;
		this.#schedule();
		return true;
	}

	#schedule(): void {
		const ms = this.#opts.saveMs ?? 5000;
		if (ms <= 0) return this.flush();
		this.#timer ??= setTimeout(() => this.flush(), ms);
	}

	/** Save now, if anything changed (on quit, or when the hold-back is over). */
	flush(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		if (!this.#dirty) return;
		this.#dirty = false;
		try {
			writeDiary(this.file, this.#diary);
		} catch (e) {
			console.warn(`[busybodies] couldn't save the diary: ${e}`);
		}
	}
}
