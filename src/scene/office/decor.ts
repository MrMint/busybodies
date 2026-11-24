// The office remembers: draws what decor-plan.ts says each wall shows (framed PRs, bunting, stars).
// Pixi lives here only, so the plan's unit tests run without it.
import { Container, Graphics } from "pixi.js";
export * from "./decor-plan";
import { DECOR, type RoomDecor, type StoryStyle, type StoryView, decorFor, storyStyle } from "./decor-plan";
import type { SceneTheme } from "../theme/types";
import type { World } from "./world";

function star(g: Graphics, x: number, y: number, r: number, fill: number, ink: number): void {
	const pts: number[] = [];
	for (let i = 0; i < 10; i++) {
		const a = -Math.PI / 2 + (i * Math.PI) / 5;
		const rr = i % 2 ? r * 0.45 : r;
		pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
	}
	g.poly(pts).fill(fill).stroke({ width: 1, color: ink });
}

/** A room's decor, drawn. */
function drawDecor(d: RoomDecor, style: StoryStyle, seed: number): Graphics {
	const g = new Graphics();
	const { w, h } = DECOR.frame;
	for (const [i, f] of d.frames.entries()) {
		const tilt = ((seed + i * 7) % 5) - 2;
		const y = f.y + tilt * 0.3;
		// A gilt edge, a mat, and a merge mark: two branches meeting.
		g.roundRect(f.x, y, w, h, 2).fill(style.gold).stroke({ width: 1.5, color: style.ink });
		g.rect(f.x + 3, y + 3, w - 6, h - 6).fill(style.mat).stroke({ width: 0.8, color: style.ink, alpha: 0.5 });
		const cx = f.x + w / 2;
		const cy = y + h / 2;
		g.moveTo(cx - 3, cy + 5).lineTo(cx - 3, cy - 5).moveTo(cx - 3, cy + 2).quadraticCurveTo(cx + 3, cy + 1, cx + 3, cy - 5).stroke({ width: 1.6, color: style.mark });
		for (const [px, py] of [[cx - 3, cy + 5], [cx + 3, cy - 5], [cx - 3, cy - 5]] as const) g.circle(px, py, 1.8).fill(style.mark);
	}
	if (d.pennants.length) {
		const first = d.pennants[0]!;
		const last = d.pennants[d.pennants.length - 1]!;
		g.moveTo(first.x - 8, first.y).quadraticCurveTo((first.x + last.x) / 2, first.y + 3, last.x + 8, last.y).stroke({ width: 1, color: style.ink, alpha: 0.6 });
		for (const [i, p] of d.pennants.entries()) {
			const pw = DECOR.pennant.w / 2;
			g.poly([p.x - pw, p.y, p.x + pw, p.y, p.x, p.y + DECOR.pennant.h]).fill(style.pennants[i % style.pennants.length]!).stroke({ width: 0.8, color: style.ink, alpha: 0.5 });
		}
	}
	for (const st of d.stars) star(g, st.x, st.y, 6, style.gold, style.ink);
	return g;
}

/** The wall layer's decor: a Graphics per decorated room, rebuilt when its decor changes. */
export class DecorLayer extends Container {
	#rooms = new Map<string, { view: Graphics; sig: string }>();

	constructor() {
		super({ label: "decor" });
	}

	/** Bring the decor up to date. True when anything was redrawn. */
	update(world: World, theme: SceneTheme, view: StoryView | undefined): boolean {
		const style = storyStyle(theme);
		const seen = new Set<string>();
		let changed = false;
		for (const a of world.areas) {
			const d = decorFor(a, view);
			if (!d) continue;
			seen.add(a.id);
			const sig = `${theme.id}|${JSON.stringify(d)}`;
			const had = this.#rooms.get(a.id);
			if (had?.sig === sig) continue;
			had?.view.destroy();
			const g = drawDecor(d, style, a.hue);
			this.addChild(g);
			this.#rooms.set(a.id, { view: g, sig });
			changed = true;
		}
		for (const [id, r] of this.#rooms) {
			if (seen.has(id)) continue;
			r.view.destroy();
			this.#rooms.delete(id);
			changed = true;
		}
		return changed;
	}

	/** Each decorated room's decor, for the inspector. */
	info(world: World | undefined, view: StoryView | undefined): RoomDecor[] {
		return (world?.areas ?? []).map((a) => decorFor(a, view)).filter((d): d is RoomDecor => !!d);
	}

	/** A theme switch: everything is drawn again. */
	clear(): void {
		for (const r of this.#rooms.values()) r.view.destroy();
		this.#rooms.clear();
	}
}
