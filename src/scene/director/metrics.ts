// Metrics as things in the office (plan-next stream B): each number the watcher sends becomes the
// state of a thing, in theme-neutral words. The office theme draws them: an in-tray on the lead's
// desk, a brick tower, a skip, filing drawers, a mug pile, a test lamp, a planner on the wall.
// Pure and deterministic: numbers in, thing state out, so every mapping is unit-tested.
//
//   trayFor(context)          -> the in-tray pile: sheets, spill, buried (no window: no pile)
//   towerBricks(added)        -> bricks in the crew's tower: one per ~20 lines, log-ish past 200
//   skipLoad(removed)         -> how full the skip of removed lines is: 0 to 5
//   drawersFor(files)         -> a drawer per ~10 files touched, the full ones bulging
//   mugsFor(session)          -> mugs on the desk, from the session's cost in cups
//   lampFor(members, was)     -> the desk's test lamp, from the last test result seen
//   deskMetrics(...)          -> all of a desk's things, and the planner's notes, for the office
import { cups } from "../sass/detect";
import type { Area, World as Floor } from "../office/world";
import type { Agent, Changes, Context, ModelFamily, Session, Todos } from "../../watcher/model";
import type { Queue } from "./errands";
import { traitOf } from "./traits";
import type { Actor } from "./types";

export const METRICS = {
	/** The in-tray: this many sheets when the context is full. */
	traySheets: 16,
	/** Past this share of the window, sheets slide off the pile and the lead sweats... */
	traySpill: 0.8,
	/** ...and past this one the lead is buried in it. */
	trayBuried: 0.95,
	/** The tower: a brick per this many lines added... */
	linesPerBrick: 20,
	/** ...up to this many lines; past it, this many bricks more each time the lines double. */
	linearLines: 200,
	bricksPerDouble: 6,
	/** The skip of removed lines: its first load is this many lines, and each load after doubles. */
	skipLines: 20,
	skipLoads: 5,
	/** Filing drawers: one per this many files touched, up to this many drawers. */
	filesPerDrawer: 10,
	maxDrawers: 4,
	/** The most mugs a desk piles up (three, two, one). */
	maxMugs: 6,
} as const;

/** How full the context is, 0 to 1; undefined without a window (an unknown model: no pile). */
function contextShare(c: Context | undefined): number | undefined {
	if (!c?.window || c.window <= 0) return undefined;
	return Math.max(0, Math.min(1, c.used / c.window));
}

/** The in-tray on the lead's desk. */
export interface Tray {
	/** Sheets on the pile: at least one while anything is in context. */
	sheets: number;
	/** Sheets slid off the pile onto the desk (0 below 80%). */
	spill: number;
	/** Past 95%: the lead is buried to the eyebrows. */
	buried: boolean;
	/** The lead has taken the pile to the shredder: the tray is empty until it's back. */
	out?: boolean;
	/** The lead is playing `buried`: the rig draws the tray and pile, so the office draws none. */
	rig?: boolean;
}

/** The in-tray for a context: a few sheets to a teetering stack; none without a window. */
export function trayFor(c: Context | undefined): Tray | undefined {
	const share = contextShare(c);
	if (share === undefined) return undefined;
	const sheets = share > 0 ? Math.max(1, Math.round(share * METRICS.traySheets)) : 0;
	const spill = share >= METRICS.traySpill ? 1 + Math.floor(((share - METRICS.traySpill) / (1 - METRICS.traySpill)) * 3) : 0;
	return { sheets, spill: Math.min(3, spill), buried: share >= METRICS.trayBuried };
}

/** Bricks in a crew's tower for the lines added: one per ~20, then log-ish past 200 (a big rewrite
 * doesn't fill the room), capped at `max`. */
export function towerBricks(added: number, max = 30): number {
	if (!(added > 0)) return 0;
	const n = added <= METRICS.linearLines ? Math.floor(added / METRICS.linesPerBrick) : METRICS.linearLines / METRICS.linesPerBrick + Math.floor(METRICS.bricksPerDouble * Math.log2(added / METRICS.linearLines));
	return Math.min(max, n);
}

/** How full the skip is (0 to 5): a load for the first ~20 removed lines, each load after doubling. */
export function skipLoad(removed: number): number {
	if (!(removed > 0)) return 0;
	return Math.min(METRICS.skipLoads, Math.max(1, Math.ceil(Math.log2(removed / METRICS.skipLines + 1))));
}

/** The filing drawers beside the desk. */
export interface Drawers {
	/** Drawers in the cabinet: one per ~10 files, at least one once a file is touched. */
	drawers: number;
	/** How many of them are full: those bulge open. */
	full: number;
}

export function drawersFor(files: number): Drawers | undefined {
	if (!(files > 0)) return undefined;
	const drawers = Math.min(METRICS.maxDrawers, Math.ceil(files / METRICS.filesPerDrawer));
	return { drawers, full: Math.min(drawers, Math.floor(files / METRICS.filesPerDrawer)) };
}

/** Mugs on the desk: a whole cup of coffee (sass/detect.ts `cups`, from cost) is a mug. */
export const mugsFor = (s: Session): number => Math.min(METRICS.maxMugs, Math.floor(cups(s)));

export type Lamp = "green" | "red";

/** The last test result among a session's members: its time and colour, or the last one seen. */
export function lampFor(members: { commands?: Session["commands"] }[], was?: { lamp?: Lamp; at?: number }): { lamp?: Lamp; at?: number } {
	let best: { lamp?: Lamp; at?: number } = { lamp: was?.lamp, at: was?.at };
	for (const m of members) {
		const last = m.commands?.last;
		if (last?.kind !== "test") continue;
		if (best.at === undefined || last.at > best.at) best = { lamp: last.exitCode === 0 ? "green" : "red", at: last.at };
	}
	return best;
}

/** A session's agents, every depth. */
const agentsOf = (list: Agent[]): Agent[] => list.flatMap((a) => [a, ...agentsOf(a.children)]);

/** What the session and its agents have changed, summed; undefined when nobody reported any. */
export function changesOf(s: Session): Changes | undefined {
	const all = [s.changes, ...agentsOf(s.agents).map((a) => a.changes)].filter((c): c is Changes => c !== undefined);
	if (!all.length) return undefined;
	return all.reduce((t, c) => ({ files: t.files + c.files, added: t.added + c.added, removed: t.removed + c.removed }), { files: 0, added: 0, removed: 0 });
}

/** The family word for the desk card: plain text, never a mark ("" for an unknown model). */
const familyWord = (f: ModelFamily | undefined): string => traitOf(f).word;

// --- A desk's things, as the office draws them -------------------------------------------------

export interface DeskProps {
	tray?: Tray;
	/** The model family, as a word for the name card's last line. */
	word?: string;
	drawers?: Drawers;
	/** The skip of removed lines: 0 (none) to 5. */
	skip: number;
	mugs: number;
	lamp?: Lamp;
}

/** What the director remembers per desk between snapshots, besides what it shows. */
interface DeskState extends DeskProps {
	/** Compactions seen: one more is a trip to the shredder. */
	compactions: number;
	/** Todos as last seen: a done one more is a note walked to the planner. */
	todos?: Todos;
	/** When the lamp's test result came in. */
	testAt?: number;
}

/** One session's notes on its room's planner, by column. */
export interface PlannerRow {
	session: string;
	pending: number;
	active: number;
	done: number;
}

/** Your office: who holds which ticket, the next number, and the lowest ticket in the queue. */
export interface Ticket {
	n: number;
	/** The wait it is for (the session's `waiting.since`). */
	since: number;
	/** The first one in rings the bell, once, when it gets to the counter. */
	bell: boolean;
	rang?: number;
}

export interface Metrics {
	/** By session id. */
	desks: Record<string, DeskState>;
	/** By project room's area id. */
	planners: Record<string, PlannerRow[]>;
	/** By lead key. */
	tickets: Record<string, Ticket>;
	/** The next ticket's number. */
	next: number;
	/** NOW SERVING: the lowest ticket held, if anyone is waiting. */
	serving?: number;
}

export const NO_METRICS: Metrics = { desks: {}, planners: {}, tickets: {}, next: 1 };

/** A desk's things this snapshot. `out`: its lead is off at the shredder with the pile. */
function deskState(s: Session, was: DeskState | undefined, out: boolean, rig = false): DeskState {
	const found = trayFor(s.context);
	const tray = found && rig ? { ...found, rig: true } : found;
	const ch = changesOf(s);
	const lamp = lampFor([s, ...agentsOf(s.agents)], was && { lamp: was.lamp, at: was.testAt });
	const word = familyWord(s.family);
	return {
		...(tray ? { tray: out ? { ...tray, out: true } : tray } : {}),
		...(word ? { word } : {}),
		...(ch && drawersFor(ch.files) ? { drawers: drawersFor(ch.files) } : {}),
		skip: skipLoad(ch?.removed ?? 0),
		mugs: mugsFor(s),
		...(lamp.lamp ? { lamp: lamp.lamp } : {}),
		...(lamp.at !== undefined ? { testAt: lamp.at } : {}),
		compactions: s.compactions?.count ?? 0,
		...(s.todos ? { todos: s.todos } : {}),
	};
}

/** Each project room's planner: a row of notes per session with todos, in desk order. A note on
 * its way to the planner (`carried`, by session) isn't up yet: it still shows as active. */
function planners(floor: Floor, sessions: Map<string, Session>, carried: Set<string>): Record<string, PlannerRow[]> {
	const out: Record<string, PlannerRow[]> = {};
	for (const a of floor.areas) {
		if (a.kind !== "project" || !hasPlanner(a)) continue;
		const rows: PlannerRow[] = [];
		for (const d of a.desks) {
			const t = sessions.get(d.id)?.todos;
			if (!t || t.pending + t.active + t.done === 0) continue;
			const moving = carried.has(d.id) && t.done > 0 ? 1 : 0;
			rows.push({ session: d.id, pending: t.pending, active: t.active + moving, done: t.done - moving });
		}
		if (rows.length) out[a.id] = rows;
	}
	return out;
}

const hasPlanner = (a: Area) => a.wall.some((w) => w.kind === "planner");

/** This direction's metrics: every desk's things, the planners, and your office's tickets. */
export function metricsFor(sessions: Map<string, Session>, was: Metrics, actors: Record<string, Actor>, floor: Floor, queue: Queue, now: number): Metrics {
	const desks: Record<string, DeskState> = {};
	const carried = new Set<string>();
	for (const a of Object.values(actors)) if (a.errand?.kind === "sticky" && now < a.errand.until) carried.add(a.errand.session);
	for (const [id, s] of sessions) {
		const lead = actors[`s:${id}`];
		const e = lead?.errand;
		desks[id] = deskState(s, was.desks[id], e?.kind === "shred" && now < e.until, lead?.pose === "buried");
	}
	return { desks, planners: planners(floor, sessions, carried), tickets: queue.tickets, next: queue.next, ...(queue.serving !== undefined ? { serving: queue.serving } : {}) };
}
