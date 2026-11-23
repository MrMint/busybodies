// The app around the scene, in plain DOM: the About screen and the empty states. In the app it
// talks to the Bun process through `bridge`; in a browser (?demo) there is no bridge and it shows
// what it can. Fixtures: ?demo=empty (nobody's in), ?demo=nohome (no coding agent found), ?about.
import type { AppStatus } from "../shared/rpc";
import { THEME_IDS, type ThemeId } from "../scene/theme/id";
import type { Session, Snapshot } from "../watcher/model";

/** What the shell can ask of the Bun process. */
export interface Bridge {
	status(): Promise<AppStatus>;
	setCompact(on: boolean): void;
	showOffice(): void;
	openProjectPage(): void;
	setTheme(id: ThemeId): void;
	setToggles(change: Toggles): void;
}

/** The settings sheet's switches, as the tray has them too. */
export interface Toggles {
	sound?: boolean;
	calm?: boolean;
}

const SWITCHES: { key: "sound" | "calm"; name: string; note: string }[] = [
	{ key: "sound", name: "Sound", note: "Little sounds for real events: a bell when someone waits on you, a chime for a PR." },
	{ key: "calm", name: "Calm office", note: "No blinking or fidgeting: a quiet office keeps perfectly still." },
];

/** What each theme is called in the settings sheet. */
const THEME_NAMES: Record<ThemeId, { name: string; note: string }> = {
	office: { name: "Office", note: "Desks, copiers and a lot of paper." },
	factory: { name: "Factory", note: "Hard hats, machines and robot arms." },
	bakery: { name: "Bakery", note: "Croissants, cakes, coffee and far too much sugar." },
};

const CSS = `
html:has(body.compact),body.compact{background:transparent}
.bb-card{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) rotate(-1.2deg);max-width:min(460px,calc(100vw - 48px));
 background:#ffe500;border:4px solid #1b2140;border-radius:6px;box-shadow:5px 6px 0 rgba(27,33,64,.2);padding:12px 18px 14px;
 font:600 15px/1.35 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#1b2140;z-index:3;pointer-events:none}
.bb-card[hidden]{display:none}
.bb-card b{display:block;font-size:19px;font-weight:800;margin-bottom:3px}
.bb-card code{font:600 13px ui-monospace,Menlo,monospace;background:rgba(255,255,255,.6);padding:1px 4px;border-radius:4px;word-break:break-all}
.compact .bb-card{bottom:10px;padding:7px 11px 9px;font-size:12.5px}
.compact .bb-card b{font-size:15px}
#bb-about{position:fixed;inset:0;display:grid;place-items:center;background:rgba(27,33,64,.45);z-index:5}
#bb-about[hidden]{display:none}
#bb-about .sheet{width:min(520px,calc(100vw - 40px));background:#fffaf0;border:5px solid #1b2140;border-radius:16px;
 box-shadow:8px 10px 0 rgba(27,33,64,.25);padding:22px 26px 20px;font:500 15px/1.45 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#1b2140}
#bb-about h2{margin:0 0 2px;font-size:26px;font-weight:800}
#bb-about .v{font-weight:700;opacity:.7;margin-bottom:12px}
#bb-about h3{margin:14px 0 4px;font-size:15px;font-weight:800}
#bb-about p{margin:0 0 6px}
#bb-about .row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
#bb-about button{font:700 14px ui-rounded,system-ui,sans-serif;color:#1b2140;background:#fff;border:3px solid #1b2140;border-radius:999px;
 padding:5px 14px;cursor:pointer;box-shadow:2px 3px 0 #1b2140}
#bb-about button.primary{background:#1b2140;color:#fff}
#bb-settings{position:fixed;inset:0;display:grid;place-items:center;background:rgba(27,33,64,.45);z-index:5}
#bb-settings[hidden]{display:none}
#bb-settings .sheet{width:min(440px,calc(100vw - 40px));background:#fffaf0;border:5px solid #1b2140;border-radius:16px;
 box-shadow:8px 10px 0 rgba(27,33,64,.25);padding:22px 26px 20px;font:500 15px/1.45 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#1b2140}
#bb-settings h2{margin:0 0 10px;font-size:26px;font-weight:800}
#bb-settings h3{margin:0 0 6px;font-size:15px;font-weight:800}
#bb-settings .choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#bb-settings .choice{text-align:left;font:600 13px/1.3 ui-rounded,system-ui,sans-serif;color:#1b2140;background:#fff;border:3px solid #1b2140;
 border-radius:12px;padding:8px 12px 10px;cursor:pointer;box-shadow:2px 3px 0 #1b2140}
#bb-settings .choice b{display:block;font-size:16px;font-weight:800}
#bb-settings .choice[aria-checked="true"]{background:#1b2140;color:#fff}
#bb-settings .switches{margin-top:2px}
#bb-settings h3.office-label{margin-top:14px}
#bb-settings .row{display:flex;justify-content:flex-end;margin-top:16px}
#bb-settings .close{font:700 14px ui-rounded,system-ui,sans-serif;color:#fff;background:#1b2140;border:3px solid #1b2140;border-radius:999px;
 padding:5px 14px;cursor:pointer;box-shadow:2px 3px 0 #1b2140}
`;

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

export function installShell(opts: {
	bridge: Bridge;
	/** Connected to the Bun process (not a demo or a replay): the bridge answers. */
	live: boolean;
	compact: boolean;
	/** Overrides for fixtures. */
	status?: Partial<AppStatus>;
	/** The theme showing now, and how to switch it in this window. */
	theme: { current(): ThemeId; set(id: ThemeId): void };
	/** Sound and calm office now, and how to switch them in this window. */
	toggles: { current(): Required<Toggles>; set(change: Toggles): void };
}) {
	const style = document.createElement("style");
	style.textContent = CSS;
	document.head.appendChild(style);
	document.body.classList.toggle("compact", opts.compact);

	const card = document.createElement("div");
	card.className = "bb-card";
	card.hidden = true;
	card.setAttribute("role", "status");
	document.body.appendChild(card);

	const about = document.createElement("div");
	about.id = "bb-about";
	about.hidden = true;
	about.setAttribute("role", "dialog");
	about.setAttribute("aria-label", "About Busybodies");
	about.innerHTML = `<div class="sheet">
<h2>Busybodies</h2><div class="v"></div>
<p>Your AI coding agents, as a little office. Every session gets a desk, every subagent a tiny colleague.</p>
<h3>What it reads</h3>
<p>Your coding agent's own local files: its list of running sessions, their transcripts, and its
subagents' details. <b>Read-only</b>: Busybodies never writes to them or changes the agent's settings.
(The optional "waiting on you" hook is the one exception, and only if you install it yourself.)</p>
<h3>What leaves this machine</h3>
<p><b>Nothing you're working on.</b> The only network request is the update check against the
project's GitHub Releases. No analytics, no accounts.</p>
<div class="row"><button class="site">GitHub page</button><button class="primary close">Close</button></div></div>`;
	document.body.appendChild(about);
	const close = () => (about.hidden = true);
	about.querySelector<HTMLButtonElement>(".close")!.onclick = close;
	about.querySelector<HTMLButtonElement>(".site")!.onclick = () => {
		if (opts.live) opts.bridge.openProjectPage();
		else window.open("https://github.com/MrMint/busybodies", "_blank", "noopener");
	};
	about.addEventListener("pointerdown", (e) => e.target === about && close());
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !about.hidden) {
			close();
			e.stopImmediatePropagation();
		}
	}, true);

	// The settings sheet, behind the cog: every setting the app grows goes here.
	const settings = document.createElement("div");
	settings.id = "bb-settings";
	settings.hidden = true;
	settings.setAttribute("role", "dialog");
	settings.setAttribute("aria-label", "Settings");
	settings.innerHTML = `<div class="sheet"><h2>Settings</h2>
<h3 id="bb-theme-label">Theme</h3><div class="choices" role="radiogroup" aria-labelledby="bb-theme-label"></div>
<h3 class="office-label">Office</h3><div class="switches choices"></div>
<div class="row"><button class="close">Done</button></div></div>`;
	const choices = settings.querySelector(".choices")!;
	for (const id of THEME_IDS) {
		const b = document.createElement("button");
		b.className = "choice";
		b.dataset.theme = id;
		b.setAttribute("role", "radio");
		b.innerHTML = "<b></b><span></span>";
		b.querySelector("b")!.textContent = THEME_NAMES[id].name;
		b.querySelector("span")!.textContent = THEME_NAMES[id].note;
		b.onclick = () => {
			// This window switches at once; the app saves the choice and switches the other window.
			opts.theme.set(id);
			if (opts.live) opts.bridge.setTheme(id);
			markTheme();
		};
		choices.appendChild(b);
	}
	const switches = settings.querySelector(".switches")!;
	for (const sw of SWITCHES) {
		const b = document.createElement("button");
		b.className = "choice";
		b.dataset.toggle = sw.key;
		b.setAttribute("role", "switch");
		b.innerHTML = "<b></b><span></span>";
		b.querySelector("b")!.textContent = sw.name;
		b.querySelector("span")!.textContent = sw.note;
		b.onclick = () => {
			const change = { [sw.key]: !opts.toggles.current()[sw.key] };
			// This window switches at once; the app saves it, updates the tray and tells the other window.
			opts.toggles.set(change);
			if (opts.live) opts.bridge.setToggles(change);
			markToggles();
		};
		switches.appendChild(b);
	}
	const markToggles = () => {
		const now = opts.toggles.current();
		for (const b of switches.querySelectorAll<HTMLElement>(".choice")) b.setAttribute("aria-checked", String(now[b.dataset.toggle as "sound" | "calm"]));
	};
	const markTheme = () => {
		for (const b of choices.querySelectorAll<HTMLElement>(".choice")) b.setAttribute("aria-checked", String(b.dataset.theme === opts.theme.current()));
	};
	document.body.appendChild(settings);
	const closeSettings = () => (settings.hidden = true);
	settings.querySelector<HTMLButtonElement>(".close")!.onclick = closeSettings;
	settings.addEventListener("pointerdown", (e) => e.target === settings && closeSettings());
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !settings.hidden) {
			closeSettings();
			e.stopImmediatePropagation();
		}
	}, true);

	let status: Partial<AppStatus> = { version: "dev", homeFound: true, ...opts.status };
	const refreshStatus = async () => {
		if (!opts.live) return;
		try {
			status = { ...status, ...(await opts.bridge.status()), ...opts.status };
		} catch {
			// No answer: keep what we had.
		}
	};

	let sessions = -1;
	const showCard = () => {
		if (status.homeFound === false) {
			card.innerHTML = `<b>No coding agent found</b>Busybodies looks for your coding agent's files in <code></code>.
Start a coding session there, or point <code>BUSYBODIES_AGENT_HOME</code> at the right folder.`;
			card.querySelector("code")!.textContent = status.home ?? "its home folder";
			card.hidden = false;
		} else if (sessions === 0) {
			card.innerHTML = opts.compact
				? "<b>Nobody's in.</b>Start a coding session and someone will take a desk."
				: "<b>Nobody's in.</b>The night watch is napping in the lobby. Start a coding session and someone will turn up and take a desk.";
			card.hidden = false;
		} else card.hidden = true;
	};

	return {
		/** Show the About screen. */
		about() {
			void refreshStatus().then(() => {
				about.querySelector(".v")!.textContent = `Version ${status.version ?? "dev"}`;
				about.hidden = false;
				about.querySelector<HTMLButtonElement>(".close")!.focus();
			});
		},
		/** Show the settings sheet (the cog). */
		settings() {
			markTheme();
			markToggles();
			settings.hidden = false;
			settings.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
		},
		/** The theme changed from elsewhere (the tray menu): keep the sheet's mark right. */
		themeChanged: () => markTheme(),
		/** Sound or calm changed elsewhere (the tray): show it. */
		togglesChanged: () => markToggles(),
		/** Each snapshot: show or hide the empty-state sign. */
		update(snapshot: Snapshot) {
			const n = flat(snapshot.sessions).length;
			if (n === sessions) return;
			sessions = n;
			// The agent's folder may have appeared since: ask again whenever the office empties.
			if (n === 0) void refreshStatus().then(showCard);
			else showCard();
		},
	};
}
