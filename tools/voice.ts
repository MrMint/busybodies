#!/usr/bin/env bun
// Records the characters' voiced lines ahead of time, offline, on the developer's machine, with
// Gemini text-to-speech on Vertex AI (the app never calls out: it only plays what ships). See the
// AI-generated audio entry in docs/decisions.md for the terms this relies on.
//
//   bun tools/voice.ts lines  [--theme office] [--all]       what the characters say, per theme
//   bun tools/voice.ts record [--theme office] [--takes 2] [--all] [--limit 20] [--model id]
//                             [--dry-run | --fake | --yes]
//   bun tools/voice.ts listen [--port 4477]                  a local page to approve takes or mark them for redo
//   bun tools/voice.ts ship                                  copy approved takes into the app, write its manifest
//   bun tools/voice.ts status                                counts and sizes
//
// `record` collects every fixed said line of the key beats (waiting on you, done, back to work;
// `--all` takes every said line) from the theme's sass bank (src/scene/sass/voiced.ts), casts each
// in `--takes` voices of the theme's pool (tools/voice-cast.ts), and records only what is missing:
// a take is keyed by a hash of the line's words and remembers what it was recorded with, so an
// unchanged line in an unchanged voice is never recorded again, and a take marked for redo is.
// Lines with a {placeholder} are skipped: the app babbles them on device.
//
//   --dry-run  no network and no credentials: prints the plan, an estimate, and one request body
//   --fake     no network: writes locally synthesised placeholder clips, to try listen and ship
//   --yes      spend: without it a real run stops after the plan
//
// Takes land in voice-takes/ (gitignored) as Opus in WebM, with takes.json. Nothing there is
// committed; `ship` copies approved takes into src/mainview/public/voice/ and writes
// manifest.json, and only those are committed.
//
// Credentials are the machine's Application Default Credentials, read at run time through
// `gcloud auth application-default print-access-token`; the project from GOOGLE_CLOUD_PROJECT or
// `gcloud config get-value project`, the region from GOOGLE_CLOUD_LOCATION (default "global").
// None of it is written anywhere.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { type GrainClip, type Take, VOICED, corpus, lineKey, type ThemeVoices, type VoiceLine, type VoiceManifest, voicesFor } from "../src/scene/sass/voiced";
import type { TriggerKind } from "../src/scene/sass/types";
import { sliceGrains } from "./voice-grains";
import { hash } from "../src/scene/sass/types";
import { THEME_IDS, type ThemeId } from "../src/scene/theme/id";
import { CAST, type CastVoice, DELIVERIES, MOCHI_SPEAK, PREBUILT, REACTIONS, promptFor } from "./voice-cast";

const ROOT = join(import.meta.dir, "..");
export const WORK = join(ROOT, "voice-takes");
export const SHIP = join(ROOT, "src/mainview/public/voice");
const TAKES = join(WORK, "takes.json");

/**
 * Models whose output we may ship, per the terms read on 2026-11-23 (docs/decisions.md): Gemini 3.8
 * Flash TTS and Flash-Lite TTS are GA on Vertex AI, so only the general Generative AI terms apply;
 * Gemini 3.1 Flash TTS and Gemini 2.5 Flash-Lite TTS are Preview, and the Preview terms' ban on
 * production use and on disclosing output doesn't apply to them on Vertex AI. Read the terms again
 * before adding one.
 */
export const TERMS_OK = ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-lite-preview-tts"] as const;
/** Gemini 3.8 Flash TTS: GA, cheaper, and the one we iterate on (decisions.md). */
const DEFAULT_MODEL = "gemini-3.8-flash-tts";

/**
 * Gemini 3.8 TTS reads its text word for word: the style goes in each part's `speech_metadata`,
 * not in the text, and it answers with WAV by default. Older models take the style in the text.
 */
export const isV38 = (model: string) => model.startsWith("gemini-3.8-");

/**
 * US dollars per million tokens for Gemini 3.1 Flash TTS on Vertex, as listed on 2026-11-23
 * (cloud.google.com/text-to-speech/pricing): audio out at 25 tokens a second, text in. For the
 * estimate only; the bill is Google's.
 */
export const PRICES: Record<string, { audioOutPerM: number; textInPerM: number }> = {
	"gemini-3.1-flash-tts-preview": { audioOutPerM: 20, textInPerM: 1 },
	// Through 2026-12-31; $18 and $1 from 2027-01-01 (ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts).
	"gemini-3.8-flash-tts": { audioOutPerM: 9, textInPerM: 0.5 },
};
const AUDIO_TOKENS_PER_SEC = 25;
/** A model's list price, or the dearest we know when it isn't listed here. */
export const priceOf = (model: string) => PRICES[model] ?? { audioOutPerM: 20, textInPerM: 1 };

/** What a run would cost and weigh, from its prompts' lengths and an estimate of the speech. */
export function estimate(items: { prompt: string; text: string; model: string }[]): { secs: number; audioTokens: number; textTokens: number; usd: number; kb: number } {
	let secs = 0;
	let audioTokens = 0;
	let textTokens = 0;
	let usd = 0;
	for (const i of items) {
		const s = estimateMs(i.text) / 1000;
		const a = s * AUDIO_TOKENS_PER_SEC;
		const t = i.prompt.length / 4;
		const p = priceOf(i.model);
		secs += s;
		audioTokens += a;
		textTokens += t;
		usd += (a * p.audioOutPerM + t * p.textInPerM) / 1e6;
	}
	return { secs, audioTokens: Math.round(audioTokens), textTokens: Math.round(textTokens), usd, kb: Math.round(secs * 3.1) };
}

const say$ = (e: ReturnType<typeof estimate>) =>
	`about ${e.secs.toFixed(0)} s of speech: ~${e.audioTokens} audio tokens out, ~${e.textTokens} text tokens in, ~$${e.usd.toFixed(2)} at list price; ~${e.kb} KB as Opus`;

export type Status = "new" | "approved" | "redo";
export interface WorkTake {
	voice: string;
	/** A hash of what it was recorded with (model, prebuilt voice, style): a change re-records it. */
	sig: string;
	model: string;
	file: string;
	ms: number;
	bytes: number;
	status: Status;
	at: string;
}
export interface WorkLine {
	text: string;
	trigger: string;
	role: string;
	takes: WorkTake[];
}
export interface Work {
	version: 1;
	themes: Partial<Record<ThemeId, Record<string, WorkLine>>>;
}

// --- args ----------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "help";
const has = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, dflt: string) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : dflt;
};
const themes = (): ThemeId[] => {
	const t = opt("theme", "");
	if (!t) return [...THEME_IDS];
	if (!(THEME_IDS as readonly string[]).includes(t)) die(`no theme "${t}" (${THEME_IDS.join(", ")})`);
	return [t as ThemeId];
};

function die(msg: string): never {
	console.error(`voice: ${msg}`);
	process.exit(1);
}

// --- state ---------------------------------------------------------------------------------------

export function loadWork(): Work {
	if (!existsSync(TAKES)) return { version: 1, themes: {} };
	return JSON.parse(readFileSync(TAKES, "utf8")) as Work;
}
export function saveWork(w: Work): void {
	mkdirSync(WORK, { recursive: true });
	writeFileSync(TAKES, `${JSON.stringify(w, null, "\t")}\n`);
}

export const sigOf = (model: string, theme: ThemeId, v: CastVoice) => hash(`${model}|${v.voice}|${promptFor(theme, v)}`).toString(16);

/** The lines a run records: key beats (or every said line), never a templated one. */
export const toRecord = (theme: ThemeId, all: boolean): VoiceLine[] => corpus(theme).filter((l) => (all || l.beat) && !l.templated);

export interface Job {
	theme: ThemeId;
	line: VoiceLine;
	voice: CastVoice;
	sig: string;
	why: "new" | "changed" | "redo";
}

/** What's missing: each line in `takes` voices, unless a take in that voice is current and not marked for redo. */
export function plan(work: Work, ts: ThemeId[], o: { takes: number; all: boolean; model: string }): Job[] {
	const jobs: Job[] = [];
	for (const theme of ts) {
		const pool = CAST[theme];
		for (const line of toRecord(theme, o.all)) {
			const have = work.themes[theme]?.[line.key]?.takes ?? [];
			for (const id of voicesFor(line.key, pool.map((v) => v.id), o.takes)) {
				const voice = pool.find((v) => v.id === id)!;
				const sig = sigOf(o.model, theme, voice);
				const t = have.find((x) => x.voice === id);
				if (t && t.sig === sig && t.status !== "redo") continue;
				jobs.push({ theme, line, voice, sig, why: !t ? "new" : t.status === "redo" ? "redo" : "changed" });
			}
		}
	}
	return jobs;
}

/** A line in a voice: what `speak` and the fake encoder need (a `Job`, or an audition's take). */
export interface Utterance {
	theme: ThemeId;
	line: { text: string };
	voice: CastVoice;
}

/** About 14 characters a second of speech, plus a breath. */
export const estimateMs = (text: string) => Math.round(400 + (text.length / 14) * 1000);

// --- Vertex --------------------------------------------------------------------------------------

/** The generateContent body for one line in one voice (single speaker, audio out). */
export function requestBody(theme: ThemeId, line: { text: string }, v: CastVoice, model: string = DEFAULT_MODEL) {
	const style = promptFor(theme, v).trim();
	const part = isV38(model) ? { text: line.text, speech_metadata: { style } } : { text: `${style} Say this line, and nothing else: ${line.text}` };
	return {
		contents: [{ role: "user", parts: [part] }],
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voice } } },
		},
	};
}

/** What a request costs in text: the style and the line, however the model takes them. */
const promptOf = (u: Utterance) => `${promptFor(u.theme, u.voice)} ${u.line.text}`;

async function sh(cmd: string[]): Promise<string> {
	const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
	if (code !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} failed: ${err.trim().split("\n").at(-1)}`);
	return out.trim();
}

interface Vertex {
	url: (model: string) => string;
	token: () => Promise<string>;
}

async function vertex(): Promise<Vertex> {
	const project = process.env.GOOGLE_CLOUD_PROJECT || (await sh(["gcloud", "config", "get-value", "project"]).catch(() => ""));
	if (!project || project === "(unset)") die("no project: set GOOGLE_CLOUD_PROJECT or `gcloud config set project`");
	const loc = process.env.GOOGLE_CLOUD_LOCATION || "global";
	const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
	let cached: { token: string; at: number } | undefined;
	return {
		// Gemini 3.8 TTS's speech_metadata is a beta feature (v1beta on the Gemini API, v1beta1 on Vertex).
		url: (model) => `https://${host}/${isV38(model) ? "v1beta1" : "v1"}/projects/${project}/locations/${loc}/publishers/google/models/${model}:generateContent`,
		async token() {
			if (cached && Date.now() - cached.at < 30 * 60_000) return cached.token;
			const token = await sh(["gcloud", "auth", "application-default", "print-access-token"]).catch((e) => die(`no Application Default Credentials (${e.message}); run \`gcloud auth application-default login\``));
			cached = { token, at: Date.now() };
			return token;
		},
	};
}

/** One line, spoken: its audio bytes and their type (raw 16-bit PCM with a rate, or WAV). Retries a busy or flaky API with backoff. */
async function speak(vx: Vertex, model: string, job: Utterance): Promise<{ audio: Uint8Array; mime: string }> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(vx.url(model), {
			method: "POST",
			headers: { authorization: `Bearer ${await vx.token()}`, "content-type": "application/json" },
			body: JSON.stringify(requestBody(job.theme, job.line, job.voice, model)),
		});
		if ((res.status === 429 || res.status >= 500) && attempt < 5) {
			await Bun.sleep(1_000 * 2 ** attempt);
			continue;
		}
		if (!res.ok) throw new Error(`Vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
		const body = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
		const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
		if (!part?.inlineData?.data) throw new Error("Vertex answered without audio");
		return { audio: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType ?? "audio/l16;rate=24000" };
	}
}

// --- encoding ------------------------------------------------------------------------------------

/** Speech to Opus in WebM: silence trimmed at both ends, levelled, mono 24 kbit/s. */
const SPEECH_FILTER = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-19:TP=-2:LRA=7";
const OPUS = ["-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", "-f", "webm"];

async function ffmpeg(args: string[], stdin?: Uint8Array): Promise<void> {
	const p = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...args], { stdin: stdin ? "pipe" : "ignore", stdout: "ignore", stderr: "pipe" });
	if (stdin && p.stdin) {
		p.stdin.write(stdin);
		await p.stdin.end();
	}
	const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
	if (code !== 0) throw new Error(`ffmpeg: ${err.trim()}`);
}

export async function durationMs(file: string): Promise<number> {
	const out = await sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
	return Math.round(Number(out) * 1000);
}

/** Raw PCM (`audio/l16;rate=24000`) is described to ffmpeg; anything with a header (WAV) it reads itself. */
function encodeSpeech(audio: Uint8Array, mime: string, out: string): Promise<void> {
	const raw = /l16|pcm/i.test(mime) && !/wav/i.test(mime);
	const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24_000);
	const input = raw ? ["-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0"] : ["-i", "pipe:0"];
	return ffmpeg([...input, "-af", SPEECH_FILTER, ...OPUS, out], audio);
}

/** A placeholder take, made here from code (no network): a hummed tune as long as the line would be. */
function encodeFake(job: Utterance, out: string): Promise<void> {
	const secs = (estimateMs(job.line.text) / 1000).toFixed(2);
	const f = 160 + (hash(job.voice.id) % 120);
	const expr = `0.3*sin(2*PI*(${f}+20*sin(2*PI*0.7*t))*t)*(0.5+0.5*sin(2*PI*4.5*t))*min(1,t*20)*min(1,(${secs}-t)*20)`;
	return ffmpeg(["-f", "lavfi", "-i", `aevalsrc='${expr}':s=24000:d=${secs}`, ...OPUS, out]);
}

// --- commands ------------------------------------------------------------------------------------

function cmdLines(): void {
	for (const theme of themes()) {
		const lines = corpus(theme).filter((l) => has("all") || l.beat);
		console.log(`\n${theme}: ${lines.length} lines (${lines.filter((l) => l.templated).length} babbled)`);
		for (const l of lines) console.log(`  ${l.key}  ${l.beat ? "beat" : "    "}  ${l.templated ? "babble" : "clip  "}  ${l.trigger.padEnd(9)} ${l.role.padEnd(8)} ${l.text}`);
	}
}

async function cmdRecord(): Promise<void> {
	const model = opt("model", DEFAULT_MODEL);
	const takes = Number(opt("takes", "2"));
	const all = has("all");
	const dry = has("dry-run");
	const fake = has("fake");
	if (!dry && !fake && !(TERMS_OK as readonly string[]).includes(model) && !has("terms-checked"))
		die(`${model} isn't in TERMS_OK: read Google's terms for it first (docs/decisions.md), then pass --terms-checked`);
	const work = loadWork();
	let jobs = plan(work, themes(), { takes, all, model: fake ? "fake" : model });
	const limit = Number(opt("limit", "0"));
	if (limit > 0) jobs = jobs.slice(0, limit);
	const est = estimate(jobs.map((j) => ({ prompt: promptOf(j), text: j.line.text, model })));
	console.log(`voice: ${jobs.length} takes to record (${jobs.filter((j) => j.why === "new").length} new, ${jobs.filter((j) => j.why === "changed").length} changed, ${jobs.filter((j) => j.why === "redo").length} redo), ${fake ? "fake" : model}`);
	for (const t of THEME_IDS) {
		const n = jobs.filter((j) => j.theme === t).length;
		if (n) console.log(`  ${t}: ${n}`);
	}
	console.log(`  ${say$(est)}`);
	if (!jobs.length) return;
	if (dry) {
		const j = jobs[0]!;
		console.log(`\nfirst request (POST .../publishers/google/models/${model}:generateContent):`);
		console.log(JSON.stringify(requestBody(j.theme, j.line, j.voice, model), null, 2));
		console.log("\ndry run: nothing recorded, nothing sent");
		return;
	}
	if (!fake && !has("yes")) {
		console.log("\nthis is a paid run: add --yes to record (or --dry-run / --fake)");
		return;
	}
	const vx = fake ? undefined : await vertex();
	let done = 0;
	let failed = 0;
	const queue = [...jobs];
	const worker = async () => {
		for (let job = queue.shift(); job; job = queue.shift()) {
			const rel = `${job.theme}/${job.line.key}-${job.voice.id}.webm`;
			const out = join(WORK, rel);
			mkdirSync(dirname(out), { recursive: true });
			try {
				if (vx) {
					const { audio, mime } = await speak(vx, model, job);
					await encodeSpeech(audio, mime, out);
				} else await encodeFake(job, out);
				const take: WorkTake = { voice: job.voice.id, sig: job.sig, model: vx ? model : "fake", file: rel, ms: await durationMs(out), bytes: statSync(out).size, status: "new", at: new Date().toISOString() };
				const lines = (work.themes[job.theme] ??= {});
				const line = (lines[job.line.key] ??= { text: job.line.text, trigger: job.line.trigger, role: job.line.role, takes: [] });
				line.takes = [...line.takes.filter((t) => t.voice !== take.voice), take];
				saveWork(work);
				done++;
				process.stdout.write(`\r  ${done}/${jobs.length} recorded${failed ? `, ${failed} failed` : ""}`);
			} catch (e) {
				failed++;
				console.error(`\n  ${job.theme} "${job.line.text}" in ${job.voice.id}: ${(e as Error).message}`);
			}
		}
	};
	await Promise.all(Array.from({ length: vx ? 3 : 4 }, worker));
	console.log(`\nvoice: ${done} recorded, ${failed} failed. Next: bun tools/voice.ts listen`);
}

/** Approved takes of lines still in the bank, copied into the app with its manifest. */
export function ship(work: Work): { files: number; bytes: number } {
	const m: VoiceManifest = { version: 1, themes: {} };
	const keep = new Set<string>(["manifest.json"]);
	let bytes = 0;
	for (const theme of THEME_IDS) {
		const lines = work.themes[theme] ?? {};
		const live = new Map(corpus(theme).map((l) => [l.key, l]));
		const auditions = loadAuditions();
		const out: NonNullable<VoiceManifest["themes"][ThemeId]> = { voices: CAST[theme].map((v) => v.id), lines: {}, ...(auditions.pitch[theme] ? { pitch: auditions.pitch[theme] } : {}) };
		for (const [key, l] of Object.entries(lines)) {
			if (!live.has(key)) continue;
			const takes = l.takes.filter((t) => t.status === "approved");
			if (!takes.length) continue;
			out.lines[key] = { text: l.text, takes: takes.map((t) => ({ voice: t.voice, file: t.file, ms: t.ms })) };
			for (const t of takes) {
				const dest = join(SHIP, t.file);
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(join(WORK, t.file), dest);
				keep.add(t.file);
				bytes += t.bytes;
			}
		}
		if (Object.keys(out.lines).length) m.themes[theme] = out;
	}
	mkdirSync(SHIP, { recursive: true });
	// Whatever shipped before and isn't approved now goes.
	const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
	for (const f of walk(SHIP)) if (!keep.has(relative(SHIP, f))) rmSync(f);
	writeFileSync(join(SHIP, "manifest.json"), `${JSON.stringify(m, null, "\t")}\n`);
	return { files: keep.size - 1, bytes };
}

function cmdStatus(): void {
	const work = loadWork();
	for (const theme of THEME_IDS) {
		const lines = Object.values(work.themes[theme] ?? {});
		const takes = lines.flatMap((l) => l.takes);
		const n = (s: Status) => takes.filter((t) => t.status === s).length;
		const kb = takes.filter((t) => t.status === "approved").reduce((s, t) => s + t.bytes, 0) / 1024;
		console.log(`${theme}: ${lines.length} lines, ${takes.length} takes (${n("approved")} approved, ${n("new")} new, ${n("redo")} redo), approved ${kb.toFixed(0)} KB`);
	}
}


// --- auditions -----------------------------------------------------------------------------------
// A few sample lines in every prebuilt voice and delivery (voice-cast.ts), for one theme at a time,
// to pick the cast by ear before the real run. They live in voice-takes/audition/ and never ship.

const AUD_JSON = join(WORK, "audition", "auditions.json");

export type Pick = "keep" | "maybe" | "no";
export interface Auditions {
	/** By file, relative to voice-takes/. `model` is "fake" for a placeholder. */
	takes: Record<string, { theme: ThemeId; model: string; voice: string; delivery: string; n: number; text: string; ms: number }>;
	/** By theme, by "model|Voice|delivery". */
	picks: Partial<Record<ThemeId, Record<string, Pick>>>;
	/** The pitch shift you liked, in semitones, by theme. */
	pitch: Partial<Record<ThemeId, number>>;
	notes: Partial<Record<ThemeId, string>>;
}

export function loadAuditions(): Auditions {
	const a = existsSync(AUD_JSON) ? (JSON.parse(readFileSync(AUD_JSON, "utf8")) as Partial<Auditions>) : {};
	return { takes: a.takes ?? {}, picks: a.picks ?? {}, pitch: a.pitch ?? {}, notes: a.notes ?? {} };
}
export function saveAuditions(a: Auditions): void {
	mkdirSync(dirname(AUD_JSON), { recursive: true });
	writeFileSync(AUD_JSON, `${JSON.stringify(a, null, "\t")}\n`);
}

/** The sample lines: the shortest fixed line of each key beat in the theme's words, the reactions, then mochi-speak. */
export function auditionLines(theme: ThemeId): string[] {
	const lines = corpus(theme).filter((l) => l.beat && !l.templated);
	const beats = VOICED.map((t) => lines.filter((l) => l.trigger === t).sort((a, b) => a.text.length - b.text.length)[0]?.text).filter((t): t is string => !!t);
	return [...beats, ...REACTIONS, ...MOCHI_SPEAK];
}

export interface AuditionJob extends Utterance {
	model: string;
	delivery: string;
	n: number;
	file: string;
}

/** Models auditioned by default: 3.8 only now; `--models` adds 3.1 back for a comparison. */
export const AUDITION_MODELS = ["gemini-3.8-flash-tts"];

/** Every model × voice × delivery × sample line not yet recorded (`fake` stands in for every model). */
export function auditionPlan(a: Auditions, theme: ThemeId, o: { models: readonly string[]; voices: readonly string[]; deliveries: readonly string[]; fake?: boolean }): AuditionJob[] {
	const jobs: AuditionJob[] = [];
	const lines = auditionLines(theme);
	for (const model of o.models)
		for (const voice of o.voices)
			for (const delivery of o.deliveries)
				lines.forEach((text, n) => {
					if (!isV38(model) && text.includes("<")) return;
					const file = `audition/${theme}/${model}/${voice}-${delivery}-${n}.webm`;
					const t = a.takes[file];
					if (t && t.text === text && (t.model === model || (o.fake && t.model === "fake"))) return;
					jobs.push({ theme, model, voice: { id: `${voice}-${delivery}`, voice, style: DELIVERIES[delivery] ?? "" }, line: { text }, delivery, n, file });
				});
	return jobs;
}

async function cmdAudition(): Promise<void> {
	// One theme at a time: the office unless --theme says otherwise.
	const theme: ThemeId = opt("theme", "") ? themes()[0]! : "office";
	const voices = opt("voices", "all") === "all" ? [...PREBUILT] : opt("voices", "").split(",");
	for (const v of voices) if (!(PREBUILT as readonly string[]).includes(v)) die(`no prebuilt voice "${v}"`);
	const deliveries = opt("deliveries", Object.keys(DELIVERIES).join(",")).split(",");
	for (const d of deliveries) if (!(d in DELIVERIES)) die(`no delivery "${d}" (${Object.keys(DELIVERIES).join(", ")})`);
	const models = opt("models", AUDITION_MODELS.join(",")).split(",");
	const fake = has("fake");
	for (const m of models) if (!has("dry-run") && !fake && !(TERMS_OK as readonly string[]).includes(m) && !has("terms-checked")) die(`${m} isn't in TERMS_OK`);
	const a = loadAuditions();
	let jobs = auditionPlan(a, theme, { models, voices, deliveries, fake });
	const limit = Number(opt("limit", "0"));
	if (limit > 0) jobs = jobs.slice(0, limit);
	const lines = auditionLines(theme);
	console.log(`voice: audition for ${theme}: ${models.length} models × ${voices.length} voices × ${deliveries.length} deliveries × ${lines.length} lines; ${jobs.length} to record`);
	for (const [i, t] of lines.entries()) console.log(`  ${i}  ${t}`);
	for (const m of models) {
		const mine = jobs.filter((j) => j.model === m);
		if (mine.length) console.log(`  ${m}: ${mine.length} takes, ${say$(estimate(mine.map((j) => ({ prompt: promptOf(j), text: j.line.text, model: m }))))}`);
	}
	if (!jobs.length) return;
	if (has("dry-run")) {
		for (const m of models) {
			const j = jobs.find((x) => x.model === m);
			if (j) console.log(`\nfirst ${m} request:\n${JSON.stringify(requestBody(j.theme, j.line, j.voice, m), null, 2)}`);
		}
		return console.log("\ndry run: nothing recorded, nothing sent");
	}
	if (!fake && !has("yes")) return console.log("\nthis is a paid run: add --yes to record (or --dry-run / --fake)");
	const vx = fake ? undefined : await vertex();
	let done = 0;
	let failed = 0;
	const queue = [...jobs];
	const worker = async () => {
		for (let job = queue.shift(); job; job = queue.shift()) {
			const out = join(WORK, job.file);
			mkdirSync(dirname(out), { recursive: true });
			try {
				if (vx) {
					const { audio, mime } = await speak(vx, job.model, job);
					await encodeSpeech(audio, mime, out);
				} else await encodeFake(job, out);
				a.takes[job.file] = { theme: job.theme, model: vx ? job.model : "fake", voice: job.voice.voice, delivery: job.delivery, n: job.n, text: job.line.text, ms: await durationMs(out) };
				saveAuditions(a);
				done++;
				process.stdout.write(`\r  ${done}/${jobs.length} recorded${failed ? `, ${failed} failed` : ""}`);
			} catch (e) {
				failed++;
				console.error(`\n  ${job.model} ${job.voice.id} "${job.line.text}": ${(e as Error).message}`);
				// A model that refuses its first request will refuse the rest: stop rather than spend.
				if (done === 0 && failed >= 3) queue.length = 0;
			}
		}
	};
	await Promise.all(Array.from({ length: vx ? 3 : 4 }, worker));
	console.log(`\nvoice: ${done} recorded, ${failed} failed. Next: bun tools/voice.ts listen, then open /audition`);
}

// --- the sound lab -------------------------------------------------------------------------------
// The app with ?voicebase=http://127.0.0.1:4477/lab/ plays your kept audition takes as if they had
// shipped: their full lines, their reactions, and syllable banks cut from their mochi-speak.
// Nothing is copied into the app; design/sound.md says what the lab is for.

/** Which audition line answers which beat in "reactions" mode: a wait asks, done celebrates, waking is surprised. */
const REACTION_OF: Partial<Record<TriggerKind, number>> = { waiting: 3, finished: 4, woken: 5 };

/** Slicing measures pitch in every frame: keep each clip's result while the server runs. */
const slicedCache = new Map<string, ReturnType<typeof sliceGrains>>();
const sliced = (file: string) => {
	let p = slicedCache.get(file);
	if (!p) slicedCache.set(file, (p = sliceGrains(file)));
	return p;
};

/** The lab's manifest from the kept takes (falling back to "maybe" when nothing is kept). */
export async function labManifest(a: Auditions = loadAuditions()): Promise<VoiceManifest> {
	const m: VoiceManifest = { version: 1, themes: {} };
	for (const theme of THEME_IDS) {
		const picks = Object.entries(a.picks[theme] ?? {});
		const want = picks.some(([, v]) => v === "keep") ? "keep" : "maybe";
		const kept = picks.filter(([, v]) => v === want).map(([k]) => k.split("|") as [string, string, string]);
		if (!kept.length) continue;
		const t: ThemeVoices = { voices: [], lines: {}, grains: {}, reactions: {}, ...(a.pitch[theme] ? { pitch: a.pitch[theme] } : {}) };
		for (const [model, voice, delivery] of kept) {
			const id = `${voice}-${delivery}`;
			t.voices.push(id);
			const take = (n: number): (Take & { text: string }) | undefined => {
				const file = `audition/${theme}/${model}/${voice}-${delivery}-${n}.webm`;
				const x = a.takes[file];
				return x ? { voice: id, file, ms: x.ms, text: x.text } : undefined;
			};
			for (let n = 0; n < 3; n++) {
				const x = take(n);
				if (!x) continue;
				const line = (t.lines[lineKey(x.text)] ??= { text: x.text, takes: [] });
				line.takes.push({ voice: x.voice, file: x.file, ms: x.ms });
			}
			for (const [trigger, n] of Object.entries(REACTION_OF)) {
				const x = take(n!);
				if (x) (t.reactions![trigger as TriggerKind] ??= []).push({ voice: x.voice, file: x.file, ms: x.ms });
			}
			const bank: GrainClip[] = [];
			for (const n of [6, 7, 8]) {
				const x = take(n);
				if (x) bank.push({ file: x.file, ...(await sliced(join(WORK, x.file))) });
			}
			if (bank.length) t.grains![id] = bank;
		}
		m.themes[theme] = t;
	}
	return m;
}

/** What you kept, by theme: the start of a new cast. */
function cmdPicks(): void {
	const a = loadAuditions();
	for (const theme of THEME_IDS) {
		const p = Object.entries(a.picks[theme] ?? {});
		if (!p.length && a.pitch[theme] === undefined) continue;
		console.log(`\n${theme}: pitch ${a.pitch[theme] ?? 0} semitones${a.notes[theme] ? `\n  notes: ${a.notes[theme]}` : ""}`);
		for (const want of ["keep", "maybe"] as const) {
			const names = p.filter(([, v]) => v === want).map(([k]) => k.replaceAll("|", " "));
			if (names.length) console.log(`  ${want}: ${names.join(", ")}`);
		}
	}
}

function cmdListen(): void {
	const port = Number(opt("port", "4477"));
	const page = readFileSync(join(import.meta.dir, "voice-listen.html"), "utf8");
	const auditionPage = readFileSync(join(import.meta.dir, "voice-audition.html"), "utf8");
	// The app's own babble, bundled for the audition page, so what you hear there is what the app makes.
	const babbleJs = Bun.build({ entrypoints: [join(import.meta.dir, "voice-babble.ts")], target: "browser" }).then(async (b) => {
		if (!b.success) throw new Error(b.logs.join("\n"));
		return b.outputs[0]!.text();
	});
	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
			// The sound lab: the app fetches these from another port, so they say anyone may.
			if (url.pathname.startsWith("/lab/")) {
				const cors = { "access-control-allow-origin": "*" };
				if (url.pathname === "/lab/voice/manifest.json") return Response.json(await labManifest(), { headers: cors });
				if (url.pathname === "/lab/ambience/sources.json") return Response.json([], { headers: cors });
				const rel = decodeURIComponent(url.pathname.slice("/lab/voice/".length));
				if (!url.pathname.startsWith("/lab/voice/") || rel.includes("..")) return new Response("no", { status: 400, headers: cors });
				const f = Bun.file(join(WORK, rel));
				return (await f.exists()) ? new Response(f, { headers: { ...cors, "content-type": "audio/webm" } }) : new Response("not found", { status: 404, headers: cors });
			}
			if (url.pathname === "/audition") return new Response(auditionPage, { headers: { "content-type": "text/html; charset=utf-8" } });
			if (url.pathname === "/babble.js") return new Response(await babbleJs, { headers: { "content-type": "text/javascript" } });
			if (url.pathname === "/auditions.json") {
				const lines = Object.fromEntries(THEME_IDS.map((t) => [t, auditionLines(t)]));
				return Response.json({ auditions: loadAuditions(), lines, voices: PREBUILT, deliveries: DELIVERIES, models: AUDITION_MODELS });
			}
			if (url.pathname === "/audition/pick" && req.method === "POST") {
				const { theme, key, value, pitch, notes } = (await req.json()) as { theme: ThemeId; key?: string; value?: Pick | null; pitch?: number; notes?: string };
				if (!(THEME_IDS as readonly string[]).includes(theme)) return new Response("bad theme", { status: 400 });
				const a = loadAuditions();
				if (key !== undefined) {
					const picks = (a.picks[theme] ??= {});
					if (value && ["keep", "maybe", "no"].includes(value)) picks[key] = value;
					else delete picks[key];
				}
				if (typeof pitch === "number" && Number.isFinite(pitch)) a.pitch[theme] = Math.max(-6, Math.min(12, pitch));
				if (typeof notes === "string") a.notes[theme] = notes.slice(0, 2000);
				saveAuditions(a);
				return Response.json({ ok: true });
			}
			if (url.pathname === "/takes.json") {
				const work = loadWork();
				const live = Object.fromEntries(THEME_IDS.map((t) => [t, corpus(t).map((l) => l.key)]));
				const cast = Object.fromEntries(THEME_IDS.map((t) => [t, CAST[t].map((v) => ({ id: v.id, voice: v.voice, style: v.style }))]));
				return Response.json({ work, live, cast });
			}
			if (url.pathname.startsWith("/clip/")) {
				const rel = decodeURIComponent(url.pathname.slice(6));
				if (rel.includes("..")) return new Response("no", { status: 400 });
				const f = Bun.file(join(WORK, rel));
				return (await f.exists()) ? new Response(f, { headers: { "content-type": "audio/webm" } }) : new Response("not found", { status: 404 });
			}
			if (url.pathname === "/mark" && req.method === "POST") {
				const { theme, key, voice, status } = (await req.json()) as { theme: ThemeId; key: string; voice: string; status: Status };
				if (!["new", "approved", "redo"].includes(status)) return new Response("bad status", { status: 400 });
				const work = loadWork();
				const take = work.themes[theme]?.[key]?.takes.find((t) => t.voice === voice);
				if (!take) return new Response("no such take", { status: 404 });
				take.status = status;
				saveWork(work);
				return Response.json({ ok: true });
			}
			return new Response("not found", { status: 404 });
		},
	});
	console.log(`voice: takes at http://127.0.0.1:${server.port}/ and auditions at http://127.0.0.1:${server.port}/audition (ctrl-c to stop)`);
}

if (import.meta.main) {
	if (cmd === "lines") cmdLines();
	else if (cmd === "record") await cmdRecord();
	else if (cmd === "listen") cmdListen();
	else if (cmd === "audition") await cmdAudition();
	else if (cmd === "picks") cmdPicks();
	else if (cmd === "status") cmdStatus();
	else if (cmd === "ship") {
		const r = ship(loadWork());
		console.log(`voice: shipped ${r.files} takes, ${(r.bytes / 1024).toFixed(0)} KB, into ${relative(ROOT, SHIP)}/`);
	} else {
		console.log(readFileSync(import.meta.path, "utf8").split("\n").slice(1, 28).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
	}
}
