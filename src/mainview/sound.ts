// Sound, opt-in (the tray's Sound toggle, or ?sound): a few earcons for real events and a quiet
// room tone, all synthesised in WebAudio from code (no samples, so no licences). It only listens to
// the director's events (and reads its world); it never changes what the scene does.
//
//   bell     a lead starts waiting on you      a struck desk bell: three inharmonic sine partials
//   stamp    a test comes back green           a soft thunk: a sine dropping 150 -> 55 Hz, a dull tap
//   red      a command fails (a red test)      a sad two-note: triangle A4 then F4, the second longer
//   rustle   a session compacts                paper: band-passed noise in a few uneven swells
//   chime    a PR goes up                      three rising sine bells (C6 E6 G6), staggered
//   grind    a long build's feud with the copier  a rough saw motor, wobbling, then a clunk
//
// Every variation (pitch, a few ms of delay, the rustle's swells) comes from the event's id, never
// Math.random. At most one earcon of a kind every few seconds, and a global cap, so a busy office
// doesn't chatter. Each is panned by its room's x on screen, and louder while the camera is zoomed
// into that room (quieter in another), a little louder or softer by its id, and never more than
// two at once. Under them, a very low room tone per theme, filtered air that drifts (no hum): the
// office has a keyboard patter whose rate follows the heat; the factory a belt's clatter; the
// bakery the ovens' warm air, now and then the espresso machine's hiss of steam (more often when
// it's busy) and, once in a while, the little bell over the shop door.
//
// The AudioContext is made only once sound is on and the window is on screen; it runs only while
// visible, and suspends when hidden, in calm mode, or when sound is turned off. Every one of those
// fades the master first (and back in after), so nothing clicks; a limiter keeps a pile-up clean. Only the full
// office window plays sound (main.ts doesn't make one for compact), so nothing doubles.
import type { World, WorldEvent } from "../scene/director";
import type { Stop, View } from "../scene/office/camera";
import type { World as Floor } from "../scene/office/world";
import type { ThemeId } from "../scene/theme/id";

export type EarconKind = "bell" | "stamp" | "red" | "rustle" | "chime" | "grind";

/** An earcon the events asked for: its kind, an id to vary it by, and whose room it belongs to. */
export interface Cue {
	kind: EarconKind;
	id: string;
	key: string;
	area?: string;
}

/** Which earcon wins when several arrive together: a wait on you first. */
export const PRIORITY: readonly EarconKind[] = ["bell", "chime", "red", "stamp", "rustle", "grind"];

export const LIMITS = {
	/** At most one earcon of a kind this often. */
	perKindMs: 4_000,
	/** Never two earcons closer than this. */
	gapMs: 600,
	/** And at most `perWindow` in any `windowMs`. */
	windowMs: 10_000,
	perWindow: 4,
} as const;

/** FNV-1a: a stable 32-bit number from a string. */
export function hashId(id: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Murmur3's finaliser: every bit of the hash stirred into every other. FNV's middle bits barely
 * move when only an id's last characters do, which the pitch and delay get away with. */
function mix(h: number): number {
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	return (h ^ (h >>> 16)) >>> 0;
}

/**
 * An event's variation: a pitch factor within ±5%, a start delay of up to 40 ms, a level within
 * about ±1.5 dB, and a seed, all from the id's hash.
 */
export function vary(id: string): { pitch: number; delay: number; level: number; seed: number } {
	const h = hashId(id);
	return {
		pitch: 0.95 + ((h & 0xff) / 255) * 0.1,
		delay: (((h >>> 8) & 0xff) / 255) * 0.04,
		level: 0.84 + ((mix(h) & 0xff) / 255) * 0.32,
		seed: h,
	};
}

/** How long each earcon rings, in seconds: how long it holds one of the `MAX_VOICES`. */
export const RING: Record<EarconKind, number> = { bell: 1.45, stamp: 0.25, red: 0.9, rustle: 0.7, chime: 1.3, grind: 1.35 };

/** At most this many earcons sound at once. */
export const MAX_VOICES = 2;

/**
 * The voice cap, in the AudioContext's seconds: room for `MAX_VOICES` earcons at a time. When it's
 * full, a bell (a wait on you) takes the place of the voice that started first, which the caller
 * fades out; anything else waits its turn (it's dropped).
 */
export class Voices<T = unknown> {
	#playing: { until: number; handle: T }[] = [];

	admit(kind: EarconKind, now: number, until: number, handle: T): { ok: boolean; steal?: T } {
		this.#playing = this.#playing.filter((v) => v.until > now);
		let steal: T | undefined;
		if (this.#playing.length >= MAX_VOICES) {
			if (kind !== "bell") return { ok: false };
			steal = this.#playing.shift()!.handle;
		}
		this.#playing.push({ until, handle });
		return steal === undefined ? { ok: true } : { ok: true, steal };
	}

	count(now: number): number {
		return this.#playing.filter((v) => v.until > now).length;
	}
}

/** A small deterministic sequence from a seed (for the rustle's swells and the patter's jitter). */
export function seq(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 0x100000000;
	};
}

/** The area a station is in: station ids are `<area>:<kind>:<n>`. */
const stationArea = (station: string) => station.split(":").slice(0, -2).join(":");
const stationKind = (station: string) => station.split(":").at(-2);

/**
 * Hears the director: turns its events (and changes in what each actor has seen) into cues. The
 * first world it sees is the baseline, as is each newcomer's first look: opening the office on a
 * room that is already waiting doesn't ring.
 */
export class Ears {
	#seen = new Map<string, { failAt?: number; compactAt?: number; prs: number[] }>();
	/** A test trip under way: the actor's failAt when it started, to tell green from red at the end. */
	#tests = new Map<string, number | undefined>();
	#primed = false;

	hear(events: WorldEvent[], world: World): Cue[] {
		const cues: Cue[] = [];
		const primed = this.#primed;
		const areaOf = (key: string) => {
			const a = world.actors[key];
			return a ? (a.homeArea ?? a.area) : undefined;
		};
		for (const [key, a] of Object.entries(world.actors)) {
			const was = this.#seen.get(key);
			const now = { failAt: a.seen.failAt, compactAt: a.seen.compactAt, prs: [...a.seen.prs] };
			this.#seen.set(key, now);
			if (!primed || !was || a.gone) continue;
			if (now.failAt !== undefined && now.failAt !== was.failAt) cues.push({ kind: "red", id: `red:${key}:${now.failAt}`, key, area: areaOf(key) });
			if (now.compactAt !== undefined && now.compactAt !== was.compactAt) cues.push({ kind: "rustle", id: `rustle:${key}:${now.compactAt}`, key, area: areaOf(key) });
			const pr = now.prs.find((n) => !was.prs.includes(n));
			if (pr !== undefined) cues.push({ kind: "chime", id: `chime:${key}:${pr}`, key, area: areaOf(key) });
		}
		for (const key of this.#seen.keys()) if (!world.actors[key]) this.#seen.delete(key);
		for (const e of events) {
			if (e.type === "trip" && stationKind(e.station) === "test") {
				if (e.state === "start" || e.state === "queue") this.#tests.set(e.key, world.actors[e.key]?.seen.failAt);
				else if (e.state === "end" && this.#tests.has(e.key)) {
					const before = this.#tests.get(e.key);
					this.#tests.delete(e.key);
					if (primed && world.actors[e.key]?.seen.failAt === before) cues.push({ kind: "stamp", id: `stamp:${e.key}:${e.at}`, key: e.key, area: stationArea(e.station) });
				}
			}
			if (!primed) continue;
			if (e.type === "waiting" && e.state === "start") cues.push({ kind: "bell", id: `bell:${e.key}:${e.at}`, key: e.key, area: e.area });
			if (e.type === "pose" && e.pose === "copierFeud") cues.push({ kind: "grind", id: `grind:${e.key}:${e.at}`, key: e.key, area: areaOf(e.key) });
		}
		this.#primed = true;
		// When several land at once, the one that needs you goes first (the gap drops the rest).
		return cues.sort((x, y) => PRIORITY.indexOf(x.kind) - PRIORITY.indexOf(y.kind));
	}
}

/** The rate limit: one per kind every `perKindMs`, a gap between any two, and a cap per window. */
export class Gate {
	#last = new Map<EarconKind, number>();
	#recent: number[] = [];

	admit(kind: EarconKind, now: number): boolean {
		this.#recent = this.#recent.filter((t) => now - t < LIMITS.windowMs);
		const last = this.#last.get(kind);
		if (last !== undefined && now - last < LIMITS.perKindMs) return false;
		const latest = this.#recent.at(-1);
		if (latest !== undefined && now - latest < LIMITS.gapMs) return false;
		if (this.#recent.length >= LIMITS.perWindow) return false;
		this.#last.set(kind, now);
		this.#recent.push(now);
		return true;
	}
}

/** Pan from a room's centre on screen: -1 at the left edge, 1 at the right, a little narrowed. */
export function panFor(rect: { x: number; w: number } | undefined, view: View, width: number): number {
	if (!rect || width <= 0) return 0;
	const x = (rect.x + rect.w / 2) * view.scale + view.x;
	return Math.round(Math.max(-1, Math.min(1, (x / width) * 2 - 1)) * 0.8 * 100) / 100;
}

/** Louder zoomed into the earcon's room, quieter zoomed into another, as is in the whole office. */
export function loudness(area: string | undefined, zoomed: string | undefined): number {
	if (zoomed === undefined) return 1;
	return area === zoomed ? 1.4 : 0.55;
}

/** The area the camera is zoomed into, if any: a room stop, or the room of a desk stop. */
export function zoomedArea(stop: Stop, floor: Floor | undefined): string | undefined {
	if (stop.kind === "office") return undefined;
	if (stop.kind === "room") return stop.id;
	return floor?.areas.find((a) => a.desks.some((d) => d.id === stop.id))?.id;
}

/** How hot the office is, 0..1: the share of a busy crowd at work, and 1 in a rush. */
export function heatOf(world: World | undefined): number {
	if (!world) return 0;
	if (Object.keys(world.rush ?? {}).length) return 1;
	const busy = Object.values(world.actors).filter((a) => !a.gone && a.mood === "busy").length;
	return Math.min(1, busy / 6);
}

export interface Played {
	kind: EarconKind;
	id: string;
	/** When it was scheduled, in the AudioContext's seconds. */
	at: number;
	pan: number;
	/** The room's loudness (`loudness`), before the id's level jitter. */
	gain: number;
}

export interface SoundState {
	enabled: boolean;
	/** The AudioContext's state, or "none" before one was made. */
	context: AudioContextState | "none";
	/** Should be playing now: on, visible and not calm. */
	live: boolean;
	/** The last earcons scheduled, newest last. */
	last: Played[];
	/** Cues heard while live but held back by the rate limit. */
	limited: number;
	/** Cues heard while not live (off, hidden, calm, or the context not running yet). */
	quiet: number;
	/** Earcons still ringing now (at most `MAX_VOICES`). */
	voices: number;
	tone: { theme: ThemeId; heat: number; running: boolean };
}

export interface SoundHost {
	enabled: boolean;
	visible(): boolean;
	calm(): boolean;
	theme(): ThemeId;
	/** The office's floor, camera and stop, for pan and loudness. */
	floor(): Floor | undefined;
	view(): View;
	stop(): Stop;
	width(): number;
	/** Wall-clock ms, for the rate limit. */
	clock?(): number;
}

/** The master level, under the limiter. */
export const MASTER = 0.42;

/** Fades, as `setTargetAtTime` time constants in seconds (about 5 of them to settle). */
const FADE = {
	/** The master, coming back on screen or sound turned on. */
	in: 0.08,
	/** The master, going off screen, calm or muted; the context suspends once it's silent. */
	out: 0.03,
	/** The room tone fading in, and out (a theme switch crossfades). */
	toneIn: 1.5,
	toneOut: 0.25,
	/** A voice the cap took for a bell. */
	steal: 0.03,
} as const;

/** How long after the master starts fading out the context suspends, in ms. */
const SUSPEND_AFTER_MS = 200;

/** Seconds of white noise from a fixed seed, shared by every noisy sound. Long enough that the
 * room tone's loop doesn't flutter once a second. */
const NOISE_SECONDS = 4;

/** The shared noise. Its first second is the same as it always was, so earcons sound unchanged. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
	const buf = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
	const data = buf.getChannelData(0);
	const r = seq(0x5eed);
	for (let i = 0; i < data.length; i++) data[i] = r() * 2 - 1;
	return buf;
}

/**
 * The master: a gain into a limiter into `dest`. The limiter is a safety net for many sounds at
 * once; the levels below stay under its threshold on their own. Starts silent.
 */
export function masterChain(ctx: BaseAudioContext, dest: AudioNode = ctx.destination): GainNode {
	const master = ctx.createGain();
	master.gain.value = 0;
	const limit = ctx.createDynamicsCompressor();
	limit.threshold.value = -6;
	limit.knee.value = 3;
	limit.ratio.value = 20;
	limit.attack.value = 0.002;
	limit.release.value = 0.2;
	master.connect(limit).connect(dest);
	return master;
}

/** Ramp a level from wherever it is now, with no jump. Only `setTargetAtTime`s touch these levels,
 * so cancelling the future never snaps one back to an older value. */
function glide(param: AudioParam, to: number, now: number, tau: number): void {
	param.cancelScheduledValues(now);
	param.setTargetAtTime(to, now, tau);
}

/** The room tone's level while a character speaks (speech.ts). */
const DUCK = 0.35;
/** A level meter's reading: the RMS of the analyser's last window, in dBFS (-100 for silence). For the sound lab. */
export function meterDb(a: AnalyserNode): number {
	const d = new Float32Array(a.fftSize);
	a.getFloatTimeDomainData(d);
	let s = 0;
	for (const v of d) s += v * v;
	return Math.max(-100, Math.round(10 * Math.log10(s / d.length + 1e-12)));
}

/** How much of the shared room each earcon sends (design/sound.md: everything in one small room). */
const EARCON_SEND = 0.22;

/**
 * The shared room: a short, warm echo every sound can send to, so voices and earcons sound like
 * they are in the same small space. Its impulse is made here from seeded noise: two channels of
 * decaying, darkened noise (about half a second, most of it in the first 150 ms), after 8 ms of
 * nothing. Returns the send (a gain to connect to) and that gain's level, 1 by default.
 */
export function roomChain(ctx: BaseAudioContext, dest: AudioNode): GainNode {
	const secs = 0.55;
	const len = Math.floor(ctx.sampleRate * secs);
	const ir = ctx.createBuffer(2, len, ctx.sampleRate);
	const pre = Math.floor(ctx.sampleRate * 0.008);
	for (let ch = 0; ch < 2; ch++) {
		const r = seq(0x7007 + ch);
		const d = ir.getChannelData(ch);
		let lp = 0;
		for (let i = pre; i < len; i++) {
			const t = (i - pre) / ctx.sampleRate;
			// A one-pole low-pass that closes as the tail goes on: the walls are soft (paper, felt).
			const k = 0.55 - 0.4 * Math.min(1, t / secs);
			lp += k * (r() * 2 - 1 - lp);
			d[i] = lp * Math.exp(-t / 0.12) * 0.6;
		}
	}
	const send = ctx.createGain();
	const conv = ctx.createConvolver();
	conv.normalize = true;
	conv.buffer = ir;
	const wet = ctx.createGain();
	wet.gain.value = 0.5;
	send.connect(conv).connect(wet).connect(dest);
	return send;
}

export class Sound {
	#host: SoundHost;
	#enabled: boolean;
	#ctx?: AudioContext;
	#master?: GainNode;
	/** The shared room's send (roomChain), and the earcons' share of it. */
	#room?: GainNode;
	#earconSend?: GainNode;
	#noise?: AudioBuffer;
	#ears = new Ears();
	#gate = new Gate();
	#voices = new Voices<GainNode>();
	#last: Played[] = [];
	#limited = 0;
	#quiet = 0;
	#heat = 0;
	/** The room tone's level: 1, or what the sound lab sets (0 mutes it). */
	#toneLevel = 1;
	#tone?: { theme: ThemeId; nodes: AudioScheduledSourceNode[]; out: GainNode; timer: ReturnType<typeof setInterval>; next: number; n: number };
	#unlock?: () => void;
	#suspending?: ReturnType<typeof setTimeout>;

	constructor(host: SoundHost) {
		this.#host = host;
		this.#enabled = host.enabled;
		this.update();
	}

	get enabled(): boolean {
		return this.#enabled;
	}

	setEnabled(on: boolean): void {
		// Off, it doesn't listen at all; back on, the next world is a fresh baseline (no stale news).
		if (on && !this.#enabled) this.#ears = new Ears();
		this.#enabled = on;
		this.update();
	}

	get #wanted(): boolean {
		return this.#enabled && this.#host.visible() && !this.#host.calm();
	}

	get #live(): boolean {
		return this.#wanted && this.#ctx?.state === "running";
	}

	/** Bring the context in line with on/visible/calm: made on first need, resumed or suspended. */
	update(): void {
		if (this.#wanted) {
			if (!this.#ctx) this.#make();
			const ctx = this.#ctx;
			if (!ctx) return;
			clearTimeout(this.#suspending);
			this.#suspending = undefined;
			// Fade the master up from wherever it is (silent after a suspend). While the context is
			// still suspended its clock stands still, so the fade plays out once it runs.
			glide(this.#master!.gain, MASTER, ctx.currentTime, FADE.in);
			if (ctx.state !== "running") {
				void ctx.resume().then(() => this.#syncTone(), () => {});
				// WebKit may want a gesture first: the next click in the office counts as one.
				if (!this.#unlock) {
					this.#unlock = () => {
						if (this.#wanted) void this.#ctx?.resume().then(() => this.#syncTone(), () => {});
					};
					document.addEventListener("pointerdown", this.#unlock, { once: true });
				}
			}
			this.#syncTone();
		} else {
			this.#stopTone();
			const ctx = this.#ctx;
			if (ctx?.state !== "running" || this.#suspending) return;
			// Fade everything out first (a suspend mid-ring would click), then suspend.
			glide(this.#master!.gain, 0, ctx.currentTime, FADE.out);
			this.#suspending = setTimeout(() => {
				this.#suspending = undefined;
				if (!this.#wanted && ctx.state === "running") void ctx.suspend();
			}, SUSPEND_AFTER_MS);
		}
	}

	/** The theme changed: the room tone follows. */
	themeChanged(): void {
		this.#stopTone();
		this.#syncTone();
	}

	/** From `director.on`: play what the events call for. */
	hear(events: WorldEvent[], world: World): void {
		if (!this.#enabled) return;
		const cues = this.#ears.hear(events, world);
		this.#heat = heatOf(world);
		for (const cue of cues) this.#play(cue);
	}

	/** How busy the office is, 0..1 (`heatOf`): the crowd's size follows it (speech.ts). */
	get heat(): number {
		return this.#heat;
	}

	/** For the speech player (speech.ts): the running context, the master bus and the shared room's send, while live. */
	bus(): { ctx: AudioContext; out: AudioNode; room: AudioNode } | undefined {
		return this.#live && this.#ctx && this.#master && this.#room ? { ctx: this.#ctx, out: this.#master, room: this.#room } : undefined;
	}

	/** The room tone's level, 0 (off) to 2; 1 is the default (the sound lab turns it). */
	setTone(level: number): void {
		this.#toneLevel = level;
		if (this.#tone && this.#ctx) glide(this.#tone.out.gain, level, this.#ctx.currentTime, 0.2);
	}

	/** The shared room's level, 0 (dry) to 2; 1 is the default (the sound lab turns it). */
	setRoom(level: number): void {
		if (this.#room && this.#ctx) glide(this.#room.gain, level, this.#ctx.currentTime, 0.05);
	}

	/** Dip the room tone under a line of speech `secs` long, from `at` (the context's seconds). */
	duck(at: number, secs: number): void {
		const g = this.#tone?.out.gain;
		if (!g || !this.#ctx) return;
		g.cancelScheduledValues(this.#ctx.currentTime);
		g.setTargetAtTime(DUCK * this.#toneLevel, at, 0.08);
		g.setTargetAtTime(this.#toneLevel, at + secs, 0.4);
	}

	state(): SoundState {
		return {
			enabled: this.#enabled,
			context: this.#ctx?.state ?? "none",
			live: this.#live,
			last: [...this.#last],
			limited: this.#limited,
			quiet: this.#quiet,
			voices: this.#ctx ? this.#voices.count(this.#ctx.currentTime) : 0,
			tone: { theme: this.#host.theme(), heat: this.#heat, running: !!this.#tone },
		};
	}

	#make(): void {
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		const ctx = new Ctor();
		this.#ctx = ctx;
		this.#master = masterChain(ctx);
		this.#room = roomChain(ctx, this.#master);
		this.#earconSend = ctx.createGain();
		this.#earconSend.gain.value = EARCON_SEND;
		this.#earconSend.connect(this.#room);
		this.#noise = makeNoise(ctx);
		ctx.addEventListener("statechange", () => this.#syncTone());
	}

	#play(cue: Cue): void {
		const ctx = this.#ctx;
		if (!this.#live || !ctx || !this.#master) {
			this.#quiet++;
			return;
		}
		if (!this.#gate.admit(cue.kind, this.#host.clock?.() ?? performance.now())) {
			this.#limited++;
			return;
		}
		const floor = this.#host.floor();
		const rect = cue.area ? floor?.areas.find((a) => a.id === cue.area)?.rect : undefined;
		const pan = panFor(rect, this.#host.view(), this.#host.width());
		const gain = loudness(cue.area, zoomedArea(this.#host.stop(), floor));
		const v = vary(cue.id);
		const at = ctx.currentTime + 0.02 + v.delay;
		const out = ctx.createGain();
		const voice = this.#voices.admit(cue.kind, ctx.currentTime, at + RING[cue.kind], out);
		if (!voice.ok) {
			this.#limited++;
			return;
		}
		if (voice.steal) glide(voice.steal.gain, 0, ctx.currentTime, FADE.steal);
		out.gain.value = gain * v.level * LEVEL[cue.kind];
		const panner = ctx.createStereoPanner();
		panner.pan.value = pan;
		// From another room (the camera is in a different one), it comes through the wall: duller.
		if (gain < 1) {
			const wall = ctx.createBiquadFilter();
			wall.type = "lowpass";
			wall.frequency.value = 2_200;
			out.connect(wall).connect(panner);
		} else out.connect(panner);
		panner.connect(this.#master);
		panner.connect(this.#earconSend!);
		EARCONS[cue.kind](this.#kit(ctx, out), at, v.pitch, v.seed);
		// Let the graph go once it has rung out.
		setTimeout(() => {
			out.disconnect();
			panner.disconnect();
		}, 3_000);
		this.#last.push({ kind: cue.kind, id: cue.id, at: Math.round(at * 1000) / 1000, pan, gain });
		if (this.#last.length > 12) this.#last.shift();
	}

	#kit(ctx: BaseAudioContext, out: AudioNode): Kit {
		return kit(ctx, out, this.#noise!);
	}

	// The room tone: a very low bed under everything, per theme, built while live and torn down
	// otherwise (so a suspended or hidden office has no timer running either).
	#syncTone(): void {
		if (!this.#live) return this.#stopTone();
		if (this.#tone && this.#tone.theme === this.#host.theme()) return;
		this.#stopTone();
		const ctx = this.#ctx!;
		const theme = this.#host.theme();
		const out = ctx.createGain();
		out.gain.value = 0;
		// Fade in over a few seconds, so turning sound on (or coming back on screen) never thumps.
		out.gain.setTargetAtTime(this.#toneLevel, ctx.currentTime, FADE.toneIn);
		out.connect(this.#master!);
		const k = kit(ctx, out, this.#noise!);
		const nodes = roomBed(theme, ctx, out, this.#noise!);
		const tone = { theme, nodes, out, next: ctx.currentTime + 0.5, n: 0, quietUntil: 0, timer: undefined as unknown as ReturnType<typeof setInterval> };
		// Look a quarter second ahead every 200 ms and lay down the patter (or clatter) for it.
		tone.timer = setInterval(() => {
			const now = ctx.currentTime;
			if (tone.next < now) tone.next = now + 0.05;
			const heat = this.#heat;
			while (tone.next < now + 0.25) {
				const r = seq(hashId(`${theme}:${tone.n++}`));
				if (theme === "bakery") {
					// The shop: a step every quarter second, and now and then steam or the door.
					const beat = tone.next >= tone.quietUntil ? bakeryBeat(r(), heat) : undefined;
					if (beat === "steam") tone.quietUntil = tone.next + steam(k, tone.next, r(), 0.6 + 0.4 * heat);
					else if (beat === "door") tone.quietUntil = tone.next + doorBell(k, tone.next, 0.97 + r() * 0.06);
					tone.next += BAKERY_STEP;
				} else if (theme === "factory") {
					// The belt: an even clack, quicker as it heats up; silent in an empty factory.
					if (heat > 0) clack(k, tone.next, 0.6 + 0.4 * heat);
					tone.next += 1 / (1.2 + heat * 3);
				} else {
					// Typing: keys at an uneven pace, about 9 a second when everyone is at it.
					if (heat > 0) key(k, tone.next, r(), 0.5 + 0.5 * heat);
					tone.next += heat > 0 ? (0.4 + r() * 0.9) / (heat * 9) : 0.25;
				}
			}
		}, 200);
		this.#tone = tone;
	}

	/** Stop the room tone: its timer at once, its sound after a short fade (no click), then its nodes. */
	#stopTone(): void {
		const t = this.#tone;
		if (!t) return;
		this.#tone = undefined;
		clearInterval(t.timer);
		const ctx = this.#ctx!;
		glide(t.out.gain, 0, ctx.currentTime, FADE.toneOut);
		// Wall-clock, so it lets go even if the context suspends mid-fade.
		setTimeout(() => {
			for (const n of t.nodes) {
				try {
					n.stop();
				} catch {
					// Already stopped.
				}
			}
			t.out.disconnect();
		}, FADE.toneOut * 6_000);
	}
}

// --- Synthesis -------------------------------------------------------------------------------------

export interface Kit {
	ctx: BaseAudioContext;
	out: AudioNode;
	/** The shared second of white noise. */
	buffer: AudioBuffer;
	/** A shaped oscillator: attack to `peak`, exponential decay over `decay` seconds. */
	osc(type: OscillatorType, freq: number, at: number, peak: number, decay: number, opts?: { attack?: number; to?: number; dest?: AudioNode }): void;
	/** A burst of filtered noise, from `offset` into the shared buffer. */
	noise(at: number, dur: number, filter: BiquadFilterType, freq: number, q: number, peak: number, offset?: number, dest?: AudioNode): GainNode;
}

export function kit(ctx: BaseAudioContext, out: AudioNode, buffer: AudioBuffer): Kit {
	return {
		ctx,
		out,
		buffer,
		osc(type, freq, at, peak, decay, opts = {}) {
			const o = ctx.createOscillator();
			o.type = type;
			o.frequency.setValueAtTime(freq, at);
			if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + decay * 0.6);
			const g = ctx.createGain();
			const attack = opts.attack ?? 0.004;
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(peak, at + attack);
			g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
			o.connect(g).connect(opts.dest ?? out);
			o.start(at);
			o.stop(at + attack + decay + 0.05);
		},
		noise(at, dur, filter, freq, q, peak, offset = 0, dest) {
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			const f = ctx.createBiquadFilter();
			f.type = filter;
			f.frequency.value = freq;
			f.Q.value = q;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.01, dur / 4));
			g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
			src.connect(f).connect(g).connect(dest ?? out);
			src.start(at, offset % 0.9, dur + 0.05);
			return g;
		},
	};
}

type Earcon = (k: Kit, at: number, pitch: number, seed: number) => void;

/**
 * The mix: each earcon's level, set by rendering them offline and evening out their loudest tenth
 * of a second. The bell (a wait on you) sits a little above the rest; the rustle's soft noise needs
 * the most help.
 */
export const LEVEL: Record<EarconKind, number> = { bell: 0.64, stamp: 1.1, red: 0.87, rustle: 7, chime: 0.72, grind: 0.96 };

export const EARCONS: Record<EarconKind, Earcon> = {
	// The desk bell: a bright strike with inharmonic partials (a small bell's 1 : 2.76 : 5.4), the
	// high ones dying first, and a tick of noise for the striker.
	bell(k, at, p) {
		const f = 1320 * p;
		k.osc("sine", f, at, 0.32, 1.4);
		k.osc("sine", f * 2.76, at, 0.12, 0.6);
		k.osc("sine", f * 5.4, at, 0.05, 0.25);
		k.noise(at, 0.015, "highpass", 5000, 0.7, 0.08);
	},
	// The rubber stamp coming down: a soft low thunk with the pitch falling, and a dull paper tap.
	stamp(k, at, p) {
		k.osc("sine", 150 * p, at, 0.45, 0.16, { to: 55 * p });
		k.noise(at, 0.05, "lowpass", 900 * p, 0.8, 0.2);
	},
	// A sad two-note: down a major third, softened triangles, the second held a little longer.
	red(k, at, p) {
		const lp = k.ctx.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 1800;
		lp.connect(k.out);
		k.osc("triangle", 440 * p, at, 0.26, 0.28, { attack: 0.02, dest: lp });
		k.osc("triangle", 349.2 * p, at + 0.26, 0.26, 0.55, { attack: 0.02, dest: lp });
	},
	// Paper being shuffled: band-passed noise in three to five uneven swells, each from the id.
	rustle(k, at, p, seed) {
		const r = seq(seed);
		const n = 3 + Math.floor(r() * 3);
		let t = at;
		for (let i = 0; i < n; i++) {
			k.noise(t, 0.08 + r() * 0.1, "bandpass", (2600 + r() * 2200) * p, 1.2, 0.08 + r() * 0.06, r() * 0.8);
			t += 0.07 + r() * 0.09;
		}
	},
	// A chime for a PR: three rising bells, C6 E6 G6, staggered like a doorbell's run.
	chime(k, at, p) {
		[1046.5, 1318.5, 1568].forEach((f, i) => {
			k.osc("sine", f * p, at + i * 0.11, 0.2, 0.9);
			k.osc("sine", f * p * 2, at + i * 0.11, 0.04, 0.3);
		});
	},
	// The copier grinding through a long build: a low saw motor through a muffled filter, its level
	// wobbling at a jammed roller's rate, scraped noise over it, then the clunk of the jam.
	grind(k, at, p) {
		const { ctx } = k;
		const lp = ctx.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 700;
		const wob = ctx.createGain();
		wob.gain.value = 0.5;
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 11 * p;
		const depth = ctx.createGain();
		depth.gain.value = 0.4;
		lfo.connect(depth).connect(wob.gain);
		lp.connect(wob).connect(k.out);
		lfo.start(at);
		lfo.stop(at + 1.3);
		k.osc("sawtooth", 72 * p, at, 0.22, 1.1, { attack: 0.08, to: 64 * p, dest: lp });
		k.noise(at + 0.05, 0.9, "bandpass", 1500 * p, 2, 0.06, 0.3, wob);
		k.osc("sine", 110 * p, at + 1.15, 0.35, 0.14, { to: 45 * p });
		k.noise(at + 1.15, 0.05, "lowpass", 700, 0.8, 0.16, 0.6);
	},
};

/**
 * A room's bed: filtered noise, no tones. It used to be sine and saw hums (120 Hz in the office,
 * 55 Hz in the factory), and a steady tone that low reads as mains hum on a laptop's speakers. Now
 * it's air: two loops of the shared noise from different places, spread a little left and right,
 * through a band that keeps it off the speakers' lowest notes and out of the earcons' highs. Its
 * level and brightness drift on slow LFOs at rates that don't line up, so it never settles into a
 * steady tone. Well under everything: about 60 dB below full scale.
 */
interface Bed {
	/** The band: high-passed here, low-passed there (Hz). */
	low: number;
	high: number;
	/** The level before the drift, and how far the drift swings it (a share of that level). */
	level: number;
	swing: number;
	/** How far the low-pass wanders (Hz), and the drift's rates (Hz): level, level, brightness. */
	wander: number;
	rates: readonly [number, number, number];
}

const BEDS: Record<ThemeId, Bed> = {
	// The office: the air handling, soft and even.
	office: { low: 160, high: 900, level: 0.011, swing: 0.4, wander: 250, rates: [0.031, 0.077, 0.023] },
	// The factory: a darker, rougher room, swelling a little more.
	factory: { low: 140, high: 620, level: 0.013, swing: 0.4, wander: 180, rates: [0.043, 0.11, 0.029] },
	// The bakery: the ovens' warm air, breathing slowly like a burner cycling.
	bakery: { low: 150, high: 750, level: 0.011, swing: 0.45, wander: 200, rates: [0.08, 0.037, 0.019] },
};

export function roomBed(theme: ThemeId, ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer): AudioScheduledSourceNode[] {
	const bed = BEDS[theme] ?? BEDS.office;
	const hp = ctx.createBiquadFilter();
	hp.type = "highpass";
	hp.frequency.value = bed.low;
	hp.Q.value = 0.5;
	const lp = ctx.createBiquadFilter();
	lp.type = "lowpass";
	lp.frequency.value = bed.high;
	lp.Q.value = 0.5;
	const level = ctx.createGain();
	level.gain.value = bed.level;
	hp.connect(lp).connect(level).connect(out);
	const nodes: AudioScheduledSourceNode[] = [];
	// Two loops of the noise, from places 1.7 s apart, a little left and right.
	for (const [offset, pan] of [
		[0, -0.5],
		[1.7, 0.5],
	] as const) {
		const src = ctx.createBufferSource();
		src.buffer = noise;
		src.loop = true;
		const p = ctx.createStereoPanner();
		p.pan.value = pan;
		src.connect(p).connect(hp);
		src.start(ctx.currentTime, offset);
		nodes.push(src);
	}
	// The drift: two slow LFOs on the level, one on the brightness.
	const drift = (rate: number, depth: number, param: AudioParam) => {
		const lfo = ctx.createOscillator();
		lfo.frequency.value = rate;
		const g = ctx.createGain();
		g.gain.value = depth;
		lfo.connect(g).connect(param);
		lfo.start(ctx.currentTime);
		nodes.push(lfo);
	};
	drift(bed.rates[0], (bed.level * bed.swing) / 2, level.gain);
	drift(bed.rates[1], (bed.level * bed.swing) / 2, level.gain);
	drift(bed.rates[2], bed.wander, lp.frequency);
	return nodes;
}

/** The bakery's room tone looks ahead in quarter-second steps. */
export const BAKERY_STEP = 0.25;

/**
 * What the shop does in one step, from a number in [0, 1) and the heat: the espresso machine's
 * steam about once a minute in a quiet shop and every 15 seconds or so in a busy one, and the bell
 * over the door about every two minutes. Mostly nothing.
 */
export function bakeryBeat(r: number, heat: number): "steam" | "door" | undefined {
	const steamP = 0.004 + 0.012 * Math.max(0, Math.min(1, heat));
	if (r < steamP) return "steam";
	if (r < steamP + 0.002) return "door";
	return undefined;
}

/** A sound that swells in, holds and fades: looped noise through a filter. */
function swell(k: Kit, at: number, attack: number, hold: number, release: number, filter: BiquadFilterType, freq: number, q: number, peak: number, offset: number): void {
	const { ctx } = k;
	const src = ctx.createBufferSource();
	src.buffer = k.buffer;
	src.loop = true;
	const f = ctx.createBiquadFilter();
	f.type = filter;
	f.frequency.value = freq;
	f.Q.value = q;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0, at);
	g.gain.linearRampToValueAtTime(peak, at + attack);
	g.gain.setValueAtTime(peak, at + attack + hold);
	g.gain.linearRampToValueAtTime(0, at + attack + hold + release);
	src.connect(f).connect(g).connect(k.out);
	src.start(at, offset % 0.9);
	src.stop(at + attack + hold + release + 0.05);
}

/** The espresso machine: a soft hiss of steam with the milk's lower gurgle under it. Returns its length. */
function steam(k: Kit, at: number, r: number, level: number): number {
	const hold = 0.8 + r * 1.4;
	swell(k, at, 0.25, hold, 0.6, "highpass", 4200, 0.7, 0.006 * level, r);
	swell(k, at + 0.1, 0.35, hold * 0.8, 0.5, "bandpass", 1100 + r * 500, 2.5, 0.004 * level, r + 0.37);
	return 0.25 + hold + 0.6 + 2;
}

/** The little bell over the shop door: two quick strikes as the door swings, then a softer third. */
function doorBell(k: Kit, at: number, pitch: number): number {
	const f = 2350 * pitch;
	[
		[0, 0.035],
		[0.13, 0.025],
		[0.29, 0.012],
	].forEach(([t, peak]) => {
		k.osc("sine", f, at + t!, peak!, 0.7);
		k.osc("sine", f * 2.76, at + t!, peak! * 0.35, 0.25);
	});
	return 3;
}

/** One key of the patter: a tiny high click, its brightness and level varied. */
function key(k: Kit, at: number, r: number, level: number): void {
	k.noise(at, 0.012, "bandpass", 2600 + r * 1800, 1.4, 0.012 * level, r * 0.9);
}

/** One clack of the belt: a short knock and a tick. */
function clack(k: Kit, at: number, level: number): void {
	k.osc("sine", 180, at, 0.02 * level, 0.05, { to: 90 });
	k.noise(at, 0.02, "bandpass", 900, 1.5, 0.012 * level);
}
