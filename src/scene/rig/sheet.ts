// The pose sheet: every pose's frames side by side, each settled, with the cast and the twelve
// faces along the top. tools/pose-sheet.ts renders it to a PNG for review; open the scene with
// ?sheet to see it live.
import { Container, Graphics, Text } from "pixi.js";
import type { Atlas } from "./atlas";
import { parseFrame } from "./frame";
import { POSES, type Pose, BEAT_MS } from "./poses";
import { Puppet } from "./puppet";
import { ROLES, type Role } from "./roles";
import { FACES } from "./vocab";

const INK = 0x2b2340;
const CELL = 120;
const DUET = 200;
const ROW = 172;
const LABEL = 230;
const SCALE = 0.8;

const label = (text: string, size: number, weight: "400" | "700" | "800" = "400", alpha = 1, wrap?: number) => {
	const t = new Text({
		text,
		style: { fill: INK, fontSize: size, fontWeight: weight, fontFamily: "ui-rounded, system-ui, sans-serif", wordWrap: !!wrap, wordWrapWidth: wrap ?? 0 },
		resolution: 2,
	});
	t.alpha = alpha;
	return t;
};

const BG: Record<string, number> = {
	busy: 0xffe3c2, idle: 0xe6e9f5, "idle-long": 0xe3dcff, waiting: 0xd4f3e4, "test-failed": 0xffe3c2, "pr-opened": 0xd6e8ff,
	"subagent-spawned": 0xffe3c2, stalled: 0xe8e4dc, finished: 0xd4f3e4, thinking: 0xffe0ec, "subagent-green": 0xd6e8ff, "long-build": 0xffe3c2,
};

const roleOf = (p: Pose): Role => p.roles?.[0] ?? (p.trigger === "subagent-green" ? "builder" : "lead");

export function buildPoseSheet(atlas: Atlas): { sheet: Container; width: number; height: number; puppets: Puppet[] } {
	const sheet = new Container();
	const puppets: Puppet[] = [];
	const partners: Puppet[] = [];
	const make = (id: string, role: Role) => {
		const p = new Puppet(atlas, { id, role, accent: 0x19b87a });
		p.scale.set(SCALE);
		puppets.push(p);
		return p;
	};

	let y = 24;
	const title = label("Busybodies · mochi pose sheet", 30, "800");
	title.position.set(24, y);
	sheet.addChild(title);
	y += 46;
	const lede = label(
		"Every pose's frames, each one settled. Under each cell: frame number, length in beats (130 ms), and any line said on it. " +
			"Frames are parameter objects (src/scene/rig/poses.ts); bun tools/pose-dump.ts prints them as text.",
		13, "400", 0.8, 1500,
	);
	lede.position.set(24, y);
	sheet.addChild(lede);
	y += 44;

	// The cast, at rest, and the twelve faces.
	const strip = (heading: string, items: { name: string; make: () => Puppet }[]) => {
		const h = label(heading, 16, "800");
		h.position.set(24, y + 8);
		sheet.addChild(h);
		items.forEach((it, i) => {
			const x = LABEL + i * CELL + CELL / 2;
			sheet.addChild(new Graphics().roundRect(x - CELL / 2 + 4, y, CELL - 8, ROW - 34, 12).fill(0xeef1fa));
			const p = it.make();
			p.position.set(x, y + ROW - 46);
			sheet.addChild(p);
			const t = label(it.name, 11, "700", 0.85);
			t.anchor.set(0.5, 0);
			t.position.set(x, y + ROW - 30);
			sheet.addChild(t);
		});
		y += ROW;
	};
	strip("The cast", ROLES.map((r) => ({ name: r, make: () => make(`cast-${r}`, r) })));
	strip(
		"Twelve faces",
		Object.entries(FACES).map(([name, f], i) => ({
			name,
			make: () => {
				const p = make(`face-${name}`, ROLES[i % ROLES.length]!);
				p.showFrame(parseFrame(`e-${f.eyes} m-${f.mouth} b-${f.brows}`));
				return p;
			},
		})),
	);

	let widest = LABEL + 12 * CELL;
	for (const pose of POSES) {
		if (pose.name === "rest") continue;
		const duet = !!pose.partner;
		const cw = duet ? DUET : CELL;
		const h = label(pose.title, 15, "800", 1, LABEL - 30);
		h.position.set(24, y + 6);
		const meta = label(
			[
				`${pose.name} · on ${pose.trigger}`,
				pose.rarity < 1 ? `rare: 1 in ${Math.round(1 / pose.rarity)}` : "",
				`${pose.play}${pose.habit ? " · slacking habit" : ""}${pose.roles ? ` · ${pose.roles.join(", ")}` : ""}`,
				pose.lines.length ? `“${pose.lines.join("” “")}”` : "",
			].filter(Boolean).join("\n"),
			11, "400", 0.75, LABEL - 34,
		);
		meta.position.set(24, y + 10 + h.height);
		sheet.addChild(h, meta);

		pose.frames.forEach((f, i) => {
			const x = LABEL + i * cw;
			sheet.addChild(new Graphics().roundRect(x + 4, y, cw - 8, ROW - 34, 12).fill(BG[pose.trigger] ?? 0xeef1fa));
			const lead = make(`${pose.name}-${i}`, roleOf(pose));
			lead.showFrame(f);
			lead.position.set(x + (duet ? 58 : cw / 2), y + ROW - 46);
			const cellPuppets: Puppet[] = [lead];
			if (pose.partner) {
				const pf = pose.partner.frames[Math.min(i, pose.partner.frames.length - 1)]!;
				const partner = make(`${pose.name}-${i}-b`, pose.partner.role);
				partner.showFrame(pf);
				partner.scale.set(SCALE * (pose.partner.role === "scout" ? 0.85 : 1));
				partner.position.set(x + 138, y + ROW - 46);
				partners.push(partner);
				cellPuppets.push(partner);
			}
			sheet.addChild(...cellPuppets);
			const cap = label(`${i + 1} · ${Math.round(f.ms / BEAT_MS)}b${f.say ? `\n“${f.say}”` : ""}`, 10, "700", 0.8, cw - 10);
			cap.position.set(x + 8, y + ROW - 32);
			sheet.addChild(cap);
		});
		widest = Math.max(widest, LABEL + pose.frames.length * cw);
		y += ROW;
	}
	for (const p of puppets) p.snap();
	// A partner's spots are in rig units, meant for a desk-width stage; squeeze them into the cell.
	for (const p of partners) p.rig.x *= 0.22;
	const width = widest + 24;
	const height = y + 16;
	sheet.addChildAt(new Graphics().rect(0, 0, width, height).fill(0xf8f6f1), 0);
	return { sheet, width, height, puppets };
}
