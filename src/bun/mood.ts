// The office's overall mood, for the tray icon: someone waiting on you beats busy, and busy beats
// all idle. Pure, so it is unit-tested with invented snapshots.
import type { Agent, Session, Snapshot } from "../watcher/model";

export type Mood = "waiting" | "busy" | "idle";

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);
const anyRunning = (list: Agent[]): boolean => list.some((a) => a.status === "running" || anyRunning(a.children));

export function moodOf(snapshot: Snapshot | undefined | null): Mood {
	const sessions = flat(snapshot?.sessions ?? []);
	if (sessions.some((s) => s.waiting)) return "waiting";
	if (sessions.some((s) => s.state === "busy" || anyRunning(s.agents))) return "busy";
	return "idle";
}

/** A one-line summary for the tray menu's first (disabled) item. */
export function summaryOf(snapshot: Snapshot | undefined | null): string {
	const sessions = flat(snapshot?.sessions ?? []);
	if (sessions.length === 0) return "Nobody's in";
	const waiting = sessions.filter((s) => s.waiting).length;
	const busy = sessions.filter((s) => s.state === "busy").length;
	const parts = [`${sessions.length} session${sessions.length === 1 ? "" : "s"}`];
	if (busy) parts.push(`${busy} busy`);
	if (waiting) parts.push(`${waiting} waiting on you`);
	return parts.join(" · ");
}
