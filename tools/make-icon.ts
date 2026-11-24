#!/usr/bin/env bun
/**
 * Draws the app icon, a mochi face, and writes it as a macOS `.iconset`.
 *
 *   bun tools/make-icon.ts [out-dir]   (default: assets/icon.iconset)
 *
 * Everything is procedural: each pixel is shaded from a few shapes, supersampled for smooth
 * edges, and written with a small PNG encoder. No image libraries, no randomness, so the same
 * code always makes the same bytes. Shapes and colours follow the mochi characters in
 * the rig's cast: a dome body wider than it is tall, a thick navy outline, and the rig's face:
 * tall wide-set ink eyes with no white, each with a violet glow in its lower third, a big white
 * highlight up and right and a small one down and left, pink cheeks out past the eyes' outer
 * lower corners, and a small "u" smile tucked between the eyes. At 32 px and below, where those
 * details average away, the eyes are drawn simpler (see `layersFor`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

type RGBA = [number, number, number, number];

const hex = (h: string, a = 1): RGBA => [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16), a];

const INK = hex("#1f2340");
const TILE = hex("#d4ecd9");
const TILE_EDGE = hex("#b9dcc1");
const BODY = hex("#5fd3c0");
const BODY_SHADE = hex("#43b8a6");
const SHINE = hex("#ffffff", 0.55);
const WHITE = hex("#ffffff");
const BLUSH = hex("#ff9eb1", 0.85);
const GLOW = hex("#7b68e0", 0.85);
const SHADOW = hex("#1f2340", 0.16);

/** A point inside a shape, in icon units: the canvas runs 0..1024 on both axes. */
type Inside = (x: number, y: number) => boolean;

const circle =
	(cx: number, cy: number, r: number): Inside =>
	(x, y) =>
		(x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const ellipse =
	(cx: number, cy: number, rx: number, ry: number): Inside =>
	(x, y) =>
		((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** The mochi body: a half-ellipse dome on top of a flatter half-ellipse base. */
const dome =
	(cx: number, cy: number, rx: number, top: number, bottom: number): Inside =>
	(x, y) =>
		((x - cx) / rx) ** 2 + ((y - cy) / (y < cy ? top : bottom)) ** 2 <= 1;

/** A superellipse tile close to macOS's icon shape: 824 units wide, centred, with 100 units of margin. */
const tile =
	(inset: number): Inside =>
	(x, y) => {
		const half = 412 - inset;
		const dx = Math.abs(x - 512) / half;
		const dy = Math.abs(y - 512) / half;
		return dx ** 5 + dy ** 5 <= 1;
	};

/** A smile: the part of a ring below its centre. */
const smile =
	(cx: number, cy: number, r: number, width: number): Inside =>
	(x, y) => {
		const d = Math.hypot(x - cx, y - cy);
		return y > cy + r * 0.35 && Math.abs(d - r) <= width / 2;
	};

const and =
	(a: Inside, b: Inside): Inside =>
	(x, y) =>
		a(x, y) && b(x, y);
const not =
	(a: Inside): Inside =>
	(x, y) =>
		!a(x, y);

const body = dome(512, 600, 300, 250, 170);
const outline = dome(512, 600, 326, 276, 196);

type Layer = [Inside, RGBA];

/** The tile and the mochi without its face, the same at every size. */
const BASE: Layer[] = [
	[tile(0), TILE_EDGE],
	[tile(10), TILE],
	[ellipse(512, 800, 300, 46), SHADOW],
	[outline, INK],
	[body, BODY],
	[and(body, not(dome(494, 575, 300, 250, 170))), BODY_SHADE],
	[ellipse(400, 440, 70, 34), SHINE],
];

const CHEEKS: Layer[] = [
	[ellipse(287, 655, 42, 24), BLUSH],
	[ellipse(737, 655, 42, 24), BLUSH],
];

const SMILE: Layer = [smile(512, 614, 26, 16), INK];

/** The rig's face, for 64 px and up: tall ink ovals with a violet glow low inside, a big highlight
 * up and right and a small one down and left (same side on both eyes, not mirrored). */
const FULL_FACE: Layer[] = [
	...[389, 635].flatMap((ex): Layer[] => [
		[ellipse(ex, 580, 60, 75), INK],
		[and(ellipse(ex, 580, 60, 75), ellipse(ex, 617, 37, 25)), GLOW],
		[circle(ex + 18, 552, 22), WHITE],
		[circle(ex - 22, 602, 10), WHITE],
	]),
	...CHEEKS,
	SMILE,
];

/**
 * The eyes for 32 px and below, where a pixel covers 32 or 64 units and the full face's highlights
 * average away into flat dark blobs. Each eye is 10% bigger and snapped to the 16 px grid: a solid
 * two-by-two core (x 320..448 or 576..704, y 512..640) with soft caps above and below. One big
 * highlight, up and to the right in both eyes as on the full face (mirrored, they stare apart),
 * lights one pixel of the core at 16 px and a 2x2 block at 32; the violet glow fills the eye's
 * lower half, so it still shows as colour.
 */
const SMALL_EYES: Layer[] = [384, 640].flatMap((ex): Layer[] => {
	const eye = ellipse(ex, 576, 66, 82);
	return [
		[eye, INK],
		[and(eye, ellipse(ex, 625, 66, 40)), GLOW],
		[and(eye, circle(ex + 32, 544, 38)), WHITE],
	];
});

/** The mouth at 16 px, where the smile is a grey smear: a short dash one pixel row tall
 * (y 640..704), centred, so it covers half of each of the two middle pixels. */
const DASH: Layer = [(x, y) => Math.abs(x - 512) <= 32 && y >= 640 && y <= 704, INK];

/** Rendered sizes up to this get `SMALL_EYES`. 64 px keeps the full face: both highlights and the
 * glow still read there. */
const SMALL_MAX = 32;

/** Layers, painted in order, for an icon `size` pixels across: one design, with simpler eyes at
 * 32 px and below and a simpler mouth at 16. */
const layersFor = (size: number): Layer[] => (size > SMALL_MAX ? [...BASE, ...FULL_FACE] : [...BASE, ...SMALL_EYES, ...CHEEKS, size <= 16 ? DASH : SMILE]);

/** Shades one pixel of a `size`-pixel icon by averaging an n×n grid of samples inside it. */
function shade(layers: Layer[], px: number, py: number, size: number, n: number): RGBA {
	const scale = 1024 / size;
	let r = 0;
	let g = 0;
	let b = 0;
	let a = 0;
	for (let sy = 0; sy < n; sy++) {
		for (let sx = 0; sx < n; sx++) {
			const x = (px + (sx + 0.5) / n) * scale;
			const y = (py + (sy + 0.5) / n) * scale;
			// Composite the layers over transparent, in premultiplied alpha.
			let cr = 0;
			let cg = 0;
			let cb = 0;
			let ca = 0;
			for (const [inside, [lr, lg, lb, la]] of layers) {
				if (!inside(x, y)) continue;
				cr = lr * la + cr * (1 - la);
				cg = lg * la + cg * (1 - la);
				cb = lb * la + cb * (1 - la);
				ca = la + ca * (1 - la);
			}
			r += cr;
			g += cg;
			b += cb;
			a += ca;
		}
	}
	const count = n * n;
	return [r / count, g / count, b / count, a / count];
}

function render(size: number): Uint8Array {
	const n = size <= 64 ? 8 : 4;
	const layers = layersFor(size);
	const pixels = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const [r, g, b, a] = shade(layers, x, y, size, n);
			const i = (y * size + x) * 4;
			// Un-premultiply for PNG's straight alpha.
			pixels[i] = a > 0 ? Math.round(r / a) : 0;
			pixels[i + 1] = a > 0 ? Math.round(g / a) : 0;
			pixels[i + 2] = a > 0 ? Math.round(b / a) : 0;
			pixels[i + 3] = Math.round(a * 255);
		}
	}
	return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(new TextEncoder().encode(type), 4);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

/** Encodes RGBA pixels as an 8-bit PNG, with no row filtering. */
function png(size: number, pixels: Uint8Array): Uint8Array {
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, size);
	view.setUint32(4, size);
	header.set([8, 6, 0, 0, 0], 8); // 8-bit depth, RGBA, deflate, no filter, no interlace
	const rows = new Uint8Array(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) rows.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows, { level: 9 })),
		chunk("IEND", new Uint8Array()),
	];
	const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

const outDir = process.argv[2] ?? "assets/icon.iconset";
mkdirSync(outDir, { recursive: true });
for (const base of [16, 32, 128, 256, 512]) {
	for (const [suffix, size] of [
		["", base],
		["@2x", base * 2],
	] as const) {
		const file = join(outDir, `icon_${base}x${base}${suffix}.png`);
		writeFileSync(file, png(size, render(size)));
		console.info(`wrote ${file}`);
	}
}
