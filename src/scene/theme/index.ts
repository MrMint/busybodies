// The scene themes by id (src/themes/ids.ts). The rig's painters per theme are rig/themes.ts `rigTheme`.
import { FACTORY_THEME } from "./factory";
import type { ThemeId } from "../../themes/ids";
import { BAKERY_THEME } from "./bakery";
import { OFFICE_THEME } from "../../themes/office/scene";
import type { SceneTheme } from "./types";

export { type ThemeId, themeId } from "../../themes/ids";
export type { SceneTheme } from "./types";

const THEMES: Record<ThemeId, SceneTheme> = { office: OFFICE_THEME, factory: FACTORY_THEME, bakery: BAKERY_THEME };

export function sceneTheme(id: ThemeId): SceneTheme {
	return THEMES[id] ?? OFFICE_THEME;
}
