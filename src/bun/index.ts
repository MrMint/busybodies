// The main process: the watcher, the two windows (the full office, and a compact floating one),
// the tray icon and the compact-mode shortcut. Busybodies lives in the menu bar: closing the office
// window keeps it running there (the Dock icon goes with the window, and comes back with it), and
// clicking the Dock icon or opening the app again brings the office back. Quitting (the tray's
// Quit, ⌘Q, the Dock's Quit, SIGTERM) always takes one way out (shutdown.ts).
import { existsSync } from "node:fs";
import Electrobun, { ApplicationMenu, BrowserView, BrowserWindow, GlobalShortcut, Updater, Utils } from "electrobun/main";
import { type ThemeId, themeId } from "../scene/theme/id";
import type { AppStatus, BusybodiesRPC } from "../shared/rpc";
import type { Snapshot } from "../watcher/model";
import { Watcher } from "../watcher/watch";
import { compactFrame } from "./compact";
import { Diarist, diaryFile } from "./diary";
import { type Settings, readSettings, settingsFile, settingsQuery, writeSettings } from "./settings";
import { installTray } from "./tray";
import { shutdown } from "./shutdown";
import { startUpdates } from "./updates";

const DEV_SERVER_URL = "http://localhost:5173";
/** Toggles the compact window from anywhere. */
export const COMPACT_SHORTCUT = "CommandOrControl+Alt+B";
export const PROJECT_URL = "https://github.com/MrMint/busybodies";

/** In the dev channel, prefer Vite's dev server (hot reload) when it is running. */
async function mainViewUrl(): Promise<string> {
	if ((await Updater.localInfo.channel()) === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			return DEV_SERVER_URL;
		} catch {
			// No dev server: fall through to the bundled view.
		}
	}
	return "views://mainview/index.html";
}

const watcher = new Watcher();
console.info(`[busybodies] watching ${watcher.builder.roots.home}`);
const version = (await Updater.getLocalInfo()).version;
const baseUrl = await mainViewUrl();
// BUSYBODIES_SCENE_QUERY passes scene modes through to the view, e.g. "demo" or "blank".
const extra = process.env.BUSYBODIES_SCENE_QUERY ?? "";
/** The tray's choices, saved in the app's data folder (settings.ts). */
const SETTINGS = settingsFile(Utils.paths.userData);
const saved = readSettings(SETTINGS);
let theme: ThemeId = saved.theme;
let calm = saved.calm;
/** The office's diary: counts and kinds only, next to settings.json (diary.ts). */
const diarist = new Diarist(diaryFile(Utils.paths.userData));
/** The way out: steps are added below as each part starts, and run once on quit. */
const exit = shutdown();
Electrobun.events.on("before-quit", () => void exit.run("quit"));
process.on("exit", () => exit.run("exit"));
// A window opens with the saved choices (as ?theme= and &calm); one already open switches over RPC.
const urlFor = (compact: boolean) => {
	const q = [compact ? "compact" : "", ...settingsQuery({ theme, calm }), extra].filter(Boolean).join("&");
	return q ? `${baseUrl}?${q}` : baseUrl;
};

type Rpc = ReturnType<typeof makeRpc>;
interface Shown {
	window: BrowserWindow;
	rpc: Rpc;
}
let office: Shown | undefined;
let compact: Shown | undefined;
let compactOn = false;

function status(): AppStatus {
	const home = watcher.builder.roots.home;
	return { version, home, homeFound: existsSync(home), compact: compactOn, theme };
}

function makeRpc() {
	return BrowserView.defineRPC<BusybodiesRPC>({
		handlers: {
			requests: {
				snapshot: () => watcher.snapshot ?? null,
				status,
				setCompact: ({ on }) => (setCompact(on), true),
				showOffice: () => (showOffice(), true),
				openProjectPage: () => Utils.openExternal(PROJECT_URL),
				setTheme: ({ id }) => (setTheme(themeId(id)), true),
				setToggles: (change) => (setToggles({ calm: change.calm }), true),
				diary: () => diarist.diary,
			},
		},
	});
}

function openOffice(): Shown {
	const rpc = makeRpc();
	const window = new BrowserWindow({
		title: "Busybodies",
		url: urlFor(false),
		frame: { width: 1280, height: 800, x: 120, y: 80 },
		rpc,
	});
	window.on("close", () => {
		if (office?.window === window) office = undefined;
		syncDock();
	});
	return { window, rpc };
}

function openCompact(): Shown {
	const rpc = makeRpc();
	const window = new BrowserWindow({
		title: "Busybodies (compact)",
		url: urlFor(true),
		frame: compactFrame(),
		titleBarStyle: "hidden",
		transparent: true,
		hidden: true,
		rpc,
	});
	window.setAlwaysOnTop(true);
	window.setVisibleOnAllWorkspaces(true);
	window.on("close", () => {
		if (compact?.window === window) compact = undefined;
		compactOn = false;
		tray.refresh();
		syncDock();
	});
	return { window, rpc };
}

/** Compact mode: the small floating window comes up and the full office steps aside. */
function setCompact(on: boolean): void {
	compactOn = on;
	if (on) {
		compact ??= openCompact();
		compact.window.show();
		office?.window.hide();
		officeShown = false;
	} else {
		compact?.window.hide();
		showOffice();
	}
	tray.refresh();
	syncDock();
}

function showOffice(): void {
	if (compactOn) {
		compactOn = false;
		compact?.window.hide();
		tray.refresh();
	}
	office ??= openOffice();
	office.window.show();
	office.window.activate();
	officeShown = true;
	syncDock();
}

/** Whether the office window is up (not closed, not stepped aside for compact mode). */
let officeShown = false;
/**
 * The Dock icon is there exactly while the office window is: with only the menu bar (and maybe the
 * compact window) left, Busybodies is a menu-bar app, and nothing in the Dock looks stuck open.
 */
function syncDock(): void {
	const want = officeShown && office !== undefined;
	if (Utils.isDockIconVisible() !== want) Utils.setDockIconVisible(want);
}

function save(change: Partial<Settings>): void {
	try {
		writeSettings(SETTINGS, change);
	} catch (e) {
		console.warn(`[busybodies] couldn't save settings: ${e}`);
	}
}

/** Pick the theme: saved, and both windows switch (without a reload). */
function setTheme(id: ThemeId): void {
	if (id === theme) return;
	theme = id;
	save({ theme });
	office?.rpc.send.theme({ id });
	compact?.rpc.send.theme({ id });
	tray.refresh();
}

/** Calm office: saved, and both windows hear. */
function setToggles(change: { calm?: boolean }): void {
	calm = change.calm ?? calm;
	save({ calm });
	office?.rpc.send.settings({ calm });
	compact?.rpc.send.settings({ calm });
	tray.refresh();
}

function about(): void {
	showOffice();
	office?.rpc.send.about(undefined);
}

const tray = installTray({
	status: () => ({ snapshot: watcher.snapshot, compact: compactOn, theme, calm }),
	setTheme,
	toggleCalm: () => setToggles({ calm: !calm }),
	showOffice,
	toggleCompact: () => setCompact(!compactOn),
	about,
	shortcut: COMPACT_SHORTCUT,
});

if (!GlobalShortcut.register(COMPACT_SHORTCUT, () => setCompact(!compactOn))) {
	console.warn(`[busybodies] couldn't register ${COMPACT_SHORTCUT}; use the tray menu for compact mode`);
}
exit.add("shortcut", () => GlobalShortcut.unregisterAll());

// The app menu gives ⌘Q, ⌘W, ⌘H and ⌘M (and copy for the About sheet's text); without one, ⌘Q does nothing.
ApplicationMenu.setApplicationMenu([
	{
		submenu: [
			{ label: "About Busybodies", action: "about" },
			{ type: "divider" },
			{ role: "hide", accelerator: "h" },
			{ role: "hideOthers" },
			{ role: "showAll" },
			{ type: "divider" },
			{ label: "Quit Busybodies", role: "quit", accelerator: "q" },
		],
	},
	{ label: "Edit", submenu: [{ role: "copy", accelerator: "c" }, { role: "selectAll", accelerator: "a" }] },
	{
		label: "Window",
		submenu: [
			{ role: "minimize", accelerator: "m" },
			{ role: "close", accelerator: "w" },
			{ type: "divider" },
			{ role: "bringAllToFront" },
		],
	},
]);
ApplicationMenu.on("application-menu-clicked", (event) => {
	if ((event as { data?: { action?: string } }).data?.action === "about") about();
});
// The Dock icon clicked, or the app opened again while it runs: bring the office back.
Electrobun.events.on("reopen", () => showOffice());

office = openOffice();
officeShown = true;

watcher.onChange((snapshot: Snapshot) => {
	// The diary first, so a window hears the day's counts along with the snapshot that changed them.
	if (diarist.note(snapshot)) {
		office?.rpc.send.diary(diarist.diary);
		compact?.rpc.send.diary(diarist.diary);
	}
	office?.rpc.send.snapshot(snapshot);
	compact?.rpc.send.snapshot(snapshot);
	tray.refresh();
});
// Stop reading first, so no snapshot changes the diary after it is saved.
exit.add("watcher", () => watcher.stop());
exit.add("diary", () => diarist.flush());
await watcher.start();
tray.refresh();
exit.add("updates", startUpdates());
