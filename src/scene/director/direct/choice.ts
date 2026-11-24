import { choosePose } from "../../rig/data/player";
import { habitAt } from "../habits";
import type { Seen } from "../types";
import { WORK_POSE, type Work } from "../work";
import { MIN } from "../../../shared/time";
import type { Spec } from "./specs";
import { RULES } from "../direct";

// --- Poses -----------------------------------------------------------------------------------------

export interface Choice {
	pose: string;
	as: "lead" | "partner";
	acted: boolean;
	/** For a rare roll and the events: which trigger this was. */
	trigger?: string;
	/** When it started, for a pose timed by something else (a hand-off, the outbox): it doesn't
	 * restart while it plays. */
	since?: number;
}

/** The standing pose for a character's mood and running state, when nothing acted is playing. */
export function standing(s: Spec, now: number, count: Record<string, number>, work?: Work, life = false, habits?: readonly string[]): Choice {
	if (s.mood === "stalled") return { pose: "stalled", as: "lead", acted: false };
	if (s.mood === "done") return { pose: "done", as: "lead", acted: false };
	if (s.seen.waiting !== undefined)
		return { pose: choosePose("waiting", s.key, s.rig, count.waiting ?? 0).name, as: "lead", acted: false, trigger: "waiting" };
	if (s.busy) {
		const run = s.running;
		const ranMin = run ? (now - run.since) / MIN : 0;
		if (run?.kind && ranMin >= RULES.longBuildMin) return { pose: "grumpy", as: "lead", acted: false };
		if ((s.commands?.repeats ?? 1) >= RULES.retries) return { pose: "grumpy", as: "lead", acted: false };
		if (s.seen.apiRetryAt !== undefined && now - s.seen.apiRetryAt < RULES.apiRetryMin * MIN) return { pose: "grumpy", as: "lead", acted: false };
		if (run && !run.kind && ranMin >= RULES.thinkingMin) return { pose: "thinking", as: "lead", acted: false };
		const byTool = s.kind === "crew" && work ? WORK_POSE[s.rig]?.[work.kind] : undefined;
		return { pose: byTool ?? choosePose("busy", s.key, s.rig).name, as: "lead", acted: false };
	}
	// Idle: one of the seven habits, from the id (habits.ts): with life on, rotating every minute or
	// two and played again every half minute or so; calm, moving on every ten minutes.
	const h = habitAt(s.key, s.since, now, life, habits);
	return { pose: h.pose, as: "lead", acted: false, ...(h.since !== undefined ? { since: h.since } : {}) };
}

/** A new signal since last time, worth an acted pose. */
export function acted(s: Spec, was: Seen | undefined, now: number): Choice | undefined {
	const fresh = (at: number | undefined, before: number | undefined) =>
		at !== undefined && at !== before && (was !== undefined || now - at <= RULES.recentMs);
	const newPr = s.seen.prs.some((n) => !(was?.prs ?? []).includes(n)) && was !== undefined;
	if (newPr) return { pose: "prOpened", as: "lead", acted: true, trigger: "pr" };
	// A builder mid-swing hits its thumb instead.
	if (fresh(s.seen.failAt, was?.failAt))
		return { pose: s.rig === "builder" && s.kind === "crew" ? "thumb" : "testFailed", as: "lead", acted: true, trigger: "fail" };
	if (fresh(s.seen.compactAt, was?.compactAt)) return { pose: "stretch", as: "lead", acted: true, trigger: "compact" };
	return undefined;
}
