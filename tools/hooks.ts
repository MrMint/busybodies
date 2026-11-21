// Opt-in hooks for "waiting on you". The agent tool runs a hook on each event we register; ours is a
// small shell script that appends one line ("<epoch s> <event> <session id> [kind]") to
// <agent home>/busybodies/events.log, which the watcher reads. Nothing else is recorded: no
// prompt text, no paths.
//   bun tools/hooks.ts status     [--home ~/.claude]
//   bun tools/hooks.ts install    [--home ~/.claude]
//   bun tools/hooks.ts uninstall  [--home ~/.claude]
// Install backs the settings file up first. Uninstall takes out exactly what install added; when
// nothing else changed in between, the file comes back byte for byte (or is removed again, if
// install created it). The hook never blocks the agent: it exits 0 whatever happens, and the
// agent's own timeout caps it at 2 s.
import { chmod, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { defaultRoots, HOOK_DIR, HOOK_EVENTS } from "../src/watcher/sources";

/** The agent events we listen to: a prompt for the person, their answer, and the end of a turn. */
export const EVENTS = ["Notification", "UserPromptSubmit", "Stop"] as const;
const SCRIPT = "hook.sh";
const BACKUP = "settings.before-hooks.json";
const ABSENT = "<<busybodies: no settings file before install>>\n";

export const HOOK_SCRIPT = `#!/bin/sh
# Busybodies: one line per agent event, for the scene's "waiting on you". Installed by
# tools/hooks.ts; remove it with "bun tools/hooks.ts uninstall". It must never block the agent:
# it reads the event, appends a line, and exits 0 whatever happens.
exec 2>/dev/null
in=$(head -c 65536)
sid=$(printf '%s' "$in" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\\([A-Za-z0-9_-]*\\)".*/\\1/p' | head -n 1)
[ -n "$sid" ] || exit 0
kind=
if [ "$1" = Notification ]; then
	nt=$(printf '%s' "$in" | sed -n 's/.*"notification_type"[[:space:]]*:[[:space:]]*"\\([a-z_]*\\)".*/\\1/p' | head -n 1)
	case "$nt" in
	permission_prompt) kind=permission ;;
	idle_prompt) kind=idle ;;
	elicitation_dialog) kind=question ;;
	"") case "$in" in
		*permission*) kind=permission ;;
		*"waiting for your input"*) kind=idle ;;
		*) kind=other ;;
		esac ;;
	*) kind=other ;;
	esac
fi
f="$(dirname "$0")/${HOOK_EVENTS}"
printf '%s %s %s %s\\n' "$(date +%s)" "$1" "$sid" "$kind" >> "$f"
# Keep the file small: at the end of a turn, start a new one past 256 KB.
if [ "$1" = Stop ]; then
	size=$(wc -c < "$f")
	[ "\${size:-0}" -gt 262144 ] && mv -f "$f" "$f.1"
fi
exit 0
`;

type HookEntry = { type?: string; command?: string; timeout?: number };
type Matcher = { matcher?: string; hooks?: HookEntry[] };
type Settings = { hooks?: Record<string, Matcher[]> } & Record<string, unknown>;

const paths = (home: string) => ({
	settings: join(home, "settings.json"),
	dir: join(home, HOOK_DIR),
	script: join(home, HOOK_DIR, SCRIPT),
	backup: join(home, HOOK_DIR, BACKUP),
	events: join(home, HOOK_DIR, HOOK_EVENTS),
});

const command = (home: string, event: string) => `/bin/sh '${paths(home).script}' ${event}`;
const ours = (h: HookEntry) => typeof h?.command === "string" && h.command.includes(`/${HOOK_DIR}/${SCRIPT}`);

async function readText(path: string): Promise<string | undefined> {
	return readFile(path, "utf8").catch(() => undefined);
}

/** The settings file's indent and final newline, so a rewrite looks like the original. */
function style(text: string | undefined): { indent: string | number; newline: boolean } {
	const m = text ? /\n([ \t]+)\S/.exec(text) : null;
	return { indent: m ? (m[1]!.startsWith("\t") ? "\t" : m[1]!.length) : 2, newline: text ? text.endsWith("\n") : true };
}

const serialize = (s: Settings, like: string | undefined) => {
	const st = style(like);
	return JSON.stringify(s, null, st.indent) + (st.newline ? "\n" : "");
};

export type Status = { installed: EventName[]; missing: EventName[]; script: boolean; events?: number };
type EventName = (typeof EVENTS)[number];

export async function status(home: string): Promise<Status> {
	const p = paths(home);
	const text = await readText(p.settings);
	const s: Settings = text ? JSON.parse(text) : {};
	const has = (e: EventName) => (s.hooks?.[e] ?? []).some((m) => (m.hooks ?? []).some(ours));
	const log = await readText(p.events);
	return {
		installed: EVENTS.filter(has),
		missing: EVENTS.filter((e) => !has(e)),
		script: (await readText(p.script)) === HOOK_SCRIPT,
		...(log !== undefined ? { events: log.split("\n").filter(Boolean).length } : {}),
	};
}

export async function install(home: string): Promise<string> {
	if (home.includes("'")) throw new Error("the agent home's path has a quote in it; install by hand");
	const p = paths(home);
	const text = await readText(p.settings);
	const s: Settings = text ? JSON.parse(text) : {}; // a broken settings file: stop here, change nothing
	const st = await status(home);
	if (st.missing.length === 0 && st.script) return "already installed";
	await mkdir(p.dir, { recursive: true });
	if ((await readText(p.backup)) === undefined) await writeFile(p.backup, text ?? ABSENT);
	await writeFile(p.script, HOOK_SCRIPT);
	await chmod(p.script, 0o755);
	s.hooks ??= {};
	for (const e of st.missing) {
		(s.hooks[e] ??= []).push({ hooks: [{ type: "command", command: command(home, e), timeout: 2 }] });
	}
	await writeFile(p.settings, serialize(s, text));
	return `installed ${st.missing.join(", ") || "the script"}; settings backed up to ${p.backup}`;
}

export async function uninstall(home: string): Promise<string> {
	const p = paths(home);
	const text = await readText(p.settings);
	const backup = await readText(p.backup);
	if (text !== undefined) {
		const s: Settings = JSON.parse(text);
		for (const [event, matchers] of Object.entries(s.hooks ?? {})) {
			const kept: Matcher[] = [];
			for (const m of matchers) {
				if (!(m.hooks ?? []).some(ours)) kept.push(m);
				else if (m.hooks!.some((h) => !ours(h))) kept.push({ ...m, hooks: m.hooks!.filter((h) => !ours(h)) });
			}
			if (kept.length > 0) s.hooks![event] = kept;
			else delete s.hooks![event];
		}
		if (s.hooks && Object.keys(s.hooks).length === 0) delete s.hooks;
		// Nothing else changed since install: put the original bytes back.
		const before = backup === ABSENT ? {} : backup !== undefined ? safeParse(backup) : undefined;
		if (before !== undefined && Bun.deepEquals(before, s)) {
			if (backup === ABSENT) await rm(p.settings, { force: true });
			else await writeFile(p.settings, backup!);
		} else {
			await writeFile(p.settings, serialize(s, text));
		}
	}
	for (const f of [p.script, p.backup, p.events, `${p.events}.1`]) await rm(f, { force: true });
	await rmdir(p.dir).catch(() => {}); // only if it's empty
	return "uninstalled";
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({ options: { home: { type: "string" } }, allowPositionals: true });
	const home = values.home ?? defaultRoots().home;
	const cmd = positionals[0] ?? "status";
	if (cmd === "install") console.log(await install(home));
	else if (cmd === "uninstall") console.log(await uninstall(home));
	else if (cmd === "status") {
		const s = await status(home);
		console.log(s.missing.length === 0 && s.script ? "installed" : s.installed.length ? `partly installed (missing ${s.missing.join(", ")})` : "not installed");
		if (s.events !== undefined) console.log(`${s.events} events recorded`);
	} else {
		console.error("usage: bun tools/hooks.ts status|install|uninstall [--home DIR]");
		process.exit(2);
	}
}
