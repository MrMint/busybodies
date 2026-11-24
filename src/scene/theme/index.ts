// The scene themes by id (theme/id.ts). The rig's painters per theme are rig/themes.ts `rigTheme`.
import { FACTORY_THEME } from "./factory";
import type { ThemeId } from "./id";
import { BAKERY_THEME } from "./bakery";
import { OFFICE_THEME } from "./office";
import type { SceneTheme } from "./types";

export { type ThemeId, themeId } from "./id";
export type { SceneTheme } from "./types";

const THEMES: Record<ThemeId, SceneTheme> = { office: OFFICE_THEME, factory: FACTORY_THEME, bakery: BAKERY_THEME };

export function sceneTheme(id: ThemeId): SceneTheme {
	return THEMES[id] ?? OFFICE_THEME;
}
