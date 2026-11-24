// The app's own settings: a small JSON file in its data folder (Electrobun's `Utils.paths.userData`).
// Only what the user picks in the tray menu lives here: the scene theme and calm office (off by
// default: the system's reduced motion still calms it). Reading is forgiving: a missing, torn or
// hand-edited file gives the defaults, and unknown keys are kept as they are, except two retired
// ones: `look` (the pixel and night looks are gone) and `sound` (sound is gone), dropped so the next
// save leaves them out of the file.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_THEME, type ThemeId, themeId } from "../themes/ids";

export interface Settings {
	theme: ThemeId;
	/** No life in a quiet office (`?calm`). */
	calm: boolean;
}

export const DEFAULT_SETTINGS: Settings = { theme: DEFAULT_THEME, calm: false };

export const settingsFile = (dataDir: string) => join(dataDir, "settings.json");

export function readSettings(file: string): Settings & Record<string, unknown> {
	let raw: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
	} catch {
		// No file yet, or one we can't read: the defaults.
	}
	// The retired settings (the looks, sound): dropped, so the next save leaves them out of the file.
	const { look: _look, sound: _sound, ...rest } = raw;
	return {
		...rest,
		theme: typeof raw.theme === "string" ? themeId(raw.theme) : DEFAULT_SETTINGS.theme,
		// Only a real `true` turns it on: a hand-edited "yes" or 1 keeps the default.
		calm: raw.calm === true,
	};
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

/** The window's query for these settings: the query string is the scene's one entry point, so a
 * window opens as `?theme=factory&calm` and later changes arrive over RPC. */
export function settingsQuery(s: Settings): string[] {
	return [`theme=${s.theme}`, s.calm ? "calm" : ""].filter(Boolean);
}
