// The rig's painters for each scene theme. The atlas bakes whichever one the app picks. The paper
// rig (theme.ts) is the base all three repaint by name: the office as a corporate office
// (office.ts), the factory as a workshop (factory.ts), the bakery (bakery.ts).
import type { ThemeId } from "../../themes/ids";
import { factoryTheme } from "./factory";
import { bakeryTheme } from "./bakery";
import { officeTheme } from "./office";
import type { Theme } from "./theme";

const RIGS: Record<ThemeId, () => Theme> = { office: officeTheme, factory: factoryTheme, bakery: bakeryTheme };

export function rigTheme(id: ThemeId): Theme {
	return (RIGS[id] ?? officeTheme)();
}
