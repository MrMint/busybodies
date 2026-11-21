// Pose timing and choice. Pure: the puppet asks "which frame now?" and "which pose for this
// trigger?", and the answers depend only on elapsed time and the character's id.
import { POSES, type Pose, type Trigger, duration } from "./poses";
import type { Role } from "./roles";

export interface FrameAt {
	index: number;
	/** True once a `once` pose (or a capped loop) has played through and holds its last frame. */
	holding: boolean;
	/** Completed passes through the pose. */
	pass: number;
}

/** Which frame of `frames` shows `ms` after the pose started. `loops` caps the passes (Infinity
 * loops forever); past the cap, the last frame holds. */
export function frameAt(frames: { ms: number }[], ms: number, loops: number): FrameAt {
	const total = duration(frames);
	if (frames.length === 0 || total <= 0) return { index: 0, holding: true, pass: 0 };
	const t = Math.max(0, ms);
	const pass = Math.floor(t / total);
	if (pass >= loops) return { index: frames.length - 1, holding: true, pass: loops };
	let u = t - pass * total;
	for (let i = 0; i < frames.length; i++) {
		if (u < frames[i]!.ms) return { index: i, holding: false, pass };
		u -= frames[i]!.ms;
	}
	return { index: frames.length - 1, holding: false, pass };
}

/** A stable 32-bit hash of a string (FNV-1a). All variation comes from here, never Math.random. */
export function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** A number in [0, 1) from an id and a salt. */
export const unit = (id: string, salt = ""): number => hash(`${id}|${salt}`) / 0x1_0000_0000;

/**
 * The pose a character plays for a trigger. Rare poses for the trigger replace the common one when
 * the id's roll for this occurrence (`n`, e.g. how many times it has waited) falls under their
 * rarity. Among common poses, the ones made for the role win; then the id picks one, so a crowd of
 * idle characters slacks off in different ways, and always the same way for the same id.
 */
export function choosePose(trigger: Trigger, id: string, role: Role, n = 0): Pose {
	const fits = (p: Pose) => !p.roles || p.roles.includes(role);
	const all = POSES.filter((p) => p.trigger === trigger && p.name !== "rest" && fits(p));
	for (const p of all) if (p.rarity < 1 && unit(id, `${p.name}#${n}`) < p.rarity) return p;
	const common = all.filter((p) => p.rarity >= 1);
	const own = common.filter((p) => p.roles?.includes(role));
	const list = own.length ? own : common;
	if (list.length === 0) return POSES.find((p) => p.name === "rest")!;
	return list[hash(`${id}|${trigger}|${n}`) % list.length]!;
}
