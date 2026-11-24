// The music bed (design/sound.md): a calm and a busy take of one piece, in the voices' key and one
// tempo, looping together; the mix leans from calm to busy as the office heats up (Sound's heat),
// slowly, so it never lurches, and dips under a key beat. On trial in the sound lab: ?music=<style>
// plays voice-takes/music/<theme>/<style>-{calm,busy}.mp3 from tools/voice.ts listen (/lab/music/).
// Plays through Sound's context and master, and only while sound is live.
import type { ThemeId } from "../scene/theme/id";
import { type Sound, meterDb } from "./sound";

export interface MusicBedHost {
	sound: Sound;
	theme(): ThemeId;
	/** Where the clips are: the lab's base. */
	base: string;
	style: string;
}

/** The styles auditioned (tools/music.ts `STYLES`). */
export const MUSIC_STYLES = ["felt-piano", "music-box", "chamber", "lofi", "ambient"] as const;

/**
 * The bed's level against the master: about -32 dBFS on the lab's meter, under the voices' front.
 * Lyria's clips are mastered loud (about -21 at 0.35), so this is low.
 */
const BED_GAIN = 0.1;
/** Seconds of each clip's tail crossfaded into its head, so a clip that wasn't made to loop does. */
const SEAM = 1.5;

/**
 * A clip made seamless: it starts `fade` seconds in, and its last `fade` seconds carry the opening
 * fading in (equal power) as the tail fades out, so the end runs straight into the start.
 */
export function seamless(ctx: BaseAudioContext, buf: AudioBuffer, fade = SEAM): AudioBuffer {
	const f = Math.floor(fade * buf.sampleRate);
	const n = buf.length;
	if (n < 4 * f) return buf;
	const out = ctx.createBuffer(buf.numberOfChannels, n - f, buf.sampleRate);
	for (let ch = 0; ch < buf.numberOfChannels; ch++) {
		const src = buf.getChannelData(ch);
		const dst = out.getChannelData(ch);
		dst.set(src.subarray(f));
		const tail = n - 2 * f;
		for (let i = 0; i < f; i++) {
			const x = i / f;
			dst[tail + i] = src[f + tail + i]! * Math.cos((x * Math.PI) / 2) + src[i]! * Math.sin((x * Math.PI) / 2);
		}
	}
	return out;
}
/** How long the lean between calm and busy takes to settle (a time constant, seconds). */
const LEAN_TAU = 6;

/** How much of the busy take to hear at a heat: none when calm, all of it from 0.7 up, eased. */
export function busyShare(heat: number): number {
	const x = Math.max(0, Math.min(1, heat / 0.7));
	return x * x * (3 - 2 * x);
}

export class MusicBed {
	#host: MusicBedHost;
	#level = 1;
	#run?: { ctx: AudioContext; out: GainNode; calm: GainNode; busy: GainNode; srcs: AudioBufferSourceNode[]; timer: ReturnType<typeof setInterval>; meter: AnalyserNode; theme: ThemeId };
	#loading?: Promise<void>;
	#retry?: ReturnType<typeof setTimeout>;

	constructor(host: MusicBedHost) {
		this.#host = host;
	}

	/** Another style: the old one fades out and the new one loads. */
	setStyle(style: string): void {
		if (style === this.#host.style) return;
		this.#host = { ...this.#host, style };
		this.#stop();
		this.update();
	}

	setLevel(level: number): void {
		this.#level = level;
		const r = this.#run;
		if (r) r.out.gain.setTargetAtTime(BED_GAIN * level, r.ctx.currentTime, 0.2);
	}

	meter(): number | undefined {
		return this.#run && meterDb(this.#run.meter);
	}

	state(): { style: string; running: boolean; busy?: number } {
		return { style: this.#host.style, running: !!this.#run, busy: this.#run && Math.round(this.#run.busy.gain.value * 100) / 100 };
	}

	/** Dip under a key beat, like the room tone. */
	duck(at: number, secs: number): void {
		const r = this.#run;
		if (!r) return;
		r.out.gain.cancelScheduledValues(r.ctx.currentTime);
		r.out.gain.setTargetAtTime(BED_GAIN * this.#level * 0.5, at, 0.15);
		r.out.gain.setTargetAtTime(BED_GAIN * this.#level, at + secs, 0.8);
	}

	update(): void {
		const bus = this.#host.sound.bus();
		if (!bus) {
			this.#stop();
			if (this.#host.sound.enabled && !this.#retry) this.#retry = setTimeout(() => ((this.#retry = undefined), this.update()), 500);
			return;
		}
		const theme = this.#host.theme();
		if (this.#run && (this.#run.ctx !== bus.ctx || this.#run.theme !== theme)) this.#stop();
		if (this.#run || this.#loading) return;
		const ctx = bus.ctx;
		const url = (mood: string) => `${this.#host.base}music/${theme}/${this.#host.style}-${mood}.mp3`;
		const load = (u: string) =>
			fetch(u)
				.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
				.then((b) => ctx.decodeAudioData(b));
		this.#loading = Promise.all([load(url("calm")), load(url("busy"))])
			.then((bufs) => bufs.map((b) => seamless(ctx, b)))
			.then(([calmBuf, busyBuf]) => {
				if (!this.#host.sound.bus()) return;
				const out = ctx.createGain();
				out.gain.value = 0;
				out.gain.setTargetAtTime(BED_GAIN * this.#level, ctx.currentTime, 2);
				out.connect(bus.out);
				const meter = ctx.createAnalyser();
				meter.fftSize = 2048;
				out.connect(meter);
				const calm = ctx.createGain();
				const busy = ctx.createGain();
				const share = busyShare(this.#host.sound.heat);
				calm.gain.value = 1 - share;
				busy.gain.value = share;
				calm.connect(out);
				busy.connect(out);
				// Both takes start together and loop over the shorter one's length, so they stay in step.
				const len = Math.min(calmBuf.duration, busyBuf.duration);
				const at = ctx.currentTime + 0.1;
				const srcs = [
					[calmBuf, calm],
					[busyBuf, busy],
				].map(([buf, g]) => {
					const s = ctx.createBufferSource();
					s.buffer = buf as AudioBuffer;
					s.loop = true;
					s.loopEnd = len;
					s.connect(g as GainNode);
					s.start(at);
					return s;
				});
				const timer = setInterval(() => {
					const b = busyShare(this.#host.sound.heat);
					busy.gain.setTargetAtTime(b, ctx.currentTime, LEAN_TAU);
					calm.gain.setTargetAtTime(1 - b, ctx.currentTime, LEAN_TAU);
				}, 1_000);
				this.#run = { ctx, out, calm, busy, srcs, timer, meter, theme };
			})
			.catch(() => {})
			.finally(() => (this.#loading = undefined));
	}

	#stop(): void {
		const r = this.#run;
		if (!r) return;
		this.#run = undefined;
		clearInterval(r.timer);
		r.out.gain.cancelScheduledValues(r.ctx.currentTime);
		r.out.gain.setTargetAtTime(0, r.ctx.currentTime, 0.3);
		setTimeout(() => {
			for (const s of r.srcs) {
				try {
					s.stop();
				} catch {
					// Already stopped.
				}
			}
			r.out.disconnect();
		}, 2_000);
	}
}
