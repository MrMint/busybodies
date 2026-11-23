// What each theme calls things: the common areas' names and subtitles, the default sign texts, the
// planner's columns, the door plate, and the poses' titles where the theme paints a different thing
// in the hands. Pixi-free, so the layout, the tray, the pose sheet and tests can read it.
// The layout names areas with the office's words (`Area.name` is the area's identity: tools and
// tests aim at "kitchen" or "your office" in any theme); the office's tabs show the theme's.
import type { AreaKind } from "../office/world";
import type { ThemeId } from "./id";

export interface SignText {
	title: string;
	body?: string;
}

export type CommonKind = Exclude<AreaKind, "project">;

/** A pose as one theme names it, where it differs from the pose's own (rig/poses.ts): the poses are
 * shared and the rig paints the theme's things, so only the words change. */
export interface PoseWords {
	title?: string;
	/** The lines the sheet lists for it (pose lines with a frame's `say` keep theirs). */
	lines?: readonly string[];
}

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
	/** Pose titles and lines in this theme's words, by pose name; the rest keep the pose's own. */
	poses: Readonly<Record<string, PoseWords>>;
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
	// The builder's work is paperwork here (rig/office.ts): the workshop words go with the workshop.
	poses: {
		hammer: { title: "Stapling until it compiles" },
		thumb: { title: "Stapled the thumb" },
		carry: { title: "Carrying a ream" },
		place: { title: "Setting a ream on the pile" },
		blueprint: { title: "Reading the printout", lines: ["Print twice. Read once."] },
		rummage: { title: "Looking for the tape dispenser" },
		tinker: { title: "Sharpening while it runs", lines: ["Sharper. Sharper. Gone."] },
		exploring: { title: "Exploring with a laser pointer" },
	},
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
	// The stations are machines here (rig/factory.ts): the office's furniture words go with it.
	poses: {
		fileFolder: { title: "Flipping through the parts bin" },
		cardThumb: { title: "Thumbing through the bolt bin" },
		copierFeed: { title: "Feeding the press" },
		copierKick: { title: "Kicking the jammed press" },
		copierFeud: { title: "A running feud with the press" },
		phone: { title: "On the radio" },
		mailDrop: { title: "Dropping the carton on the pallet" },
		shred: { title: "Feeding the crusher" },
		buried: { title: "Buried under the hopper" },
		bellRing: { title: "Ringing the shift bell on your desk" },
		stickyCarry: { title: "Carrying a work tag" },
		stickyPost: { title: "Hanging a work tag on the job board" },
		envelopeCarry: { title: "Carrying the PR crate" },
	},
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
	poses: {},
};

const WORDS: Record<ThemeId, ThemeWords> = { office: OFFICE_WORDS, factory: FACTORY_WORDS, bakery: BAKERY_WORDS };

export const wordsFor = (id: ThemeId): ThemeWords => WORDS[id] ?? OFFICE_WORDS;

/**
 * What a theme calls an area: a project room by its project, a common area by the theme's word for
 * it (the office's tabs, the compact strip's tiles). `Area.name` stays the office's word.
 */
export const areaLabel = (area: { kind: AreaKind; name: string }, words: ThemeWords): string => (area.kind === "project" ? area.name : (words.areas[area.kind] ?? area.name));

/** A pose's title and lines in a theme's words. */
export function poseWords(id: ThemeId, pose: { name: string; title: string; lines: readonly string[] }): { title: string; lines: readonly string[] } {
	const w = wordsFor(id).poses[pose.name];
	return { title: w?.title ?? pose.title, lines: w?.lines ?? pose.lines };
}
