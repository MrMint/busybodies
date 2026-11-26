// Metrics as things (plan-next stream B): the director passes numbers (director/metrics.ts), the
// theme paints them (src/scene/theme/, its `desk` painters), and this composes a desk's props and
// says when they redraw. Desk props are drawn around the desk front's centre; propspots.ts says
// where each goes.
import { Container, type Graphics } from "pixi.js";
import type { DeskProps, PlannerRow, WebCorner } from "../contract";
import type { SceneTheme } from "../theme/types";
import { web } from "../rig/data/web";
import { COBWEB_CORNERS } from "../world/propspots";
import { INK, batched } from "./paper";

/** Everything a desk's metrics draw, split into what reads at any zoom (the pile, the lamp) and the
 * small things that only show zoomed in (mugs, drawers, skip, a cobweb). `over` goes over the name
 * card: a treat sits right behind the card's top edge and would hide behind it. */
export function deskProps(theme: SceneTheme, p: DeskProps, seed: string): { always: Container; detail: Container; over: Container } {
	const always = new Container();
	const detail = new Container();
	const over = new Container();
	const d = theme.desk;
	if (p.tray) always.addChild(d.tray(p.tray, seed));
	if (p.lamp) always.addChild(d.lamp(p.lamp));
	if (p.mugs > 0) detail.addChild(d.mugs(p.mugs));
	if (p.drawers) detail.addChild(d.drawers(p.drawers.drawers, p.drawers.full));
	if (p.skip > 0) detail.addChild(d.skip(p.skip));
	// A treat reads at any zoom: it's news. A cobweb is a detail you find zoomed in.
	if (p.treat) over.addChild(d.treat(p.treat));
	if (p.cobweb) detail.addChild(cobweb(p.cobweb));
	return { always, detail, over };
}

/** Silk, pale so it reads on a dark screen and on a desk front alike. */
const SILK = 0xf2f4fa;

/** A long-idle desk's cobweb, in the rig's cobweb style (rig/data/web.ts), strung in a corner of its
 * screen or desk (propspots.ts COBWEB_CORNERS). Static: nothing on it moves. */
function cobweb(corner: WebCorner): Graphics {
	const c = COBWEB_CORNERS[corner];
	// The spider hangs from the web's outer ring, on the side away from the corner's wall.
	const out = Math.cos(c.from + Math.PI / 4) < 0 ? -1 : 1;
	const w = web(c.x, c.y, c.r, c.from, Math.PI / 2, { dx: out * 0.45, dy: 0.5, drop: 0.45, r: 1.7 });
	const g = batched();
	const silk = { color: SILK, alpha: 0.9, cap: "round" as const, join: "round" as const };
	for (const s of w.spokes) g.poly(s, false).stroke({ ...silk, width: 0.9 });
	for (const r of w.rings) g.poly(r, false).stroke({ ...silk, width: 0.8 });
	g.poly(w.thread!, false).stroke({ ...silk, width: 0.7 });
	g.circle(w.spider!.x, w.spider!.y, w.spider!.r).fill(INK).stroke({ color: SILK, width: 0.6, alpha: 0.8 });
	return g;
}

/** The signature a desk's props redraw on. */
export const propsSig = (p: DeskProps | undefined): string =>
	p
		? [
				p.tray ? `${p.tray.sheets},${p.tray.spill},${p.tray.buried},${!!p.tray.out},${!!p.tray.rig}` : "",
				p.word ?? "",
				p.drawers ? `${p.drawers.drawers},${p.drawers.full}` : "",
				p.skip,
				p.mugs,
				p.lamp ?? "",
				p.treat ?? "",
				p.cobweb ?? "",
			].join("/")
		: "";

export const plannerSig = (rows: PlannerRow[] | undefined): string => (rows ?? []).map((r) => `${r.session}:${r.pending},${r.active},${r.done}`).join(";");
