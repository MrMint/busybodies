// Model ids to the two things that leave the watcher: a family name and a context window. The
// full id stays here. The window isn't in the transcript, so it comes from this table; a wrong row
// makes a wrong meter, so an id we can't place gets no window (and the scene shows no meter).
// Update the table when a model ships with a different window.
import type { ModelFamily } from "./model";

const K = 1000;
const M = 1000 * K;

/**
 * Windows by family, from the first version that has them. Rows are checked in order; the first
 * whose `from` is at or below the model's version wins. Sources: the vendor's model table (cached
 * 2026-11-03): every current fable, opus 4.6+, sonnet 4.6+ and haiku 5+ model has 1M; earlier
 * ones have 200K.
 */
const WINDOWS: Record<Exclude<ModelFamily, "other">, { from: number; window: number }[]> = {
	fable: [{ from: 0, window: 1 * M }],
	opus: [
		{ from: 4.6, window: 1 * M },
		{ from: 0, window: 200 * K },
	],
	sonnet: [
		{ from: 4.6, window: 1 * M },
		{ from: 0, window: 200 * K },
	],
	haiku: [
		{ from: 5, window: 1 * M },
		{ from: 0, window: 200 * K },
	],
};

/** `claude-opus-5-5`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5[1m]`: family, major, minor. */
const CURRENT = /^claude-(fable|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2})(?=$|[-[@]))?/;
/** The older order: `claude-3-5-sonnet-20241022`. */
const LEGACY = /^claude-(\d)(?:-(\d))?-(opus|sonnet|haiku)\b/;
/** The tool's long-context marker, on ids like `claude-sonnet-4-5[1m]`. */
const ONE_M = /\[1m\]/i;

/** The family, as plain text. Undefined for no id, or a placeholder like `<synthetic>`. */
export function modelFamily(id: string | undefined): ModelFamily | undefined {
	if (typeof id !== "string" || !id || id.startsWith("<") || id === "inherit") return undefined;
	const m = /\b(fable|opus|sonnet|haiku)\b/i.exec(id.replace(/[-_.[\]@/:]/g, " "));
	return m ? (m[1]!.toLowerCase() as ModelFamily) : "other";
}

/** Tokens the model's context holds, or undefined when the id can't be placed in the table. */
export function contextWindow(id: string | undefined): number | undefined {
	if (typeof id !== "string") return undefined;
	const bare = id.replace(/^(us|eu|apac|global)\./, "").replace(/^anthropic\./, "");
	let family: keyof typeof WINDOWS | undefined;
	let version = 0;
	const c = CURRENT.exec(bare);
	const l = c ? undefined : LEGACY.exec(bare);
	if (c) {
		family = c[1] as keyof typeof WINDOWS;
		version = Number(c[2]) + (c[3] !== undefined ? Number(c[3]) / 10 : 0);
	} else if (l) {
		family = l[3] as keyof typeof WINDOWS;
		version = Number(l[1]) + (l[2] !== undefined ? Number(l[2]) / 10 : 0);
	}
	if (!family) return undefined;
	if (ONE_M.test(bare)) return 1 * M;
	return WINDOWS[family].find((r) => version >= r.from)?.window;
}
