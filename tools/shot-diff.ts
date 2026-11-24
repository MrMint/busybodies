// Compares two folders of tools/shoot.ts screenshots pixel by pixel: a refactor that should change
// nothing (the theme seam) proves it here.
//   bun tools/shot-diff.ts artifacts/before artifacts/after [--out artifacts/diff]
// For each PNG in the first folder it prints how many pixels differ in the second and the box they
// fall in, and writes a diff image (changed pixels red over a faded copy) for any that differ.
// Exits 1 if any state differs or is missing. PNGs are decoded in headless Chrome, so there's no
// image library to install.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" } } });
const [a, b] = positionals;
if (!a || !b) throw new Error("usage: bun tools/shot-diff.ts <before dir> <after dir> [--out dir]");

const names = readdirSync(a)
	.filter((f) => f.endsWith(".png") && f !== "contact-sheet.png")
	.sort();
const browser = await chromium.launch({ channel: "chrome", headless: true });
let bad = 0;
try {
	const page = await browser.newPage();
	for (const name of names) {
		if (!existsSync(join(b, name))) {
			console.log(`MISSING ${name}`);
			bad++;
			continue;
		}
		const url = (dir: string) => `data:image/png;base64,${readFileSync(join(dir, name)).toString("base64")}`;
		const r = await page.evaluate(
			async ({ ua, ub, diff }) => {
				const load = async (u: string) => {
					const img = new Image();
					img.src = u;
					await img.decode();
					const c = document.createElement("canvas");
					c.width = img.width;
					c.height = img.height;
					const x = c.getContext("2d")!;
					x.drawImage(img, 0, 0);
					return { w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data, c, x };
				};
				const [p, q] = await Promise.all([load(ua), load(ub)]);
				if (p.w !== q.w || p.h !== q.h) return { size: `${p.w}x${p.h} vs ${q.w}x${q.h}`, n: -1 };
				let n = 0;
				let box = [Infinity, Infinity, -1, -1];
				const out = p.x.createImageData(p.w, p.h);
				for (let i = 0; i < p.data.length; i += 4) {
					const same =
						p.data[i] === q.data[i] && p.data[i + 1] === q.data[i + 1] && p.data[i + 2] === q.data[i + 2] && p.data[i + 3] === q.data[i + 3];
					const k = i / 4;
					if (!same) {
						n++;
						const x = k % p.w;
						const y = Math.floor(k / p.w);
						box = [Math.min(box[0]!, x), Math.min(box[1]!, y), Math.max(box[2]!, x), Math.max(box[3]!, y)];
						out.data.set([255, 0, 0, 255], i);
					} else out.data.set([p.data[i]!, p.data[i + 1]!, p.data[i + 2]!, 60], i);
				}
				let png: string | undefined;
				if (n && diff) {
					p.x.putImageData(out, 0, 0);
					png = p.c.toDataURL("image/png");
				}
				return { n, box, png, size: `${p.w}x${p.h}` };
			},
			{ ua: url(a), ub: url(b), diff: !!o.out },
		);
		if (r.n === 0) console.log(`same    ${name}`);
		else {
			bad++;
			console.log(r.n < 0 ? `SIZE    ${name} ${r.size}` : `DIFF    ${name}: ${r.n} px in [${r.box!.join(", ")}]`);
			if (o.out && r.png) {
				mkdirSync(o.out, { recursive: true });
				writeFileSync(join(o.out, name), Buffer.from(r.png.split(",")[1]!, "base64"));
			}
		}
	}
} finally {
	await browser.close();
}
console.log(`${names.length - bad} of ${names.length} identical`);
if (bad) process.exitCode = 1;
