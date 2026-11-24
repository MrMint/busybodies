// A scene theme: everything the office draws that isn't logic. The layout, the director and the
// office's own bookkeeping (what to redraw, when, where things stand) are the same in every theme;
// a theme says what the floor, walls, furniture, stations and props look like, and what the places
// are called. Plan: docs/plan-next.md stream D.
import type { Container, Graphics } from "pixi.js";
import type { Lamp, PlannerRow, Tray } from "../director/metrics";
import type { Who } from "../office/slot";
import type { Phase } from "../office/daylight";
import type { Area, AreaKind, Band, Fixture, Rect } from "../office/world";
import type { SceneStaging } from "../office/staging";
import type { ThemeId } from "../../themes/ids";
import type { SignText, ThemeWords } from "./words";

/**
 * The furniture slots a theme paints, one baked texture each, shared by every user. They are slot
 * names, not things: `copier` is "the build station's body" and `fridge` "the kitchen's big box on
 * the left" in any theme (the factory's are a press and a vending machine). Each is drawn around its
 * base point (0, 0), the bottom centre where it meets the floor; a station's body keeps its top
 * surface at the rig's working point and leaves that point clear, because the rig draws the moving
 * parts there (world.ts `Station`).
 */
export type FurnitureKind = "desk" | "screen-lit" | "screen-off" | Fixture["kind"];

export const FURNITURE_KINDS: FurnitureKind[] = [
	"desk",
	"chair",
	"plant",
	"counter",
	"cooler",
	"fridge",
	"sofa",
	"table",
	"cabinet",
	"pod",
	"lamp",
	"screen-lit",
	"screen-off",
	"files",
	"catalogue",
	"copier",
	"stamps",
	"phone",
	"outbox",
	"shredder",
	"tickets",
	"bell",
];

/** A crew's build on a desk, as the office was asked to draw it. */
export interface CrewBuild {
	pieces: number;
	topped: boolean;
	/** When the last piece fell off (it tumbles down once, then lies there). */
	fellAt?: number;
	/** When the last piece went on (it is set down with a little drop, once). */
	addedAt?: number;
}

/** A drawn crew build: the stack, and the pieces the office moves by their transforms. */
export interface DrawnBuild {
	view: Container;
	/** The newest piece, centred on itself, so it can be set down. */
	top?: Graphics;
	/** The piece that fell, lying where it came to rest, centred on itself. */
	fallen?: Graphics;
	/** Where the fallen piece sat on the stack before it fell. */
	fellFrom?: { x: number; y: number };
}

/** The desk props for the director's metrics (props.ts places and composes them). */
interface DeskPainters {
	/** The context pile in front of the lead (the office's in-tray, the factory's hopper). */
	tray(t: Tray, seed: string): Graphics;
	mugs(n: number): Graphics;
	lamp(lamp: Lamp): Graphics;
	drawers(n: number, full: number): Graphics;
	skip(load: number): Graphics;
}

export interface SceneTheme {
	id: ThemeId;
	words: ThemeWords;
	/** The ground around the building (the app's background). */
	lawn: number;
	/** The dark base the rooms sit on. */
	slab: number;
	/** A room's shell and its wall items (all but the planner, which has its own layer), baked into
	 * the room's cached layer: shapes into `g`, text and the like into `c`. */
	room(g: Graphics, c: Container, a: Area, sign: (slot: string) => SignText | undefined): void;
	/** A stretch of the hallway (drawn in chunks). */
	hallway(g: Graphics, r: Rect): void;
	/** One furniture slot's drawing, around its base. */
	furniture(kind: FurnitureKind): Graphics;
	desk: DeskPainters;
	/** The room's planner of todos, a colour per session. */
	planner(r: Rect, rows: PlannerRow[]): Container;
	/** A room's own rug colours under its desks (the paper pass's `rug`); none: a pale sheet over
	 * whatever floor it has. */
	rug?(a: Area): { fill: number; edge: number } | undefined;
	/** A gap in the building's footprint (`World.yards`: where a band of rooms is shorter than the
	 * building), made a place outside: a patio, a yard. Baked with the rooms. `band`: which side of
	 * the hallway it is on. */
	patio(g: Graphics, r: Rect, band: Band): void;
	/** The crew's build on the desk's left end (world.ts BUILD is its geometry). */
	crewBuild(b: CrewBuild, seed: string): DrawnBuild;
	/** Who keeps an empty office company (napping in the lobby's pod). */
	nightWatch: Who;
	/** The factory's robot arms: one per project room, helping with the build (theme/arm.ts). */
	arms: boolean;
	/** Light, the view out of the windows, floor materials and the room names (office/light.ts). */
	light: SceneLight;
	/** How the theme stages the place (office/staging.ts): desks or lines, a corridor or a conveyor,
	 * what moves on its own, the idle habits. Absent: the office's (`DEFAULT_STAGING`). */
	staging?: SceneStaging;
	/** Painters for what a staging adds to the floor (belts, booths, the dock); needed only with a
	 * `line` bay or a `conveyor` hall. */
	stage?: StagePainters;
}

/**
 * What a staging adds, painted by the theme into plain Graphics (office/ambient.ts places them and
 * moves only their transforms): each around its own origin, in world px.
 */
export interface StagePainters {
	/** A line's belt frame, from (0, 0) at its left end's top surface to (w, 0), its front below. */
	belt(g: Graphics, w: number): void;
	/** The belt's slats: drawn once from -pitch to w, slid along by the life clock. */
	slats(g: Graphics, w: number, pitch: number): void;
	/** The rollers at each end, over the slats' overhang. */
	rollers(g: Graphics, w: number, pitch: number): void;
	/** A part riding the belt, for a kind of work (read, web, search, edit, shell, test), centred. */
	part(g: Graphics, kind: string): void;
	/** The lead's booth, round its desk: drawn behind the lead, from the desk front's centre. */
	booth(g: Graphics): void;
	/** The dock at the hallway's end: its right edge at x = 0, the hallway's top at y = 0. */
	dock(g: Graphics, h: number): void;
	/** A PR crate riding the hallway's belt, its base centre at (0, 0). */
	crate(g: Graphics): void;
}

/** A colour per time-of-day phase (office/daylight.ts). */
type PerPhase<T> = Record<Phase, T>;

/**
 * How a theme is lit and what its windows look out on: values only, drawn by the office
 * (office/light.ts, office/outlook.ts). Colours that multiply are "how much of the painted colour
 * shows": white leaves it as painted.
 */
export interface SceneLight {
	/** The building's light, multiplied over rooms, furniture and cast. */
	ambient: PerPhase<number>;
	/** The hallway's: it keeps its night lights on, so the room names stay readable. */
	hall: PerPhase<number>;
	/** The lawn and everything outside, multiplied. */
	outside: PerPhase<number>;
	/** What a lit desk lamp or a room's overhead light brings the floor up to. */
	lamp: number;
	/** The warm halo added round a busy desk's lamp after dark. */
	glow: number;
	/** Overhead lights: soft round pools (the office), or fluorescent strips over each row (the factory). */
	overhead: "pools" | "strips";
	/** A vacant room's light, as a share of the rest (it has nothing switched on). */
	vacant: number;
	/** Sunlight through the windows, as patches on the floor (morning, late afternoon). */
	sun: number;
	/** The view out: sky (top, horizon), the skyline, its lit windows at night. */
	sky: PerPhase<[top: number, horizon: number]>;
	skyline: PerPhase<[far: number, near: number]>;
	/** The theme's window, so the view sits inside its frame: glass inset from the wall item's rect,
	 * its height (the factory's are high strips), panes across, a transom, and the bars' width. */
	window: { inset: number; height?: number; panes: number; transom: boolean; bar: number };
	/** Floor materials by area kind, drawn over the theme's floor (none: leave it). */
	floors: Partial<Record<AreaKind, "carpet" | "planks" | "none">>;
	/** Under each cluster of desks: a rug (office) or a painted work zone (factory). */
	cluster: "rug" | "zone";
	/** Room names painted in the hallway at each room's threshold: a vinyl decal or a stencil. */
	decal: { size: number; colour: number; stencil: boolean };
	/** Outside on the lawn: trees (office) or bollards and pallets (factory). */
	yard: "trees" | "yard";
}

