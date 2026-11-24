// What the factory calls things (the ThemeWords for the factory theme).
import type { ThemeWords } from "../../scene/theme/words";

export const FACTORY_WORDS: ThemeWords = {
	areas: { meeting: "QA booth", lobby: "gatehouse", yours: "foreman's office", kitchen: "break room", vacant: "empty bay" },
	subs: {
		meeting: "inspections",
		lobby: "clocking in and out",
		yours: "waiting on the foreman",
		kitchen: "idle, finished and clocked off",
		vacant: "mothballed",
	},
	signs: {
		"meeting:sign": { title: "QUALITY CONTROL", body: "We control it. Mostly." },
		"kitchen:sign": { title: "1 SNACK PER GREEN BUILD", body: "Finished? Clock yourself out." },
		"lobby:frame": { title: "DAYS WITHOUT INCIDENT", body: "0. Again." },
	},
	serving: (n) => ({ title: "NEXT UP", body: n === undefined ? "Nobody. Yet." : `No. ${n}` }),
	columns: ["QUEUED", "ON LINE", "SHIPPED"],
	door: "FOREMAN",
	// The stations are machines here (rig/factory.ts): the office's furniture words go with it.
	poses: {
		fileFolder: { title: "Flipping through the parts bin" },
		cardThumb: { title: "Thumbing through the bolt bin" },
		copierFeed: { title: "Feeding the press" },
		copierKick: { title: "Kicking the jammed press" },
		copierFeud: { title: "A running feud with the press" },
		phone: { title: "On the radio" },
		mailDrop: { title: "Dropping the carton on the pallet" },
		shred: { title: "Feeding the crusher" },
		buried: { title: "Buried under the hopper" },
		bellRing: { title: "Ringing the shift bell on your desk" },
		stickyCarry: { title: "Carrying a work tag" },
		stickyPost: { title: "Hanging a work tag on the job board" },
		envelopeCarry: { title: "Carrying the PR crate" },
	},
};
