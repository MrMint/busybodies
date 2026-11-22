// A scene theme: everything the office draws that isn't logic. The layout, the director and the
// office's own bookkeeping (what to redraw, when, where things stand) are the same in every theme;
// a theme says what the floor, walls, furniture, stations and props look like, and what the places
// are called. Plan: docs/plan-next.md stream D.
import type { Container, Graphics } from "pixi.js";
import type { DeskProps, Lamp, PlannerRow, Tray } from "../director/metrics";
import type { Who } from "../office/slot";
import type { Area, Fixture, Rect } from "../office/world";
import type { ThemeId } from "./id";
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
export interface DeskPainters {
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
	/** The crew's build on the desk's left end (world.ts BUILD is its geometry). */
	crewBuild(b: CrewBuild, seed: string): DrawnBuild;
	/** Who keeps an empty office company (napping in the lobby's pod). */
	nightWatch: Who;
	/** The factory's robot arms: one per project room, helping with the build (theme/arm.ts). */
	arms: boolean;
}

export type { DeskProps };
