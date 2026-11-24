// The compact strip's room tiles name each area in the theme's words (mainview/shots.ts): a
// project room by its project, a common area by what the theme calls it. Pixi-free.
import { describe, expect, test } from "bun:test";
import { tilesFor } from "../src/scene/director/shots";
import { THEME_IDS } from "../src/themes/ids";
import { areaLabel, wordsFor } from "../src/scene/theme/words";
import { tileAreas } from "../src/mainview/shots";
import type { AreaKind } from "../src/scene/office/world";

// The layout names common areas with the office's words in every theme (`Area.name`).
const FLOOR: { id: string; kind: AreaKind; name: string }[] = [
	{ id: "room:kettle", kind: "project", name: "kettle" },
	{ id: "meeting", kind: "meeting", name: "meeting room" },
	{ id: "lobby", kind: "lobby", name: "lobby" },
	{ id: "yours", kind: "yours", name: "your office" },
	{ id: "kitchen", kind: "kitchen", name: "kitchen" },
	{ id: "vacant:1", kind: "vacant", name: "vacant" },
];

describe("compact tiles", () => {
	for (const id of THEME_IDS) {
		test(`${id}: common areas by the theme's words, rooms by their project`, () => {
			const words = wordsFor(id);
			const tiles = tilesFor(tileAreas(FLOOR, words), {}, new Set(), new Set(["yours"]));
			expect(tiles.map((t) => t.name)).toEqual(["kettle", words.areas.meeting, words.areas.lobby, words.areas.yours, words.areas.kitchen, words.areas.vacant]);
			// Identity is untouched: pins and the camera still aim at the area's id.
			expect(tiles.map((t) => t.id)).toEqual(FLOOR.map((a) => a.id));
			expect(tiles.find((t) => t.id === "yours")?.state).toBe("waiting");
		});
	}

	test("the factory's and the bakery's tiles aren't the office's", () => {
		const names = (id: (typeof THEME_IDS)[number]) => tileAreas(FLOOR, wordsFor(id)).map((a) => a.name);
		expect(names("office")).toEqual(FLOOR.map((a) => a.name));
		expect(names("factory")).toContain("foreman's office");
		for (const id of ["factory", "bakery"] as const) expect(names(id).slice(1)).not.toEqual(names("office").slice(1));
	});

	test("areaLabel keeps a project room's own name", () => {
		expect(areaLabel({ kind: "project", name: "meeting room" }, wordsFor("bakery"))).toBe("meeting room");
	});
});
