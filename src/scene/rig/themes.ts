// The rig's painters for each scene theme. The atlas bakes whichever one the app picks. The paper
// rig (theme.ts) is the base both repaint by name: the office as a corporate office (office.ts),
// the factory as a workshop (factory.ts).
import type { ThemeId } from "../theme/id";
import { factoryTheme } from "./factory";
import { officeTheme } from "./office";
import type { Theme } from "./theme";

export function rigTheme(id: ThemeId): Theme {
	return id === "factory" ? factoryTheme() : officeTheme();
}
