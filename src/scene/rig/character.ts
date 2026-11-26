// The rig behind the office's Character interface (src/scene/office/slot.ts): one mochi puppet per
// character. Without a director it acts out its mood; with one (S4) it takes cues: a pose, and a
// walk along the hallway to get there first.
//
// A walk has a start, a turn and a stop (plan-alive stream B). The feet stay put for the walk's
// first moment while the face looks where it is going; the distance eases in and out inside the
// walk's own ms and corners are rounded (both in world/paths.ts, so the director knows where
// everyone is); a change of direction is a quick front-facing turn, not a mirror flip; and on
// arrival the walker plants for a beat, looking ahead, before its eyes go to the job.
import { along, heading, lookMs } from "../world/paths";
import type { Character, CharacterFactory, Slot } from "../office/slot";
import type { Cue, Mood, Who } from "../contract";
import { setDepth } from "../office/depth";
import type { Atlas } from "./atlas";
import { choosePose, hash } from "./data/player";
import { BEAT_MS } from "./data/poses";
import { Puppet } from "./puppet";
import { COSTUMES, type Regular, regularOf, roleFor } from "./data/roles";
import { PUPPET_HEIGHT } from "./data/reach";
import { ACCENTS } from "./theme";
import { AT_VIEWER, type Aim, type LookAt, aimAt, eyesOf, isViewer } from "./data/gaze";
import { LOOKS } from "./data/vocab";

/** Everyone one factory made, by key: so a character told to look at another can find it. */
type Cast = Map<string, RigCharacter>;

const TRIGGER = { busy: "busy", idle: "idle", stalled: "stalled", done: "finished" } as const;

/** A poke's reactions: a wave or a look up at you; poked again and again, a grump. */
const POKE = {
	reactions: ["wave", "lookUp", "nod"],
	grumpy: ["grumpy"],
	grumpyAfter: 3,
	/** Pokes closer together than this count as "again". */
	againMs: 4000,
	minMs: 900,
} as const;
const MS_PER_TICK = 1000 / 60;

const WALKING = {
	/** A turn: the face comes round to the front, the body flips at the midpoint, the face goes on
	 * round to the new side. */
	turnMs: 120,
	/** Standing still on arrival, looking ahead, before the eyes go to the job. */
	plantMs: BEAT_MS,
	/** How far the face looks along the way it is going, in rig units (a pose's full side look). */
	look: LOOKS.right[0],
	/** A direction of travel turns the walker only when it is this sideways (a unit vector's x):
	 * straight up or down a corridor keeps the way it faced. */
	sideways: 0.3,
} as const;

class RigCharacter implements Character {
	readonly puppet: Puppet;
	#who: Who;
	#regular?: Regular;
	/** The way it faces as drawn (the scale's sign). */
	#facing: 1 | -1 = 1;
	#slot?: Slot;
	#cue?: Cue;
	/** The walk in progress: ms walked so far. */
	#walked = 0;
	#walkFrom = 0;
	/** The walk pose is on: the feet have started moving. */
	#stepping = false;
	#gone = false;
	// Gaze: what the director's cue says to look at (rig/data/gaze.ts), and the cast to find it in.
	#lookAt?: LookAt;
	#cast: Cast;
	/** A turn under way: the way it is turning to, and ms into it. */
	#turn?: { to: 1 | -1; ms: number };
	/** Ms left of the plant on arrival. */
	#plant = 0;
	/** The gaze this walking code last set, so it only ever clears its own. */
	#aimed?: readonly [number, number];
	/** A poke's reaction playing: ms left of it, and how many pokes came close together. */
	#poked = 0;
	#pokes = 0;
	#pokedAt = -Infinity;
	#clock = 0;
	/** Looking out at you for a photo until this time on `#clock`. */
	#smileUntil = -Infinity;

	constructor(atlas: Atlas, who: Who, cast: Cast = new Map()) {
		this.#who = who;
		this.#cast = cast;
		cast.set(who.key, this);
		const role = who.kind === "lead" ? "lead" : (who.look ?? roleFor(who.role));
		// The office draws real desks, so the rig's own stays off. A regular (rig/data/roles.ts) is the same
		// puppet every day: its key is the puppet's id, and it wears its accessory.
		const regular = who.regular ? regularOf(who.regular) : undefined;
		this.puppet = new Puppet(atlas, {
			id: regular?.key ?? who.key,
			role,
			accent: ACCENTS[hash(who.tint) % ACCENTS.length],
			desk: false,
			...(who.plump ? { plump: who.plump } : {}),
			...(regular?.wear ? { wear: regular.wear } : {}),
		});
		this.#regular = regular;
		this.#size();
		this.puppet.weather = who.weather;
		this.#act(who.mood, true);
	}

	get view() {
		return this.puppet;
	}

	get moving(): boolean {
		const w = this.#cue?.walk;
		return !!w && !this.#gone && this.#walked < w.ms;
	}

	get animating(): boolean {
		if (this.#gone) return false;
		return this.moving || this.#turn !== undefined || this.#plant > 0 || this.puppet.animating;
	}

	set life(on: boolean) {
		this.puppet.life = on;
	}

	get ambient(): boolean {
		return !this.moving && (this.#who.mood === "idle" || this.#who.mood === "done");
	}

	get alive(): boolean {
		return !this.#gone && this.puppet.alive;
	}

	update(who: Who): void {
		const prev = this.#who;
		this.#who = who;
		if (who.size !== prev.size) this.#size();
		this.puppet.plump = who.plump;
		this.puppet.weather = who.weather;
		// With a director, cues choose the pose; on its own, the mood does.
		if (!this.#cue && who.mood !== prev.mood) this.#act(who.mood, false);
		this.puppet.alpha = who.mood === "done" ? 0.75 : 1;
	}

	place(slot: Slot): void {
		const first = !this.#slot;
		this.#slot = slot;
		if (this.moving) return;
		this.puppet.position.set(slot.x, slot.y);
		// Turning to face a new way where it stands is a turn too; the first placing just is.
		if (first) this.#face(slot.facing);
		else this.#turnTo(slot.facing);
		this.#size();
	}

	act(cue: Cue): void {
		this.#lookAt = cue.lookAt;
		this.#look();
		if (this.#cue?.key === cue.key) {
			// Same pose, maybe a new pace: speed up or slow down without starting over.
			if ((cue.tempo ?? 1) !== (this.#cue.tempo ?? 1)) {
				this.#cue = cue;
				if (!this.moving) this.puppet.setTempo(cue.tempo ?? 1);
			}
			return;
		}
		const first = !this.#cue;
		this.#cue = cue;
		this.#gone = false;
		this.#plant = 0;
		this.puppet.visible = true;
		this.#walkFrom = cue.walk?.elapsed ?? 0;
		this.#walked = this.#walkFrom;
		this.#stepping = false;
		if (cue.walk && this.#walked < cue.walk.ms) {
			const look = lookMs(cue.walk.ms);
			if (this.#walked >= look || first) {
				// Already under way (or first seen mid-walk): straight into the stride, facing the way it goes.
				this.#step(first);
				this.#walkTo(this.#walked, true);
			} else {
				// The start: the feet wait while it turns to where it is going and looks there.
				const h = heading(cue.walk.path);
				if (Math.abs(h.x) >= WALKING.sideways) this.#turnTo(h.x < 0 ? -1 : 1);
				this.#walkTo(this.#walked, false);
			}
		} else {
			this.#turn = undefined;
			this.#pose(first);
		}
		// A new hire buds off its boss: it swells from a bead as the hand-over starts.
		if (first && cue.pose === "handover" && cue.as === "partner") this.puppet.bud();
		this.#aim();
	}

	tick(dt: number): void {
		const ms = dt * MS_PER_TICK;
		this.#clock += ms;
		if (this.#poked > 0) {
			this.#poked -= ms;
			// The reaction is over: back to the cue (or the mood) it was playing.
			if (this.#poked <= 0 && !this.moving) {
				this.#poked = 0;
				if (this.#cue) this.#pose(false);
				else this.#act(this.#who.mood, false);
			}
		}
		const w = this.#cue?.walk;
		if (w && !this.#gone && this.#walked < w.ms) {
			this.#walked = Math.min(w.ms, this.#walked + ms);
			if (!this.#stepping && this.#walked >= lookMs(w.ms)) this.#step(false);
			this.#walkTo(this.#walked, false);
			if (this.#walked >= w.ms) {
				if (w.exit) {
					// Out of the door: gone until the director drops it.
					this.#gone = true;
					this.puppet.visible = false;
					this.#turn = undefined;
					return;
				}
				if (this.#slot) this.place(this.#slot);
				this.#pose(false);
				this.#plant = WALKING.plantMs;
			}
		} else if (this.#plant > 0) this.#plant = Math.max(0, this.#plant - ms);
		if (this.#turn) {
			this.#turn.ms += ms;
			// Round to the front, flip at the midpoint, on round to the new side.
			if (this.#turn.ms >= WALKING.turnMs / 2 && this.#facing !== this.#turn.to) {
				this.#facing = this.#turn.to;
				this.#size();
			}
			if (this.#turn.ms >= WALKING.turnMs) this.#turn = undefined;
		}
		this.#look();
		this.#aim();
		this.puppet.tick(dt);
	}

	rewind(): void {
		this.#walked = this.#walkFrom;
		this.#gone = false;
		this.#plant = 0;
		this.#turn = undefined;
		this.#stepping = false;
		this.puppet.visible = true;
		const w = this.#cue?.walk;
		if (w && this.moving) {
			if (this.#walked >= lookMs(w.ms)) this.#step(true);
			else {
				// Still looking where it will go: already turned that way.
				this.puppet.rewind();
				const h = heading(w.path);
				if (Math.abs(h.x) >= WALKING.sideways) this.#face(h.x < 0 ? -1 : 1);
			}
			this.#walkTo(this.#walked, true);
		} else {
			if (this.#slot) this.#face(this.#slot.facing);
			this.puppet.rewind();
		}
		this.#aim();
	}

	/** Clicked: a jelly wobble, and a reaction picked by hashing the key, grumpy if poked
	 * again and again. A walker only wobbles; the walk goes on. */
	smile(ms: number): void {
		this.#smileUntil = this.#clock + ms;
		this.#look();
	}

	poke(): void {
		this.puppet.jiggle();
		if (this.moving || this.#gone) return;
		this.#pokes = this.#clock - this.#pokedAt < POKE.againMs ? this.#pokes + 1 : 1;
		this.#pokedAt = this.#clock;
		const list = this.#pokes >= POKE.grumpyAfter ? POKE.grumpy : POKE.reactions;
		const pose = list[hash(`${this.#who.key}:poke:${this.#pokes}`) % list.length]!;
		this.puppet.play(pose, { loops: 1 });
		this.#poked = Math.max(POKE.minMs, this.puppet.playMs);
	}

	inspect() {
		const s = this.puppet.state();
		const w = this.#cue?.walk;
		return {
			mood: this.#who.mood,
			...(this.#regular ? { regular: this.#regular.key, name: this.#regular.name, wear: this.#regular.wear ?? "" } : {}),
			size: Math.round(this.#who.size),
			lift: Math.round(this.puppet.lift * 100) / 100,
			plump: `${s.plump}${s.ripe ? " ripe" : ""}`,
			weather: this.puppet.weather ?? "",
			role: s.role,
			pose: s.pose,
			frame: s.frame,
			frames: s.frames,
			beat: s.beat,
			params: Object.entries(s.params)
				.map(([k, v]) => `${k}:${v}`)
				.join(" "),
			spot: this.#cue?.spot ?? "",
			cue: this.#cue?.pose ?? "",
			tempo: Math.round(this.puppet.tempo * 100) / 100,
			lookAt: lookAtText(this.#lookAt),
			look: aimText(this.puppet.aimed),
			walk: w && this.moving ? `${Math.round(this.#walked)}/${w.ms}ms${w.exit ? " exit" : ""}${this.#stepping ? "" : " look"}` : "",
			facing: this.#facing,
			turn: this.#turn ? `${this.#turn.to < 0 ? "left" : "right"} ${Math.round(this.#turn.ms)}/${WALKING.turnMs}ms` : "",
			plant: Math.round(this.#plant),
		};
	}

	destroy(): void {
		if (this.#cast.get(this.#who.key) === this) this.#cast.delete(this.#who.key);
		this.puppet.destroy({ children: true });
	}

	// Gaze ------------------------------------------------------------------------------------------

	/** Where this character's face is in the world, for someone looking at it. */
	get face(): { x: number; y: number } {
		return eyesOf(this.puppet.position, this.#who.size);
	}

	/** Point the face at the cue's `lookAt`, in rig units against the way it faces now. Not while
	 * walking (the walk looks where it goes), and nothing to look at is no aim. */
	#look(): void {
		// The walk's own looks (setting off, a turn, the plant on arrival) win while they last.
		const walking = this.moving || this.#gone || this.#turn !== undefined || this.#plant > 0;
		// Say cheese: out of the screen while a photo is taken.
		if (!walking && this.#clock < this.#smileUntil) return this.puppet.aim(AT_VIEWER);
		this.puppet.aim(walking ? undefined : this.#aimFor(this.#lookAt));
	}

	#aimFor(at: LookAt | undefined): Aim | undefined {
		if (at === undefined) return undefined;
		if (isViewer(at)) return AT_VIEWER;
		const to = typeof at === "string" ? this.#cast.get(at)?.face : at;
		return to ? aimAt(this.face, this.#facing, to) : undefined;
	}

	/** The feet start: the walk pose on. */
	#step(snap: boolean): void {
		this.#stepping = true;
		this.puppet.play(this.#cue?.walkPose ?? "walk", { snap, tempo: this.#cue?.walkTempo });
	}

	#walkTo(ms: number, snapFacing: boolean): void {
		const w = this.#cue!.walk!;
		const p = along(w.path, ms, w.ms);
		this.puppet.position.set(p.x, p.y);
		setDepth(this.puppet, p.y);
		if (this.#stepping && Math.abs(p.dx) >= WALKING.sideways) {
			const f = p.dx < 0 ? -1 : 1;
			if (snapFacing) this.#face(f);
			else this.#turnTo(f);
		}
		this.#size();
	}

	/** Face a way at once, with no turn (a first appearance, a rewind). */
	#face(f: 1 | -1): void {
		this.#turn = undefined;
		this.#facing = f;
		this.#size();
	}

	/** Turn to face a way: a quick turn through the front, unless it already faces (or is turning) that way. */
	#turnTo(f: 1 | -1): void {
		if (this.#turn) {
			if (this.#turn.to === f) return;
			// Turning back before the flip: it never left this side.
			if (this.#facing === f) this.#turn = undefined;
			else this.#turn = { to: f, ms: 0 };
			return;
		}
		if (this.#facing !== f) this.#turn = { to: f, ms: 0 };
	}

	/**
	 * Where the walking puts the face, through the puppet's gaze (rig units on top of the pose's own
	 * look): to the front through a turn, where it is going before the feet move, straight ahead for
	 * the plant. Otherwise it leaves the gaze alone, so the pose's look (the job) takes over.
	 */
	#aim(): void {
		const [lx, ly] = LOOKS[this.puppet.frame.look];
		let at: readonly [number, number] | undefined;
		const w = this.#cue?.walk;
		if (this.#turn) at = [-lx, -ly * 0.5];
		else if (w && this.moving && !this.#stepping) {
			const h = heading(w.path);
			// Ahead in its own facing (it turned to the way it goes), and up or down with the path.
			at = [Math.abs(h.x) * WALKING.look - lx, h.y * WALKING.look * 0.6 - ly];
		} else if (this.#plant > 0) at = [WALKING.look - lx, -ly];
		if (at) {
			const r: readonly [number, number] = [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10];
			this.#aimed = r;
			this.puppet.gaze(r);
		} else if (this.#aimed) {
			this.#aimed = undefined;
			this.puppet.gaze(undefined);
		}
	}

	#pose(first: boolean): void {
		const c = this.#cue!;
		this.puppet.play(c.pose, { as: c.as, loops: c.loops, at: c.at, snap: first || c.at === "end", tempo: c.tempo });
	}

	#size(): void {
		const s = (this.#who.size / PUPPET_HEIGHT) * COSTUMES[this.puppet.role].scale;
		this.puppet.scale.set(s * this.#facing, s);
	}

	/** A character found idle is already mid-habit, settled, and costs nothing to draw; one that goes
	 * idle while watched plays its habit through, then settles. */
	#act(mood: Mood, first: boolean): void {
		this.puppet.play(choosePose(TRIGGER[mood], this.#who.key, this.puppet.role), { snap: first, at: first && mood !== "busy" ? "end" : "start" });
		this.puppet.alpha = mood === "done" ? 0.75 : 1;
	}
}

/** A factory of mochi characters drawing from `atlas`. */
export function rigCharacters(atlas: Atlas): CharacterFactory {
	const cast: Cast = new Map();
	return (who) => new RigCharacter(atlas, who, cast);
}

const lookAtText = (l: LookAt | undefined) =>
	l === undefined ? "" : typeof l === "string" ? l : isViewer(l) ? "viewer" : `${Math.round(l.x)},${Math.round(l.y)}`;
const aimText = (a: Aim | undefined) => (a ? `${a.x},${a.y}${a.side ? " side" : ""}` : "");
