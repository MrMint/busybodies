#!/usr/bin/env bun
// Replays a recorded fixture through the sass module and prints who said what, when, so the
// voice can be reviewed by reading. Times print in UTC so the dump is the same on every machine.
//
//   bun tools/sass-dump.ts [fixture name or path] [--zoom 2] [--seed 1] [--room <project>] [--tail 30] [--theme bakery]
//
// --zoom is the camera scale (0.4 is the whole office, 2 is zoomed into a room), --room puts the
// camera on one project's room, --tail keeps the clock running for that many minutes after the
// last frame. --theme speaks in that theme's words (office, factory, bakery; src/scene/sass/bank.ts).
import { readFileSync } from "node:fs";
import { parseRecording } from "../src/watcher/replay";
import { type Output, Sass, allSessions, members, utcClock, utcDay, utcHour } from "../src/scene/sass";
import type { Snapshot } from "../src/watcher/model";
import { themeId } from "../src/scene/theme/id";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] !== undefined ? args.splice(i, 2)[1]! : dflt;
};
const zoom = Number(flag("zoom", "2"));
const seed = Number(flag("seed", "1"));
const room = flag("room", "") || undefined;
const tail = Number(flag("tail", "30")) * 60_000;
const theme = themeId(flag("theme", "office"));
const name = args[0] ?? "busy-release";
const path = name.includes("/") || name.endsWith(".ndjson") ? name : new URL(`../fixtures/${name}.ndjson`, import.meta.url).pathname;
const frames = parseRecording(readFileSync(path, "utf8"));
if (!frames.length) {
	console.error(`no frames in ${path}`);
	process.exit(1);
}

const sass = new Sass({ seed, hour: utcHour, clock: utcClock, day: utcDay, theme });
const view = { zoom, room };
const who = new Map<string, string>();
const learn = (s: Snapshot) => {
	for (const sess of allSessions(s)) for (const m of members(sess)) who.set(m.id, `${m.role} · ${sess.title}`);
};
const stamp = (ms: number) => new Date(ms).toISOString().slice(11, 19);
let says = 0;
let signs = 0;
const print = (at: number, out: Output) => {
	for (const b of out.says) {
		says++;
		const verb = b.kind === "thought" ? "thinks" : "says  ";
		console.log(`${stamp(at)}  ${(who.get(b.who) ?? b.who).padEnd(36).slice(0, 36)}  ${verb}  ${b.text}   [${b.trigger}]`);
	}
	for (const s of out.signs) {
		signs++;
		console.log(`${stamp(at)}  ${"sign".padEnd(36)}  ${s.slot.padEnd(6)}  ${s.text.replace(/\n/g, " / ")}`);
	}
};

console.log(`# ${frames.length} frames from ${path.split("/").pop()}, zoom ${zoom}${room ? `, room ${room}` : ""}, seed ${seed}, ${theme}\n`);
const end = frames[frames.length - 1]!.at + tail;
for (let i = 0; i < frames.length; i++) {
	const f = frames[i]!;
	learn(f);
	print(f.at, sass.update(f, f.at, view));
	const until = i + 1 < frames.length ? frames[i + 1]!.at : end;
	// Between frames, run the clock the way the scene would: wake only when there is work.
	for (let t = sass.nextWake(f.at); t !== undefined && t < until; t = sass.nextWake(t)) print(t, sass.tick(t, view));
}
console.log(`\n# ${says} bubbles, ${signs} sign changes`);
