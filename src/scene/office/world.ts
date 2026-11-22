// The office as data: rooms, desks, furniture and the slots characters stand in. The layout
// (layout.ts) computes it from a Snapshot; the view (office.ts) draws it. Nothing here knows about
// PixiJS, so the layout is unit-tested as plain data. Units are world pixels: a room is 400 tall,
// as on the FloorBusy board, and the camera scales the whole world to the window.
import type { StationKind } from "../director/stations";
import type { Point } from "./slot";
import { STATION_REACH } from "../director/stations";

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

export type AreaKind = "project" | "vacant" | "meeting" | "lobby" | "kitchen" | "yours";
export type Band = "top" | "bottom";

/** A piece of floor furniture. Its base sits at (x, y) and it is depth-sorted with characters. */
export interface Fixture {
	kind: "plant" | "chair" | "counter" | "cooler" | "fridge" | "sofa" | "table" | "cabinet" | "pod" | "lamp" | StationFurniture | PropFixture;
	x: number;
	y: number;
	/** Draw order; usually y, the base. */
	depth: number;
}

/** Something hung on a back wall: drawn into the room's cached layer. */
export interface WallItem {
	/** `planner`: the room's todo planner; `you`: the door to your office (office/props.ts draws both). */
	kind: "window" | "whiteboard" | "sign" | "door" | "frame" | "planner" | "you";
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
	/** A project room's shared stations, in the strip along its left wall (see `stationsFor`). */
	stations: Station[];
	/** A project room's shredder, in the back corner opposite the strip (see `shredderFor`). */
	shredder?: Station;
}

/** The office's furniture for each station kind (the office theme). Kinds without one get no station yet. */
export type StationFurniture = "files" | "catalogue" | "copier" | "stamps";
export const STATION_FURNITURE: Partial<Record<StationKind, StationFurniture>> = {
	reference: "files",
	search: "catalogue",
	build: "copier",
	test: "stamps",
};

/** The metrics' furniture (office/props.ts): a room's shredder; your office's ticket machine and the
 * counter with the bell by your door. */
export type PropFixture = "shredder" | "tickets" | "bell";

/**
 * A shared station in a project room: a filing cabinet, a copier... Its user stands at `use`, facing
 * it, with its feet STATION_REACH from the working point `at` (for a crew member STATION_CREW_PX
 * tall; `useFor` scales it for others); the next ones wait at `queue`. The office draws only the
 * station's body, with its top surface at the working point's height; the rig draws the moving parts
 * (drawer, lid, ink pad...) at the working point, so the user always draws in front of the body.
 */
export interface Station {
	/** Stable for the room's life: `<area id>:<kind>:<n>`. */
	id: string;
	kind: StationKind;
	areaId: string;
	/** The furniture's base: bottom centre, where it meets the floor. */
	base: Point;
	/** Where the user's hands go. */
	at: Point;
	use: Slot;
	queue: Slot[];
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
export const COMMON_W = { meeting: 340, lobby: 260, yours: 300, kitchen: 460 } as const;

/**
 * The station strip: a column of shared equipment along a project room's left wall, left of the desk
 * cells. Stations stand `pitch` apart, counted from the hallway side (a room above the hallway grows
 * upward, one below grows downward, so the hallway side never moves): adding or trimming a row of
 * desks never moves a station, and a new station only ever goes on the far end.
 */
export const STRIP = {
	w: 130,
	pitch: 66,
	/** A room below the hallway: the first station's base, down from where its floor begins. */
	first: 80,
	/** A room above: the first station's base, up from its front edge. */
	front: 18,
	/** The tallest station, so the far one stays clear of the back wall's signs. */
	tall: 76,
	/** Each station's centre, in from the room's left edge. */
	x: 45,
	/** The working point, right of the station's centre (its user stands to its right, facing it). */
	reach: 20,
	/** Queue slots per station. */
	queue: 2,
} as const;

/** The four every project room gets, from the hallway side; then the extras a big crew earns. */
export const STATIONS_BASE: StationKind[] = ["build", "test", "reference", "search"];
export const STATIONS_EXTRA: StationKind[] = ["build", "test", "reference", "search"];
/** A second station of a kind: one per this many busy crew in the room past the first four. */
export const STATION_CREW = 4;

/** The crew height in office px that STATION_REACH is measured for (the rig's reach.ts agrees). */
export const STATION_CREW_PX = 58;

/** Where a user `size` px tall stands at a station: STATION_REACH scaled to its size, so its hands
 * still meet the working point. Always just in front of the station's body. */
export function useFor(st: Pick<Station, "at" | "base">, size: number): Slot {
	const k = size / STATION_CREW_PX;
	return { x: Math.round(st.at.x + STATION_REACH.x * k), y: Math.round(st.at.y - STATION_REACH.y * k), depth: st.base.y + 1, facing: -1 };
}

/** How many stations a room's strip holds: it grows with the room's rows. */
export function stationRoom(area: Pick<Area, "band" | "rect" | "floorY">): number {
	let n = 0;
	while (stationBase(area, n) !== undefined) n++;
	return n;
}

function stationBase(area: Pick<Area, "band" | "rect" | "floorY">, i: number): Point | undefined {
	const x = area.rect.x + STRIP.x;
	if (area.band === "bottom") {
		const y = area.floorY + STRIP.first + i * STRIP.pitch;
		return y <= area.rect.y + area.rect.h - FRONT - 14 ? { x, y } : undefined;
	}
	const y = area.rect.y + area.rect.h - FRONT - STRIP.front - i * STRIP.pitch;
	return y - STRIP.tall >= area.floorY - 12 ? { x, y } : undefined;
}

/**
 * A project room's stations: the base four, then (with a big crew, and while the strip has room) a
 * second of each kind in turn. `crew` is the busy crew across the room's sessions.
 */
export function stationsFor(area: Pick<Area, "id" | "band" | "rect" | "floorY">, crew: number): Station[] {
	const room = stationRoom(area);
	const extra = Math.max(0, Math.floor(crew / STATION_CREW) - 1);
	const kinds = [...STATIONS_BASE, ...STATIONS_EXTRA.slice(0, extra)].slice(0, room);
	const seen: Partial<Record<StationKind, number>> = {};
	return kinds.map((kind, i) => {
		const base = stationBase(area, i)!;
		const n = seen[kind] ?? 0;
		seen[kind] = n + 1;
		const at = { x: base.x + STRIP.reach, y: base.y + STATION_REACH.y };
		const use = useFor({ at, base }, STATION_CREW_PX);
		const queue = Array.from({ length: STRIP.queue }, (_, k): Slot => {
			const y = use.y + 10 + k * 4;
			return { x: use.x + 30 + k * 28, y, depth: y, facing: -1 };
		});
		return { id: `${area.id}:${kind}:${n}`, kind, areaId: area.id, base, at, use, queue };
	});
}

/**
 * A project room's shredder (a lead feeds its in-tray in on a compaction): off the station strip,
 * against the right wall opposite it, just under the back wall: the one gap the desks leave there
 * (above the back-right desk's filing drawers; the front corner has the plant, and the front-right
 * desk's drawers and skip). Like the planner and the signs it belongs to the back wall: in a room
 * below the hallway it never moves; in one above, it moves up with the wall when a row is added.
 * Its user stands to its left, facing it (the strip's stand to the right), its feet STATION_REACH
 * (scaled) from the working point.
 */
export const SHREDDER = { inset: 34, back: 28, reach: -10 } as const;

export function shredderFor(area: Pick<Area, "id" | "rect" | "floorY">): Station {
	const base = { x: area.rect.x + area.rect.w - SHREDDER.inset, y: area.floorY + SHREDDER.back };
	const at = { x: base.x + SHREDDER.reach, y: base.y + STATION_REACH.y };
	const use = shredderUse({ at, base }, STATION_CREW_PX);
	return { id: `${area.id}:shredder:0`, kind: "shredder", areaId: area.id, base, at, use, queue: [] };
}

/** Where a user `size` px tall stands at the shredder: left of it, facing right. */
export function shredderUse(st: Pick<Station, "at" | "base">, size: number): Slot {
	const k = size / STATION_CREW_PX;
	return { x: Math.round(st.at.x - STATION_REACH.x * k), y: Math.round(st.at.y - STATION_REACH.y * k), depth: st.base.y + 1, facing: 1 };
}

export const roomWidth = (cols: number) => SIDE * 2 + STRIP.w + cols * CELL_W;
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

/** Spots in front of a desk, relative to its front's centre, with room on the facing side for a
 * character's work (a bench, a crate, a machine: about 40 px past its body). Left of centre faces
 * right, right of centre faces left, so the work sits between the pair. */
const WIDE: [dx: number, dy: number, facing: 1 | -1][] = [
	[-62, 40, 1],
	[62, 40, -1],
	[-62, 92, 1],
	[62, 92, -1],
];

/** Spots on a bare cell (a row with no desks), relative to the cell's top-left corner. */
const BARE: [dx: number, dy: number, facing: 1 | -1][] = [
	[48, 64, 1],
	[172, 64, -1],
	[48, 140, 1],
	[172, 140, -1],
];

/**
 * Where a desk's crew stand, in fill order, spaced so each one's work shows: four wide spots in the
 * desk's own cell, then the free cells it is lent. A free cell is lent to exactly one desk: the one
 * it lies in front of, else the one it lies behind, else its left neighbour, else its right. A
 * bare cell (its row has no desks) gives four spots; a free desk's cell gives the four in front of
 * that desk. Past these, the old tight pattern (`crewSlot`) takes the overflow.
 */
export function crewSpots(world: World, desk: Desk): Slot[] {
	const area = world.areas.find((a) => a.id === desk.areaId);
	const out: Slot[] = [];
	const wide = (x: number, y: number) => {
		for (const [dx, dy, facing] of WIDE) out.push({ x: x + dx, y: y + dy, depth: y + dy, facing });
	};
	wide(desk.at.x, desk.at.y);
	if (!area) return out;
	const at = (x: number, y: number) => area.cells.find((c) => c.x === x && c.y === y);
	const deskAt = (c: Rect | undefined) => (c ? area.desks.find((d) => d.cell.x === c.x && d.cell.y === c.y) : undefined);
	const rowsWithDesks = new Set(area.desks.map((d) => d.cell.y));
	/** Who a free cell is lent to. */
	const owner = (c: Rect) =>
		deskAt(at(c.x, c.y - ROW)) ?? deskAt(at(c.x, c.y + ROW)) ?? deskAt(at(c.x - CELL_W, c.y)) ?? deskAt(at(c.x + CELL_W, c.y));
	const c = desk.cell;
	const near = [at(c.x, c.y + ROW), at(c.x, c.y - ROW), at(c.x - CELL_W, c.y), at(c.x + CELL_W, c.y)];
	for (const f of near) {
		if (!f || deskAt(f) || owner(f)?.id !== desk.id) continue;
		if (rowsWithDesks.has(f.y)) wide(f.x + f.w / 2, f.y + 78);
		else for (const [dx, dy, facing] of BARE) out.push({ x: f.x + dx, y: f.y + dy, depth: f.y + dy, facing });
	}
	return out;
}

/** The i-th spot of a desk's crew: `crewSpots` first, then the tight pattern for the rest. */
export function crewSpot(spots: Slot[], desk: Desk, i: number): Slot {
	return spots[i] ?? crewSlot(desk, CREW.length + i - spots.length);
}

/** The crew's build on a desk (office.ts draws it): bricks this big, stacked this many to a course,
 * from this corner of the desk's left end, relative to the desk front's centre. */
export const BUILD = { brickW: 12, brickH: 9, wide: 3, left: -86, floor: -52 } as const;

/** Where a builder stands to set a brick on its desk's build: just past the desk's left end, a
 * little back, facing the tower. */
export function buildSlot(desk: Desk): Slot {
	const x = desk.at.x + BUILD.left - 16;
	const y = desk.at.y - 22;
	return { x, y, depth: y, facing: 1 };
}
