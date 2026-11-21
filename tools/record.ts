// Records the live snapshot timeline as NDJSON, one anonymized Snapshot per change, for replay with
// ?replay=<name>&speed=8. Every title, path, branch, id, task and repository is replaced with an
// invented name, and times start at a fixed day (src/watcher/anonymize.ts). Raw snapshots are
// never written.
//   bun tools/record.ts --out fixtures/busy-release.ndjson [--for 300] [--max-frames 60] [--drop-idle]
// --drop-idle leaves out idle sessions with no agents, side sessions or prompt, to keep it short.
// Before committing a recording: read every line of it, and run tools/scan-private.sh.
import { appendFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Anonymizer } from "../src/watcher/anonymize";
import type { Session, Snapshot } from "../src/watcher/model";
import { Watcher } from "../src/watcher/watch";

const { values: o } = parseArgs({
	options: {
		out: { type: "string" },
		for: { type: "string", default: "300" },
		"max-frames": { type: "string", default: "60" },
		"drop-idle": { type: "boolean", default: false },
	},
});
if (!o.out) {
	console.error("usage: bun tools/record.ts --out fixtures/<name>.ndjson [--for 300] [--max-frames 60]");
	process.exit(2);
}

const anon = new Anonymizer();
const quiet = (s: Session) => s.state === "idle" && !s.waiting && s.agents.length === 0 && s.children.length === 0;
const trim = (s: Snapshot): Snapshot => (o["drop-idle"] ? { ...s, sessions: s.sessions.filter((x) => !quiet(x)) } : s);
const max = Number(o["max-frames"]);
let frames = 0;
await writeFile(o.out, "");
const w = new Watcher();
const write = async (s: Snapshot) => {
	if (frames >= max) return stop();
	frames++;
	await appendFile(o.out!, `${JSON.stringify(anon.snapshot(trim(s)))}\n`);
	process.stderr.write(`\rframes ${frames}`);
};
const stop = () => {
	w.stop();
	console.error(`\nwrote ${frames} frames to ${o.out}`);
	process.exit(0);
};
w.onChange((s) => void write(s));
await write(await w.start());
setTimeout(stop, Number(o.for) * 1000);
process.on("SIGINT", stop);
