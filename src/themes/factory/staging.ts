// The factory's staging (world/staging.ts), apart from its paint so the director and the unit tests
// read it without a renderer. themes/factory/scene.ts draws what it names.
import type { SceneStaging } from "../../scene/world/staging";

/** The factory stages its bays as lines with a belt across the floor, the crew along it and the
 * foreman up in a booth; the hallway's conveyor carries PR crates to the dock. A beacon turns on a
 * press while a build runs, every press's pilot lamp blinks, the aisle's vents puff steam, a busy
 * line throws weld sparks. Idle, the
 * crew sit on oil drums, play cards on a pallet and kick the vending machine, while the foreman has a
 * brew, watches the line through binoculars and takes calls up in its booth (rig/data/poses.ts). */
export const FACTORY_STAGING: SceneStaging = {
	bay: "line",
	hall: "conveyor",
	ambient: ["beacon", "pilot", "vents", "sparks"],
	habits: ["drumSit", "palletCards", "vendingKick", "scrolling", "stretch", "faceDown", "slowWalk"],
	// Up in the booth its bench comes to the foreman's chin: its habits play at head height.
	leadHabits: ["boothWatch", "boothMug", "stretch", "boothCall", "boothLean"],
};
