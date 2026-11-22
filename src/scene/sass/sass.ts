// The sass module in one piece: snapshots in, bubbles and signs out. `update` takes each new
// snapshot; `tick` runs at `nextWake` with no new snapshot (a bubble ended, a queued line's turn
// came, a wait crossed its next tier). Neither runs a timer: the caller schedules the next call,
// and `nextWake` is undefined when nothing is due, so an idle office can sleep.
import type { Snapshot } from "../../watcher/model";
import { type DetectOptions, MIN, detect } from "./detect";
import { LINES } from "./lines";
import { type Say, Scheduler, type SchedulerOptions, type View } from "./scheduler";
import { type CounterOptions, Counters, slotName } from "./signs";
import type { Trigger, TriggerKind } from "./types";

/** A sign to set: `sign(slot, text)`. A sign's text may hold a newline between title and body. */
export interface SignOut {
	slot: string;
	text: string;
}

export interface Output {
	says: Say[];
	signs: SignOut[];
}

export interface SassOptions extends SchedulerOptions, CounterOptions, DetectOptions {
	/** A sign a trigger put up stays this long before the counters take the slot back. */
	signHoldMs?: number;
}

/** Triggers whose magnitude is in minutes, so their next tier is a time. */
const TIMED = new Set<TriggerKind>(["waiting", "longBuild", "busy", "stalled", "idle"]);

export class Sass {
	readonly scheduler: Scheduler;
	readonly #counters: Counters;
	readonly #opts: SassOptions;
	#prev: Snapshot | undefined;
	#last: Snapshot | undefined;
	#triggers: Trigger[] = [];
	/** What each slot shows, and until when a trigger's sign holds it. */
	#slots = new Map<string, { text: string; holdUntil: number }>();
	#view: View = { zoom: 1 };

	constructor(opts: SassOptions = {}) {
		this.#opts = opts;
		this.scheduler = new Scheduler(opts);
		this.#counters = new Counters(opts);
	}

	/** A new snapshot. */
	update(snap: Snapshot, now: number, view: View = this.#view): Output {
		this.#prev = this.#last;
		this.#last = snap;
		return this.#run(now, view, true);
	}

	/** No new snapshot; time has moved on. */
	tick(now: number, view: View = this.#view): Output {
		return this.#run(now, view, false);
	}

	/** The last triggers found, for the inspector and the dump. */
	get triggers(): readonly Trigger[] {
		return this.#triggers;
	}

	/** When `tick` next has work to do, or undefined. */
	nextWake(now: number): number | undefined {
		const times: number[] = [];
		const s = this.scheduler.nextWake(now);
		if (s !== undefined) times.push(s);
		// A timed state crossing its next tier ("No rush. Some rush." at 2 minutes).
		for (const t of this.#triggers) {
			if (!t.ongoing || !TIMED.has(t.kind)) continue;
			const next = Math.min(...LINES.filter((l) => l.trigger === t.kind && l.min !== undefined && l.min > t.magnitude).map((l) => l.min!));
			if (Number.isFinite(next)) times.push(now + (next - t.magnitude) * MIN);
		}
		for (const v of this.#slots.values()) if (v.holdUntil > now) times.push(v.holdUntil);
		return times.length ? Math.min(...times) : undefined;
	}

	#run(now: number, view: View, _fresh: boolean): Output {
		this.#view = view;
		if (!this.#last) return { says: [], signs: [] };
		// Re-detecting on a tick moves the ongoing magnitudes on; events are keyed, so they don't fire twice.
		this.#triggers = detect(this.#prev, this.#last, now, this.#opts);
		const { says, signs: lines } = this.scheduler.step(now, view, this.#triggers);
		const signs: SignOut[] = [];
		const put = (slot: string, text: string, holdUntil: number) => {
			const was = this.#slots.get(slot);
			this.#slots.set(slot, { text, holdUntil });
			if (was?.text !== text) signs.push({ slot, text });
		};
		const hold = this.#opts.signHoldMs ?? 2 * MIN;
		for (const l of lines) put(slotName(l.line.place ?? "sign", l.trigger.project), l.text, now + hold);
		{
			for (const [slot, text] of this.#counters.update(this.#last, now)) {
				const was = this.#slots.get(slot);
				if (was && was.holdUntil > now) continue;
				put(slot, text, 0);
			}
		}
		return { says, signs };
	}
}
