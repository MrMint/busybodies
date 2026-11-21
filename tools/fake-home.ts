// A synthetic agent home: invented sessions and agents that make tool calls at a steady rate.
// Point the app or the watcher at it to measure or develop against a known, repeatable load.
//   bun tools/fake-home.ts [--dir D] [--sessions 8] [--agents 4] [--busy 0.5] [--rate 5] [--noise 0] [--for 0]
//   BUSYBODIES_AGENT_HOME=D BUSYBODIES_DESKTOP_INDEX= hutch electrobun dev
// --busy is the fraction of sessions marked busy; --rate is tool calls per second across all of
// them; --noise is writes per second to a project with no live session (the watcher should ignore
// them); --for stops after that many seconds (0 runs until Ctrl-C). Every session points at this
// process's pid, so they all "die" together when it exits. The folder is removed on exit.
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { projectSlug } from "../src/watcher/sources";

const { values: o } = parseArgs({
	options: {
		dir: { type: "string" },
		sessions: { type: "string", default: "8" },
		agents: { type: "string", default: "4" },
		busy: { type: "string", default: "0.5" },
		rate: { type: "string", default: "5" },
		noise: { type: "string", default: "0" },
		for: { type: "string", default: "0" },
	},
});

const PROJECTS = ["teapot", "lantern", "greenhouse", "pedal", "pantry", "kettle", "bramble", "quill"];
const ROLES = ["stream-builder", "scout", "reviewer", "verifier", "designer", "Explore", "sweeper"];
const TOOLS = ["Read", "Edit", "Bash", "Grep", "Write", "WebSearch"];
const pick = <T>(l: T[]) => l[Math.floor(Math.random() * l.length)]!;

const home = o.dir ?? (await mkdtemp(join(tmpdir(), "busybodies-fake-home-")));
const nSessions = Number(o.sessions);
const nAgents = Number(o.agents);
const busyCount = Math.round(nSessions * Number(o.busy));
const rate = Number(o.rate);

const COMMANDS = ["bun test", "cargo build", "git status", "ls"];
/** A tool call; a shell command comes with its result, which fails now and then. */
const toolLine = () => {
	const id = `toolu_${Math.random().toString(36).slice(2)}`;
	const name = pick(TOOLS);
	const timestamp = new Date().toISOString();
	const input = name === "Bash" ? { command: pick(COMMANDS) } : {};
	const call = JSON.stringify({ message: { content: [{ type: "tool_use", id, name, input }], usage: { output_tokens: 40 } }, type: "assistant", timestamp });
	if (name !== "Bash") return `${call}\n`;
	const fail = Math.random() < 0.3;
	const result = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: fail ? "Exit code 1\nnope" : "ok", is_error: fail }] }, timestamp });
	return `${call}\n${result}\n`;
};

const logs: string[] = [];
for (let i = 0; i < nSessions; i++) {
	const project = PROJECTS[i % PROJECTS.length]!;
	const cwd = `/Users/you/code/${project}`;
	const id = `fake-session-${i}`;
	const dir = join(home, "projects", projectSlug(cwd));
	await mkdir(join(dir, id, "subagents"), { recursive: true });
	await mkdir(join(home, "sessions"), { recursive: true });
	const busy = i < busyCount;
	await writeFile(
		join(home, "sessions", `${process.pid}-${i}.json`),
		JSON.stringify({
			pid: process.pid,
			sessionId: id,
			cwd,
			startedAt: Date.now() - i * 60_000,
			entrypoint: "cli",
			name: `${project}: invented task ${i + 1}`,
			status: busy ? "busy" : "idle",
			statusUpdatedAt: Date.now(),
		}),
	);
	const transcript = join(dir, `${id}.jsonl`);
	await writeFile(transcript, toolLine());
	if (busy) logs.push(transcript);
	for (let a = 0; a < (busy ? nAgents : 0); a++) {
		const base = join(dir, id, "subagents", `agent-fake${i}x${a}`);
		await writeFile(`${base}.meta.json`, JSON.stringify({ agentType: pick(ROLES), description: `Invented job ${a + 1}`, spawnDepth: 1 }));
		await writeFile(`${base}.jsonl`, toolLine());
		logs.push(`${base}.jsonl`);
	}
}

console.log(`fake agent home: ${home}`);
console.log(`${nSessions} sessions (${busyCount} busy, ${nAgents} agents each), ${rate} tool calls/s`);

const noise = Number(o.noise);
const noiseLog = join(home, "projects", projectSlug("/Users/you/code/attic"), "fake-dead-session.jsonl");
if (noise > 0) await mkdir(join(noiseLog, ".."), { recursive: true });
const noiseTimer = noise > 0 ? setInterval(() => void appendFile(noiseLog, toolLine()), 1000 / noise) : undefined;
const timer = rate > 0 && logs.length > 0 ? setInterval(() => void appendFile(pick(logs), toolLine()), 1000 / rate) : undefined;
const stop = async () => {
	clearInterval(timer);
	clearInterval(noiseTimer);
	if (!o.dir) await rm(home, { recursive: true, force: true });
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (Number(o.for) > 0) setTimeout(stop, Number(o.for) * 1000);
else setInterval(() => {}, 1 << 30);
