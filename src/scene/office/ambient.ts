// What the theme's staging adds to the floor, and what moves on its own (plan-alive wave 3): a
// line's belts, the parts riding them and the foreman's booths; the hallway's dock and the PR crates
// its conveyor carries there; and each theme's ambient life (office/staging.ts `AmbientKind`):
//
//   steam    off the kitchen's coffee machine            (office)
//   fan      the kitchen's ceiling fan                   (office)
//   printer  the copier's light, blinking                (office)
//   beacon   a turning beacon on the press, while a build runs in the bay   (factory)
//   vents    steam puffing from the aisle's floor vents  (factory)
//   sparks   weld sparks off a busy line's belt          (factory)
//   ovens    the deck ovens' windows glowing and flickering           (bakery)
//   marquee  bulbs chasing round the pick-up counter's "Order up!" sign (bakery)
//   cakeStand  a cake turning on its stand on the tasting table     (bakery)
//   sprinkles  sprinkles drifting down round the shop's giant cupcake (bakery)
//   parade   pastries riding the hallway's conveyor, all day long    (bakery)
//
// Everything here is drawn once (the theme's painters, or the shapes below), baked into a shared
// texture (a belt's slats and hazard stripes are far too many vertices for Pixi to batch as Graphics,
// and an unbatched Graphics between sprites in the depth layer costs draw calls), and moved only by
// its transform and alpha. Life things move on the life clock (`tick`, from the office's lifeMs): they
// stop when calm or off screen, and a frozen scene steps the same every time, because every phase,
// period and offset comes from a hash of an id (never Math.random). The crates are acting (`step`):
// they run once, on a PR, and stop.
import { Container, Graphics, Rectangle, type Renderer, Sprite, type Texture } from "pixi.js";
import { unit } from "../rig/player";
import type { SceneTheme, StagePainters } from "../theme/types";
import { INK } from "./paper";
import { type AmbientKind, stagingOf } from "./staging";
import { DOCK_W } from "./layout";
import { BELT, type Belt, type Fixture, type Rect, type World } from "./world";

/** The belt's speed (world px per second of the life clock) and how fast the other things go. */
export const AMBIENT = {
	beltSpeed: 22,
	/** Parts per kind of work held at a desk on the line. */
	partsPerKind: 2,
	/** The ceiling fan's turns per second. */
	fan: 0.55,
	/** The beacon's turns per second. */
	beacon: 0.9,
	/** The printer's light: on this long, once in each period (ms). */
	led: { on: 260, period: [1800, 3000] },
	/** A vent's puff: its period (ms) and the share of it spent puffing. */
	vent: { period: [3600, 5600], share: 0.45 },
	/** Weld sparks: a burst this long (ms), once in each period. */
	sparks: { burst: 380, period: [1100, 1900] },
	/** A vent every this many px of hallway, from its left end. */
	ventPitch: 640,
	/** The bakery's deck oven window, from its build station's base (theme/bakery.ts OVEN_WINDOW),
	 * and its flicker's period (ms). */
	oven: { x: -19, y: -29, w: 38, h: 15, period: 1700 },
	/** Marquee bulbs: this far apart round the sign, this far out from it, a step of the chase (ms),
	 * and a flash of them all once in each period. */
	marquee: { pitch: 11, out: 6, step: 190, flash: 9000 },
	/** The tasting table's cake: its turns per second, and where it stands on the table. */
	cake: { turn: 0.12, y: -86 },
	/** Sprinkles: how many, and how long one takes to drift down (ms). */
	sprinkles: { n: 16, fall: [4200, 6800] },
	/** Pastries on the hallway's conveyor: this far apart, at this speed (px/s). */
	parade: { pitch: 66, speed: 26, scale: 1.5 },
	/** A PR crate: it waits for the arm to set it down, then rides at this speed (px/s), at least. */
	crate: { delay: 2200, speed: 240, maxMs: 8000, fade: 300 },
} as const;

/** What the scene knows that the ambient life shows. */
export interface AmbientFacts {
	/** The kinds of work held at each desk (its lead's and crew's), by session id. */
	held: Map<string, string[]>;
	/** Areas where a build is running (a session or one of its agents). */
	building: Set<string>;
	/** Each session's crew build: topped once its PR goes up. */
	topped: Map<string, boolean>;
}

/** Something on the life clock: placed for a time `t` (ms) of it. */
type Mover = (t: number) => void;

interface Piece {
	views: Container[];
	sig: string;
	movers: Mover[];
}

interface Crate {
	view: Container;
	from: number;
	to: number;
	y: number;
	t: number;
	ms: number;
	delay: number;
}

const range = (id: string, salt: string, [lo, hi]: readonly [number, number]) => lo + unit(id, salt) * (hi - lo);
const wrap = (v: number, n: number) => ((v % n) + n) % n;

export class Ambient {
	#back: Container;
	#depth: Container;
	#pieces = new Map<string, Piece>();
	#crates: Crate[] = [];
	#topped = new Map<string, boolean>();
	#t = 0;
	#kinds: readonly AmbientKind[] = [];
	#renderer: Renderer;
	#textures = new Map<string, { tex: Texture; anchor: { x: number; y: number } }>();

	/** `back` is under the cast (the floor's things); `depth` is the office's depth-sorted layer. */
	constructor(renderer: Renderer, back: Container, depth: Container) {
		this.#renderer = renderer;
		this.#back = back;
		this.#depth = depth;
	}

	/** A sprite of a drawing, baked once per key (at twice world resolution, sharp at room zoom) and
	 * shared; its origin is the drawing's (0, 0). */
	#baked(key: string, draw: (g: Graphics) => void): Sprite {
		let baked = this.#textures.get(key);
		if (!baked) {
			const g = new Graphics();
			draw(g);
			const b = g.getLocalBounds();
			const frame = new Rectangle(Math.floor(b.x) - 2, Math.floor(b.y) - 2, Math.ceil(b.width) + 4, Math.ceil(b.height) + 4);
			const tex = this.#renderer.generateTexture({ target: g, frame, resolution: 2, antialias: true });
			g.destroy({ context: true });
			baked = { tex, anchor: { x: -frame.x / frame.width, y: -frame.y / frame.height } };
			this.#textures.set(key, baked);
		}
		const s = new Sprite(baked.tex);
		s.anchor.set(baked.anchor.x, baked.anchor.y);
		return s;
	}

	/** True while something moves on the life clock (the office keeps life frames going for it). */
	get alive(): boolean {
		for (const p of this.#pieces.values()) if (p.movers.length) return true;
		return false;
	}

	/** True while a crate rides the conveyor: acting, at the acting rate, until it reaches the dock. */
	get acting(): boolean {
		return this.#crates.length > 0;
	}

	/** For the inspector: what is staged and what moves. */
	info(): { ambient: readonly AmbientKind[]; pieces: Record<string, number>; parts: number; crates: { t: number; ms: number; x: number }[]; lifeMs: number } {
		const pieces: Record<string, number> = {};
		let parts = 0;
		for (const [key, p] of this.#pieces) {
			const kind = key.slice(0, key.indexOf(":"));
			pieces[kind] = (pieces[kind] ?? 0) + 1;
			if (kind === "parts") parts += p.views[0]?.children.length ?? 0;
		}
		return { ambient: this.#kinds, pieces, parts, crates: this.#crates.map((c) => ({ t: Math.round(c.t), ms: c.ms, x: Math.round(c.view.x) })), lifeMs: Math.round(this.#t) };
	}

	/** Bring everything in line with the world: build what is new, drop what went, keep the rest. */
	update(world: World, theme: SceneTheme, facts: AmbientFacts): void {
		const staging = stagingOf(theme);
		const kinds = staging.ambient;
		this.#kinds = kinds;
		const stage = theme.stage;
		const has = (k: AmbientKind) => kinds.includes(k);
		const seen = new Set<string>();
		const put = (key: string, sig: string, make: () => Omit<Piece, "sig">) => {
			seen.add(key);
			const had = this.#pieces.get(key);
			if (had?.sig === sig) return;
			if (had) for (const v of had.views) v.destroy({ children: true, context: true });
			const p = { ...make(), sig };
			this.#pieces.set(key, p);
			for (const m of p.movers) m(this.#t);
		};

		for (const a of world.areas) {
			if (stage && a.belts) {
				for (const b of a.belts) {
					put(`belt:${b.id}`, `${b.x},${b.y},${b.w}`, () => this.#belt(stage, b));
					const held = b.desks.flatMap((id) => (facts.held.get(id) ?? []).map((k) => [id, k] as const));
					if (!held.length) continue;
					put(`parts:${b.id}`, `${b.x},${b.y},${b.w}|${held.map((h) => h.join(":")).join(";")}`, () => this.#parts(stage, b, held));
					if (has("sparks")) {
						const desk = world.desks.get(held[0]![0]);
						const x = Math.min(b.w - 20, Math.max(20, (desk ? desk.at.x : b.x + b.w / 2) + 35 - b.x));
						put(`sparks:${b.id}`, `${b.x},${b.y},${x}`, () => this.#sparks(b, x));
					}
				}
				for (const d of a.desks) put(`booth:${d.id}`, `${d.at.x},${d.at.y}`, () => this.#booth(stage, d.at, d.lead.depth));
			}
			for (const st of a.stations) {
				if (st.kind !== "build") continue;
				if (has("ovens")) put(`oven:${st.id}`, `${st.base.x},${st.base.y}`, () => this.#oven(st.id, st.base));
				if (has("printer")) put(`led:${st.id}`, `${st.base.x},${st.base.y}`, () => this.#led(st.id, st.base));
				if (has("beacon") && facts.building.has(a.id)) put(`beacon:${st.id}`, `${st.base.x},${st.base.y}`, () => this.#beacon(st.id, st.base));
			}
			if (a.kind === "kitchen") {
				const counter = a.fixtures.find((f) => f.kind === "counter");
				if (has("steam") && counter) put(`steam:${a.id}`, `${counter.x},${counter.y}`, () => this.#steam(a.id, counter.x - 36, counter.y - 128));
				if (has("fan")) put(`fan:${a.id}`, `${a.rect.x},${a.floorY}`, () => this.#fan(a.rect.x + 62, a.floorY + 160));
			}
			if (a.kind === "yours" && has("marquee")) {
				const sign = a.wall.find((w) => w.slot === "yours:serving")?.rect;
				if (sign) put(`marquee:${a.id}`, `${sign.x},${sign.y},${sign.w},${sign.h}`, () => this.#marquee(a.id, sign));
			}
			if (a.kind === "meeting" && has("cakeStand")) {
				const table = a.fixtures.find((f) => f.kind === "table");
				if (table) put(`cake:${a.id}`, `${table.x},${table.y}`, () => this.#cake(a.id, table));
			}
			if (a.kind === "lobby" && has("sprinkles")) {
				const pod = a.fixtures.find((f) => f.kind === "pod");
				if (pod) put(`sprinkles:${a.id}`, `${pod.x},${pod.y}`, () => this.#sprinkles(a.id, pod));
			}
		}
		const hall = world.hallway;
		if (has("vents")) {
			for (let x = hall.x + 300, i = 0; x < hall.x + hall.w - 120; x += AMBIENT.ventPitch, i++) put(`vent:${i}`, `${x},${hall.y}`, () => this.#vent(`vent:${i}`, x, hall.y + 30));
		}
		const conveyor = world.conveyor;
		if (stage && conveyor) put("dock:hall", `${conveyor.x1},${hall.y},${hall.h}`, () => this.#dock(stage, conveyor.x1, hall));
		if (stage && conveyor && has("parade")) put("parade:hall", `${conveyor.x0},${conveyor.x1},${conveyor.y}`, () => this.#parade(stage, conveyor.x0, conveyor.x1 - DOCK_W, conveyor.y));

		for (const [key, p] of this.#pieces) {
			if (seen.has(key)) continue;
			for (const v of p.views) v.destroy({ children: true, context: true });
			this.#pieces.delete(key);
		}

		// A PR goes up: once the bay's arm has set its crate down, it rides the hallway's belt to the
		// dock. Only a change seen here starts one, never a build already topped when it was first seen.
		for (const [session, topped] of facts.topped) {
			const was = this.#topped.get(session);
			this.#topped.set(session, topped);
			if (!stage || !conveyor || !topped || was !== false) continue;
			const desk = world.desks.get(session);
			const area = desk && world.areas.find((a) => a.id === desk.areaId);
			if (area) this.#ship(stage, area.rect, conveyor.y, conveyor.dock.x);
		}
		for (const s of [...this.#topped.keys()]) if (!facts.topped.has(s)) this.#topped.delete(s);
	}

	/** Place every life thing for `t` ms of the life clock. */
	tick(t: number): void {
		this.#t = t;
		for (const p of this.#pieces.values()) for (const m of p.movers) m(t);
	}

	/** Move the crates on by `ms` (acting time). */
	step(ms: number): void {
		for (const c of this.#crates) {
			c.t = Math.min(c.delay + c.ms, c.t + ms);
			placeCrate(c);
		}
		const done = this.#crates.filter((c) => c.t >= c.delay + c.ms);
		for (const c of done) c.view.destroy({ children: true, context: true });
		if (done.length) this.#crates = this.#crates.filter((c) => !done.includes(c));
	}

	/** Back to the start of the life clock, crates at their start (the inspector's freeze). */
	rewind(): void {
		for (const c of this.#crates) {
			c.t = 0;
			placeCrate(c);
		}
		this.tick(0);
	}

	/** Drop everything (a theme switch): the next update builds it all again. */
	clear(): void {
		for (const p of this.#pieces.values()) for (const v of p.views) v.destroy({ children: true, context: true });
		this.#pieces.clear();
		for (const c of this.#crates) c.view.destroy({ children: true, context: true });
		this.#crates = [];
		this.#topped.clear();
		for (const t of this.#textures.values()) t.tex.destroy(true);
		this.#textures.clear();
	}

	// --- Pieces ---------------------------------------------------------------------------------

	#add(view: Container, z?: number): Container {
		if (z === undefined) this.#back.addChild(view);
		else {
			view.zIndex = z;
			this.#depth.addChild(view);
		}
		return view;
	}

	/** A line's belt: its frame, the slats sliding along it, the rollers over their ends. */
	#belt(stage: StagePainters, b: Belt): Omit<Piece, "sig"> {
		const c = new Container({ label: b.id });
		const frame = this.#baked(`belt:${b.w}`, (g) => stage.belt(g, b.w));
		const slats = this.#baked(`slats:${b.w}`, (g) => stage.slats(g, b.w, BELT.pitch));
		const rollers = this.#baked(`rollers:${b.w}`, (g) => stage.rollers(g, b.w, BELT.pitch));
		c.addChild(frame, slats, rollers);
		c.position.set(b.x, b.y);
		this.#add(c, b.depth);
		return { views: [c], movers: [(t) => (slats.x = wrap((t / 1000) * AMBIENT.beltSpeed, BELT.pitch))] };
	}

	/** The parts riding a belt: a couple for each kind of work held at each of its desks, spread
	 * along it from their ids, carried at the belt's speed and faded in and out at its ends. */
	#parts(stage: StagePainters, b: Belt, held: (readonly [string, string])[]): Omit<Piece, "sig"> {
		const c = new Container({ label: `${b.id}:parts` });
		c.position.set(b.x, b.y - 7);
		const list: { g: Sprite; at: number }[] = [];
		for (const [id, kind] of held) {
			for (let k = 0; k < AMBIENT.partsPerKind; k++) {
				const g = this.#baked(`part:${kind}`, (p) => stage.part(p, kind));
				c.addChild(g);
				list.push({ g, at: unit(`${b.id}|${id}|${kind}`, `part${k}`) * b.w });
			}
		}
		this.#add(c, b.depth + 0.01);
		return {
			views: [c],
			movers: [
				(t) => {
					const run = (t / 1000) * AMBIENT.beltSpeed;
					for (const p of list) {
						const x = wrap(p.at + run, b.w);
						p.g.x = x;
						p.g.alpha = Math.min(1, x / 14, (b.w - x) / 14);
					}
				},
			],
		};
	}

	/** Weld sparks off a busy line: a burst of a few sparks flying up and out, now and then. */
	#sparks(b: Belt, x: number): Omit<Piece, "sig"> {
		const c = new Container({ label: `${b.id}:sparks` });
		c.position.set(b.x + x, b.y - 10);
		const period = range(b.id, "sparks", AMBIENT.sparks.period);
		const phase = unit(b.id, "sparks-phase") * period;
		const dots = Array.from({ length: 6 }, (_, k) => {
			const g = new Graphics().circle(0, 0, k % 3 === 0 ? 1.8 : 1.3).fill(k % 2 ? 0xfff3b0 : 0xffc928);
			c.addChild(g);
			const a = -Math.PI / 2 + (unit(b.id, `spark${k}`) - 0.5) * 2.4;
			return { g, vx: Math.cos(a) * (16 + 14 * unit(b.id, `v${k}`)), vy: Math.sin(a) * (18 + 12 * unit(b.id, `w${k}`)) };
		});
		this.#add(c, b.depth + 0.02);
		return {
			views: [c],
			movers: [
				(t) => {
					const u = wrap(t + phase, period) / AMBIENT.sparks.burst;
					c.visible = u < 1;
					if (u >= 1) return;
					for (const d of dots) {
						d.g.position.set(d.vx * u, d.vy * u + 26 * u * u);
						d.g.alpha = 1 - u * u;
					}
				},
			],
		};
	}

	/** The foreman's booth round a desk on the line, behind its lead. */
	#booth(stage: StagePainters, at: { x: number; y: number }, lead: number): Omit<Piece, "sig"> {
		const g = this.#baked("booth", (p) => stage.booth(p));
		g.position.set(at.x, at.y);
		this.#add(g, lead - 0.5);
		return { views: [g], movers: [] };
	}

	/** The copier's light: a green blink on its panel, now and then. */
	#led(id: string, base: { x: number; y: number }): Omit<Piece, "sig"> {
		const g = new Graphics().circle(0, 0, 2.6).fill(0x5cff9d).stroke({ width: 1.2, color: INK });
		g.position.set(base.x + 15, base.y - 33);
		this.#add(g, base.y + 0.5);
		const period = range(id, "led", AMBIENT.led.period);
		const phase = unit(id, "led-phase") * period;
		return { views: [g], movers: [(t) => (g.visible = wrap(t + phase, period) < AMBIENT.led.on)] };
	}

	/** A turning beacon on the press's head, while a build runs: the lamp, and its beam sweeping. */
	#beacon(id: string, base: { x: number; y: number }): Omit<Piece, "sig"> {
		const c = new Container({ label: `${id}:beacon` });
		c.position.set(base.x - 14, base.y - 100);
		const beam = new Graphics().poly([0, -6, 30, -14, 30, 2]).fill({ color: 0xffb02e, alpha: 0.45 });
		const lamp = new Graphics().roundRect(-5, -12, 10, 12, 5).fill(0xff9a1f).stroke({ width: 1.8, color: INK });
		const glint = new Graphics().rect(-1.5, -10, 3, 7).fill({ color: 0xfff3c4, alpha: 0.9 });
		c.addChild(beam, lamp, glint);
		this.#add(c, base.y + 0.5);
		const phase = unit(id, "beacon");
		return {
			views: [c],
			movers: [
				(t) => {
					const a = 2 * Math.PI * ((t / 1000) * AMBIENT.beacon + phase);
					beam.scale.x = Math.cos(a);
					beam.alpha = 0.25 + 0.75 * Math.abs(Math.cos(a));
					glint.x = Math.sin(a) * 3;
				},
			],
		};
	}

	/** Steam off the coffee machine: three wisps rising, swaying and thinning out, in a loop. */
	#steam(id: string, x: number, y: number): Omit<Piece, "sig"> {
		const c = new Container({ label: `${id}:steam` });
		c.position.set(x, y);
		const wisps = [0, 1, 2].map(() => {
			const g = new Graphics().ellipse(0, 0, 4, 5.5).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: 1.2, color: INK, alpha: 0.35 });
			c.addChild(g);
			return g;
		});
		this.#add(c);
		const period = 2600;
		return {
			views: [c],
			movers: [
				(t) => {
					wisps.forEach((g, k) => {
						const u = wrap(t / period + k / 3, 1);
						g.position.set(Math.sin(u * 2 * Math.PI + k) * 3, -u * 26);
						g.scale.set(0.6 + u * 0.8);
						g.alpha = Math.sin(Math.PI * u) * 0.7;
					});
				},
			],
		};
	}

	/** A ceiling fan, seen from below the ceiling as the camera sees the floor: four blades turning
	 * round a hub, over a corner of the floor nobody stands in, drawn over everyone (it is overhead). */
	#fan(x: number, y: number): Omit<Piece, "sig"> {
		const c = new Container({ label: "fan" });
		c.position.set(x, y);
		const blades = this.#baked("fan", (g) => {
			for (let k = 0; k < 4; k++) {
				const a = (k * Math.PI) / 2;
				const at = (r: number, s: number) => [Math.cos(a) * r - Math.sin(a) * s, Math.sin(a) * r + Math.cos(a) * s];
				g.poly([...at(6, -4), ...at(32, -6.5), ...at(34, 0), ...at(32, 6.5), ...at(6, 4)]).fill(0xb98a5a).stroke({ width: 1.6, color: INK, join: "round" });
			}
		});
		const hub = new Graphics().circle(0, 0, 7).fill(0xe8e2d6).stroke({ width: 1.8, color: INK }).circle(0, 0, 2).fill(INK);
		c.addChild(blades, hub);
		c.alpha = 0.92;
		this.#add(c, y + 1000);
		return { views: [c], movers: [(t) => (blades.rotation = 2 * Math.PI * (t / 1000) * AMBIENT.fan)] };
	}

	/** A floor vent in the aisle: its grate, and steam puffing out of it now and then. */
	#vent(id: string, x: number, y: number): Omit<Piece, "sig"> {
		const grate = this.#baked("grate", (g) => {
			g.roundRect(-12, -3, 24, 7, 2).fill(0x5d6b7a).stroke({ width: 1.5, color: INK });
			for (let k = -8; k <= 8; k += 4) g.rect(k - 0.6, -2, 1.2, 5);
			g.fill({ color: INK, alpha: 0.6 });
		});
		grate.position.set(x, y);
		this.#add(grate);
		const c = new Container({ label: `${id}:steam` });
		c.position.set(x, y - 2);
		const puffs = [0, 1, 2].map(() => {
			const g = new Graphics().circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.85 }).stroke({ width: 1.2, color: INK, alpha: 0.3 });
			c.addChild(g);
			return g;
		});
		this.#add(c);
		const period = range(id, "vent", AMBIENT.vent.period);
		const phase = unit(id, "vent-phase") * period;
		return {
			views: [grate, c],
			movers: [
				(t) => {
					const u = wrap(t + phase, period) / (period * AMBIENT.vent.share);
					c.visible = u < 1.3;
					puffs.forEach((g, k) => {
						const v = u - k * 0.15;
						g.visible = v > 0 && v < 1;
						if (!g.visible) return;
						g.position.set((k - 1) * 4 * v, -v * 30);
						g.scale.set(0.5 + v * 1.1);
						g.alpha = (1 - v) * 0.75;
					});
				},
			],
		};
	}

	/** A deck oven's window glowing: a warm pane over it and a halo round it, breathing and now and
	 * then flaring, as a wood-fired oven does. */
	#oven(id: string, base: { x: number; y: number }): Omit<Piece, "sig"> {
		const { x, y, w, h, period } = AMBIENT.oven;
		const c = new Container({ label: `${id}:oven` });
		c.position.set(base.x, base.y);
		const halo = new Graphics().roundRect(x - 6, y - 5, w + 12, h + 10, 8).fill({ color: 0xffa040, alpha: 0.35 });
		const pane = new Graphics().roundRect(x, y, w, h, 3).fill({ color: 0xffb347, alpha: 0.75 });
		const ember = new Graphics().rect(x + 2, y + h - 5, w - 4, 3).fill({ color: 0xfff0a0, alpha: 0.9 });
		c.addChild(halo, pane, ember);
		this.#add(c, base.y + 0.5);
		const phase = unit(id, "oven") * period;
		return {
			views: [c],
			movers: [
				(t) => {
					const u = (t + phase) / period;
					const f = 0.5 + 0.25 * Math.sin(u * 2 * Math.PI) + 0.15 * Math.sin(u * 7.3 + 1) + 0.1 * Math.sin(u * 13.1);
					pane.alpha = 0.35 + 0.45 * f;
					halo.alpha = 0.25 + 0.6 * f;
					halo.scale.set(1, 0.9 + 0.2 * f);
					ember.alpha = 0.5 + 0.5 * f;
				},
			],
		};
	}

	/** Theatre bulbs round the pick-up counter's sign: every third lit, chasing round it, and now and
	 * then all of them flashing at once. */
	#marquee(id: string, r: Rect): Omit<Piece, "sig"> {
		const { pitch, out, step, flash } = AMBIENT.marquee;
		const c = new Container({ label: `${id}:marquee` });
		const x0 = r.x - out;
		const y0 = r.y - out;
		const w = r.w + out * 2;
		const h = r.h + out * 2;
		const spots: [number, number][] = [];
		const along = (n: number, at: (k: number) => [number, number]) => {
			for (let k = 0; k < n; k++) spots.push(at(k / n));
		};
		const nx = Math.max(2, Math.round(w / pitch));
		const ny = Math.max(2, Math.round(h / pitch));
		along(nx, (u) => [x0 + u * w, y0]);
		along(ny, (u) => [x0 + w, y0 + u * h]);
		along(nx, (u) => [x0 + w - u * w, y0 + h]);
		along(ny, (u) => [x0, y0 + h - u * h]);
		const bulbs = spots.map(([bx, by]) => {
			const g = new Graphics().circle(0, 0, 4.6).fill({ color: 0xffffff, alpha: 0.35 }).circle(0, 0, 2.6).fill(0xffffff).stroke({ width: 1.1, color: INK });
			g.position.set(bx, by);
			c.addChild(g);
			return g;
		});
		this.#add(c);
		const LIT = 0xffe066;
		const DIM = 0x9a8a72;
		return {
			views: [c],
			movers: [
				(t) => {
					const f = wrap(t, flash);
					const flashing = f < 900;
					const all = flashing && Math.floor(f / 150) % 2 === 0;
					const k = Math.floor(t / step);
					bulbs.forEach((b, i) => {
						const lit = flashing ? all : (i + k) % 3 === 0;
						b.tint = lit ? LIT : DIM;
					});
				},
			],
		};
	}

	/** The tasting table's cake turning on its stand: the cake stays, its rosettes and piped dots go
	 * round (the ones at the back of its side hidden), a cherry on top. */
	#cake(id: string, table: Fixture): Omit<Piece, "sig"> {
		const c = new Container({ label: `${id}:cake`, sortableChildren: true });
		c.position.set(table.x, table.y + AMBIENT.cake.y);
		const cw = 34;
		const ch = 22;
		const body = this.#baked("cake-body", (g) => {
			g.roundRect(-cw / 2, -ch, cw, ch, 4).fill(0xfff0f6).stroke({ width: 2, color: INK });
			g.rect(-cw / 2 + 1, -ch * 0.55, cw - 2, 4).fill(0xff9ec4);
			g.ellipse(0, -ch, cw / 2, 4.4).fill(0xffd3e4).stroke({ width: 2, color: INK });
		});
		c.addChild(body);
		const ROSE = [0xff9ec4, 0xffffff, 0x9fe3c8, 0xfff08a];
		const rosettes = Array.from({ length: 8 }, (_, k) => {
			const g = new Graphics().circle(0, 0, 3).fill(ROSE[k % ROSE.length]!).stroke({ width: 1.1, color: INK });
			c.addChild(g);
			return g;
		});
		const dots = Array.from({ length: 10 }, () => {
			const g = new Graphics().circle(0, 0, 1.6).fill(0xffffff).stroke({ width: 0.8, color: INK });
			c.addChild(g);
			return g;
		});
		const cherry = new Graphics().circle(0, -ch - 4, 3.6).fill(0xe8384f).stroke({ width: 1.2, color: INK });
		c.addChild(cherry);
		this.#add(c, table.depth + 0.5);
		return {
			views: [c],
			movers: [
				(t) => {
					const a0 = 2 * Math.PI * (t / 1000) * AMBIENT.cake.turn;
					rosettes.forEach((g, k) => {
						const a = a0 + (k / rosettes.length) * 2 * Math.PI;
						g.position.set(Math.cos(a) * (cw / 2 - 4), -ch + Math.sin(a) * 3);
						g.zIndex = Math.sin(a);
					});
					dots.forEach((g, k) => {
						const a = a0 + (k / dots.length) * 2 * Math.PI;
						g.visible = Math.sin(a) > 0.05;
						g.position.set(Math.cos(a) * (cw / 2 - 1), -ch * 0.25);
					});
				},
			],
		};
	}

	/** Sprinkles drifting down round the giant cupcake, tumbling as they go: some behind it, some in
	 * front, each on its own loop. */
	#sprinkles(id: string, pod: Fixture): Omit<Piece, "sig"> {
		const back = new Container({ label: `${id}:sprinkles-back` });
		const front = new Container({ label: `${id}:sprinkles-front` });
		for (const c of [back, front]) c.position.set(pod.x, pod.y);
		const COLOURS = [0xff9ec4, 0x9fe3c8, 0xfff08a, 0xcdb8ff, 0x6f86ec, 0xffa34d];
		const bits = Array.from({ length: AMBIENT.sprinkles.n }, (_, k) => {
			const g = new Graphics().roundRect(-3, -1, 6, 2, 1).fill(COLOURS[k % COLOURS.length]!).stroke({ width: 0.7, color: INK, alpha: 0.6 });
			(k % 2 ? front : back).addChild(g);
			const key = `${id}|${k}`;
			return { g, x: (unit(key, "x") - 0.5) * 190, fall: range(key, "fall", AMBIENT.sprinkles.fall), phase: unit(key, "phase"), spin: (unit(key, "spin") - 0.5) * 8, sway: 4 + unit(key, "sway") * 6 };
		});
		this.#add(back, pod.depth - 0.5);
		this.#add(front, pod.depth + 0.4);
		return {
			views: [back, front],
			movers: [
				(t) => {
					for (const b of bits) {
						const u = wrap(t / b.fall + b.phase, 1);
						b.g.position.set(b.x + Math.sin(u * 9 + b.phase * 6) * b.sway, -190 + u * 186);
						b.g.rotation = u * b.spin;
						b.g.alpha = Math.min(1, u * 6, (1 - u) * 8);
					}
				},
			],
		};
	}

	/** Pastries riding the hallway's conveyor, end to end, at the belt's crawl: one of each kind in
	 * turn, faded in at the left end and out at the hatch. */
	#parade(stage: StagePainters, x0: number, x1: number, y: number): Omit<Piece, "sig"> {
		const c = new Container({ label: "parade" });
		c.position.set(x0, y + 7);
		const len = Math.max(1, x1 - x0);
		const n = Math.max(1, Math.floor(len / AMBIENT.parade.pitch));
		const KINDS = ["read", "web", "search", "edit", "test", "shell"];
		const list = Array.from({ length: n }, (_, k) => {
			const kind = KINDS[(k * 5 + (k >> 2)) % KINDS.length]!;
			const s = this.#baked(`pastry:${kind}`, (g) => {
				g.scaleTransform(AMBIENT.parade.scale, AMBIENT.parade.scale);
				stage.part(g, kind);
			});
			c.addChild(s);
			return { s, at: (k / n) * len + (unit(`parade${k}`, "jitter") - 0.5) * 12 };
		});
		this.#add(c);
		return {
			views: [c],
			movers: [
				(t) => {
					const run = (t / 1000) * AMBIENT.parade.speed;
					for (const p of list) {
						const x = wrap(p.at + run, len);
						p.s.x = x;
						p.s.alpha = Math.min(1, x / 24, (len - x) / 24);
					}
				},
			],
		};
	}

	/** The dock at the hallway's right end, where the conveyor's crates go off. */
	#dock(stage: StagePainters, x: number, hall: Rect): Omit<Piece, "sig"> {
		const g = this.#baked(`dock:${hall.h}`, (p) => stage.dock(p, hall.h));
		g.position.set(x, hall.y);
		this.#add(g);
		return { views: [g], movers: [] };
	}

	/** A PR's crate: on the hallway's belt in front of its bay, then off to the dock. */
	#ship(stage: StagePainters, room: Rect, y: number, dock: number): void {
		const view = this.#baked("crate", (g) => stage.crate(g));
		const from = Math.round(room.x + room.w / 2);
		const ms = Math.min(AMBIENT.crate.maxMs, (Math.max(0, dock - from) / AMBIENT.crate.speed) * 1000);
		const c: Crate = { view, from, to: dock, y: y + 9, t: 0, ms, delay: AMBIENT.crate.delay };
		this.#add(view, c.y);
		placeCrate(c);
		this.#crates.push(c);
	}
}

function placeCrate(c: Crate): void {
	const u = Math.max(0, c.t - c.delay) / Math.max(1, c.ms);
	c.view.visible = c.t >= c.delay;
	c.view.position.set(c.from + (c.to - c.from) * Math.min(1, u), c.y);
	c.view.alpha = Math.min(1, (c.delay + c.ms - c.t) / AMBIENT.crate.fade);
}
