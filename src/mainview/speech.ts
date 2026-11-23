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
import { EMPTY_MANIFEST, type GrainStep, type ThemeVoices, corpus, Mouth, type VoiceManifest, type VoiceMode, babbleHz, babbleOf, grainPlan, lineKey, ownVoice, pickTake, pitchCents, templated } from "../scene/sass/voiced";
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
	/** Syllables on one tune, levelled and joined (sass/voiced.ts `grainPlan`); off is the first, raw cut. */
	smooth: boolean;
	/** Voices through the shared voice bus (a little compression, the lows trimmed, the top softened) and the room. */
	shape: boolean;
	/** The shared room's level (sound.ts `roomChain`): 0 dry, 1 the default. */
	room: number;
	/** The crowd's level, 0 (off) to 2; it runs in the babble modes. */
	crowd: number;
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
	/** The crowd, while it murmurs (a babble mode, live, with banks): how many talkers, and phrases so far. */
	crowd?: { talkers: number; phrases: number };
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
/** The murmur is one short phrase: at most this many syllables. */
const MURMUR_SYLLABLES = 8;
/** Key beats sit in the crowd, not on top of it. */
const FRONT_LEVEL = 0.7;
/**
 * The crowd: a soft, distant murmur of the office at work, from the same syllable banks. Up to
 * `CROWD_TALKERS` talkers chat on and off (more of them the busier it is), each phrase panned
 * somewhere on the floor, all of it muffled and sent to the room.
 */
const CROWD_GAIN = 0.16;
const CROWD_TALKERS = 6;
const CROWD_SEND = 0.8;
/** A syllable's rounded edges: in, and out (they overlap within a word, so it's a little longer). */
const GRAIN_IN = 0.014;
const GRAIN_OUT = 0.045;
/** How much of the voices goes to the shared room. */
const VOICE_SEND = 0.3;
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
	#vbus?: { ctx: AudioContext; input: AudioNode };
	#crowd?: Crowd;
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
		this.#mix = { mode: host.mode ?? "synth", murmur: true, front: 1, under: 1, smooth: true, shape: true, room: 1, crowd: 1 };
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
		// The murmur is for the room you're looking at: zoomed out, the crowd stands in for it.
		const zoomed = zoomedArea(this.#host.stop(), this.#host.floor());
		if (!zoomed) return;
		const under = this.#murmur.choose(heard.filter((h) => h !== front && this.#host.areaOf(h.who) === zoomed), now);
		if (under) void this.#say(under, "murmur", bus);
	}

	/** The lab's knobs (mainview/lab.ts). */
	get mix(): SpeechMix {
		return { ...this.#mix };
	}
	setMix(change: Partial<SpeechMix>): void {
		this.#mix = { ...this.#mix, ...change };
		if (change.room !== undefined) this.#host.sound.setRoom(change.room);
		if (change.crowd !== undefined || change.mode !== undefined) this.update();
		if (change.crowd !== undefined && this.#crowd) this.#crowd.level(change.crowd);
	}

	/**
	 * The voices' bus, made once per context: a gentle compressor (so a loud syllable and a quiet
	 * one sit together), the lows below a small creature's trimmed, and a soft shelf off the top;
	 * then the master, and a share of it into the shared room.
	 */
	#voiceBus(bus: { ctx: AudioContext; out: AudioNode; room: AudioNode }): AudioNode {
		if (this.#vbus?.ctx === bus.ctx) return this.#vbus.input;
		const ctx = bus.ctx;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -26;
		comp.knee.value = 8;
		comp.ratio.value = 3;
		comp.attack.value = 0.008;
		comp.release.value = 0.18;
		const low = ctx.createBiquadFilter();
		low.type = "highpass";
		low.frequency.value = 170;
		low.Q.value = 0.6;
		const top = ctx.createBiquadFilter();
		top.type = "highshelf";
		top.frequency.value = 5_500;
		top.gain.value = -5;
		const send = ctx.createGain();
		send.gain.value = VOICE_SEND;
		comp.connect(low).connect(top);
		top.connect(bus.out);
		top.connect(send).connect(bus.room);
		this.#vbus = { ctx, input: comp };
		return comp;
	}

	/** Bring the room loop in line with sound being live and the theme. */
	update(): void {
		const bus = this.#host.sound.bus();
		if (!bus) {
			this.#mouth.live(undefined);
			this.#crowd?.stop();
			this.#crowd = undefined;
			return this.#stopRoom();
		}
		this.#load();
		this.#syncCrowd(bus);
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
			crowd: this.#crowd && { talkers: this.#crowd.talkers, phrases: this.#crowd.phrases },
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

	async #say(h: { who: string; text: string; trigger: TriggerKind }, layer: "front" | "murmur", bus: { ctx: AudioContext; out: AudioNode; room: AudioNode }): Promise<void> {
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
				steps = grainPlan(who, text, bank, { max: layer === "murmur" ? MURMUR_SYLLABLES : undefined, phrase: layer === "murmur", base: cents + pitch, raw: !this.#mix.smooth });
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
		const near = loudness(area, zoomedArea(this.#host.stop(), floor));
		const room = near * (layer === "front" ? this.#mix.front * FRONT_LEVEL : this.#mix.under * UNDER_GAIN);
		const out = ctx.createGain();
		const panner = ctx.createStereoPanner();
		panner.pan.value = pan;
		// From another room (the camera is in a different one), it comes through the wall: duller.
		if (near < 1 && this.#mix.shape) {
			const wall = ctx.createBiquadFilter();
			wall.type = "lowpass";
			wall.frequency.value = 2_200;
			out.connect(wall).connect(panner);
		} else out.connect(panner);
		panner.connect(this.#mix.shape ? this.#voiceBus(bus) : bus.out);
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
			secs = playGrains(ctx, out, at, steps, grains);
			how = "syllables";
		} else {
			out.gain.value = BABBLE_GAIN * room;
			secs = babble(ctx, out, at, who, layer === "murmur" ? text.split(/[.!?]/)[0]! : text);
			how = "babble";
		}
		if (layer === "front") {
			this.#host.sound.duck(at, secs);
			this.#crowd?.duck(at, secs);
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

	/** The crowd runs while live, in a babble mode, with banks for this theme and its level above 0. */
	#syncCrowd(bus: { ctx: AudioContext; out: AudioNode; room: AudioNode }): void {
		const theme = this.#host.theme();
		const voices = this.#manifest?.themes[theme];
		const want = this.#mix.mode !== "synth" && this.#mix.crowd > 0 && !!voices?.grains && Object.keys(voices.grains).length > 0;
		if (this.#crowd && (!want || this.#crowd.theme !== theme || this.#crowd.ctx !== bus.ctx)) {
			this.#crowd.stop();
			this.#crowd = undefined;
		}
		if (!want || this.#crowd) return;
		const lines = corpus(theme).filter((l) => !l.beat).map((l) => l.text.replace(/\{[a-z0-9]+\}/gi, "la"));
		this.#crowd = new Crowd(bus, theme, voices!, lines, {
			heat: () => this.#host.sound.heat,
			buffer: (file) => this.#buffer(bus.ctx, `voice/${file}`),
			level: this.#mix.crowd,
			smooth: () => this.#mix.smooth,
		});
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
 * Syllable babble: each step a slice of its clip at its own shift and level, with rounded edges (a
 * quarter-sine in, a longer one out) so a cut never clicks, and overlapping the next where the plan
 * says (inside a word). Returns its length in seconds.
 */
export function playGrains(ctx: BaseAudioContext, out: AudioNode, at: number, steps: readonly GrainStep[], buffers: ReadonlyMap<string, AudioBuffer>): number {
	let t = at;
	let end = at;
	for (const s of steps) {
		const buf = buffers.get(s.file);
		if (!buf) continue;
		const dur = Math.max(0.03, Math.min(s.end, buf.duration) - s.start);
		const len = dur / 2 ** (s.cents / 1200);
		const fin = Math.min(GRAIN_IN, len / 3);
		const fout = Math.min(s.release ?? GRAIN_OUT, len / 2);
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.detune.value = s.cents;
		const env = ctx.createGain();
		env.gain.setValueAtTime(0, t);
		env.gain.setValueCurveAtTime(EDGE_IN.map((v) => v * s.gain), t, fin);
		env.gain.setValueAtTime(s.gain, t + len - fout);
		env.gain.setValueCurveAtTime(EDGE_OUT.map((v) => v * s.gain), t + len - fout, fout);
		src.connect(env).connect(out);
		src.start(t, s.start, dur);
		end = Math.max(end, t + len);
		t += len + s.gap;
	}
	return end - at;
}

/** Quarter-sine edges, as curves for `setValueCurveAtTime`. */
const EDGE_IN = Float32Array.from({ length: 16 }, (_, i) => Math.sin(((i / 15) * Math.PI) / 2));
const EDGE_OUT = Float32Array.from({ length: 16 }, (_, i) => Math.cos(((i / 15) * Math.PI) / 2));

/**
 * The crowd: talkers chatting on and off in the distance, from the theme's syllable banks. A timer
 * looks half a second ahead every 250 ms (like the room tone's) and starts the next phrase for any
 * talker who is due; the busier the office (Sound's heat), the more talkers and the shorter their
 * pauses. Every phrase is a sentence from the bank's chatter, muffled, panned somewhere on the floor,
 * and sent to the room. Its level fades in and out over seconds and dips under a key beat.
 */
class Crowd {
	readonly ctx: AudioContext;
	readonly theme: ThemeId;
	#out: GainNode;
	#in: AudioNode;
	#timer: ReturnType<typeof setInterval>;
	#talkers: { next: number; n: number }[] = [];
	#level: number;
	#r = seq(hashId("crowd"));
	/** For the inspector: talkers wanted now, and phrases started. */
	talkers = 0;
	phrases = 0;

	constructor(
		bus: { ctx: AudioContext; out: AudioNode; room: AudioNode },
		theme: ThemeId,
		voices: ThemeVoices,
		lines: string[],
		o: { heat(): number; buffer(file: string): Promise<AudioBuffer | undefined>; level: number; smooth(): boolean },
	) {
		this.ctx = bus.ctx;
		this.theme = theme;
		const ctx = bus.ctx;
		this.#level = o.level;
		this.#out = ctx.createGain();
		this.#out.gain.value = 0;
		this.#out.gain.setTargetAtTime(CROWD_GAIN * o.level, ctx.currentTime, 2);
		// Far off: the highs go, and much of it is the room.
		const far = ctx.createBiquadFilter();
		far.type = "lowpass";
		far.frequency.value = 1_700;
		far.Q.value = 0.5;
		const send = ctx.createGain();
		send.gain.value = CROWD_SEND;
		far.connect(this.#out);
		this.#out.connect(bus.out);
		this.#out.connect(send).connect(bus.room);
		this.#in = far;
		const banks = Object.entries(voices.grains ?? {});
		const buffers = new Map<string, AudioBuffer>();
		const files = [...new Set(banks.flatMap(([, b]) => b.map((c) => c.file)))];
		const ready = Promise.all(files.map(async (f) => {
			const b = await o.buffer(f);
			if (b) buffers.set(f, b);
		}));
		let loaded = false;
		void ready.then(() => (loaded = true));
		this.#timer = setInterval(() => {
			if (!loaded || !banks.length || !lines.length) return;
			const now = ctx.currentTime;
			const heat = o.heat();
			const want = heat > 0 ? 1 + Math.round(heat * (CROWD_TALKERS - 1)) : 1;
			this.talkers = want;
			while (this.#talkers.length < CROWD_TALKERS) this.#talkers.push({ next: now + 0.5 + this.#r() * 4, n: 0 });
			for (let t = 0; t < want; t++) {
				const talker = this.#talkers[t]!;
				if (talker.next > now + 0.5) continue;
				const at = Math.max(now + 0.05, talker.next);
				const [voice, bank] = banks[(t * 5 + talker.n) % banks.length]!;
				const who = `crowd:${t}:${voice}`;
				const text = lines[Math.floor(this.#r() * lines.length)]!;
				const base = (voices.pitch ?? 0) * 100 + pitchCents(who);
				const steps = grainPlan(`${who}:${talker.n++}`, text, bank, { phrase: true, max: 9, base, raw: !o.smooth() }).filter((s) => buffers.has(s.file));
				const pause = (1.2 + this.#r() * 3.5) * (1.6 - heat);
				if (!steps.length) {
					talker.next = at + pause;
					continue;
				}
				const g = ctx.createGain();
				g.gain.value = 0.7 + this.#r() * 0.5;
				const pan = ctx.createStereoPanner();
				pan.pan.value = (this.#r() * 2 - 1) * 0.75;
				g.connect(pan).connect(this.#in);
				const secs = playGrains(ctx, g, at, steps, buffers);
				this.phrases++;
				talker.next = at + secs + pause;
				setTimeout(() => {
					g.disconnect();
					pan.disconnect();
				}, (at - now + secs + 1) * 1000);
			}
		}, 250);
	}

	level(level: number): void {
		this.#level = level;
		const g = this.#out.gain;
		g.cancelScheduledValues(this.ctx.currentTime);
		g.setTargetAtTime(CROWD_GAIN * level, this.ctx.currentTime, 0.3);
	}

	/** Dip under a key beat. */
	duck(at: number, secs: number): void {
		const g = this.#out.gain;
		g.cancelScheduledValues(this.ctx.currentTime);
		g.setTargetAtTime(CROWD_GAIN * this.#level * 0.5, at, 0.1);
		g.setTargetAtTime(CROWD_GAIN * this.#level, at + secs, 0.6);
	}

	stop(): void {
		clearInterval(this.#timer);
		const g = this.#out.gain;
		g.cancelScheduledValues(this.ctx.currentTime);
		g.setTargetAtTime(0, this.ctx.currentTime, 0.4);
		setTimeout(() => this.#out.disconnect(), 2_500);
	}
}
