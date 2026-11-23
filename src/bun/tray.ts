// The menu-bar icon: a mochi face showing the office's overall mood (busy, all idle, or someone
// waiting on you), and a menu to show the office, toggle compact mode, pick the theme, turn sound
// and calm office on or off, pick the look, read About, or quit (the menu itself is data: menu.ts). The faces are
// template images (black on clear), so macOS tints them for light and dark menu bars. They are
// drawn by tools/tray-icons.ts into assets/tray/ and copied into the bundle's views.
import { Tray, Utils } from "electrobun/main";
import type { ThemeId } from "../scene/theme/id";
import type { LookId } from "../shared/look";
import { type TrayStatus, trayAction, trayMenu } from "./menu";
import { type Mood, moodOf } from "./mood";

export interface TrayHooks {
	status: () => TrayStatus;
	showOffice: () => void;
	toggleCompact: () => void;
	toggleSound: () => void;
	toggleCalm: () => void;
	about: () => void;
	setTheme: (id: ThemeId) => void;
	setLook: (id: LookId) => void;
	/** The compact-mode shortcut, shown in the menu. */
	shortcut: string;
}

const image = (mood: Mood) => `views://tray/${mood}.png`;

export function installTray(hooks: TrayHooks) {
	const tray = new Tray({ image: image("idle"), template: true, width: 18, height: 18 });
	let shown = { mood: "" as Mood | "", menu: "" };

	tray.on("tray-clicked", (event) => {
		const action = trayAction((event as { data?: { action?: string } }).data?.action);
		if (!action) return;
		if (action.kind === "theme") hooks.setTheme(action.id);
		else if (action.kind === "office") hooks.showOffice();
		else if (action.kind === "compact") hooks.toggleCompact();
		else if (action.kind === "sound") hooks.toggleSound();
		else if (action.kind === "calm") hooks.toggleCalm();
		else if (action.kind === "look") hooks.setLook(action.id);
		else if (action.kind === "about") hooks.about();
		else if (action.kind === "quit") Utils.quit();
	});

	return {
		/** Bring the icon and menu up to date; cheap when nothing changed. */
		refresh() {
			const status = hooks.status();
			const mood = moodOf(status.snapshot);
			if (mood !== shown.mood) {
				tray.setImage(image(mood));
				shown.mood = mood;
			}
			const menu = trayMenu(status, hooks.shortcut);
			const key = JSON.stringify(menu);
			if (key !== shown.menu) {
				tray.setMenu(menu);
				shown.menu = key;
			}
		},
	};
}
