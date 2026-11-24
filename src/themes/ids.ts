// Which theme the scene draws (plan-next stream D). A theme is the same cast and the same director
// in a different place: the office (the original), the factory (mochis in coveralls and hard hats,
// with giant robot arms that help), the bakery (the cast in
// whites and toques among croissants, cakes, coffee and sweets). Pixi-free: the app, the tray and tests read it.

export const THEME_IDS = ["office", "factory", "bakery"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "office";

/** The theme a value names (`?theme=factory`, a saved setting), or the default. */
export function themeId(value: string | null | undefined): ThemeId {
	// The Line (a restaurant kitchen) became the bakery before it ever shipped; a dev build's saved
	// "kitchen" lands there.
	if (value === "kitchen") return "bakery";
	return (THEME_IDS as readonly string[]).includes(value ?? "") ? (value as ThemeId) : DEFAULT_THEME;
}
