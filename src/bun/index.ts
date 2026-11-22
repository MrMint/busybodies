// The main process: the watcher, the two windows (the full office, and a compact floating one),
// the tray icon and the compact-mode shortcut. Closing the office window keeps the app in the tray;
// Quit is in the tray menu.
import { existsSync } from "node:fs";
import { BrowserView, BrowserWindow, GlobalShortcut, Updater, Utils } from "electrobun/main";
import type { ThemeId } from "../scene/theme/id";
import type { AppStatus, BusybodiesRPC } from "../shared/rpc";
import type { Snapshot } from "../watcher/model";
import { Watcher } from "../watcher/watch";
import { compactFrame } from "./compact";
import { type Settings, readSettings, settingsFile, settingsQuery, writeSettings } from "./settings";
import { installTray } from "./tray";
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
let sound = saved.sound;
let calm = saved.calm;
// A window opens with the saved choices (as ?theme=, &sound, &calm); one already open switches over RPC.
const urlFor = (compact: boolean) => {
	const q = [compact ? "compact" : "", ...settingsQuery({ theme, sound, calm }), extra].filter(Boolean).join("&");
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
	return { version, home, homeFound: existsSync(home), compact: compactOn };
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
	} else {
		compact?.window.hide();
		showOffice();
	}
	tray.refresh();
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

/** Sound and calm office: saved, and both windows hear (only the office window plays sound). */
function setToggles(change: { sound?: boolean; calm?: boolean }): void {
	sound = change.sound ?? sound;
	calm = change.calm ?? calm;
	save({ sound, calm });
	office?.rpc.send.settings({ sound, calm });
	compact?.rpc.send.settings({ sound, calm });
	tray.refresh();
}

function about(): void {
	showOffice();
	office?.rpc.send.about(undefined);
}

const tray = installTray({
	status: () => ({ snapshot: watcher.snapshot, compact: compactOn, theme, sound, calm }),
	setTheme,
	toggleSound: () => setToggles({ sound: !sound }),
	toggleCalm: () => setToggles({ calm: !calm }),
	showOffice,
	toggleCompact: () => setCompact(!compactOn),
	about,
	shortcut: COMPACT_SHORTCUT,
});

if (!GlobalShortcut.register(COMPACT_SHORTCUT, () => setCompact(!compactOn))) {
	console.warn(`[busybodies] couldn't register ${COMPACT_SHORTCUT}; use the tray menu for compact mode`);
}

office = openOffice();

watcher.onChange((snapshot: Snapshot) => {
	office?.rpc.send.snapshot(snapshot);
	compact?.rpc.send.snapshot(snapshot);
	tray.refresh();
});
await watcher.start();
tray.refresh();
void startUpdates();
