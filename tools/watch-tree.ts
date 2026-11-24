// Prints the live tree of sessions and agents the watcher sees, redrawn on every change.
//   bun tools/watch-tree.ts           live, until Ctrl-C
//   bun tools/watch-tree.ts --once    print one snapshot and exit
//   bun tools/watch-tree.ts --json    print one snapshot as JSON and exit
// Output shows your real session titles: keep it in your terminal, never in the repo.
import type { Agent, Changes, Commands, RunningTool, Session, Snapshot, ToolRate } from "../src/watcher/model";
import { Watcher } from "../src/watcher/watch";

const ago = (now: number, t: number) => {
	const s = Math.max(0, Math.round((now - t) / 1000));
	return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};

const STATE: Record<string, string> = { busy: "🔨", idle: "💤" };
const STATUS: Record<Agent["status"], string> = { running: "🏃", finished: "✅", stopped: "✋", stalled: "🥱" };

const runningText = (now: number, r?: RunningTool) => (r ? ` · ⏳ ${r.tool}${r.kind ? `(${r.kind})` : ""} for ${ago(now, r.since)}` : "");
const commandsText = (c?: Commands) => {
	if (!c?.last) return "";
	const last = c.last.exitCode === 0 ? `✓ ${c.last.kind}` : `✗ ${c.last.kind} exit ${c.last.exitCode}`;
	const streak = c.failStreak > 1 ? ` ×${c.failStreak} in a row` : "";
	const retry = c.repeats > 1 ? ` · retry ${c.repeats}` : "";
	return ` · ${last}${streak}${retry} · ${c.failed} failed (${c.testsFailed} tests)`;
};

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));
const changesText = (c?: Changes) => (c ? `📝 ${c.files} files +${c.added} −${c.removed}` : "");
const toolsText = (t?: ToolRate) =>
	t && (t.calls || t.errors) ? `🔥 ${t.calls} calls${t.errors ? ` ${t.errors} errors` : ""}/${Math.round(t.windowMs / 1000)}s` : "";
/** The counts an agent carries, on its own line. */
const countsText = (a: Pick<Agent, "family" | "changes" | "tools">) =>
	[a.family ? `🧠 ${a.family}` : "", changesText(a.changes), toolsText(a.tools)].filter(Boolean).join("  ");

function signalsLine(now: number, s: Session): string {
	const bits: string[] = [];
	if (s.waiting) bits.push(`🙋 waiting on you (${s.waiting.reason}, ${s.waiting.source}) ${ago(now, s.waiting.since)}`);
	if (s.apiRetry) bits.push(`🔁 API retry ${s.apiRetry.attempt}${s.apiRetry.max ? `/${s.apiRetry.max}` : ""}`);
	if (s.prs?.length) bits.push(`🏆 PRs ${s.prs.map((p) => `#${p.number}${p.state ? ` ${p.state.toLowerCase()}` : ""}`).join(", ")}`);
	if (s.compactions?.count) bits.push(`🗜 compacted ${s.compactions.count}× (last ${ago(now, s.compactions.lastAt ?? now)} ago)`);
	if (s.family) bits.push(`🧠 ${s.family}`);
	if (s.context)
		bits.push(
			`📚 context ${k(s.context.used)}${s.context.window ? ` / ${k(s.context.window)} (${Math.round((100 * s.context.used) / s.context.window)}%)` : ""}`,
		);
	if (s.changes) bits.push(changesText(s.changes));
	if (s.todos)
		bits.push(`🗒 todos ${s.todos.done}/${s.todos.pending + s.todos.active + s.todos.done} done${s.todos.active ? `, ${s.todos.active} active` : ""}`);
	if (toolsText(s.tools)) bits.push(toolsText(s.tools));
	if (s.cost) bits.push(`💸 ${s.cost.usd !== undefined ? `$${s.cost.usd.toFixed(2)} · ` : ""}${(s.cost.outputTokens / 1000).toFixed(1)}k out`);
	return bits.join("  ");
}

function render(snap: Snapshot, w: Watcher): string {
	const out: string[] = [];
	const now = snap.at;
	const agentLines = (agents: Agent[], pad: string) => {
		for (const a of agents) {
			const doing = a.activity ? ` · ${a.activity.tool} ${ago(now, a.activity.at)} ago` : "";
			out.push(
				`${pad}${STATUS[a.status]} ${a.role}: ${a.task}${a.model ? ` (${a.model})` : ""}${doing}${runningText(now, a.running)}${commandsText(a.commands)}`,
			);
			const counts = countsText(a);
			if (counts) out.push(`${pad}     ${counts}`);
			agentLines(a.children, `${pad}   `);
		}
	};
	const sessionLines = (list: Session[], pad: string) => {
		for (const s of list) {
			const where = [s.project, s.worktree, s.branch].filter(Boolean).join(" · ");
			const doing = s.activity ? ` · last ${s.activity.tool} ${ago(now, s.activity.at)} ago` : "";
			out.push(
				`${pad}${STATE[s.state] ?? "❔"} ${s.title}  [${where}]  ${s.state} ${ago(now, s.stateSince)}${doing}${runningText(now, s.running)}${commandsText(s.commands)}`,
			);
			const sig = signalsLine(now, s);
			if (sig) out.push(`${pad}    ${sig}`);
			agentLines(s.agents, `${pad}    `);
			sessionLines(s.children, `${pad}  ↳ `);
		}
	};
	sessionLines(snap.sessions, "");
	const count = (l: Session[]): number => l.reduce((n, s) => n + 1 + count(s.children), 0);
	const cpu = process.cpuUsage();
	out.push(
		"",
		`${count(snap.sessions)} live sessions · rebuilds ${w.stats.rebuilds} · changes ${w.stats.changes} · ` +
			`last build ${w.stats.lastBuildMs.toFixed(1)} ms · cpu ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms total · ` +
			`rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`,
	);
	return out.join("\n");
}

const w = new Watcher();
const first = await w.start();
const mode = process.argv[2];
if (mode === "--once" || mode === "--json") {
	console.log(mode === "--json" ? JSON.stringify(first, null, 2) : render(first, w));
	w.stop();
} else {
	const draw = (s: Snapshot) => process.stdout.write(`\x1b[2J\x1b[H${render(s, w)}\n`);
	draw(first);
	w.onChange(draw);
}
