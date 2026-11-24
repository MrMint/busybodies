
import { INK } from "../../scene/office/paper";
import type { Rect } from "../../scene/world/world";
import { crewBuild } from "../../scene/theme/build";
import { NIGHT_WATCH } from "../office/scene";
import { plannerOf } from "../office/desk";
import { FACTORY_STAGING } from "./staging";
import type { SceneLight, SceneTheme } from "../../scene/theme/types";
import { FACTORY_WORDS } from "./words";
import { hallway, rivets, room } from "./room";
import { beacon, cans, furniture, hopper, scrapBin, toolChest } from "./furniture";
import { CRATE_BUILD, FACTORY_STAGE } from "./stage";
import { yard } from "./outside";

/** The job board: the planner on a steel board with rivets, its notes magnets. */
const jobBoard = (r: Rect, rows: Parameters<typeof plannerOf>[1]) => plannerOf(r, rows, 0xdfe4e8, FACTORY_WORDS.columns, (g, b) => rivets(g, b.x, b.y, b.w, b.h));

/** The factory's light (office/light.ts): cold fluorescent strips over each line, high windows on
 * an industrial skyline, a gravel yard with bollards and pallets. */
const FACTORY_LIGHT: SceneLight = {
	ambient: { morning: 0xe4e6f0, noon: 0xf8fafc, afternoon: 0xf3eadc, dusk: 0xa7a8bd, night: 0x3e4866 },
	hall: { morning: 0xeaecf3, noon: 0xffffff, afternoon: 0xf7efe3, dusk: 0xbcbdcc, night: 0x868fac },
	outside: { morning: 0xeef0f8, noon: 0xffffff, afternoon: 0xfaebd4, dusk: 0xa3a0bd, night: 0x343d5c },
	lamp: 0xeef6ff,
	glow: 0xcfe6ff,
	overhead: "strips",
	vacant: 0.68,
	sun: 0xfff3d6,
	sky: {
		morning: [0xc9dcf0, 0xf3e1cf],
		noon: [0xa9cbe6, 0xdbe9f2],
		afternoon: [0xb8c9dc, 0xf2c995],
		dusk: [0x4f4a78, 0xe89272],
		night: [0x131828, 0x26304e],
	},
	skyline: {
		morning: [0xb7bfcc, 0x8e98a8],
		noon: [0xb9c2cf, 0x8f9aab],
		afternoon: [0xc8b4a4, 0x9a8679],
		dusk: [0x5d5577, 0x3c3654],
		night: [0x262c44, 0x191e33],
	},
	window: { inset: 4, height: 42, panes: 4, transom: true, bar: 2.5 },
	floors: { lobby: "planks" },
	cluster: "zone",
	decal: { size: 26, colour: INK, stencil: true },
	yard: "yard",
};

export const FACTORY_THEME: SceneTheme = {
	id: "factory",
	words: FACTORY_WORDS,
	lawn: 0xcfc8b8,
	slab: 0x3b4049,
	room,
	hallway,
	furniture,
	desk: { tray: hopper, mugs: cans, lamp: beacon, drawers: toolChest, skip: scrapBin },
	planner: jobBoard,
	patio: yard,
	crewBuild: (b, seed) => crewBuild(b, seed, CRATE_BUILD),
	nightWatch: { ...NIGHT_WATCH, tint: "night-shift" },
	arms: true,
	light: FACTORY_LIGHT,
	staging: FACTORY_STAGING,
	stage: FACTORY_STAGE,
};
