// A cobweb's strands, as polylines: five spokes fanned out from a corner, three rings across them,
// and a spider on a thread. One shape for the rig's `fx/cobweb` (strung from a stalled character's
// hat) and for a long-idle desk's cobweb (office/props.ts), so they read as the same web.
// Pixi-free: the painters stroke the lines.

export interface Web {
	/** Each a polyline, [x0, y0, x1, y1, ...]. */
	spokes: number[][];
	rings: number[][];
	/** The spider's thread, and the spider at its end. */
	thread?: number[];
	spider?: { x: number; y: number; r: number };
}

/** How far out each ring is, as a share of the web's radius. */
const RINGS = [0.3, 0.55, 0.8] as const;
const SPOKES = 4;

/**
 * A web centred on a corner at (cx, cy), `r` long, fanning from angle `from` through `span`
 * (radians, y down). `spider`: where its thread hangs from and how far it drops, in shares of `r`
 * from the corner, and the spider's radius.
 */
export function web(cx: number, cy: number, r: number, from: number, span: number, spider?: { dx: number; dy: number; drop: number; r: number }): Web {
	const angle = (i: number) => from + (i / SPOKES) * span;
	const spokes: number[][] = [];
	for (let i = 0; i <= SPOKES; i++) spokes.push([cx, cy, cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r]);
	const rings = RINGS.map((k) => {
		const pts: number[] = [];
		for (let i = 0; i <= SPOKES; i++) pts.push(cx + Math.cos(angle(i)) * r * k, cy + Math.sin(angle(i)) * r * k);
		return pts;
	});
	if (!spider) return { spokes, rings };
	const x = cx + spider.dx * r;
	const y = cy + spider.dy * r;
	const end = y + spider.drop * r;
	return { spokes, rings, thread: [x, y, x, end], spider: { x, y: end + spider.r, r: spider.r } };
}
