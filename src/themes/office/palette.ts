
import { SUN } from "../../scene/office/paper";

export const LAWN = 0xbfe8c6;

export const SLAB = 0x46536f;

export const HALL_FLOOR = 0xf3efe2;

/** Wall and floor colours. Projects take them in the order their rooms were built. The back wall
 * carries the project's colour and the floor is only a pale tint of it: the floor is the cast's
 * background, so a blue builder never stands on a blue floor (the rug, a shade deeper, and the side
 * walls carry the colour down the room). */
export const ROOM_COLOURS: [number, number][] = [
	[0xffd9a8, 0xfff1dc], // orange
	[0xc4dcff, 0xe9f2ff], // blue
	[0xbfecd6, 0xe8f8f0], // green
	[0xffcfe0, 0xffeef4], // pink
	[0xdccfff, 0xf2edff], // lilac
	[0xffeaa6, 0xfff8dc], // yellow
	[0xbfe6f7, 0xe6f6fd], // cyan
];

export const COMMON_COLOURS = {
	meeting: [0xf1f3fa, 0xcfd6ea],
	lobby: [0xf6f1e4, 0xe8dfc8],
	yours: [0xfff1e0, 0xe9d6c0],
	kitchen: [0xf6f1e4, 0xffffff],
	vacant: [0xeef0f4, 0xd9dde6],
} as const;

// --- The patio ----------------------------------------------------------------------------------

export const STONE = 0xebe5d6;

export const BLOOMS = [0xff8fa3, 0xffd166, 0xb69cff, 0xffffff];

/** The ficus's leaves (`ficus`), left and right of its base x, and the air a poster keeps from them. */
export const PLANT_LEAVES = { left: 24, right: 22, air: 8 } as const;

// --- Desk props ---------------------------------------------------------------------------------

export const PAPER = 0xffffff;

export const PAPER_EDGE = 0xdfe4f2;

// --- The planner -------------------------------------------------------------------------------

export const NOTE_COLOURS = [SUN, 0xffbdd6, 0x9be3ff, 0xa5e6c9, 0xd2c0ff, 0xffc47f];

// Stations: shared equipment along a project room's left wall (world.ts STRIP). The office draws
// only each station's body, around its base, with its user standing to the right facing it; the rig
// draws the moving parts (the top drawer, the card tray, the copier's lid, button, light, jam door
// and out-tray, the ink pad and forms) at the working point, (+20, -40) from the base, in every frame.
// So each body's top surface is at that height, starting a few px past the point on the user's side
// and running back toward the wall, and nothing is drawn there that the rig draws.
export const WOOD = 0xd9a066;

export const WOOD_TOP = 0xf0c48a;
