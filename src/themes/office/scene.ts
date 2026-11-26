import { INK } from "../../scene/office/paper";
import { mix } from "../../scene/office/light";
import type { Who } from "../../scene/contract";
import type { Area } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import type { SceneLight, SceneTheme } from "../../scene/theme/types";
import { OFFICE_WORDS } from "./words";
import { LAWN, ROOM_COLOURS, SLAB } from "./palette";
import { hallway, room } from "./room";
import { cake, drawers, inTray, mugPile, plannerOf, skip, testLamp } from "./desk";
import { BINDERS, drawFurniture } from "./furniture";
import { patio } from "./outside";

/** A project room's rug under its desks: a step deeper than its floor, never near a body colour,
 * edged in the wall's colour so the room reads as its project's from the whole-office stop. */
function rugOf(a: Area): { fill: number; edge: number } | undefined {
	if (a.kind !== "project") return undefined;
	const [wall, floor] = ROOM_COLOURS[a.hue % ROOM_COLOURS.length]!;
	return { fill: mix(floor, wall, 0.35), edge: mix(wall, INK, 0.12) };
}

/** Who keeps an empty office company. */
export const NIGHT_WATCH: Who = { key: "night-watch", kind: "lead", role: "lead", mood: "idle", size: 72, tint: "night-watch" };

/** The office's light (office/light.ts): warm desk lamps and round ceiling pools, a city skyline,
 * the lawn with trees; night after design/boards/PaperNight. */
const OFFICE_LIGHT: SceneLight = {
	ambient: { morning: 0xe9e6f5, noon: 0xffffff, afternoon: 0xfbeedb, dusk: 0xb4a9c9, night: 0x464f80 },
	hall: { morning: 0xeeecf7, noon: 0xffffff, afternoon: 0xfdf2e2, dusk: 0xc6bdd6, night: 0x8b92bd },
	outside: { morning: 0xf2f0ff, noon: 0xffffff, afternoon: 0xffeed6, dusk: 0xa9a0c8, night: 0x35406e },
	lamp: 0xfff1d2,
	glow: 0xffc867,
	overhead: "pools",
	vacant: 0.72,
	sun: 0xfff0c4,
	sky: {
		morning: [0xbfe1ff, 0xffe3c8],
		noon: [0x8fd0ff, 0xd3f0ff],
		afternoon: [0xa8cdf2, 0xffcf8f],
		dusk: [0x564a8e, 0xff9a78],
		night: [0x141a36, 0x29356a],
	},
	skyline: {
		morning: [0xc4d0e6, 0x9cb0d0],
		noon: [0xc6d6ea, 0x9fb7d8],
		afternoon: [0xd9bfae, 0xb4978f],
		dusk: [0x6d5a8f, 0x463a6a],
		night: [0x2a3360, 0x1d2548],
	},
	window: { inset: 5, panes: 2, transom: false, bar: 5 },
	floors: { project: "carpet", vacant: "carpet", meeting: "carpet", lobby: "planks", yours: "planks" },
	cluster: "rug",
	decal: { size: 34, colour: INK, stencil: false },
	yard: "trees",
};

export const OFFICE_THEME: SceneTheme = {
	id: "office",
	words: OFFICE_WORDS,
	lawn: LAWN,
	slab: SLAB,
	room,
	hallway,
	furniture: drawFurniture,
	desk: { tray: inTray, mugs: mugPile, lamp: testLamp, drawers, skip, treat: cake },
	planner: (r, rows) => plannerOf(r, rows),
	rug: rugOf,
	patio,
	crewBuild: (b, seed) => crewBuild(b, seed, BINDERS),
	nightWatch: NIGHT_WATCH,
	arms: false,
	light: OFFICE_LIGHT,
};

// --- Staging (world/staging.ts) ----------------------------------------------------------------

/** The office keeps its desks and its corridor; what moves on its own is the steam off the coffee,
 * the kitchen's ceiling fan and the copier's light (office/ambient.ts). */
OFFICE_THEME.staging = { bay: "desks", hall: "corridor", ambient: ["steam", "fan", "printer", "flicker"] };
