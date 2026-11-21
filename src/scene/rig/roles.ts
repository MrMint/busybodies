// The seven role costumes. A role is a body colour, a hat, a front piece and maybe something worn
// on the face; mochi has no chest to speak of, so the hat and the props carry the role.

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
