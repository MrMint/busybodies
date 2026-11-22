// Model personalities (plan-next, decided with the owner: be opinionated). Each model family moves
// and acts a little differently, so a crew of mixed models reads as different characters. The
// director reads these for walk speed and pose pace; the office names the family on the desk card
// as plain text. Never a logo, never a vendor mark.
import type { ModelFamily } from "../../watcher/model";

export interface Trait {
	/** Multiplies walk speed (on top of the heat pace). */
	walk: number;
	/** Multiplies pose tempo (on top of the write-recency tempo). */
	tempo: number;
	/** A beat before starting a new acted pose or trip, in ms: a deliberate character pauses. */
	pauseMs: number;
	/** Now and then adds a flourish (the `flourish` pose) after finishing something. */
	flourish: boolean;
	/** A word for the desk card's second line, and the inspector. */
	word: string;
}

export const TRAITS: Record<ModelFamily, Trait> = {
	haiku: { walk: 1.2, tempo: 1.2, pauseMs: 0, flourish: false, word: "haiku" },
	sonnet: { walk: 1.05, tempo: 1.05, pauseMs: 150, flourish: false, word: "sonnet" },
	opus: { walk: 0.9, tempo: 0.9, pauseMs: 600, flourish: false, word: "opus" },
	fable: { walk: 1, tempo: 1, pauseMs: 300, flourish: true, word: "fable" },
	other: { walk: 1, tempo: 1, pauseMs: 0, flourish: false, word: "" },
};

/** The trait for an optional family: no family behaves as `other`. */
export const traitOf = (family: ModelFamily | undefined): Trait => TRAITS[family ?? "other"];
