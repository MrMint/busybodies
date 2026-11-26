// Durations, in milliseconds.

export const MIN = 60_000;

/** A short duration as a chip or a card says it: "45s", "4m", "2h". */
export function ranFor(ms: number): string {
	if (ms < MIN) return `${Math.max(1, Math.round(ms / 1000))}s`;
	if (ms < 60 * MIN) return `${Math.round(ms / MIN)}m`;
	return `${Math.round(ms / (60 * MIN))}h`;
}
