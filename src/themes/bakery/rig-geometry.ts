// Shapes the bakery's rig repaints are built from: polygon clipping, icing bands and drips,
// sprinkles and gloss. Pure geometry plus a few Graphics helpers. Split out of rig.ts.
import type { Graphics } from "pixi.js";
import { rotRect } from "../../scene/rig/theme";

/** Sprinkle colours. */
export const SPRINKLES = [0xff5c9a, 0xffd23f, 0x3d9bff, 0x2ecc71, 0xffffff, 0xb07ae8, 0xff8a1f] as const;

/** Clip a polygon to a convex one (Sutherland-Hodgman), both as flat [x, y, ...] lists. */
function clipConvex(subject: number[], clip: number[]): number[] {
	type P = [number, number];
	const pts = (a: number[]) => {
		const r: P[] = [];
		for (let i = 0; i < a.length; i += 2) r.push([a[i]!, a[i + 1]!]);
		return r;
	};
	const C = pts(clip);
	let area = 0;
	for (let i = 0; i < C.length; i++) {
		const a = C[i]!;
		const b = C[(i + 1) % C.length]!;
		area += a[0] * b[1] - b[0] * a[1];
	}
	const s = Math.sign(area) || 1;
	let out = pts(subject);
	for (let i = 0; i < C.length && out.length; i++) {
		const a = C[i]!;
		const b = C[(i + 1) % C.length]!;
		const side = (q: P) => s * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
		const cut = (q: P, r: P): P => {
			const t = side(q) / (side(q) - side(r));
			return [q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t];
		};
		const was = out;
		out = [];
		for (let j = 0; j < was.length; j++) {
			const q = was[j]!;
			const r = was[(j + 1) % was.length]!;
			const qi = side(q) >= 0;
			const ri = side(r) >= 0;
			if (ri) {
				if (!qi) out.push(cut(q, r));
				out.push(r);
			} else if (qi) out.push(cut(q, r));
		}
	}
	return out.flat();
}

/** Stripes across a convex region: `dir` "v" (leaning `lean` per unit of height) or "h". */
export function bands(g: Graphics, region: number[], color: number, step: number, w: number, dir: "v" | "h", lean = 0, alpha = 1) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (let i = 0; i < region.length; i += 2) {
		x0 = Math.min(x0, region[i]!);
		x1 = Math.max(x1, region[i]!);
		y0 = Math.min(y0, region[i + 1]!);
		y1 = Math.max(y1, region[i + 1]!);
	}
	const h = y1 - y0;
	const stripe: number[][] = [];
	if (dir === "v") for (let k = x0 - Math.abs(lean) * h - step; k < x1 + Math.abs(lean) * h; k += step) stripe.push([k, y1, k + w, y1, k + w + lean * h, y0, k + lean * h, y0]);
	else for (let k = y0 + step / 2 - w / 2; k < y1; k += step) stripe.push([x0, k, x1, k, x1, k + w, x0, k + w]);
	for (const s of stripe) {
		const c = clipConvex(s, region);
		if (c.length >= 6) g.poly(c).fill({ color, alpha });
	}
}

/** The cut-paper gloss: a soft white highlight. */
export const gloss = (g: Graphics, x: number, y: number, rx: number, ry: number, alpha = 0.6) => g.ellipse(x, y, rx, ry).fill({ color: 0xffffff, alpha });

/** Sprinkles scattered in a box (deterministic from `seed`), skipping any point `keep` refuses. */
export function sprinkles(g: Graphics, x0: number, y0: number, x1: number, y1: number, n: number, seed: number, size = 1, keep?: (x: number, y: number) => boolean) {
	for (let i = 0; i < n; i++) {
		const k = i * 37 + seed * 11 + 5;
		const x = x0 + (((k * 29) % 97) / 97) * (x1 - x0);
		const y = y0 + (((k * 53) % 89) / 89) * (y1 - y0);
		if (keep && !keep(x, y)) continue;
		g.poly(rotRect(x, y, 3 * size, 1.2 * size, (k % 7) * 0.45)).fill(SPRINKLES[(i + seed) % SPRINKLES.length]!);
	}
}

/** Icing along `y` from `x0` to `x1`, hanging in drips of the given lengths; outlined as one piece. */
export function drips(g: Graphics, x0: number, x1: number, y: number, color: number, lengths: number[], ink: number, r = 2, top = 2) {
	const pts: number[] = [x1, y - top, x0, y - top, x0, y + 1];
	const n = lengths.length;
	for (let i = 0; i < n; i++) {
		const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
		const L = lengths[i]!;
		pts.push(x - r, y + 1, x - r, y + L);
		for (let k = 1; k < 6; k++) {
			const t = (k / 6) * Math.PI;
			pts.push(x - r * Math.cos(t), y + L + r * Math.sin(t));
		}
		pts.push(x + r, y + L, x + r, y + 1);
	}
	pts.push(x1, y + 1);
	g.poly(pts).fill(color).stroke({ width: 1.1, color: ink, join: "round" });
	g.rect(x0 + 1.5, y - top + 0.6, x1 - x0 - 3, 0.9).fill({ color: 0xffffff, alpha: 0.55 });
}
