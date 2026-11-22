// The rig behind the office's Character interface (src/scene/office/slot.ts): one mochi puppet per
// character. Without a director it acts out its mood; with one (S4) it takes cues: a pose, and a
// walk along the hallway to get there first.
import type { Character, CharacterFactory, Cue, Mood, Slot, Who } from "../office/slot";
import type { Atlas } from "./atlas";
import { choosePose, hash } from "./player";
import { Puppet } from "./puppet";
import { COSTUMES, roleFor } from "./roles";
import { PUPPET_HEIGHT } from "./reach";
import { ACCENTS } from "./theme";
import { AT_VIEWER, type Aim, type LookAt, aimAt, eyesOf, isViewer } from "./gaze";

export { PUPPET_HEIGHT };

/** Everyone one factory made, by key: so a character told to look at another can find it. */
type Cast = Map<string, RigCharacter>;

const TRIGGER = { busy: "busy", idle: "idle", stalled: "stalled", done: "finished" } as const;
const MS_PER_TICK = 1000 / 60;

/** Where a walker is `ms` into a walk along `path` lasting `total` ms. */
function along(path: { x: number; y: number }[], ms: number, total: number) {
	const segs = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
	const len = segs.reduce((a, b) => a + b, 0);
	let d = total <= 0 ? len : Math.min(1, Math.max(0, ms / total)) * len;
	for (let i = 0; i < segs.length; i++) {
		const a = path[i]!;
		const b = path[i + 1]!;
		if (d <= segs[i]! || i === segs.length - 1) {
			const t = segs[i]! > 0 ? Math.min(1, d / segs[i]!) : 1;
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: b.x - a.x };
		}
		d -= segs[i]!;
	}
	const last = path[path.length - 1] ?? { x: 0, y: 0 };
	return { x: last.x, y: last.y, dx: 0 };
}

class RigCharacter implements Character {
	readonly puppet: Puppet;
	#who: Who;
	#facing: 1 | -1 = 1;
	#slot?: Slot;
	#cue?: Cue;
	/** The walk in progress: ms walked so far. */
	#walked = 0;
	#walkFrom = 0;
	#gone = false;
	// Gaze: what the director's cue says to look at (rig/gaze.ts), and the cast to find it in.
	#lookAt?: LookAt;
	#cast: Cast;

	constructor(atlas: Atlas, who: Who, cast: Cast = new Map()) {
		this.#who = who;
		this.#cast = cast;
		cast.set(who.key, this);
		const role = who.kind === "lead" ? "lead" : roleFor(who.role);
		// The office draws real desks, so the rig's own stays off.
		this.puppet = new Puppet(atlas, { id: who.key, role, accent: ACCENTS[hash(who.tint) % ACCENTS.length], desk: false });
		this.#size();
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
		return this.moving || (!this.#gone && this.puppet.animating);
	}

	set life(on: boolean) {
		this.puppet.life = on;
	}

	get alive(): boolean {
		return !this.#gone && this.puppet.alive;
	}

	update(who: Who): void {
		const prev = this.#who;
		this.#who = who;
		if (who.size !== prev.size) this.#size();
		// With a director, cues choose the pose; on its own, the mood does.
		if (!this.#cue && who.mood !== prev.mood) this.#act(who.mood, false);
		this.puppet.alpha = who.mood === "done" ? 0.75 : 1;
	}

	place(slot: Slot): void {
		this.#slot = slot;
		if (this.moving) return;
		this.puppet.position.set(slot.x, slot.y);
		this.#facing = slot.facing;
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
		this.puppet.visible = true;
		this.#walkFrom = cue.walk?.elapsed ?? 0;
		this.#walked = this.#walkFrom;
		if (cue.walk && this.#walked < cue.walk.ms) {
			this.puppet.play(cue.walkPose ?? "walk", { snap: first, tempo: cue.walkTempo });
			this.#walkTo(this.#walked);
		} else this.#pose(first);
	}

	tick(dt: number): void {
		const w = this.#cue?.walk;
		if (w && !this.#gone && this.#walked < w.ms) {
			this.#walked = Math.min(w.ms, this.#walked + dt * MS_PER_TICK);
			this.#walkTo(this.#walked);
			if (this.#walked >= w.ms) {
				if (w.exit) {
					// Out of the door: gone until the director drops it.
					this.#gone = true;
					this.puppet.visible = false;
					return;
				}
				if (this.#slot) this.place(this.#slot);
				this.#pose(false);
			}
		}
		this.#look();
		this.puppet.tick(dt);
	}

	rewind(): void {
		this.#walked = this.#walkFrom;
		this.#gone = false;
		this.puppet.visible = true;
		if (this.moving) {
			this.puppet.play(this.#cue?.walkPose ?? "walk", { snap: true, tempo: this.#cue?.walkTempo });
			this.#walkTo(this.#walked);
		} else this.puppet.rewind();
	}

	inspect() {
		const s = this.puppet.state();
		const w = this.#cue?.walk;
		return {
			mood: this.#who.mood,
			size: Math.round(this.#who.size),
			lift: Math.round(this.puppet.lift * 100) / 100,
			role: s.role,
			pose: s.pose,
			frame: s.frame,
			frames: s.frames,
			params: Object.entries(s.params)
				.map(([k, v]) => `${k}:${v}`)
				.join(" "),
			spot: this.#cue?.spot ?? "",
			cue: this.#cue?.pose ?? "",
			tempo: Math.round(this.puppet.tempo * 100) / 100,
			walk: w && this.moving ? `${Math.round(this.#walked)}/${w.ms}ms${w.exit ? " exit" : ""}` : "",
			lookAt: lookAtText(this.#lookAt),
			look: aimText(this.puppet.aimed),
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
		this.puppet.aim(this.moving || this.#gone ? undefined : this.#aimFor(this.#lookAt));
	}

	#aimFor(at: LookAt | undefined): Aim | undefined {
		if (at === undefined) return undefined;
		if (isViewer(at)) return AT_VIEWER;
		const to = typeof at === "string" ? this.#cast.get(at)?.face : at;
		return to ? aimAt(this.face, this.#facing, to) : undefined;
	}

	#walkTo(ms: number): void {
		const w = this.#cue!.walk!;
		const p = along(w.path, ms, w.ms);
		this.puppet.position.set(p.x, p.y);
		this.puppet.zIndex = p.y;
		if (p.dx !== 0) this.#facing = p.dx < 0 ? -1 : 1;
		this.#size();
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

const lookAtText = (l: LookAt | undefined) => (l === undefined ? "" : typeof l === "string" ? l : isViewer(l) ? "viewer" : `${Math.round(l.x)},${Math.round(l.y)}`);
const aimText = (a: Aim | undefined) => (a ? `${a.x},${a.y}${a.side ? " side" : ""}` : "");
