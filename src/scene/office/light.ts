// The light layer: time of day, lamps, focus and rush, over the floor, the furniture and the cast.
// It is re-made only when what it shows changes (the phase, which desks are lit, where the camera
// stops), never per frame, in two parts:
//   map    multiplied over everything below: each area's ambient light for the phase, darker for
//          vacant rooms and empty desks, brought back up by desk lamps and overhead lights, and the
//          rooms the camera isn't on dimmed so the focused one reads as a stage
//   glow   added on top: warm halos round busy desks after dark, sunlight patches under the windows
//          in the morning and late afternoon: a few soft sprites and shapes where they fall (not a
//          building-sized texture, so they cost fill only where there is light to add)
// The map is drawn at a fraction of world resolution (light is soft) and stretched over the
// building, so the whole layer is a couple of draw calls and one building-sized pass. A room in
// rush flickers its overhead light: a sprite over the room, multiplied, its alpha stepping on the
// acting frames (only while life is on).
import { Container, Graphics, type Renderer, RenderTexture, Sprite, Texture } from "pixi.js";
import { LAMPS_ON, type Phase, SUNLIGHT, flicker } from "../world/daylight";

import { hash } from "./paper";
import type { SceneLight } from "../theme/types";
import type { Area, Rect, World } from "../world/world";

/** Light-map texels per world pixel, at most (a big office gets fewer, to stay under MAX_SIDE). */
const SCALE = 1 / 6;
const MAX_SIDE = 2048;
/** Around the slab, so its edge and the building's shadow are lit too. */
const PAD = 40;
/** At a room or desk stop, the rest of the building is this bright. */
const FOCUS_DIM = 0.66;

export interface LightInput {
	light: SceneLight;
	phase: Phase;
	world: World;
	/** The area the camera is on (a room stop, or a desk's room), if any. */
	focus?: string;
	/** Each session's desk, and its state ("busy", "idle"). */
	desks: { id: string; state: string }[];
	/** Areas with someone in them: their overhead light is on after dark. */
	occupied: Set<string>;
}

/** What the inspector reports. */
export interface LightInfo {
	lamps: number;
	overhead: number;
	glow: boolean;
	bakes: number;
	rush: string[];
}

// --- Colour -----------------------------------------------------------------------------------

const ch = (c: number, s: number) => (c >> s) & 0xff;
const rgb = (f: (s: number) => number) => (clamp(f(16)) << 16) | (clamp(f(8)) << 8) | clamp(f(0));
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
/** a × b, channel by channel (as multiply blending does). */
export const mul = (a: number, b: number) => rgb((s) => (ch(a, s) * ch(b, s)) / 255);
/** a scaled by k. */
const scale = (a: number, k: number) => rgb((s) => ch(a, s) * k);
/** From a to b, t of the way. */
export const mix = (a: number, b: number, t: number) => rgb((s) => ch(a, s) + (ch(b, s) - ch(a, s)) * t);
/** How far b is above a, per channel (what adding brings a up to b). */
const lift = (a: number, b: number) => rgb((s) => Math.max(0, ch(b, s) - ch(a, s)));
const grey = (v: number) => scale(0xffffff, v);

// --- The soft pool ------------------------------------------------------------------------------

let pool: Texture | undefined;

/** A soft round pool of light: white in the middle, falling off to nothing at the edge. */
function poolTexture(): Texture {
	if (pool) return pool;
	const size = 128;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const c = canvas.getContext("2d")!;
	const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	grad.addColorStop(0, "rgba(255,255,255,1)");
	grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
	grad.addColorStop(1, "rgba(255,255,255,0)");
	c.fillStyle = grad;
	c.fillRect(0, 0, size, size);
	pool = Texture.from(canvas);
	return pool;
}

// --- The layer ----------------------------------------------------------------------------------

export class Light extends Container {
	#renderer: Renderer;
	#map = new Sprite();
	#glow = new Container();
	#flicker = new Container();
	#mapRT?: RenderTexture;
	#sig = "";
	#info: LightInfo = { lamps: 0, overhead: 0, glow: false, bakes: 0, rush: [] };
	#rush = new Map<string, Sprite>();
	#t = 0;

	constructor(renderer: Renderer) {
		super({ label: "light" });
		this.#renderer = renderer;
		this.#map.blendMode = "multiply";
		this.#map.visible = false;
		this.#glow.visible = false;
		// Multiplied things together (the map, then the flickers), so they batch; the glow after.
		this.addChild(this.#map, this.#flicker, this.#glow);
	}

	get info(): LightInfo {
		return { ...this.#info, rush: [...this.#rush.keys()] };
	}

	/** Re-bake the map and the glow if anything they show changed. True if it re-baked. */
	update(input: LightInput): boolean {
		const sig = signature(input);
		if (sig === this.#sig) return false;
		this.#sig = sig;
		this.#bake(input);
		return true;
	}

	/** Rooms in rush (area ids): each gets a flickering overhead light while the set holds. */
	rush(areas: { id: string; rect: Rect }[]): void {
		const seen = new Set<string>();
		for (const a of areas) {
			seen.add(a.id);
			let s = this.#rush.get(a.id);
			if (!s) {
				s = new Sprite(Texture.WHITE);
				s.tint = 0x000000;
				s.blendMode = "multiply";
				// Off by alpha, not visible: the flicker would rebuild the world every frame (depth.ts).
				s.alpha = 0;
				this.#rush.set(a.id, s);
				this.#flicker.addChild(s);
			}
			s.position.set(a.rect.x, a.rect.y);
			s.setSize(a.rect.w, a.rect.h);
		}
		for (const [id, s] of this.#rush) {
			if (seen.has(id)) continue;
			s.destroy();
			this.#rush.delete(id);
		}
	}

	/** True while a rush room's light flickers (it needs the acting frames). */
	get flickering(): boolean {
		return this.#rush.size > 0;
	}

	/** Advance the flicker by `ms` (only called while life is on); `off` puts every light back on. */
	tick(ms: number, off = false): void {
		this.#t += ms;
		for (const [id, s] of this.#rush) {
			const a = off ? 0 : flicker(this.#t, hash(id));
			s.alpha = a;
		}
	}

	/** Back to the start of the flicker (the inspector's freeze); `off`: steady, as in calm mode. */
	rewind(off = false): void {
		this.#t = 0;
		this.tick(0, off);
	}

	#bake(input: LightInput): void {
		const { world, light, phase } = input;
		const b = world.bounds;
		const r = { x: b.x - 14 - PAD, y: b.y - 14 - PAD, w: b.w + 28 + PAD * 2, h: b.h + 28 + PAD * 2 };
		const k = Math.min(SCALE, MAX_SIDE / Math.max(r.w, r.h));
		const w = Math.max(1, Math.ceil(r.w * k));
		const h = Math.max(1, Math.ceil(r.h * k));
		if (!this.#mapRT || this.#mapRT.width !== w || this.#mapRT.height !== h) {
			this.#mapRT?.destroy(true);
			this.#mapRT = RenderTexture.create({ width: w, height: h, resolution: 1 });
			this.#map.texture = this.#mapRT;
		}
		this.#map.position.set(r.x, r.y);
		this.#map.scale.set(r.w / w, r.h / h);
		const on = LAMPS_ON[phase];
		const ambient = light.ambient[phase];
		const lamps = { lamps: 0, overhead: 0 };

		// The map: ambient everywhere, then the lights added, then everything off-stage dimmed.
		const map = stage(r, k);
		const base = new Graphics();
		map.inner.addChild(base);
		// Outside the slab is the lawn, lit on its own (office/outside.ts): left as it is here.
		base.rect(r.x, r.y, r.w, r.h).fill(0xffffff);
		base.rect(b.x - 14, b.y - 14, b.w + 28, b.h + 28).fill(ambient);
		base.rect(world.hallway.x, world.hallway.y, world.hallway.w, world.hallway.h).fill(light.hall[phase]);
		// The footprint's gaps are outside (a patio, a yard): lit like the lawn.
		for (const y of world.yards ?? []) base.rect(y.rect.x, y.rect.y, y.rect.w, y.rect.h).fill(light.outside[phase]);
		const areaLight = (a: Area) => (a.kind === "vacant" ? mul(ambient, grey(1 - (1 - light.vacant) * (0.4 + 0.6 * on))) : ambient);
		for (const a of world.areas) base.rect(a.rect.x, a.rect.y, a.rect.w, a.rect.h).fill(areaLight(a));
		// Empty desks sit a shade darker than the ones in use, at any hour: a soft shadow where no
		// one works (multiplied through the pool's falloff, so it has no edge).
		for (const a of world.areas) {
			if (a.kind !== "project" && a.kind !== "vacant") continue;
			const taken = new Set(a.desks.map((d) => `${d.cell.x},${d.cell.y}`));
			const rows = new Set(a.desks.map((d) => d.cell.y));
			for (const c of a.cells) {
				if (taken.has(`${c.x},${c.y}`) || !rows.has(c.y)) continue;
				const s = new Sprite(poolTexture());
				s.anchor.set(0.5);
				s.position.set(c.x + c.w / 2, c.y + 60);
				s.setSize(c.w * 1.1, c.h * 1.1);
				s.tint = grey(0.88 - 0.1 * on);
				s.blendMode = "multiply";
				map.inner.addChild(s);
			}
		}
		const add = (x: number, y: number, rx: number, ry: number, tint: number) => {
			if (tint === 0) return;
			const s = new Sprite(poolTexture());
			s.anchor.set(0.5);
			s.position.set(x, y);
			s.setSize(rx * 2, ry * 2);
			s.tint = tint;
			s.blendMode = "add";
			map.inner.addChild(s);
		};
		const states = new Map(input.desks.map((d) => [d.id, d.state]));
		for (const a of world.areas) {
			const lit = a.desks.filter((d) => states.get(d.id) === "busy").length;
			const live = a.kind === "project" ? (lit ? 1 : a.desks.length ? 0.45 : 0) : input.occupied.has(a.id) ? 0.85 : a.kind === "lobby" ? 0.3 : 0;
			if (live > 0 && on > 0) {
				lamps.overhead++;
				const up = scale(lift(areaLight(a), light.lamp), live * on * 0.55);
				const fx = a.rect.x + 13;
				const fw = a.rect.w - 26;
				const fy = a.floorY;
				const fh = a.rect.y + a.rect.h - fy;
				if (light.overhead === "strips" && a.kind === "project") {
					// A fluorescent tube over each row of desks.
					const rows = [...new Set(a.cells.map((c) => c.y))];
					for (const y of rows) add(fx + fw / 2 + 40, y + 70, fw * 0.62, 70, up);
				} else if (light.overhead === "strips") add(fx + fw / 2, fy + fh / 2, fw * 0.6, Math.min(fh * 0.5, 110), up);
				else add(fx + fw / 2, fy + fh / 2, fw * 0.62, fh * 0.62, up);
			}
			for (const d of a.desks) {
				const st = states.get(d.id);
				const level = st === "busy" ? 1 : 0.4;
				if (on <= 0) continue;
				lamps.lamps++;
				add(d.at.x, d.at.y - 24, 120 * (0.8 + 0.2 * level), 95 * (0.8 + 0.2 * level), scale(lift(areaLight(a), light.lamp), level * on));
			}
		}
		// Focus: everything but the stage, a step darker.
		if (input.focus) {
			const dim = new Graphics();
			const f = world.areas.find((a) => a.id === input.focus);
			for (const a of world.areas) if (a !== f) dim.rect(a.rect.x, a.rect.y, a.rect.w, a.rect.h);
			dim.rect(world.hallway.x, world.hallway.y, world.hallway.w, world.hallway.h);
			dim.fill(grey(FOCUS_DIM));
			dim.blendMode = "multiply";
			map.inner.addChild(dim);
		}
		this.#renderer.render({ container: map.root, target: this.#mapRT!, clear: true });
		map.root.destroy({ children: true, context: true });
		this.#map.visible = true;

		// The glow: halos round busy desks after dark, and sun through the windows.
		for (const c of this.#glow.removeChildren()) c.destroy({ context: true });
		let glowed = false;
		const halo = phase === "night" ? 0.3 : phase === "dusk" ? 0.16 : 0;
		if (halo > 0) {
			for (const a of world.areas) {
				for (const d of a.desks) {
					if (states.get(d.id) !== "busy") continue;
					const s = new Sprite(poolTexture());
					s.anchor.set(0.5);
					s.position.set(d.at.x, d.at.y - 40);
					s.setSize(150, 110);
					s.tint = light.glow;
					s.alpha = halo * (input.focus && a.id !== input.focus ? FOCUS_DIM : 1);
					s.blendMode = "add";
					this.#glow.addChild(s);
					glowed = true;
				}
			}
		}
		const sun = SUNLIGHT[phase];
		if (sun) {
			const g = new Graphics();
			for (const a of world.areas) {
				const fade = input.focus && a.id !== input.focus ? FOCUS_DIM : 1;
				for (const wi of a.wall) {
					if (wi.kind !== "window") continue;
					// The patch the window throws on the floor: from the foot of the wall, slanted by the sun.
					const len = Math.min(150, a.rect.y + a.rect.h - a.floorY - 10);
					const x0 = wi.rect.x + 6;
					const x1 = wi.rect.x + wi.rect.w - 6;
					const y0 = a.floorY + 2;
					const dx = sun.slant * len;
					const left = Math.max(a.rect.x + 14, Math.min(x0, x0 + dx));
					const right = Math.min(a.rect.x + a.rect.w - 14, Math.max(x1, x1 + dx));
					const clampX = (v: number) => Math.max(left, Math.min(right, v));
					g.poly([clampX(x0), y0, clampX(x1), y0, clampX(x1 + dx), y0 + len, clampX(x0 + dx), y0 + len]).fill({ color: light.sun, alpha: sun.alpha * fade });
					glowed = true;
				}
			}
			g.blendMode = "add";
			this.#glow.addChild(g);
		}
		this.#glow.visible = glowed;
		this.#info = { ...lamps, glow: glowed, bakes: this.#info.bakes + 1, rush: [] };
	}
}

/** A container that draws world coordinates into the light map's texels. */
function stage(r: Rect, k: number): { root: Container; inner: Container } {
	const root = new Container();
	const inner = new Container();
	inner.scale.set(k);
	inner.position.set(-r.x * k, -r.y * k);
	root.addChild(inner);
	return { root, inner };
}

/** What the light shows: the map is re-baked only when this changes. */
function signature(i: LightInput): string {
	const w = i.world;
	return JSON.stringify([
		i.phase,
		i.light.lamp,
		i.light.overhead,
		i.focus ?? "",
		w.bounds,
		w.areas.map((a) => [a.id, a.kind, a.rect.x, a.rect.y, a.rect.w, a.rect.h, a.cells.length, a.desks.map((d) => d.id).join(",")]),
		[...i.desks].sort((a, b) => (a.id < b.id ? -1 : 1)).map((d) => `${d.id}:${d.state === "busy" ? 1 : 0}`),
		[...i.occupied].sort(),
	]);
}
