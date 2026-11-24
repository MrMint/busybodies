// The app's settings file and the tray menu built from them: calm office defaults off, only a real
// `true` turns it on, a retired look or sound setting is dropped, it reaches new windows as a query
// flag, and the menu shows it as a checked toggle. Everything here is invented, in a temp folder.
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
	test("no file: the defaults, calm off", () => {
		expect(readSettings(fresh())).toEqual({ ...DEFAULT_SETTINGS });
		expect(DEFAULT_SETTINGS).toEqual({ theme: "office", calm: false });
	});

	test("a torn or hand-edited file: only a real true turns calm on, unknown keys kept", () => {
		const file = fresh();
		writeSettings(file, {});
		writeFileSync(file, JSON.stringify({ theme: "factory", calm: 1, extra: 7 }));
		expect(readSettings(file)).toEqual({ theme: "factory", calm: false, extra: 7 });
		writeFileSync(file, "{ not json");
		expect(readSettings(file)).toEqual({ ...DEFAULT_SETTINGS });
	});

	test("a change is saved and the rest kept", () => {
		const file = fresh();
		writeSettings(file, { theme: "factory" });
		writeSettings(file, { calm: true });
		expect(readSettings(file)).toEqual({ theme: "factory", calm: true });
		expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ theme: "factory", calm: true });
		writeSettings(file, { calm: false });
		expect(readSettings(file).calm).toBe(false);
	});

	test("a saved look or sound setting (from an older version) is dropped, and gone at the next save", () => {
		for (const old of [{ look: "pixel" }, { look: "night" }, { sound: true }, { sound: false, look: "plain" }]) {
			const file = fresh();
			writeSettings(file, {});
			writeFileSync(file, JSON.stringify({ theme: "bakery", calm: false, ...old }));
			expect(readSettings(file)).toEqual({ theme: "bakery", calm: false });
			expect(settingsQuery(readSettings(file))).toEqual(["theme=bakery"]);
			writeSettings(file, { calm: true });
			expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ theme: "bakery", calm: true });
		}
	});

	test("a new window gets them as query flags, calm only when on", () => {
		expect(settingsQuery(DEFAULT_SETTINGS)).toEqual(["theme=office"]);
		expect(settingsQuery({ theme: "factory", calm: true })).toEqual(["theme=factory", "calm"]);
	});
});

describe("tray menu", () => {
	const status = { snapshot: null, compact: false, theme: "office" as const, calm: false };
	const item = (menu: ReturnType<typeof trayMenu>, label: string) => menu.find((m) => "label" in m && m.label === label) as { action?: string; checked?: boolean } | undefined;

	test("Calm office is a toggle that shows its state; there is no Sound", () => {
		const off = trayMenu(status, "CommandOrControl+Alt+B");
		expect(item(off, "Calm office")).toMatchObject({ action: "calm", checked: false });
		expect(item(off, "Sound")).toBeUndefined();
		const on = trayMenu({ ...status, calm: true }, "CommandOrControl+Alt+B");
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

	test("a click names its action; unknown ones (sound among them, now) are ignored", () => {
		expect(trayAction("calm")).toEqual({ kind: "calm" });
		expect(trayAction("theme:factory")).toEqual({ kind: "theme", id: "factory" });
		expect(trayAction("theme:bakery")).toEqual({ kind: "theme", id: "bakery" });
		expect(trayAction("theme:moon")).toBeUndefined();
		expect(trayAction("sound")).toBeUndefined();
		expect(trayAction("look:pixel")).toBeUndefined();
		expect(trayAction("nope")).toBeUndefined();
		expect(trayAction(undefined)).toBeUndefined();
	});
});
