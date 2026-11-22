// The top bar, in plain DOM over the canvas: the time, a head count, and the camera buttons. Keys:
// Escape, 0 or Home for the whole office; n or → for the next room; p or ← for the previous one.
// Being DOM, it costs the scene no frames.
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
 padding:5px 14px;cursor:pointer;box-shadow:2px 3px 0 #1b2140}
#hud button.on{background:#1b2140;color:#fff}
@media (max-width:640px){#hud .pill.count{display:none}}
`;

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

export function installHud(office: Office) {
	const style = document.createElement("style");
	style.textContent = CSS;
	document.head.appendChild(style);
	const bar = document.createElement("div");
	bar.id = "hud";
	bar.innerHTML = `<span class="brand">Busybodies</span><span class="pill clock"></span><span class="pill count"></span><span class="pill waiting" hidden></span>
<span class="gap"></span><button class="all">Whole office</button><button class="prev" aria-label="Previous room">‹</button><button class="next">Next room ›</button>`;
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
