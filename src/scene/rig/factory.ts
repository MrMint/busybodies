// The factory's rig: the same parts as the paper office, repainted where the factory differs
// (outfits, hats, the station parts the hands work). Wave 3 placeholder: the rig agent fills it.
import { type Palette, PAPER_PALETTE, type Theme, paperTheme } from "./theme";

export function factoryTheme(p: Palette = PAPER_PALETTE): Theme {
	const base = paperTheme(p);
	return { ...base, name: "factory" };
}
