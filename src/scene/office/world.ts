// The office as data: rooms, desks, furniture and the slots characters stand in. The layout
// (layout.ts) computes it from a Snapshot; the view (office.ts) draws it. Nothing here knows about
// PixiJS, so the layout is unit-tested as plain data. Units are world pixels: a room is 400 tall,
// as on the FloorBusy board, and the camera scales the whole world to the window.

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Where a character stands. The office hands these out and the character draws itself there, so
 * this is the whole interface between the office and the rig (see slot.ts):
 * - `x`, `y`: the feet, in world pixels.
 * - `depth`: draw order; larger is in front. It is the feet's y, so people lower on the floor cover
 *   people behind them.
 * - `facing`: 1 looks right, -1 looks left.
 */
export interface Slot {
	x: number;
	y: number;
	depth: number;
	facing: 1 | -1;
}

export type AreaKind = "project" | "vacant" | "meeting" | "lobby" | "kitchen";
export type Band = "top" | "bottom";

/** A piece of floor furniture. Its base sits at (x, y) and it is depth-sorted with characters. */
export interface Fixture {
	kind: "plant" | "chair" | "counter" | "cooler" | "fridge" | "sofa" | "table" | "cabinet" | "pod" | "lamp";
	x: number;
	y: number;
	/** Draw order; usually y, the base. */
	depth: number;
}

/** Something hung on a back wall: drawn into the room's cached layer. */
export interface WallItem {
	kind: "window" | "whiteboard" | "sign" | "door" | "frame";
	rect: Rect;
	/** Named slots (whiteboards, signs, frames) take text later, from the sass engine (S5). */
	slot?: string;
}

/** A named, writable wall slot: a sign, a whiteboard or a frame. */
export interface SignSlot {
	id: string;
	kind: "whiteboard" | "sign" | "frame";
	areaId: string;
	rect: Rect;
}

export interface Desk {
	/** The session's id. */
	id: string;
	areaId: string;
	col: number;
	row: number;
	/** The desk's cell on the floor: the desk at its back, its crew in front. */
	cell: Rect;
	/** Where the desk itself stands: the front edge's centre. */
	at: { x: number; y: number };
	lead: Slot;
	chair: Fixture;
}

export interface Area {
	id: string;
	kind: AreaKind;
	/** The project's name, or the common area's. */
	name: string;
	band: Band;
	/** A project room's colour, fixed for the room's life (it follows the room, not the project). */
	hue: number;
	rect: Rect;
	/** Where the back wall ends and the floor begins. */
	floorY: number;
	cols: number;
	rows: number;
	/** Every desk cell, occupied or not, in row-major order. */
	cells: Rect[];
	desks: Desk[];
	fixtures: Fixture[];
	wall: WallItem[];
	/** Named standing spots in common areas: "queue", "cooler", "seat", "nap", "sofa". */
	spots: Record<string, Slot[]>;
}

export interface World {
	bounds: Rect;
	hallway: Rect;
	/** Every area, in reading order: the top band left to right, then the bottom band. */
	areas: Area[];
	/** Every desk by session id. */
	desks: Map<string, Desk>;
	signs: SignSlot[];
}

// Sizes, from the FloorBusy board.
export const CELL_W = 220;
export const ROW = 170;
export const WALL = 110;
export const SIDE = 20;
export const FRONT = 10;
export const HALL = 130;
export const MIN_ROWS = 2;
export const MAX_COLS = 4;
export const COMMON_W = { meeting: 340, lobby: 260, kitchen: 460 } as const;

export const roomWidth = (cols: number) => SIDE * 2 + cols * CELL_W;
export const roomHeight = (rows: number) => WALL + rows * ROW + FRONT;

/**
 * Crew positions around a desk, relative to the desk front's centre: a row in front, one each side
 * of the desk, then a second row. They stand well forward, so the desk's name card stays readable. Index order is fill order, so the first few look natural.
 */
const CREW: [number, number][] = [
	[-60, 46],
	[0, 52],
	[60, 46],
	[-100, 10],
	[100, 10],
	[-30, 80],
	[30, 80],
	[-88, 76],
	[88, 76],
	[0, 88],
];
export const CREW_SLOTS = CREW.length;

/** The i-th crew slot of a desk. Past the fixed pattern, extra crew squeeze into a front row. */
export function crewSlot(desk: Desk, i: number): Slot {
	let dx: number;
	let dy: number;
	if (i < CREW.length) [dx, dy] = CREW[i]!;
	else {
		const k = i - CREW.length;
		dx = -88 + (k % 8) * 25 + (Math.floor(k / 8) % 2) * 12;
		dy = 62 + (Math.floor(k / 8) % 3) * 8;
	}
	const x = desk.at.x + dx;
	const y = desk.at.y + dy;
	return { x, y, depth: y, facing: dx > 0 ? -1 : 1 };
}
