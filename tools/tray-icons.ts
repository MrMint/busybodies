// Draws the menu-bar faces into assets/tray/: busy.png, idle.png and waiting.png, each 36x36 (an
// 18-point icon at 2x). They are template images: black on clear, with the eyes cut out, so macOS
// tints them for the menu bar. Our own art. Run: bun tools/tray-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const OUT = join(import.meta.dir, "..", "assets", "tray");

/** A mochi: a soft dome, wider at the bottom. Faces are cut out of it with a mask. */
const BODY = "M18 6 C26 6 31 12 31 20 C31 27 26 31 18 31 C10 31 5 27 5 20 C5 12 10 6 18 6 Z";

const FACES: Record<string, { cut: string; extra: string }> = {
	// Wide eyes, a determined mouth, and a bead of sweat.
	busy: {
		cut: '<circle cx="13.5" cy="18" r="2.4"/><circle cx="22.5" cy="18" r="2.4"/><rect x="15.5" y="23.5" width="5" height="2" rx="1"/>',
		extra: '<path d="M32.5 6 C34.5 9 34.5 11 32.5 12 C30.5 11 30.5 9 32.5 6 Z"/>',
	},
	// Eyes shut, a little z.
	idle: {
		cut: '<path d="M10.8 19 Q13.5 21.5 16.2 19" stroke="black" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M19.8 19 Q22.5 21.5 25.2 19" stroke="black" stroke-width="2" fill="none" stroke-linecap="round"/>',
		extra: '<path d="M28 2 H34 L28 8 H34" stroke="black" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
	},
	// Big eyes looking up at you, and an exclamation mark.
	waiting: {
		cut: '<circle cx="13.5" cy="17" r="3"/><circle cx="22.5" cy="17" r="3"/><circle cx="18" cy="24.5" r="1.8"/>',
		extra: '<rect x="31.5" y="2" width="3" height="8" rx="1.5"/><circle cx="33" cy="13" r="1.6"/>',
	},
};

const svg = (face: { cut: string; extra: string }) => `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
<defs><mask id="m"><rect width="36" height="36" fill="white"/><g fill="black">${face.cut}</g></mask></defs>
<path d="${BODY}" fill="black" mask="url(#m)"/><g fill="black">${face.extra}</g></svg>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 36, height: 36 }, deviceScaleFactor: 1 });
	for (const [name, face] of Object.entries(FACES)) {
		await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(face)}`);
		writeFileSync(join(OUT, `${name}.png`), await page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: 36, height: 36 } }));
		console.log(`wrote assets/tray/${name}.png`);
	}
} finally {
	await browser.close();
}
