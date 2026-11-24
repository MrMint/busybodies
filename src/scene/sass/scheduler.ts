// The bubble scheduler: takes turns, so the room isn't a wall of bubbles. It caps how many
// bubbles are up at once (by camera zoom), keeps a cooldown per character, never repeats a line
// within a window, says ongoing states again only as they escalate or after a long quiet, and
// shows long lines only when zoomed into a room. Every choice is seeded, so the same triggers at
// the same times give the same lines. Pixi-free; nothing here runs a timer of its own.
import { type Line, LINES } from "./lines";
import { type LineVars, type Trigger, type TriggerKind, unit } from "./types";

/** A bubble to show. */
export interface Say {
	who: string;
	/** The session it belongs to: `who` for a lead. */
	session: string;
	text: string;
	kind: "said" | "thought";
	trigger: TriggerKind;
	project: string;
	line: Line;
	at: number;
	until: number;
}

/** A sign line a trigger chose, for `Sass` to put on a slot. */
export interface SignLine {
	line: Line;
	text: string;
	trigger: Trigger;
}

/** What the camera shows. */
export interface View {
	/** World-to-screen scale: about 0.4 for the whole office, 1.5+ zoomed into a room. */
	zoom: number;
	/** The project whose room the camera is on, when it's on one. */
	room?: string;
}

export interface SchedulerOptions {
	seed?: number;
	/** Bubbles on screen at once, by zoom. */
	maxBubbles?: (zoom: number) => number;
	/** Quiet time a character keeps between its own bubbles. */
	cooldownMs?: number;
	/** The same character never says the same line again within this. */
	repeatMs?: number;
	/** Nobody says the same line again within this. */
	anyoneRepeatMs?: number;
	/** An ongoing state is said again after this, if it hasn't escalated. */
	againMs?: number;
	/** Gap between two new bubbles anywhere, so they arrive in turn. */
	gapMs?: number;
	/** An event not shown within this is dropped. */
	eventTtlMs?: number;
	/** Lines longer than this are long. */
	longChars?: number;
	/** Long lines show from this zoom up, or in the room the camera is on. */
	longZoom?: number;
	/** How rare a rare line is, against 1 for the rest. */
	rareWeight?: number;
	/**
	 * After the first step, ongoing states (naps, waits, long builds) keep quiet this long, so
	 * opening the app on a sleepy office doesn't greet you with a burst of bubbles. Events still speak.
	 */
	settleMs?: number;
}

const DEFAULTS: Required<SchedulerOptions> = {
	seed: 1,
	maxBubbles: (zoom) => (zoom < 0.6 ? 2 : zoom < 1.2 ? 3 : 4),
	cooldownMs: 45_000,
	repeatMs: 60 * 60_000,
	anyoneRepeatMs: 10 * 60_000,
	againMs: 8 * 60_000,
	gapMs: 1_500,
	eventTtlMs: 30_000,
	longChars: 30,
	longZoom: 1.2,
	rareWeight: 0.15,
	settleMs: 0,
};

/** Which triggers win a slot when there are more than fit. */
const PRIORITY: Record<TriggerKind, number> = {
	waiting: 10,
	crashed: 9,
	testFailed: 8,
	prOpened: 8,
	retry: 7,
	apiRetry: 7,
	hiring: 6,
	bigCrew: 6,
	review: 6,
	compacting: 5,
	longBuild: 5,
	paused: 5,
	woken: 4,
	finished: 4,
	reaction: 4,
	chatter: 1,
	stalled: 4,
	bill: 3,
	busy: 2,
	coffeeQueue: 2,
	idle: 1,
	lateNight: 1,
	fridge: 0,
};

/** How long a bubble stays up: longer lines get longer. */
export const bubbleMs = (text: string) => Math.min(7_000, Math.max(2_500, 2_000 + 55 * text.length));

/** `{placeholders}` filled in, or undefined when one has no value. */
export function fill(text: string, vars: LineVars): string | undefined {
	let missing = false;
	const out = text.replace(/\{(\w+)\}/g, (_, k: string) => {
		const v = (vars as Record<string, unknown>)[k];
		if (v === undefined || v === "") {
			missing = true;
			return "";
		}
		return String(v);
	});
	return missing ? undefined : out;
}

/** Lines that fit a trigger by role, tag and magnitude, before any repeat rule. */
export function fitting(t: Trigger, kind: "bubble" | "sign", lines: Line[] = LINES): Line[] {
	const of = lines.filter(
		(l) =>
			l.trigger === t.kind &&
			(kind === "sign") === (l.kind === "sign") &&
			(l.tag === undefined || l.tag === t.tag) &&
			(l.needs === undefined || (t.crew?.[l.needs.role] ?? 0) >= l.needs.n) &&
			(l.min === undefined || t.magnitude >= l.min) &&
			(l.max === undefined || t.magnitude < l.max),
	);
	if (kind === "sign") return of;
	const own = of.filter((l) => l.role === "anyone" || l.role === t.role);
	// A crew member with no lines of its own borrows the lead's: better a line than none.
	return own.length ? own : of;
}

/** The highest tier a trigger has reached: the largest `min` among its fitting lines. */
const tierOf = (t: Trigger, lines: Line[] = LINES) => Math.max(0, ...fitting(t, "bubble", lines).map((l) => l.min ?? 0));

/** A seeded weighted pick from the highest tier on offer; rare lines seldom. */
function pick(cands: Line[], _t: Trigger, seedKey: string, rareWeight = DEFAULTS.rareWeight): Line | undefined {
	if (!cands.length) return undefined;
	// Escalation: once a trigger has reached a tier, its lines for that tier come first; lower
	// ones come back only after those have been said (and so are out of `cands`).
	const top = Math.max(0, ...cands.map((l) => l.min ?? 0));
	if (top > 0) cands = cands.filter((l) => l.min === top);
	const weights = cands.map((l) => (l.rare ? rareWeight : 1));
	let r = unit(seedKey) * weights.reduce((a, b) => a + b, 0);
	for (let i = 0; i < cands.length; i++) {
		r -= weights[i]!;
		if (r < 0) return cands[i];
	}
	return cands[cands.length - 1];
}

interface Ongoing {
	saidAt: number;
	tier: number;
}

export class Scheduler {
	readonly opts: Required<SchedulerOptions>;
	#lines: Line[];
	#active: Say[] = [];
	#pending: { t: Trigger; since: number }[] = [];
	#ongoing: Trigger[] = [];
	/** Keys of events already taken, with when. */
	#seen = new Map<string, number>();
	#states = new Map<string, Ongoing>();
	#spokeAt = new Map<string, number>();
	/** "who|line" and "line" (the bank text, before filling) to when it was last said. */
	#saidBy = new Map<string, number>();
	#said = new Map<string, number>();
	#lastStart = -Infinity;
	#picks = 0;
	#view: View = { zoom: 1 };
	#startedAt: number | undefined;

	constructor(opts: SchedulerOptions = {}, lines: Line[] = LINES) {
		this.opts = { ...DEFAULTS, ...opts };
		this.#lines = lines;
	}

	/** The bank it picks from: another theme's lines from the next step on (cooldowns carry over). */
	setLines(lines: Line[]): void {
		this.#lines = lines;
	}

	/** Bubbles up at `now`. */
	active(now: number): Say[] {
		return this.#active.filter((b) => b.until > now);
	}

	/**
	 * Takes the latest triggers (or, with none, keeps the last ongoing ones) and returns the new
	 * bubbles to show now, plus sign lines for triggers seen for the first time.
	 */
	step(now: number, view: View, triggers?: Trigger[]): { says: Say[]; signs: SignLine[] } {
		const o = this.opts;
		this.#view = view;
		this.#startedAt ??= now;
		this.#active = this.active(now);
		const signs: SignLine[] = [];
		if (triggers) {
			this.#ongoing = triggers.filter((t) => t.ongoing);
			const live = new Set(this.#ongoing.map((t) => t.key));
			for (const k of this.#states.keys()) if (!live.has(k)) this.#states.delete(k);
			for (const t of triggers) {
				if (this.#seen.has(t.key)) continue;
				this.#seen.set(t.key, now);
				if (!t.ongoing) this.#pending.push({ t, since: now });
				const sign = this.#pickSign(t, now);
				if (sign) signs.push(sign);
			}
		}
		this.#prune(now);

		const cands: Trigger[] = [...this.#pending.map((p) => p.t), ...(this.#settled(now) ? this.#ongoing.filter((t) => this.#due(t, now)) : [])];
		cands.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || b.magnitude - a.magnitude || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

		const says: Say[] = [];
		const max = o.maxBubbles(view.zoom);
		for (const t of cands) {
			if (this.#active.length >= max || now - this.#lastStart < o.gapMs) break;
			if (this.#active.some((b) => b.who === t.who)) continue;
			if (now - (this.#spokeAt.get(t.who) ?? -Infinity) < o.cooldownMs) continue;
			const longOk = view.zoom >= o.longZoom || view.room === t.project;
			const options = fitting(t, "bubble", this.#lines)
				.map((line) => ({ line, text: fill(line.text, t.vars) }))
				.filter((c): c is { line: Line; text: string } => c.text !== undefined)
				.filter((c) => longOk || c.text.length <= o.longChars)
				.filter((c) => now - (this.#saidBy.get(`${t.who}|${c.line.text}`) ?? -Infinity) >= o.repeatMs)
				.filter((c) => now - (this.#said.get(c.line.text) ?? -Infinity) >= o.anyoneRepeatMs);
			const line = pick(options.map((c) => c.line), t, `${o.seed}|${t.key}|${now}|${this.#picks++}`, o.rareWeight);
			if (!line) {
				// Nothing fits right now (all said, or all too long at this zoom). An event is
				// dropped; an ongoing state waits until it escalates or `againMs` passes.
				this.#taken(t, now);
				continue;
			}
			const text = options.find((c) => c.line === line)!.text;
			const say: Say = { who: t.who, session: t.session, text, kind: line.kind === "thought" ? "thought" : "said", trigger: t.kind, project: t.project, line, at: now, until: now + bubbleMs(text) };
			says.push(say);
			this.#active.push(say);
			this.#lastStart = now;
			this.#spokeAt.set(t.who, now);
			// Repeats are by line, not by filled text: "No output for 9 minutes" and "...10 minutes" are one line.
			this.#saidBy.set(`${t.who}|${line.text}`, now);
			this.#said.set(line.text, now);
			this.#taken(t, now);
		}
		return { says, signs };
	}

	/**
	 * When the scheduler next has something to do: a bubble ending, a pending event's turn, or an
	 * ongoing state coming due. Undefined when nothing is up or waiting, so the scene can sleep.
	 */
	nextWake(now: number): number | undefined {
		const o = this.opts;
		const active = this.active(now);
		const times: number[] = active.map((b) => b.until);
		const full = active.length >= o.maxBubbles(this.#view.zoom) ? Math.min(...active.map((b) => b.until)) : -Infinity;
		const ready = (t: Trigger) =>
			Math.max(now + 1, full, this.#lastStart + o.gapMs, (this.#spokeAt.get(t.who) ?? -Infinity) + o.cooldownMs, ...active.filter((b) => b.who === t.who).map((b) => b.until));
		for (const p of this.#pending) times.push(Math.min(ready(p.t), p.since + o.eventTtlMs));
		for (const t of this.#ongoing) {
			const s = this.#states.get(t.key);
			const settled = (this.#startedAt ?? now) + o.settleMs;
			times.push(Math.max(settled, s ? Math.max(ready(t), s.saidAt + o.againMs) : ready(t)));
		}
		const later = times.filter((x) => x > now);
		return later.length ? Math.min(...later) : undefined;
	}

	#settled(now: number): boolean {
		return now >= (this.#startedAt ?? now) + this.opts.settleMs;
	}

	#due(t: Trigger, now: number): boolean {
		const s = this.#states.get(t.key);
		if (!s) return true;
		return tierOf(t, this.#lines) > s.tier || now - s.saidAt >= this.opts.againMs;
	}

	#taken(t: Trigger, now: number) {
		if (t.ongoing) this.#states.set(t.key, { saidAt: now, tier: tierOf(t, this.#lines) });
		else this.#pending = this.#pending.filter((p) => p.t.key !== t.key);
	}

	#pickSign(t: Trigger, now: number): SignLine | undefined {
		const options = fitting(t, "sign", this.#lines)
			.map((line) => ({ line, text: fill(line.text, t.vars) }))
			.filter((c): c is { line: Line; text: string } => c.text !== undefined);
		const line = pick(options.map((c) => c.line), t, `${this.opts.seed}|sign|${t.key}|${now}`, this.opts.rareWeight);
		return line && { line, text: options.find((c) => c.line === line)!.text, trigger: t };
	}

	#prune(now: number) {
		const o = this.opts;
		this.#pending = this.#pending.filter((p) => now - p.since < o.eventTtlMs);
		for (const [k, at] of this.#seen) if (now - at > 6 * 60 * 60_000) this.#seen.delete(k);
		for (const [k, at] of this.#saidBy) if (now - at >= o.repeatMs) this.#saidBy.delete(k);
		for (const [k, at] of this.#said) if (now - at >= o.anyoneRepeatMs) this.#said.delete(k);
	}
}
