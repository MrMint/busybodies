// The office remembers (plan-alive wave 3, "story and continuity"): what the diary and the
// director's story put on the walls. Drawn on the wall layer, over each room's cached layer, and
// redrawn only when what it shows changes (never per frame: nothing here moves).
//
//   framed PRs   a small frame per PR merged in the project this week, hung in the gaps between the
//                back wall's signs, whiteboard and windows (two to a gap)
//   bunting      a pennant per day this week the project was in, strung over the room's planner
//   stars        a gold star on the room's sign per red streak fixed this week (up to three)
//   lobby board  the lobby's frame: "while you were out" when you come back (the director's
//                headlines), the day's ledger at closing (dusk and night), else the theme's own text
//
// Pixi-free (the plan: what each wall shows and in which words), so the unit tests run without
// installing Pixi; decor.ts draws it.
// Colours come from the theme (its slab, lawn and light), so the decor draws in any theme; a theme
// may give its own words and colours in STORY_STYLES, and one without gets the defaults.
import type { ThemeId } from "../theme/id";
import type { Headlines, StoryKind } from "../director/story";
import { type Counts, type Diary, daysSeen, localDay, projectKey, weekOf } from "../../shared/diary";
import { diaryRegular, regularOf } from "../rig/roles";
import type { Phase } from "./daylight";
import type { SignText } from "../theme/words";
import type { SceneTheme } from "../theme/types";
import type { Who } from "./slot";
import type { Area, World } from "./world";

/** A regular is recognised (its name shows on its desk card or task tag) once the diary has seen
 * it come in on this many days. */
export const RECOGNISED_DAYS = 2;

/** The names of the regulars you'd recognise, by character key. */
export function regularNames(cast: Pick<Who, "key" | "regular">[], view: StoryView | undefined): Map<string, string> {
	const out = new Map<string, string>();
	if (!view?.diary) return out;
	const today = (view.day ?? localDay)(view.now);
	for (const w of cast) if (w.regular && daysSeen(view.diary, diaryRegular(w.regular), today) >= RECOGNISED_DAYS) out.set(w.key, regularOf(w.regular).name);
	return out;
}

/** What the office is told: the diary (counts and kinds), the director's headlines, and when. */
export interface StoryView {
	diary?: Diary;
	headlines?: Headlines;
	/** Director time: which day is today. */
	now: number;
	/** The day for a time (default the local day). */
	day?: (ms: number) => string;
}

export const DECOR = {
	/** A framed PR, and the gap between two back-wall items it needs. */
	frame: { w: 20, h: 24, gap: 24 },
	/** Two frames to a gap, this far from the wall's top. */
	rows: [12, 38],
	/** At most this many stars on a sign. */
	stars: 3,
	/** A pennant. */
	pennant: { w: 11, h: 10 },
} as const;

/** A theme's words for the story (a theme without its own gets the office's). */
export interface StoryWords {
	headlines: string;
	ledger: string;
	/** One headline per kind, for a count of it. */
	lines: Record<StoryKind, (n: number) => string>;
	/** The ledger's counts, in order: a kind of the diary and how to say it. */
	ledgerLines: [keyof Counts, (n: number) => string][];
	/** A day with nothing in it. */
	quiet: string;
}

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const OFFICE_STORY: StoryWords = {
	headlines: "WHILE YOU WERE OUT",
	ledger: "TODAY'S LEDGER",
	lines: {
		merged: (n) => `${s(n, "PR")} merged`,
		opened: (n) => `${s(n, "PR")} opened`,
		redeemed: (n) => `${s(n, "red streak")} fixed`,
		sendoff: (n) => `${s(n, "long one")} waved off`,
		finished: (n) => `${s(n, "session")} wrapped up`,
	},
	ledgerLines: [
		["sessions", (n) => s(n, "session")],
		["prsOpened", (n) => s(n, "PR")],
		["prsMerged", (n) => `${n} merged`],
		["testsRed", (n) => `${n} red`],
		["redeemed", (n) => `${n} fixed`],
	],
	quiet: "A quiet one.",
};

export const FACTORY_STORY: StoryWords = {
	headlines: "WHILE YOU WERE OUT",
	ledger: "SHIFT REPORT",
	lines: {
		merged: (n) => `${s(n, "crate")} delivered`,
		opened: (n) => `${s(n, "crate")} shipped`,
		redeemed: (n) => `${s(n, "line")} back in spec`,
		sendoff: (n) => `${s(n, "long shift")} clocked off`,
		finished: (n) => `${s(n, "shift")} ended`,
	},
	ledgerLines: [
		["sessions", (n) => s(n, "shift")],
		["prsOpened", (n) => s(n, "crate")],
		["prsMerged", (n) => `${n} delivered`],
		["testsRed", (n) => `${n} rejects`],
		["redeemed", (n) => `${n} fixed`],
	],
	quiet: "Nothing off the line.",
};

export const BAKERY_STORY: StoryWords = {
	headlines: "WHILE YOU WERE OUT",
	ledger: "TODAY'S BAKE",
	lines: {
		merged: (n) => `${s(n, "order")} picked up`,
		opened: (n) => `${s(n, "batch", "batches")} out of the oven`,
		redeemed: (n) => `${s(n, "sunk cake")} rescued`,
		sendoff: (n) => `${s(n, "long bake")} waved off`,
		finished: (n) => `${s(n, "bench", "benches")} wiped down`,
	},
	ledgerLines: [
		["sessions", (n) => s(n, "batch", "batches")],
		["prsOpened", (n) => s(n, "box", "boxes")],
		["prsMerged", (n) => `${n} picked up`],
		["testsRed", (n) => `${n} burnt`],
		["redeemed", (n) => `${n} rescued`],
	],
	quiet: "The ovens stayed cold.",
};

/** The story's look in a theme: colours picked from the theme, and its words. */
export interface StoryStyle {
	words: StoryWords;
	/** The frames' edge and the stars' outline. */
	ink: number;
	/** A frame's mat. */
	mat: number;
	/** The merge mark in a frame, and the stars. */
	mark: number;
	gold: number;
	/** The pennants, in turn. */
	pennants: number[];
}

const STORY_WORDS: Record<ThemeId, StoryWords> = { office: OFFICE_STORY, factory: FACTORY_STORY, bakery: BAKERY_STORY };

/** The story's look for a theme: its own words if it has them, colours from its paint. */
export function storyStyle(theme: Pick<SceneTheme, "id" | "slab" | "lawn" | "light">): StoryStyle {
	return {
		words: STORY_WORDS[theme.id] ?? OFFICE_STORY,
		ink: theme.slab,
		mat: theme.light.lamp,
		mark: theme.slab,
		gold: theme.light.glow,
		pennants: [theme.light.glow, theme.light.sky.noon[0], theme.lawn, theme.light.sky.dusk[1]],
	};
}

const counted = (counts: Partial<Record<StoryKind, number>>, words: StoryWords) =>
	(["merged", "opened", "redeemed", "sendoff", "finished"] as StoryKind[]).filter((k) => counts[k]).map((k) => words.lines[k](counts[k]!));

/**
 * What the lobby's frame says now, or undefined to leave the theme's own text: "while you were
 * out" while the director's headlines are up; the day's ledger at closing (dusk and night).
 */
export function boardText(view: StoryView | undefined, words: StoryWords, phase: Phase): SignText | undefined {
	if (!view) return undefined;
	const h = view.headlines;
	if (h && view.now >= h.at && view.now < h.until) {
		const lines = counted(h.counts, words);
		if (lines.length) return { title: words.headlines, body: lines.join("\n") };
	}
	if (phase !== "dusk" && phase !== "night") return undefined;
	const today = view.diary?.days[(view.day ?? localDay)(view.now)];
	if (!today) return undefined;
	const parts = words.ledgerLines.filter(([k]) => today.counts[k]).map(([k, say]) => say(today.counts[k]!));
	return { title: words.ledger, body: parts.length ? parts.join(" · ") : words.quiet };
}

/** A project room's decor, as data. */
export interface RoomDecor {
	area: string;
	frames: { x: number; y: number }[];
	/** Pennants over the planner. */
	pennants: { x: number; y: number }[];
	/** Stars on the room's sign. */
	stars: { x: number; y: number }[];
}

/** Where framed PRs can hang on a back wall: two to each gap between the items up there, left to right. */
export function frameSpots(a: Pick<Area, "rect" | "wall">): { x: number; y: number }[] {
	const top = a.rect.y;
	const items = a.wall
		.filter((w) => w.rect.y < top + 64)
		.map((w) => w.rect)
		.sort((p, q) => p.x - q.x);
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i + 1 < items.length; i++) {
		const l = items[i]!.x + items[i]!.w;
		const r = items[i + 1]!.x;
		if (r - l < DECOR.frame.gap) continue;
		const cx = Math.round((l + r) / 2);
		for (const dy of DECOR.rows) out.push({ x: cx - DECOR.frame.w / 2, y: top + dy });
	}
	return out;
}

/** A project room's decor from the diary: this week's merged PRs, days in, red streaks fixed. */
export function decorFor(a: Area, view: StoryView | undefined): RoomDecor | undefined {
	if (a.kind !== "project" || !view?.diary) return undefined;
	const week = weekOf(view.diary, projectKey(a.name), (view.day ?? localDay)(view.now));
	const frames = frameSpots(a).slice(0, week.counts.prsMerged ?? 0);
	const planner = a.wall.find((w) => w.kind === "planner")?.rect;
	const pennants: RoomDecor["pennants"] = [];
	if (planner) {
		const n = Math.min(7, week.days);
		const step = (planner.w - 12) / 7;
		for (let i = 0; i < n; i++) pennants.push({ x: Math.round(planner.x + 6 + i * step + step / 2), y: planner.y - 10 });
	}
	const sign = a.wall.find((w) => w.kind === "sign")?.rect;
	const stars: RoomDecor["stars"] = [];
	if (sign) for (let i = 0; i < Math.min(DECOR.stars, week.counts.redeemed ?? 0); i++) stars.push({ x: sign.x + sign.w - 7 - i * 13, y: sign.y + 1 });
	if (!frames.length && !pennants.length && !stars.length) return undefined;
	return { area: a.id, frames, pennants, stars };
}
