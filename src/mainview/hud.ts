// The top bar, in plain DOM over the canvas: the time, a head count, and the camera buttons. Keys:
// Escape, 0 or Home for the whole office; n or → for the next room; p or ← for the previous one.
// Being DOM, it costs the scene no frames. In compact mode it is a slim strip you drag the
// frameless window by, with buttons to open the full office or hide the compact one.
import type { Office } from "../scene/office/office";
import { crewOf } from "../scene/office/placement";
import type { Session, Snapshot } from "../watcher/model";

const CSS = `
#hud{position:fixed;left:0;right:0;top:0;height:56px;display:flex;align-items:center;gap:10px;padding:0 16px;
 font:700 14px ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#1b2140;pointer-events:none;z-index:2}
#hud .brand{background:#1b2140;color:#fff;font-size:20px;font-weight:800;padding:5px 14px 7px;border-radius:12px;transform:rotate(-2deg)}
#hud .pill{background:#fff;border:3px solid #1b2140;border-radius:999px;padding:3px 12px;white-space:nowrap}
#hud .gap{flex:1}
#hud .waiting{background:#ffd23f;animation:bb-wait 1.2s ease-in-out infinite alternate}
#hud .waiting[hidden]{display:none}
@keyframes bb-wait{from{transform:scale(1)}to{transform:scale(1.06)}}
@media (prefers-reduced-motion:reduce){#hud .waiting{animation:none}}
#hud button{pointer-events:auto;font:inherit;color:inherit;background:#fff;border:3px solid #1b2140;border-radius:999px;
 padding:5px 14px;cursor:pointer;box-shadow:2px 3px 0 #1b2140;white-space:nowrap;flex:none}
#hud button.on{background:#1b2140;color:#fff}
@media (max-width:960px){#hud .pill.count{display:none}}
@media (max-width:760px){#hud .pill.clock{display:none}#hud .next{font-size:0}#hud .next::after{content:"›";font-size:14px}}
#hud .icon{padding:5px 11px}
#hud.compact{height:34px;gap:6px;padding:0 6px 0 10px;pointer-events:auto;cursor:grab;font-size:12px}
#hud.compact .brand{font-size:13px;padding:2px 9px 4px;border-radius:8px}
#hud.compact .pill{border-width:2px;padding:1px 8px}
#hud.compact button{border-width:2px;padding:2px 9px;box-shadow:1px 2px 0 #1b2140}
#hud.compact .clock,#hud.compact .all,#hud.compact .prev,#hud.compact .next,#hud.compact .about,#hud.compact .settings{display:none}
#hud:not(.compact) .expand,#hud:not(.compact) .hide{display:none}
`;

export interface HudOptions {
	/** The compact floating window's strip. */
	compact?: boolean;
	about?: () => void;
	/** Open the settings sheet (the cog). */
	settings?: () => void;
	/** Compact only: open the full office. */
	expand?: () => void;
	/** Compact only: hide the compact window. */
	hide?: () => void;
}

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

export function installHud(office: Office, opts: HudOptions = {}) {
	const style = document.createElement("style");
	style.textContent = CSS;
	document.head.appendChild(style);
	const bar = document.createElement("div");
	bar.id = "hud";
	bar.innerHTML = `<span class="brand">Busybodies</span><span class="pill clock"></span><span class="pill count"></span><span class="pill waiting" hidden></span>
<span class="gap"></span><button class="all">Whole office</button><button class="prev" aria-label="Previous room">‹</button><button class="next">Next room ›</button>
<button class="settings icon" aria-label="Settings" title="Settings">⚙</button><button class="about icon" aria-label="About Busybodies">?</button><button class="expand" title="Open the full office">Office ⤢</button><button class="hide" aria-label="Hide the compact window">×</button>`;
	if (opts.compact) {
		// Electrobun drags a frameless window by elements with this class; buttons opt out.
		bar.classList.add("compact", "electrobun-webkit-app-region-drag");
		for (const b of bar.querySelectorAll("button")) b.classList.add("electrobun-webkit-app-region-no-drag");
	}
	document.body.appendChild(bar);
	const $ = (sel: string) => bar.querySelector(sel) as HTMLElement;
	// Snapshots arrive many times a second; touching the DOM only on a real change keeps the
	// webview from re-laying out the bar each time.
	const set = (sel: string, value: string) => {
		const el = $(sel);
		if (el.textContent !== value) el.textContent = value;
	};

	const sync = () => {
		const on = office.stop.kind === "office";
		if ($(".all").classList.contains("on") !== on) $(".all").classList.toggle("on", on);
	};
	$(".all").onclick = () => (office.goTo({ kind: "office" }), sync());
	$(".next").onclick = () => (office.nextRoom(1), sync());
	$(".prev").onclick = () => (office.nextRoom(-1), sync());
	$(".about").onclick = () => opts.about?.();
	$(".settings").onclick = () => opts.settings?.();
	$(".expand").onclick = () => opts.expand?.();
	$(".hide").onclick = () => opts.hide?.();
	window.addEventListener("keydown", (e) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === "Escape" || e.key === "0" || e.key === "Home") office.goTo({ kind: "office" });
		else if (e.key === "n" || e.key === "ArrowRight") office.nextRoom(1);
		else if (e.key === "p" || e.key === "ArrowLeft") office.nextRoom(-1);
		else return;
		e.preventDefault();
		sync();
	});
	window.addEventListener("pointerup", () => setTimeout(sync));

	return {
		/** The top pill: how many sessions are waiting on you. Hidden when none are. */
		waiting(n: number) {
			const el = $(".waiting");
			if (el.hidden !== (n === 0)) el.hidden = n === 0;
			set(".waiting", n === 1 ? "1 waiting on you" : `${n} waiting on you`);
		},
		update(snapshot: Snapshot) {
			const sessions = flat(snapshot.sessions);
			const out = sessions.reduce((n, s) => n + crewOf(s.agents).filter((a) => a.status === "running").length, 0);
			const t = new Date(snapshot.at);
			set(".clock", `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
			set(".count", `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${out} agent${out === 1 ? "" : "s"} out`);
			sync();
		},
	};
}
