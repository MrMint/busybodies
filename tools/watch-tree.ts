// Prints the live tree of sessions and agents the watcher sees, redrawn on every change.
//   bun tools/watch-tree.ts           live, until Ctrl-C
//   bun tools/watch-tree.ts --once    print one snapshot and exit
//   bun tools/watch-tree.ts --json    print one snapshot as JSON and exit
// Output shows your real session titles: keep it in your terminal, never in the repo.
import type { Agent, Session, Snapshot } from "../src/watcher/model";
import { Watcher } from "../src/watcher/watch";

const ago = (now: number, t: number) => {
	const s = Math.max(0, Math.round((now - t) / 1000));
	return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};

const STATE: Record<string, string> = { busy: "🔨", idle: "💤" };
const STATUS: Record<Agent["status"], string> = { running: "🏃", finished: "✅", stopped: "✋", stalled: "🥱" };

function render(snap: Snapshot, w: Watcher): string {
	const out: string[] = [];
	const now = snap.at;
	const agentLines = (agents: Agent[], pad: string) => {
		for (const a of agents) {
			const doing = a.activity ? ` · ${a.activity.tool} ${ago(now, a.activity.at)} ago` : "";
			out.push(`${pad}${STATUS[a.status]} ${a.role}: ${a.task}${a.model ? ` (${a.model})` : ""}${doing}`);
			agentLines(a.children, `${pad}   `);
		}
	};
	const sessionLines = (list: Session[], pad: string) => {
		for (const s of list) {
			const where = [s.project, s.worktree, s.branch].filter(Boolean).join(" · ");
			const doing = s.activity ? ` · last ${s.activity.tool} ${ago(now, s.activity.at)} ago` : "";
			out.push(`${pad}${STATE[s.state] ?? "❔"} ${s.title}  [${where}]  ${s.state} ${ago(now, s.stateSince)}${doing}`);
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
