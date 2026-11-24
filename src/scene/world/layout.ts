// The floor plan: which room each project gets and which desk each session gets. It remembers its
// past assignments, so a snapshot that adds or removes one session moves nobody else. The rules
// (also in docs/decisions.md):
//
// - A hallway runs left to right. Rooms sit in two bands, above and below it, and each room is
//   anchored at the hallway: a room above grows upward, a room below grows downward. So a room
//   gaining a row of desks never moves anyone.
// - The common areas come first in each band: the meeting room above; the lobby and kitchen below.
// - A new project takes a vacant room it fits in, or else a new room at the end of the shorter
//   band. Its width (2 to 4 desk columns, about √n for n sessions) is set once, from its sessions
//   when it arrives; rooms never change width, so no room ever slides along the hallway.
// - A session takes the first free desk in its room, row by row from the hallway side; a side
//   session takes the free desk nearest the session that started it. A full room adds a row.
// - When a session ends its desk is freed, not compacted. Empty back rows are trimmed (never below
//   two). A room whose last session ends stays as a vacant room until a new project needs it.
import type { Session, Snapshot } from "../../watcher/model";
import {
	type Area,
	type Band,
	CELL_W,
	COMMON_W,
	type Desk,
	type Fixture,
	FRONT,
	HALL,
	MAX_COLS,
	MIN_ROWS,
	ROW,
	type Rect,
	SEAT,
	SIDE,
	STATION_FURNITURE,
	STRIP,
	type SignSlot,
	type Slot,
	WALL,
	type WallItem,
	type Floor,
	type Yard,
	beltsFor,
	roomHeight,
	roomWidth,
	shredderFor,
	stationsFor,
} from "./world";
import { LEAD_SIZE } from "./placement";
import { bellFrom } from "./rigpoints";
import { OFFICE_WORDS } from "../../themes/office/words";
import { DEFAULT_STAGING, type Staging } from "./staging";

interface Room {
	/** Stable for the room's life: "meeting", "lobby", "kitchen", or "room-<n>". */
	key: string;
	kind: Area["kind"];
	band: Band;
	width: number;
	cols: number;
	/** Occupant per cell, row-major; null is a free desk. Its length is always cols * rows. */
	cells: (string | null)[];
	project?: string;
	/** Busy crew across the project's sessions, this snapshot: a big crew earns extra stations. */
	crew?: number;
}

/** A session in reading order, with the session that started it. */
interface Seat {
	session: Session;
	parent?: string;
}

const byStart = (a: Session, b: Session) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every session, parents before the side sessions they started, oldest first at each level. */
export function seats(sessions: Session[], parent?: string): Seat[] {
	return [...sessions].sort(byStart).flatMap((s) => [{ session: s, parent }, ...seats(s.children, s.id)]);
}

export class FloorPlan {
	#bands: Record<Band, Room[]> = { top: [], bottom: [] };
	#rooms = new Map<string, Room>(); // by project
	#next = 0;
	#staging: Staging = { bay: DEFAULT_STAGING.bay, hall: DEFAULT_STAGING.hall };

	constructor() {
		this.#bands.top.push(common("meeting", "top"));
		this.#bands.bottom.push(common("lobby", "bottom"), common("yours", "bottom"), common("kitchen", "bottom"));
	}

	/** Fold a snapshot into the plan and return the world it gives, staged as the theme says
	 * (world/staging.ts): the rooms and desks are the same in every staging. */
	update(snapshot: Snapshot, staging: Staging = DEFAULT_STAGING): Floor {
		this.#staging = {
			bay: staging.bay,
			hall: staging.hall,
			...(staging.habits ? { habits: staging.habits } : {}),
			...(staging.leadHabits ? { leadHabits: staging.leadHabits } : {}),
		};
		const all = seats(snapshot.sessions);
		const live = new Set(all.map((s) => s.session.id));

		// Free the desks of sessions that ended, and vacate rooms left empty.
		for (const room of this.#allRooms()) {
			if (room.kind !== "project") continue;
			room.cells = room.cells.map((id) => (id && live.has(id) ? id : null));
			if (room.cells.every((c) => c === null)) {
				this.#rooms.delete(room.project!);
				room.kind = "vacant";
				room.project = undefined;
			}
		}

		// Give new projects a room: sized by their sessions, in a vacant room that fits or a new one.
		const byProject = new Map<string, Seat[]>();
		for (const s of all) byProject.set(s.session.project, [...(byProject.get(s.session.project) ?? []), s]);
		for (const [project, list] of byProject) {
			if (this.#rooms.has(project)) continue;
			const cols = Math.min(MAX_COLS, Math.max(2, Math.ceil(Math.sqrt(list.length))));
			const room = this.#vacantFor(cols) ?? this.#newRoom(cols);
			room.kind = "project";
			room.project = project;
			room.cells = Array(room.cols * Math.max(MIN_ROWS, Math.ceil(list.length / room.cols))).fill(null);
			this.#rooms.set(project, room);
		}

		// Count each project's busy crew, for its stations.
		const running = (list: Session["agents"]): number => list.reduce((n, a) => n + (a.status === "running" ? 1 : 0) + running(a.children), 0);
		for (const [project, list] of byProject) {
			const room = this.#rooms.get(project);
			if (room) room.crew = list.reduce((n, s) => n + running(s.session.agents), 0);
		}

		// Seat new sessions.
		const deskOf = new Map<string, { room: Room; index: number }>();
		for (const room of this.#rooms.values()) room.cells.forEach((id, index) => id && deskOf.set(id, { room, index }));
		for (const { session, parent } of all) {
			if (deskOf.has(session.id)) continue;
			const room = this.#rooms.get(session.project)!;
			const near = parent ? deskOf.get(parent) : undefined;
			const index = near?.room === room ? nearestFree(room, near.index) : firstFree(room);
			room.cells[index] = session.id;
			deskOf.set(session.id, { room, index });
		}

		// Trim empty back rows.
		for (const room of this.#rooms.values()) {
			while (room.cells.length > room.cols * MIN_ROWS && room.cells.slice(-room.cols).every((c) => c === null)) {
				room.cells.length -= room.cols;
			}
		}

		return this.#world();
	}

	#allRooms(): Room[] {
		return [...this.#bands.top, ...this.#bands.bottom];
	}

	#vacantFor(cols: number): Room | undefined {
		const fits = this.#allRooms().filter((r) => r.kind === "vacant" && r.cols >= cols);
		fits.sort((a, b) => a.cols - b.cols);
		return fits[0];
	}

	#newRoom(cols: number): Room {
		const end = (band: Band) => this.#bands[band].reduce((x, r) => x + r.width, 0);
		const band: Band = end("top") <= end("bottom") ? "top" : "bottom";
		const room: Room = { key: `room-${++this.#next}`, kind: "vacant", band, width: roomWidth(cols), cols, cells: [] };
		this.#bands[band].push(room);
		return room;
	}

	#world(): Floor {
		const areas: Area[] = [];
		const desks = new Map<string, Desk>();
		const signs: SignSlot[] = [];
		let right = 0;
		for (const band of ["top", "bottom"] as Band[]) {
			let x = 0;
			for (const room of this.#bands[band]) {
				const area = build(room, x);
				if (this.#staging.bay === "line" && area.kind === "project") area.belts = beltsFor(area);
				areas.push(area);
				for (const d of area.desks) desks.set(d.id, d);
				for (const w of area.wall) if (w.slot) signs.push({ id: w.slot, kind: w.kind as SignSlot["kind"], areaId: area.id, rect: w.rect });
				x += room.width;
			}
			right = Math.max(right, x);
		}
		const hallway = { x: 0, y: 0, w: right, h: HALL };
		const top = Math.min(0, ...areas.map((a) => a.rect.y));
		const bottom = Math.max(HALL, ...areas.map((a) => a.rect.y + a.rect.h));
		const staging = { ...this.#staging };
		const mid = HALL / 2;
		const conveyor = staging.hall === "conveyor" ? { y: mid, x0: 0, x1: right, dock: { x: right - DOCK_W / 2, y: mid } } : undefined;
		const yards = yardsOf(areas, right, top, bottom);
		return { bounds: { x: 0, y: top, w: right, h: bottom - top }, hallway, areas, desks, signs, yards, staging, ...(conveyor ? { conveyor } : {}) };
	}
}

/** The dock at the hallway's right end (staging `conveyor`): this wide. */
export const DOCK_W = 56;

/**
 * The footprint's gaps: in each band, past its last room (the hallway runs the building's whole
 * width, so the shorter band leaves a block), and outside any room shallower than its band. Strips
 * side by side at the same depth are one gap.
 */
function yardsOf(areas: Area[], right: number, top: number, bottom: number): Yard[] {
	const out: Yard[] = [];
	for (const band of ["top", "bottom"] as Band[]) {
		const rooms = areas.filter((a) => a.band === band).sort((a, b) => a.rect.x - b.rect.x);
		const strips: Rect[] = [];
		const edge = band === "top" ? top : bottom;
		const near = band === "top" ? 0 : HALL;
		for (const a of rooms) {
			const depth = band === "top" ? a.rect.y - top : bottom - (a.rect.y + a.rect.h);
			if (depth > 0) strips.push({ x: a.rect.x, y: band === "top" ? top : a.rect.y + a.rect.h, w: a.rect.w, h: depth });
		}
		const end = rooms.reduce((x, a) => Math.max(x, a.rect.x + a.rect.w), 0);
		if (right > end) strips.push({ x: end, y: Math.min(edge, near), w: right - end, h: Math.abs(edge - near) });
		for (const r of strips) {
			const last = out[out.length - 1];
			if (last && last.band === band && last.rect.y === r.y && last.rect.h === r.h && last.rect.x + last.rect.w === r.x) last.rect.w += r.w;
			else if (r.w > 0 && r.h > 0) out.push({ rect: { ...r }, band });
		}
	}
	return out;
}

function common(kind: "meeting" | "lobby" | "yours" | "kitchen", band: Band): Room {
	return { key: kind, kind, band, width: COMMON_W[kind], cols: 0, cells: [] };
}

function firstFree(room: Room): number {
	const i = room.cells.indexOf(null);
	if (i >= 0) return i;
	room.cells.push(...Array(room.cols).fill(null));
	return room.cells.length - room.cols;
}

function nearestFree(room: Room, from: number): number {
	const fc = from % room.cols;
	const fr = Math.floor(from / room.cols);
	let best = -1;
	let bestD = Infinity;
	room.cells.forEach((id, i) => {
		if (id !== null) return;
		const d = Math.abs((i % room.cols) - fc) + Math.abs(Math.floor(i / room.cols) - fr);
		if (d < bestD) [best, bestD] = [i, d];
	});
	return best >= 0 ? best : firstFree(room);
}

// --- Geometry ---------------------------------------------------------------------------------

/** Common areas are named with the office's words, in any theme: the name is the area's identity
 * (tools and tests aim at it); the office's tabs show the theme's own (theme/words.ts). */
const NAMES = OFFICE_WORDS.areas;

function build(room: Room, x: number): Area {
	const rows = room.cols ? room.cells.length / room.cols : MIN_ROWS;
	const h = roomHeight(rows);
	const y = room.band === "top" ? -h : HALL;
	const rect = { x, y, w: room.width, h };
	const floorY = y + WALL;
	const id = room.kind === "project" ? `room:${room.project}` : room.kind === "vacant" ? `vacant:${room.key}` : room.key;
	const name = room.kind === "project" ? room.project! : room.kind === "vacant" ? "vacant" : NAMES[room.kind];
	const hue = room.key.startsWith("room-") ? Number(room.key.slice(5)) - 1 : -1;
	const area: Area = {
		id,
		kind: room.kind,
		name,
		band: room.band,
		hue,
		rect,
		floorY,
		cols: room.cols,
		rows,
		cells: [],
		desks: [],
		fixtures: [],
		wall: [],
		spots: {},
		stations: [],
	};

	if (room.kind === "project" || room.kind === "vacant") {
		room.cells.forEach((occupant, i) => {
			const cell = cellRect(room, x, i);
			area.cells.push(cell);
			if (occupant) area.desks.push(desk(occupant, id, room, i, cell));
		});
		dressRoom(area);
		if (room.kind === "project") {
			area.stations = stationsFor(area, room.crew ?? 0);
			for (const st of area.stations) {
				const kind = STATION_FURNITURE[st.kind];
				if (kind) area.fixtures.push(fixture(kind, st.base.x, st.base.y));
			}
			// The shredder, in the back corner opposite the strip.
			area.shredder = shredderFor(area);
			area.fixtures.push(fixture("shredder", area.shredder.base.x, area.shredder.base.y));
		}
	} else if (room.kind === "meeting") meeting(area);
	else if (room.kind === "lobby") lobby(area);
	else if (room.kind === "yours") yours(area);
	else kitchen(area);
	return area;
}

/** A desk cell. Row 0 is beside the hallway; above it, rows climb up; below it, they go down. */
function cellRect(room: Room, x: number, i: number): Rect {
	const col = i % room.cols;
	const row = Math.floor(i / room.cols);
	const cx = x + SIDE + STRIP.w + col * CELL_W;
	const cy = room.band === "top" ? -FRONT - (row + 1) * ROW : HALL + WALL + row * ROW;
	return { x: cx, y: cy, w: CELL_W, h: ROW };
}

function desk(id: string, areaId: string, room: Room, i: number, cell: Rect): Desk {
	const at = { x: cell.x + CELL_W / 2, y: cell.y + 78 };
	// The lead stands behind the desk (SEAT), its whole face above the desk top, between the crew
	// build and the screen.
	const lead: Slot = { x: at.x + SEAT.x, y: at.y + SEAT.y, depth: at.y + SEAT.y, facing: 1 };
	const chair: Fixture = { kind: "chair", x: lead.x, y: lead.y - 4, depth: lead.y - 4 };
	return { id, areaId, col: i % room.cols, row: Math.floor(i / room.cols), cell, at, lead, chair };
}

const slot = (x: number, y: number, facing: 1 | -1 = 1): Slot => ({ x, y, depth: y, facing });
const fixture = (kind: Fixture["kind"], x: number, y: number): Fixture => ({ kind, x, y, depth: y });

/** Where signs and whiteboards hang on a back wall, down from its top: their foot is clear of
 * head height (a back-row lead's head is ~36 px above the floor line, WALL down). */
const SIGN_TOP = 12;
export const SIGN_FOOT = 64;

/** Back-wall dressing for a project room, from its width alone, so it never shuffles. */
function dressRoom(a: Area): void {
	const { x, y, w } = a.rect;
	const wy = y + 14;
	const key = a.id;
	// The todo planner over the station strip (office/props.ts draws its sticky notes): whoever posts
	// a note stands clear of the desks. The room's sign takes the first window's place.
	a.wall.push({ kind: "planner", rect: { x: x + 18, y: wy - 2, w: 132, h: 84 } });
	// Signs and whiteboards hang high, their foot above the heads of the leads at the back row of
	// desks (a lead's head reaches ~36 px above the floor line): text never hides behind a head.
	let at = x + 168;
	const items: WallItem["kind"][] = ["sign", "whiteboard", "window", "window"];
	for (const kind of items) {
		const ww = kind === "whiteboard" ? 150 : 116;
		if (at + ww > x + w - (a.band === "bottom" ? 90 : 18)) break;
		const rect =
			kind === "whiteboard"
				? { x: at, y: y + SIGN_TOP - 4, w: ww, h: SIGN_FOOT - SIGN_TOP + 4 }
				: kind === "sign"
					? { x: at, y: y + SIGN_TOP, w: ww, h: SIGN_FOOT - SIGN_TOP }
					: { x: at, y: wy + 4, w: ww, h: 74 };
		a.wall.push({ kind, rect, slot: kind === "whiteboard" ? `${key}:board` : kind === "sign" ? `${key}:sign` : undefined });
		at += ww + 26;
	}
	if (a.band === "bottom") a.wall.push({ kind: "door", rect: { x: x + w - 82, y: y + 14, w: 60, h: WALL - 14 } });
	// The plant stands at the back, behind the shredder: in the right corner, or (below the hallway,
	// where the door has that corner) just left of the door. The front corner is where the rightmost
	// desk's crew stand (its outer place reaches the side wall). By the door, its leaves (22 right of
	// its base) keep 6 px clear of the door frame.
	a.fixtures.push(fixture("plant", a.band === "bottom" ? x + w - 113 : x + w - 24, a.floorY + 6));
}

function meeting(a: Area): void {
	const { x, w } = a.rect;
	const f = a.floorY;
	a.wall.push({ kind: "sign", rect: { x: x + 16, y: a.rect.y + SIGN_TOP, w: 128, h: SIGN_FOOT - SIGN_TOP }, slot: "meeting:sign" });
	a.wall.push({ kind: "whiteboard", rect: { x: x + 160, y: a.rect.y + SIGN_TOP - 4, w: 160, h: SIGN_FOOT - SIGN_TOP + 4 }, slot: "meeting:board" });
	a.fixtures.push(fixture("chair", x + 130, f + 92), fixture("chair", x + 210, f + 92), fixture("table", x + w / 2, f + 150));
	a.fixtures.push(fixture("plant", x + w - 28, f + 270));
	a.spots.seat = [slot(x + 130, f + 104), slot(x + 210, f + 104, -1), slot(x + 62, f + 200), slot(x + w - 62, f + 200, -1)];
}

function lobby(a: Area): void {
	const { x, w } = a.rect;
	const f = a.floorY;
	a.wall.push({ kind: "frame", rect: { x: x + 14, y: a.rect.y + SIGN_TOP - 4, w: 140, h: SIGN_FOOT - SIGN_TOP + 4 }, slot: "lobby:frame" });
	a.wall.push({ kind: "door", rect: { x: x + 172, y: a.rect.y + 14, w: 64, h: WALL - 14 } });
	a.fixtures.push(fixture("pod", x + w / 2, f + 140), fixture("sofa", x + 100, f + 270), fixture("plant", x + w - 28, f + 260));
	// In the pod's window: drawn over the pod, so deeper than its base.
	a.spots.nap = [{ x: x + w / 2 - 36, y: f + 128, depth: f + 141, facing: 1 }];
	a.spots.sofa = [slot(x + 70, f + 262), slot(x + 130, f + 262, -1)];
	a.spots.door = [slot(x + 204, f + 30, -1)];
}

/**
 * Your office, beside the lobby: where sessions waiting on you queue. Its back wall has the door
 * in from the hallway (first, so walks use it), the NOW SERVING sign, and your door, marked YOU.
 * The ticket machine stands by the way in, the counter with the bell by your door; the queue runs
 * from the counter down and to the left, then back right, in the order of `spots.line`.
 */
const YOURS_LINE = 9;

function yours(a: Area): void {
	const { x, w } = a.rect;
	const f = a.floorY;
	a.wall.push({ kind: "door", rect: { x: x + 16, y: a.rect.y + 14, w: 60, h: WALL - 14 } });
	a.wall.push({ kind: "sign", rect: { x: x + 90, y: a.rect.y + SIGN_TOP, w: 116, h: SIGN_FOOT - SIGN_TOP }, slot: "yours:serving" });
	a.wall.push({ kind: "you", rect: { x: x + 218, y: a.rect.y + 14, w: 64, h: WALL - 14 } });
	a.spots.line = Array.from({ length: YOURS_LINE }, (_, k) =>
		k < 5 ? slot(x + 160 - 30 * k, f + 52 + 34 * k) : slot(x + 66 + 34 * (k - 5), f + 232 + 30 * (k - 5)),
	);
	// The counter stands where the first in line rings the bell (rigpoints.ts): its base just behind
	// the ringer's feet, its top under the plunger (the bell itself is the rig's while it rings).
	const front = a.spots.line[0]!;
	const bell = bellFrom(front, LEAD_SIZE);
	a.fixtures.push(fixture("tickets", x + 100, f + 40), fixture("bell", Math.round(bell.plunger.x), front.y - 1), fixture("plant", x + w - 26, f + 340));
}

function kitchen(a: Area): void {
	const { x } = a.rect;
	const f = a.floorY;
	a.wall.push({ kind: "door", rect: { x: x + 376, y: a.rect.y + 14, w: 64, h: WALL - 14 } });
	a.wall.push({ kind: "sign", rect: { x: x + 196, y: a.rect.y + SIGN_TOP, w: 160, h: SIGN_FOOT - SIGN_TOP }, slot: "kitchen:sign" });
	a.fixtures.push(fixture("fridge", x + 70, f + 50), fixture("counter", x + 200, f + 56), fixture("cooler", x + 320, f + 56));
	a.fixtures.push(fixture("sofa", x + 110, f + 270), fixture("plant", x + 430, f + 274));
	a.spots.queue = [0, 1, 2, 3, 4].map((i) => slot(x + 214 + i * 40, f + 100 + i * 30, -1));
	a.spots.cooler = [slot(x + 300, f + 92), slot(x + 356, f + 104, -1)];
	a.spots.sofa = [slot(x + 80, f + 262), slot(x + 140, f + 262, -1)];
}
