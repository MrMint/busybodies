// The office's diary (plan-alive wave 3, "story and continuity"): what happened, day by day, as
// counts and kinds only. No titles, paths, transcript text or project names in clear: a project is
// keyed by a hash of its name, a regular by that hash and its costume (one of the rig's seven
// roles, never the agent tool's free-text agent type), and the marks that stop a restart counting
// the same thing twice are hashes too. Pure and Pixi-free: the Bun process keeps the real one
// (src/bun/diary.ts saves it next to settings.json), the webview reads it over RPC, and `?demo`
// keeps one in memory from its invented snapshots with the same code.
import { roleFor } from "../scene/rig/roles";
import type { Agent, Session, Snapshot } from "../watcher/model";
import { flatSessions } from "../watcher/model";

/** What the diary counts. */
export const DIARY_KINDS = ["sessions", "hires", "prsOpened", "prsMerged", "testsRed", "redeemed", "finished", "longFinished", "compactions"] as const;
type DiaryKind = (typeof DIARY_KINDS)[number];
export type Counts = Partial<Record<DiaryKind, number>>;

export interface DiaryDay {
	/** The whole office's counts for the day. */
	counts: Counts;
	/** The same, by project key (`projectKey`). */
	projects: Record<string, Counts>;
	/** The regulars in that day: `<project key>:<role>`, sorted. */
	regulars: string[];
	/** Hashes of what was already counted (a session, a PR, a red test...), so a restart or a
	 * re-sent snapshot never counts it twice. */
	marks: string[];
}

export interface Diary {
	v: 1;
	/** By local day, `YYYY-MM-DD`. */
	days: Record<string, DiaryDay>;
}

export const DIARY = {
	/** Days kept: a few weeks. */
	keepDays: 21,
	/** Marks kept per day, at most (the oldest go first). */
	maxMarks: 3000,
	/** A session that ran this long gets a send-off when it ends (director/story.ts too). */
	longMs: 90 * 60_000,
	/** Failed test runs in a row before a green one is a redemption (director/story.ts too). */
	reds: 2,
} as const;

export const emptyDiary = (): Diary => ({ v: 1, days: {} });

/** FNV-1a, 32 bits, as base 36: short, stable, not the name. */
function shortHash(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return (h >>> 0).toString(36);
}

/** A project's key in the diary: a hash of its name, never the name. */
export const projectKey = (project: string): string => `p${shortHash(`project|${project}`)}`;

/** A local calendar day for an epoch-ms time, `YYYY-MM-DD`. */
export function localDay(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** What the diary keeps in memory between snapshots (not saved: a restart starts it again). */
export interface DiaryMemory {
	/** Sessions seen last time: their project key and when they started. */
	sessions: Map<string, { project: string; startedAt: number }>;
	/** Each member's last command seen (by its result's time), and its failed tests in a row. */
	lastCmd: Map<string, number>;
	reds: Map<string, number>;
	/** Compactions seen per session. */
	compactions: Map<string, number>;
}

export const newMemory = (): DiaryMemory => ({ sessions: new Map(), lastCmd: new Map(), reds: new Map(), compactions: new Map() });

export interface NoteOptions {
	/** The day for a time (default the machine's local day). */
	day?: (ms: number) => string;
}

const agentsOf = (l: Agent[]): Agent[] => l.flatMap((a) => [a, ...agentsOf(a.children)]);

/**
 * Read a snapshot into the diary. Returns the same diary object when nothing changed, a new one
 * when something did (so the caller knows when to save and send). `mem` is updated in place.
 */
export function noteSnapshot(diary: Diary, mem: DiaryMemory, snap: Snapshot, opts: NoteOptions = {}): Diary {
	const dayOf = opts.day ?? localDay;
	const now = snap.at;
	const key = dayOf(now);
	let day: DiaryDay | undefined;
	let changed = false;
	const today = (): DiaryDay => {
		if (day) return day;
		const was = diary.days[key];
		day = was ? { counts: { ...was.counts }, projects: { ...was.projects }, regulars: [...was.regulars], marks: [...was.marks] } : { counts: {}, projects: {}, regulars: [], marks: [] };
		return day;
	};
	const marks = new Set(diary.days[key]?.marks ?? []);
	const count = (kind: DiaryKind, project: string, mark?: string, n = 1) => {
		if (mark !== undefined) {
			const m = shortHash(`${kind}|${mark}`);
			if (marks.has(m)) return;
			marks.add(m);
			today().marks.push(m);
		}
		const d = today();
		d.counts[kind] = (d.counts[kind] ?? 0) + n;
		const p = (d.projects[project] = { ...(d.projects[project] ?? {}) });
		p[kind] = (p[kind] ?? 0) + n;
		changed = true;
	};
	const regulars = new Set(diary.days[key]?.regulars ?? []);
	const regular = (project: string, role: string) => {
		const r = `${project}:${role}`;
		if (regulars.has(r)) return;
		regulars.add(r);
		today().regulars.push(r);
		changed = true;
	};

	const sessions = flatSessions(snap.sessions);
	const live = new Map<string, { project: string; startedAt: number }>();
	for (const s of sessions) {
		const p = projectKey(s.project);
		live.set(s.id, { project: p, startedAt: s.startedAt });
		count("sessions", p, `s|${s.id}`);
		regular(p, "lead");
		for (const pr of s.prs ?? []) {
			const id = `${pr.repo ?? ""}#${pr.number}`;
			count("prsOpened", p, `pr|${id}`);
			if (pr.state?.toUpperCase() === "MERGED") count("prsMerged", p, `merged|${id}`);
		}
		const c = s.compactions?.count ?? 0;
		const cWas = mem.compactions.get(s.id);
		if (cWas !== undefined && c > cWas) count("compactions", p, undefined, c - cWas);
		mem.compactions.set(s.id, c);
		const members: { id: string; commands?: Session["commands"] }[] = [{ id: s.id, commands: s.commands }];
		for (const a of agentsOf(s.agents)) {
			count("hires", p, `a|${s.id}|${a.id}`);
			regular(p, roleFor(a.role, a.task));
			members.push({ id: `${s.id}/${a.id}`, commands: a.commands });
		}
		for (const m of members) {
			const last = m.commands?.last;
			if (!last || mem.lastCmd.get(m.id) === last.at) continue;
			const first = !mem.lastCmd.has(m.id);
			mem.lastCmd.set(m.id, last.at);
			if (last.kind !== "test") continue;
			if (last.exitCode !== 0) {
				count("testsRed", p, `red|${m.id}|${last.at}`);
				mem.reds.set(m.id, first ? Math.max(1, m.commands?.failStreak ?? 1) : (mem.reds.get(m.id) ?? 0) + 1);
			} else {
				if (!first && (mem.reds.get(m.id) ?? 0) >= DIARY.reds) count("redeemed", p, `green|${m.id}|${last.at}`);
				mem.reds.set(m.id, 0);
			}
		}
	}
	for (const [id, s] of mem.sessions) {
		if (live.has(id)) continue;
		count("finished", s.project, `fin|${id}`);
		if (now - s.startedAt >= DIARY.longMs) count("longFinished", s.project, `long|${id}`);
		mem.compactions.delete(id);
	}
	mem.sessions = live;
	if (!changed || !day) return diary;
	const d: DiaryDay = day;
	d.regulars.sort();
	if (d.marks.length > DIARY.maxMarks) d.marks = d.marks.slice(-DIARY.maxMarks);
	return prune({ v: 1, days: { ...diary.days, [key]: d } }, key);
}

/** Keep the last `DIARY.keepDays` days, counting back from `today` (`YYYY-MM-DD` sorts as a date). */
export function prune(diary: Diary, today: string): Diary {
	const keys = Object.keys(diary.days).filter((k) => k <= today).sort();
	const keep = keys.slice(-DIARY.keepDays);
	if (keep.length === Object.keys(diary.days).length) return diary;
	return { v: 1, days: Object.fromEntries(keep.map((k) => [k, diary.days[k]!])) };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);
function countsOf(raw: unknown): Counts {
	const out: Counts = {};
	if (!raw || typeof raw !== "object") return out;
	for (const k of DIARY_KINDS) {
		const n = num((raw as Record<string, unknown>)[k]);
		if (n) out[k] = n;
	}
	return out;
}
const strings = (raw: unknown, re: RegExp) => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && re.test(x)) : []);

/** A diary from anything (a parsed file, an RPC message): what doesn't fit the shape is dropped,
 * and anything that isn't a hash or a count can't get in. */
export function diaryOf(raw: unknown): Diary {
	const out = emptyDiary();
	const days = raw && typeof raw === "object" ? (raw as { days?: unknown }).days : undefined;
	if (!days || typeof days !== "object") return out;
	for (const [k, v] of Object.entries(days as Record<string, unknown>)) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== "object") continue;
		const d = v as Record<string, unknown>;
		const projects: Record<string, Counts> = {};
		if (d.projects && typeof d.projects === "object") for (const [p, c] of Object.entries(d.projects as Record<string, unknown>)) if (/^p[0-9a-z]{1,8}$/.test(p)) projects[p] = countsOf(c);
		out.days[k] = { counts: countsOf(d.counts), projects, regulars: strings(d.regulars, /^p[0-9a-z]{1,8}:[a-z]+$/), marks: strings(d.marks, /^[0-9a-z]{1,8}$/) };
	}
	return out;
}

/** The days up to and including `today`, newest first, at most `n`. */
function lastDays(diary: Diary | undefined, today: string, n: number): [string, DiaryDay][] {
	if (!diary) return [];
	return Object.entries(diary.days)
		.filter(([k]) => k <= today)
		.sort(([a], [b]) => (a < b ? 1 : -1))
		.slice(0, n);
}

/** One project's counts over the last week (today and the six days before), and on how many of
 * those days it was in. */
export function weekOf(diary: Diary | undefined, project: string, today: string): { counts: Counts; days: number } {
	const counts: Counts = {};
	let days = 0;
	for (const [, d] of lastDays(diary, today, 7)) {
		const c = d.projects[project];
		if (!c) continue;
		days++;
		for (const k of DIARY_KINDS) if (c[k]) counts[k] = (counts[k] ?? 0) + c[k]!;
	}
	return { counts, days };
}

/** On how many of the last few weeks' days a regular (`<project key>:<role>`) came in. */
export function daysSeen(diary: Diary | undefined, regular: string, today: string): number {
	return lastDays(diary, today, DIARY.keepDays).filter(([, d]) => d.regulars.includes(regular)).length;
}
