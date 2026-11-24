// String hashes. Every bit of variation in the scene comes from one of these, never Math.random,
// so a scene drawn twice is drawn the same. They are different functions and give different
// numbers: keep each call site on the one it uses, or the office rearranges itself.

/** A stable 32-bit hash of a string (FNV-1a). */
export function fnv1a(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** A cheap 32-bit polynomial hash (×31, seeded 7), for paper texture and placeholder art. */
export const hash31 = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
