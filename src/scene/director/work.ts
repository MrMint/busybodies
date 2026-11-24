// What a busy character is working on, from the tool it is using, and how hard: the director's
// answer to "six builders all hammering in step". Pure, so it is unit-tested with invented agents.
//
//   workKind(running, activity)  -> read | web | search | edit | shell | test | undefined
//   nextWork(was, kind, now)     -> the kind to show, held a few seconds so a burst of tool calls
//                                   doesn't flicker the pose
//   WORK_POSE[role][kind]        -> the pose for it (builders only, for now)
//   tempo(key, lastAt, now)      -> how fast the loop runs: quick while writing, slow when coasting
import { unit } from "../rig/data/player";
import type { Role } from "../rig/data/roles";
import type { Activity, RunningTool } from "../../watcher/model";

export type WorkKind = "read" | "web" | "search" | "edit" | "shell" | "test";

export interface Work {
	kind: WorkKind;
	/** When this kind started showing. */
	since: number;
}

export const WORK = {
	/** A work pose shows at least this long before the next tool can change it. */
	holdMs: 6_000,
	/** Wrote this recently: the quick tempo. */
	hotMs: 15_000,
	/** Wrote longer ago than this: the slow tempo. */
	coldMs: 60_000,
	hot: 1.25,
	warm: 1,
	cold: 0.8,
	/** Each character's own pace, so a crew never settles into step: plus or minus this. */
	jitter: 0.08,
} as const;

const READ = /^(Read|NotebookRead)$/;
const WEB = /^(WebFetch|WebSearch)$/;
const SEARCH = /^(Grep|Glob|LS|ToolSearch)$/;
const EDIT = /^(Edit|MultiEdit|Write|NotebookEdit)$/;
const SHELL = /^(Bash|BashOutput|KillShell|Monitor)$/;

/** True for a tool that changes files: the crew's build grows a piece for each one. */
export const isEdit = (tool: string | undefined): boolean => !!tool && EDIT.test(tool);

/** What the tool in hand says about the work. A running shell command wins over the last call. */
export function workKind(running: RunningTool | undefined, activity: Activity | undefined): WorkKind | undefined {
	if (running?.kind === "test") return "test";
	if (running && (running.kind || SHELL.test(running.tool))) return "shell";
	const tool = running?.tool ?? activity?.tool;
	if (!tool) return undefined;
	if (READ.test(tool)) return "read";
	if (WEB.test(tool)) return "web";
	if (SEARCH.test(tool)) return "search";
	if (EDIT.test(tool)) return "edit";
	if (SHELL.test(tool)) return "shell";
	return undefined;
}

/** The kind to show now: a new kind takes over only once the last has had its time. */
export function nextWork(was: Work | undefined, kind: WorkKind | undefined, now: number): Work | undefined {
	if (!kind) return was;
	if (!was) return { kind, since: now };
	if (was.kind === kind || now - was.since < WORK.holdMs) return was;
	return { kind, since: now };
}

/** The pose for each kind of work, by role. A role or kind missing here keeps the role's own pose. */
export const WORK_POSE: Partial<Record<Role, Partial<Record<WorkKind, string>>>> = {
	builder: { read: "blueprint", web: "blueprint", search: "rummage", edit: "hammer", shell: "tinker", test: "poke" },
};

/** How fast a busy character's loop runs, from when it last did something. */
export function tempo(key: string, lastAt: number | undefined, now: number): number {
	const age = lastAt === undefined ? Infinity : now - lastAt;
	const base = age < WORK.hotMs ? WORK.hot : age < WORK.coldMs ? WORK.warm : WORK.cold;
	const own = 1 - WORK.jitter + unit(key, "tempo") * WORK.jitter * 2;
	return Math.round(base * own * 100) / 100;
}

/** When the tempo next changes on its own (a write ages from hot to warm to cold). */
export function tempoWake(lastAt: number | undefined, now: number): number | undefined {
	if (lastAt === undefined) return undefined;
	return [lastAt + WORK.hotMs, lastAt + WORK.coldMs].find((t) => t > now);
}
