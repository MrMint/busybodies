// The director: turns snapshot changes into world changes (who walks where, who starts which pose),
// so drawing code never reads the snapshot for that. The decisions are pure (`direct`, in
// director/direct.ts); this wrapper keeps the last world, hands the office its cast with a cue per
// character, publishes the event stream, and holds the seam for the sass engine (S5):
//
//   director.on((events, world) => ...)    every change, as WorldEvents
//   say(key, text, kind)                   a bubble over a character ("said" or "thought")
//   sign(slot, text)                       text on a named sign or whiteboard slot
//
// Until S5 plugs in, `placeholderVoice` bubbles each busy lead's current tool, as the office did.
import type { Placed } from "./office/placement";
import type { World as Floor } from "./office/world";
import { type Direction, cueFor, direct, here } from "./director/direct";
import { type Metrics, NO_METRICS } from "./director/metrics";
import type { Actor, Build, World, WorldEvent } from "./director/types";
import type { Snapshot } from "../watcher/model";

export { direct, RULES, here, cueFor } from "./director/direct";
export type { Actor, Build, Cue, Run, World, WorldEvent } from "./director/types";
export { pathBetween, walkMs, WALK_SPEED } from "./director/paths";

export type SayKind = "said" | "thought";
/** Draw a bubble over the character with this key; `undefined` takes it down. */
export type SayHook = (key: string, text: string | undefined, kind: SayKind) => void;
/** Write on a named sign slot (`room:<project>:sign`, `meeting:board`, ...). A newline splits title from body. */
export type SignHook = (slot: string, text: string) => void;
export type Listener = (events: WorldEvent[], world: World) => void;

/** The built-in voice: each busy lead says the tool it is using; everyone else is quiet. */
export function placeholderVoice(world: World, snap: Snapshot, say: SayHook, now: number): void {
	const flat = (l: Snapshot["sessions"]): Snapshot["sessions"] => l.flatMap((s) => [s, ...flat(s.children)]);
	const tools = new Map(flat(snap.sessions).map((s) => [`s:${s.id}`, s.state === "busy" ? s.activity?.tool : undefined]));
	for (const a of Object.values(world.actors)) {
		const tool = a.kind === "lead" && !a.gone && !(a.walk && now < a.walk.since + a.walk.ms) ? tools.get(a.key) : undefined;
		say(a.key, tool?.replace(/^mcp__[^_]+__/, ""), "said");
	}
}

export class Director {
	#world?: World;
	#last?: Direction;
	#listeners = new Set<Listener>();
	/** The time the next cast is for. The app sets it from the snapshot (and to `wake` on a wake-up). */
	now = 0;

	/** The office's `cast` option: direct this snapshot and place everyone with a cue. */
	cast = (snap: Snapshot, floor: Floor): Placed[] => {
		const now = this.now || snap.at;
		const d = direct(this.#world, snap, now, floor);
		this.#world = d.world;
		this.#last = d;
		if (d.events.length) for (const fn of this.#listeners) fn(d.events, d.world);
		return Object.values(d.world.actors).map((a) => ({
			who: { key: a.key, kind: a.kind, role: a.role, mood: a.mood, size: a.size, tint: a.tint },
			slot: a.slot,
			desk: a.session,
			area: a.area,
			cue: cueFor(a, now),
			...(a.kind === "crew" && a.task ? { task: a.task } : {}),
		}));
	};

	get world(): World | undefined {
		return this.#world;
	}

	/** Each session's crew build, for the office to draw on the desk. */
	builds = (): Record<string, Build> => this.#world?.builds ?? {};

	/** When the world next changes on its own, with no new snapshot. */
	get wake(): number | undefined {
		return this.#last?.wake;
	}

	/** The areas whose lead is waiting on you, for the room pulse and the top pill. */
	waiting(): { key: string; area: string }[] {
		return Object.values(this.#world?.actors ?? {})
			.filter((a) => a.kind === "lead" && !a.gone && a.seen.waiting !== undefined)
			.map((a) => ({ key: a.key, area: a.homeArea ?? a.area }));
	}

	/** Metrics as things, for the office to draw: each desk's in-tray, drawers, skip, mugs and
	 * lamp, the planners, and NOW SERVING (director/metrics.ts). */
	metrics = (): Metrics => this.#world?.metrics ?? NO_METRICS;

	on(fn: Listener): () => void {
		this.#listeners.add(fn);
		return () => this.#listeners.delete(fn);
	}

	/** One actor, for the inspector. */
	actor(key: string): Actor | undefined {
		return this.#world?.actors[key];
	}

	/** Where an actor is right now (partway along a walk, or at its slot). */
	where(key: string, now = this.now) {
		const a = this.actor(key);
		return a ? here(a, now) : undefined;
	}
}
