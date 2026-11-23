// A synthetic agent home: invented sessions and agents that make tool calls at a steady rate.
// Point the app or the watcher at it to measure or develop against a known, repeatable load.
//   bun tools/fake-home.ts [--dir D] [--sessions 8] [--agents 4] [--busy 0.5] [--rate 5] [--noise 0] [--churn 0] [--for 0]
//   BUSYBODIES_AGENT_HOME=D BUSYBODIES_DESKTOP_INDEX= hutch electrobun dev
// --busy is the fraction of sessions marked busy; --rate is tool calls per second across all of
// them; --noise is writes per second to a project with no live session (the watcher should ignore
// them); --churn ends the oldest session and starts a new one (new id, new agents) every that many
// seconds, so a soak sees characters come and go; --for stops after that many seconds (0 runs until Ctrl-C). Every session points at this
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
		churn: { type: "string", default: "0" },
		for: { type: "string", default: "0" },
	},
});

const PROJECTS = ["teapot", "lantern", "greenhouse", "pedal", "pantry", "kettle", "bramble", "quill"];
const ROLES = ["stream-builder", "scout", "reviewer", "verifier", "designer", "Explore", "sweeper"];
const TOOLS = ["Read", "Edit", "Bash", "Grep", "Write", "WebSearch", "TodoWrite"];
const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
const FILES = ["src/kettle.ts", "src/spout.ts", "src/lid.ts", "test/kettle.test.ts", "README.md"];
const TODO_STATUSES = ["pending", "in_progress", "completed"];
const pick = <T>(l: T[]) => l[Math.floor(Math.random() * l.length)]!;

const home = o.dir ?? (await mkdtemp(join(tmpdir(), "busybodies-fake-home-")));
const nSessions = Number(o.sessions);
const nAgents = Number(o.agents);
const busyCount = Math.round(nSessions * Number(o.busy));
const rate = Number(o.rate);

const COMMANDS = ["bun test", "cargo build", "git status", "ls"];
const filler = (n: number) => Array.from({ length: n }, (_, i) => `invented line ${i}`).join("\n");
/** What a call asks for: shell commands, edits and writes of invented files, a todo list. */
const inputFor = (name: string): object => {
	switch (name) {
		case "Bash":
			return { command: pick(COMMANDS) };
		case "Edit":
			return { file_path: `/Users/you/code/${pick(FILES)}`, old_string: filler(1 + Math.floor(Math.random() * 4)), new_string: filler(1 + Math.floor(Math.random() * 12)) };
		case "Write":
			return { file_path: `/Users/you/code/${pick(FILES)}`, content: filler(10 + Math.floor(Math.random() * 60)) };
		case "TodoWrite":
			return { todos: Array.from({ length: 3 + Math.floor(Math.random() * 6) }, (_, i) => ({ content: `Invented step ${i + 1}`, status: pick(TODO_STATUSES) })) };
	}
	return {};
};
/** A tool call from one of the models, with the context it sent, and its result; shell commands fail now and then. */
const toolLine = (model = pick(MODELS)) => {
	const id = `toolu_${Math.random().toString(36).slice(2)}`;
	const name = pick(TOOLS);
	const timestamp = new Date().toISOString();
	const usage = { input_tokens: 4, cache_read_input_tokens: 20_000 + Math.floor(Math.random() * 400_000), cache_creation_input_tokens: 900, output_tokens: 40 };
	const call = JSON.stringify({ message: { model, content: [{ type: "tool_use", id, name, input: inputFor(name) }], usage }, type: "assistant", timestamp });
	// Reads, searches and the rest stay open until the next call, so they show as running.
	if (name !== "Bash" && name !== "Edit" && name !== "Write") return `${call}\n`;
	const fail = name === "Bash" && Math.random() < 0.3;
	const result = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: fail ? "Exit code 1\nnope" : "ok", is_error: fail }] }, timestamp });
	return `${call}\n${result}\n`;
};

const logs: string[] = [];
const modelOf = new Map<string, string>();
/** Each live session's registry file and the logs it writes to, oldest first. */
const live: { registry: string; logs: string[] }[] = [];
await mkdir(join(home, "sessions"), { recursive: true });
async function addSession(i: number, busy: boolean): Promise<void> {
	const project = PROJECTS[i % PROJECTS.length]!;
	const cwd = `/Users/you/code/${project}`;
	const id = `fake-session-${i}`;
	const dir = join(home, "projects", projectSlug(cwd));
	await mkdir(join(dir, id, "subagents"), { recursive: true });
	const registry = join(home, "sessions", `${process.pid}-${i}.json`);
	const own: string[] = [];
	const transcript = join(dir, `${id}.jsonl`);
	const model = MODELS[i % MODELS.length]!;
	await writeFile(transcript, toolLine(model));
	modelOf.set(transcript, model);
	if (busy) own.push(transcript);
	for (let a = 0; a < (busy ? nAgents : 0); a++) {
		const base = join(dir, id, "subagents", `agent-fake${i}x${a}`);
		await writeFile(`${base}.meta.json`, JSON.stringify({ agentType: pick(ROLES), description: `Invented job ${a + 1}`, spawnDepth: 1 }));
		await writeFile(`${base}.jsonl`, toolLine(model));
		modelOf.set(`${base}.jsonl`, model);
		own.push(`${base}.jsonl`);
	}
	// The registry last, the way a real session appears: its transcript is there when it is seen.
	await writeFile(
		registry,
		JSON.stringify({
			pid: process.pid,
			sessionId: id,
			cwd,
			startedAt: Date.now() - (i < nSessions ? i * 60_000 : 0),
			entrypoint: "cli",
			name: `${project}: invented task ${i + 1}`,
			status: busy ? "busy" : "idle",
			statusUpdatedAt: Date.now(),
		}),
	);
	logs.push(...own);
	live.push({ registry, logs: own });
}
/** The oldest session ends: its registry file goes, and nothing writes to its logs again. */
async function endSession(): Promise<void> {
	const gone = live.shift();
	if (!gone) return;
	await rm(gone.registry, { force: true });
	for (const l of gone.logs) {
		const at = logs.indexOf(l);
		if (at >= 0) logs.splice(at, 1);
		modelOf.delete(l);
	}
}
for (let i = 0; i < nSessions; i++) await addSession(i, i < busyCount);

console.log(`fake agent home: ${home}`);
console.log(`${nSessions} sessions (${busyCount} busy, ${nAgents} agents each), ${rate} tool calls/s`);

const noise = Number(o.noise);
const noiseLog = join(home, "projects", projectSlug("/Users/you/code/attic"), "fake-dead-session.jsonl");
if (noise > 0) await mkdir(join(noiseLog, ".."), { recursive: true });
const noiseTimer = noise > 0 ? setInterval(() => void appendFile(noiseLog, toolLine()), 1000 / noise) : undefined;
const timer = rate > 0 ? setInterval(() => {
	if (logs.length === 0) return;
	const log = pick(logs);
	void appendFile(log, toolLine(modelOf.get(log)));
}, 1000 / rate) : undefined;
let next = nSessions;
const churn = Number(o.churn);
const churnTimer = churn > 0 ? setInterval(() => {
	// Alternate busy and idle newcomers, so agents are hired and let go too.
	void endSession().then(() => addSession(next, next++ % 2 === 0));
}, churn * 1000) : undefined;
const stop = async () => {
	clearInterval(churnTimer);
	clearInterval(timer);
	clearInterval(noiseTimer);
	if (!o.dir) await rm(home, { recursive: true, force: true });
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (Number(o.for) > 0) setTimeout(stop, Number(o.for) * 1000);
else setInterval(() => {}, 1 << 30);
