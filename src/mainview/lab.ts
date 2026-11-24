// The sound lab (?lab, with ?sound and ?demo): a way to hear the office for ten minutes and decide
// how characters should sound (design/sound.md). A timeline of its own keeps bubbles coming across
// the demo cast (crew chatter every few seconds, a key beat every 20 to 35), each shown and sent
// through the speech player's real turn taking, and a small panel switches the voice mode, the
// murmur and the levels live. With ?voicebase=http://127.0.0.1:4477/lab/ (tools/voice.ts listen)
// the kept audition takes play as if they had shipped. Dev only: nothing here runs without ?lab.
import { corpus } from "../scene/sass/voiced";
import type { TriggerKind } from "../scene/sass/types";
import { bubbleMs, fill } from "../scene/sass/scheduler";
import { VOICE_MODES, type VoiceMode } from "../scene/sass/voiced";
import type { ThemeId } from "../scene/theme/id";
import { hashId, seq } from "./sound";
import type { Speech } from "./speech";
import type { WorkSound } from "./worksound";

export interface LabHost {
	speech: Speech;
	work?: WorkSound;
	theme(): ThemeId;
	/** The characters on the floor now, by key (`s:` for a lead). */
	cast(): string[];
	say(key: string, text: string | undefined): void;
	/** Is sound live (on, visible, not calm, the context running)? */
	live(): boolean;
}

const BEATS: TriggerKind[] = ["waiting", "finished", "woken"];
const LABELS: Record<VoiceMode, string> = { synth: "synth babble", syllables: "syllables", reactions: "+ reactions", lines: "+ full lines" };

export function startLab(host: LabHost): () => void {
	const r = seq(hashId("lab"));
	let beat = 0;
	let running = true;
	const timers: ReturnType<typeof setTimeout>[] = [];
	const later = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));

	const lines = () => corpus(host.theme());
	const pick = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(r() * xs.length)];
	const speak = (who: string, text: string, trigger: TriggerKind) => {
		host.say(who, text);
		later(bubbleMs(text), () => host.say(who, undefined));
		host.speech.heard([{ who, text, kind: "said", trigger }]);
	};
	const vars = { time: "14:32", time2: "14:33", min: 12, n: 3, count: 2, name: "the release" };
	const chatter = () => {
		if (!running) return;
		const who = pick(host.cast());
		const l = pick(lines().filter((x) => !x.beat));
		if (who && l) speak(who, fill(l.text, vars) ?? l.text, l.trigger);
	};
	const keyBeat = () => {
		const trigger = BEATS[beat++ % BEATS.length]!;
		const who = pick(host.cast().filter((k) => k.startsWith("s:")));
		const l = pick(lines().filter((x) => x.trigger === trigger));
		if (who && l) speak(who, fill(l.text, vars) ?? l.text, trigger);
	};
	const loop = (min: number, max: number, f: () => void) => {
		const next = () => later(min + r() * (max - min), () => {
			if (running) f();
			next();
		});
		next();
	};
	loop(3_000, 7_000, chatter);
	loop(20_000, 35_000, keyBeat);

	// The panel.
	const el = document.createElement("div");
	el.setAttribute("data-lab", "");
	el.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:50;width:280px;padding:12px;border-radius:10px;background:rgba(30,26,24,.92);color:#eee6dc;font:12px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)";
	const mix = host.speech.mix;
	el.innerHTML = `
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:13px">Sound lab</b><span data-live></span></div>
		<div data-modes style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">${VOICE_MODES.map((m) => `<button data-mode="${m}" style="font:inherit;padding:4px;border-radius:6px;border:1px solid #555;background:#2a2623;color:inherit;cursor:pointer">${LABELS[m]}</button>`).join("")}</div>
		<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-murmur ${mix.murmur ? "checked" : ""}> murmur bubbles in the zoomed room</label>
		<label style="display:flex;gap:6px;align-items:center">work <input type="range" data-work min="0" max="2" step="0.05" value="1" style="flex:1"></label>
		<label style="display:flex;gap:6px;align-items:center">crowd <input type="range" data-crowd min="0" max="2" step="0.05" value="${mix.crowd}" style="flex:1"></label>
		<label style="display:flex;gap:6px;align-items:center" title="Off: the first cut (each syllable at its own pitch, uneven gaps)"><input type="checkbox" data-smooth ${mix.smooth ? "checked" : ""}> smooth syllables (one tune, joined)</label>
		<label style="display:flex;gap:6px;align-items:center" title="Off: voices straight to the master, no room, no wall"><input type="checkbox" data-shape ${mix.shape ? "checked" : ""}> shape voices (bus, wall)</label>
		<label style="display:flex;gap:6px;align-items:center">room <input type="range" data-room min="0" max="2" step="0.05" value="${mix.room}" style="flex:1"></label>
		<label style="display:flex;gap:6px;align-items:center">front <input type="range" data-front min="0" max="2" step="0.05" value="${mix.front}" style="flex:1"></label>
		<label style="display:flex;gap:6px;align-items:center">murmur <input type="range" data-under min="0" max="3" step="0.05" value="${mix.under}" style="flex:1"></label>
		<label style="display:flex;gap:6px;align-items:center">pitch <input type="range" data-pitch min="-2" max="10" step="0.5" value="" style="flex:1"><span data-pitchv>theme</span></label>
		<div style="display:flex;gap:6px;margin:8px 0"><button data-beat style="font:inherit;flex:1;padding:4px;border-radius:6px;border:1px solid #555;background:#2a2623;color:inherit;cursor:pointer">key beat now</button><button data-pause style="font:inherit;flex:1;padding:4px;border-radius:6px;border:1px solid #555;background:#2a2623;color:inherit;cursor:pointer">pause</button></div>
		<div data-meters style="display:grid;grid-template-columns:52px 1fr 34px;gap:2px 6px;align-items:center;margin-bottom:8px"></div>
		<div data-log style="max-height:120px;overflow:auto;opacity:.8"></div>`;
	document.body.append(el);
	const q = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
	const paint = () => {
		const s = host.speech.state();
		for (const b of el.querySelectorAll<HTMLButtonElement>("[data-mode]")) b.style.background = b.dataset.mode === s.mix.mode ? "#5c4a2e" : "#2a2623";
		q("[data-live]").textContent = host.live() ? "● live" : "○ click here to start sound";
		q("[data-pitchv]").textContent = s.mix.pitch === undefined ? "theme" : `${s.mix.pitch} st`;
		q("[data-log]").innerHTML = [...s.last]
			.reverse()
			.map((x) => `<div>${x.layer === "front" ? "▶" : "·"} ${x.how}: ${x.text.replace(/</g, "&lt;").slice(0, 44)}</div>`)
			.join("");
	};
	el.addEventListener("click", (e) => {
		const b = (e.target as HTMLElement).closest("button");
		if (!b) return;
		if (b.dataset.mode) host.speech.setMix({ mode: b.dataset.mode as VoiceMode });
		if (b.hasAttribute("data-beat")) keyBeat();
		if (b.hasAttribute("data-pause")) {
			running = !running;
			b.textContent = running ? "pause" : "resume";
		}
		paint();
	});
	q<HTMLInputElement>("[data-murmur]").onchange = (e) => host.speech.setMix({ murmur: (e.target as HTMLInputElement).checked });
	q<HTMLInputElement>("[data-work]").oninput = (e) => host.work?.setLevel(Number((e.target as HTMLInputElement).value));
	q<HTMLInputElement>("[data-crowd]").oninput = (e) => host.speech.setMix({ crowd: Number((e.target as HTMLInputElement).value) });
	q<HTMLInputElement>("[data-smooth]").onchange = (e) => host.speech.setMix({ smooth: (e.target as HTMLInputElement).checked });
	q<HTMLInputElement>("[data-shape]").onchange = (e) => host.speech.setMix({ shape: (e.target as HTMLInputElement).checked });
	q<HTMLInputElement>("[data-room]").oninput = (e) => host.speech.setMix({ room: Number((e.target as HTMLInputElement).value) });
	q<HTMLInputElement>("[data-front]").oninput = (e) => host.speech.setMix({ front: Number((e.target as HTMLInputElement).value) });
	q<HTMLInputElement>("[data-under]").oninput = (e) => host.speech.setMix({ under: Number((e.target as HTMLInputElement).value) });
	q<HTMLInputElement>("[data-pitch]").oninput = (e) => {
		host.speech.setMix({ pitch: Number((e.target as HTMLInputElement).value) });
		paint();
	};
	const ticker = setInterval(paint, 1_000);
	// Live levels per layer, so you can see what you're (not) hearing. -60 dBFS is an empty bar.
	const meters = setInterval(() => {
		const m = { work: host.work?.meter(), ...host.speech.meters() };
		q("[data-meters]").innerHTML = Object.entries(m)
			.map(([k, db]) => {
				const w = db === undefined ? 0 : Math.max(0, Math.min(100, ((db + 60) / 50) * 100));
				return `<span>${k}</span><span style="height:6px;background:#3a3430;border-radius:3px;overflow:hidden"><span style="display:block;height:100%;width:${w}%;background:#c9a45c"></span></span><span style="text-align:right">${db ?? "–"}</span>`;
			})
			.join("");
	}, 150);
	paint();
	return () => {
		running = false;
		timers.forEach(clearTimeout);
		clearInterval(ticker);
		clearInterval(meters);
		el.remove();
	};
}
