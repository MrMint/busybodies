// The closer look: at a room or desk stop, what each subagent is up to. A chip over its head with
// a glyph for what it is doing (and how long, once a call runs long), its task on a tag under its
// feet, and a team ring on the floor under everyone from one session, its lead and all its
// subagents, a colour per session in the room, so who works for whom reads without a line across
// the room. Opening a character's card brightens its team's rings and fades the rest. At the
// whole-office stop there is none of it: it would be clutter.
//
// Chips, tags and rings follow walkers: the office calls `follow()` on a frame where anyone moves.
// The rings draw on `floor`, which the office puts under the characters; the rest over them.
import { type BitmapText, Container, Graphics } from "pixi.js";
import type { Doing, DoingIcon } from "../contract";
import type { Placed } from "../world/placement";
import { AISLE } from "../world/world";
import { PLUMP_SHAPE } from "../rig/data/plump";
import { PUPPET_HEIGHT } from "../rig/data/reach";
import { INK, label, line } from "./paper";
import { ranFor } from "../../shared/time";

/** What the detail layer needs of a character: where its feet are now. */
interface Body {
	readonly view: { x: number; y: number };
}

/** Chip sizes, in world units. */
const CHIP = { h: 11, icon: 7, text: 5.6, gap: 3, pad: 3 } as const;
/** A team's ring on the floor: an ellipse round the feet, a little wider than the body. */
const RING = { pad: 5, squash: 0.3, width: 2.4, lead: 3.4, fill: 0.2, faded: 0.25 } as const;
/** A lead at its desk stands behind it, feet hidden: its ring goes round the whole desk instead,
 * wider than the desk by `pad` each side, flatter than a body's, its centre `lift` up the floor. */
const DESK_RING = { pad: 10, squash: 0.2, lift: 10, reach: 90 } as const;

/** Where a desk stands on the floor: its front edge's centre and its width, in world units. */
export interface DeskFoot {
	x: number;
	y: number;
	w: number;
}
/** Team colours, handed out in a room by session, in a stable order. Cut-paper brights that read on
 * every theme's floor. */
const TEAM = [0xff8a1f, 0x19b87a, 0x3d7dff, 0xff5c9a, 0x8c5cff, 0x00a8b5] as const;

/** The session a character belongs to, from its key (`s:<id>` or `a:<id>:<agent>`). */
const teamOf = (key: string) => key.split(":")[1] ?? key;

type Ring = { key: string; size: number; plump: number; team: string; color: number; lead: boolean; desk?: DeskFoot };

type Entry = {
	key: string;
	size: number;
	plump: number;
	doing?: Doing;
	/** The chip's words (absent: the glyph alone) and its width. */
	chipText?: BitmapText;
	chipW: number;
	tag?: { text: BitmapText; w: number; h: number; size: number };
};

/**
 * Everything is drawn into one Graphics (threads, tag pills, chips and their glyphs) under one
 * layer of bitmap text, so a busy room's detail costs two batches, not two per subagent.
 */
export class DetailLayer extends Container {
	#paper = new Graphics();
	#words = new Container();
	#sig = "";
	#entries: Entry[] = [];
	#bodies: ReadonlyMap<string, Body> = new Map();
	#rings: Ring[] = [];
	/** The team whose card is open: its rings bright, the others faded. */
	#focus?: string;
	/** The team rings, for the office to put under the characters. */
	readonly floor = new Graphics();
	/** Where the bodies stood when the layer last drew, in draw order (x, y, ...), and the focus
	 * then: `follow` redraws only when one of them has moved or the focus changed. */
	#drawnAt: number[] = [];
	#drawnFocus?: string | null = null;

	constructor() {
		super();
		this.addChild(this.#paper, this.#words);
	}

	/** Brighten the team of the character whose card is open (or none). */
	focus(key: string | undefined): void {
		const team = key ? teamOf(key) : undefined;
		if (team === this.#focus) return;
		this.#focus = team;
		this.follow();
	}

	/**
	 * Draw the detail for the room in focus (`area`), at a `desk` stop or a room stop, or none
	 * (`area` undefined). Returns true when anything changed.
	 */
	draw(opts: {
		area?: string;
		desk?: string;
		placed: Placed[];
		bodies: ReadonlyMap<string, Body>;
		now: number;
		names: ReadonlyMap<string, string>;
		/** The desks' footprints, by id: a lead's ring goes round its desk while it stands there. */
		desks?: ReadonlyMap<string, DeskFoot>;
	}): boolean {
		const { area, desk, placed, now, names } = opts;
		this.#bodies = opts.bodies;
		const here = area ? placed.filter((p) => p.who.mood !== "done" && (desk ? p.desk === desk : p.area === area)) : [];
		const crew = here.filter((p) => p.who.kind === "crew");
		const close = !!desk;
		const sig = `${close}|${crew
			.map((p) => `${p.who.key}|${names.get(p.who.key) ?? ""}|${p.task ?? ""}|${doingSig(p.doing, now)}|${p.who.plump?.level ?? 0}`)
			.join(";")}|${here.map((p) => `${p.who.key}:${p.who.plump?.level ?? 0}`).join(",")}`;
		if (sig === this.#sig) {
			this.follow();
			return false;
		}
		this.#sig = sig;
		// New entries: the next follow draws them, wherever their bodies are.
		this.#drawnAt = [Number.NaN];
		for (const c of this.#words.removeChildren()) c.destroy();
		this.#entries = [];
		// A ring per character whose session has more than one of its people here: a lone lead with
		// nobody out needs no team colour.
		const count = new Map<string, number>();
		for (const p of here) count.set(teamOf(p.who.key), (count.get(teamOf(p.who.key)) ?? 0) + 1);
		const teams = [...count.keys()].filter((t) => count.get(t)! > 1).sort();
		this.#rings = here
			.filter((p) => teams.includes(teamOf(p.who.key)))
			.map((p) => ({
				key: p.who.key,
				size: p.who.size,
				plump: p.who.plump?.level ?? 0,
				team: teamOf(p.who.key),
				color: TEAM[teams.indexOf(teamOf(p.who.key)) % TEAM.length]!,
				lead: p.who.kind === "lead",
				...(p.who.kind === "lead" && p.desk && opts.desks?.get(p.desk) ? { desk: opts.desks.get(p.desk)! } : {}),
			}));
		for (const p of crew) {
			const e: Entry = { key: p.who.key, size: p.who.size, plump: p.who.plump?.level ?? 0, chipW: 0 };
			if (p.doing) {
				e.doing = p.doing;
				const time = p.doing.long && p.doing.since !== undefined ? ranFor(now - p.doing.since) : "";
				const words = [p.doing.word, time].filter(Boolean).join(" · ");
				e.chipText = label(words, CHIP.text, "800");
				this.#words.addChild(e.chipText);
				e.chipW = CHIP.icon + CHIP.pad * 2 + e.chipText.width + 3;
			}
			if (p.task) {
				const name = names.get(p.who.key);
				const max = close ? 22 : 15;
				const size = close ? 6.5 : 5.6;
				const text = label(name ? `${name} · ${clip(p.task, max - 2)}` : clip(p.task, max), size, "800");
				this.#words.addChild(text);
				e.tag = { text, w: text.width + size * 1.4, h: text.height + size * 0.45, size };
			}
			this.#entries.push(e);
		}
		this.follow();
		return true;
	}

	/** True (and remembered) when any body the layer draws for has moved since it last drew, or
	 * the focus changed; false when a redraw would draw the same thing again. */
	#moved(): boolean {
		const at: number[] = [];
		for (const k of [...this.#rings.map((r) => r.key), ...this.#entries.map((e) => e.key)]) {
			const b = this.#bodies.get(k);
			at.push(b ? b.view.x : Number.NaN, b ? b.view.y : Number.NaN);
		}
		const focus = this.#focus ?? null;
		const same =
			focus === this.#drawnFocus &&
			at.length === this.#drawnAt.length &&
			at.every((v, i) => Math.abs(v - this.#drawnAt[i]!) < STILL_PX || (Number.isNaN(v) && Number.isNaN(this.#drawnAt[i]!)));
		this.#drawnAt = at;
		this.#drawnFocus = focus;
		return !same;
	}

	/** Draw the rings, pills and chips where everyone stands now, and move the words with them.
	 * Nothing to do when none of the bodies they belong to has moved (someone else walking). */
	follow(): void {
		if (!this.#moved()) return;
		const f = this.floor.clear();
		for (const r of this.#rings) {
			const b = this.#bodies.get(r.key);
			if (!b) continue;
			const on = this.#focus === undefined || this.#focus === r.team;
			const d = r.desk && atDesk(b.view, r.desk) ? r.desk : undefined;
			const rx = d ? d.w / 2 + DESK_RING.pad : (r.size * 0.5 * PLUMP_SHAPE[r.plump]!.w) / 100 + RING.pad;
			const ry = rx * (d ? DESK_RING.squash : RING.squash);
			f.ellipse(d ? d.x : b.view.x, d ? d.y - DESK_RING.lift : b.view.y, rx, ry)
				.fill({ color: r.color, alpha: on ? RING.fill : RING.fill * RING.faded })
				.stroke({ width: r.lead ? RING.lead : RING.width, color: r.color, alpha: on ? 0.9 : RING.faded });
		}
		const g = this.#paper.clear();
		const placed: Box[] = [];
		for (const e of this.#entries) {
			const b = this.#bodies.get(e.key);
			if (!b) continue;
			if (e.tag) {
				// Just under its owner's feet: the crew's rows (world.ts AISLE) leave a pill's height
				// between one row's feet and the next row's faces.
				const { text, w, h, size } = e.tag;
				const x = b.view.x - w / 2;
				const y = b.view.y + AISLE.pill.gap;
				g.roundRect(x, y, w, h, h / 2)
					.fill(0xffffff)
					.stroke(line(3));
				text.position.set(x + size * 0.7, y + size * 0.2);
			}
			if (e.doing) {
				const top = headTop(b.view, e.size, e.plump);
				const y = top.y - CHIP.h - CHIP.gap;
				// A crowd's chips would pile up: one that would overlap a chip already placed keeps
				// only its glyph (the card says the rest).
				const full = { x: top.x - e.chipW / 2, y, w: e.chipW, h: CHIP.h };
				const short = !!e.chipText && placed.some((r) => overlaps(r, full));
				const w = short ? CHIP.icon + CHIP.pad * 2 : e.chipW;
				const x = top.x - w / 2;
				placed.push({ x, y, w, h: CHIP.h });
				g.roundRect(x, y, w, CHIP.h, CHIP.h / 2)
					.fill(BG[e.doing.icon] ?? 0xffffff)
					.stroke(line(1.6));
				glyph(g, e.doing.icon, x + CHIP.pad + CHIP.icon / 2, y + CHIP.h / 2, CHIP.icon);
				if (e.chipText) {
					e.chipText.alpha = short ? 0 : 1;
					e.chipText.position.set(x + CHIP.pad + CHIP.icon + 3, y + (CHIP.h - e.chipText.height) / 2);
				}
			}
		}
	}
}

type Box = { x: number; y: number; w: number; h: number };

/** True while a lead stands behind its desk (not off on a walk). */
const atDesk = (at: { x: number; y: number }, d: DeskFoot) => Math.abs(at.x - d.x) <= d.w / 2 && at.y <= d.y + 4 && at.y >= d.y - DESK_RING.reach;

/** No body has moved this far since the layer last drew: nothing on it would move a pixel. */
const STILL_PX = 0.01;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where the top of a character's head is in the world: its height grows with a plum's dome. */
function headTop(at: { x: number; y: number }, size: number, plump: number): { x: number; y: number } {
	const extra = (PLUMP_SHAPE[plump]!.h - PLUMP_SHAPE[0]!.h) / PUPPET_HEIGHT;
	return { x: at.x, y: at.y - size * (1 + extra) };
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** What a chip shows, so a redraw happens only when it changes (a long call's time by the minute). */
const doingSig = (d: Doing | undefined, now: number) => (d ? `${d.icon}:${d.word}:${d.long && d.since !== undefined ? ranFor(now - d.since) : ""}` : "");

/** A chip's paper colour by what it is doing: the warm ones are the ones to look at. */
const BG: Partial<Record<DoingIcon, number>> = {
	edit: 0xfff1c9,
	run: 0xe6efff,
	test: 0xe3f7ea,
	ask: 0xffe0a3,
	wait: 0xffd9dc,
	hire: 0xf1e6ff,
};

/** Paint a glyph `s` units across, centred on (x, y), in ink. */
function glyph(g: Graphics, icon: DoingIcon, x: number, y: number, s: number): void {
	const r = s / 2;
	const st = { width: 1.2, color: INK, cap: "round" as const, join: "round" as const };
	switch (icon) {
		case "read":
			g.moveTo(x, y - r * 0.6)
				.lineTo(x - r, y - r * 0.8)
				.lineTo(x - r, y + r * 0.7)
				.lineTo(x, y + r * 0.9)
				.lineTo(x + r, y + r * 0.7)
				.lineTo(x + r, y - r * 0.8)
				.lineTo(x, y - r * 0.6)
				.lineTo(x, y + r * 0.9)
				.stroke(st);
			break;
		case "search":
			g.circle(x - r * 0.2, y - r * 0.2, r * 0.6).stroke(st);
			g.moveTo(x + r * 0.25, y + r * 0.25)
				.lineTo(x + r, y + r)
				.stroke({ ...st, width: 1.6 });
			break;
		case "edit":
			g.moveTo(x - r, y + r)
				.lineTo(x - r * 0.7, y + r * 0.2)
				.lineTo(x + r * 0.5, y - r)
				.lineTo(x + r, y - r * 0.5)
				.lineTo(x - r * 0.2, y + r * 0.7)
				.closePath()
				.fill(0xffc94d)
				.stroke(st);
			break;
		case "run":
			g.moveTo(x - r, y - r * 0.6)
				.lineTo(x - r * 0.2, y)
				.lineTo(x - r, y + r * 0.6)
				.stroke(st);
			g.moveTo(x, y + r * 0.7)
				.lineTo(x + r, y + r * 0.7)
				.stroke(st);
			break;
		case "test":
		case "done":
			g.circle(x, y, r)
				.fill(icon === "test" ? 0x4ccf86 : 0xdfe4ef)
				.stroke(st);
			g.moveTo(x - r * 0.5, y)
				.lineTo(x - r * 0.1, y + r * 0.4)
				.lineTo(x + r * 0.55, y - r * 0.4)
				.stroke({ ...st, color: icon === "test" ? 0xffffff : INK });
			break;
		case "web":
			g.circle(x, y, r).stroke(st);
			g.ellipse(x, y, r * 0.4, r).stroke(st);
			g.moveTo(x - r, y)
				.lineTo(x + r, y)
				.stroke(st);
			break;
		case "hire":
			g.circle(x - r * 0.45, y - r * 0.2, r * 0.38)
				.fill(0xb79cff)
				.stroke(st);
			g.circle(x + r * 0.5, y + r * 0.25, r * 0.3)
				.fill(0xb79cff)
				.stroke(st);
			break;
		case "plan":
			for (const k of [-0.6, 0, 0.6])
				g.moveTo(x - r, y + r * k)
					.lineTo(x + r, y + r * k)
					.stroke(st);
			break;
		case "ask":
			g.moveTo(x - r * 0.5, y - r * 0.4)
				.arc(x, y - r * 0.4, r * 0.5, Math.PI, 0.4 * Math.PI)
				.lineTo(x, y + r * 0.3)
				.stroke(st);
			g.circle(x, y + r * 0.85, 0.7).fill(INK);
			break;
		case "wait":
			g.poly([x - r * 0.7, y - r, x + r * 0.7, y - r, x, y, x + r * 0.7, y + r, x - r * 0.7, y + r, x, y]).stroke(st);
			break;
		case "idle":
			g.moveTo(x - r * 0.6, y - r * 0.6)
				.lineTo(x + r * 0.6, y - r * 0.6)
				.lineTo(x - r * 0.6, y + r * 0.6)
				.lineTo(x + r * 0.6, y + r * 0.6)
				.stroke(st);
			break;
		default:
			g.circle(x, y, r * 0.75).stroke(st);
			g.circle(x, y, r * 0.25).fill(INK);
	}
}
