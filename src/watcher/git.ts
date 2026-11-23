// What git says about a session's folder: which repository it belongs to and the branch checked
// out. Read-only, and only two small files: <cwd>/.git (a folder, or a file pointing into the main
// repository for a worktree) and HEAD. That works for any worktree layout, not just the agent
// tool's own .claude/worktrees, and gives the branch without the desktop app.
import { basename, isAbsolute, join, resolve } from "node:path";
import type { FileCache } from "./files";

export interface GitInfo {
	/** The repository's folder name; for a worktree, the main repository's. */
	project?: string;
	/** Set when the folder is a linked worktree: its name. */
	worktree?: string;
	/** The branch checked out; absent when HEAD is detached. */
	branch?: string;
}

/** `gitdir: <path>` from a worktree's (or submodule's) .git file. */
export function gitdirOf(text: string, cwd: string): string | undefined {
	const m = /^gitdir:\s*(.+?)\s*$/m.exec(text);
	if (!m) return undefined;
	return isAbsolute(m[1]!) ? m[1]! : resolve(cwd, m[1]!);
}

/** The branch in a HEAD file, "ref: refs/heads/<branch>". */
export function branchOf(head: string): string | undefined {
	return /^ref:\s*refs\/heads\/(.+?)\s*$/m.exec(head)?.[1];
}

/** A linked worktree's gitdir: <repo>/.git/worktrees/<name>, or <repo>[.git]/worktrees/<name> for a bare one. */
const LINKED = /^(.*?)(?:[\\/]\.git|\.git)?[\\/]worktrees[\\/][^\\/]+[\\/]?$/;

export async function gitInfo(cwd: string, files: FileCache): Promise<GitInfo> {
	const dotGit = join(cwd, ".git");
	const s = await files.stat(dotGit);
	if (!s) return {};
	if (s.isDirectory()) return { project: basename(cwd), ...optionalBranch(await files.text(join(dotGit, "HEAD"))) };
	const gitdir = gitdirOf((await files.text(dotGit)) ?? "", cwd);
	if (!gitdir) return {};
	const head = optionalBranch(await files.text(join(gitdir, "HEAD")));
	const repo = LINKED.exec(gitdir)?.[1];
	// Anything else (a submodule's gitdir under the parent's .git/modules) is its own project.
	return repo ? { project: basename(repo), worktree: basename(cwd), ...head } : { project: basename(cwd), ...head };
}

const optionalBranch = (head: string | undefined) => {
	const branch = head ? branchOf(head) : undefined;
	return branch ? { branch } : {};
};
