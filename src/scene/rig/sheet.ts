// The pose sheet: every pose's frames side by side, each settled, with the cast and the twelve
// faces along the top. tools/pose-sheet.ts renders it to a PNG for review; open the scene with
// ?sheet to see it live.
import { Container, Graphics, Text } from "pixi.js";
import type { Atlas } from "./atlas";
import { parseFrame } from "./frame";
import { POSES, type Pose, BEAT_MS } from "./poses";
import { Puppet } from "./puppet";
import { STATION_POSE, type StationKind } from "../world/stations";
import { BELL, BELL_BASE, HANDOFF, PLANNER, STATION, STICKY } from "./reach";
import { ROLES, type Role } from "./roles";
import { FACES } from "./vocab";
import { THEME_IDS, type ThemeId } from "../../themes/ids";
import { poseWords } from "../theme/words";

const INK = 0x2b2340;
const CELL = 120;
const DUET = 200;
/** A pose with work out front (a bench, a crate) needs room on the right for it. */
const WORKCELL = 190;
const ROW = 172;
const LABEL = 230;
const SCALE = 0.8;
/** Frames past this width wrap onto the next line. */
const WRAP = 3100;

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

/** Which station a pose is played at, for the sheet's stand-in furniture. */
const STATION_OF = new Map<string, StationKind>([
	...Object.entries(STATION_POSE).flatMap(([kind, p]) => [p.work, ...(p.bad ? [p.bad] : [])].map((n) => [n, kind as StationKind] as const)),
	// A long build's running feud is at the copier too.
	["copierFeud", "build"],
]);

/** A faint stand-in for the office's furniture behind a station pose (the office draws the real
 * one): [left, right, top] relative to the working point, standing on the floor. */
const GHOST: Record<StationKind, [number, number, number]> = {
	reference: [-6, 30, -10],
	search: [-5, 28, -3],
	build: [-4, 40, 0],
	test: [-10, 42, 2.5],
	web: [-10, 24, 2],
	outbox: [-9, 21, 6.5],
	shredder: [-12, 24, 2.5],
};

function ghost(kind: StationKind): Graphics {
	const [l, r, t] = GHOST[kind];
	const g = new Graphics()
		.roundRect(STATION.x + l, STATION.y + t, r - l, -(STATION.y + t), 3)
		.fill({ color: 0xffffff, alpha: 0.6 })
		.stroke({ width: 1.5, color: INK, alpha: 0.22 });
	// The working point the station arms are solved onto.
	g.moveTo(STATION.x - 4, STATION.y).lineTo(STATION.x + 4, STATION.y).moveTo(STATION.x, STATION.y - 4).lineTo(STATION.x, STATION.y + 4).stroke({ width: 1, color: 0xff4d5e, alpha: 0.5 });
	g.scale.set(SCALE);
	return g;
}

/** Stand-ins for the office furniture behind the wave-2 poses that work on something: your desk's
 * counter under the bell (its top BELL_BASE under the plunger), and the wall planner around the
 * note. Faint, like the station ghosts; the office draws the real ones. */
function propGhost(name: string): Graphics | undefined {
	const g = new Graphics();
	if (name === "bellRing") {
		const top = BELL.y + BELL_BASE + 2;
		g.roundRect(BELL.x - 22, top, 44, -top, 3).fill({ color: 0xffffff, alpha: 0.6 }).stroke({ width: 1.5, color: INK, alpha: 0.22 });
	} else if (name === "stickyPost") {
		const s = STICKY;
		g.roundRect(PLANNER.x - s * 0.9, PLANNER.y - s * 1.7, s * 3.6, s * 3, 2).fill({ color: 0xffffff, alpha: 0.6 }).stroke({ width: 1.5, color: INK, alpha: 0.22 });
		for (let c = 1; c < 3; c++) g.moveTo(PLANNER.x - s * 0.9 + c * s * 1.2, PLANNER.y - s * 1.7).lineTo(PLANNER.x - s * 0.9 + c * s * 1.2, PLANNER.y + s * 1.3).stroke({ width: 1, color: INK, alpha: 0.18 });
	} else return undefined;
	g.scale.set(SCALE);
	return g;
}

// Crew use the stations, so station poses show on a crew member (the scout: no hat brim in the way).
// A hand-off is between two crew members.
const roleOf = (p: Pose): Role =>
	p.roles?.[0] ??
	(p.trigger === "subagent-green" || p.name === "handOff" ? "builder" : STATION_OF.has(p.name) || p.name === "queueWait" ? "scout" : "lead");

/** A two-hander whose partner stands apart, facing the lead (the hand-off): the cell shows the
 * real distance (HANDOFF.slot; the partner steps in on its own spot), mirrored, instead of the boards' squeezed spots. */
const FACING: Record<string, number> = { handOff: HANDOFF.slot };

/** `?sheet&only=hammer,place&zoom=3`: just those poses, drawn bigger, for a close look.
 * `&part=1/2`: the second half of the poses only (the header and cast come with part 0), so
 * tools/pose-sheet.ts can render a sheet taller than one WebGL canvas in pieces and stitch them. */
function closeUp(): { only?: string[]; zoom: number; part: [number, number] } {
	const q = typeof location === "undefined" ? undefined : new URLSearchParams(location.search);
	const only = q?.get("only")?.split(",").filter(Boolean);
	const [k, n] = (q?.get("part") ?? "0/1").split("/").map(Number);
	const part: [number, number] = n! >= 1 && k! >= 0 && k! < n! ? [k!, n!] : [0, 1];
	return { ...(only?.length ? { only } : {}), zoom: Math.max(1, Math.min(4, Number(q?.get("zoom")) || 1)), part };
}

/** Every pose in a theme's words (theme/words.ts), each followed by its variant passes (Pose.beats)
 * as rows of their own: same name (so the same stand and facing), titled for the beat. */
const sheetPoses = (id: ThemeId | undefined): Pose[] =>
	POSES.flatMap((p) => {
		const w = id ? poseWords(id, p) : p;
		const q: Pose = { ...p, title: w.title, lines: [...w.lines] };
		return [q, ...(p.beats?.passes ?? []).map((b): Pose => ({ ...q, title: `${q.title}: a beat, "${b.name}"`, frames: b.frames, beats: undefined, lines: [] }))];
	});

export function buildPoseSheet(atlas: Atlas): { sheet: Container; width: number; height: number; puppets: Puppet[] } {
	const { only, zoom, part } = closeUp();
	// The rig's theme picks the words; the paper rig (the base both repaint) keeps the poses' own.
	const SHEET_POSES = sheetPoses((THEME_IDS as readonly string[]).includes(atlas.theme.name) ? (atlas.theme.name as ThemeId) : undefined);
	const shown = SHEET_POSES.filter((p) => p.name !== "rest" && (!only || only.includes(p.name)));
	const per = Math.ceil(shown.length / part[1]);
	const mine = new Set(shown.slice(part[0] * per, (part[0] + 1) * per));
	const head = part[0] === 0;
	const sheet = new Container();
	const puppets: Puppet[] = [];
	const partners: Puppet[] = [];
	const make = (id: string, role: Role) => {
		const p = new Puppet(atlas, { id, role, accent: 0x19b87a });
		p.scale.set(SCALE);
		puppets.push(p);
		return p;
	};

	let y = head ? 24 : 0;
	if (head) {
		const title = label(`Busybodies · mochi pose sheet${atlas.theme.name === "paper" || atlas.theme.name === "office" ? "" : ` · ${atlas.theme.name}`}`, 30, "800");
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
	}

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
	if (!only && head) strip("The cast", ROLES.map((r) => ({ name: r, make: () => make(`cast-${r}`, r) })));
	if (!only && head) strip(
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
	for (const pose of SHEET_POSES) {
		if (!mine.has(pose)) continue;
		const duet = !!pose.partner;
		const working = pose.frames.some((f) => f.props.work);
		const facing = FACING[pose.name];
		const cw = facing ? 50 + facing * SCALE + 60 : duet ? DUET : working ? WORKCELL : CELL;
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

		const top = y;
		// A long pose wraps onto more lines, so the sheet stays one capturable picture.
		const per = Math.max(1, Math.floor((WRAP - LABEL) / cw));
		pose.frames.forEach((f, i) => {
			const x = LABEL + (i % per) * cw;
			const y = top + Math.floor(i / per) * ROW;
			sheet.addChild(new Graphics().roundRect(x + 4, y, cw - 8, ROW - 34, 12).fill(BG[pose.trigger] ?? 0xeef1fa));
			const lead = make(`${pose.name}-${i}`, roleOf(pose));
			lead.showFrame(f);
			lead.position.set(x + (duet ? 58 : working ? 70 : cw / 2), y + ROW - 46);
			const cellPuppets: Puppet[] = [lead];
			if (pose.partner) {
				const pf = pose.partner.frames[Math.min(i, pose.partner.frames.length - 1)]!;
				const partner = make(`${pose.name}-${i}-b`, pose.partner.role);
				partner.showFrame(pf);
				partner.scale.set(SCALE * (pose.partner.role === "scout" ? 0.85 : 1));
				partner.position.set(x + 138, y + ROW - 46);
				if (facing) {
					partner.position.x = lead.position.x + facing * SCALE;
					partner.scale.x *= -1;
				} else partners.push(partner);
				cellPuppets.push(partner);
			}
			const kind = STATION_OF.get(pose.name);
			const stand = kind ? ghost(kind) : propGhost(pose.name);
			if (stand) {
				stand.position.copyFrom(lead.position);
				sheet.addChild(stand);
			}
			sheet.addChild(...cellPuppets);
			const cap = label(`${i + 1} · ${Math.round(f.ms / BEAT_MS)}b${f.say ? `\n“${f.say}”` : ""}`, 10, "700", 0.8, cw - 10);
			cap.position.set(x + 8, y + ROW - 32);
			sheet.addChild(cap);
		});
		widest = Math.max(widest, LABEL + Math.min(per, pose.frames.length) * cw);
		y += ROW * Math.ceil(pose.frames.length / per);
	}
	for (const p of puppets) p.snap();
	// A partner's spots are in rig units, meant for a desk-width stage; squeeze them into the cell.
	for (const p of partners) p.rig.x *= 0.22;
	const width = widest + 24;
	const height = y + 16;
	sheet.addChildAt(new Graphics().rect(0, 0, width, height).fill(0xf8f6f1), 0);
	sheet.scale.set(zoom);
	return { sheet, width: width * zoom, height: height * zoom, puppets };
}
