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
// into that room (quieter in another). Under them, a very low room tone per theme: the office hums
// with a keyboard patter whose rate follows the heat; the factory drones with a belt's clatter.
//
// The AudioContext is made only once sound is on and the window is on screen; it runs only while
// visible, and suspends when hidden, in calm mode, or when sound is turned off. Only the full
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

/** An event's variation: a pitch factor within ±5%, a start delay of up to 40 ms, and a seed. */
export function vary(id: string): { pitch: number; delay: number; seed: number } {
	const h = hashId(id);
	return { pitch: 0.95 + ((h & 0xff) / 255) * 0.1, delay: (((h >>> 8) & 0xff) / 255) * 0.04, seed: h };
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
	return area === zoomed ? 1.6 : 0.5;
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

const MASTER = 0.5;

export class Sound {
	#host: SoundHost;
	#enabled: boolean;
	#ctx?: AudioContext;
	#master?: GainNode;
	#noise?: AudioBuffer;
	#ears = new Ears();
	#gate = new Gate();
	#last: Played[] = [];
	#limited = 0;
	#quiet = 0;
	#heat = 0;
	#tone?: { theme: ThemeId; nodes: AudioScheduledSourceNode[]; out: GainNode; timer: ReturnType<typeof setInterval>; next: number; n: number };
	#unlock?: () => void;

	constructor(host: SoundHost) {
		this.#host = host;
		this.#enabled = host.enabled;
		this.update();
	}

	get enabled(): boolean {
		return this.#enabled;
	}

	setEnabled(on: boolean): void {
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
			if (this.#ctx?.state === "running") void this.#ctx.suspend();
		}
	}

	/** The theme changed: the room tone follows. */
	themeChanged(): void {
		this.#stopTone();
		this.#syncTone();
	}

	/** From `director.on`: play what the events call for. */
	hear(events: WorldEvent[], world: World): void {
		const cues = this.#ears.hear(events, world);
		this.#heat = heatOf(world);
		for (const cue of cues) this.#play(cue);
	}

	state(): SoundState {
		return {
			enabled: this.#enabled,
			context: this.#ctx?.state ?? "none",
			live: this.#live,
			last: [...this.#last],
			limited: this.#limited,
			quiet: this.#quiet,
			tone: { theme: this.#host.theme(), heat: this.#heat, running: !!this.#tone },
		};
	}

	#make(): void {
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		const ctx = new Ctor();
		this.#ctx = ctx;
		this.#master = ctx.createGain();
		this.#master.gain.value = MASTER;
		this.#master.connect(ctx.destination);
		// One second of white noise from a fixed seed, shared by every noisy sound.
		const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = buf.getChannelData(0);
		const r = seq(0x5eed);
		for (let i = 0; i < data.length; i++) data[i] = r() * 2 - 1;
		this.#noise = buf;
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
		out.gain.value = gain;
		const panner = ctx.createStereoPanner();
		panner.pan.value = pan;
		out.connect(panner).connect(this.#master);
		EARCONS[cue.kind](this.#kit(ctx, out), at, v.pitch, v.seed);
		// Let the graph go once it has rung out.
		setTimeout(() => {
			out.disconnect();
			panner.disconnect();
		}, 3_000);
		this.#last.push({ kind: cue.kind, id: cue.id, at: Math.round(at * 1000) / 1000, pan, gain });
		if (this.#last.length > 12) this.#last.shift();
	}

	#kit(ctx: AudioContext, out: AudioNode): Kit {
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
		out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
		out.connect(this.#master!);
		const k = kit(ctx, out, this.#noise!);
		const nodes = theme === "factory" ? droneBed(ctx, out) : humBed(ctx, out);
		const tone = { theme, nodes, out, next: ctx.currentTime + 0.5, n: 0, timer: undefined as unknown as ReturnType<typeof setInterval> };
		// Look a quarter second ahead every 200 ms and lay down the patter (or clatter) for it.
		tone.timer = setInterval(() => {
			const now = ctx.currentTime;
			if (tone.next < now) tone.next = now + 0.05;
			const heat = this.#heat;
			while (tone.next < now + 0.25) {
				const r = seq(hashId(`${theme}:${tone.n++}`));
				if (theme === "factory") {
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

	#stopTone(): void {
		const t = this.#tone;
		if (!t) return;
		clearInterval(t.timer);
		for (const n of t.nodes) {
			try {
				n.stop();
			} catch {
				// Already stopped.
			}
		}
		t.out.disconnect();
		this.#tone = undefined;
	}
}

// --- Synthesis -------------------------------------------------------------------------------------

interface Kit {
	ctx: AudioContext;
	out: AudioNode;
	/** A shaped oscillator: attack to `peak`, exponential decay over `decay` seconds. */
	osc(type: OscillatorType, freq: number, at: number, peak: number, decay: number, opts?: { attack?: number; to?: number; dest?: AudioNode }): void;
	/** A burst of filtered noise, from `offset` into the shared buffer. */
	noise(at: number, dur: number, filter: BiquadFilterType, freq: number, q: number, peak: number, offset?: number, dest?: AudioNode): GainNode;
}

function kit(ctx: AudioContext, out: AudioNode, buffer: AudioBuffer): Kit {
	return {
		ctx,
		out,
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

const EARCONS: Record<EarconKind, Earcon> = {
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

/** The office's bed: a faint mains hum (120 and 180 Hz) under a low-pass. */
function humBed(ctx: AudioContext, out: AudioNode): AudioScheduledSourceNode[] {
	const lp = ctx.createBiquadFilter();
	lp.type = "lowpass";
	lp.frequency.value = 400;
	lp.connect(out);
	return [
		[120, 0.012],
		[180, 0.005],
	].map(([f, g]) => {
		const o = ctx.createOscillator();
		o.frequency.value = f!;
		const gain = ctx.createGain();
		gain.gain.value = g!;
		o.connect(gain).connect(lp);
		o.start();
		return o;
	});
}

/** The factory's bed: a low saw drone and its octave, well muffled. */
function droneBed(ctx: AudioContext, out: AudioNode): AudioScheduledSourceNode[] {
	const lp = ctx.createBiquadFilter();
	lp.type = "lowpass";
	lp.frequency.value = 180;
	lp.connect(out);
	return (
		[
			["sawtooth", 55, 0.02],
			["sine", 110, 0.006],
		] as const
	).map(([type, f, g]) => {
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.value = f;
		const gain = ctx.createGain();
		gain.gain.value = g;
		o.connect(gain).connect(lp);
		o.start();
		return o;
	});
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
