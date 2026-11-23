// Staging: what a theme says about the place itself, not just its paint (plan-alive wave 3, "themes
// own their staging"). The office's floor plan is the same in every theme (layout.ts: rooms, desk
// cells, stations), and the staging is a small grammar over it:
//
//   bay    "desks": each session at a desk with its crew round it (the office)
//          "line":  each row of a bay a production line, a belt across the floor in front of the
//                   desks, the crew strung along behind it, the lead up in a booth at its desk; tool
//                   calls ride the belt as parts while a kind of work is held (the factory)
//   hall   "corridor": a hallway to walk down (the office)
//          "conveyor": the hallway's belt carries PR crates down to the dock at its end (the factory)
//   ambient  what moves on its own on the life clock (office/ambient.ts): steam off the coffee, a
//          ceiling fan, the printer's light; a beacon while a build runs, steam vents, weld sparks;
//          the bakery's oven glow, marquee bulbs, a turning cake, sprinkles, pastries on the belt
//   habits the idle habits the theme's cast rotates through (rig/poses.ts names; director/habits.ts)
//
// A theme without a staging gets the office's behaviour (`stagingOf`), so a new theme only says
// what it changes. Pixi-free: the layout, the director and tests read it.

/** Things that move on their own, on the life clock (office/ambient.ts draws each). */
export type AmbientKind = "steam" | "fan" | "printer" | "beacon" | "vents" | "sparks" | "ovens" | "marquee" | "cakeStand" | "sprinkles" | "parade";

/** What the world carries (office/world.ts `World.staging`): the layout reads the bay and the hall,
 * the director the habits. */
export interface Staging {
	bay: "desks" | "line";
	hall: "corridor" | "conveyor";
	/** The idle habits, in rotation order (pose names). None: the rig's seven (rig/poses.ts HABITS). */
	habits?: readonly string[];
}

export interface SceneStaging extends Staging {
	ambient: readonly AmbientKind[];
}

/** The office's behaviour: desks, a corridor, nothing ambient, the rig's habits. */
export const DEFAULT_STAGING: SceneStaging = { bay: "desks", hall: "corridor", ambient: [] };

/** A theme's staging, or the default when it has none. */
export const stagingOf = (theme: { staging?: SceneStaging } | undefined): SceneStaging => theme?.staging ?? DEFAULT_STAGING;
