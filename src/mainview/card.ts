// The card a click on a character opens, at a room or desk stop: who it is, what it was asked to
// do, what it is doing right now, how full its context is (and so how plum it is), how hard it is
// working, what it has changed, and who spawned it. Plain DOM beside the character, so it costs the
// scene no frames; it follows the character on each redraw and closes on Escape or a click
// elsewhere. Counts and kinds only, as everywhere: the task is the one line of text.
import type { Dossier } from "../scene/director/doing";
import type { Office } from "../scene/office/office";
import { ranFor } from "../shared/time";

const CSS = `
#bb-card{position:fixed;z-index:3;width:250px;background:#fffdf6;border:3px solid #1b2140;border-radius:16px;box-shadow:3px 4px 0 #1b2140;
 padding:12px 14px 12px;font:600 12.5px/1.35 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#1b2140;pointer-events:auto}
#bb-card[hidden]{display:none}
#bb-card .head{display:flex;align-items:center;gap:6px;margin-bottom:6px}
#bb-card .role{background:#1b2140;color:#fff;font-weight:800;padding:2px 9px 3px;border-radius:999px;text-transform:capitalize}
#bb-card .fam{border:2px solid #1b2140;border-radius:999px;padding:0 7px;font-weight:700}
#bb-card .x{margin-left:auto;border:0;background:none;font:800 16px/1 inherit;cursor:pointer;color:#1b2140;padding:0 2px}
#bb-card .task{font-weight:800;font-size:14px;margin:2px 0 8px}
#bb-card .row{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-top:1.5px dashed #d9d3c3}
#bb-card .row b{font-weight:800;text-align:right}
#bb-card .meter{height:9px;border:2px solid #1b2140;border-radius:999px;margin:3px 0 6px;overflow:hidden;background:#fff}
#bb-card .meter i{display:block;height:100%;background:#8fd19e}
#bb-card .meter.g2 i{background:#ffc94d}
#bb-card .meter.g3 i{background:#b07cff}
#bb-card .quip{margin-top:7px;font-style:italic;color:#5b6180}
`;

/** What a plum says about itself, by plump level. */
const PLUM = ["Fresh as a daisy.", "Getting comfortable.", "Feeling a bit round.", "Juicy. Very juicy. Do not squeeze."];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function installCard(office: Office, dossier: (key: string) => Dossier | undefined, now: () => number) {
	const style = document.createElement("style");
	style.textContent = CSS;
	document.head.appendChild(style);
	const el = document.createElement("div");
	el.id = "bb-card";
	el.hidden = true;
	document.body.appendChild(el);
	let key: string | undefined;

	const close = () => {
		if (key) office.highlight(undefined);
		key = undefined;
		el.hidden = true;
	};
	el.addEventListener("click", (e) => {
		if ((e.target as HTMLElement).closest(".x")) close();
		e.stopPropagation();
	});
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape") close();
	});

	const render = () => {
		if (!key) return;
		const d = dossier(key);
		const at = office.screenOf(key);
		if (!d || !at || office.stop.kind === "office") return close();
		const rows: [string, string][] = [];
		const doing = d.doing.word + (d.doing.since !== undefined && d.doing.long ? ` · ${ranFor(now() - d.doing.since)}` : "");
		rows.push(["Doing", doing]);
		if (d.calls !== undefined) rows.push(["Tool calls (recent)", `${d.calls}${d.errors ? ` · ${d.errors} failed` : ""}`]);
		if (d.files !== undefined) rows.push(["Changed", `${d.files} file${d.files === 1 ? "" : "s"} · +${d.added} −${d.removed}`]);
		if (d.failStreak) rows.push(["Red streak", `${d.failStreak} in a row`]);
		if (d.crew) rows.push(["Its crew out", String(d.crew)]);
		if (d.boss) rows.push(["Spawned by", d.boss.role === "lead" ? `the lead · ${d.boss.task}` : `${d.boss.role} · ${d.boss.task}`]);
		if (d.depth && d.depth > 1) rows.push(["Depth", `${d.depth} levels down`]);
		if (d.age !== undefined) rows.push(["Going for", ranFor(d.age)]);
		const pct = d.context !== undefined ? Math.round(d.context * 100) : undefined;
		el.innerHTML = `<div class="head"><span class="role">${esc(d.kind === "lead" ? "lead" : d.role)}</span>${`<span class="fam">${esc(d.family ?? "model unknown")}</span>`}<button class="x" aria-label="Close">×</button></div>
<div class="task">${esc(d.task || "(no task)")}</div>
${
	pct !== undefined
		? `<div class="row"><span>Context</span><b>${pct}% full</b></div><div class="meter g${d.plump ?? 0}"><i style="width:${pct}%"></i></div>`
		: ""
}
${rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
${d.plump !== undefined ? `<div class="quip">${PLUM[d.plump]}</div>` : ""}`;
		el.hidden = false;
		// Beside the character, on whichever side has room; kept inside the window.
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		const right = at.x + at.size * 0.7 + 12;
		const x = right + w < window.innerWidth - 8 ? right : at.x - at.size * 0.7 - 12 - w;
		const y = Math.min(window.innerHeight - h - 8, Math.max(64, at.y - at.size - h / 2));
		el.style.left = `${Math.max(8, x)}px`;
		el.style.top = `${y}px`;
	};

	return {
		/** Open the card for a character (or close it: undefined). */
		show(k: string | undefined) {
			if (!k) return close();
			key = k;
			office.highlight(k);
			render();
		},
		/** Redraw: new facts, or the character or camera moved. */
		update: render,
		get open() {
			return key;
		},
	};
}
