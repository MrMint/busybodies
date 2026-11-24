import type { Area } from "../../scene/world/world";
import { ROOM_COLOURS } from "../office/palette";

// --- Paint ------------------------------------------------------------------------------------

export const CREAM = 0xfff6e6;

export const IVORY = 0xfffaf0;

export const PINK = 0xff9ec4;

export const PINK_LIGHT = 0xffd3e4;

export const RASPBERRY = 0xe8507a;

export const MINT = 0x9fe3c8;

export const MINT_LIGHT = 0xd5f5e8;

export const LILAC = 0xcdb8ff;

export const LEMON = 0xfff08a;

export const BLUEBERRY = 0x6f86ec;

const ORANGE = 0xffa34d;

export const CHOC = 0x7a4a33;

export const CHOC_DARK = 0x4f2e22;

export const CRUST = 0xe09a48;

export const CRUST_LIGHT = 0xf4c27a;

export const CRUST_DARK = 0xb06a2e;

export const DOUGH = 0xf0c48a;

export const CHERRY = 0xe8384f;

export const CHROME = 0xe3e8f0;

export const CHROME_DARK = 0x8d97a8;

export const BRASS = 0xe8b84a;

export const COPPER = 0xd9824a;

export const BRICK = 0xc96a4f;

export const BRICK_DARK = 0x9c4b38;

export const WOOD = 0xd9a066;

export const WOOD_DARK = 0xa8703f;

export const MARBLE = 0xf7f4f0;

export const GLASS = 0xe6f6ff;

export const HEAT = 0xffb347;

export const CHALK = 0x34584a;

/** Sprinkles, icings, macaron shells, boxes: the bakery's candy colours, in turn. */
export const CANDY = [PINK, MINT, LEMON, LILAC, BLUEBERRY, ORANGE] as const;

/** The common rooms' wall and floor colours, as the project rooms' (themes/office/scene.ts ROOM_COLOURS):
 * the wall carries the colour, the floor is a pale tint of it. The tasting table pink, the shop
 * front butter, the pick-up counter mint, the café latte, a vacant room in dust sheets. */
const COMMON: Record<Exclude<Area["kind"], "project">, [number, number]> = {
	meeting: [0xffcfe0, 0xfff0f5],
	lobby: [0xffe6a0, 0xfff9e4],
	yours: [0xbfecd6, 0xecf9f2],
	kitchen: [0xecd3bb, 0xfbf3ea],
	vacant: [0xe3e6ee, 0xf2f3f7],
};

/** A room's wall and floor: the project's colour on the wall, a pale tint of it on the floor. */
export function coloursOf(a: Area): [wall: number, floor: number] {
	return a.kind === "project" ? ROOM_COLOURS[a.hue % ROOM_COLOURS.length]! : COMMON[a.kind];
}
