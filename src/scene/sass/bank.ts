// The voice in each theme: which lines it says and what its counters write on the walls, keyed by
// theme the way `ThemeWords` (theme/words.ts) and `StoryWords` (office/decor-plan.ts) are. The
// office's bank is `LINES`. The factory and the bakery keep the office's lines that fit anywhere
// (everything not marked `office`) and add their own, so "Out of office. In the office." stays in
// the office. A theme without a bank of its own gets the office's.
import type { ThemeId } from "../../themes/ids";
import { BAKERY_LINES } from "./lines-bakery";
import { FACTORY_LINES } from "./lines-factory";
import { type Line, LINES, linesIn } from "./lines";

/** What the counters write (signs.ts). The first three are sign lines in the bank. */
interface CounterWords {
	/** The board's tally since the room's last red test: `{n}` days. */
	daysSince: string;
	/** The board during a fail streak of 3 or more: `{n}`. */
	failStreak: string;
	/** The room's sign once it has a PR today: `{count}`. */
	prTally: string;
	/** The shared sign in the common room once a build has gone green today: `{n}`. */
	greens: string;
}

export interface SassBank {
	theme: ThemeId;
	lines: Line[];
	counters: CounterWords;
}

/** The shared lines in a theme's words, then its own (any the shared lines already say left out). */
const bankOf = (theme: ThemeId, own: Line[]): Line[] => {
	const shared = sharedIn(theme);
	const said = new Set(shared.map((l) => l.text));
	return [...shared, ...own.filter((l) => !said.has(l.text))];
};

/** The shared lines a theme says, in its words: the office-only ones only where it has its own. */
const sharedIn = (theme: ThemeId): Line[] =>
	linesIn(theme)
		.filter((_, i) => theme === "office" || !LINES[i]!.office || LINES[i]!.themed?.[theme])
		.map((l) => (theme !== "office" && l.office ? { ...l, office: undefined } : l));

const OFFICE_SASS: SassBank = {
	theme: "office",
	lines: sharedIn("office"),
	counters: {
		daysSince: "Days since a test broke: {n}",
		failStreak: "Fail streak: {n}. New personal best.",
		prTally: "PRs today: {count}. Humility: 0.",
		greens: "One cup per green build. Today: {n}.",
	},
};

export const FACTORY_SASS: SassBank = {
	theme: "factory",
	lines: bankOf("factory", FACTORY_LINES),
	counters: {
		daysSince: "Days without incident: {n}",
		failStreak: "Rejects this shift: {n}. A record.",
		prTally: "Crates out today: {count}. Modesty: out of stock.",
		greens: "One snack per green build. Today: {n}.",
	},
};

const BAKERY_SASS: SassBank = {
	theme: "bakery",
	lines: bankOf("bakery", BAKERY_LINES),
	counters: {
		daysSince: "Days since a soufflé fell: {n}",
		failStreak: "Burnt batches: {n}. Smoke alarm: hoarse.",
		prTally: "Trays out today: {count}. Humility: crumbs.",
		greens: "One éclair per green build. Today: {n}.",
	},
};

const BANKS: Record<ThemeId, SassBank> = { office: OFFICE_SASS, factory: FACTORY_SASS, bakery: BAKERY_SASS };

/** The voice for a theme (the office's for one without its own). */
export const sassFor = (id: ThemeId | undefined): SassBank => (id && BANKS[id]) || OFFICE_SASS;
