// The scene's looks, as ids: `?look=`, the settings cog's Look choice and the tray's Look menu, saved
// in settings.json. Pixi-free, so the Bun process and the tests read it; mainview/look.ts draws them.
export const LOOK_IDS = ["plain", "pixel", "night"] as const;

/** plain: the scene as drawn. pixel: rendered at a quarter of the resolution and blown up with
 * nearest filtering. night: the light layer's night phase, held whatever the clock says. */
export type LookId = (typeof LOOK_IDS)[number];

export const DEFAULT_LOOK: LookId = "plain";

/** A look from a query value or a saved setting: anything unknown is the plain look. */
export function lookId(value: unknown): LookId {
	return (LOOK_IDS as readonly unknown[]).includes(value) ? (value as LookId) : DEFAULT_LOOK;
}
