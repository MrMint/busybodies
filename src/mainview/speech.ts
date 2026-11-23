// Voiced lines, beside the synth (sound.ts): a small sample player for clips recorded ahead of
// time (tools/voice.ts), on-device babble for the lines no clip can cover, and an optional room loop
// per theme. Key beats (a wait on you, the work done, back to work) speak in front, at most one at a
// time, with cooldowns (sass/voiced.ts `Mouth`); in the babble modes the other said bubbles murmur
// quietly underneath. A thought stays a thought. How characters sound is still being decided
// (design/sound.md): `?voice=` picks a mode (sass/voiced.ts `VOICE_MODES`), and `?lab` lets you
// switch live.
//
//   syllables  slices of recorded mochi-speak in the character's own voice, strung into new babble
//   a clip     a line with an approved take in voice/manifest.json: the character's own voice's
//              take when there is one, else the line's takes in turn; pitched a little per character
//   babble     a line with a {placeholder} (a time, a name), or one with no take yet: a few
//              formant-filtered blips per syllable, at the character's own pitch, tuned by its "?" or "!"
//   room loop  a seamless recording per theme (ambience/sources.json), if one shipped
//
// The room tone dips under every line. Nothing here is made until sound is live (on, on screen,
// not calm): it plays through Sound's own context and master, so Sound's suspend covers it too.
// Pitch and every babble choice come from the character's key, never Math.random. Nothing is
// fetched but the app's own files: the manifest, the clips and the loops ship with it.
import type { Stop, View } from "../scene/office/camera";
import type { World as Floor } from "../scene/office/world";
import { type Say, keyFor } from "../scene/sass";
import type { TriggerKind } from "../scene/sass/types";
import { EMPTY_MANIFEST, type GrainStep, Mouth, type VoiceManifest, type VoiceMode, babbleHz, babbleOf, grainPlan, lineKey, ownVoice, pickTake, pitchCents, templated } from "../scene/sass/voiced";
import type { ThemeId } from "../scene/theme/id";
import { type Sound, hashId, loudness, panFor, seq, zoomedArea } from "./sound";

export interface SpeechHost {
	sound: Sound;
	theme(): ThemeId;
	floor(): Floor | undefined;
	view(): View;
	stop(): Stop;
	width(): number;
	/** The area a character's room is in, for pan and loudness. */
	areaOf(key: string): string | undefined;
	/** Wall-clock ms, for the cooldowns. */
	clock?(): number;
	/** Where the shipped files are, relative to the page: "" by default. */
	base?: string;
	/** How long the room stays quiet once live (sass/voiced.ts `SPEECH_LIMITS.graceMs` by default). */
	graceMs?: number;
	/** How characters sound (`?voice=`); "synth" by default. */
	mode?: VoiceMode;
}

/** What the lab can turn while it plays (mainview/lab.ts). */
export interface SpeechMix {
	mode: VoiceMode;
	/** The quiet layer of ordinary bubbles, in the babble modes. */
	murmur: boolean;
	/** Levels: the key beats, and the murmur under them. */
	front: number;
	under: number;
	/** Semitones instead of the theme's own, while auditioning; undefined keeps the manifest's. */
	pitch?: number;
}

export interface Spoken {
	who: string;
	text: string;
	layer: "front" | "murmur";
	how: "clip" | "reaction" | "syllables" | "babble";
	file?: string;
	cents: number;
	/** When it starts, in the AudioContext's seconds, and how long it runs. */
	at: number;
	secs: number;
	pan: number;
	gain: number;
}

export interface SpeechState {
	manifest: "none" | "loading" | "ready" | "failed";
	mix: SpeechMix;
	/** Lines with a clip, in the current theme. */
	clips: number;
	room: { file?: string; running: boolean };
	/** The last lines spoken, newest last. */
	last: Spoken[];
}

/** A room loop that shipped: where it came from and under what licence (tools/ambience.ts). */
export interface RoomLoop {
	theme: ThemeId;
	file: string;
	source: string;
	licence: string;
}

interface Room {
	theme: ThemeId;
	file: string;
	src?: AudioBufferSourceNode;
	out: GainNode;
}

/** After the bubble pops (and after any earcon of the same beat), the line starts. */
const LEAD_IN = 0.6;
const CLIP_GAIN = 0.9;
const BABBLE_GAIN = 0.22;
/** Syllable babble in front: a little under a clip, as it's busier. */
const GRAIN_GAIN = 0.8;
/** The murmur, against the front. */
const UNDER_GAIN = 0.35;
/** The murmur is short: at most this many syllables. */
const MURMUR_SYLLABLES = 6;
/** A syllable's fade in and out, so a cut never clicks. */
const GRAIN_FADE = 0.008;
const ROOM_GAIN = 0.45;

/** Formants (F1, F2) of a few vowels, for the babble: a, e, i, o, u. */
const VOWELS: readonly [number, number][] = [
	[800, 1200],
	[500, 1900],
	[320, 2300],
	[500, 900],
	[350, 800],
];

export class Speech {
	#host: SpeechHost;
	#mouth: Mouth;
	#murmur: Mouth;
	#mix: SpeechMix;
	#manifest?: VoiceManifest;
	#loading?: Promise<void>;
	#status: SpeechState["manifest"] = "none";
	#loops?: RoomLoop[];
	#buffers = new Map<string, Promise<AudioBuffer | undefined>>();
	#room?: Room;
	#last: Spoken[] = [];

	constructor(host: SpeechHost) {
		this.#host = host;
		this.#mouth = new Mouth({ graceMs: host.graceMs });
		this.#murmur = new Mouth({ graceMs: host.graceMs, murmur: true });
		this.#mix = { mode: host.mode ?? "synth", murmur: true, front: 1, under: 1 };
	}

	/** From each voice run: the bubbles that just went up. Speaks at most one key beat, and murmurs at most one other. */
	hear(says: readonly Say[]): void {
		this.heard(says.map((s) => ({ who: keyFor(s), text: s.text, kind: s.kind, trigger: s.trigger })));
	}

	/** As `hear`, from bubbles already keyed by character (the lab's timeline makes these). */
	heard(heard: readonly { who: string; text: string; kind: "said" | "thought"; trigger: TriggerKind }[]): void {
		const bus = this.#host.sound.bus();
		const now = this.#host.clock?.() ?? performance.now();
		this.#mouth.live(bus ? now : undefined);
		this.#murmur.live(bus ? now : undefined);
		if (!bus) return;
		this.#load();
		const front = this.#mouth.choose(heard, now);
		if (front) void this.#say(front, "front", bus);
		if (this.#mix.mode === "synth" || !this.#mix.murmur) return;
		const under = this.#murmur.choose(heard.filter((h) => h !== front), now);
		if (under) void this.#say(under, "murmur", bus);
	}

	/** The lab's knobs (mainview/lab.ts). */
	get mix(): SpeechMix {
		return { ...this.#mix };
	}
	setMix(change: Partial<SpeechMix>): void {
		this.#mix = { ...this.#mix, ...change };
	}

	/** Bring the room loop in line with sound being live and the theme. */
	update(): void {
		const bus = this.#host.sound.bus();
		if (!bus) {
			this.#mouth.live(undefined);
			return this.#stopRoom();
		}
		this.#load();
		const theme = this.#host.theme();
		const loop = this.#loops?.find((l) => l.theme === theme);
		if (this.#room && (this.#room.theme !== theme || this.#room.file !== loop?.file)) this.#stopRoom();
		if (!loop || this.#room) return;
		const out = bus.ctx.createGain();
		out.gain.value = 0;
		out.gain.setTargetAtTime(ROOM_GAIN, bus.ctx.currentTime, 2);
		out.connect(bus.out);
		const room: Room = { theme, file: loop.file, out };
		this.#room = room;
		void this.#buffer(bus.ctx, `ambience/${loop.file}`).then((buf) => {
			if (!buf || this.#room !== room) return;
			const src = bus.ctx.createBufferSource();
			src.buffer = buf;
			src.loop = true;
			// Start somewhere in the loop picked from the theme, so it never opens on the same beat.
			src.connect(out);
			src.start(0, ((hashId(theme) % 1000) / 1000) * buf.duration);
			room.src = src;
		});
	}

	state(): SpeechState {
		const t = this.#manifest?.themes[this.#host.theme()];
		return {
			manifest: this.#status,
			mix: this.mix,
			clips: t ? Object.keys(t.lines).length : 0,
			room: { file: this.#room?.file, running: !!this.#room?.src },
			last: [...this.#last],
		};
	}

	#load(): void {
		if (this.#loading) return;
		this.#status = "loading";
		const base = this.#host.base ?? "";
		const json = <T>(path: string, dflt: T) =>
			fetch(`${base}${path}`)
				.then((r) => (r.ok ? (r.json() as Promise<T>) : dflt))
				.catch(() => dflt);
		this.#loading = Promise.all([json<VoiceManifest | undefined>("voice/manifest.json", undefined), json<RoomLoop[]>("ambience/sources.json", [])]).then(([m, loops]) => {
			this.#manifest = m?.version === 1 ? m : EMPTY_MANIFEST;
			this.#status = m?.version === 1 ? "ready" : "failed";
			this.#loops = Array.isArray(loops) ? loops : [];
			this.update();
		});
	}

	/** A shipped file, decoded once; `undefined` if it can't be fetched or this webview can't decode it. */
	#buffer(ctx: AudioContext, path: string): Promise<AudioBuffer | undefined> {
		let p = this.#buffers.get(path);
		if (!p) {
			p = fetch(`${this.#host.base ?? ""}${path}`)
				.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
				.then((b) => ctx.decodeAudioData(b))
				.catch(() => undefined);
			this.#buffers.set(path, p);
		}
		return p;
	}

	async #say(h: { who: string; text: string; trigger: TriggerKind }, layer: "front" | "murmur", bus: { ctx: AudioContext; out: AudioNode }): Promise<void> {
		await this.#loading;
		const { who, text } = h;
		const ctx = bus.ctx;
		const mode = this.#mix.mode;
		const voices = this.#manifest?.themes[this.#host.theme()];
		const pitch = (this.#mix.pitch ?? voices?.pitch ?? 0) * 100;
		const cents = pitchCents(who);

		// What to play: a recorded clip (a reaction or the line), or syllables, or the synth's babble.
		let clip: { file: string; how: "clip" | "reaction" } | undefined;
		if (layer === "front" && mode === "reactions") {
			const takes = voices?.reactions?.[h.trigger];
			const t = takes && pickTake(takes, who, voices!.voices, this.#mouth.turns.get(lineKey(text)) ?? 0);
			if (t) clip = { file: t.file, how: "reaction" };
		}
		if (layer === "front" && (mode === "synth" || mode === "lines") && !templated(text)) {
			const key = lineKey(text);
			const entry = voices?.lines[key];
			const t = entry && pickTake(entry.takes, who, voices!.voices, (this.#mouth.turns.get(key) ?? 1) - 1);
			if (t) clip = { file: t.file, how: "clip" };
		}
		const buf = clip ? await this.#buffer(ctx, `voice/${clip.file}`) : undefined;
		let steps: GrainStep[] = [];
		const grains = new Map<string, AudioBuffer>();
		if (!buf && mode !== "synth" && voices?.grains) {
			const own = ownVoice(who, Object.keys(voices.grains));
			const bank = own ? voices.grains[own] : undefined;
			if (bank) {
				steps = grainPlan(who, text, bank, layer === "murmur" ? MURMUR_SYLLABLES : undefined);
				for (const file of new Set(steps.map((s) => s.file))) {
					const b = await this.#buffer(ctx, `voice/${file}`);
					if (b) grains.set(file, b);
				}
				steps = steps.filter((s) => grains.has(s.file));
			}
		}
		// Sound may have gone quiet while the clips loaded.
		if (!this.#host.sound.bus()) return;

		const area = this.#host.areaOf(who);
		const floor = this.#host.floor();
		const rect = area ? floor?.areas.find((a) => a.id === area)?.rect : undefined;
		const pan = panFor(rect, this.#host.view(), this.#host.width());
		const room = loudness(area, zoomedArea(this.#host.stop(), floor)) * (layer === "front" ? this.#mix.front : this.#mix.under * UNDER_GAIN);
		const out = ctx.createGain();
		const panner = ctx.createStereoPanner();
		panner.pan.value = pan;
		out.connect(panner).connect(bus.out);
		const at = ctx.currentTime + (layer === "front" ? LEAD_IN : 0.15);
		let secs: number;
		let how: Spoken["how"];
		if (buf) {
			out.gain.value = CLIP_GAIN * room;
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.detune.value = cents + pitch;
			src.connect(out);
			src.start(at);
			secs = buf.duration / 2 ** (src.detune.value / 1200);
			how = clip!.how;
		} else if (steps.length) {
			out.gain.value = GRAIN_GAIN * room;
			secs = playGrains(ctx, out, at, steps, grains, cents + pitch);
			how = "syllables";
		} else {
			out.gain.value = BABBLE_GAIN * room;
			secs = babble(ctx, out, at, who, layer === "murmur" ? text.split(/[.!?]/)[0]! : text);
			how = "babble";
		}
		if (layer === "front") {
			this.#host.sound.duck(at, secs);
			if (this.#room) {
				const g = this.#room.out.gain;
				g.cancelScheduledValues(ctx.currentTime);
				g.setTargetAtTime(ROOM_GAIN * 0.4, at, 0.08);
				g.setTargetAtTime(ROOM_GAIN, at + secs, 0.4);
			}
		}
		setTimeout(() => {
			out.disconnect();
			panner.disconnect();
		}, (LEAD_IN + secs + 1) * 1000);
		this.#last.push({ who, text, layer, how, file: buf ? clip!.file : undefined, cents, at: Math.round(at * 1000) / 1000, secs: Math.round(secs * 1000) / 1000, pan, gain: Math.round(out.gain.value * 100) / 100 });
		if (this.#last.length > 12) this.#last.shift();
	}

	#stopRoom(): void {
		const r = this.#room;
		if (!r) return;
		try {
			r.src?.stop();
		} catch {
			// Already stopped.
		}
		r.out.disconnect();
		this.#room = undefined;
	}
}

/**
 * Babble: one blip per syllable, a triangle wave through two vowel formants, at the character's own
 * pitch, falling at a full stop, rising at a "?", up and bright at a "!". Returns its length in s.
 */
export function babble(ctx: BaseAudioContext, out: AudioNode, at: number, who: string, text: string): number {
	const { syllables, tune } = babbleOf(text);
	const r = seq(hashId(`${who}|${text}`));
	const base = babbleHz(who);
	let t = at;
	for (let i = 0; i < syllables; i++) {
		const step = 0.085 + r() * 0.05;
		const x = syllables > 1 ? i / (syllables - 1) : 0;
		const shape = tune === "rise" ? 0.95 + 0.3 * x * x : tune === "bright" ? 1.12 - 0.1 * x + (i === syllables - 1 ? 0.15 : 0) : 1.08 - 0.22 * x;
		const f = base * shape * (0.94 + r() * 0.12);
		const [f1, f2] = VOWELS[Math.floor(r() * VOWELS.length)]!;
		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(f, t);
		osc.frequency.linearRampToValueAtTime(f * 0.97, t + step);
		const env = ctx.createGain();
		env.gain.setValueAtTime(0, t);
		env.gain.linearRampToValueAtTime(1, t + 0.012);
		env.gain.setTargetAtTime(0, t + step * 0.55, 0.025);
		for (const [freq, q, g] of [
			[f1, 5, 1],
			[f2, 8, 0.6],
		] as const) {
			const bp = ctx.createBiquadFilter();
			bp.type = "bandpass";
			bp.frequency.value = freq;
			bp.Q.value = q;
			const lvl = ctx.createGain();
			lvl.gain.value = g * 3;
			osc.connect(bp).connect(lvl).connect(env);
		}
		env.connect(out);
		osc.start(t);
		osc.stop(t + step + 0.1);
		// A breath at a comma or between words now and then.
		t += step + (r() < 0.15 ? 0.06 : 0);
	}
	return t - at + 0.1;
}

/**
 * Syllable babble: each step a slice of its clip, faded in and out over a few ms, shifted by the
 * character's pitch plus the step's tune. Returns its length in seconds.
 */
export function playGrains(ctx: BaseAudioContext, out: AudioNode, at: number, steps: readonly GrainStep[], buffers: ReadonlyMap<string, AudioBuffer>, cents: number): number {
	let t = at;
	for (const s of steps) {
		const buf = buffers.get(s.file);
		if (!buf) continue;
		const detune = cents + s.cents;
		const dur = Math.max(0.02, Math.min(s.end, buf.duration) - s.start);
		const len = dur / 2 ** (detune / 1200);
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.detune.value = detune;
		const env = ctx.createGain();
		env.gain.setValueAtTime(0, t);
		env.gain.linearRampToValueAtTime(1, t + GRAIN_FADE);
		env.gain.setValueAtTime(1, t + Math.max(GRAIN_FADE, len - GRAIN_FADE));
		env.gain.linearRampToValueAtTime(0, t + len);
		src.connect(env).connect(out);
		src.start(t, s.start, dur);
		t += len + s.gap;
	}
	return t - at;
}
