// The scene themes by id (theme/id.ts). The rig's painters per theme are rig/themes.ts `rigTheme`.
import { FACTORY_THEME } from "./factory";
import type { ThemeId } from "./id";
import { OFFICE_THEME } from "./office";
import type { SceneTheme } from "./types";

export { type ThemeId, THEME_IDS, DEFAULT_THEME, themeId } from "./id";
export type { SceneTheme } from "./types";

export function sceneTheme(id: ThemeId): SceneTheme {
	return id === "factory" ? FACTORY_THEME : OFFICE_THEME;
}
