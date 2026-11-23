// The tray's menu as data, and what a click on it means: pure, so it is unit-tested without the
// native tray (test/settings-menu.test.ts). tray.ts hands the menu to Electrobun.
import type { MenuItemConfig } from "electrobun/main";
import type { Snapshot } from "../watcher/model";
import { THEME_IDS, type ThemeId } from "../scene/theme/id";
import { summaryOf } from "./mood";
import { LOOK_IDS, type LookId } from "../shared/look";

/** The Theme submenu's names. */
const THEME_NAMES: Record<ThemeId, string> = { office: "Office", factory: "Factory" };

export interface TrayStatus {
	snapshot: Snapshot | undefined | null;
	compact: boolean;
	theme: ThemeId;
	sound: boolean;
	calm: boolean;
	look: LookId;
}

export type TrayAction =
	| { kind: "office" }
	| { kind: "compact" }
	| { kind: "sound" }
	| { kind: "calm" }
	| { kind: "about" }
	| { kind: "quit" }
	| { kind: "theme"; id: ThemeId }
	| { kind: "look"; id: LookId };

const keys = (accelerator: string) =>
	accelerator.replace("CommandOrControl", "⌘").replace("Alt", "⌥").replace("Shift", "⇧").replaceAll("+", "");

/** The Look submenu's names (src/mainview/look.ts). */
const LOOK_NAMES: Record<LookId, string> = { plain: "Plain", pixel: "Pixel", night: "Night" };

export function trayMenu(s: TrayStatus, shortcut: string): MenuItemConfig[] {
	return [
		{ type: "normal", label: summaryOf(s.snapshot), enabled: false },
		{ type: "divider" },
		{ type: "normal", label: "Show office", action: "office" },
		{ type: "normal", label: `Compact mode (${keys(shortcut)})`, action: "compact", checked: s.compact },
		{
			type: "normal",
			label: "Theme",
			submenu: THEME_IDS.map((id) => ({ type: "normal" as const, label: THEME_NAMES[id], action: `theme:${id}`, checked: id === s.theme })),
		},
		{ type: "normal", label: "Sound", action: "sound", checked: s.sound },
		{ type: "normal", label: "Calm office", action: "calm", checked: s.calm },
		{
			type: "normal",
			label: "Look",
			submenu: LOOK_IDS.map((id) => ({ type: "normal" as const, label: LOOK_NAMES[id], action: `look:${id}`, checked: id === s.look })),
		},
		{ type: "divider" },
		{ type: "normal", label: "About Busybodies", action: "about" },
		{ type: "normal", label: "Quit Busybodies", action: "quit" },
	];
}

/** A menu click's action string, or undefined for one we don't know. */
export function trayAction(action: string | undefined): TrayAction | undefined {
	if (action?.startsWith("theme:")) {
		const id = action.slice(6);
		return (THEME_IDS as readonly string[]).includes(id) ? { kind: "theme", id: id as ThemeId } : undefined;
	}
	if (action?.startsWith("look:")) {
		const id = action.slice(5);
		return (LOOK_IDS as readonly string[]).includes(id) ? { kind: "look", id: id as LookId } : undefined;
	}
	const plain = ["office", "compact", "sound", "calm", "about", "quit"] as const;
	return (plain as readonly string[]).includes(action ?? "") ? { kind: action as (typeof plain)[number] } : undefined;
}
