// Cuts recorded mochi-speak into syllables for the app's syllable babble (sass/voiced.ts
// `grainPlan`, mainview/speech.ts). A clip is decoded to mono, measured in 10 ms frames, and its
// voiced stretches (above a threshold under its peak) are split at their quietest dip until each is
// a syllable's length. No re-encoding: the app plays slices of the clip it already has.
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

/** A clip's syllables: decoded with ffmpeg (mono, 24 kHz), then `segment`. */
export async function sliceGrains(file: string, o: GrainOptions = GRAIN_DEFAULTS): Promise<[number, number][]> {
	const rate = 24_000;
	const p = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1"], { stdout: "pipe", stderr: "pipe" });
	const [buf, err, code] = await Promise.all([new Response(p.stdout).arrayBuffer(), new Response(p.stderr).text(), p.exited]);
	if (code !== 0) throw new Error(`ffmpeg: ${err.trim()}`);
	return segment(envelope(new Float32Array(buf), rate), o);
}
