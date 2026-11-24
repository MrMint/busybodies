// The seven crew roles, and which one an agent plays. Both processes need it (the diary counts
// by role), so it sits below the scene; the costumes for each role are scene/rig/roles.ts.

export const ROLES = ["lead", "builder", "scout", "explorer", "reviewer", "verifier", "designer"] as const;
export type Role = (typeof ROLES)[number];
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
