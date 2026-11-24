// A regular's accessories (rig/data/roles.ts REGULAR_WEAR): small things worn on the face or pinned to
// the body, so a regular you'd recognise has something of its own besides its name. Painted in the
// paper rig's style (ink outlines, flat fills) for every theme alike: each is small, sits clear of
// where the costumes go (the hat on the dome, the front piece down the middle) and keeps to neutral
// colours, so it reads over the office's suits, the factory's hi-vis and the bakery's whites.
// Painters draw in the body's space (vocab.ts: 100 wide, the base at y = 0), like `wear/glasses`.
import type { Graphics } from "pixi.js";
import { ANCHORS } from "./data/reach";
import type { Painter, Palette } from "./theme";

/** The accessories, by atlas part name. */
export const ACCESSORIES = ["wear/flower", "wear/earrings", "wear/freckles", "wear/pin", "wear/plaster"] as const;

/** A daisy's petals and middle, and the other small colours: picked to sit on any costume. */
const PETAL = 0xffffff;
const GOLD = 0xf2bd3c;
const PIN = 0xff6f61;
const PLASTER = 0xf3cf9f;
const FRECKLE = 0xb5754a;

export function paintAccessories(parts: Record<string, Painter>, p: Palette): void {
	const ink = p.ink;
	const A = ANCHORS;

	// A daisy tucked in at the side of the head, up and out from the right eye (clear of it and the
	// brow), below where a hat's brim comes.
	parts["wear/flower"] = (g: Graphics) => {
		const cx = 39;
		const cy = -58;
		for (let k = 0; k < 5; k++) {
			const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
			g.ellipse(cx + Math.cos(a) * 4.6, cy + Math.sin(a) * 4.6, 3.4, 3.4)
				.fill(PETAL)
				.stroke({ width: 1.5, color: ink });
		}
		g.circle(cx, cy, 2.8).fill(p.sun).stroke({ width: 1.4, color: ink });
		// A leaf, tucked behind.
		g.ellipse(cx + 3, cy + 7.5, 3.6, 1.8)
			.fill(p.go)
			.stroke({ width: 1.2, color: ink });
	};

	// Small gold hoops at either side of the head, just above the shoulders.
	parts["wear/earrings"] = (g: Graphics) => {
		for (const s of [-1, 1]) {
			g.circle(s * 47.5, -40, 3.4).stroke({ width: 3.4, color: ink });
			g.circle(s * 47.5, -40, 3.4).stroke({ width: 1.8, color: GOLD });
		}
	};

	// Freckles across the cheeks (under the blush, which is tinted over them per frame).
	parts["wear/freckles"] = (g: Graphics) => {
		for (const s of [-1, 1]) {
			for (const [dx, dy] of [
				[-4, -5],
				[1, -6.5],
				[5, -4.5],
				[-1, -2],
			] as const)
				g.circle(s * (A.cheekX - 2 + dx * s), A.cheekY + dy, 1.05);
		}
		g.fill({ color: FRECKLE, alpha: 0.75 });
	};

	// A round enamel pin with a little heart, low on the body's left, clear of the front piece and
	// below the cheek.
	parts["wear/pin"] = (g: Graphics) => {
		const cx = -28;
		const cy = -10;
		g.circle(cx, cy, 5.6).fill(PIN).stroke({ width: 1.8, color: ink });
		g.circle(cx - 1.3, cy - 1.2, 1.5)
			.circle(cx + 1.3, cy - 1.2, 1.5)
			.fill(0xffffff);
		g.poly([cx - 2.7, cy - 0.6, cx + 2.7, cy - 0.6, cx, cy + 2.6]).fill(0xffffff);
	};

	// A sticking plaster at a slant on the forehead, above the right brow (the brow still shows).
	parts["wear/plaster"] = (g: Graphics) => {
		const cx = 20;
		const cy = -62;
		const a = -0.45;
		const c = Math.cos(a);
		const s = Math.sin(a);
		const pt = (x: number, y: number) => [cx + x * c - y * s, cy + x * s + y * c] as const;
		const box = (w: number, h: number) => [...pt(-w, -h), ...pt(w, -h), ...pt(w, h), ...pt(-w, h)];
		g.poly(box(8, 3)).fill(PLASTER).stroke({ width: 1.5, color: ink, join: "round" });
		g.poly(box(2.6, 3)).fill({ color: 0xffffff, alpha: 0.55 });
		for (const x of [-5.4, 5.4]) g.circle(...pt(x, 0), 0.6).fill({ color: ink, alpha: 0.45 });
	};
}
