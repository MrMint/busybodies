// The rig's painters for each scene theme. The atlas bakes whichever one the app picks.
import type { ThemeId } from "../theme/id";
import { factoryTheme } from "./factory";
import { type Theme, paperTheme } from "./theme";

export function rigTheme(id: ThemeId): Theme {
	return id === "factory" ? factoryTheme() : paperTheme();
}
