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
