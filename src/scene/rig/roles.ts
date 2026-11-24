// The seven role costumes. A role is a body colour, a hat, a front piece and maybe something worn
// on the face; mochi has no chest to speak of, so the body colour, the hat and the props carry the
// role.
//
// The part names below are slots, and each theme dresses them its own way, so the costumes are per
// theme while the puppet stays the same (rig/themes.ts picks the painters):
//
//   role      office (office.ts)                          factory (factory.ts)
//   lead      one soft tuft, headset with foam mic,       white hard hat, hi-vis vest, ear defender
//             short loud tie
//   builder   pencil behind the ear, a sticky note on     striped hard hat, tool belt
//             the dome, a small crooked tie
//   scout     sprout top-knot with a scrunchie, lanyard   cap with a headlamp, hi-vis neckerchief
//             and a big ID badge                          knotted to one side
//   explorer  sunglasses parked on top, a bum bag         orange hard hat, harness, knee pads
//   reviewer  grey bun with a pencil through it,          bun in a hairnet, safety glasses
//             half-moon glasses, pearls
//   verifier  translucent green eyeshade, pocket          bump cap, QA tag, QA armband
//             protector, sleeve garter
//   designer  tilted beret, big round frames, a bare      welding helmet flipped up, leather apron
//             belly (the office paints no front/scarf)    bib
//
// (`front/apron` is the builder's front piece whatever the theme draws there, and so on.)
import type { Role } from "../../shared/roles";

export { ROLES, type Role, roleFor } from "../../shared/roles";

export interface Costume {
	/** Hat texture, `hat/<role>`. */
	hat: string;
	/** Front piece on the belly, `front/<name>`; the lead's tie takes the project colour. */
	front?: string;
	/** Worn on the face, `wear/<name>`. */
	wear?: string;
	/** Drawn smaller than the rest of the crew (the explorer trails its scout). */
	scale: number;
}

export const COSTUMES: Record<Role, Costume> = {
	lead: { hat: "hat/lead", front: "front/tie", scale: 1 },
	builder: { hat: "hat/builder", front: "front/apron", scale: 1 },
	scout: { hat: "hat/scout", front: "front/kerchief", scale: 1 },
	explorer: { hat: "hat/explorer", front: "front/straps", scale: 0.82 },
	reviewer: { hat: "hat/reviewer", front: "front/bowtie", wear: "wear/glasses", scale: 1 },
	verifier: { hat: "hat/verifier", front: "front/badge", scale: 1 },
	designer: { hat: "hat/designer", front: "front/scarf", scale: 1 },
};

/**
 * Regulars (plan-alive wave 3, "story and continuity"): the same project and role come back as the
 * same character, day after day. A regular's key is the diary's (a hash of the project, never its
 * name), its costume and its place among the same costume in that project (`:0`, `:1`...), so it
 * is the same on any machine and any day; everything about it is picked from that key: a short
 * name, and an accessory worn on the face (or none). The puppet takes the key as its id, so its
 * loop phases and rare variants are the regular's own too.
 */
export const REGULAR_NAMES = [
	"Pip", "Bo", "Tam", "Dot", "Wren", "Ozzy", "Mo", "Juno", "Kit", "Lou", "Nell", "Rafe", "Sol", "Tilly",
	"Vee", "Ziggy", "Bea", "Cal", "Fen", "Gus", "Hal", "Ivy", "Jem", "Lark", "Moss", "Nib", "Odo", "Plum",
	"Ada", "Bix", "Cleo", "Dex", "Effie", "Fitz", "Gil", "Hob", "Iggy", "Jojo", "Kip", "Lulu", "Mabel", "Nico",
	"Olly", "Penny", "Quill", "Rosie", "Sid", "Tuck", "Uma", "Vito", "Wally", "Xan", "Yuki", "Zuzu", "Bram", "Clem",
	"Dilly", "Edie", "Flo", "Gert", "Hugo", "Inez", "Jasper", "Kiki", "Lenny", "Midge", "Noor", "Otto", "Pru", "Rory",
] as const;

/** Accessories a regular may wear: a slot name the atlas has in every theme (glasses are each
 * theme's own; the rest are rig/accessories.ts, the same in every theme). One in four goes without.
 * The reviewer's costume already wears glasses, so it wears nothing more. */
export const REGULAR_WEAR = [undefined, undefined, "wear/glasses", "wear/flower", "wear/earrings", "wear/freckles", "wear/pin", "wear/plaster"] as const;

export interface Regular {
	/** `<project key>:<role>:<n>`. */
	key: string;
	name: string;
	wear?: string;
}

function fnv(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** A regular's name: its own (`k` 0), or, if another regular on the floor already has that one, the
 * next it tries (`k` 1, 2...): a step through the names picked from its key, so two who'd clash
 * part ways the same way every time. */
export function regularName(key: string, k = 0): string {
	const n = REGULAR_NAMES.length;
	// A step that is coprime with the list's length, so the walk visits every name before repeating.
	let step = 1 + (fnv(`${key}|step`) % (n - 1));
	while (gcd(step, n) !== 1) step = (step % (n - 1)) + 1;
	return REGULAR_NAMES[(fnv(`${key}|name`) + k * step) % n]!;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Everyone's names among the regulars on the floor at once (by regular key), with no two the same:
 * in key order, each takes its own name, or the next of its own that nobody before it has taken. A
 * regular keeps its own name whenever nobody it would clash with is around, and with 70 names that
 * is nearly always.
 */
export function regularNamesFor(keys: Iterable<string>): Map<string, string> {
	const out = new Map<string, string>();
	const taken = new Set<string>();
	for (const key of [...new Set(keys)].sort()) {
		let k = 0;
		let name = regularName(key);
		while (taken.has(name) && k < REGULAR_NAMES.length) name = regularName(key, ++k);
		taken.add(name);
		out.set(key, name);
	}
	return out;
}

/** The regular with this key (`<project key>:<role>:<n>`): its name and accessory, from the key alone. */
export function regularOf(key: string): Regular {
	const role = key.split(":")[1] as Role | undefined;
	const name = regularName(key);
	const wear = role && COSTUMES[role]?.wear ? undefined : REGULAR_WEAR[fnv(`${key}|wear`) % REGULAR_WEAR.length];
	return { key, name, ...(wear ? { wear } : {}) };
}

/** The diary's regular (`<project key>:<role>`) a regular's key belongs to. */
export const diaryRegular = (key: string): string => key.split(":").slice(0, 2).join(":");
