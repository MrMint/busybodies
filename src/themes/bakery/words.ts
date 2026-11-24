// What the bakery calls things (the ThemeWords for the bakery theme).
import type { ThemeWords } from "../../scene/theme/words";

export const BAKERY_WORDS: ThemeWords = {
	areas: { meeting: "tasting table", lobby: "shop front", yours: "pick-up counter", kitchen: "the café", vacant: "closed for icing" },
	subs: { meeting: "tasted before it's boxed", lobby: "in and out the door", yours: "Order up! waiting on you", kitchen: "idle, finished and on a coffee break", vacant: "back soon" },
	signs: {
		"meeting:sign": { title: "NO CRUMB UNTASTED", body: "Every batch. Every time." },
		"kitchen:sign": { title: "1 ÉCLAIR PER GREEN BUILD", body: "Finished? Hang up your apron." },
		"lobby:frame": { title: "TODAY'S SPECIAL", body: "Whatever rises." },
	},
	serving: (n) => ({ title: "ORDER UP!", body: n === undefined ? "Nothing waiting. Yet." : `No. ${n}` }),
	columns: ["ORDERED", "BAKING", "BOXED"],
	door: "BAKER",
	// The builder's work is baking and the stations are bakery kit here (rig/bakery.ts): the
	// workshop's and the office's words go with them.
	poses: {
		hammer: { title: "Rolling it out until it compiles", lines: ["It rises in my heart."] },
		thumb: { title: "Rolled over the thumb" },
		exploring: { title: "Exploring with a crème brûlée torch" },
		painting: { title: "Piping it two pixels over" },
		blueprint: { title: "Reading the recipe", lines: ["Weigh twice. Bake once."] },
		rummage: { title: "Looking for the right macaron", lines: ["It was in the basket a minute ago."] },
		tinker: { title: "Cranking the mixer while it runs", lines: ["Whisk. Unwhisk. Whisk."] },
		poke: { title: "Poking the cake to see if it holds" },
		carry: { title: "Carrying a cake layer" },
		place: { title: "Adding a layer to the cake" },
		faceDown: { title: "Face down on the bench" },
		waterCooler: { title: "Lemonade at the café" },
		fileFolder: { title: "Checking the dough in the proofing drawer" },
		cardThumb: { title: "Thumbing through the recipe cards" },
		copierFeed: { title: "Sliding croissants into the oven" },
		copierKick: { title: "Kicking the stuck oven door" },
		copierFeud: { title: "A running feud with the oven" },
		stampGreen: { title: "Tasting it: yes" },
		stampRed: { title: "Tasting it: no" },
		phone: { title: "Taking an order on the phone" },
		mailDrop: { title: "Setting a pastry box on the counter" },
		shred: { title: "Tipping burnt cookies in the crumb bin" },
		buried: { title: "Buried under a tray of pastries" },
		bellRing: { title: "Ringing the bell on your counter" },
		stickyCarry: { title: "Carrying an order slip" },
		stickyPost: { title: "Pinning an order slip on the order board" },
		envelopeCarry: { title: "Carrying the PR cake" },
	},
};
