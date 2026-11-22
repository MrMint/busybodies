// Stations: shared equipment in a project room that the crew walks to for a kind of work (plan-next
// stream C). The director speaks in these theme-neutral kinds; the office theme draws them as a
// filing cabinet, a card catalogue, a copier and so on, and a later theme draws them as something
// else. This file is the contract between the director, the office and the rig: names only.
import type { WorkKind } from "./work";

export type StationKind = "reference" | "search" | "build" | "test" | "web" | "outbox" | "shredder";

/** The station a kind of work goes to. Edits stay at the crew member's own spot. */
export const STATION_FOR: Partial<Record<WorkKind, StationKind>> = {
	read: "reference",
	search: "search",
	shell: "build",
	test: "test",
	web: "web",
};

/**
 * The poses played at each station (the rig owns their frames). A character at a station stands
 * with its feet STATION_REACH office px from the station's working point, facing it, so every
 * station pose reaches to the same place.
 */
export const STATION_POSE: Record<StationKind, { work: string; bad?: string }> = {
	reference: { work: "fileFolder" },
	search: { work: "cardThumb" },
	build: { work: "copierFeed", bad: "copierKick" },
	test: { work: "stampGreen", bad: "stampRed" },
	web: { work: "phone" },
	outbox: { work: "mailDrop" },
	shredder: { work: "shred" },
};

/** Where a station's working point is, from the feet of a character using it, facing it (office
 * px, for a crew member about 58 px tall): a little in front and about desk-top high. */
export const STATION_REACH = { x: 38, y: -40 } as const;
