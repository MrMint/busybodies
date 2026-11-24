// Who is in the office, as the director sees them: one spec per lead and crew member, with its
// trait, gait and mood. Split out of direct.ts by job.
import { seats } from "../../world/layout";
import { LEAD_SIZE, crewSize } from "../../world/placement";
import type { Mood } from "../../contract";
import { type Role, roleFor } from "../../rig/data/roles";
import type { Activity, Agent, Commands, RunningTool, Session, Snapshot } from "../../../watcher/model";
import { paceOf } from "../pace";
import { traitOf } from "../traits";
import type { Seen } from "../types";

/** Facts about one character from the snapshot, before the director decides anything. */
export interface Spec {
	key: string;
	kind: "lead" | "crew";
	session: Session;
	agent?: Agent;
	boss?: string;
	role: string;
	rig: Role;
	mood: Mood;
	size: number;
	tint: string;
	/** Where it belongs: at its desk, around it, in the meeting room, or out (finished). */
	place: "desk" | "crew" | "meeting" | "out";
	busy: boolean;
	since: number;
	running?: RunningTool;
	activity?: Activity;
	commands?: Commands;
	seen: Seen;
	task?: string;
}

/** A character's model personality (traits.ts): crew by their own model, leads by the session's. */
export const traitFor = (s: Spec) => traitOf(s.kind === "lead" ? s.session.family : s.agent?.family);

/** How fast a character walks now: its heat pace (pace.ts) times its trait. */
export function gaitBase(s: Spec, now: number) {
	const lastAt = Math.max(s.activity?.at ?? -Infinity, s.agent?.lastWriteAt ?? -Infinity);
	const g = paceOf(s.agent ? s.agent.tools : s.session.tools, Number.isFinite(lastAt) ? lastAt : undefined, now);
	return { ...g, speed: g.speed * traitFor(s).walk };
}

const agentMood = (a: Agent): Mood => (a.status === "running" ? "busy" : a.status === "stalled" ? "stalled" : "done");

export function specs(snap: Snapshot): Spec[] {
	const out: Spec[] = [];
	for (const { session: s } of seats(snap.sessions)) {
		const lead = `s:${s.id}`;
		const failAt = s.commands?.last && s.commands.last.exitCode !== 0 ? s.commands.last.at : undefined;
		out.push({
			key: lead,
			kind: "lead",
			session: s,
			role: "lead",
			rig: "lead",
			mood: s.state === "busy" ? "busy" : "idle",
			size: LEAD_SIZE,
			tint: s.project,
			place: "desk",
			busy: s.state === "busy",
			since: s.stateSince,
			running: s.running,
			activity: s.activity,
			commands: s.commands,
			task: s.title,
			seen: {
				waiting: s.waiting?.since,
				failAt,
				prs: (s.prs ?? []).map((p) => p.number).sort((a, b) => a - b),
				compactAt: s.compactions?.lastAt,
				apiRetryAt: s.apiRetry?.at,
				repeats: s.commands?.repeats,
				hires: s.agents.map((a) => a.id),
			},
		});
		const visit = (list: Agent[], boss: string) => {
			for (const a of list) {
				const key = `a:${s.id}:${a.id}`;
				const mood = agentMood(a);
				out.push({
					key,
					kind: "crew",
					session: s,
					agent: a,
					boss,
					role: a.role,
					rig: roleFor(a.role, a.task),
					mood,
					size: crewSize(a.depth),
					tint: a.role,
					place: a.status === "running" && roleFor(a.role, a.task) === "reviewer" ? "meeting" : mood === "done" ? "out" : "crew",
					busy: a.status === "running",
					since: a.lastWriteAt,
					running: a.running,
					activity: a.activity,
					commands: a.commands,
					task: a.task,
					seen: {
						failAt: a.commands?.last && a.commands.last.exitCode !== 0 ? a.commands.last.at : undefined,
						prs: [],
						repeats: a.commands?.repeats,
						hires: a.children.map((c) => c.id),
					},
				});
				visit(a.children, key);
			}
		};
		visit(s.agents, lead);
	}
	return out;
}
