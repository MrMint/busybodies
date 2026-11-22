// The cut-paper kit every theme draws with: flat shapes, thick ink outlines, a soft offset shadow,
// rounded type (after design/boards/FloorBusy). The office's and the factory's own looks are in
// src/scene/theme/; what's here is shared: the ink, the labels and pills over the live scene, and
// the signboard that fits its text. Nothing here is per-frame.
import { BitmapFont, BitmapText, Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import type { SignText } from "../theme/words";
import type { Rect, WallItem } from "./world";

export type { SignText } from "../theme/words";
export type { FurnitureKind } from "../theme/types";

export const INK = 0x1b2140;
export const SHADOW = { color: INK, alpha: 0.14 };
export const SUN = 0xffe500;
export const RED = 0xff6b6b;
export const GREEN = 0x2fcf83;
export const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif';

export const line = (width: number) => ({ width, color: INK, join: "round" as const, cap: "round" as const });
export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** A small, fixed wobble from a seed: -1 to 1. */
export const wob = (seed: number, i: number) => (((seed + i * 2654435761) >>> 0) % 1000) / 500 - 1;

/** A Graphics that always joins the batch: a pile of sheets or a planner of notes is more than the
 * ~200 vertices Pixi batches by default, and each would cost its own draw call (and break the
 * batch around it). They change only when their numbers do, so batching them is cheap. */
export function batched(): Graphics {
	const g = new Graphics();
	g.context.batchMode = "batch";
	return g;
}

export function text(value: string, size: number, opts: TextStyleOptions = {}): Text {
	return new Text({
		text: value,
		style: { fill: INK, fontSize: size, fontWeight: "700", fontFamily: FONT, lineHeight: size * 1.18, ...opts },
	});
}

/**
 * Labels that sit over the live scene (room tabs, desk cards, bubbles) are bitmap text: they all
 * draw from one shared glyph atlas, so they batch with the furniture instead of each bringing its
 * own texture, and changing one redraws no canvas. Glyphs are drawn large (64 px at 2x), so they
 * stay sharp at the desk stop. Text baked into a cached room uses plain Text.
 */
const LABEL_FONTS = { "800": "bb-label-800", "600": "bb-label-600" } as const;
const installed = new Set<string>();

export function label(value: string, size: number, weight: keyof typeof LABEL_FONTS = "800", fill = INK): BitmapText {
	const name = LABEL_FONTS[weight];
	if (!installed.has(name)) {
		BitmapFont.install({
			name,
			style: { fontFamily: FONT, fontSize: 64, fontWeight: weight, fill: 0xffffff },
			chars: [[" ", "~"], "·…‹›×"],
			resolution: 2,
			padding: 8,
		});
		installed.add(name);
	}
	return new BitmapText({ text: value, style: { fontFamily: name, fontSize: size, fill } });
}

// --- Signs ------------------------------------------------------------------------------------

/** How a theme's signs look: their colours, and whatever else it bolts on behind the text. */
export interface SignStyle {
	sign: number;
	/** Every third sign (by seed) is this colour instead. */
	signAlt: number;
	whiteboard: number;
	frame: number;
	/** Extra drawing on the board, after its body and before its text (rivets, stripes). */
	dress?: (g: Graphics, kind: "sign" | "whiteboard" | "frame", x: number, y: number, w: number, h: number) => void;
	/** Where the text starts below the board's top, past any dressing (default: none). */
	top?: number;
}

export const PAPER_SIGNS: SignStyle = { sign: SUN, signAlt: 0xffd0e4, whiteboard: 0xffffff, frame: 0xffffff };

/** A sign, whiteboard or frame with its text, as a container to bake into the room. */
export function signboard(kind: WallItem["kind"], r: Rect, content: SignText | undefined, seed: number, style: SignStyle = PAPER_SIGNS): Container {
	const c = new Container();
	const g = new Graphics();
	c.addChild(g);
	const tilt = kind === "sign" ? ((seed % 5) - 2) * 0.012 : 0;
	c.position.set(r.x + r.w / 2, r.y + r.h / 2);
	c.rotation = tilt;
	const x = -r.w / 2;
	const y = -r.h / 2 + (style.top ?? 0);
	const h = r.h - (style.top ?? 0);
	const fill = kind === "sign" ? (seed % 3 === 1 ? style.signAlt : style.sign) : kind === "whiteboard" ? style.whiteboard : kind === "frame" ? style.frame : 0xffffff;
	if (kind === "sign") g.rect(x + 4, -r.h / 2 + 5, r.w, r.h).fill(SHADOW);
	g.roundRect(x, -r.h / 2, r.w, r.h, kind === "sign" ? 4 : 8).fill(fill).stroke(line(kind === "sign" ? 3 : 5));
	if (kind === "frame") g.roundRect(x + 8, -r.h / 2 + 8, r.w - 16, r.h - 16, 4).stroke({ width: 2, color: INK, alpha: 0.4 });
	if (style.dress && (kind === "sign" || kind === "whiteboard" || kind === "frame")) style.dress(g, kind, x, -r.h / 2, r.w, r.h);
	const pad = kind === "sign" ? 8 : 12;
	if (content) {
		// Shrink the text until it fits the board.
		const big = kind === "whiteboard" ? 16 : 13;
		for (let size = big; ; size -= 1) {
			const t = text(content.title, size, { fontWeight: "800", wordWrap: true, wordWrapWidth: r.w - pad * 2 });
			t.position.set(x + pad, y + pad - 3);
			const b = content.body ? text(content.body, size * 0.8, { fontWeight: "600", wordWrap: true, wordWrapWidth: r.w - pad * 2 }) : undefined;
			b?.position.set(x + pad, t.y + t.height);
			const height = t.height + (b?.height ?? 0);
			if (height <= h - pad * 1.5 || size <= 8) {
				c.addChild(t);
				if (b) c.addChild(b);
				break;
			}
			t.destroy();
			b?.destroy();
		}
	} else {
		// No text yet: a few scribbled lines, so an empty slot still reads as a board or a note.
		const colours = kind === "whiteboard" ? [GREEN, RED, 0xc5cbe0] : [INK, INK];
		colours.forEach((col, i) => {
			const lw = (r.w - pad * 2) * (0.9 - ((seed + i) % 3) * 0.15);
			g.roundRect(x + pad, y + pad + 4 + i * 14, lw, 6, 3).fill({ color: col, alpha: kind === "whiteboard" ? 1 : 0.25 });
		});
	}
	return c;
}

// --- Labels -----------------------------------------------------------------------------------

/** A pill label: white, rounded ends, ink border. */
export function pill(value: string, size: number, fill = 0xffffff): Container {
	const c = new Container();
	const t = label(value, size, "800");
	const g = new Graphics()
		.roundRect(0, 0, t.width + size * 1.4, t.height + size * 0.45, (t.height + size * 0.45) / 2)
		.fill(fill)
		.stroke(line(3));
	t.position.set(size * 0.7, size * 0.2);
	c.addChild(g, t);
	return c;
}

/** The dark name tab on a room's corner. */
export function nameTab(value: string): Container {
	const c = new Container();
	const t = label(value, 30, "800", 0xffffff);
	const g = new Graphics().roundRect(0, 0, t.width + 28, t.height + 14, 12).fill(INK);
	t.position.set(14, 6);
	c.addChild(g, t);
	c.rotation = -0.035;
	return c;
}
