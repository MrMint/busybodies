// Which theme the scene draws (plan-next stream D). A theme is the same cast and the same director
// in a different place: the office (the original), the factory (mochis in coveralls and hard hats,
// with giant robot arms that help), the Line (a restaurant kitchen: the cast in chef whites, the
// stations as kitchen kit, tickets on the rail). Pixi-free: the app, the tray and tests read it.

export const THEME_IDS = ["office", "factory", "kitchen"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "office";

/** The theme a value names (`?theme=factory`, a saved setting), or the default. */
export function themeId(value: string | null | undefined): ThemeId {
	return (THEME_IDS as readonly string[]).includes(value ?? "") ? (value as ThemeId) : DEFAULT_THEME;
}
