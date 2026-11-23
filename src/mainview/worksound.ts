// Work sounds: the noise of everyone working, the main body of the office's sound (design/sound.md).
// Every busy character makes the sound of what it's doing (the director's `work`, or the station
// it's using on a trip), in its theme's palette of paper, felt and desk toys, synthesised here from
// code. Hits land on a soft pulse (16ths, quicker as the office heats up), anything pitched is in
// the mochis' key (sass/voiced.ts `MOCHI_KEY`), and at most a few play per step: the room the camera
// is in first and clear, the rest quieter and through the wall, taking turns so nobody hogs it.
// Beyond that the room tone's patter (sound.ts) carries the bustle.
//
// It plays through Sound's context, master and shared room, and only while sound is live. Every
// choice comes from the character's key and the step, never Math.random.
import type { World } from "../scene/director";
import type { WorkKind } from "../scene/director/work";
import type { StationKind } from "../scene/director/stations";
import type { Stop, View } from "../scene/office/camera";
import type { World as Floor } from "../scene/office/world";
import { MOCHI_KEY } from "../scene/sass/voiced";
import type { ThemeId } from "../scene/theme/id";
import { type Kit, type Sound, hashId, kit, makeNoise, panFor, seq, zoomedArea } from "./sound";

/** What a working character sounds like: its work, or the station it's at. */
export type WorkSoundKind = "type" | "flip" | "riffle" | "machine" | "stamp" | "chirp" | "drop" | "shred";

const OF_WORK: Record<WorkKind, WorkSoundKind> = { edit: "type", read: "flip", search: "riffle", shell: "machine", test: "stamp", web: "chirp" };
const OF_STATION: Record<StationKind, WorkSoundKind> = { reference: "flip", search: "riffle", build: "machine", test: "stamp", web: "chirp", outbox: "drop", shredder: "shred" };

/** A character's work sound now, if it's working: at a station it's using, that station's; else its work's. */
export function workSoundOf(a: { mood: string; gone?: number; work?: { kind: WorkKind }; trip?: { kind: StationKind; queue: number } }): WorkSoundKind | undefined {
	if (a.gone !== undefined || a.mood !== "busy") return undefined;
	if (a.trip && a.trip.queue === 0) return OF_STATION[a.trip.kind];
	return a.work ? OF_WORK[a.work.kind] : undefined;
}

/**
 * How likely a sound is on a step (a 16th): typing is busy and follows the character's tempo; a
 * machine and a stamp only land on beats; flips, riffles and chirps are occasional.
 */
export function chance(kind: WorkSoundKind, step: number, tempo: number): number {
	switch (kind) {
		case "type":
			return 0.42 * tempo;
		case "machine":
			return step % 4 === 0 ? 0.3 : 0;
		case "stamp":
			return step % 8 === 0 ? 0.28 : 0;
		case "shred":
			return step % 2 === 0 ? 0.18 : 0;
		case "flip":
			return 0.035;
		case "riffle":
			return 0.03;
		case "chirp":
			return 0.025;
		case "drop":
			return 0.03;
	}
}

export interface Source {
	key: string;
	kind: WorkSoundKind;
	tempo: number;
	area?: string;
	/** In the room the camera is in. */
	near: boolean;
}

export interface Hit {
	key: string;
	kind: WorkSoundKind;
	near: boolean;
	area?: string;
	/** A little off the grid, in seconds (typing is human). */
	nudge: number;
	/** 0..1, for the sound's own variation. */
	r: number;
}

/** How many sounds a step may hold: zoomed into a room, its own get one more. */
export const BUDGET = { far: 3, near: 4 } as const;

/**
 * The hits on one step: each source rolls against its chance (seeded by its key and the step), then
 * the room in view goes first and the rest take turns (a rotating order, so the same few don't
 * always win), up to the budget.
 */
export function hitsOn(sources: readonly Source[], step: number, zoomed: boolean): Hit[] {
	const rolled: (Hit & { order: number })[] = [];
	for (const s of sources) {
		const r = seq(hashId(`${s.key}|${step}`));
		if (r() >= chance(s.kind, step, s.tempo)) continue;
		rolled.push({ key: s.key, kind: s.kind, near: s.near, area: s.area, nudge: s.kind === "type" ? (r() - 0.5) * 0.02 : 0, r: r(), order: hashId(`${s.key}|${Math.floor(step / 16)}`) });
	}
	rolled.sort((a, b) => Number(b.near) - Number(a.near) || a.order - b.order);
	return rolled.slice(0, zoomed ? BUDGET.near : BUDGET.far).map(({ order: _, ...h }) => h);
}

/** A note of the mochis' key at or above `minHz`, picked by `r`, from the octave above it. */
export function keyNote(minHz: number, r: number): number {
	const notes: number[] = [];
	for (let o = 0; notes.length < 10; o++)
		for (const n of MOCHI_KEY.scale) {
			const hz = MOCHI_KEY.rootHz * 2 ** (o + n / 12);
			if (hz >= minHz && notes.length < 10) notes.push(hz);
		}
	return notes[Math.floor(r * 5)]!;
}

type Play = (k: Kit, at: number, r: number) => void;

/** Each theme's palette: soft, small, tactile; paper and felt in the office, tin and rubber in the factory, glass and wood in the bakery. */
export const PALETTE: Record<ThemeId, Record<WorkSoundKind, Play>> = {
	office: {
		// A soft key: a felted click with a hint of the key's wood.
		type: (k, at, r) => {
			k.noise(at, 0.016, "bandpass", 1900 + r * 1500, 1.8, 0.035, r);
			k.osc("sine", 900 + r * 300, at, 0.006, 0.012);
		},
		// A page turning: two soft brushes of paper.
		flip: (k, at, r) => {
			k.noise(at, 0.07, "bandpass", 2200 + r * 600, 0.9, 0.022, r);
			k.noise(at + 0.05, 0.09, "bandpass", 3400, 0.8, 0.016, r + 0.3);
		},
		// Riffling a card file: a run of tiny ticks, slowing.
		riffle: (k, at, r) => {
			for (let i = 0; i < 6; i++) k.noise(at + i * (0.022 + i * 0.004), 0.009, "bandpass", 4200 - i * 150, 2, 0.02 * (1 - i / 8), r + i * 0.1);
		},
		// The stapler: a soft clunk and a tick.
		machine: (k, at, r) => {
			k.osc("sine", 150 + r * 20, at, 0.05, 0.06, { to: 75 });
			k.noise(at + 0.004, 0.025, "bandpass", 1600, 1.4, 0.03, r);
		},
		// The rubber stamp: a thunk into paper.
		stamp: (k, at, r) => {
			k.osc("sine", 120, at, 0.06, 0.08, { to: 55 });
			k.noise(at, 0.04, "lowpass", 900, 0.7, 0.03, r);
		},
		// A soft phone burble: two notes of the key.
		chirp: (k, at, r) => {
			const f = keyNote(1000, r);
			k.osc("sine", f, at, 0.014, 0.06);
			k.osc("sine", f * 1.335, at + 0.08, 0.011, 0.07);
		},
		// A sheaf dropped in the tray.
		drop: (k, at, r) => {
			k.noise(at, 0.09, "lowpass", 700, 0.7, 0.035, r);
			k.osc("sine", 210, at, 0.02, 0.05, { to: 120 });
		},
		// The shredder's little grind.
		shred: (k, at, r) => k.noise(at, 0.22, "bandpass", 1100 + r * 300, 0.8, 0.012, r),
	},
	factory: {
		// A rivet tap: a small bright ping and a tick of metal.
		type: (k, at, r) => {
			k.osc("sine", 1700 + r * 400, at, 0.012, 0.025);
			k.noise(at, 0.008, "highpass", 3000, 0.7, 0.018, r);
		},
		// A clipboard's page and clip.
		flip: (k, at, r) => {
			k.noise(at, 0.06, "bandpass", 2400, 0.9, 0.02, r);
			k.osc("square", 700, at + 0.06, 0.004, 0.01);
		},
		// Rummaging a parts bin: a few knocks of tin.
		riffle: (k, at, r) => {
			for (let i = 0; i < 4; i++) k.osc("triangle", 420 + ((r * 7 + i * 3) % 5) * 70, at + i * 0.045, 0.012, 0.03);
		},
		// The press: a low thunk and a hiss of air.
		machine: (k, at, r) => {
			k.osc("sine", 90, at, 0.07, 0.12, { to: 45 });
			k.noise(at + 0.02, 0.12, "bandpass", 500 + r * 200, 1, 0.022, r);
		},
		// A gauge clicking over.
		stamp: (k, at) => {
			k.osc("square", 2900, at, 0.004, 0.008);
			k.osc("square", 2600, at + 0.05, 0.003, 0.008);
		},
		// A radio chirp up the key.
		chirp: (k, at, r) => {
			const f = keyNote(800, r);
			k.osc("triangle", f, at, 0.01, 0.08, { to: f * 1.5 });
		},
		// A crate set down.
		drop: (k, at, r) => {
			k.osc("sine", 110, at, 0.05, 0.08, { to: 70 });
			k.noise(at, 0.05, "lowpass", 500, 0.7, 0.03, r);
		},
		// The grinder.
		shred: (k, at, r) => k.noise(at, 0.25, "bandpass", 2400 + r * 400, 1.2, 0.01, r),
	},
	bakery: {
		// A whisk: three quick wire brushes.
		type: (k, at, r) => {
			for (let i = 0; i < 3; i++) k.noise(at + i * 0.028, 0.012, "bandpass", 4800 + r * 800, 2.5, 0.016, r + i * 0.2);
		},
		// A recipe card turned.
		flip: (k, at, r) => k.noise(at, 0.06, "bandpass", 2600 + r * 500, 0.9, 0.02, r),
		// A jar lid's clink, in the key.
		riffle: (k, at, r) => {
			const f = keyNote(2000, r);
			k.osc("sine", f, at, 0.012, 0.18);
			k.osc("sine", f * 2.76, at, 0.004, 0.06);
		},
		// The oven door: a soft low thud and a puff of warm air.
		machine: (k, at, r) => {
			k.osc("sine", 85, at, 0.05, 0.1, { to: 55 });
			k.noise(at + 0.03, 0.18, "lowpass", 400, 0.6, 0.02, r);
		},
		// A spoon's tink on a bowl.
		stamp: (k, at, r) => {
			const f = keyNote(2500, r);
			k.osc("sine", f, at, 0.012, 0.22);
		},
		// A small bell on the counter.
		chirp: (k, at, r) => {
			const f = keyNote(1800, r);
			k.osc("sine", f, at, 0.012, 0.5);
			k.osc("sine", f * 2.76, at, 0.004, 0.18);
		},
		// A tray set down.
		drop: (k, at, r) => {
			k.osc("sine", 330, at, 0.015, 0.06, { to: 260 });
			k.noise(at, 0.04, "bandpass", 1800, 1, 0.02, r);
		},
		// The mixer's hum.
		shred: (k, at, r) => k.noise(at, 0.3, "bandpass", 320 + r * 60, 4, 0.016, r),
	},
};

/** The work layer's level against the master, and its share of the shared room. */
const WORK_GAIN = 0.9;
const WORK_SEND = 0.25;
/** Through the wall (another room than the one in view, or the whole office): quieter and duller. */
const FAR = { gain: 0.5, hz: 1_800 } as const;

export interface WorkSoundHost {
	sound: Sound;
	world(): World | undefined;
	theme(): ThemeId;
	floor(): Floor | undefined;
	view(): View;
	stop(): Stop;
	width(): number;
}

export interface WorkSoundState {
	running: boolean;
	level: number;
	/** Characters making a sound now, and hits scheduled so far. */
	sources: number;
	hits: number;
}

/** The layer while it runs: its bus, the step timer, where the pulse is. */
interface Run {
	ctx: AudioContext;
	out: GainNode;
	timer: ReturnType<typeof setInterval>;
	next: number;
	step: number;
	noise: AudioBuffer;
}

export class WorkSound {
	#host: WorkSoundHost;
	#level = 1;
	#run?: Run;
	#sources = 0;
	#hits = 0;
	#retry?: ReturnType<typeof setTimeout>;

	constructor(host: WorkSoundHost) {
		this.#host = host;
	}

	/** The lab's level, 0 (off) to 2. */
	setLevel(level: number): void {
		this.#level = level;
		const r = this.#run;
		if (r) {
			r.out.gain.cancelScheduledValues(r.ctx.currentTime);
			r.out.gain.setTargetAtTime(WORK_GAIN * level, r.ctx.currentTime, 0.2);
		}
	}

	state(): WorkSoundState {
		return { running: !!this.#run, level: this.#level, sources: this.#sources, hits: this.#hits };
	}

	/** Run while sound is live; stop otherwise. */
	update(): void {
		const bus = this.#host.sound.bus();
		if (!bus) {
			this.#stop();
			// On but not live yet (the context resumes a moment after it's made): look again shortly.
			if (this.#host.sound.enabled && !this.#retry) this.#retry = setTimeout(() => ((this.#retry = undefined), this.update()), 500);
			return;
		}
		if (this.#run?.ctx === bus.ctx) return;
		this.#stop();
		const ctx = bus.ctx;
		const out = ctx.createGain();
		out.gain.value = 0;
		out.gain.setTargetAtTime(WORK_GAIN * this.#level, ctx.currentTime, 1);
		const send = ctx.createGain();
		send.gain.value = WORK_SEND;
		out.connect(bus.out);
		out.connect(send).connect(bus.room);
		const run: Run = { ctx, out, next: ctx.currentTime + 0.3, step: 0, noise: makeNoise(ctx), timer: undefined as unknown as ReturnType<typeof setInterval> };
		run.timer = setInterval(() => this.#tick(run), 100);
		this.#run = run;
	}

	#tick(run: Run): void {
		if (!this.#host.sound.bus()) return this.#stop();
		const ctx = run.ctx;
		const now = ctx.currentTime;
		if (run.next < now) run.next = now + 0.05;
		const world = this.#host.world();
		const floor = this.#host.floor();
		const zoomed = zoomedArea(this.#host.stop(), floor);
		const sources: Source[] = [];
		for (const a of Object.values(world?.actors ?? {})) {
			const kind = workSoundOf(a);
			if (!kind) continue;
			const area = a.homeArea ?? a.area;
			sources.push({ key: a.key, kind, tempo: a.tempo ?? 1, area, near: zoomed !== undefined && area === zoomed });
		}
		this.#sources = sources.length;
		// The pulse: about 96 bpm calm, up to 120 in a rush.
		const heat = this.#host.sound.heat;
		const step = 60 / (96 + 24 * heat) / 4;
		const palette = PALETTE[this.#host.theme()] ?? PALETTE.office;
		while (run.next < now + 0.3) {
			for (const h of hitsOn(sources, run.step, zoomed !== undefined)) this.#play(run, palette, h, run.next + Math.max(0, h.nudge));
			run.next += step;
			run.step++;
		}
	}

	#play(run: Run, palette: Record<WorkSoundKind, Play>, h: Hit, at: number): void {
		const ctx = run.ctx;
		const floor = this.#host.floor();
		const rect = h.area ? floor?.areas.find((a) => a.id === h.area)?.rect : undefined;
		const pan = ctx.createStereoPanner();
		pan.pan.value = panFor(rect, this.#host.view(), this.#host.width());
		const g = ctx.createGain();
		g.gain.value = h.near ? 1 : FAR.gain;
		let head: AudioNode = g;
		if (!h.near) {
			const wall = ctx.createBiquadFilter();
			wall.type = "lowpass";
			wall.frequency.value = FAR.hz;
			g.connect(wall);
			head = wall;
		}
		head.connect(pan).connect(run.out);
		palette[h.kind](kit(ctx, g, run.noise), at, h.r);
		this.#hits++;
		setTimeout(() => {
			g.disconnect();
			pan.disconnect();
		}, (at - ctx.currentTime + 1) * 1000);
	}

	#stop(): void {
		const r = this.#run;
		if (!r) return;
		this.#run = undefined;
		clearInterval(r.timer);
		r.out.gain.cancelScheduledValues(r.ctx.currentTime);
		r.out.gain.setTargetAtTime(0, r.ctx.currentTime, 0.1);
		setTimeout(() => r.out.disconnect(), 800);
	}

}
