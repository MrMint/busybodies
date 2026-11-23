// The voice pools tools/voice.ts records with: per theme, seven of Gemini TTS's prebuilt voices,
// each with a style prompt that fits the theme. The `id` is what the manifest and the app use (a
// character's own voice is `pool[hash(id) % n]`, sass/voiced.ts); the `voice` is the prebuilt
// voice's name. Changing a style prompt re-records that voice's takes on the next run (the take
// remembers a hash of what it was recorded with); renaming an id orphans them.
//
// Voice rules (design/README.md): an affectionate roast. Small, round, squishy characters who are
// needy, smug, dramatic and lazy, and know it. Never mean, never crude, no impressions of real
// people, and no accents played for laughs.
import type { ThemeId } from "../src/scene/theme/id";

export interface CastVoice {
	id: string;
	/** A Gemini TTS prebuilt voice. */
	voice: string;
	/** How this one says things: the style prompt, before the line. */
	style: string;
}

/** Said before every style in a theme: who is talking, and where. */
export const SETTING: Record<ThemeId, string> = {
	office: "You are a tiny, round, squishy office worker in a cute cartoon. Short line, quick and light, a little sassy, never mean.",
	factory: "You are a tiny, round, squishy factory hand in coveralls in a cute cartoon. Short line, quick and light, a little sassy, never mean.",
	bakery: "You are a tiny, round, squishy pastry cook in whites in a cute cartoon. Short line, quick and light, a little sassy, never mean.",
};

export const CAST: Record<ThemeId, CastVoice[]> = {
	office: [
		{ id: "o-deadpan", voice: "Kore", style: "Dry and deadpan, like a coworker who has seen every meeting." },
		{ id: "o-chipper", voice: "Puck", style: "Chipper and eager, a new hire who loves the stapler." },
		{ id: "o-smug", voice: "Charon", style: "Smug and pleased with itself, slow and satisfied." },
		{ id: "o-drama", voice: "Zephyr", style: "Dramatic, sighing, every small thing is a big deal." },
		{ id: "o-sleepy", voice: "Enceladus", style: "Sleepy and slow, just woke up from a nap at the desk." },
		{ id: "o-polite", voice: "Aoede", style: "Very polite with a hint of passive aggression." },
		{ id: "o-giddy", voice: "Fenrir", style: "Giddy and fast, barely holding in a giggle." },
	],
	factory: [
		{ id: "f-gruff", voice: "Algenib", style: "Gruff but warm, a shift worker who grumbles kindly." },
		{ id: "f-apprentice", voice: "Puck", style: "An eager apprentice, quick and bright, proud of every bolt." },
		{ id: "f-steady", voice: "Iapetus", style: "Steady and matter-of-fact, calling out over a machine." },
		{ id: "f-tired", voice: "Enceladus", style: "Tired at the end of a long shift, still a bit cheeky." },
		{ id: "f-proud", voice: "Orus", style: "Proud and loud, a little show-off." },
		{ id: "f-dry", voice: "Kore", style: "Dry and unimpressed, has seen the belt jam a thousand times." },
		{ id: "f-sunny", voice: "Laomedeia", style: "Sunny and upbeat, whistling through the work." },
	],
	bakery: [
		{ id: "b-sweet", voice: "Leda", style: "Sweet and sing-song, delighted by every pastry." },
		{ id: "b-fussy", voice: "Sadaltager", style: "Fussy and precise, a perfectionist about the icing." },
		{ id: "b-sleepy", voice: "Enceladus", style: "Drowsy and cosy, up since four for the dough." },
		{ id: "b-theatre", voice: "Zephyr", style: "Theatrical, every soufflé is opening night." },
		{ id: "b-cheeky", voice: "Puck", style: "Cheeky, sneaking a taste when nobody is looking." },
		{ id: "b-warm", voice: "Sulafat", style: "Warm and motherly, kind even when teasing." },
		{ id: "b-proud", voice: "Achird", style: "Proud and pleased, presenting the cake to the room." },
	],
};

/** The style prompt a voice records a line with. */
export const promptFor = (theme: ThemeId, v: CastVoice): string => `${SETTING[theme]} ${v.style}`;
