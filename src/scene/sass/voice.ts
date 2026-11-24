// The glue between the sass engine and the office: S4's seam. It turns `Sass` output into
// `say(key, text, kind)` and `setSign(id, {title, body})` calls, takes each bubble down when its
// time is up, and drops what the office has no slot for (yet). Pixi-free: the office is passed in
// as the three methods it needs, so tests drive it with a fake.
import type { Snapshot } from "../../watcher/model";
import type { ThemeId } from "../theme/id";
import { type Output, Sass, type SassOptions } from "./sass";
import type { Say, View } from "./scheduler";

/** What the voice needs from the office. */
export interface Stage {
	say(key: string, text: string | undefined, kind: "said" | "thought"): void;
	setSign(id: string, value: { title: string; body?: string } | undefined): void;
	/** The sign slots the office draws. */
	signs(): { id: string }[];
}

/** The director's key for a character: `s:<session>` for a lead, `a:<session>:<agent>` for crew.
 * @public test/sass.test.ts reads it through `require`, which knip doesn't follow. */
export const keyFor = (b: Pick<Say, "who" | "session">) => (b.who === b.session ? `s:${b.session}` : `a:${b.session}:${b.who}`);

/**
 * A sign line as the office's two-part sign: the first sentence is the title, in capitals, and the
 * rest is the body. "Now serving: nobody. Your number: 1." → NOW SERVING: NOBODY / Your number: 1.
 * A newline splits the two outright.
 */
export function signText(text: string): { title: string; body?: string } {
	const nl = text.indexOf("\n");
	if (nl >= 0) return { title: text.slice(0, nl).toUpperCase(), body: text.slice(nl + 1) || undefined };
	const m = /^(.+?[^.])\.\s+(.+)$/.exec(text);
	if (m) return { title: m[1]!.toUpperCase(), body: m[2] };
	return { title: text.replace(/\.$/, "").toUpperCase() };
}

export class Voice {
	readonly sass: Sass;
	readonly #stage: Stage;
	/** Bubbles up, by character key, until when. */
	#up = new Map<string, { until: number; say: Say }>();
	#snap: Snapshot | undefined;
	/** Every sign the voice set, and slots it had no place for, for the inspector. */
	readonly written = new Map<string, string>();
	readonly dropped = new Map<string, string>();

	constructor(stage: Stage, opts: SassOptions = {}) {
		this.#stage = stage;
		this.sass = new Sass(opts);
	}

	/** Voice the scene at `now`: a new snapshot is read for triggers, the same one just moves time on. */
	run(snap: Snapshot, now: number, view: View): Output {
		const out = snap !== this.#snap ? this.sass.update(snap, now, view) : this.sass.tick(now, view);
		this.#snap = snap;
		for (const [key, b] of this.#up) {
			if (b.until > now) continue;
			this.#up.delete(key);
			this.#stage.say(key, undefined, "said");
		}
		for (const b of out.says) {
			const key = keyFor(b);
			this.#up.set(key, { until: b.until, say: b });
			this.#stage.say(key, b.text, b.kind);
		}
		if (out.signs.length) {
			const slots = new Set(this.#stage.signs().map((s) => s.id));
			for (const s of out.signs) {
				if (slots.has(s.slot)) {
					this.written.set(s.slot, s.text);
					this.#stage.setSign(s.slot, signText(s.text));
				} else this.dropped.set(s.slot, s.text);
			}
		}
		return out;
	}

	/**
	 * The theme changed: speak in its words from the next run on (bank.ts). Every sign the voice
	 * wrote goes back to the new theme's default for that slot (`defaults`, its words' signs) or
	 * comes down, so no office joke is left on a bakery wall; the next run writes the counters again.
	 */
	setTheme(id: ThemeId, defaults: Record<string, { title: string; body?: string }> = {}): void {
		if (id === this.sass.theme) return;
		this.sass.setTheme(id);
		for (const slot of this.written.keys()) this.#stage.setSign(slot, defaults[slot]);
		this.written.clear();
		this.dropped.clear();
	}

	/** A character left: take its bubble down now. */
	gone(key: string): void {
		if (!this.#up.delete(key)) return;
		this.#stage.say(key, undefined, "said");
	}

	/** When `run` next has work: a bubble to take down, a line's turn, a tier crossed. */
	nextWake(now: number): number | undefined {
		const times = [...this.#up.values()].map((b) => b.until).filter((t) => t > now);
		const s = this.sass.nextWake(now);
		if (s !== undefined) times.push(s);
		return times.length ? Math.min(...times) : undefined;
	}

	/** The bubbles up now, for the inspector. */
	bubbles(now: number): { key: string; text: string; kind: string; trigger: string; until: number }[] {
		return [...this.#up].filter(([, b]) => b.until > now).map(([key, b]) => ({ key, text: b.say.text, kind: b.say.kind, trigger: b.say.trigger, until: b.until }));
	}
}
