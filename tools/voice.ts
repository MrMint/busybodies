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
import { corpus, type VoiceLine, type VoiceManifest, voicesFor } from "../src/scene/sass/voiced";
import { hash } from "../src/scene/sass/types";
import { THEME_IDS, type ThemeId } from "../src/scene/theme/id";
import { CAST, type CastVoice, promptFor } from "./voice-cast";

const ROOT = join(import.meta.dir, "..");
export const WORK = join(ROOT, "voice-takes");
export const SHIP = join(ROOT, "src/mainview/public/voice");
const TAKES = join(WORK, "takes.json");

/**
 * Models whose output we may ship, per the terms read on 2026-11-23 (docs/decisions.md): Gemini 3.1
 * Flash TTS and Gemini 2.5 Flash-Lite TTS are Preview, and the Preview terms' ban on production use
 * and on disclosing output doesn't apply to them on Vertex AI. Read the terms again before adding one.
 */
export const TERMS_OK = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-lite-preview-tts"] as const;
const DEFAULT_MODEL = TERMS_OK[0];

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

/** About 14 characters a second of speech, plus a breath. */
export const estimateMs = (text: string) => Math.round(400 + (text.length / 14) * 1000);

// --- Vertex --------------------------------------------------------------------------------------

/** The generateContent body for one line in one voice (single speaker, audio out). */
export function requestBody(theme: ThemeId, line: { text: string }, v: CastVoice) {
	return {
		contents: [{ role: "user", parts: [{ text: `${promptFor(theme, v)} Say this line, and nothing else: ${line.text}` }] }],
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voice } } },
		},
	};
}

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
		url: (model) => `https://${host}/v1/projects/${project}/locations/${loc}/publishers/google/models/${model}:generateContent`,
		async token() {
			if (cached && Date.now() - cached.at < 30 * 60_000) return cached.token;
			const token = await sh(["gcloud", "auth", "application-default", "print-access-token"]).catch((e) => die(`no Application Default Credentials (${e.message}); run \`gcloud auth application-default login\``));
			cached = { token, at: Date.now() };
			return token;
		},
	};
}

/** One line, spoken: raw 16-bit PCM and its rate. Retries a busy or flaky API with backoff. */
async function speak(vx: Vertex, model: string, job: Job): Promise<{ pcm: Uint8Array; rate: number }> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(vx.url(model), {
			method: "POST",
			headers: { authorization: `Bearer ${await vx.token()}`, "content-type": "application/json" },
			body: JSON.stringify(requestBody(job.theme, job.line, job.voice)),
		});
		if ((res.status === 429 || res.status >= 500) && attempt < 5) {
			await Bun.sleep(1_000 * 2 ** attempt);
			continue;
		}
		if (!res.ok) throw new Error(`Vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
		const body = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
		const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
		if (!part?.inlineData?.data) throw new Error("Vertex answered without audio");
		const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24_000);
		return { pcm: Buffer.from(part.inlineData.data, "base64"), rate };
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

const encodeSpeech = (pcm: Uint8Array, rate: number, out: string) => ffmpeg(["-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0", "-af", SPEECH_FILTER, ...OPUS, out], pcm);

/** A placeholder take, made here from code (no network): a hummed tune as long as the line would be. */
function encodeFake(job: Job, out: string): Promise<void> {
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
	const ms = jobs.reduce((s, j) => s + estimateMs(j.line.text), 0);
	const chars = jobs.reduce((s, j) => s + requestBody(j.theme, j.line, j.voice).contents[0]!.parts[0]!.text.length, 0);
	console.log(`voice: ${jobs.length} takes to record (${jobs.filter((j) => j.why === "new").length} new, ${jobs.filter((j) => j.why === "changed").length} changed, ${jobs.filter((j) => j.why === "redo").length} redo), ${fake ? "fake" : model}`);
	for (const t of THEME_IDS) {
		const n = jobs.filter((j) => j.theme === t).length;
		if (n) console.log(`  ${t}: ${n}`);
	}
	// About 25 audio tokens a second out, and 4 characters a token in.
	console.log(`  about ${(ms / 1000).toFixed(0)} s of speech: ~${Math.round((ms / 1000) * 25)} audio tokens out, ~${Math.round(chars / 4)} text tokens in; ~${Math.round((ms / 1000) * 3.1)} KB as Opus`);
	if (!jobs.length) return;
	if (dry) {
		const j = jobs[0]!;
		console.log(`\nfirst request (POST .../publishers/google/models/${model}:generateContent):`);
		console.log(JSON.stringify(requestBody(j.theme, j.line, j.voice), null, 2));
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
					const { pcm, rate } = await speak(vx, model, job);
					await encodeSpeech(pcm, rate, out);
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
		const out: NonNullable<VoiceManifest["themes"][ThemeId]> = { voices: CAST[theme].map((v) => v.id), lines: {} };
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

function cmdListen(): void {
	const port = Number(opt("port", "4477"));
	const page = readFileSync(join(import.meta.dir, "voice-listen.html"), "utf8");
	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
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
	console.log(`voice: listening page at http://127.0.0.1:${server.port}/ (ctrl-c to stop). Then: bun tools/voice.ts ship`);
}

if (import.meta.main) {
	if (cmd === "lines") cmdLines();
	else if (cmd === "record") await cmdRecord();
	else if (cmd === "listen") cmdListen();
	else if (cmd === "status") cmdStatus();
	else if (cmd === "ship") {
		const r = ship(loadWork());
		console.log(`voice: shipped ${r.files} takes, ${(r.bytes / 1024).toFixed(0)} KB, into ${relative(ROOT, SHIP)}/`);
	} else {
		console.log(readFileSync(import.meta.path, "utf8").split("\n").slice(1, 28).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
	}
}
