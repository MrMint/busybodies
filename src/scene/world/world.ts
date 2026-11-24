// The office as data: rooms, desks, furniture and the slots characters stand in. The layout
// (layout.ts) computes it from a Snapshot; the view (office.ts) draws it. Nothing here knows about
// PixiJS, so the layout is unit-tested as plain data. Units are world pixels: a room is 400 tall,
// as on the FloorBusy board, and the camera scales the whole world to the window.
import type { StationKind } from "./stations";
import type { Point } from "../contract";
import type { Staging } from "./staging";
import { STATION_REACH } from "./stations";

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
	/** A line bay's belts (staging `line`): one across each row that has a desk (see `beltsFor`). */
	belts?: Belt[];
}

/**
 * A line's belt (staging `line`): across a row of a bay, in front of its desks. Its top surface runs
 * from (x, y) to (x + w, y); its front edge draws at `depth`, so the crew standing behind it (feet
 * above y) show from the knees up, working on it. The desks on that row are the line's.
 */
export interface Belt {
	/** Stable while its row stands: `<area id>:belt:<row>`. */
	id: string;
	areaId: string;
	row: number;
	x: number;
	y: number;
	w: number;
	depth: number;
	/** The sessions whose desks stand on this row, left to right. */
	desks: string[];
}

/** The hallway's conveyor (staging `conveyor`): its belt runs along the hallway's middle, from the
 * left end to the dock at the right, where PR crates go off. */
interface Conveyor {
	y: number;
	x0: number;
	x1: number;
	dock: Point;
}

/** The office's furniture for each station kind (the office theme). Kinds without one get no station yet. */
export type StationFurniture = "files" | "catalogue" | "copier" | "stamps" | "phone" | "outbox";
export const STATION_FURNITURE: Partial<Record<StationKind, StationFurniture>> = {
	reference: "files",
	search: "catalogue",
	build: "copier",
	test: "stamps",
	web: "phone",
	outbox: "outbox",
};

/** The metrics' furniture (office/props.ts): a room's shredder; your office's ticket machine and the
 * counter with the bell by your door. */
type PropFixture = "shredder" | "tickets" | "bell";

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

export interface Floor {
	bounds: Rect;
	hallway: Rect;
	/** Every area, in reading order: the top band left to right, then the bottom band. */
	areas: Area[];
	/** Every desk by session id. */
	desks: Map<string, Desk>;
	signs: SignSlot[];
	/** How the theme stages it (world/staging.ts); absent is the office's: desks, a corridor. */
	staging?: Staging;
	/** The hallway's conveyor, with a `conveyor` hall. */
	conveyor?: Conveyor;
	/** The building's footprint not covered by rooms or the hallway: where a band of rooms ends
	 * short of the building, or a room is shallower than its band. Outside, on the slab: the theme
	 * makes each one a place (a patio, a yard). None when the bands are flush. */
	yards: Yard[];
}

/** A gap in the building's footprint, beside or behind the rooms of one band. */
export interface Yard {
	rect: Rect;
	band: Band;
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
	/** Six stations fit a two-row room at this pitch (wave 2 added the phone and the outbox). */
	pitch: 52,
	/** A room below the hallway: the first station's base, down from where its floor begins. */
	first: 64,
	/** A room above: the first station's base, up from its front edge. */
	front: 16,
	/** The tallest station, so the far one stays clear of the back wall's signs. */
	tall: 76,
	/** Each station's centre, in from the room's left edge. */
	x: 45,
	/** The working point, right of the station's centre (its user stands to its right, facing it). */
	reach: 20,
	/** Queue slots per station. */
	queue: 2,
} as const;

/** The six every project room gets, from the hallway side (the wave-1 four, then the phone and the
 * outbox); then the extras a big crew earns. */
export const STATIONS_BASE: StationKind[] = ["build", "test", "reference", "search", "web", "outbox"];
const STATIONS_EXTRA: StationKind[] = ["build", "test", "reference", "search"];
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
function stationRoom(area: Pick<Area, "band" | "rect" | "floorY">): number {
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
const SHREDDER = { inset: 34, back: 28, reach: -10 } as const;

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

// --- Who stands where at a desk ------------------------------------------------------------------
//
// The lead is the star: its face (eyes, cheeks, mouth) is a keep-out zone that nothing drawn at its
// desk may cover (`faceZone`; propspots.ts lays the desk out around it). Its crew stand in a row
// along the aisle in front of the desk, below its name card and spaced so no two overlap by more
// than AISLE.overlap of a body; a second row is a pill's height and a face lower, so each task pill
// (at the desk stop) sits between the rows and crosses no face.

/** Where the lead sits behind its desk, from the desk front's centre: left of the middle, so the
 * crew build has the desk's left end and the screen its right, both clear of its face. Its feet are
 * as before (a back-row lead's head stays clear of the wall signs); the desk top's back edge was
 * lowered instead (theme `desk`, DESK_TOP), so its whole face shows above the desk. */
export const SEAT = { x: -6, y: -42 } as const;

/** The desk top's back edge, from the desk front's centre (both themes draw it there). */
export const DESK_TOP = -60;

/** A standing character's proportions in its own units (rig/data/reach.ts: 85 to its height, the torso's
 * base 15 up from the feet, the body 90 wide, the face from the brows to the cheeks' foot). */
const BODY = { unit: 85, base: 15, halfW: 45, faceTop: 52, faceFoot: 18 } as const;

/** A character's body, from its feet and height: as wide as its torso, from its feet to its top. */
export function bodyRect(feet: { x: number; y: number }, size: number): Rect {
	const k = size / BODY.unit;
	return { x: feet.x - BODY.halfW * k, y: feet.y - size, w: BODY.halfW * 2 * k, h: size };
}

/** A character's face (eyes, cheeks, mouth), standing at rest: its torso's x -45..45, y -52..-18. */
export function faceZone(feet: { x: number; y: number }, size: number): Rect {
	const k = size / BODY.unit;
	return { x: feet.x - BODY.halfW * k, y: feet.y - (BODY.base + BODY.faceTop) * k, w: BODY.halfW * 2 * k, h: (BODY.faceTop - BODY.faceFoot) * k };
}

/** The overlap of two rects along x, if they meet at all (else 0). */
export const overlapX = (a: Rect, b: Rect): number =>
	a.y < b.y + b.h && b.y < a.y + a.h ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) : 0;

/** True if two rects share any area. */
export const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The aisle in front of a desk, relative to its front's centre. `front`: the first row's feet,
 * where a full-size crew member's head clears the name card. `places`: its x, four abreast at
 * `pitch`, so neighbours overlap by under `overlap` of a body (a 58 px crew member is 61 wide). The
 * outer pair comes first, facing in, so two crew have their work between them. `row`: how much
 * lower the next row stands (a task pill and a face), offset by half a place. `pill`: where a task
 * pill hangs under its owner's feet, and its height.
 */
export const AISLE = {
	front: 58,
	pitch: 54,
	places: [-81, 81, -27, 27],
	row: 64,
	overlap: 0.15,
	pill: { gap: 1, h: 12 },
} as const;

/**
 * Crew positions around a desk with no director (placement.ts), relative to the desk front's
 * centre: the aisle's row, then a second, back towards the desk's sides. Index order is fill order.
 */
const CREW: [number, number][] = [
	[-81, AISLE.front],
	[81, AISLE.front],
	[-27, AISLE.front],
	[27, AISLE.front],
	[-54, 88],
	[54, 88],
	[0, 88],
	[-100, 10],
	[100, 10],
	[0, 70],
];

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

/** Spots in the aisle in front of a desk (its own, or a free desk lent to it), relative to its
 * front's centre: AISLE's row, the outer pair first, facing in (their work between them), then the
 * inner pair, facing the lead. */
const WIDE: [dx: number, dy: number, facing: 1 | -1][] = AISLE.places.map((dx, i) => [dx, AISLE.front, i % 2 === 0 ? 1 : -1]);

/**
 * The line's spots (staging `line`), relative to the desk front's centre: three along the belt,
 * standing behind it facing downstream (each one's work lands in the gap before the next), then a
 * pair in front of it facing each other across their work, an aisle row (AISLE.row) lower than the
 * three, so the three's task pills hang between them and cross no face.
 */
const LINE: [dx: number, dy: number, facing: 1 | -1][] = [
	[-70, 50, 1],
	[0, 50, 1],
	[70, 50, 1],
	[-56, 50 + AISLE.row, 1],
	[56, 50 + AISLE.row, -1],
];

/**
 * A line whose floor in front of the belt is not open (the room's front row, where the pair would
 * stand off the floor, or a row with a desk in front, whose desk and booth the pair would stand on):
 * four behind the belt at the aisle's places (AISLE), all facing downstream. Five there would bunch
 * (61 px bodies in a 220 px cell); a fifth takes the desk's end place, as in the office (`crewPlaces`).
 */
const LINE_ABREAST: [dx: number, dy: number, facing: 1 | -1][] = AISLE.places.map((dx) => [dx, 50, 1]);

/** A line's belt, from the desk front's centre: its top surface this far down, its ends this far in
 * from the row's outer cells, its front edge this deep. */
export const BELT = { y: 62, inset: 8, front: 8, pitch: 16 } as const;

/** A bay's belts: one across each row with a desk on it, the row's cells end to end. */
export function beltsFor(area: Pick<Area, "id" | "cells" | "desks" | "cols">): Belt[] {
	if (!area.cols) return [];
	const out: Belt[] = [];
	const rows = Math.ceil(area.cells.length / area.cols);
	for (let row = 0; row < rows; row++) {
		const cells = area.cells.slice(row * area.cols, (row + 1) * area.cols);
		const desks = area.desks.filter((d) => d.row === row).sort((a, b) => a.col - b.col);
		if (!cells.length || !desks.length) continue;
		const x = cells[0]!.x + BELT.inset;
		const w = cells[cells.length - 1]!.x + CELL_W - BELT.inset - x;
		const y = cells[0]!.y + 78 + BELT.y;
		out.push({ id: `${area.id}:belt:${row}`, areaId: area.id, row, x, y, w, depth: y + BELT.front, desks: desks.map((d) => d.id) });
	}
	return out;
}

/** True if the cell in front of this one (a row nearer the room's front) is open floor: there is
 * one, and no desk stands in it. */
const openInFront = (area: Pick<Area, "cells" | "desks">, cell: Rect) =>
	area.cells.some((c) => c.x === cell.x && c.y === cell.y + ROW) && !area.desks.some((d) => d.cell.x === cell.x && d.cell.y === cell.y + ROW);

/** The own spots of a desk's cell (or a lent desk row cell) in this world's staging: the aisle's
 * row, or a line's: its pair in front of the belt only where the floor in front is open. */
function ownPattern(world: Pick<Floor, "staging">, area: Pick<Area, "cells" | "desks"> | undefined, cell: Rect) {
	if (world.staging?.bay !== "line") return WIDE;
	return area && openInFront(area, cell) ? LINE : LINE_ABREAST;
}

/** Spots on a bare cell (a row with no desks), relative to the cell's top-left corner: a pair, then
 * a second pair a row lower and half a place in, facing out, so the first pair's task pills hang
 * between the rows and each one's work shows. */
const BARE: [dx: number, dy: number, facing: 1 | -1][] = [
	[48, 64, 1],
	[172, 64, -1],
	[48 + AISLE.pitch / 2 + 4, 64 + AISLE.row + 2, -1],
	[172 - AISLE.pitch / 2 - 4, 64 + AISLE.row + 2, 1],
];

/** How far a line lifts a bare cell's spots when a desk stands in the cell in front: that desk's
 * booth roof comes up to 120 below the bare cell's top (factory.ts `booth`), and the second pair's
 * feet (130) would stand on it; lifted, they stand 4 px clear, a row apart still. */
const BARE_LINE_LIFT = 14;

/**
 * Where a desk's crew stand, in fill order: the four spots of its own aisle (on a line, the five
 * along its belt: `LINE`, or four behind it where the floor in front is closed: `LINE_ABREAST`), then the free cells it is lent. A free cell is lent to exactly one desk:
 * the one it lies in front of, else the one it lies behind, else its left neighbour, else its right.
 * A bare cell (its row has no desks) gives four spots; a free desk's cell gives the four in front of
 * that desk. Past these, the crowd (`crowdSlot`) takes the overflow.
 */
export function crewSpots(world: Floor, desk: Desk): Slot[] {
	const area = world.areas.find((a) => a.id === desk.areaId);
	const out: Slot[] = [];
	const wide = (x: number, y: number, cell: Rect) => {
		for (const [dx, dy, facing] of ownPattern(world, area, cell)) out.push({ x: x + dx, y: y + dy, depth: y + dy, facing });
	};
	wide(desk.at.x, desk.at.y, desk.cell);
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
		if (rowsWithDesks.has(f.y)) wide(f.x + f.w / 2, f.y + 78, f);
		else {
			// On a line, a desk in front of the bare cell stands in a booth whose roof reaches up into
			// it: the spots step back off the roof (BARE_LINE_LIFT).
			const lift = world.staging?.bay === "line" && deskAt(at(f.x, f.y + ROW)) ? BARE_LINE_LIFT : 0;
			for (const [dx, dy, facing] of BARE) out.push({ x: f.x + dx, y: f.y + dy - lift, depth: f.y + dy - lift, facing });
		}
	}
	return out;
}

/** The i-th spot of a desk's crew: `crewSpots` first, then the crowd (`crowdSlot`) for the rest,
 * moved along its row off anyone it would stand on (`restagger`). A spot depends only on the spots
 * before it, so `crew:<i>` names the same place however big the crew gets. */
export function crewSpot(spots: Slot[], desk: Desk, i: number): Slot {
	if (i < spots.length) return spots[i]!;
	const all = [...spots];
	for (let k = spots.length; k <= i; k++) all.push(restagger(crowdSlot(desk, k - spots.length), all, desk));
	return all[i]!;
}

/** True for a crew spot past the spaced ones: part of the crowd (whose rear members may turn to
 * face whoever stands in front of them: `faceFront`). */
export const inCrowd = (spots: Slot[], i: number) => i >= spots.length;

/**
 * The crowd: crew past the spaced spots stand in further rows down the aisle, each AISLE.row lower
 * than the last and offset by half a place from it (three, then four abreast), never square behind
 * anyone, each facing the lead. A big crew in a full room spills out of its cell this way rather
 * than stacking up on the desk's name card.
 */
export const CROWD = { rows: [[0, -54, 54], [-27, 27, -81, 81]], reach: 108 } as const;

export function crowdSlot(desk: Desk, k: number): Slot {
	let row = 0;
	let left = k;
	while (left >= CROWD.rows[row % 2]!.length) left -= CROWD.rows[row++ % 2]!.length;
	const dx = CROWD.rows[row % 2]![left]!;
	const x = desk.at.x + dx;
	const y = desk.at.y + AISLE.front + (row + 1) * AISLE.row;
	return { x, y, depth: y, facing: x < desk.lead.x ? 1 : -1 };
}

/**
 * When the crowd's next row would stand outside the room (a desk in the room's front row: its aisle
 * is the last floor before the hallway or the outside), the extras first stand beside the desk's
 * ends, in the gap between it and the next desk (`end`: the gap's middle, or just left of the tower in
 * the gap if the middle would stand on it; `dy` the feet, drawn just in front of the desk), and the row of four keeps its normal spacing. A gap is one place, however
 * many desks border it: it goes to the desk on its left (that desk's right end), so a desk's left end
 * is its own only with no desk beside it. A gap also holds the build spot of the desk on its right
 * (`buildSlot`, just past that desk's left end): a tower stands for most of a desk's life but a
 * builder visits for a moment, so the place is kept and its occupant steps aside (`yieldFrom`,
 * `yieldDy` forward) only while a brick run to that spot is under way. Only past the free ends does the row tighten: up to `abreast` at `pitch` (neighbours
 * overlap by up to `overlap` of a body, more than AISLE's), still on the room's floor. A standing
 * crew member's feet are always on its own room's floor (`foot`: how far above the room's bottom
 * edge, the frame, they may come).
 */
export const SQUEEZE = {
	pitch: 42,
	abreast: 6,
	overlap: 0.35,
	end: { dx: CELL_W / 2, dy: -4 },
	yieldDy: 24,
	foot: 8,
} as const;

/** The lowest a standing character's feet may be in an area: its floor's bottom, inside the frame. */
export const floorFoot = (a: Pick<Area, "rect">) => a.rect.y + a.rect.h - FRONT - SQUEEZE.foot;

/** The x range a body `half` wide may stand in, in an area: inside its side walls and clear of the
 * station strip (a project room's crew never stand among its stations' users). */
const inside = (a: Pick<Area, "rect" | "kind">, half: number) =>
	[a.rect.x + (a.kind === "project" || a.kind === "vacant" ? SIDE + STRIP.w : 13) + half, a.rect.x + a.rect.w - 13 - half] as const;

/** The crew body's half width, at the size STATION_REACH is measured for. */
const CREW_HALF = (BODY.halfW * STATION_CREW_PX) / BODY.unit;

/** A desk's own end places (SQUEEZE), right end first, each with the desk whose build spot is in
 * its gap (`buildSlot` is just past a desk's left end): the right-hand neighbour's, or its own. */
export function endGaps(world: Floor, desk: Desk): { slot: Slot; builder?: string }[] {
	const area = world.areas.find((a) => a.id === desk.areaId);
	if (!area) return [];
	const [lo, hi] = inside(area, CREW_HALF);
	const beside = (col: number) => area.desks.find((d) => d.row === desk.row && d.col === col);
	const out: { slot: Slot; builder?: string }[] = [];
	for (const side of [1, -1] as const) {
		const tower = side > 0 ? beside(desk.col + 1) : desk;
		// The gap's middle, unless that puts a body on the tower in the gap (the build spot's desk's,
		// at its left end): then just left of its bricks, which leaves room for the name card on its left.
		const mid = desk.at.x + side * SQUEEZE.end.dx;
		const x = tower ? Math.min(mid, Math.floor(tower.at.x + BUILD.left - CREW_HALF)) : mid;
		if (x < lo || x > hi) continue;
		// The gap's owner is the desk on its left: our left end is the left neighbour's right end.
		if (side < 0 && beside(desk.col - 1)) continue;
		const y = desk.at.y + SQUEEZE.end.dy;
		const builder = tower?.id;
		out.push({ slot: { x, y, depth: desk.at.y + 1, facing: side > 0 ? -1 : 1 }, ...(builder ? { builder } : {}) });
	}
	return out;
}

/** The places beside a desk's ends that are its own (`endGaps`). */
export const endPlaces = (world: Floor, desk: Desk): Slot[] => endGaps(world, desk).map((g) => g.slot);

/** Where the one on an end place steps aside to while a brick run to the build spot in its gap is
 * under way: a short step forward (SQUEEZE.yieldDy), clear of the builder's face and both name
 * cards, facing the builder as it comes up from the row. */
export function yieldFrom(end: Slot): Slot {
	const y = end.y + SQUEEZE.yieldDy;
	return { x: end.x, y, depth: y, facing: 1 };
}

/**
 * Where a desk's `n` crew stand: `crewSpot`'s places while they all stand on the room's floor (a line
 * with no open floor in front of its belt: on its own cell's); else
 * the row of four as it is, the spots in lent cells, the desk's free ends (`endPlaces`), and only
 * then the row tightened to as many abreast as it takes (up to six), then (a crowd past all that)
 * the crowd's places held at the room's foot. Spot `crew:i` is the i-th; once the row tightens, its
 * places move as the crew grows (they walk there).
 */
export function crewPlaces(world: Floor, desk: Desk, n: number): Slot[] {
	const spots = crewSpots(world, desk);
	const normal = Array.from({ length: n }, (_, i) => crewSpot(spots, desk, i));
	const area = world.areas.find((a) => a.id === desk.areaId);
	if (!area) return normal;
	// A line with no open floor in front of its belt keeps its crew on its own cell's floor: a crowd
	// row there would stand on the next row's desk and booth.
	const closed = world.staging?.bay === "line" && !openInFront(area, desk.cell);
	const foot = closed ? Math.min(floorFoot(area), desk.cell.y + desk.cell.h - SQUEEZE.foot) : floorFoot(area);
	if (normal.every((s) => s.y <= foot)) return normal;
	const own = ownPattern(world, area, desk.cell).length;
	// The aisle's row, and a line's, always stand on the floor (a line's pair is in front only over open floor).
	const row = spots.slice(0, own).filter((s) => s.y <= foot);
	const lent = spots.slice(own).filter((s) => s.y <= foot);
	const ends = endPlaces(world, desk);
	const extra = n - row.length - lent.length - ends.length;
	if (extra <= 0) return [...row, ...lent, ...ends].slice(0, n);
	// The ends are used up: the row tightens, centred on the desk, slid to keep inside the walls.
	const abreast = Math.min(SQUEEZE.abreast, row.length + extra);
	const [lo, hi] = inside(area, CREW_HALF);
	const xs = Array.from({ length: abreast }, (_, k) => (k - (abreast - 1) / 2) * SQUEEZE.pitch);
	const left = desk.at.x + xs[0]!;
	const right = desk.at.x + xs[xs.length - 1]!;
	const shift = left < lo ? lo - left : right > hi ? hi - right : 0;
	// Fill order: the outer pair first (facing in, their work between them), then inwards.
	const order = [...xs].sort((p, q) => Math.abs(q) - Math.abs(p) || p - q);
	// The row's own line: the aisle's front row, or a line's belt.
	const y = spots[0]!.y;
	const tight: Slot[] = order.map((dx) => {
		const x = Math.round(desk.at.x + dx + shift);
		return { x, y, depth: y, facing: x < desk.lead.x ? 1 : -1 };
	});
	const out = [...tight.slice(0, row.length), ...lent, ...ends, ...tight.slice(row.length)];
	// A crowd past all of that: the crowd's places, but never off the floor.
	for (let i = out.length; i < n; i++) {
		const s = normal[i] ?? crewSpot(spots, desk, i);
		const fy = Math.min(s.y, foot);
		out.push({ ...s, y: fy, depth: fy });
	}
	return out.slice(0, n);
}

/** How close two crew may stand (feet, px): closer than this both ways, one covers the other's face
 * or its pill does. */
export const OVERLAP = { dx: AISLE.pitch - 2, dy: AISLE.row } as const;

/** Where a re-staggered spot may try, nearest first: half places along its row. */
const STAGGER_X = [0, 27, -27, 54, -54, 81, -81, 108, -108];

/** Move a crew spot that would stand on an earlier one along its row to the nearest clear place,
 * still in front of the desk. If there is none (a very big crew), it crowds in where it was. */
export function restagger(slot: Slot, earlier: Slot[], desk: Desk): Slot {
	const clear = (x: number, y: number) => !earlier.some((p) => Math.abs(p.x - x) < OVERLAP.dx && Math.abs(p.y - y) < OVERLAP.dy);
	if (clear(slot.x, slot.y)) return slot;
	for (const ox of STAGGER_X) {
		const x = slot.x + ox;
		if (Math.abs(x - desk.at.x) > CROWD.reach) continue;
		if (clear(x, slot.y)) return { ...slot, x, facing: x < desk.lead.x ? 1 : -1 };
	}
	return slot;
}

/**
 * Crew standing close together: the rear one (higher up the floor) turns to face the one in front
 * of it, so a crowd reads as people talking over each other's shoulders, not a queue of backs. Only
 * spots marked `turn` (the crowd) turn; the spaced spots keep facing their partner across the work.
 */
export function faceFront(slots: { slot: Slot; turn: boolean }[]): Slot[] {
	return slots.map(({ slot, turn }) => {
		if (!turn) return slot;
		let best: Slot | undefined;
		for (const { slot: p } of slots) {
			if (p === slot || p.y <= slot.y || Math.abs(p.x - slot.x) >= 44 || p.y - slot.y >= 26) continue;
			if (!best || Math.hypot(p.x - slot.x, p.y - slot.y) < Math.hypot(best.x - slot.x, best.y - slot.y)) best = p;
		}
		if (!best || best.x === slot.x) return slot;
		const facing = best.x > slot.x ? 1 : -1;
		return facing === slot.facing ? slot : { ...slot, facing };
	});
}

/** The crew's build on a desk (office.ts draws it): bricks this big, stacked this many to a course,
 * from the desk's left end (the outer end, away from the screen), relative to the desk front's
 * centre. Its three columns end left of the lead's face (SEAT), so however tall it grows it never
 * covers it. */
export const BUILD = { brickW: 12, brickH: 9, wide: 3, left: -87, floor: -52 } as const;

/** Where a builder stands to set a brick on its desk's build: just past the desk's left end, a
 * little back, facing the tower. */
export function buildSlot(desk: Desk): Slot {
	const x = desk.at.x + BUILD.left - 16;
	const y = desk.at.y - 22;
	return { x, y, depth: y, facing: 1 };
}
