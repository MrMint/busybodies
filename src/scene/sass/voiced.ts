// Voiced lines: which bubbles are spoken aloud, how a line finds its recorded clip, and the turn
// taking that keeps the office from chattering. Pixi-free and WebAudio-free, so the dev tool that
// records the clips (tools/voice.ts), the app's player (mainview/speech.ts) and tests all share it.
//
// Clips are recorded ahead of time, offline, on the developer's machine; the app only plays what
// ships in `voice/manifest.json`. A line's key is a hash of its words, so a line whose words
// haven't changed is never recorded again. Only key beats speak (a wait on you starting, the work
// done, back to work after a nap), and only said lines (a thought stays a thought). A line with a
// placeholder (a name, a time, a count) can't be recorded once, so it gets on-device babble, as
// does a key-beat line with no approved clip yet.
import type { ThemeId } from "../theme/id";
import { sassFor } from "./bank";
import type { Line } from "./lines";
import { hash, type TriggerKind } from "./types";

/** The beats that speak: waiting on you, done, and starting work again. */
export const VOICED: readonly TriggerKind[] = ["waiting", "finished", "woken"];

/** Which goes first when several land together. */
const RANK: Record<string, number> = { waiting: 0, finished: 1, woken: 2 };

/** A line's words as the key sees them: trimmed, single-spaced. */
const norm = (text: string) => text.trim().replace(/\s+/g, " ");

/** A line's key: 16 hex digits from its words (two FNV-1a passes), the same in the tool and the app. */
export function lineKey(text: string): string {
	const t = norm(text);
	return hash(t).toString(16).padStart(8, "0") + hash(`~${t}`).toString(16).padStart(8, "0");
}

/** A line with a `{placeholder}`: babble, never a clip. */
export const templated = (text: string): boolean => /\{[a-z0-9]+\}/i.test(text);

/** One line a character can say aloud in a theme. */
export interface VoiceLine {
	key: string;
	text: string;
	trigger: TriggerKind;
	role: Line["role"];
	/** A key beat: spoken in the app. Other said lines are collected but stay silent for now. */
	beat: boolean;
	/** Has a placeholder: babble. */
	templated: boolean;
}

/**
 * Every fixed line a character can say in a theme (its sass bank, in its words): said lines only,
 * one per distinct text. Signs are written, thoughts are thought.
 */
export function corpus(theme: ThemeId): VoiceLine[] {
	const seen = new Set<string>();
	const out: VoiceLine[] = [];
	for (const l of sassFor(theme).lines) {
		if (l.kind !== "said" || seen.has(l.text)) continue;
		seen.add(l.text);
		out.push({ key: lineKey(l.text), text: l.text, trigger: l.trigger, role: l.role, beat: VOICED.includes(l.trigger), templated: templated(l.text) });
	}
	return out;
}

// --- The shipped manifest -----------------------------------------------------------------------

/** One recorded take of a line: which voice of the theme's pool, and the file under `voice/`. */
export interface Take {
	voice: string;
	file: string;
	/** Length in ms, for the duck. */
	ms: number;
}

export interface ThemeVoices {
	/** The theme's voice pool, by id, in order: a character's own voice is `voices[hash(id) % n]`. */
	voices: string[];
	lines: Record<string, { text: string; takes: Take[] }>;
}

/** `voice/manifest.json`: approved takes only (tools/voice.ts `ship` writes it). */
export interface VoiceManifest {
	version: 1;
	themes: Partial<Record<ThemeId, ThemeVoices>>;
}

export const EMPTY_MANIFEST: VoiceManifest = { version: 1, themes: {} };

/** A character's own voice in a pool, from its key: the same character, the same voice. */
export const ownVoice = (who: string, voices: readonly string[]): string | undefined => (voices.length ? voices[hash(`voice:${who}`) % voices.length] : undefined);

/**
 * A character's pitch, from its key: a few semitone-tenths either way, so two characters on one
 * voice don't sound like twins. In cents, within ±120.
 */
export const pitchCents = (who: string): number => Math.round(((hash(`pitch:${who}`) % 2401) - 1200) / 10);

/**
 * The take a character says: its own voice's take when the line has one, else the line's takes in
 * turn (`turn` counts how often the line was said), so a repeat isn't the same recording.
 */
export function pickTake(takes: readonly Take[], who: string, voices: readonly string[], turn: number): Take | undefined {
	if (!takes.length) return undefined;
	const own = ownVoice(who, voices);
	return takes.find((t) => t.voice === own) ?? takes[((turn % takes.length) + takes.length) % takes.length];
}

/** The voices a line is recorded in: `n` of the pool, starting at a place picked from its key. */
export function voicesFor(key: string, pool: readonly string[], n: number): string[] {
	if (!pool.length) return [];
	const start = hash(`cast:${key}`) % pool.length;
	return Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(start + i) % pool.length]!);
}

// --- Babble -------------------------------------------------------------------------------------

/** How a line babbles: syllables from its vowel groups, and the tune from its last mark. */
export function babbleOf(text: string): { syllables: number; tune: "fall" | "rise" | "bright" } {
	const groups = text.toLowerCase().match(/[aeiouy]+/g)?.length ?? 1;
	const tail = text.trim().at(-1);
	return { syllables: Math.max(2, Math.min(14, Math.round(groups * 0.8))), tune: tail === "?" ? "rise" : tail === "!" ? "bright" : "fall" };
}

/** A character's babble base pitch in Hz, from its key: 170 to 300. */
export const babbleHz = (who: string): number => 170 + (hash(`babble:${who}`) % 131);

// --- Turn taking --------------------------------------------------------------------------------

export const SPEECH_LIMITS = {
	/** Nothing is spoken until the room has been live this long: opening onto a waiting room is quiet. */
	graceMs: 10_000,
	/** Never two lines closer than this. */
	gapMs: 12_000,
	/** One character speaks at most this often. */
	perWhoMs: 45_000,
	/** The same words at most this often. */
	perLineMs: 300_000,
	/** And at most `perWindow` in any `windowMs`. */
	windowMs: 60_000,
	perWindow: 3,
} as const;

/** A bubble that might be spoken: from the voice's `Say`. */
export interface Heard {
	who: string;
	text: string;
	kind: "said" | "thought";
	trigger: TriggerKind;
}

/**
 * Decides which bubbles are spoken: key beats, said, past the grace, under every cooldown; the
 * most urgent one when several arrive together. Holds only times, so it is cheap to keep.
 */
export class Mouth {
	#since?: number;
	#last?: number;
	#who = new Map<string, number>();
	#line = new Map<string, number>();
	#recent: number[] = [];
	/** How often each line key was spoken, for round-robin takes. */
	readonly turns = new Map<string, number>();
	readonly #graceMs: number;

	/** `graceMs` overrides the grace (`?speechgrace=0` in tests). */
	constructor(o: { graceMs?: number } = {}) {
		this.#graceMs = o.graceMs ?? SPEECH_LIMITS.graceMs;
	}

	/** Live from `now` (sound on and on screen); `undefined` when not live. Restarts the grace. */
	live(now: number | undefined): void {
		if (now === undefined) this.#since = undefined;
		else this.#since ??= now;
	}

	/** The one bubble to speak now, if any; it is booked against the cooldowns. */
	choose(heard: readonly Heard[], now: number): Heard | undefined {
		if (this.#since === undefined || now - this.#since < this.#graceMs) return undefined;
		const L = SPEECH_LIMITS;
		this.#recent = this.#recent.filter((t) => now - t < L.windowMs);
		if (this.#recent.length >= L.perWindow) return undefined;
		if (this.#last !== undefined && now - this.#last < L.gapMs) return undefined;
		const ok = heard
			.filter((h) => h.kind === "said" && VOICED.includes(h.trigger))
			.filter((h) => now - (this.#who.get(h.who) ?? -Infinity) >= L.perWhoMs)
			.filter((h) => now - (this.#line.get(lineKey(h.text)) ?? -Infinity) >= L.perLineMs)
			.sort((a, b) => (RANK[a.trigger] ?? 9) - (RANK[b.trigger] ?? 9));
		const h = ok[0];
		if (!h) return undefined;
		const key = lineKey(h.text);
		this.#last = now;
		this.#recent.push(now);
		this.#who.set(h.who, now);
		this.#line.set(key, now);
		this.turns.set(key, (this.turns.get(key) ?? 0) + 1);
		return h;
	}
}
