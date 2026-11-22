// The menu-bar icon: a mochi face showing the office's overall mood (busy, all idle, or someone
// waiting on you), and a menu to show the office, toggle compact mode, read About, or quit. The
// faces are template images (black on clear), so macOS tints them for light and dark menu bars.
// They are drawn by tools/tray-icons.ts into assets/tray/ and copied into the bundle's views.
import { type MenuItemConfig, Tray, Utils } from "electrobun/main";
import type { Snapshot } from "../watcher/model";
import { type Mood, moodOf, summaryOf } from "./mood";

export interface TrayHooks {
	status: () => { snapshot: Snapshot | undefined | null; compact: boolean };
	showOffice: () => void;
	toggleCompact: () => void;
	about: () => void;
	/** The compact-mode shortcut, shown in the menu. */
	shortcut: string;
}

const image = (mood: Mood) => `views://tray/${mood}.png`;
const keys = (accelerator: string) =>
	accelerator.replace("CommandOrControl", "⌘").replace("Alt", "⌥").replace("Shift", "⇧").replaceAll("+", "");

export function installTray(hooks: TrayHooks) {
	const tray = new Tray({ image: image("idle"), template: true, width: 18, height: 18 });
	let shown = { mood: "" as Mood | "", menu: "" };

	tray.on("tray-clicked", (event) => {
		const action = (event as { data?: { action?: string } }).data?.action;
		if (action === "office") hooks.showOffice();
		else if (action === "compact") hooks.toggleCompact();
		else if (action === "about") hooks.about();
		else if (action === "quit") Utils.quit();
	});

	return {
		/** Bring the icon and menu up to date; cheap when nothing changed. */
		refresh() {
			const { snapshot, compact } = hooks.status();
			const mood = moodOf(snapshot);
			if (mood !== shown.mood) {
				tray.setImage(image(mood));
				shown.mood = mood;
			}
			const menu: MenuItemConfig[] = [
				{ type: "normal", label: summaryOf(snapshot), enabled: false },
				{ type: "divider" },
				{ type: "normal", label: "Show office", action: "office" },
				{ type: "normal", label: `Compact mode (${keys(hooks.shortcut)})`, action: "compact", checked: compact },
				{ type: "divider" },
				{ type: "normal", label: "About Busybodies", action: "about" },
				{ type: "normal", label: "Quit Busybodies", action: "quit" },
			];
			const key = JSON.stringify(menu);
			if (key !== shown.menu) {
				tray.setMenu(menu);
				shown.menu = key;
			}
		},
	};
}
