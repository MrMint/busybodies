// Voiced lines, beside the synth (sound.ts): a small sample player for clips recorded ahead of
// time (tools/voice.ts), on-device babble for the lines no clip can cover, and an optional room loop
// per theme. Only key beats speak (a wait on you, the work done, back to work), at most one at a
// time, with cooldowns (sass/voiced.ts `Mouth`); a thought stays a thought.
//
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
import { EMPTY_MANIFEST, Mouth, type VoiceManifest, babbleHz, babbleOf, lineKey, pickTake, pitchCents, templated } from "../scene/sass/voiced";
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
}

export interface Spoken {
	who: string;
	text: string;
	how: "clip" | "babble";
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
	}

	/** From each voice run: the bubbles that just went up. Speaks at most one of them. */
	hear(says: readonly Say[]): void {
		const bus = this.#host.sound.bus();
		const now = this.#host.clock?.() ?? performance.now();
		this.#mouth.live(bus ? now : undefined);
		if (!bus) return;
		this.#load();
		const h = this.#mouth.choose(
			says.map((s) => ({ who: keyFor(s), text: s.text, kind: s.kind, trigger: s.trigger })),
			now,
		);
		if (h) void this.#say(h.who, h.text, bus);
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

	async #say(who: string, text: string, bus: { ctx: AudioContext; out: AudioNode }): Promise<void> {
		await this.#loading;
		const ctx = bus.ctx;
		const theme = this.#host.theme();
		const voices = this.#manifest?.themes[theme];
		const key = lineKey(text);
		const entry = templated(text) ? undefined : voices?.lines[key];
		const take = entry && pickTake(entry.takes, who, voices!.voices, (this.#mouth.turns.get(key) ?? 1) - 1);
		const buf = take ? await this.#buffer(ctx, `voice/${take.file}`) : undefined;
		// Sound may have gone quiet while the clip loaded.
		if (!this.#host.sound.bus()) return;

		const area = this.#host.areaOf(who);
		const floor = this.#host.floor();
		const rect = area ? floor?.areas.find((a) => a.id === area)?.rect : undefined;
		const pan = panFor(rect, this.#host.view(), this.#host.width());
		const room = loudness(area, zoomedArea(this.#host.stop(), floor));
		const out = ctx.createGain();
		const panner = ctx.createStereoPanner();
		panner.pan.value = pan;
		out.connect(panner).connect(bus.out);
		const at = ctx.currentTime + LEAD_IN;
		const cents = pitchCents(who);
		let secs: number;
		if (buf) {
			out.gain.value = CLIP_GAIN * room;
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.detune.value = cents;
			src.connect(out);
			src.start(at);
			secs = buf.duration / 2 ** (cents / 1200);
		} else {
			out.gain.value = BABBLE_GAIN * room;
			secs = babble(ctx, out, at, who, text);
		}
		this.#host.sound.duck(at, secs);
		if (this.#room) {
			const g = this.#room.out.gain;
			g.cancelScheduledValues(ctx.currentTime);
			g.setTargetAtTime(ROOM_GAIN * 0.4, at, 0.08);
			g.setTargetAtTime(ROOM_GAIN, at + secs, 0.4);
		}
		setTimeout(() => {
			out.disconnect();
			panner.disconnect();
		}, (LEAD_IN + secs + 1) * 1000);
		this.#last.push({ who, text, how: buf ? "clip" : "babble", file: buf ? take!.file : undefined, cents, at: Math.round(at * 1000) / 1000, secs: Math.round(secs * 1000) / 1000, pan, gain: Math.round(out.gain.value * 100) / 100 });
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
