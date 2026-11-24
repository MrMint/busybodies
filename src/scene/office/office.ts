// The office, drawn: the open floor from design/boards/FloorBusy. Layers, back to front:
//   outside  the lawn round the building and its yard, lit for the time of day (outside.ts)
//   slab     the dark base the rooms sit on, its edge cut by hand
//   floor    each room's floor, walls and wall items, its paper pass (material.ts: floor material,
//            the view out of its windows, grain) and its name painted at its threshold: cached as
//            one texture per room
//   clouds   clouds drifting across the windows, on the life clock
//   shade    the furniture's shadows, stacked offsets from the phase's light
//   ambient  the staging's floor things and the theme's ambient life under the cast (ambient.ts:
//            the dock, vents, steam, the fan); its belts, parts, booths and lights sort into depth
//   depth    desks, furniture and characters, sorted by their feet (zIndex = y)
//   arms     the factory's robot arms, overhead (theme/arm.ts; none in the office theme)
//   light    time of day, lamps, focus and rush: a baked light map, multiplied; glow added (light.ts)
//   pulse    the outline of a room waiting on you, unlit so it shows at night
//   bubbles  speech bubbles
//   labels   the counts for the room the camera is on
// Furniture is drawn once per kind and baked into a texture that every desk shares, so a busy frame
// redraws characters and bubbles over a handful of cached textures. Baked things are re-baked at
// the camera's scale when the camera settles at a new stop, so they stay sharp when zoomed in.
import { Container, FillPattern, Graphics, Rectangle, type Renderer, Sprite, Text, type Texture } from "pixi.js";
import type { Session, Snapshot } from "../../watcher/model";
import { CameraMove, type Stop, type View, type Viewport, viewFor } from "./camera";
import { type Phase, SHADOW, msToNextPhase, phaseOf } from "./daylight";
import { Light, type LightInfo } from "./light";
import { DECAL, dressRoom } from "./material";
import { CLOUD, cloudTexture, glassOf, panesOf, type SunSpot, sunSpot } from "./outlook";
import { Outside } from "./outside";
import { FloorPlan } from "./layout";
import { Ambient, type AmbientFacts } from "./ambient";
import { CRATE } from "./crate";
import { stagingOf } from "./staging";
import { type FurnitureKind, INK, type SignText, grainTexture, label, noise, pill, wobblyRect } from "./paper";
import { LEAD_SIZE, type Placed, Placement, crewOf } from "./placement";
import type { DeskProps, Metrics } from "../director/metrics";
import { deskProps, plannerSig, propsSig } from "./props";
import type { Character, CharacterFactory } from "./slot";
import { AISLE, type Area, BUILD, DESK_TOP, type Desk, type Rect, SEAT, type World } from "./world";
import { trayOnDesk } from "./rigpoints";
import { CARD, MONITOR } from "./propspots";
import { DecorLayer, type RoomDecor, type StoryView, boardText, regularNames, storyStyle } from "./decor";

const BUILD_H = BUILD.brickH;

/** How far a buried lead sinks behind its desk: the rig's pile's foot (rigpoints.ts trayOnDesk) to
 * just under the desk top's back edge (DESK_TOP), so it stands on the desk instead of floating. */
const BURIED_DROP = Math.ceil(DESK_TOP + 2 - trayOnDesk(SEAT, LEAD_SIZE).y);
import { OFFICE_THEME } from "../theme/office";
import { buildTop } from "../theme/build";
import { areaLabel } from "../theme/words";
import { RobotArm } from "../theme/arm";
import { type CrewBuild, FURNITURE_KINDS, type SceneTheme } from "../theme/types";

export type { CrewBuild };

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
	cast?: (snapshot: Snapshot, floor: World, opts: { life: boolean }) => Placed[];
	/** Screen pixels kept clear above the office for the top bar (default 64). */
	top?: number;
	/** Each session's crew build, drawn on its desk (the director's). */
	builds?: () => Record<string, CrewBuild>;
	/** Metrics as things (the director's): each desk's in-tray, drawers, skip, mugs and lamp, the
	 * planners, and NOW SERVING at your office. */
	metrics?: () => Pick<Metrics, "desks" | "planners" | "serving">;
	/** How it all looks and what the places are called (src/scene/theme/; default the office). */
	theme?: SceneTheme;
	/** The hour (0 to 23) the light is for: `?hour=`, for screenshots and tests. Without it, the
	 * local clock's, re-lit as each phase starts. */
	hour?: number;
	/** Sessions in rush (the director's): their room's overhead light flickers. */
	rush?: () => string[];
	/** Draw the lawn and the yard round the building (default true; the compact window floats on
	 * the desktop, so it has none). */
	outside?: boolean;
	/** Story and continuity (decor.ts): the diary and the director's headlines, for the decor on
	 * the walls and the lobby's board. */
	story?: () => StoryView;
}

/** A cloud crossing one pane of a window: where it starts, how fast it goes, how high it rides. */
interface Cloud {
	view: Sprite;
	pane: { x: number; y: number; w: number; h: number };
	y: number;
	w: number;
	/** World px per second. */
	speed: number;
	offset: number;
}

/** A brick moving on a crew build: set down, or tumbling off. Only its transform changes. */
interface BrickMove {
	view: Graphics;
	ms: number;
	/** Below zero while it waits its turn (hidden): a robot arm is still bringing it over. */
	t: number;
	delay: number;
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
	#life = false;
	#slab = new Graphics();
	#slabSig = "";
	#floor = new Container();
	/** The rooms' planners, over their back walls: redrawn when their notes change. */
	#walls = new Container();
	#planners = new Map<string, Item>();
	/** Its own render group: a walker passing a desk re-sorts this layer, and only this layer's
	 * draw instructions are rebuilt, not the yard's, the shadows' and the rooms' (depth.ts). It sits
	 * at the world's origin, so it draws with the world's own transform: the same pixels. */
	#depth = new Container({ sortableChildren: true, isRenderGroup: true });
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
	/** The footprint's gaps made places (World.yards, the theme's `patio`), by their rect. */
	#yards = new Map<string, Item & { rect: Rect }>();
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
	#brickSeen = new Map<string, { added?: number; fell?: number; topped?: boolean }>();
	/** The factory's robot arms, one per project bay (theme/arm.ts), over everything on the floor. */
	#armLayer = new Container();
	#arms = new Map<string, { arm: RobotArm; sig: string }>();
	/** Where an arm just set a PR's crate down, by session, for the conveyor to take it from there. */
	#setDown = new Map<string, { x: number; y: number; delay?: number }>();
	/** Story and continuity on the walls (decor.ts), and what the lobby's board said before the story took it. */
	#decor = new DecorLayer();
	#board?: { was: SignText | undefined; shows: SignText };
	/** The regulars you'd recognise, by character key: their names on desk cards and task tags. */
	#names = new Map<string, string>();

	#textures = new Map<FurnitureKind, Texture>();
	#anchors = new Map<FurnitureKind, { x: number; y: number }>();
	#res = 0;

	/** Time of day: the phase now, and the hour it was worked out from. */
	#phase: Phase;
	#hour: number;
	#phaseTimer?: ReturnType<typeof setTimeout>;
	#outside?: Outside;
	#light: Light;
	/** The furniture's shadows, by the furniture item's key. */
	#shade = new Container({ label: "shade" });
	#shadows = new Map<string, Container>();
	#clouds = new Container({ label: "clouds" });
	/** The staging's things and the theme's ambient life (ambient.ts). */
	#ambientLayer = new Container({ label: "ambient" });
	#ambient: Ambient;
	#cloudList: Cloud[] = [];
	#cloudTex?: Texture;
	#cloudSig = "";
	/** The life clock, in ms: it runs only while life is on, and drives the clouds and flickers. */
	#lifeMs = 0;
	#rushSig = "";
	#labelSig = "";

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
		this.#light = new Light(opts.renderer);
		this.#ambient = new Ambient(opts.renderer, this.#ambientLayer, this.#depth);
		this.#hour = opts.hour ?? new Date().getHours();
		this.#phase = phaseOf(this.#hour);
		if (opts.outside !== false) this.#outside = new Outside(opts.renderer);
		if (this.#outside) this.world.addChild(this.#outside);
		this.world.addChild(this.#slab, this.#floor, this.#clouds, this.#walls, this.#decor, this.#shade, this.#ambientLayer, this.#depth, this.#armLayer, this.#light, this.#pulse, this.#tasks, this.#bubbles, this.#labels);
		this.#signs.set("yours:serving", this.#theme.words.serving(undefined));
		if (opts.hour === undefined) this.#schedulePhase();
		this.world.interactiveChildren = false;
		this.addChild(this.world);
	}

	// --- State for the app and the inspector ---------------------------------------------------

	/** Life on: every character blinks and glances, so the office keeps a low frame rate going.
	 * The app turns it off while the window is off screen, and in calm mode. */
	get life(): boolean {
		return this.#life;
	}

	set life(on: boolean) {
		if (on === this.#life) return;
		this.#life = on;
		for (const p of this.#people.values()) p.life = on;
		// Calm or off screen: the rush lights hold steady.
		if (!on) this.#light.tick(0, true);
		this.#opts.wake();
	}

	/** True while anything has frames to draw, life included. */
	get animating(): boolean {
		if (this.acting) return true;
		// The theme's ambient life (belts, steam, a fan...) lives on the life clock, like blinks.
		if (this.#life && this.#ambient.alive) return true;
		for (const p of this.#people.values()) if (p.animating || (this.#life && p.alive)) return true;
		return false;
	}

	/** True while something besides life moves: a pose, a walk, the camera, a pulse, a brick, an
	 * arm. The app gives these the ambient rate and life alone a lower one. */
	get acting(): boolean {
		if (this.#move) return true;
		if (this.#pulsing.length) return true;
		if (this.#bricks.size) return true;
		// A PR crate riding the hallway's conveyor to the dock.
		if (this.#ambient.acting) return true;
		// A room in rush flickers its light at the acting rate, while life is on (never when calm).
		if (this.#life && this.#light.flickering) return true;
		for (const a of this.#arms.values()) if (a.arm.moving) return true;
		// An idle or finished character's habit is ambient life: drawn at the life rate.
		for (const p of this.#people.values()) if (p.animating && !p.ambient) return true;
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

	/** The light: the time-of-day phase and the hour it is for (forced by `?hour=` or the clock's),
	 * and what the light layer shows (lamps, overhead lights, glow, re-bakes, rooms in rush). */
	get light(): { phase: Phase; hour: number; forced: boolean; focus?: string; clouds: number; lifeMs: number } & LightInfo {
		return { phase: this.#phase, hour: this.#hour, forced: this.#opts.hour !== undefined, focus: this.#focus(), clouds: this.#cloudList.length, lifeMs: Math.round(this.#lifeMs), ...this.#light.info };
	}

	/** Force the hour (0 to 23), or undefined to follow the clock again: the inspector's, for tests. */
	setHour(hour: number | undefined): void {
		this.#opts.hour = hour;
		clearTimeout(this.#phaseTimer);
		this.#phaseTimer = undefined;
		this.#relight();
		if (hour === undefined) this.#schedulePhase();
	}

	/** Re-light for the hour now: on a new phase, re-bake the rooms (their windows and shadows),
	 * the outside and the light layer. Nothing else moves. */
	#relight(): void {
		this.#hour = this.#opts.hour ?? new Date().getHours();
		const phase = phaseOf(this.#hour);
		if (phase === this.#phase) return;
		this.#phase = phase;
		this.#reshade();
		if (this.#data && this.#snapshot) this.#draw(this.#data, this.#snapshot);
		this.#opts.wake();
	}

	/** Wake when the next phase starts (a timer, not frames). */
	#schedulePhase(): void {
		clearTimeout(this.#phaseTimer);
		this.#phaseTimer = setTimeout(() => {
			this.#relight();
			this.#schedulePhase();
		}, msToNextPhase(new Date()));
	}

	/** The area the camera is on, if it is on one. */
	#focus(): string | undefined {
		const stop = this.#stop;
		if (stop.kind === "room") return stop.id;
		if (stop.kind === "desk") return this.#data?.desks.get(stop.id)?.areaId;
		return undefined;
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
		for (const list of this.#bricks.values()) for (const m of list) moveBrick(m, (m.t = -m.delay));
		for (const a of this.#arms.values()) a.arm.rewind();
		this.#lifeMs = 0;
		this.#ambient.rewind();
		this.#light.rewind(!this.#life);
		this.#moveClouds();
	}

	/** The crew-build bricks moving now, by desk (for the inspector and tests). */
	get bricks(): { desk: string; t: number; ms: number }[] {
		return [...this.#bricks].flatMap(([key, list]) => list.map((m) => ({ desk: key.slice(5), t: Math.round(m.t), ms: m.ms })));
	}

	/** The robot arms (the factory's), by project room: whether each moves, and its jobs. */
	get arms(): { area: string; moving: boolean; jobs: { kind: string; t: number; ms: number }[]; base: number }[] {
		return [...this.#arms].map(([area, { arm }]) => ({ area, moving: arm.moving, jobs: arm.plan.jobs, base: Math.round(arm.plan.pose.base) }));
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
		for (const a of this.#arms.values()) if (a.arm.moving) a.arm.step(dt * (1000 / 60));
		this.#ambient.step(dt * (1000 / 60));
		// The life clock: clouds drift and rush lights flicker only while life is on.
		if (this.#life) {
			this.#lifeMs += dt * (1000 / 60);
			this.#moveClouds();
			this.#ambient.tick(this.#lifeMs);
			this.#light.tick(dt * (1000 / 60));
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
		// The stage lights: the room the camera heads for stays lit, the rest dim. Its counts show.
		this.#drawLight(this.#data);
		if (this.#snapshot) this.#drawLabels(this.#data, this.#snapshot);
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

	// --- Theme ---------------------------------------------------------------------------------

	get theme(): SceneTheme {
		return this.#theme;
	}

	/**
	 * Switch to another theme (and the characters painted for it): everything drawn goes, and the
	 * next `show` draws it all again in the new look. The furniture is re-baked now. A sign still
	 * showing the old theme's default text takes the new one's; what the voice wrote stays, and so
	 * do the bubbles up now. Nothing moves mid-switch: bricks and arms start at rest.
	 */
	setTheme(theme: SceneTheme, characters?: CharacterFactory): void {
		if (theme === this.#theme && !characters) return;
		const old = this.#theme;
		this.#theme = theme;
		if (characters) this.#opts.characters = characters;
		const same = (a?: SignText, b?: SignText) => a?.title === b?.title && a?.body === b?.body;
		// The story's board and decor are drawn again in the new theme's words and colours.
		if (this.#board) {
			if (this.#board.was) this.#signs.set("lobby:frame", this.#board.was);
			else this.#signs.delete("lobby:frame");
			this.#board = undefined;
		}
		this.#decor.clear();
		for (const id of new Set([...Object.keys(old.words.signs), ...Object.keys(theme.words.signs)])) {
			const now = this.#signs.get(id);
			if (now && !same(now, old.words.signs[id])) continue;
			if (theme.words.signs[id]) this.#signs.set(id, theme.words.signs[id]!);
			else this.#signs.delete(id);
		}
		this.#signs.set("yours:serving", theme.words.serving(this.#opts.metrics?.().serving));
		const said = [...this.#said].map(([key, s]) => [key, s.text, s.kind] as const);
		for (const p of this.#people.values()) p.destroy();
		this.#people.clear();
		for (const s of this.#said.values()) drop(s.view);
		this.#said.clear();
		for (const b of this.#bubbleFor.values()) drop(b.view);
		this.#bubbleFor.clear();
		for (const map of [this.#areas, this.#items, this.#planners, this.#tabs, this.#yards]) {
			for (const item of map.values()) drop(item.view);
			map.clear();
		}
		for (const c of this.#halls) drop(c);
		this.#halls = [];
		for (const s of this.#shadows.values()) drop(s);
		this.#shadows.clear();
		this.#labelSig = "";
		for (const a of this.#arms.values()) drop(a.arm);
		this.#arms.clear();
		this.#bricks.clear();
		this.#brickSeen.clear();
		this.#ambient.clear();
		this.#slabSig = "";
		if (this.#res) this.#bake(this.#res);
		if (this.#snapshot) {
			this.show(this.#snapshot, this.#screen.w, this.#screen.h);
			for (const [key, text, kind] of said) this.say(key, text, kind);
		}
		this.#opts.wake();
	}

	// --- Drawing -------------------------------------------------------------------------------

	show(snapshot: Snapshot, width: number, height: number): void {
		this.#snapshot = snapshot;
		this.#data = this.#plan.update(snapshot, stagingOf(this.#theme));
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
		const c = this.#centre();
		this.#outside?.parallax((c.x - v.x) / v.scale, (c.y - v.y) / v.scale);
	}

	#draw(world: World, snapshot: Snapshot): void {
		const b = world.bounds;
		const slabRect = { x: b.x - 14, y: b.y - 14, w: b.w + 28, h: b.h + 28 };
		const slab = JSON.stringify(b);
		if (slab !== this.#slabSig) {
			this.#slabSig = slab;
			// The building's base, its edge cut by hand.
			this.#slab.clear().poly(wobblyRect(slabRect, 17, 2.2, 60), true).fill(this.#theme.slab);
		}
		// The path out starts under the lobby, at the slab's edge.
		const lobby = world.areas.find((a) => a.kind === "lobby");
		const door = lobby?.band === "bottom" ? { x: Math.round(lobby.rect.x + lobby.rect.w / 2), y: slabRect.y + slabRect.h } : undefined;
		this.#outside?.update(slabRect, this.#theme.lawn, this.#theme.light, this.#phase, door);
		this.#drawFloor(world);
		this.#drawClouds(world);
		// People first: the director runs in their cast, and the desks show its crew builds.
		this.#drawPeople(world, snapshot);
		this.#drawMetrics(world);
		this.#drawStory(world);
		this.#drawArms(world);
		this.#drawFurniture(world, snapshot);
		this.#drawAmbient(world, snapshot);
		this.#drawLabels(world, snapshot);
		this.#drawLight(world, snapshot);
	}

	/** The staging and the theme's ambient life (ambient.ts), from what the cast holds and runs:
	 * the kinds of work held at each desk (parts on its line's belt), the bays with a build running
	 * (the press's beacon), and the crew builds topped by a PR (a crate down the conveyor). */
	#drawAmbient(world: World, snapshot: Snapshot): void {
		const held = new Map<string, string[]>();
		for (const p of this.#placed) {
			if (!p.desk || !p.work) continue;
			const list = held.get(p.desk) ?? [];
			if (!list.includes(p.work)) list.push(p.work);
			held.set(p.desk, list);
		}
		for (const list of held.values()) list.sort();
		const running = new Set(flat(snapshot.sessions).filter(buildRunning).map((s) => s.id));
		const building = new Set(world.areas.filter((a) => a.desks.some((d) => running.has(d.id))).map((a) => a.id));
		const topped = new Map(Object.entries(this.#opts.builds?.() ?? {}).map(([id, b]) => [id, b.topped] as const));
		const facts: AmbientFacts = { held, building, topped, setDown: this.#setDown };
		this.#ambient.update(world, this.#theme, facts);
		this.#setDown.clear();
		if (this.#ambient.acting) this.#opts.wake();
	}

	/** What is staged and what moves on its own (for the inspector and tests). */
	get staging() {
		const w = this.#data;
		return {
			...stagingOf(this.#theme),
			belts: w?.areas.flatMap((a) => a.belts ?? []) ?? [],
			conveyor: w?.conveyor,
			...this.#ambient.info(),
		};
	}

	/** The light layer: re-baked only if what it shows changed; the rush rooms' flickers. */
	#drawLight(world: World, snapshot = this.#snapshot): void {
		if (!snapshot) return;
		const occupied = new Set(this.#placed.map((p) => p.area).filter((a): a is string => !!a));
		const desks = flat(snapshot.sessions).map((s) => ({ id: s.id, state: s.state }));
		this.#light.update({ light: this.#theme.light, phase: this.#phase, world, focus: this.#focus(), desks, occupied });
		const rushing = new Set(this.#opts.rush?.() ?? []);
		const rooms = world.areas.filter((a) => a.desks.some((d) => rushing.has(d.id)));
		const sig = rooms.map((a) => `${a.id}:${a.rect.x},${a.rect.y},${a.rect.w},${a.rect.h}`).join("|");
		if (sig !== this.#rushSig) {
			this.#rushSig = sig;
			this.#light.rush(rooms);
			this.#light.tick(0, !this.#life);
			if (rooms.length) this.#opts.wake();
		}
	}

	/** A cloud in each pane of each window, tinted for the phase: rebuilt when the windows or the
	 * phase change, moved by `#moveClouds` on the life clock. */
	#drawClouds(world: World): void {
		const light = this.#theme.light;
		const panes = world.areas.flatMap((a) => a.wall.filter((w) => w.kind === "window").flatMap((w) => panesOf(glassOf(w.rect, light), light)));
		const sig = `${this.#phase}|${this.#theme.id}|${panes.map((p) => `${p.x},${p.y}`).join(";")}`;
		if (sig === this.#cloudSig) return;
		this.#cloudSig = sig;
		for (const c of this.#cloudList) c.view.destroy();
		this.#cloudList = [];
		this.#cloudTex ??= cloudTexture(this.#opts.renderer);
		const look = CLOUD[this.#phase];
		for (const [i, p] of panes.entries()) {
			const seed = Math.round(p.x * 7 + p.y);
			const w = Math.min(18, p.w * 0.42);
			const view = new Sprite(this.#cloudTex);
			view.setSize(w, w * (22 / 36));
			view.tint = look.tint;
			this.#clouds.addChild(view);
			this.#cloudList.push({
				view,
				pane: p,
				y: p.y + 3 + noise(seed, i, 51) * Math.max(0, p.h * 0.45 - 6),
				w,
				speed: 1.2 + noise(seed, i, 52) * 1.6,
				offset: noise(seed, i, 53) * (p.w + w),
			});
		}
		this.#moveClouds();
	}

	/** Each cloud across its pane: in from the left, out at the right, faded near the frame so it
	 * never crosses a bar. Only the clock moves them, so a frozen scene steps the same every time. */
	#moveClouds(): void {
		const alpha = CLOUD[this.#phase].alpha;
		for (const c of this.#cloudList) {
			const span = c.pane.w + c.w;
			const x = c.pane.x - c.w + ((c.offset + (this.#lifeMs / 1000) * c.speed) % span);
			const gap = Math.min(x - c.pane.x, c.pane.x + c.pane.w - (x + c.w));
			const a = Math.max(0, Math.min(1, (gap - 1) / 6));
			c.view.position.set(x, c.y);
			// Faded out by alpha alone: a visibility change rebuilds the world (depth.ts).
			c.view.alpha = a * alpha;
		}
	}

	/** New light, new shadows: every piece of furniture's shadow again, offset for the phase. */
	#reshade(): void {
		for (const [key, item] of this.#items) {
			drop(this.#shadows.get(key));
			const shadow = this.#shadowOf(item.view);
			if (shadow) {
				const off = SHADOW[this.#phase];
				shadow.position.set(item.view.x + off.x, item.view.y + off.y);
				this.#shade.addChild(shadow);
				this.#shadows.set(key, shadow);
			} else this.#shadows.delete(key);
		}
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

	/** Story and continuity (decor.ts): the decor on the walls, and the lobby's board. The board takes
	 * the story's text while it has some, and gets back what it said before when that ends. */
	#drawStory(world: World): void {
		const view = this.#opts.story?.();
		this.#decor.update(world, this.#theme, view);
		const text = boardText(view, storyStyle(this.#theme).words, this.#phase);
		const id = "lobby:frame";
		const now = this.#signs.get(id);
		const same = (a?: SignText, b?: SignText) => a?.title === b?.title && a?.body === b?.body;
		let next = now;
		if (text) {
			if (!this.#board || !same(now, this.#board.shows)) this.#board = { was: now, shows: text };
			else this.#board.shows = text;
			next = text;
		} else if (this.#board) {
			next = same(now, this.#board.shows) ? this.#board.was : now;
			this.#board = undefined;
		}
		if (same(next, now)) return;
		if (next) this.#signs.set(id, next);
		else this.#signs.delete(id);
		this.#drawFloor(world);
	}

	/** The story's decor and board, for the inspector. */
	get story(): { decor: RoomDecor[]; board?: SignText } {
		return { decor: this.#decor.info(this.#data, this.#opts.story?.()), board: this.#signs.get("lobby:frame") };
	}

	/** Small desk props (mugs, drawers, the skip) only show zoomed in: at office zoom they're clutter. */
	#showDetails(): void {
		const on = this.#stop.kind !== "office";
		for (const [key, item] of this.#items) {
			if (!key.startsWith("desk:")) continue;
			for (const name of ["detail", "card"]) {
				const d = item.view.getChildByLabel(name);
				if (d) d.visible = on;
			}
		}
	}

	/** Rooms' floors, walls and wall items: one cached texture per room, rebuilt when it changes. */
	#drawFloor(world: World): void {
		const seen = new Set<string>();
		const sun = sunSpot(
			world.areas.flatMap((a) => a.wall.filter((w) => w.kind === "window").map((w) => w.rect)),
			this.#phase,
		);
		for (const a of world.areas) {
			const texts = a.wall.filter((w) => w.slot).map((w) => this.#signs.get(w.slot!) ?? null);
			const here = sun && a.wall.some((w) => w.kind === "window" && Math.abs(w.rect.x - sun.x) < 1);
			const sig = JSON.stringify([a.rect, a.floorY, a.kind, a.hue, a.name, a.cells.length, a.wall, texts, this.#phase, here ? sun : 0]);
			seen.add(a.id);
			const had = this.#areas.get(a.id);
			if (had?.sig === sig) continue;
			drop(had?.view);
			const view = this.#area(a, sun);
			this.#floor.addChild(view);
			this.#areas.set(a.id, { view, sig });
			this.#cache(view, roomBounds(a.rect));
		}
		for (const [id, item] of this.#areas) {
			if (seen.has(id)) continue;
			drop(item.view);
			this.#areas.delete(id);
		}
		// The gaps in the footprint, made places: under the rooms, over the slab.
		const yards = new Set<string>();
		for (const y of world.yards) {
			const key = `${y.band}|${y.rect.x},${y.rect.y},${y.rect.w},${y.rect.h}`;
			yards.add(key);
			if (this.#yards.has(key)) continue;
			const g = new Graphics();
			this.#theme.patio(g, y.rect, y.band);
			const grain = new Graphics().rect(y.rect.x, y.rect.y, y.rect.w, y.rect.h).fill(new FillPattern(grainTexture(), "repeat"));
			grain.alpha = 0.4;
			const view = new Container({ label: `yard:${key}` });
			view.addChild(g, grain);
			this.#floor.addChildAt(view, 0);
			this.#yards.set(key, { view, sig: key, rect: y.rect });
			this.#cache(view, y.rect);
		}
		for (const [key, item] of this.#yards) {
			if (yards.has(key)) continue;
			drop(item.view);
			this.#yards.delete(key);
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
				const grain = new Graphics().rect(r.x, r.y, r.w, r.h).fill(new FillPattern(grainTexture(), "repeat"));
				grain.alpha = 0.4;
				const c = new Container();
				c.addChild(g, grain);
				this.#floor.addChildAt(c, 0);
				this.#halls.push(c);
				this.#cache(c, r);
			}
		}
	}

	#area(a: Area, sun: SunSpot | undefined): Container {
		const c = new Container({ label: a.id });
		const g = new Graphics();
		c.addChild(g);
		// The planner's board and notes change with the todos: their own layer (#drawMetrics).
		this.#theme.room(g, c, a, (slot) => this.#signs.get(slot));
		// The paper pass: materials, the view out, grain and the room's name (material.ts).
		const words = this.#theme.words;
		const name = areaLabel(a, words);
		dressRoom(c, a, { light: this.#theme.light, phase: this.#phase, name, sun, rug: this.#theme.rug?.(a) });
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
		const off = SHADOW[this.#phase];
		const put = (key: string, sig: string, x: number, y: number, depth: number, make: () => Container) => {
			seen.add(key);
			let item = this.#items.get(key);
			if (item?.sig !== sig) {
				drop(item?.view);
				item = { view: make(), sig };
				this.#items.set(key, item);
				this.#depth.addChild(item.view);
				drop(this.#shadows.get(key));
				const shadow = this.#shadowOf(item.view);
				if (shadow) {
					this.#shade.addChild(shadow);
					this.#shadows.set(key, shadow);
				} else this.#shadows.delete(key);
			}
			item.view.position.set(x, y);
			item.view.zIndex = depth;
			this.#shadows.get(key)?.position.set(x + off.x, y + off.y);
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
				const chair = y + SEAT.y - 4;
				put(`echair:${cell.x},${cell.y}`, "chair", x + SEAT.x, chair, chair, () => this.#baked("chair"));
			}
			for (const d of a.desks) {
				const s = sessions.get(d.id)!;
				const card = deskCard(s, this.#names.get(`s:${s.id}`));
				const b = builds[d.id];
				const bsig = b ? `${b.pieces}|${b.topped}|${b.fellAt ?? ""}|${b.addedAt ?? ""}` : "";
				const p = metrics[d.id];
				put(`desk:${d.id}`, `${s.state === "busy"}|${card.join("|")}|${bsig}|${propsSig(p)}`, d.at.x, d.at.y, d.at.y, () => this.#desk(s, b, p, d));
				put(`chair:${d.id}`, "chair", d.chair.x, d.chair.y, d.chair.depth, () => this.#baked("chair"));
			}
			for (const [i, f] of a.fixtures.entries()) put(`fx:${a.id}:${i}:${f.kind}`, f.kind, f.x, f.y, f.depth, () => this.#baked(f.kind));
		}
		for (const [key, item] of this.#items) {
			if (seen.has(key)) continue;
			drop(item.view);
			drop(this.#shadows.get(key));
			this.#shadows.delete(key);
			this.#items.delete(key);
			this.#bricks.delete(key);
			if (key.startsWith("desk:")) this.#brickSeen.delete(key);
		}
	}

	/** A robot arm per project room, when the theme has them; rebuilt (idle) when its room moves. */
	#drawArms(world: World): void {
		const seen = new Set<string>();
		if (this.#theme.arms) {
			for (const a of world.areas) {
				if (a.kind !== "project") continue;
				seen.add(a.id);
				const sig = `${a.rect.x},${a.floorY}`;
				const had = this.#arms.get(a.id);
				if (had && (had.sig === sig || had.arm.moving)) continue;
				drop(had?.arm);
				const arm = new RobotArm(a.rect.x, a.floorY);
				this.#armLayer.addChild(arm);
				this.#arms.set(a.id, { arm, sig });
			}
		}
		for (const [id, a] of this.#arms) {
			if (seen.has(id)) continue;
			drop(a.arm);
			this.#arms.delete(id);
		}
	}

	#desk(s: Session | undefined, build?: CrewBuild, props?: DeskProps, desk?: Desk): Container {
		const c = new Container();
		c.addChild(this.#baked("desk"));
		// The screen at the desk's right end (propspots.ts MONITOR), under the props in front of it.
		const screen = this.#baked(s?.state === "busy" ? "screen-lit" : "screen-off");
		screen.position.set(MONITOR.x, MONITOR.y);
		c.addChild(screen);
		if (s) {
			// A rebuilt desk starts with every brick at rest; a new brick, or a new fall, moves once.
			const key = `desk:${s.id}`;
			this.#bricks.delete(key);
			const was = this.#brickSeen.get(key);
			this.#brickSeen.set(key, { added: build?.addedAt, fell: build?.fellAt, topped: build?.topped });
			const arm = desk && this.#arms.get(desk.areaId)?.arm;
			if (build && (build.pieces > 0 || build.topped || build.fellAt !== undefined)) {
				const t = this.#theme.crewBuild(build, s.id);
				c.addChild(t.view);
				const moves: BrickMove[] = [];
				if (was && t.top && build.addedAt !== undefined && build.addedAt !== was.added) {
					// In the factory the bay's arm brings the piece over: it lands when the arm lets go.
					const top = buildTop(build.pieces);
					const delay = arm?.place({ x: desk!.at.x + top.x, y: desk!.at.y + top.y + BUILD_H / 2 }) ?? 0;
					moves.push(setDown(t.top, delay));
				}
				// A PR: the arm lifts the PR's crate off the build onto the bay's loading dock.
				if (was && arm && build.topped && !was.topped) {
					const dock = this.#data?.areas.find((a) => a.id === desk!.areaId)?.stations.find((st) => st.kind === "outbox");
					const top = buildTop(build.pieces + 1);
					if (dock) {
						// The conveyor's crate takes over where the arm lets go of it (ambient.ts, crate.ts).
						const to = { x: dock.base.x - 6, y: dock.base.y - 47 };
						const delay = arm.ship({ x: desk!.at.x + top.x, y: desk!.at.y + top.y + BUILD_H / 2 }, to);
						this.#setDown.set(s.id, { x: to.x, y: to.y + CRATE.armHalf, ...(delay !== undefined ? { delay } : {}) });
					}
				}
				if (arm?.moving) this.#opts.wake();
				if (was && t.fallen && build.fellAt !== undefined && build.fellAt !== was.fell) moves.push(tumble(t.fallen, t.fellFrom!));
				for (const m of moves) moveBrick(m, m.t);
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
		if (s) {
			const [title, sub] = deskCard(s, this.#names.get(`s:${s.id}`));
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
			card.position.set(-w / 2, word ? CARD.top : CARD.topShort);
			card.rotation = -0.02;
			// Name cards show at the room and desk stops; at office zoom they're clutter.
			card.label = "card";
			card.visible = this.#stop.kind !== "office";
			c.addChild(card);
		}
		return c;
	}

	/** The shadow a piece of furniture casts: its baked shapes as dark silhouettes, twice, the second
	 * offset as far again (stacked paper). Screens sit on the desk and cast none. Placed at the item's
	 * position plus the phase's offset. */
	#shadowOf(view: Container): Container | undefined {
		const parts = view.children.filter((c): c is Baked => c instanceof Baked && !c.kind.startsWith("screen"));
		if (parts.length === 0) return undefined;
		const c = new Container();
		const off = SHADOW[this.#phase];
		for (const k of [0, 1]) {
			for (const p of parts) {
				const s = this.#baked(p.kind);
				s.position.set(p.x + off.x * k, p.y + off.y * k);
				s.tint = 0x000000;
				s.alpha = 0.09;
				c.addChild(s);
			}
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
		for (const s of baked(this.#shade)) s.texture = this.#textures.get(s.kind)!;
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
		for (const [id, item] of this.#areas) this.#cache(item.view, roomBounds(this.#data.areas.find((a) => a.id === id)!.rect));
		for (const c of this.#halls) this.#cache(c, { x: 0, y: 0, w: HALL_CHUNK, h: this.#data.hallway.h });
		for (const item of this.#yards.values()) this.#cache(item.view, item.rect);
	}

	#drawPeople(world: World, snapshot: Snapshot): void {
		const placed = this.#opts.cast ? this.#opts.cast(snapshot, world, { life: this.#life }) : this.#placement.place(snapshot, world);
		this.#placed = placed;
		this.#names = regularNames(placed.map((p) => p.who), this.#opts.story?.());
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
				p.life = this.#life;
				this.#people.set(who.key, p);
				this.#depth.addChild(p.view);
			} else p.update(who);
			// Buried in the in-tray: the rig's pile stands on the lead's desk-top line, which sits higher
			// than this desk's lowered top (world.ts DESK_TOP), so the lead sinks to put it there.
			p.place(cue?.pose === "buried" && cue.spot === "desk" && !cue.walk ? { ...slot, y: slot.y + BURIED_DROP } : slot);
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
		const sig = list.map((p) => `${p.who.key}|${this.#names.get(p.who.key) ?? ""}|${p.task}|${p.slot.x},${p.slot.y}`).join(";");
		if (sig === this.#tasksSig) return;
		this.#tasksSig = sig;
		for (const c of this.#tasks.removeChildren()) c.destroy({ children: true });
		for (const p of list) {
			const name = this.#names.get(p.who.key);
			const t = pill(name ? `${name} · ${clipText(p.task!, 13)}` : clipText(p.task!, 14), 6.5);
			// Just under its owner's feet: the crew's rows (world.ts AISLE) leave a pill's height
			// between one row's feet and the next row's faces.
			t.position.set(p.slot.x - t.width / 2, p.slot.y + AISLE.pill.gap);
			this.#tasks.addChild(t);
		}
		this.#opts.wake();
	}

	/** The counts for the room the camera is on (a room or desk stop): a pill in the hallway at the
	 * room's threshold, at the far end from its painted name. At office zoom there are none: the
	 * names are painted on the rooms (material.ts) and the counts would be clutter. */
	#drawLabels(world: World, snapshot: Snapshot): void {
		const focus = this.#focus();
		const a = focus ? world.areas.find((x) => x.id === focus) : undefined;
		let sub = "";
		if (a) {
			sub = a.kind === "project" ? "" : this.#theme.words.subs[a.kind];
			if (a.kind === "project") {
				const list = flat(snapshot.sessions).filter((s) => s.project === a.name);
				const out = list.reduce((n, s) => n + crewOf(s.agents).filter((x) => x.status === "running").length, 0);
				sub = `${list.length} session${list.length === 1 ? "" : "s"}${out ? ` · ${out} agent${out === 1 ? "" : "s"} out` : ""}`;
			}
		}
		const sig = a ? `${a.id}|${sub}|${a.rect.x},${a.rect.y},${a.rect.w},${a.rect.h}` : "";
		if (sig === this.#labelSig) return;
		this.#labelSig = sig;
		for (const item of this.#tabs.values()) drop(item.view);
		this.#tabs.clear();
		if (!a || !sub) return;
		const p = pill(sub, 15);
		const lh = this.#theme.light.decal.size * 1.18;
		const y = a.band === "top" ? a.rect.y + a.rect.h + DECAL.gap + (lh - p.height) / 2 : a.rect.y - DECAL.gap - lh + (lh - p.height) / 2;
		p.position.set(a.rect.x + a.rect.w - DECAL.pad - p.width, y);
		this.#labels.addChild(p);
		this.#tabs.set(a.id, { view: p, sig });
		this.#opts.wake();
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

/** A room's cached layer's extent: the room, and its name painted in the hallway beyond it. */
const roomBounds = (r: Rect): Rect => ({ x: r.x, y: r.y - 70, w: r.w, h: r.h + 140 });

const differs = (a: View, b: View) => Math.abs(a.scale - b.scale) > 1e-4 || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5;

const flat = (list: Session[]): Session[] => list.flatMap((s) => [s, ...flat(s.children)]);

/** A build running in a session: its own shell command, or one of its agents'. */
const buildRunning = (s: Session): boolean => {
	const agent = (a: Session["agents"][number]): boolean => a.running?.kind === "build" || a.children.some(agent);
	return s.running?.kind === "build" || s.agents.some(agent);
};

function* walk(c: Container): Generator<Container> {
	yield c;
	for (const child of c.children) yield* walk(child);
}
const texts = (c: Container) => [...walk(c)].filter((x): x is Text => x instanceof Text);
const baked = (c: Container) => [...walk(c)].filter((x): x is Baked => x instanceof Baked);

/** A desk's name card: the session's title, and a line of facts (first the lead's name, when it is
 * a regular you'd recognise: decor.ts). */
function deskCard(s: Session, name?: string): [string, string] {
	const out = crewOf(s.agents).filter((a) => a.status === "running").length;
	const facts = [name, s.state, s.branch ?? s.worktree, out ? `${out} out` : ""].filter(Boolean);
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
function setDown(view: Graphics, delay = 0): BrickMove {
	const x = view.x;
	const y = view.y;
	const r = view.rotation;
	return {
		view,
		ms: 300,
		t: -delay,
		delay,
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
		delay: 0,
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
	m.view.visible = t >= 0;
	const p = m.at(Math.min(1, Math.max(0, t) / m.ms));
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
