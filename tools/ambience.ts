#!/usr/bin/env bun
// Room loops: a seamless bed of room sound per theme (the office's air and murmur, the factory's
// hall, the bakery's shop), textures that the synth in sound.ts does poorly. The app plays the
// theme's loop under its synthesised tone (mainview/speech.ts) if one shipped; none is required.
//
//   bun tools/ambience.ts add <theme> <recording> --source <url> --licence CC0-1.0 [--author <name>] [--secs 24] [--fade 3] [--start 0]
//   bun tools/ambience.ts lyria <theme> --prompt "<text>" [--model lyria-002] [--dry-run | --yes]
//   bun tools/ambience.ts list
//
// `add` takes a recording you downloaded yourself: CC0 only (Kenney's audio packs, or Freesound with
// the licence filter set to Creative Commons 0), or our own ("own"). It cuts `--secs` from
// `--start`, crossfades the next `--fade` seconds back over the head so the end runs into the start
// without a seam, levels it, and writes Opus in WebM to src/mainview/public/ambience/<theme>.webm,
// with its source and licence in sources.json beside it. Nothing is downloaded here.
//
// `lyria` asks Lyria on Vertex AI for a clip from a prompt (the machine's Application Default
// Credentials, as tools/voice.ts), then loops it the same way; its licence is recorded as
// "generated:<model>". Lyria is a music model, so ask for a texture ("a quiet room tone, no
// melody"), and listen before shipping. Same terms gate as the voices (docs/decisions.md).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { RoomLoop } from "../src/mainview/speech";
import { THEME_IDS, type ThemeId } from "../src/scene/theme/id";
import { audioOfStream, musicBody } from "./music";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "src/mainview/public/ambience");
const SOURCES = join(OUT, "sources.json");

/** Licences a loop may ship under (AGENTS.md: CC0 or our own work). */
export const LICENCES = ["CC0-1.0", "own"] as const;
import { LYRIA_OK } from "./music";

interface Entry extends RoomLoop {
	author?: string;
	secs: number;
	bytes: number;
	made: string;
}

const argv = process.argv.slice(2);
const has = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d: string) => {
	const i = argv.indexOf(`--${n}`);
	return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
function die(msg: string): never {
	console.error(`ambience: ${msg}`);
	process.exit(1);
}
const themeArg = (s: string | undefined): ThemeId => ((THEME_IDS as readonly string[]).includes(s ?? "") ? (s as ThemeId) : die(`name a theme (${THEME_IDS.join(", ")})`));

const load = (): Entry[] => (existsSync(SOURCES) ? (JSON.parse(readFileSync(SOURCES, "utf8")) as Entry[]) : []);
const save = (e: Entry[]) => {
	mkdirSync(OUT, { recursive: true });
	writeFileSync(SOURCES, `${JSON.stringify(e, null, "\t")}\n`);
};

async function run(cmd: string[], stdin?: Uint8Array): Promise<string> {
	const p = Bun.spawn(cmd, { stdin: stdin ? "pipe" : "ignore", stdout: "pipe", stderr: "pipe" });
	if (stdin && p.stdin) {
		p.stdin.write(stdin);
		await p.stdin.end();
	}
	const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
	if (code !== 0) throw new Error(`${cmd[0]}: ${err.trim()}`);
	return out.trim();
}

/**
 * A seamless loop of `secs` from `start`: the `fade` seconds after the cut fade out over the head
 * as it fades in, so the last sample runs into the first. Levelled, mono Opus at 32 kbit/s.
 */
export function loopFilter(start: number, secs: number, fade: number): string {
	const end = start + secs;
	return [
		`[0:a]aformat=channel_layouts=mono,asplit=2[a][b]`,
		`[a]atrim=${start}:${end},asetpts=PTS-STARTPTS,afade=t=in:d=${fade}:curve=qsin[body]`,
		`[b]atrim=${end}:${end + fade},asetpts=PTS-STARTPTS,afade=t=out:d=${fade}:curve=qsin[tail]`,
		`[body][tail]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-30:TP=-6[out]`,
	].join(";");
}

async function makeLoop(theme: ThemeId, input: string, o: { start: number; secs: number; fade: number }): Promise<{ file: string; bytes: number; secs: number }> {
	const length = Number(await run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input]));
	if (!(length >= o.start + o.secs + o.fade)) die(`the recording is ${length.toFixed(1)} s; it needs --start + --secs + --fade (${o.start + o.secs + o.fade} s)`);
	mkdirSync(OUT, { recursive: true });
	const file = `${theme}.webm`;
	const out = join(OUT, file);
	await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", input, "-filter_complex", loopFilter(o.start, o.secs, o.fade), "-map", "[out]", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-f", "webm", out]);
	return { file, bytes: statSync(out).size, secs: o.secs };
}

function record(e: Entry): void {
	const all = load().filter((x) => x.theme !== e.theme);
	save([...all, e].sort((a, b) => THEME_IDS.indexOf(a.theme) - THEME_IDS.indexOf(b.theme)));
	console.log(`ambience: ${e.theme} loop ${e.secs} s, ${(e.bytes / 1024).toFixed(0)} KB, ${e.licence}, from ${e.source} -> ${relative(ROOT, join(OUT, e.file))}`);
}

async function add(): Promise<void> {
	const theme = themeArg(argv[1]);
	const input = argv[2];
	if (!input || !existsSync(input)) die("give a recording to loop");
	const licence = opt("licence", "");
	if (!(LICENCES as readonly string[]).includes(licence)) die(`--licence must be one of ${LICENCES.join(", ")} (AGENTS.md: CC0 or our own work)`);
	const source = opt("source", "");
	if (!source) die("--source: where it came from (a URL, or a note for our own recording)");
	const made = await makeLoop(theme, input, { start: Number(opt("start", "0")), secs: Number(opt("secs", "24")), fade: Number(opt("fade", "3")) });
	record({ theme, ...made, source, licence, author: opt("author", "") || undefined, made: new Date().toISOString().slice(0, 10) });
}

async function lyria(): Promise<void> {
	const theme = themeArg(argv[1]);
	const prompt = opt("prompt", "");
	if (!prompt) die('--prompt: what to make, e.g. "quiet open-plan office room tone, distant murmur, no melody, no drums"');
	const model = opt("model", LYRIA_OK[0]);
	const body = musicBody(model, `${prompt} No melody, no vocals, no drums: a texture.`);
	console.log(`ambience: ${theme} from ${model} (Interactions API, streamed)`);
	console.log(JSON.stringify(body, null, 2));
	if (has("dry-run")) return console.log("dry run: nothing sent");
	if (!(LYRIA_OK as readonly string[]).includes(model) && !has("terms-checked")) die(`${model} isn't in LYRIA_OK: read Google's terms for it first (docs/decisions.md), then pass --terms-checked`);
	if (!has("yes")) return console.log("this is a paid run: add --yes");
	const project = process.env.GOOGLE_CLOUD_PROJECT || (await run(["gcloud", "config", "get-value", "project"]));
	const token = await run(["gcloud", "auth", "application-default", "print-access-token"]);
	const res = await fetch(`https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/interactions`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) die(`Vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const b64 = audioOfStream(await res.text())?.data;
	if (!b64) die("Vertex answered without audio");
	const tmp = join(ROOT, "voice-takes", `lyria-${theme}.audio`);
	mkdirSync(join(ROOT, "voice-takes"), { recursive: true });
	writeFileSync(tmp, Buffer.from(b64, "base64"));
	console.log(`ambience: raw clip kept at ${relative(ROOT, tmp)}; listen to it before shipping`);
	const made = await makeLoop(theme, tmp, { start: Number(opt("start", "2")), secs: Number(opt("secs", "24")), fade: Number(opt("fade", "3")) });
	record({ theme, ...made, source: `${model}: ${prompt}`, licence: `generated:${model}`, made: new Date().toISOString().slice(0, 10) });
}

if (import.meta.main) {
	const cmd = argv[0];
	if (cmd === "add") await add();
	else if (cmd === "lyria") await lyria();
	else if (cmd === "list") for (const e of load()) console.log(`${e.theme}: ${e.file}, ${e.secs} s, ${(e.bytes / 1024).toFixed(0)} KB, ${e.licence}, ${e.source}`);
	else console.log(readFileSync(import.meta.path, "utf8").split("\n").slice(1, 20).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
