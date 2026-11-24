// The tray's menu as data, and what a click on it means: pure, so it is unit-tested without the
// native tray (test/settings-menu.test.ts). tray.ts hands the menu to Electrobun.
import type { MenuItemConfig } from "electrobun/main";
import type { Snapshot } from "../watcher/model";
import { THEME_IDS, type ThemeId } from "../themes/ids";
import { summaryOf } from "./mood";

/** The Theme submenu's names. */
const THEME_NAMES: Record<ThemeId, string> = { office: "Office", factory: "Factory", bakery: "Bakery" };

export interface TrayStatus {
	snapshot: Snapshot | undefined | null;
	compact: boolean;
	theme: ThemeId;
	calm: boolean;
}

export type TrayAction = { kind: "office" } | { kind: "compact" } | { kind: "calm" } | { kind: "about" } | { kind: "quit" } | { kind: "theme"; id: ThemeId };

const keys = (accelerator: string) => accelerator.replace("CommandOrControl", "⌘").replace("Alt", "⌥").replace("Shift", "⇧").replaceAll("+", "");

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
		{ type: "normal", label: "Calm office", action: "calm", checked: s.calm },
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
	const plain = ["office", "compact", "calm", "about", "quit"] as const;
	return (plain as readonly string[]).includes(action ?? "") ? { kind: action as (typeof plain)[number] } : undefined;
}
