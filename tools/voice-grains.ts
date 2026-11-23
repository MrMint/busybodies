// Cuts recorded mochi-speak into syllables for the app's syllable babble (sass/voiced.ts
// `grainPlan`, mainview/speech.ts). A clip is decoded to mono, measured in 10 ms frames, and its
// voiced stretches (above a threshold under its peak) are split at their quietest dip until each is
// a syllable's length. Each syllable's pitch (YIN, median over its voiced frames) and loudness are
// measured too, so the app can retune every syllable onto one melody and level them (sass/voiced.ts
// `grainPlan`). No re-encoding: the app plays slices of the clip it already has.
const FRAME = 0.01;

export interface GrainOptions {
	/** dB under the clip's loudest frame that still counts as voiced. */
	floorDb: number;
	/** A gap shorter than this joins its neighbours. */
	joinSec: number;
	/** Longer stretches are split at their quietest frame. */
	maxSec: number;
	/** Shorter pieces are dropped. */
	minSec: number;
	/** Air kept either side of a syllable. */
	padSec: number;
}

export const GRAIN_DEFAULTS: GrainOptions = { floorDb: 30, joinSec: 0.03, maxSec: 0.35, minSec: 0.06, padSec: 0.015 };

/** Loudness per 10 ms frame, in dB (full scale). */
export function envelope(samples: Float32Array, rate: number): number[] {
	const n = Math.max(1, Math.round(rate * FRAME));
	const out: number[] = [];
	for (let i = 0; i < samples.length; i += n) {
		let sum = 0;
		const end = Math.min(samples.length, i + n);
		for (let j = i; j < end; j++) sum += samples[j]! * samples[j]!;
		out.push(10 * Math.log10(sum / Math.max(1, end - i) + 1e-12));
	}
	return out;
}

/** Syllables from an envelope: `[start, end]` in seconds. */
export function segment(env: readonly number[], o: GrainOptions = GRAIN_DEFAULTS): [number, number][] {
	if (!env.length) return [];
	const peak = Math.max(...env);
	const floor = Math.max(-60, peak - o.floorDb);
	// Voiced runs of frames.
	let runs: [number, number][] = [];
	for (let i = 0; i < env.length; ) {
		if (env[i]! < floor) {
			i++;
			continue;
		}
		let j = i;
		while (j < env.length && env[j]! >= floor) j++;
		runs.push([i, j]);
		i = j;
	}
	// Join runs split by a hair.
	const joined: [number, number][] = [];
	for (const r of runs) {
		const last = joined.at(-1);
		if (last && (r[0] - last[1]) * FRAME < o.joinSec) last[1] = r[1];
		else joined.push([...r]);
	}
	runs = joined;
	// Split long runs at their quietest frame, away from the ends.
	const maxF = Math.round(o.maxSec / FRAME);
	const edge = Math.max(1, Math.round(0.12 / FRAME));
	const split = (r: [number, number]): [number, number][] => {
		if (r[1] - r[0] <= maxF || r[1] - r[0] < 2 * edge + 1) return [r];
		let cut = r[0] + edge;
		for (let k = r[0] + edge; k < r[1] - edge; k++) if (env[k]! < env[cut]!) cut = k;
		return [...split([r[0], cut]), ...split([cut, r[1]])];
	};
	const total = env.length * FRAME;
	return runs
		.flatMap(split)
		.filter((r) => (r[1] - r[0]) * FRAME >= o.minSec)
		.map(([a, b]) => [Math.max(0, round(a * FRAME - o.padSec)), Math.min(total, round(b * FRAME + o.padSec))] as [number, number]);
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/**
 * The pitch of one frame, in Hz, by YIN (de Cheveigné and Kawahara, 2002): the first lag whose
 * cumulative-mean-normalised difference dips under `threshold`, refined by a parabola. Undefined
 * for a frame with no clear pitch (a breath, a laugh's air, silence).
 */
export function yin(x: Float32Array, rate: number, minHz = 90, maxHz = 900, threshold = 0.15): number | undefined {
	const minLag = Math.floor(rate / maxHz);
	const maxLag = Math.min(Math.floor(rate / minHz), Math.floor(x.length / 2));
	if (maxLag <= minLag + 2) return undefined;
	const d = new Float32Array(maxLag + 1);
	const w = x.length - maxLag;
	for (let lag = 1; lag <= maxLag; lag++) {
		let sum = 0;
		for (let i = 0; i < w; i++) {
			const v = x[i]! - x[i + lag]!;
			sum += v * v;
		}
		d[lag] = sum;
	}
	let run = 0;
	const cmnd = new Float32Array(maxLag + 1);
	cmnd[0] = 1;
	for (let lag = 1; lag <= maxLag; lag++) {
		run += d[lag]!;
		cmnd[lag] = run > 0 ? (d[lag]! * lag) / run : 1;
	}
	for (let lag = minLag; lag < maxLag; lag++) {
		if (cmnd[lag]! >= threshold) continue;
		while (lag + 1 < maxLag && cmnd[lag + 1]! < cmnd[lag]!) lag++;
		const a = cmnd[lag - 1]!;
		const b = cmnd[lag]!;
		const c = cmnd[lag + 1]!;
		const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
		return rate / (lag + (Number.isFinite(shift) ? shift : 0));
	}
	return undefined;
}

/** A syllable's pitch (the median of its voiced 40 ms frames, if at least half are) and loudness. */
export function grainInfo(samples: Float32Array, rate: number, [start, end]: [number, number]): { hz?: number; db: number } {
	const a = Math.floor(start * rate);
	const b = Math.min(samples.length, Math.floor(end * rate));
	const seg = samples.subarray(a, b);
	let sum = 0;
	for (const v of seg) sum += v * v;
	const db = Math.round(10 * Math.log10(sum / Math.max(1, seg.length) + 1e-12) * 10) / 10;
	const frame = Math.floor(rate * 0.04);
	const hop = Math.floor(rate * 0.02);
	const pitches: number[] = [];
	let frames = 0;
	for (let i = 0; i + frame <= seg.length; i += hop) {
		frames++;
		const f = yin(seg.subarray(i, i + frame), rate);
		if (f) pitches.push(f);
	}
	if (!frames || pitches.length < frames / 2) return { db };
	pitches.sort((x, y) => x - y);
	return { hz: Math.round(pitches[pitches.length >> 1]! * 10) / 10, db };
}

/** A clip's syllables, each with its pitch (null when it has none) and loudness. */
export interface Sliced {
	at: [number, number][];
	hz: (number | null)[];
	db: number[];
}

/** A clip's syllables: decoded with ffmpeg (mono, 24 kHz), then `segment` and `grainInfo`. */
export async function sliceGrains(file: string, o: GrainOptions = GRAIN_DEFAULTS): Promise<Sliced> {
	const rate = 24_000;
	const p = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1"], { stdout: "pipe", stderr: "pipe" });
	const [buf, err, code] = await Promise.all([new Response(p.stdout).arrayBuffer(), new Response(p.stderr).text(), p.exited]);
	if (code !== 0) throw new Error(`ffmpeg: ${err.trim()}`);
	const samples = new Float32Array(buf);
	const at = segment(envelope(samples, rate), o);
	const info = at.map((g) => grainInfo(samples, rate, g));
	return { at, hz: info.map((i) => i.hz ?? null), db: info.map((i) => i.db) };
}
