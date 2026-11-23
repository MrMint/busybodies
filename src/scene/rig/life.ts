// Life: the small things a character does while nothing is happening to it, so a visible office
// is never a still photo. A blink, a glance away and back. It is an overlay on whatever pose is
// playing (eyes and where the face looks only: never the body's scale), and a pure function of
// the character's id and how long its life clock has run, so a frozen scene stepped n frames is
// the same on every load. The app runs it only while the window is on screen (src/mainview/
// visibility.ts); calm mode turns it off.
import { hash } from "./player";
import type { Eyes } from "./vocab";

/** What life adds to the pose right now. */
export interface LifeBeat {
	/** The eyes are shut for a blink. */
	blink: boolean;
	/** Where the face drifts, in rig units, on top of the pose's own look. */
	lookX: number;
	lookY: number;
}

export const STILL: LifeBeat = { blink: false, lookX: 0, lookY: 0 };

/** Life's beat grid: every blink and glance starts on it (and a glance ends on it), so the cast's
 * beats share frames (a lower life rate, `?lifefps=10`, still shows every one).
 * A blink, and the gap inside a double blink, last longer than a grid step, so no frame misses one. */
export const LIFE_GRID_MS = 100;
/** A time snapped down to the grid. */
const grid = (ms: number) => Math.floor(ms / LIFE_GRID_MS) * LIFE_GRID_MS;

/** How long a blink holds the eyes shut, and the gap inside a double blink. */
export const BLINK_MS = 130;
const DOUBLE_GAP_MS = 140;
/** Blinks come once per window, somewhere inside it. */
const BLINK_WINDOW_MS = 4600;
/** Glances: at most one per window, held for a while, then the face comes back. */
const GLANCE_WINDOW_MS = 7300;

/** Eyes a blink can close: open ones. Shut, sleepy, starry or side-eyed ones keep what they are. */
const BLINKS: ReadonlySet<Eyes> = new Set<Eyes>(["rest", "wide", "shine", "squint", "half"]);

/** Where a glance goes: off to a side, up at nothing, down at the desk. Small, so it reads as a
 * look and not a pose change. */
const GLANCES: readonly [number, number][] = [
	[-3.2, 0],
	[3.2, 0],
	[-2.4, -2],
	[2.4, -2],
	[0, 2.6],
	[-2, 1.6],
	[2, 1.6],
];

/** A number in [0, 1) from an id, a salt and a window index. */
const u = (id: string, salt: string, k: number) => hash(`${id}:${salt}:${k}`) / 0x1_0000_0000;

/** One character's blink and glance windows, worked out once per window rather than hashed again
 * on every frame (the whole cast asks 30 times a second). Only a cache: the same numbers as
 * hashing each time. */
interface Windows {
	blinkK: number;
	/** When the blink starts in its window, and whether it is a double. */
	blinkAt: number;
	double: boolean;
	glanceK: number;
	/** The glance in its window (start, hold, where), or none. */
	glance?: { at: number; hold: number; where: readonly [number, number] };
}
const windows = new Map<string, Windows>();
/** Ids come and go with sessions: past this many the cache starts over. */
const WINDOWS_MAX = 2048;

function windowsOf(id: string): Windows {
	let w = windows.get(id);
	if (!w) {
		if (windows.size >= WINDOWS_MAX) windows.clear();
		w = { blinkK: NaN, blinkAt: 0, double: false, glanceK: NaN };
		windows.set(id, w);
	}
	return w;
}

/** Whether the eyes are shut for a blink at `ms` on this character's life clock. */
export function blinking(id: string, ms: number): boolean {
	if (ms < 0) return false;
	const k = Math.floor(ms / BLINK_WINDOW_MS);
	const into = ms - k * BLINK_WINDOW_MS;
	const w = windowsOf(id);
	if (w.blinkK !== k) {
		w.blinkK = k;
		// Somewhere in the window, leaving room for a double blink to finish inside it.
		w.blinkAt = 300 + grid(u(id, "blink", k) * (BLINK_WINDOW_MS - 300 - 2 * BLINK_MS - DOUBLE_GAP_MS - 100));
		// About one blink in five is a double.
		w.double = u(id, "double", k) < 0.2;
	}
	const at = w.blinkAt;
	if (into >= at && into < at + BLINK_MS) return true;
	const second = at + BLINK_MS + DOUBLE_GAP_MS;
	return w.double && into >= second && into < second + BLINK_MS;
}

const NO_GLANCE: readonly [number, number] = [0, 0];

/** Where the face has drifted for a glance at `ms`, or [0, 0]. */
export function glancing(id: string, ms: number): readonly [number, number] {
	if (ms < 0) return NO_GLANCE;
	const k = Math.floor(ms / GLANCE_WINDOW_MS);
	const w = windowsOf(id);
	if (w.glanceK !== k) {
		w.glanceK = k;
		// Not every window: a character that glances every few seconds looks nervous.
		if (u(id, "glance?", k) > 0.55) w.glance = undefined;
		else {
			const hold = 900 + grid(u(id, "hold", k) * 1700);
			const at = 400 + grid(u(id, "when", k) * (GLANCE_WINDOW_MS - hold - 800));
			w.glance = { at, hold, where: GLANCES[hash(`${id}:where:${k}`) % GLANCES.length]! };
		}
	}
	const g = w.glance;
	const into = ms - k * GLANCE_WINDOW_MS;
	if (!g || into < g.at || into >= g.at + g.hold) return NO_GLANCE;
	return g.where;
}

/** Life's overlay at `ms` on a character's life clock, for a pose showing `eyes`. */
export function lifeAt(id: string, ms: number, eyes: Eyes): LifeBeat {
	const where = glancing(id, ms);
	const blink = BLINKS.has(eyes) && blinking(id, ms);
	// One shared beat per glance and blink: nothing made per character per frame.
	let pair = BEATS.get(where);
	if (!pair) BEATS.set(where, (pair = [Object.freeze({ blink: false, lookX: where[0], lookY: where[1] }), Object.freeze({ blink: true, lookX: where[0], lookY: where[1] })]));
	return pair[blink ? 1 : 0];
}
const BEATS = new Map<readonly [number, number], readonly [LifeBeat, LifeBeat]>();
