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

/** A costume from the agent type's name, tried in this order. The tool's own types land here too:
 * "Explore" explores, "Plan" designs, "claude-code-guide" scouts. */
const BY_NAME: [Role, RegExp][] = [
	["reviewer", /review/],
	["verifier", /verif|test|qa/],
	["designer", /design|\bui\b|\bart\b|\bplan|architect/],
	["explorer", /explor/],
	["scout", /scout|search|survey|find|research|guide/],
	["lead", /lead|main|session/],
	["builder", /build/],
];

/** What a task asks for, by its words. The one that comes first in the task wins, so "Find and fix
 * the leak" is a scout's job and "Fix the failing test" a builder's. */
const BY_TASK: [Role, RegExp][] = [
	["reviewer", /\b(review|audit|critique|proofread|second opinion)/],
	["verifier", /\b(verif|test|validat|reproduc|confirm|check|qa\b)/],
	["designer", /\b(design|plan|architect|mock ?up|sketch|wireframe|ui\b|ux\b)/],
	["explorer", /\bexplor/],
	["scout", /\b(scout|search|survey|find|research|investigat|look (up|into|for|at|through)|locate|trace|read|fetch|summari[sz]|gather|inventory|map out|understand|where )/],
	["builder", /\b(build|implement|fix|add|writ|refactor|updat|migrat|port\b|creat|make|chang|edit|renam|remov|delet|bump|wire|set ?up|install|clean)/],
];

/**
 * The costume for a crew member. The agent type is free text: a custom type names its job
 * ("code-reviewer", "test-runner"). A generic one ("general-purpose", or none) says nothing, so
 * the task its parent gave it decides. Anything still unknown builds things, which is what most
 * agents do. Both inputs are fixed for an agent's life, so its costume never changes.
 */
export function roleFor(agentType: string | undefined, task?: string): Role {
	const t = (agentType ?? "").toLowerCase();
	for (const [role, re] of BY_NAME) if (re.test(t)) return role;
	return roleForTask(task) ?? "builder";
}

function roleForTask(task: string | undefined): Role | undefined {
	const t = (task ?? "").toLowerCase();
	let best: { role: Role; at: number } | undefined;
	for (const [role, re] of BY_TASK) {
		const at = t.search(re);
		if (at >= 0 && (!best || at < best.at)) best = { role, at };
	}
	return best?.role;
}
