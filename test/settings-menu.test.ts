// The app's settings file and the tray menu built from them: sound and calm office default off,
// only a real `true` turns them on, a retired look is dropped, they reach new windows as query
// flags, and the menu shows them as checked toggles. Everything here is invented, in a temp folder.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trayAction, trayMenu } from "../src/bun/menu";
import { DEFAULT_SETTINGS, readSettings, settingsFile, settingsQuery, writeSettings } from "../src/bun/settings";

const dir = mkdtempSync(join(tmpdir(), "busybodies-settings-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const fresh = () => settingsFile(join(dir, `case-${++n}`));

describe("settings", () => {
	test("no file: the defaults, sound and calm off", () => {
		expect(readSettings(fresh())).toEqual({ ...DEFAULT_SETTINGS });
		expect(DEFAULT_SETTINGS).toEqual({ theme: "office", sound: false, calm: false });
	});

	test("a torn or hand-edited file: only a real true turns a toggle on, unknown keys kept", () => {
		const file = fresh();
		writeSettings(file, {});
		writeFileSync(file, JSON.stringify({ theme: "factory", sound: "yes", calm: 1, extra: 7 }));
		expect(readSettings(file)).toEqual({ theme: "factory", sound: false, calm: false, extra: 7 });
		writeFileSync(file, "{ not json");
		expect(readSettings(file)).toEqual({ ...DEFAULT_SETTINGS });
	});

	test("a change is saved and the rest kept", () => {
		const file = fresh();
		writeSettings(file, { theme: "factory" });
		writeSettings(file, { sound: true });
		writeSettings(file, { calm: true });
		expect(readSettings(file)).toEqual({ theme: "factory", sound: true, calm: true });
		expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ theme: "factory", sound: true, calm: true });
		writeSettings(file, { sound: false });
		expect(readSettings(file).sound).toBe(false);
	});

	test("a saved pixel or night look (from an older version) is dropped: the default scene, and gone at the next save", () => {
		for (const look of ["pixel", "night", "plain"]) {
			const file = fresh();
			writeSettings(file, {});
			writeFileSync(file, JSON.stringify({ theme: "bakery", sound: true, calm: false, look }));
			expect(readSettings(file)).toEqual({ theme: "bakery", sound: true, calm: false });
			expect(settingsQuery(readSettings(file))).toEqual(["theme=bakery", "sound"]);
			writeSettings(file, { calm: true });
			expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ theme: "bakery", sound: true, calm: true });
		}
	});

	test("a new window gets them as query flags, only when on", () => {
		expect(settingsQuery(DEFAULT_SETTINGS)).toEqual(["theme=office"]);
		expect(settingsQuery({ theme: "factory", sound: true, calm: true })).toEqual(["theme=factory", "sound", "calm"]);
		expect(settingsQuery({ theme: "office", sound: false, calm: true })).toEqual(["theme=office", "calm"]);
	});
});

describe("tray menu", () => {
	const status = { snapshot: null, compact: false, theme: "office" as const, sound: false, calm: false };
	const item = (menu: ReturnType<typeof trayMenu>, label: string) => menu.find((m) => "label" in m && m.label === label) as { action?: string; checked?: boolean } | undefined;

	test("Sound and Calm office are toggles that show their state", () => {
		const off = trayMenu(status, "CommandOrControl+Alt+B");
		expect(item(off, "Sound")).toMatchObject({ action: "sound", checked: false });
		expect(item(off, "Calm office")).toMatchObject({ action: "calm", checked: false });
		const on = trayMenu({ ...status, sound: true, calm: true }, "CommandOrControl+Alt+B");
		expect(item(on, "Sound")?.checked).toBe(true);
		expect(item(on, "Calm office")?.checked).toBe(true);
		expect(item(on, "Compact mode (⌘⌥B)")).toBeDefined();
	});

	test("the Theme menu lists every theme, the Line among them, the saved one checked", () => {
		const theme = trayMenu({ ...status, theme: "bakery" }, "CommandOrControl+Alt+B").find((m) => "label" in m && m.label === "Theme") as { submenu: { label: string; action: string; checked: boolean }[] };
		expect(theme.submenu.map((m) => m.label)).toEqual(["Office", "Factory", "Bakery"]);
		expect(theme.submenu.find((m) => m.checked)?.action).toBe("theme:bakery");
	});

	test("no Look menu: the pixel and night looks are gone", () => {
		const menu = trayMenu(status, "CommandOrControl+Alt+B");
		expect(menu.some((m) => "label" in m && m.label === "Look")).toBe(false);
	});

	test("a click names its action; unknown ones are ignored", () => {
		expect(trayAction("sound")).toEqual({ kind: "sound" });
		expect(trayAction("calm")).toEqual({ kind: "calm" });
		expect(trayAction("theme:factory")).toEqual({ kind: "theme", id: "factory" });
		expect(trayAction("theme:bakery")).toEqual({ kind: "theme", id: "bakery" });
		expect(trayAction("theme:moon")).toBeUndefined();
		expect(trayAction("look:pixel")).toBeUndefined();
		expect(trayAction("nope")).toBeUndefined();
		expect(trayAction(undefined)).toBeUndefined();
	});
});
