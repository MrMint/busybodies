// The app's own settings: a small JSON file in its data folder (Electrobun's `Utils.paths.userData`).
// Only what the user picks in the tray menu lives here, today the scene theme. Reading is forgiving:
// a missing, torn or hand-edited file gives the defaults, and unknown keys are kept as they are.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_THEME, type ThemeId, themeId } from "../scene/theme/id";

export interface Settings {
	theme: ThemeId;
}

export const settingsFile = (dataDir: string) => join(dataDir, "settings.json");

export function readSettings(file: string): Settings & Record<string, unknown> {
	let raw: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
	} catch {
		// No file yet, or one we can't read: the defaults.
	}
	return { ...raw, theme: typeof raw.theme === "string" ? themeId(raw.theme) : DEFAULT_THEME };
}

/** Save a change: written to a temporary file, then renamed over the old one, so a crash mid-write
 * never leaves half a file. */
export function writeSettings(file: string, change: Partial<Settings>): Settings {
	const next = { ...readSettings(file), ...change };
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
	renameSync(tmp, file);
	return next;
}
