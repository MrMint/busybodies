// The atlas layout, Pixi-free so it is unit-tested without a renderer. See atlas.ts.

export const ATLAS_WIDTH = 1024;
export const PAD = 3;
export const RESOLUTION = 2;

export interface Slot {
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Anchor (0..1) that puts the painter's origin at the sprite's position. */
	ax: number;
	ay: number;
}

export interface PartBounds {
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Shelf-pack part bounds into rows ATLAS_WIDTH wide. Pure, so the layout is unit-tested. */
export function pack(parts: PartBounds[], width = ATLAS_WIDTH, pad = PAD): { slots: Slot[]; width: number; height: number } {
	const slots: Slot[] = [];
	let x = pad;
	let y = pad;
	let row = 0;
	// Tallest first keeps shelves tight; ties broken by name, so the layout is stable.
	const order = [...parts].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name));
	for (const p of order) {
		const w = Math.ceil(p.width);
		const h = Math.ceil(p.height);
		if (w + pad * 2 > width) throw new Error(`part ${p.name} is wider than the atlas`);
		if (x + w + pad > width) {
			x = pad;
			y += row + pad;
			row = 0;
		}
		slots.push({ name: p.name, x, y, width: w, height: h, ax: -p.x / w, ay: -p.y / h });
		x += w + pad;
		row = Math.max(row, h);
	}
	return { slots, width, height: Math.ceil(y + row + pad) };
}
