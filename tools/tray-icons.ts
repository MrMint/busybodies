// Draws the menu-bar faces into assets/tray/: busy.png, idle.png and waiting.png, each 36x36 (an
// 18-point icon at 2x). They are template images: black on clear, with the face cut out (and a highlight dot put back in each eye), so macOS
// tints them for the menu bar. Our own art. Run: bun tools/tray-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const OUT = join(import.meta.dir, "..", "assets", "tray");

/** A mochi: a soft dome, wider at the bottom. Faces are cut out of it with a mask. */
const BODY = "M18 6 C26 6 31 12 31 20 C31 27 26 31 18 31 C10 31 5 27 5 20 C5 12 10 6 18 6 Z";

/** The rig's eyes: tall wide-set ovals. Each is a hole, so a small solid dot is put back inside it
 * (up and to the right) as the highlight; see `dots`. */
const eyes = (cy: number, rx: number, ry: number) =>
	`<ellipse cx="12.3" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse cx="23.7" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const dots = (cy: number, r: number) =>
	`<circle cx="${12.3 + 1.2}" cy="${cy}" r="${r}"/><circle cx="${23.7 + 1.2}" cy="${cy}" r="${r}"/>`;

const FACES: Record<string, { cut: string; dots: string; extra: string }> = {
	// Wide eyes, a short determined mouth, and a bead of sweat.
	busy: {
		cut: `${eyes(18.5, 3.4, 4.2)}<rect x="16.2" y="23" width="3.6" height="1.8" rx="0.9"/>`,
		dots: dots(16.9, 1.1),
		extra: '<path d="M32.5 6 C34.5 9 34.5 11 32.5 12 C30.5 11 30.5 9 32.5 6 Z"/>',
	},
	// Eyes shut, a little z.
	idle: {
		cut: '<g stroke="black" stroke-width="2" fill="none" stroke-linecap="round"><path d="M9.2 19.5 Q12.3 22.6 15.4 19.5"/><path d="M20.6 19.5 Q23.7 22.6 26.8 19.5"/></g>',
		dots: "",
		extra: '<path d="M28 2 H34 L28 8 H34" stroke="black" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
	},
	// Bigger eyes looking up at you, a small round "o", and an exclamation mark.
	waiting: {
		cut: `${eyes(17.2, 3.7, 4.6)}<circle cx="18" cy="24" r="1.5"/>`,
		dots: dots(15.3, 1.2),
		extra: '<rect x="31.5" y="2" width="3" height="8" rx="1.5"/><circle cx="33" cy="13" r="1.6"/>',
	},
};

const svg = (face: { cut: string; dots: string; extra: string }) => `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
<defs><mask id="m"><rect width="36" height="36" fill="white"/><g fill="black">${face.cut}</g></mask></defs>
<path d="${BODY}" fill="black" mask="url(#m)"/><g fill="black">${face.dots}${face.extra}</g></svg>`;

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
