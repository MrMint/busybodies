// The seven role costumes. A role is a body colour, a hat, a front piece and maybe something worn
// on the face; mochi has no chest to speak of, so the hat and the props carry the role.
//
// The part names below are slots, and each theme dresses them its own way, so the costumes are per
// theme while the puppet stays the same (rig/themes.ts picks the painters):
//
//   role      office (office.ts)                          factory (factory.ts)
//   lead      pompadour, loud tie, headset with foam mic  white hard hat, hi-vis vest, ear defender
//   builder   spiky hair, pencil behind the ear, tie      striped hard hat, tool belt
//             flung over the shoulder
//   scout     high ponytail, lanyard and ID badge         cap with a headlamp, hi-vis bandana
//   explorer  shades pushed up on gelled hair, fleece     orange hard hat, harness, knee pads
//             vest with a laser pointer
//   reviewer  grey bun with a pencil through it,          bun in a hairnet, safety glasses
//             cardigan, half-moon glasses on a chain
//   verifier  green accountant's visor over a combover,   bump cap, QA tag, QA armband
//             pocket protector, sleeve garter
//   designer  black beret, round glasses, black           welding helmet flipped up, leather scarf
//             turtleneck
//
// (`front/apron` is the builder's front piece whatever the theme draws there, and so on.)

export const ROLES = ["lead", "builder", "scout", "explorer", "reviewer", "verifier", "designer"] as const;
export type Role = (typeof ROLES)[number];

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
] as const;

/** Accessories a regular may wear on the face: a slot name the atlas has in every theme. The
 * reviewer's costume already wears glasses. */
export const REGULAR_WEAR = [undefined, undefined, "wear/glasses"] as const;

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

/** The regular with this key (`<project key>:<role>:<n>`): its name and accessory, from the key alone. */
export function regularOf(key: string): Regular {
	const role = key.split(":")[1] as Role | undefined;
	const name = REGULAR_NAMES[fnv(`${key}|name`) % REGULAR_NAMES.length]!;
	const wear = role && COSTUMES[role]?.wear ? undefined : REGULAR_WEAR[fnv(`${key}|wear`) % REGULAR_WEAR.length];
	return { key, name, ...(wear ? { wear } : {}) };
}

/** The diary's regular (`<project key>:<role>`) a regular's key belongs to. */
export const diaryRegular = (key: string): string => key.split(":").slice(0, 2).join(":");

/** The agent tool's subagent types are free text; map the common ones onto a costume. Anything
 * unknown builds things, which is what most of them do. */
export function roleFor(agentType: string | undefined): Role {
	const t = (agentType ?? "").toLowerCase();
	if (!t) return "builder";
	if (/review/.test(t)) return "reviewer";
	if (/verif|test|qa/.test(t)) return "verifier";
	if (/design|\bui\b|\bart\b/.test(t)) return "designer";
	if (/explor/.test(t)) return "explorer";
	if (/scout|search|survey|find|research/.test(t)) return "scout";
	if (/lead|main|session/.test(t)) return "lead";
	return "builder";
}
