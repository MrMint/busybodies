// The app's own settings: a small JSON file in its data folder (Electrobun's `Utils.paths.userData`).
// Only what the user picks in the tray menu lives here: the scene theme, sound (off by default),
// calm office (off by default: the system's reduced motion still calms it) and the look (plain by
// default). Reading is forgiving: a missing, torn or hand-edited file gives the defaults, and
// unknown keys are kept as they are.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_THEME, type ThemeId, themeId } from "../scene/theme/id";
import { DEFAULT_LOOK, type LookId, lookId } from "../shared/look";

export interface Settings {
	theme: ThemeId;
	/** Earcons and a quiet room tone in the office window (src/mainview/sound.ts). */
	sound: boolean;
	/** No life in a quiet office, and no sound (`?calm`). */
	calm: boolean;
	/** How the scene is drawn: plain, pixel or night (`?look=`, src/mainview/look.ts). */
	look: LookId;
}

export const DEFAULT_SETTINGS: Settings = { theme: DEFAULT_THEME, sound: false, calm: false, look: DEFAULT_LOOK };

export const settingsFile = (dataDir: string) => join(dataDir, "settings.json");

export function readSettings(file: string): Settings & Record<string, unknown> {
	let raw: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
	} catch {
		// No file yet, or one we can't read: the defaults.
	}
	return {
		...raw,
		theme: typeof raw.theme === "string" ? themeId(raw.theme) : DEFAULT_SETTINGS.theme,
		// Only a real `true` turns either on: a hand-edited "yes" or 1 keeps the default.
		sound: raw.sound === true,
		calm: raw.calm === true,
		look: lookId(raw.look),
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
 * window opens as `?theme=factory&sound&calm` and later changes arrive over RPC. */
export function settingsQuery(s: Settings): string[] {
	return [`theme=${s.theme}`, s.sound ? "sound" : "", s.calm ? "calm" : "", s.look !== DEFAULT_LOOK ? `look=${s.look}` : ""].filter(Boolean);
}
