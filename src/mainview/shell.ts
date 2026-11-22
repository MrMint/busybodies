// The app around the scene, in plain DOM: the About screen and the empty states. In the app it
// talks to the Bun process through `bridge`; in a browser (?demo) there is no bridge and it shows
// what it can. Fixtures: ?demo=empty (nobody's in), ?demo=nohome (no coding agent found), ?about.
import type { AppStatus } from "../shared/rpc";
import type { Session, Snapshot } from "../watcher/model";

/** What the shell can ask of the Bun process. */
export interface Bridge {
	status(): Promise<AppStatus>;
	setCompact(on: boolean): void;
	showOffice(): void;
	openProjectPage(): void;
}

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
`;

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

export function installShell(opts: {
	bridge: Bridge;
	/** Connected to the Bun process (not a demo or a replay): the bridge answers. */
	live: boolean;
	compact: boolean;
	/** Overrides for fixtures. */
	status?: Partial<AppStatus>;
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
