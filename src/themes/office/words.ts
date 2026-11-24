// What the office calls things (the ThemeWords for the office theme).
import type { ThemeWords } from "../../scene/theme/words";

export const OFFICE_WORDS: ThemeWords = {
	areas: { meeting: "meeting room", lobby: "lobby", yours: "your office", kitchen: "kitchen", vacant: "vacant" },
	subs: { meeting: "reviews", lobby: "in and out", yours: "waiting on you", kitchen: "idle, finished and sent home", vacant: "for lease" },
	signs: {
		"meeting:sign": { title: "THIS MEETING", body: "could have been a diff." },
		"kitchen:sign": { title: "1 CUP PER GREEN BUILD", body: "Finished? Close your own session." },
		"lobby:frame": { title: "EMPLOYEE OF THE MONTH", body: "Nobody. Again." },
	},
	serving: (n) => ({ title: "NOW SERVING", body: n === undefined ? "Nobody. Yet." : `No. ${n}` }),
	columns: ["TO DO", "DOING", "DONE"],
	door: "YOU",
	// The builder's work is paperwork here (themes/office/rig.ts): the workshop words go with the workshop.
	poses: {
		hammer: { title: "Stapling until it compiles" },
		thumb: { title: "Stapled the thumb" },
		carry: { title: "Carrying a ream" },
		place: { title: "Setting a ream on the pile" },
		blueprint: { title: "Reading the printout", lines: ["Print twice. Read once."] },
		rummage: { title: "Looking for the tape dispenser" },
		tinker: { title: "Sharpening while it runs", lines: ["Sharper. Sharper. Gone."] },
		exploring: { title: "Exploring with a laser pointer" },
	},
};
