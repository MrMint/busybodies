// The director's words: who is on stage, what each one is doing, and what changed. Pure data, so a
// world can be compared, logged and replayed.
import type { Cue, Mood, Walk, Who } from "../contract";
import type { Slot } from "../world/world";
import type { HandOff, Mail } from "./handoff";
import type { Pending } from "./beats";
import type { Errand } from "./errands";
import type { Metrics } from "./metrics";
import type { PaceName } from "./pace";
import type { Rush } from "./rush";
import type { StationKind } from "./stations";
import type { Story } from "./story";
import type { Trip } from "./trips";
import type { Work } from "./work";
import type { LookAt } from "../rig/gaze";

export type { Cue };

export interface Actor {
	key: string;
	/** Stepped aside from a desk's end place while a brick run to the build spot beside it is under
	 * way (world.ts `yieldFrom`): it walks back when the run is over. */
	yielding?: true;
	kind: Who["kind"];
	/** The session it belongs to (a lead's own). */
	session: string;
	/** The agent's id, for crew. */
	agent?: string;
	/** Who hired it: the lead's or the parent agent's key. */
	boss?: string;
	/** The agent type ("scout", "reviewer", ...), or "lead". */
	role: string;
	mood: Mood;
	size: number;
	tint: string;
	area: string;
	spot: string;
	slot: Slot;
	pose: string;
	as: "lead" | "partner";
	/** When the pose started (ms). An acted pose holds until its frames run out. */
	poseSince: number;
	/** A one-off acted pose (failed test, PR, handover...), as opposed to the standing pose for the mood. */
	acted: boolean;
	at: "start" | "end";
	/** A walk in progress: started at `since`. */
	walk?: Walk & { since: number };
	/** Leaving the office: gone once this time passes. */
	gone?: number;
	/** What the director last saw, to tell a new event from the same state. */
	seen: Seen;
	/** How many times each trigger has fired for this actor: seeds rare variants. */
	count: Record<string, number>;
	/** What it is working on, by the tool in hand (held a few seconds; see work.ts). */
	work?: Work;
	/** How fast its pose runs: quick while writing, slow when coasting. 1 when not busy. */
	tempo: number;
	/** The agent's task, or the session's title for a lead. */
	task?: string;
	/** On a brick run: the crew spot it goes back to. */
	home?: string;
	/** The pose it walks in, if not the plain walk (`carry` on the way to the build). */
	walkPose?: string;
	/** On a trip: the station it uses or queues for (its crew spot is `home`). */
	trip?: Trip;
	/** The pace of the walk under way, when quicker than a stroll (pace.ts). */
	pace?: PaceName;
	/** Took a folder from a teammate for the stretch of work that started then (`work.since`): no
	 * trip for it (handoff.ts). */
	handed?: number;
	/** Plan-next stream B. An errand metrics sent it on (the shredder, the planner: errands.ts). */
	errand?: Errand;
	/** The room its desk is in, while it stands elsewhere (your office, the shredder): the pulse's room. */
	homeArea?: string;
	/** Its model's walk factor, when not 1 (traits.ts): the walk's steps keep the same pace. */
	stride?: number;
	/** An acted pose a deliberate character holds back a beat (beats.ts). */
	pending?: Pending;
	/** Plan-alive stream A (social.ts). Who a glance is for: the teammate whose test went red, who
	 * finished, or the lead come to look over its shoulder. */
	reactTo?: string;
	/** The return to the screen it last noticed (the view's `back`), so one return is one look up. */
	noticed?: number;
	/** What it looks at while it stands there (the cue's `lookAt`). */
	lookAt?: LookAt;
}

/** A brick on its way to the build: one crew builder walks it over, sets it down, walks back. */
export interface Run {
	/** The runner's actor key. */
	key: string;
	/** The crew spot it left from, and goes back to. */
	from: string;
	/** When it set off. */
	since: number;
	/** How long the walk takes, each way. */
	walkMs: number;
	/** When the brick goes on: the walk there, then `place` played through. */
	lands: number;
	/** When it is back at its spot: the next run may start after this (and the cooldown). */
	done: number;
	/** True until the brick is on the build. */
	carried: boolean;
}

/** A session's crew build: a stack that grows a piece per edit seen, loses one on a red test, and
 * gets a flag on top when the PR goes up. */
export interface Build {
	session: string;
	pieces: number;
	topped: boolean;
	/** When it last lost a piece. */
	fellAt?: number;
	/** The last edit seen per member (agent id, or "lead"), so the same edit isn't counted twice. */
	seen: Record<string, number>;
	/** When the last piece went on (the office sets it down with a little drop). */
	addedAt?: number;
	/** The brick run under way, if any. */
	run?: Run;
	/** When the last run set off: the next waits out the session's cooldown. */
	ranAt?: number;
	/** When the recent edits were seen (the last minute): the session's edit rate. */
	edits?: number[];
	/** Counting lines (plan-next stream B): the bricks the lines added are worth (metrics.ts towerBricks)... */
	lines?: number;
	/** ...less this many knocked off by red tests since the lines last grew. */
	knocked?: number;
}

/** The signals an actor's pose is chosen from, as last seen. */
export interface Seen {
	waiting?: number;
	failAt?: number;
	prs: number[];
	compactAt?: number;
	apiRetryAt?: number;
	repeats?: number;
	hires: string[];
}

/** Everyone on stage, by key. */
export interface World {
	at: number;
	actors: Record<string, Actor>;
	/** Crew builds, by session id. */
	builds: Record<string, Build>;
	/** Sessions in rush, by session id (rush.ts). */
	rush?: Record<string, Rush>;
	/** Hand-offs under way, by the giver's key (handoff.ts). */
	handoffs?: Record<string, HandOff>;
	/** Leads walking a PR to the outbox, by session id (handoff.ts). */
	mail?: Record<string, Mail>;
	/** Metrics as things: each desk's in-tray, drawers, skip, mugs and lamp; the planners; your office's tickets (metrics.ts). */
	metrics?: Metrics;
	/** Story and continuity: merged PRs' replies, send-offs, the log and its headlines (story.ts). */
	story?: Story;
	/** How the floor was staged (world/staging.ts: bay and hallway), so a change of stage (a theme
	 * switched live) puts everyone straight on their new spots rather than walking them over. */
	stage?: string;
}

export type WorldEvent =
	| { type: "arrive"; key: string; at: number; spot: string; area: string; walk: boolean }
	| { type: "leave"; key: string; at: number }
	| { type: "walk"; key: string; at: number; from: string; to: string; ms: number }
	| { type: "pose"; key: string; at: number; pose: string; as: "lead" | "partner"; acted: boolean }
	| { type: "handover"; key: string; at: number; to: string }
	| { type: "review"; key: string; at: number; state: "start" | "end" }
	| { type: "waiting"; key: string; at: number; state: "start" | "end"; area: string }
	| { type: "trip"; key: string; at: number; station: string; state: "start" | "queue" | "use" | "end" }
	| { type: "rush"; session: string; at: number; state: "start" | "end"; heat: number }
	| { type: "dodge"; key: string; at: number; from: string }
	| { type: "handoff"; key: string; at: number; to: string; kind: StationKind }
	| { type: "build"; session: string; at: number; pieces: number; change: "start" | "add" | "fall" | "top" | "carry"; key?: string };
