// What each theme calls things: the common areas' names and subtitles, the default sign texts, the
// planner's columns, the door plate, and the poses' titles where the theme paints a different thing
// in the hands. Pixi-free, so the layout, the tray, the pose sheet and tests can read it.
// The layout names areas with the office's words (`Area.name` is the area's identity: tools and
// tests aim at "kitchen" or "your office" in any theme); the office's tabs show the theme's.
import type { AreaKind } from "../world/world";
import type { ThemeId } from "../../themes/ids";
import { OFFICE_WORDS } from "../../themes/office/words";
import { FACTORY_WORDS } from "../../themes/factory/words";
import { BAKERY_WORDS } from "../../themes/bakery/words";

export interface SignText {
	title: string;
	body?: string;
}

type CommonKind = Exclude<AreaKind, "project">;

/** A pose as one theme names it, where it differs from the pose's own (rig/data/poses.ts): the poses are
 * shared and the rig paints the theme's things, so only the words change. */
interface PoseWords {
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
