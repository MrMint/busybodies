// What each theme calls things: the common areas' names and subtitles, the default sign texts, the
// planner's columns and the door plate. Pixi-free, so the layout, the tray and tests can read it.
// The layout names areas with the office's words (`Area.name` is the area's identity: tools and
// tests aim at "kitchen" or "your office" in any theme); the office's tabs show the theme's.
import type { AreaKind } from "../office/world";
import type { ThemeId } from "./id";

export interface SignText {
	title: string;
	body?: string;
}

export type CommonKind = Exclude<AreaKind, "project">;

export interface ThemeWords {
	/** What the tab on each common area says (a project room's tab says the project). */
	areas: Record<Exclude<CommonKind, "vacant">, string> & { vacant: string };
	/** The pill beside each common area's tab. */
	subs: Record<CommonKind, string>;
	/** Default text for the common areas' signs, by sign slot. The sass engine replaces these. */
	signs: Record<string, SignText>;
	/** Your office's sign: the lowest ticket in the queue. */
	serving: (n: number | undefined) => SignText;
	/** The planner's three columns, left to right. */
	columns: readonly [string, string, string];
	/** The plate on your door. */
	door: string;
}

export const OFFICE_WORDS: ThemeWords = {
	areas: { meeting: "meeting room", lobby: "lobby", yours: "your office", kitchen: "kitchen", vacant: "vacant" },
	subs: { meeting: "reviews", lobby: "in and out", yours: "waiting on you", kitchen: "idle, finished and sent home", vacant: "for lease" },
	signs: {
		"meeting:sign": { title: "THIS MEETING", body: "could have been a diff." },
		"kitchen:sign": { title: "1 CUP PER GREEN BUILD", body: "Finished? Close your own session." },
		"lobby:frame": { title: "EMPLOYEE OF THE MONTH", body: "Nobody. Again." },
	},
	serving: (n) => ({ title: "NOW SERVING", body: n === undefined ? "Nobody. Yet." : `No. ${n}` }),
	columns: ["TO DO", "DOING", "DONE"],
	door: "YOU",
};

export const FACTORY_WORDS: ThemeWords = {
	areas: { meeting: "QA booth", lobby: "gatehouse", yours: "foreman's office", kitchen: "break room", vacant: "empty bay" },
	subs: { meeting: "inspections", lobby: "clocking in and out", yours: "waiting on the foreman", kitchen: "idle, finished and clocked off", vacant: "mothballed" },
	signs: {
		"meeting:sign": { title: "QUALITY CONTROL", body: "We control it. Mostly." },
		"kitchen:sign": { title: "1 SNACK PER GREEN BUILD", body: "Finished? Clock yourself out." },
		"lobby:frame": { title: "DAYS WITHOUT INCIDENT", body: "0. Again." },
	},
	serving: (n) => ({ title: "NEXT UP", body: n === undefined ? "Nobody. Yet." : `No. ${n}` }),
	columns: ["QUEUED", "ON LINE", "SHIPPED"],
	door: "FOREMAN",
};

export const BAKERY_WORDS: ThemeWords = {
	areas: { meeting: "tasting table", lobby: "shop front", yours: "pick-up counter", kitchen: "the café", vacant: "closed for icing" },
	subs: { meeting: "tasted before it's boxed", lobby: "in and out the door", yours: "Order up! waiting on you", kitchen: "idle, finished and on a coffee break", vacant: "back soon" },
	signs: {
		"meeting:sign": { title: "NO CRUMB UNTASTED", body: "Every batch. Every time." },
		"kitchen:sign": { title: "1 ÉCLAIR PER GREEN BUILD", body: "Finished? Hang up your apron." },
		"lobby:frame": { title: "TODAY'S SPECIAL", body: "Whatever rises." },
	},
	serving: (n) => ({ title: "ORDER UP!", body: n === undefined ? "Nothing waiting. Yet." : `No. ${n}` }),
	columns: ["ORDERED", "BAKING", "BOXED"],
	door: "BAKER",
};

const WORDS: Record<ThemeId, ThemeWords> = { office: OFFICE_WORDS, factory: FACTORY_WORDS, bakery: BAKERY_WORDS };

export const wordsFor = (id: ThemeId): ThemeWords => WORDS[id] ?? OFFICE_WORDS;

/**
 * What a theme calls an area: a project room by its project, a common area by the theme's word for
 * it (the office's tabs, the compact strip's tiles). `Area.name` stays the office's word.
 */
export const areaLabel = (area: { kind: AreaKind; name: string }, words: ThemeWords): string => (area.kind === "project" ? area.name : (words.areas[area.kind] ?? area.name));
