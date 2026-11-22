// The office, drawn: the open floor from design/boards/FloorBusy. Layers, back to front:
//   slab     the dark base the rooms sit on
//   floor    each room's floor, walls and wall items: cached as one texture per room
//   depth    desks, furniture and characters, sorted by their feet (zIndex = y)
//   bubbles  speech bubbles
//   labels   room name tabs and counts
// Furniture is drawn once per kind and baked into a texture that every desk shares, so a busy frame
// redraws characters and bubbles over a handful of cached textures. Baked things are re-baked at
// the camera's scale when the camera settles at a new stop, so they stay sharp when zoomed in.
import { Container, Graphics, Rectangle, type Renderer, Sprite, Text, type Texture } from "pixi.js";
import type { Session, Snapshot } from "../../watcher/model";
import { CameraMove, type Stop, type View, type Viewport, viewFor } from "./camera";
import { FloorPlan } from "./layout";
import { type FurnitureKind, INK, type SignText, hash, label, nameTab, pill } from "./paper";
import { type Placed, Placement, crewOf } from "./placement";
import type { DeskProps, Metrics } from "../director/metrics";
import { deskProps, plannerSig, propsSig } from "./props";
import type { Character, CharacterFactory } from "./slot";
import type { Area, Desk, Rect, World } from "./world";
import { OFFICE_THEME } from "../theme/office";
import { FALLEN } from "../theme/build";
import { type CrewBuild, FURNITURE_KINDS, type SceneTheme } from "../theme/types";

export type { CrewBuild };
export { NIGHT_WATCH } from "../theme/office";

/** Bake resolutions: the smallest one at or above what the camera needs is used. */
const STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const MAX_TEXTURE = 4096;
const HALL_CHUNK = 640;

/** A sprite showing one of the baked furniture textures; re-pointed when they are re-baked. */
class Baked extends Sprite {
	constructor(readonly kind: FurnitureKind) {
		super();
	}
}

interface Item {
	view: Container;
	/** What it was built from; rebuilt only when this changes. */
	sig: string;
}

export interface OfficeOptions {
	renderer: Renderer;
	characters: CharacterFactory;
	/** Ask for a render, or frames if something started moving (a camera move, a sign changed). */
	wake: () => void;
	/**
	 * Who stands where, and what they do: the director (S4). Without one, the provisional
	 * placement stands everyone at their spot and the office bubbles busy leads' tool names itself.
	 */
	cast?: (snapshot: Snapshot, floor: World) => Placed[];
	/** Screen pixels kept clear above the office for the top bar (default 64). */
	top?: number;
	/** Each session's crew build, drawn on its desk (the director's). */
	builds?: () => Record<string, CrewBuild>;
	/** Metrics as things (the director's): each desk's in-tray, drawers, skip, mugs and lamp, the
	 * planners, and NOW SERVING at your office. */
	metrics?: () => Pick<Metrics, "desks" | "planners" | "serving">;
	/** How it all looks and what the places are called (src/scene/theme/; default the office). */
	theme?: SceneTheme;
}

/** A brick moving on a crew build: set down, or tumbling off. Only its transform changes. */
interface BrickMove {
	view: Graphics;
	ms: number;
	t: number;
	/** Where it is `u` (0 to 1) of the way through. */
	at: (u: number) => { x: number; y: number; r: number };
}

/** A bubble someone is saying (or thinking), anchored to its character. */
interface Said {
	view: Container;
	text: string;
	kind: "said" | "thought";
	size: number;
}

export class Office extends Container {
	readonly world = new Container({ isRenderGroup: true });
	#slab = new Graphics();
	#slabSig = "";
	#floor = new Container();
	/** The rooms' planners, over their back walls: redrawn when their notes change. */
	#walls = new Container();
	#planners = new Map<string, Item>();
	#depth = new Container({ sortableChildren: true });
	#bubbles = new Container();
	#labels = new Container();
	#tasks = new Container();
	#tasksSig = "";
	#placed: Placed[] = [];

	#plan = new FloorPlan();
	#placement = new Placement();
	#data?: World;
	#snapshot?: Snapshot;

	#areas = new Map<string, Item>();
	#halls: Container[] = [];
	#items = new Map<string, Item>();
	#tabs = new Map<string, Item>();
	#people = new Map<string, Character>();
	#bubbleFor = new Map<string, Item>();
	#said = new Map<string, Said>();
	#pulse = new Graphics();
	#pulsing: string[] = [];
	#pulseT = 0;
	#theme: SceneTheme;
	#signs: Map<string, SignText>;
	/** Bricks moving on crew builds, by desk item; and what each desk's build last moved for. */
	#bricks = new Map<string, BrickMove[]>();
	#brickSeen = new Map<string, { added?: number; fell?: number }>();

	#textures = new Map<FurnitureKind, Texture>();
	#anchors = new Map<FurnitureKind, { x: number; y: number }>();
	#res = 0;

	#stop: Stop = { kind: "office" };
	#view: View = { scale: 1, x: 0, y: 0 };
	#move?: CameraMove;
	#screen = { w: 1, h: 1 };
	#opts: OfficeOptions;

	constructor(opts: OfficeOptions) {
		super();
		this.#opts = opts;
		this.#theme = opts.theme ?? OFFICE_THEME;
		this.#signs = new Map(Object.entries(this.#theme.words.signs));
		this.world.addChild(this.#slab, this.#floor, this.#walls, this.#pulse, this.#depth, this.#tasks, this.#bubbles, this.#labels);
		this.#signs.set("yours:serving", this.#theme.words.serving(undefined));
		this.world.interactiveChildren = false;
		this.addChild(this.world);
	}

	// --- State for the app and the inspector ---------------------------------------------------

	get animating(): boolean {
		if (this.#move) return true;
		if (this.#pulsing.length) return true;
		if (this.#bricks.size) return true;
		for (const p of this.#people.values()) if (p.animating) return true;
		return false;
	}

	/** True while anyone walks (for the inspector; walks run at the ambient 30 fps, unlike a camera move). */
	get walking(): boolean {
		for (const p of this.#people.values()) if (p.moving) return true;
		return false;
	}

	/** True while the camera is moving: the app raises the frame rate for it. */
	get moving(): boolean {
		return this.#move !== undefined;
	}

	get stop(): Stop {
		return this.#stop;
	}

	get layoutData(): World | undefined {
		return this.#data;
	}

	get view(): View {
		return { ...this.#view };
	}

	get bakeResolution(): number {
		return this.#res;
	}

	/** Every character: its key, global position, and whatever the character reports. */
	entities(): ({ key: string; x: number; y: number } & Record<string, string | number>)[] {
		return [...this.#people].map(([key, p]) => {
			const at = p.view.getGlobalPosition();
			return { key, x: Math.round(at.x), y: Math.round(at.y), ...p.inspect() };
		});
	}

	/** Every character back to the start of its pose (the inspector's freeze). */
	rewind(): void {
		for (const p of this.#people.values()) p.rewind?.();
		for (const list of this.#bricks.values()) for (const m of list) moveBrick(m, (m.t = 0));
	}

	/** The crew-build bricks moving now, by desk (for the inspector and tests). */
	get bricks(): { desk: string; t: number; ms: number }[] {
		return [...this.#bricks].flatMap(([key, list]) => list.map((m) => ({ desk: key.slice(5), t: Math.round(m.t), ms: m.ms })));
	}

	/**
	 * Say something: a bubble over the character with this key, until it says something else or
	 * `undefined`. "thought" draws a thought bubble. The sass engine (S5) drives this through the
	 * director's `say` hook.
	 */
	say(key: string, text: string | undefined, kind: "said" | "thought" = "said"): void {
		const was = this.#said.get(key);
		const p = this.#people.get(key);
		if (!text || !p) {
			if (was) {
				drop(was.view);
				this.#said.delete(key);
				this.#opts.wake();
			}
			return;
		}
		if (was && was.text === text && was.kind === kind) return;
		const s = was ?? { view: bubble(), text: "", kind, size: 0 };
		if (!was) this.#bubbles.addChild(s.view);
		setBubble(s.view, text, kind);
		s.text = text;
		s.kind = kind;
		s.size = Number(p.inspect().size ?? 60);
		this.#said.set(key, s);
		this.#anchor(key);
		this.#opts.wake();
	}

	/** The rooms pulsing now, and how bright the pulse is. */
	get pulsing(): { areas: string[]; alpha: number; bounds: { x: number; y: number; w: number; h: number } } {
		const b = this.#pulse.getLocalBounds();
		return { areas: [...this.#pulsing], alpha: Math.round(this.#pulse.alpha * 100) / 100, bounds: { x: b.x, y: b.y, w: b.width, h: b.height } };
	}

	/** Rooms whose lead is waiting on you: their outline pulses until the set is empty. */
	pulse(areaIds: string[]): void {
		const next = [...areaIds].sort();
		if (next.join("|") === this.#pulsing.join("|")) return;
		this.#pulsing = next;
		this.#drawPulse();
		this.#opts.wake();
	}

	#drawPulse(): void {
		const g = this.#pulse.clear();
		const w = this.#data;
		if (!w) return;
		for (const id of this.#pulsing) {
			const a = w.areas.find((x) => x.id === id);
			if (a) g.roundRect(a.rect.x - 7, a.rect.y - 7, a.rect.w + 14, a.rect.h + 14, 22).stroke({ width: 14, color: 0xffd23f });
		}
		this.#pulse.alpha = 0.65 + 0.35 * Math.sin(this.#pulseT);
	}

	#anchor(key: string): void {
		const s = this.#said.get(key);
		const p = this.#people.get(key);
		if (!s || !p) return;
		s.view.position.set(p.view.x + 14, p.view.y - s.size - 8);
	}

	tick(dt: number): void {
		if (this.#pulsing.length) {
			this.#pulseT += dt * 0.09;
			this.#pulse.alpha = 0.65 + 0.35 * Math.sin(this.#pulseT);
		}
		if (this.#move) {
			const v = this.#move.step(dt * (1000 / 60), this.#centre());
			this.#apply(v);
			if (this.#move.done) {
				this.#move = undefined;
				this.#rebake();
			}
		}
		for (const [key, list] of this.#bricks) {
			for (const m of list) moveBrick(m, (m.t = Math.min(m.ms, m.t + dt * (1000 / 60))));
			const left = list.filter((m) => m.t < m.ms);
			if (left.length) this.#bricks.set(key, left);
			else this.#bricks.delete(key);
		}
		for (const p of this.#people.values()) p.tick(dt);
		// Bubbles follow walkers.
		for (const [key, p] of this.#people) if (p.moving) this.#anchor(key);
	}

	// --- Input ---------------------------------------------------------------------------------

	/** The area (and desk) under a screen point. */
	hit(x: number, y: number): { area?: Area; desk?: Desk } {
		const w = this.#data;
		if (!w) return {};
		const p = { x: (x - this.#view.x) / this.#view.scale, y: (y - this.#view.y) / this.#view.scale };
		const inside = (r: Rect) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
		const area = w.areas.find((a) => inside(a.rect));
		const desk = area?.desks.find((d) => inside(d.cell));
		return { area, desk };
	}

	/** A click: zoom into the room under it, or the desk if already in that room. */
	click(x: number, y: number): void {
		const { area, desk } = this.hit(x, y);
		if (!area) return this.goTo({ kind: "office" });
		const inRoom = (this.#stop.kind === "room" && this.#stop.id === area.id) || this.#stop.kind === "desk";
		if (desk && inRoom) this.goTo({ kind: "desk", id: desk.id });
		else this.goTo({ kind: "room", id: area.id });
	}

	/** Step to the next (or previous) room in reading order: the top band, then the bottom one. */
	nextRoom(dir: 1 | -1 = 1): void {
		const areas = this.#data?.areas ?? [];
		if (areas.length === 0) return;
		const current =
			this.#stop.kind === "room"
				? areas.findIndex((a) => a.id === (this.#stop as { id: string }).id)
				: this.#stop.kind === "desk"
					? areas.findIndex((a) => a.id === this.#data!.desks.get((this.#stop as { id: string }).id)?.areaId)
					: dir > 0
						? -1
						: 0;
		const next = areas[(current + dir + areas.length) % areas.length]!;
		this.goTo({ kind: "room", id: next.id });
	}

	goTo(stop: Stop, animate = true): void {
		if (!this.#data) return;
		const to = viewFor(this.#data, stop, this.#viewport());
		if (!to) return this.goTo({ kind: "office" }, animate);
		this.#stop = stop;
		this.#drawTasks();
		this.#showDetails();
		if (!animate) {
			this.#move = undefined;
			this.#apply(to);
			this.#rebake();
			return;
		}
		this.#move = new CameraMove(this.#view, to);
		this.#opts.wake();
	}

	// --- Signs ---------------------------------------------------------------------------------

	/** The named sign, whiteboard and frame slots, with what they say now. */
	signs(): { id: string; kind: string; area: string; text?: SignText }[] {
		return (this.#data?.signs ?? []).map((s) => ({ id: s.id, kind: s.kind, area: s.areaId, text: this.#signs.get(s.id) }));
	}

	/** Write on a sign slot (or clear it with undefined). Only that room is re-baked. */
	setSign(id: string, value: SignText | undefined): void {
		if (value) this.#signs.set(id, value);
		else this.#signs.delete(id);
		if (this.#data) this.#drawFloor(this.#data);
		this.#opts.wake();
	}

	// --- Drawing -------------------------------------------------------------------------------

	show(snapshot: Snapshot, width: number, height: number): void {
		this.#snapshot = snapshot;
		this.#data = this.#plan.update(snapshot);
		this.#screen = { w: width, h: height };
		const first = this.#res === 0;
		if (first) this.#bake(this.#targetRes(viewFor(this.#data, this.#stop, this.#viewport())!.scale));
		this.#draw(this.#data, snapshot);
		// Keep the camera on its stop as rooms grow; fall back to the whole office if it vanished.
		const to = viewFor(this.#data, this.#stop, this.#viewport());
		if (!to) this.goTo({ kind: "office" }, false);
		else if (this.#move) this.#move = new CameraMove(this.#view, to, Math.max(200, this.#move.ms / 2));
		else if (first || differs(to, this.#view)) this.goTo(this.#stop, false);
	}

	/** The window changed size: re-fit the current stop. */
	layout(width: number, height: number): void {
		this.#screen = { w: width, h: height };
		if (this.#data) this.goTo(this.#stop, false);
	}

	#viewport(): Viewport {
		const top = this.#opts.top ?? 64;
		return { x: 8, y: top, w: Math.max(1, this.#screen.w - 16), h: Math.max(1, this.#screen.h - top - 8) };
	}

	#centre() {
		const vp = this.#viewport();
		return { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 };
	}

	#apply(v: View): void {
		this.#view = v;
		this.world.scale.set(v.scale);
		this.world.position.set(v.x, v.y);
	}

	#draw(world: World, snapshot: Snapshot): void {
		const b = world.bounds;
		const slab = JSON.stringify(b);
		if (slab !== this.#slabSig) {
			this.#slabSig = slab;
			this.#slab.clear().roundRect(b.x - 14, b.y - 14, b.w + 28, b.h + 28, 18).fill(this.#theme.slab);
		}
		this.#drawFloor(world);
		// People first: the director runs in their cast, and the desks show its crew builds.
		this.#drawPeople(world, snapshot);
		this.#drawMetrics(world);
		this.#drawFurniture(world, snapshot);
		this.#drawLabels(world, snapshot);
	}

	/** The director's metrics on the walls: each room's planner, and NOW SERVING at your office. */
	#drawMetrics(world: World): void {
		const m = this.#opts.metrics?.();
		const sign = this.#theme.words.serving(m?.serving);
		const was = this.#signs.get("yours:serving");
		if (was?.body !== sign.body || was?.title !== sign.title) {
			this.#signs.set("yours:serving", sign);
			this.#drawFloor(world);
		}
		const seen = new Set<string>();
		for (const a of world.areas) {
			const wall = a.wall.find((w) => w.kind === "planner");
			if (!wall) continue;
			const rows = m?.planners[a.id] ?? [];
			const sig = `${JSON.stringify(wall.rect)}|${plannerSig(rows)}`;
			seen.add(a.id);
			const had = this.#planners.get(a.id);
			if (had?.sig === sig) continue;
			drop(had?.view);
			const view = this.#theme.planner(wall.rect, rows);
			this.#walls.addChild(view);
			this.#planners.set(a.id, { view, sig });
		}
		for (const [id, item] of this.#planners) {
			if (seen.has(id)) continue;
			drop(item.view);
			this.#planners.delete(id);
		}
	}

	/** Small desk props (mugs, drawers, the skip) only show zoomed in: at office zoom they're clutter. */
	#showDetails(): void {
		const on = this.#stop.kind !== "office";
		for (const [key, item] of this.#items) {
			if (!key.startsWith("desk:")) continue;
			const d = item.view.getChildByLabel("detail");
			if (d) d.visible = on;
		}
	}

	/** Rooms' floors, walls and wall items: one cached texture per room, rebuilt when it changes. */
	#drawFloor(world: World): void {
		const seen = new Set<string>();
		for (const a of world.areas) {
			const texts = a.wall.filter((w) => w.slot).map((w) => this.#signs.get(w.slot!) ?? null);
			const sig = JSON.stringify([a.rect, a.floorY, a.kind, a.hue, a.wall, texts]);
			seen.add(a.id);
			const had = this.#areas.get(a.id);
			if (had?.sig === sig) continue;
			drop(had?.view);
			const view = this.#area(a);
			this.#floor.addChild(view);
			this.#areas.set(a.id, { view, sig });
			this.#cache(view, a.rect);
		}
		for (const [id, item] of this.#areas) {
			if (seen.has(id)) continue;
			drop(item.view);
			this.#areas.delete(id);
		}
		// The hallway, in chunks so each cached texture stays small enough to zoom into.
		const h = world.hallway;
		const chunks = Math.ceil(h.w / HALL_CHUNK);
		if (this.#halls.length !== chunks) {
			for (const c of this.#halls) drop(c);
			this.#halls = [];
			for (let i = 0; i < chunks; i++) {
				const r = { x: h.x + i * HALL_CHUNK, y: h.y, w: Math.min(HALL_CHUNK, h.w - i * HALL_CHUNK), h: h.h };
				const g = new Graphics();
				this.#theme.hallway(g, r);
				const c = new Container();
				c.addChild(g);
				this.#floor.addChildAt(c, 0);
				this.#halls.push(c);
				this.#cache(c, r);
			}
		}
	}

	#area(a: Area): Container {
		const c = new Container({ label: a.id });
		const g = new Graphics();
		c.addChild(g);
		// The planner's board and notes change with the todos: their own layer (#drawMetrics).
		this.#theme.room(g, c, a, (slot) => this.#signs.get(slot));
		return c;
	}

	/** Cache a static container as a texture at the current bake resolution. */
	#cache(c: Container, r: Rect): void {
		const res = Math.min(this.#res, MAX_TEXTURE / Math.max(r.w + 20, r.h + 20));
		for (const t of texts(c)) t.resolution = res;
		c.cacheAsTexture({ resolution: res, antialias: true });
	}

	/** Desks (with their screens and name cards), chairs and floor furniture: depth-sorted. */
	#drawFurniture(world: World, snapshot: Snapshot): void {
		const sessions = new Map(flat(snapshot.sessions).map((s) => [s.id, s]));
		const builds = this.#opts.builds?.() ?? {};
		const metrics = this.#opts.metrics?.().desks ?? {};
		const seen = new Set<string>();
		const put = (key: string, sig: string, x: number, y: number, depth: number, make: () => Container) => {
			seen.add(key);
			let item = this.#items.get(key);
			if (item?.sig !== sig) {
				drop(item?.view);
				item = { view: make(), sig };
				this.#items.set(key, item);
				this.#depth.addChild(item.view);
			}
			item.view.position.set(x, y);
			item.view.zIndex = depth;
		};
		for (const a of world.areas) {
			// Free desks stay furnished in rows where someone still works; empty rows are bare floor.
			const taken = new Set(a.desks.map((d) => `${d.cell.x},${d.cell.y}`));
			const rows = new Set(a.desks.map((d) => d.cell.y));
			for (const cell of a.cells) {
				if (taken.has(`${cell.x},${cell.y}`) || !rows.has(cell.y)) continue;
				const x = cell.x + cell.w / 2;
				const y = cell.y + 78;
				put(`empty:${cell.x},${cell.y}`, "empty", x, y, y, () => this.#desk(undefined));
				put(`echair:${cell.x},${cell.y}`, "chair", x - 26, cell.y + 32, cell.y + 32, () => this.#baked("chair"));
			}
			for (const d of a.desks) {
				const s = sessions.get(d.id)!;
				const card = deskCard(s);
				const b = builds[d.id];
				const bsig = b ? `${b.pieces}|${b.topped}|${b.fellAt ?? ""}|${b.addedAt ?? ""}` : "";
				const p = metrics[d.id];
				put(`desk:${d.id}`, `${s.state === "busy"}|${card.join("|")}|${bsig}|${propsSig(p)}`, d.at.x, d.at.y, d.at.y, () => this.#desk(s, b, p));
				put(`chair:${d.id}`, "chair", d.chair.x, d.chair.y, d.chair.depth, () => this.#baked("chair"));
			}
			for (const [i, f] of a.fixtures.entries()) put(`fx:${a.id}:${i}:${f.kind}`, f.kind, f.x, f.y, f.depth, () => this.#baked(f.kind));
		}
		for (const [key, item] of this.#items) {
			if (seen.has(key)) continue;
			drop(item.view);
			this.#items.delete(key);
			this.#bricks.delete(key);
			if (key.startsWith("desk:")) this.#brickSeen.delete(key);
		}
	}

	#desk(s: Session | undefined, build?: CrewBuild, props?: DeskProps): Container {
		const c = new Container();
		c.addChild(this.#baked("desk"));
		if (s) {
			// A rebuilt desk starts with every brick at rest; a new brick, or a new fall, moves once.
			const key = `desk:${s.id}`;
			this.#bricks.delete(key);
			const was = this.#brickSeen.get(key);
			this.#brickSeen.set(key, { added: build?.addedAt, fell: build?.fellAt });
			if (build && (build.pieces > 0 || build.topped || build.fellAt !== undefined)) {
				const t = this.#theme.crewBuild(build, s.id);
				c.addChild(t.view);
				const moves: BrickMove[] = [];
				if (was && t.top && build.addedAt !== undefined && build.addedAt !== was.added) moves.push(setDown(t.top));
				if (was && t.fallen && build.fellAt !== undefined && build.fellAt !== was.fell) moves.push(tumble(t.fallen, t.fellFrom!));
				for (const m of moves) moveBrick(m, 0);
				if (moves.length) {
					this.#bricks.set(key, moves);
					this.#opts.wake();
				}
			}
		}
		// The metrics as things on and by the desk (props.ts): the small ones only zoomed in.
		if (s && props) {
			const { always, detail } = deskProps(this.#theme, props, s.id);
			detail.label = "detail";
			detail.visible = this.#stop.kind !== "office";
			c.addChild(always, detail);
		}
		const screen = this.#baked(s?.state === "busy" ? "screen-lit" : "screen-off");
		screen.position.set(46, -64);
		c.addChild(screen);
		if (s) {
			const [title, sub] = deskCard(s);
			const card = new Container();
			const t = label(title, 13, "800");
			clip(t, 128);
			const d = label(sub, 9.5, "600");
			clip(d, 128);
			// The model family, as a plain word on its own line.
			const word = props?.word ? label(props.word, 8.5, "600") : undefined;
			const w = Math.max(t.width, d.width, word?.width ?? 0) + 14;
			const h = word ? 45 : 34;
			const g = new Graphics()
				.roundRect(0, 0, w, h, 7)
				.fill(s.state === "busy" ? 0xffffff : 0xe6ebf5)
				.stroke({ width: 2.5, color: INK });
			t.position.set(7, 3);
			d.position.set(7, 19);
			card.addChild(g, t, d);
			if (word) {
				word.position.set(7, 31);
				card.addChild(word);
			}
			card.position.set(-w / 2, word ? -44 : -40);
			card.rotation = -0.02;
			c.addChild(card);
		}
		return c;
	}

	#baked(kind: FurnitureKind): Baked {
		const s = new Baked(kind);
		s.texture = this.#textures.get(kind)!;
		const a = this.#anchors.get(kind)!;
		s.anchor.set(a.x, a.y);
		return s;
	}

	/** Draw every furniture kind into a texture at `res`. */
	#bake(res: number): void {
		this.#res = res;
		const old = [...this.#textures.values()];
		for (const kind of FURNITURE_KINDS) {
			const g = this.#theme.furniture(kind);
			const b = g.getLocalBounds();
			const frame = new Rectangle(Math.floor(b.x) - 3, Math.floor(b.y) - 3, Math.ceil(b.width) + 6, Math.ceil(b.height) + 6);
			const tex = this.#opts.renderer.generateTexture({ target: g, frame, resolution: res, antialias: true });
			this.#textures.set(kind, tex);
			this.#anchors.set(kind, { x: -frame.x / frame.width, y: -frame.y / frame.height });
			g.destroy();
		}
		for (const item of this.#items.values()) {
			for (const s of baked(item.view)) s.texture = this.#textures.get(s.kind)!;
		}
		for (const t of old) t.destroy(true);
	}

	#targetRes(scale: number): number {
		const want = scale * (this.#opts.renderer.resolution || 1);
		return STEPS.find((s) => s >= want * 0.95) ?? STEPS[STEPS.length - 1]!;
	}

	/** After a camera move: re-bake everything static at the new scale, if it changed. */
	#rebake(): void {
		const res = this.#targetRes(this.#view.scale);
		if (res === this.#res || !this.#data) return;
		this.#bake(res);
		for (const [id, item] of this.#areas) this.#cache(item.view, this.#data.areas.find((a) => a.id === id)!.rect);
		for (const c of this.#halls) this.#cache(c, { x: 0, y: 0, w: HALL_CHUNK, h: this.#data.hallway.h });
	}

	#drawPeople(world: World, snapshot: Snapshot): void {
		const placed = this.#opts.cast ? this.#opts.cast(snapshot, world) : this.#placement.place(snapshot, world);
		this.#placed = placed;
		// An empty office is never a blank one: the night watch naps in the lobby's pod.
		if (placed.length === 0) {
			const nap = world.areas.find((a) => a.kind === "lobby")?.spots.nap?.[0];
			if (nap) placed.push({ who: this.#theme.nightWatch, slot: nap, area: "lobby" });
		}
		const seen = new Set<string>();
		const bubbles = new Set<string>();
		const sessions = new Map(flat(snapshot.sessions).map((s) => [s.id, s]));
		for (const { who, slot, desk, cue } of placed) {
			seen.add(who.key);
			let p = this.#people.get(who.key);
			if (!p) {
				p = this.#opts.characters(who);
				this.#people.set(who.key, p);
				this.#depth.addChild(p.view);
			} else p.update(who);
			p.place(slot);
			if (cue) p.act?.(cue);
			// A walker keeps its own depth as it moves; everyone else stands at the slot's.
			if (!p.moving) p.view.zIndex = slot.depth;
			// Without a director, a busy lead says what it is doing (with one, its voice does).
			const s = !this.#opts.cast && who.kind === "lead" && desk ? sessions.get(desk) : undefined;
			if (s?.state === "busy" && s.activity) {
				const label = s.activity.tool.replace(/^mcp__[^_]+__/, "");
				bubbles.add(who.key);
				let b = this.#bubbleFor.get(who.key);
				if (!b) {
					b = { view: bubble(), sig: "" };
					this.#bubbleFor.set(who.key, b);
					this.#bubbles.addChild(b.view);
				}
				if (b.sig !== label) {
					// Tool calls come many times a second: only the glyph quads and the outline change.
					setBubble(b.view, label, "said");
					b.sig = label;
				}
				b.view.position.set(slot.x + 14, slot.y - who.size - 8);
			}
		}
		for (const [key, p] of this.#people) {
			if (seen.has(key)) continue;
			p.destroy();
			this.#people.delete(key);
			this.say(key, undefined);
		}
		for (const key of this.#said.keys()) this.#anchor(key);
		this.#drawTasks();
		this.#drawPulse();
		for (const [key, b] of this.#bubbleFor) {
			if (bubbles.has(key)) continue;
			drop(b.view);
			this.#bubbleFor.delete(key);
		}
	}

	/** Zoomed into a desk: a small tag under each of its crew saying what it is working on. */
	#drawTasks(): void {
		const stop = this.#stop;
		const list = stop.kind === "desk" ? this.#placed.filter((p) => p.desk === stop.id && p.task && p.who.kind === "crew" && p.who.mood !== "done") : [];
		const sig = list.map((p) => `${p.who.key}|${p.task}|${p.slot.x},${p.slot.y}`).join(";");
		if (sig === this.#tasksSig) return;
		this.#tasksSig = sig;
		for (const c of this.#tasks.removeChildren()) c.destroy({ children: true });
		for (const p of list) {
			const t = pill(clipText(p.task!, 16), 6.5);
			t.position.set(p.slot.x - t.width / 2, p.slot.y + 4);
			this.#tasks.addChild(t);
		}
		this.#opts.wake();
	}

	/** Room name tabs and their counts, above everything. */
	#drawLabels(world: World, snapshot: Snapshot): void {
		const byProject = new Map<string, Session[]>();
		for (const s of flat(snapshot.sessions)) byProject.set(s.project, [...(byProject.get(s.project) ?? []), s]);
		const seen = new Set<string>();
		for (const a of world.areas) {
			const words = this.#theme.words;
			let sub = a.kind === "project" ? "" : words.subs[a.kind];
			const name = a.kind === "project" ? a.name : words.areas[a.kind];
			if (a.kind === "project") {
				const list = byProject.get(a.name) ?? [];
				const out = list.reduce((n, s) => n + crewOf(s.agents).filter((x) => x.status === "running").length, 0);
				sub = `${list.length} session${list.length === 1 ? "" : "s"}${out ? ` · ${out} agent${out === 1 ? "" : "s"} out` : ""}`;
			}
			const sig = `${name}|${sub}`;
			seen.add(a.id);
			let item = this.#tabs.get(a.id);
			if (item?.sig !== sig) {
				drop(item?.view);
				const c = new Container();
				const tab = nameTab(name);
				const p = pill(sub, 15);
				p.position.set(tab.width + 6, 8);
				c.addChild(tab, p);
				item = { view: c, sig };
				this.#tabs.set(a.id, item);
				this.#labels.addChild(c);
			}
			item.view.position.set(a.rect.x + 14, a.rect.y - 22);
		}
		for (const [id, item] of this.#tabs) {
			if (seen.has(id)) continue;
			drop(item.view);
			this.#tabs.delete(id);
		}
	}
}

// --- Helpers ----------------------------------------------------------------------------------

/**
 * Destroy a view and everything in it, including each Graphics' own GraphicsContext: a plain
 * `{ children: true }` keeps those, with their geometry and GPU buffers. Bubbles and labels come
 * and go all day, and a scene soak found ~4 GPU buffers a second leaking that way. Nothing in the
 * office shares a context, and baked furniture shares only textures, which this keeps.
 */
function drop(view: Container | undefined): void {
	view?.destroy({ children: true, context: true });
}

const differs = (a: View, b: View) => Math.abs(a.scale - b.scale) > 1e-4 || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5;

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

function* walk(c: Container): Generator<Container> {
	yield c;
	for (const child of c.children) yield* walk(child);
}
const texts = (c: Container) => [...walk(c)].filter((x): x is Text => x instanceof Text);
const baked = (c: Container) => [...walk(c)].filter((x): x is Baked => x instanceof Baked);

/** A desk's name card: the session's title, and a line of facts. */
function deskCard(s: Session): [string, string] {
	const out = crewOf(s.agents).filter((a) => a.status === "running").length;
	const facts = [s.state, s.branch ?? s.worktree, out ? `${out} out` : ""].filter(Boolean);
	return [s.title || "untitled", facts.join(" · ")];
}

function clip(t: { text: string; width: number }, max: number): void {
	if (t.width <= max) return;
	let s = t.text;
	while (s.length > 1 && t.width > max) {
		s = s.slice(0, -1);
		t.text = `${s}…`;
	}
}

const clipText = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** A brick set down on the tower: a short drop onto its place, a tiny rebound, still. No squash. */
function setDown(view: Graphics): BrickMove {
	const x = view.x;
	const y = view.y;
	const r = view.rotation;
	return {
		view,
		ms: 300,
		t: 0,
		at: (u) => {
			const fall = 0.72;
			const dy = u < fall ? -10 * (1 - (u / fall) ** 2) : -1.5 * Math.sin((Math.PI * (u - fall)) / (1 - fall));
			return { x, y: y + dy, r };
		},
	};
}

/** A brick knocked off the top: it pops up and out, turns over three quarters, and lands lying down. */
function tumble(view: Graphics, from: { x: number; y: number }): BrickMove {
	const to = { x: view.x, y: view.y };
	return {
		view,
		ms: 620,
		t: 0,
		at: (u) => {
			const ease = 1 - (1 - u) ** 2;
			return {
				x: from.x + (to.x - from.x) * ease,
				y: from.y + (to.y - from.y) * u * u - 12 * Math.sin(Math.PI * u),
				r: (Math.PI * 3 * ease) / 2,
			};
		},
	};
}

function moveBrick(m: BrickMove, t: number): void {
	const p = m.at(Math.min(1, t / m.ms));
	m.view.position.set(p.x, p.y);
	m.view.rotation = p.r;
}

function bubble(): Container {
	const c = new Container();
	c.addChild(new Graphics(), label("", 12, "800"));
	return c;
}

function setBubble(c: Container, value: string, kind: "said" | "thought"): void {
	const [g, t] = c.children as [Graphics, ReturnType<typeof label>];
	t.text = value;
	const w = t.width + 14;
	const h = 22;
	g.clear().roundRect(0, -h, w, h, kind === "thought" ? 11 : 9).fill(0xffffff).stroke({ width: 2.5, color: INK });
	// A said line has a tail; a thought trails off in two little puffs.
	if (kind === "said") g.poly([8, -1.5, 18, -1.5, 6, 8]).fill(0xffffff).stroke({ width: 2.5, color: INK });
	else g.circle(9, 5, 3.5).fill(0xffffff).stroke({ width: 2, color: INK }).circle(4, 12, 2.2).fill(0xffffff).stroke({ width: 1.8, color: INK });
	t.position.set(7, -h + 4);
}
