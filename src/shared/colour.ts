// Colour arithmetic on 0xRRGGBB numbers.

/** `a` moved `t` of the way toward `b`, channel by channel. */
export function mix(a: number, b: number, t: number): number {
	const ch = (c: number, s: number) => (c >> s) & 0xff;
	const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
	return m(16) | m(8) | m(0);
}
