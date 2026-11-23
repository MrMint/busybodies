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
	/** Semitones every clip in the theme is shifted by (the audition's pitch slider): a stock voice made small. */
	pitch?: number;
	/**
	 * Syllable banks by voice id: recorded mochi-speak clips and the syllables cut from them
	 * (`[start, end]` in seconds), that the app strings into babble in that voice.
	 */
	grains?: Record<string, GrainClip[]>;
	/** Short voiced reactions by beat ("Hm?" for a wait, "Ta-da!" for done), in any voice of the pool. */
	reactions?: Partial<Record<TriggerKind, Take[]>>;
}

/** A recorded clip of mochi-speak and the syllables in it. */
export interface GrainClip {
	file: string;
	/** Each syllable's start and end, in seconds into the clip. */
	at: [number, number][];
	/** Each syllable's pitch in Hz (null with none: a breath, a laugh's air), and its loudness in dB. */
	hz?: (number | null)[];
	db?: number[];
}

/**
 * How characters sound (design/sound.md), switched with `?voice=` while we decide:
 *   synth      a key beat plays its clip if one shipped, else the synthesised babble (the first cut)
 *   syllables  every said bubble babbles from the theme's syllable banks; key beats in front, the rest murmured
 *   reactions  as syllables, but a key beat says a short voiced reaction ("Ta-da!") when there is one
 *   lines      as syllables, but a key beat speaks its whole line when it was recorded
 */
export const VOICE_MODES = ["synth", "syllables", "reactions", "lines"] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];
export const voiceMode = (v: string | null | undefined): VoiceMode => ((VOICE_MODES as readonly string[]).includes(v ?? "") ? (v as VoiceMode) : "synth");

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

export type SpeechLimits = { graceMs: number; gapMs: number; perWhoMs: number; perLineMs: number; windowMs: number; perWindow: number };

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

/**
 * The murmur: ordinary said bubbles (chatter, reactions, the busy lines), babbled quietly under the
 * key beats. More often than a key beat, never two on top of each other, and never the same
 * character twice in a row.
 */
export const MURMUR_LIMITS: SpeechLimits = {
	graceMs: SPEECH_LIMITS.graceMs,
	gapMs: 2_500,
	perWhoMs: 15_000,
	perLineMs: 60_000,
	windowMs: 10_000,
	perWindow: 3,
};

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
	readonly #limits: SpeechLimits;
	readonly #wants: (h: Heard) => boolean;

	/**
	 * `graceMs` overrides the grace (`?speechgrace=0` in tests). `murmur` makes the quiet layer
	 * instead: it takes the said bubbles that aren't key beats, under `MURMUR_LIMITS`.
	 */
	constructor(o: { graceMs?: number; murmur?: boolean } = {}) {
		const base = o.murmur ? MURMUR_LIMITS : SPEECH_LIMITS;
		this.#limits = { ...base, graceMs: o.graceMs ?? base.graceMs };
		this.#wants = o.murmur ? (h) => h.kind === "said" && !VOICED.includes(h.trigger) : (h) => h.kind === "said" && VOICED.includes(h.trigger);
	}

	/** Live from `now` (sound on and on screen); `undefined` when not live. Restarts the grace. */
	live(now: number | undefined): void {
		if (now === undefined) this.#since = undefined;
		else this.#since ??= now;
	}

	/** The one bubble to speak now, if any; it is booked against the cooldowns. */
	choose(heard: readonly Heard[], now: number): Heard | undefined {
		const L = this.#limits;
		if (this.#since === undefined || now - this.#since < L.graceMs) return undefined;
		this.#recent = this.#recent.filter((t) => now - t < L.windowMs);
		if (this.#recent.length >= L.perWindow) return undefined;
		if (this.#last !== undefined && now - this.#last < L.gapMs) return undefined;
		const ok = heard
			.filter(this.#wants)
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

// --- Syllable babble ----------------------------------------------------------------------------

/** One syllable to play: which clip, where in it, how far to shift it, and the pause after. */
export interface GrainStep {
	file: string;
	start: number;
	end: number;
	/** Cents to shift it by, everything included (the melody, the theme's pitch, the character's). */
	cents: number;
	/** Seconds before the next syllable starts after this one ends: negative overlaps them. */
	gap: number;
	/** Its level, evening out loud and quiet syllables. */
	gain: number;
}

/**
 * The key every mochi sings in: the major pentatonic on C. Babble lands on its notes, so a line has a
 * tune instead of a scatter, and an earcon in the same key sits with it (design/sound.md).
 */
export const MOCHI_KEY = { rootHz: 261.63, scale: [0, 2, 4, 7, 9] } as const;

/** Every note of the key as semitones from its root, over a few octaves either way. */
const LADDER: number[] = [];
for (let o = -3; o <= 3; o++) for (const n of MOCHI_KEY.scale) LADDER.push(o * 12 + n);
/** The ladder's step nearest a pitch in semitones. */
const nearestStep = (semis: number) => LADDER.reduce((best, n, i) => (Math.abs(n - semis) < Math.abs(LADDER[best]! - semis) ? i : best), 0);

/** A word's syllables, roughly: its vowel groups, less a silent final e ("some", "rope", not "the" or "table"). */
export function syllablesOf(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	let n = w.match(/[aeiouy]+/g)?.length ?? 1;
	if (n > 1 && /[^aeiouyl]e$/.test(w)) n--;
	return Math.max(1, n);
}

/** A line as words of syllables: how many each word gets, and the pause after it. */
export function wordsOf(text: string): { syllables: number; pause: "word" | "comma" | "stop" | "end" }[] {
	const tokens = text.replace(/\{[a-z0-9]+\}/gi, "la").replace(/<[^>]*>/g, " ").match(/[A-Za-z'0-9-]+|[,;:]|[.!?]+/g) ?? [];
	const out: { syllables: number; pause: "word" | "comma" | "stop" | "end" }[] = [];
	for (const t of tokens) {
		if (/^[,;:]$/.test(t)) {
			if (out.length) out.at(-1)!.pause = "comma";
		} else if (/^[.!?]+$/.test(t)) {
			if (out.length) out.at(-1)!.pause = "stop";
		} else out.push({ syllables: Math.max(1, Math.min(3, syllablesOf(t))), pause: "word" });
	}
	if (out.length) out.at(-1)!.pause = "end";
	return out;
}

/** A small deterministic sequence from a seed (xorshift), as sound.ts's `seq`. */
function seq(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 0x100000000;
	};
}

/**
 * A line as syllables from a voice's bank. Two ways:
 *
 * smooth (the default): word by word, a word's syllables from one take and overlapping a little, a
 *   short breath between words and a longer one at a comma; every syllable retuned from its own
 *   pitch onto one melody in `MOCHI_KEY` around the voice's middle (falling at a full stop, rising
 *   at "?", up at "!", a lift on each word's first syllable) and levelled to the bank's middle
 *   loudness. Only syllables with a clear pitch within an octave of the voice's middle are used.
 * raw (the first cut): any syllables, their own pitch plus a loose tune and jitter, uneven gaps.
 *
 * `base` is cents on top (the theme's pitch plus the character's own); `max` caps the syllables
 * (the murmur is short). Every choice comes from the character and the words, never Math.random.
 */
export function grainPlan(who: string, text: string, bank: readonly GrainClip[], o: { max?: number; base?: number; raw?: boolean } = {}): GrainStep[] {
	const max = o.max ?? 14;
	const base = o.base ?? 0;
	const r = seq(hash(`grain|${who}|${text}`));
	const all = bank.flatMap((c, ci) => c.at.map(([start, end], i) => ({ clip: ci, file: c.file, start, end, hz: c.hz?.[i] ?? null, db: c.db?.[i] })));
	if (!all.length) return [];
	const voiced = all.filter((g) => g.hz !== null);
	const mid = median(voiced.map((g) => g.hz!));
	const pool = o.raw || mid === undefined ? [] : voiced.filter((g) => Math.abs(Math.log2(g.hz! / mid)) <= 1 && g.end - g.start >= 0.08);
	if (pool.length < 3) return rawPlan(r, text, all, max, base);

	const loud = median(pool.map((g) => g.db ?? -20)) ?? -20;
	const { tune } = babbleOf(text);
	let words = wordsOf(text);
	// Over the cap, keep the opening words and the last one (it carries the tune's end).
	while (words.reduce((n, w) => n + w.syllables, 0) > max && words.length > 1) words.splice(words.length - 2, 1);
	const n = Math.min(max, words.reduce((k, w) => k + w.syllables, 0));
	// The voice's middle, moved by the theme and the character, onto the key: where the tune starts from.
	const home = nearestStep(12 * Math.log2(mid! / MOCHI_KEY.rootHz) + base / 100);
	const out: GrainStep[] = [];
	let i = 0;
	let last = -1;
	for (const w of words) {
		let clip = -1;
		for (let k = 0; k < w.syllables && i < n; k++, i++) {
			const x = n > 1 ? i / (n - 1) : 0;
			// The tune, in steps of the key from home.
			const steps = tune === "rise" ? -0.5 + 3 * x * x : tune === "bright" ? 1 - x + (i === n - 1 ? 3 : 0) : 1.5 - 2.5 * x;
			const lift = k === 0 && w.syllables > 1 ? 0.6 : 0;
			const note = LADDER[Math.max(0, Math.min(LADDER.length - 1, home + Math.round(steps + lift)))]!;
			// A word keeps to one take when it can, so its syllables sound like one word.
			const same = pool.map((g, j) => j).filter((j) => pool[j]!.clip === clip && j !== last);
			const choices = same.length && r() < 0.8 ? same : pool.map((_, j) => j).filter((j) => j !== last);
			const j = choices[Math.floor(r() * choices.length)] ?? 0;
			const g = pool[j]!;
			last = j;
			clip = g.clip;
			const own = 12 * Math.log2(g.hz! / MOCHI_KEY.rootHz);
			const end = k === w.syllables - 1 || i === n - 1;
			const gap = !end ? -0.03 : w.pause === "comma" ? 0.16 : w.pause === "stop" ? 0.24 : w.pause === "end" ? 0 : 0.04 + r() * 0.025;
			const gain = Math.max(0.6, Math.min(1.6, 10 ** ((loud - (g.db ?? loud)) / 20))) * (k === 0 ? 1.08 : 1) * (i === n - 1 ? 0.92 : 1);
			out.push({ file: g.file, start: g.start, end: g.end, cents: Math.round((note - own) * 100), gap: Math.round(gap * 1000) / 1000, gain: Math.round(gain * 100) / 100 });
		}
	}
	return out;
}

function median(xs: number[]): number | undefined {
	if (!xs.length) return undefined;
	const s = [...xs].sort((a, b) => a - b);
	return s[s.length >> 1];
}

/** The first cut: any syllables, a loose tune and jitter, uneven gaps (for comparison, and banks with no pitches). */
function rawPlan(r: () => number, text: string, pool: { file: string; start: number; end: number }[], max: number, base: number): GrainStep[] {
	const { syllables, tune } = babbleOf(text);
	const n = Math.min(max, syllables);
	const out: GrainStep[] = [];
	let last = -1;
	for (let i = 0; i < n; i++) {
		let k = Math.floor(r() * pool.length);
		if (k === last && pool.length > 1) k = (k + 1) % pool.length;
		last = k;
		const x = n > 1 ? i / (n - 1) : 0;
		const shape = tune === "rise" ? 500 * x * x - 100 : tune === "bright" ? 200 - 150 * x + (i === n - 1 ? 250 : 0) : 150 - 350 * x;
		const g = pool[k]!;
		out.push({ file: g.file, start: g.start, end: g.end, cents: Math.round(base + shape + (r() - 0.5) * 120), gap: 0.015 + r() * 0.05 + (r() < 0.12 ? 0.08 : 0), gain: 1 });
	}
	return out;
}
