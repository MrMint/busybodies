#!/usr/bin/env bun
// A music bed for the office, auditioned with Lyria 3 on Vertex AI (design/sound.md: the synth bed
// didn't work; the voices stay). Each style is asked for twice, calm and busy, in the voices' key and
// one tempo, so the app could cross-fade between them as the office heats up.
//
//   bun tools/music.ts audition [--theme office] [--styles a,b] [--model lyria-3-clip-preview] [--dry-run | --yes]
//   bun tools/voice.ts listen      then open /music to hear them
//
// Clips land in voice-takes/music/<theme>/ (gitignored) as MP3, with music.json. Lyria 3 is in the
// Preview carve-out we checked (docs/decisions.md), and its output carries Google's SynthID watermark.
// Credentials and project as tools/voice.ts: Application Default Credentials, GOOGLE_CLOUD_PROJECT.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { THEME_IDS, type ThemeId } from "../src/scene/theme/id";

const ROOT = join(import.meta.dir, "..");
export const MUSIC = join(ROOT, "voice-takes", "music");
const JSON_PATH = join(MUSIC, "music.json");

/** Lyria models whose output we may ship: both are in the Preview carve-out on Vertex (read 2026-11-23). */
export const LYRIA_OK = ["lyria-3-clip-preview", "lyria-3-pro-preview"] as const;

/** Said in every prompt: what it's for, the key and the tempo, and no voices (the mochis are the voices). */
const COMMON = "Instrumental only, no vocals, no singing. Seamless loopable background music, no intro and no ending. Key of C major, pentatonic melodies. 88 BPM. Warm, soft, cosy and cute, never harsh, nothing that grabs attention.";

const SETTING: Record<ThemeId, string> = {
	office: "For a cartoon office of tiny round paper characters quietly at work.",
	factory: "For a cartoon workshop of tiny round characters in hard hats building things.",
	bakery: "For a cartoon bakery of tiny round pastry cooks at work.",
};

/** The styles to audition: each a calm and a busy version of the same idea. */
export const STYLES: Record<string, { calm: string; busy: string }> = {
	"felt-piano": {
		calm: "Felt piano and soft marimba over a warm pad. Very sparse, slow, low intensity, lots of space, no drums.",
		busy: "Felt piano and marimba with a light shaker and soft brushed percussion, a bouncy bassline, kalimba arpeggios. Medium energy, busy but relaxed.",
	},
	"music-box": {
		calm: "Kalimba and glockenspiel, like a gentle music box, a soft pad underneath. Sparse and twinkly, low intensity, no drums.",
		busy: "Kalimba, glockenspiel and pizzicato strings in quick interlocking patterns, soft woodblock and shaker. Medium-high energy, playful and busy.",
	},
	"chamber": {
		calm: "Small chamber ensemble: pizzicato strings, clarinet and flute, gentle and light, slow, low intensity.",
		busy: "Small chamber ensemble: bouncy pizzicato strings, staccato woodwinds, a light bassoon line and soft snare brushes. Bustling, cheerful, medium-high energy, like busy little workers.",
	},
	"lofi": {
		calm: "Lo-fi chillhop: dusty soft keys, warm bass, very soft kick, mellow and slow, low intensity, faint vinyl texture.",
		busy: "Lo-fi chillhop with a steadier head-nodding beat, soft keys, a walking bass and little marimba fills. Medium energy, focused, steady.",
	},
	"ambient": {
		calm: "Ambient: soft evolving pads and distant felt piano notes, almost still, very low intensity, no drums.",
		busy: "Ambient with a pulse: soft pads, a gentle arpeggiated synth in eighth notes, light ticking percussion and a soft bass. Medium energy, flowing and steady.",
	},
};

export interface MusicClip {
	theme: ThemeId;
	style: string;
	mood: "calm" | "busy";
	model: string;
	prompt: string;
	/** Lyria's own description of what it made. */
	caption?: string;
	file: string;
	ms: number;
	bytes: number;
}
export interface MusicBook {
	clips: Record<string, MusicClip>;
	picks: Record<string, "keep" | "maybe" | "no">;
	notes: string;
}

export function loadMusic(): MusicBook {
	const m = existsSync(JSON_PATH) ? (JSON.parse(readFileSync(JSON_PATH, "utf8")) as Partial<MusicBook>) : {};
	return { clips: m.clips ?? {}, picks: m.picks ?? {}, notes: m.notes ?? "" };
}
export function saveMusic(m: MusicBook): void {
	mkdirSync(MUSIC, { recursive: true });
	writeFileSync(JSON_PATH, `${JSON.stringify(m, null, "\t")}\n`);
}

export const promptOf = (theme: ThemeId, style: string, mood: "calm" | "busy") => `${SETTING[theme]} ${STYLES[style]![mood]} ${COMMON}`;

/**
 * The Interactions API body for one clip (Lyria 3: a text prompt in, MP3 out). Found by trying,
 * 2026-11-23: Lyria 3 answers only stateless interactions (`store: false`), and on Vertex its audio
 * comes only in a stream; a plain request completes with no output at all.
 */
export const musicBody = (model: string, prompt: string) => ({ model, store: false, stream: true, input: [{ type: "user_input", content: [{ type: "text", text: prompt }] }] });

/** The audio and the caption in a streamed answer (server-sent events of `content.delta`s). */
export function audioOfStream(sse: string): { data: string; mime: string; caption: string } | undefined {
	let data = "";
	let mime = "audio/mpeg";
	let caption = "";
	for (const line of sse.split("\n")) {
		if (!line.startsWith("data:")) continue;
		const s = line.slice(5).trim();
		if (s === "[DONE]") break;
		try {
			const e = JSON.parse(s) as { event_type?: string; delta?: { type?: string; data?: string; text?: string; mime_type?: string } };
			if (e.event_type !== "content.delta") continue;
			if (e.delta?.type === "audio" && e.delta.data) {
				data += e.delta.data;
				mime = e.delta.mime_type ?? mime;
			} else if (e.delta?.type === "text" && e.delta.text) caption += e.delta.text;
		} catch {
			// A keep-alive or a torn line.
		}
	}
	return data ? { data, mime, caption: caption.trim() } : undefined;
}

async function sh(cmd: string[]): Promise<string> {
	const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
	if (code !== 0) throw new Error(`${cmd[0]}: ${err.trim().split("\n").at(-1)}`);
	return out.trim();
}

function die(msg: string): never {
	console.error(`music: ${msg}`);
	process.exit(1);
}

async function audition(argv: string[]): Promise<void> {
	const opt = (n: string, d: string) => {
		const i = argv.indexOf(`--${n}`);
		return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : d;
	};
	const has = (n: string) => argv.includes(`--${n}`);
	const theme = opt("theme", "office") as ThemeId;
	if (!THEME_IDS.includes(theme)) die(`no theme "${theme}"`);
	const styles = opt("styles", Object.keys(STYLES).join(",")).split(",");
	for (const s of styles) if (!STYLES[s]) die(`no style "${s}" (${Object.keys(STYLES).join(", ")})`);
	const model = opt("model", LYRIA_OK[0]);
	if (!(LYRIA_OK as readonly string[]).includes(model)) die(`${model} isn't in LYRIA_OK`);
	const book = loadMusic();
	const jobs = styles.flatMap((style) => (["calm", "busy"] as const).map((mood) => ({ style, mood, file: `music/${theme}/${style}-${mood}.mp3`, prompt: promptOf(theme, style, mood) })))
		.filter((j) => !(book.clips[j.file]?.model === model && book.clips[j.file]?.prompt === j.prompt));
	const limit = Number(opt("limit", "0"));
	const todo = limit > 0 ? jobs.slice(0, limit) : jobs;
	console.log(`music: ${theme}, ${todo.length} clips with ${model} (about $${(todo.length * 0.04).toFixed(2)} at $0.04 a clip)`);
	for (const j of todo) console.log(`  ${j.style} ${j.mood}`);
	if (!todo.length) return;
	if (has("dry-run")) return console.log(`\nfirst request:\n${JSON.stringify(musicBody(model, todo[0]!.prompt), null, 2)}\n\ndry run: nothing sent`);
	if (!has("yes")) return console.log("\nthis is a paid run: add --yes");
	const project = process.env.GOOGLE_CLOUD_PROJECT || (await sh(["gcloud", "config", "get-value", "project"]));
	const token = await sh(["gcloud", "auth", "application-default", "print-access-token"]);
	const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/interactions`;
	let failed = 0;
	for (const j of todo) {
		// The quota is 10 a minute: one at a time, with retries on a busy answer.
		for (let attempt = 0; ; attempt++) {
			const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(musicBody(model, j.prompt)) });
			if ((res.status === 429 || res.status >= 500) && attempt < 4) {
				await Bun.sleep(8_000 * (attempt + 1));
				continue;
			}
			if (!res.ok) {
				failed++;
				console.error(`  ${j.style} ${j.mood}: Vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
				if (failed >= 2 && Object.keys(book.clips).length === 0) die("stopping: the first requests failed");
				break;
			}
			const audio = audioOfStream(await res.text());
			if (!audio) {
				failed++;
				console.error(`  ${j.style} ${j.mood}: no audio in the answer`);
				break;
			}
			const out = join(ROOT, "voice-takes", j.file);
			mkdirSync(dirname(out), { recursive: true });
			writeFileSync(out, Buffer.from(audio.data, "base64"));
			const secs = Number(await sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]));
			book.clips[j.file] = { theme, style: j.style, mood: j.mood, model, prompt: j.prompt, caption: audio.caption.slice(0, 500), file: j.file, ms: Math.round(secs * 1000), bytes: statSync(out).size };
			saveMusic(book);
			console.log(`  ${j.style} ${j.mood}: ${secs.toFixed(1)} s`);
			break;
		}
	}
	console.log(`music: ${todo.length - failed} recorded, ${failed} failed. Next: bun tools/voice.ts listen, then open /music`);
}

if (import.meta.main) {
	const [cmd, ...rest] = process.argv.slice(2);
	if (cmd === "audition") await audition(rest);
	else console.log(readFileSync(import.meta.path, "utf8").split("\n").slice(1, 12).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
