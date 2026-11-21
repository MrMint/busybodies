// Plays a recorded snapshot timeline (NDJSON, one Snapshot per line, from tools/record.ts) as if
// it were live: the first frame is shown now, later ones at their recorded gaps divided by
// `speed`, with every time in them shifted by the same amount so durations stay true.
import type { Snapshot } from "./model";

export function parseRecording(text: string): Snapshot[] {
	const frames: Snapshot[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const s = JSON.parse(line) as Snapshot;
			if (typeof s?.at === "number" && Array.isArray(s.sessions)) frames.push(s);
		} catch {
			// a torn or foreign line: skip it
		}
	}
	return frames.sort((a, b) => a.at - b.at);
}

/** The fields in a snapshot that hold epoch ms. */
const TIME_KEYS = new Set(["at", "since", "stateSince", "startedAt", "lastWriteAt", "lastAt"]);

/** A copy of a snapshot with every time moved by `ms`. */
export function shiftTimes<T>(value: T, ms: number): T {
	if (Array.isArray(value)) return value.map((v) => shiftTimes(v, ms)) as T;
	if (!value || typeof value !== "object") return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = TIME_KEYS.has(k) && typeof v === "number" ? v + ms : shiftTimes(v, ms);
	return out as T;
}

export interface ReplayOptions {
	/** Playback speed: 8 plays a recorded minute in 7.5 s. Default 1. */
	speed?: number;
	/** Start over after the last frame. */
	loop?: boolean;
	now?: () => number;
	setTimer?: (fn: () => void, ms: number) => unknown;
}

/** Shows each frame through `show` at its time. Returns a function that stops playback. */
export function replay(frames: Snapshot[], show: (s: Snapshot) => void, opts: ReplayOptions = {}): () => void {
	const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
	const now = opts.now ?? Date.now;
	const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	let stopped = false;
	if (frames.length === 0) return () => {};
	const t0 = frames[0]!.at;
	const pass = () => {
		const start = now();
		frames.forEach((f, i) => {
			const wait = (f.at - t0) / speed;
			setTimer(() => {
				if (stopped) return;
				// Recorded time runs `speed` times faster than the wall clock, from `start`.
				show(shiftTimes(f, start - t0 - (f.at - t0) + wait));
				if (opts.loop && i === frames.length - 1) setTimer(pass, 2000);
			}, wait);
		});
	};
	pass();
	return () => {
		stopped = true;
	};
}
