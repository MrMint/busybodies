// Weather over a head: a little rain cloud while a character's commands keep failing, and a
// sunbeam for a while after a test goes green again. Pixi-free; the rig paints it (puppet `weather`).
import type { Commands, ToolRate } from "../../watcher/model";
import { MIN } from "../../shared/time";

export type Weather = "rain" | "sun";

export const WEATHER = {
	/** Commands failed in a row before the cloud comes. */
	rainStreak: 2,
	/** Or this many failed tool results in the recent window. */
	rainErrors: 3,
	/** How long the sun shines after a test passes, when tests had failed before. */
	sunMin: 1.5,
} as const;

/** The weather over a character now, if any. */
export function weatherOf(commands: Commands | undefined, tools: ToolRate | undefined, now: number): Weather | undefined {
	if ((commands?.failStreak ?? 0) >= WEATHER.rainStreak) return "rain";
	if ((tools?.errors ?? 0) >= WEATHER.rainErrors) return "rain";
	const last = commands?.last;
	if (last && last.kind === "test" && last.exitCode === 0 && (commands?.testsFailed ?? 0) > 0 && now - last.at < WEATHER.sunMin * MIN && now >= last.at)
		return "sun";
	return undefined;
}
