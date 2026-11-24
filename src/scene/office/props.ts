// Metrics as things (plan-next stream B): the director passes numbers (director/metrics.ts), the
// theme paints them (src/scene/theme/, its `desk` painters), and this composes a desk's props and
// says when they redraw. Desk props are drawn around the desk front's centre; propspots.ts says
// where each goes.
import { Container } from "pixi.js";
import type { DeskProps, PlannerRow } from "../contract";
import type { SceneTheme } from "../theme/types";

/** Everything a desk's metrics draw, split into what reads at any zoom (the pile, the lamp) and the
 * small things that only show zoomed in (mugs, drawers, skip). */
export function deskProps(theme: SceneTheme, p: DeskProps, seed: string): { always: Container; detail: Container } {
	const always = new Container();
	const detail = new Container();
	const d = theme.desk;
	if (p.tray) always.addChild(d.tray(p.tray, seed));
	if (p.lamp) always.addChild(d.lamp(p.lamp));
	if (p.mugs > 0) detail.addChild(d.mugs(p.mugs));
	if (p.drawers) detail.addChild(d.drawers(p.drawers.drawers, p.drawers.full));
	if (p.skip > 0) detail.addChild(d.skip(p.skip));
	return { always, detail };
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
			].join("/")
		: "";

export const plannerSig = (rows: PlannerRow[] | undefined): string => (rows ?? []).map((r) => `${r.session}:${r.pending},${r.active},${r.done}`).join(";");
