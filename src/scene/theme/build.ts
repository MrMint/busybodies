// The crew's build on a desk, for any theme: a stack three wide, each course a little off the
// last, a knocked-off piece lying beside it after a red test, and a flag on top once the PR is up.
// The theme paints one piece (a brick, a crate) and the flag; the stacking is the same everywhere.
// Drawn once per change, as part of the desk. The newest piece and the fallen one are their own
// Graphics, centred on themselves, so the office moves them by their transform (set down, or
// tumbling off) without redrawing anything.
import { Container, Graphics } from "pixi.js";
import { hash } from "../office/paper";
import { BUILD } from "../office/world";
import type { CrewBuild, DrawnBuild } from "./types";

export interface BuildPainter {
	/** One piece with its top-left at (x, y), `w` by `h`; `k` picks its shade (from the seed). */
	piece(g: Graphics, x: number, y: number, w: number, h: number, k: number): void;
	/** The flag (or whatever marks a PR) planted at `top`, the middle of the top course. */
	flag(g: Graphics, top: { x: number; y: number }): void;
}

/** Where a fallen piece comes to rest: lying on the desk top just right of the stack. */
export const FALLEN = { x: BUILD.left + BUILD.wide * BUILD.brickW + 3 + 4 + BUILD.brickH / 2, y: BUILD.floor - BUILD.brickW / 2 };

export function crewBuild(b: CrewBuild, seed: string, paint: BuildPainter): DrawnBuild {
	const view = new Container();
	const g = new Graphics();
	view.addChild(g);
	const { brickW: W, brickH: H, wide: WIDE, left, floor } = BUILD;
	const k = (i: number) => hash(seed) + i * 3;
	// Every other course sits a little to one side, as stacked bricks do.
	const at = (i: number) => {
		const row = Math.floor(i / WIDE);
		return { x: left + (i % WIDE) * W + (row % 2 ? 3 : 0), y: floor - (row + 1) * H };
	};
	const piece = (i: number) => {
		const p = new Graphics();
		paint.piece(p, -W / 2, -H / 2, W, H, k(i));
		return p;
	};
	let top: { x: number; y: number } = { x: left + (WIDE * W) / 2, y: floor };
	let last: Graphics | undefined;
	for (let i = 0; i < b.pieces; i++) {
		const { x, y } = at(i);
		const row = Math.floor(i / WIDE);
		if (i < b.pieces - 1) paint.piece(g, x, y, W, H, k(i));
		else {
			last = piece(i);
			last.position.set(x + W / 2, y + H / 2);
		}
		if (i % WIDE === Math.min(WIDE, b.pieces - row * WIDE) >> 1 || i === 0) top = { x: x + W / 2, y };
	}
	if (last) view.addChild(last);
	let fallen: Graphics | undefined;
	let fellFrom: { x: number; y: number } | undefined;
	if (b.fellAt !== undefined) {
		// The one that fell: tipped over on the desk beside the stack, from where it sat on top.
		fallen = piece(b.pieces);
		const from = at(b.pieces);
		fellFrom = { x: from.x + W / 2, y: from.y + H / 2 };
		fallen.position.set(FALLEN.x, FALLEN.y);
		fallen.rotation = Math.PI / 2;
		view.addChild(fallen);
	}
	if (b.topped) {
		const f = new Graphics();
		paint.flag(f, top);
		view.addChild(f);
	}
	return { view, top: last, fallen, fellFrom };
}

/** Where the top of a build is, from the desk front's centre: for an arm setting a piece on, or
 * picking the PR's crate off. Pixi-free arithmetic over BUILD. */
export function buildTop(pieces: number): { x: number; y: number } {
	const { brickW: W, brickH: H, wide: WIDE, left, floor } = BUILD;
	const i = Math.max(0, pieces - 1);
	const row = Math.floor(i / WIDE);
	return { x: left + (i % WIDE) * W + (row % 2 ? 3 : 0) + W / 2, y: floor - (row + 1) * H };
}
