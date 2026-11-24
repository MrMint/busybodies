// Pose timing and choice. Pure: the puppet asks "which frame now?" and "which pose for this
// trigger?", and the answers depend only on elapsed time and the character's id.
import { POSES, type Pose, type Trigger, duration } from "./poses";
import type { Role } from "./roles";
import { fnv1a } from "../../../shared/hash";

export interface FrameAt {
	index: number;
	/** True once a `once` pose (or a capped loop) has played through and holds its last frame. */
	holding: boolean;
	/** Completed passes through the pose. */
	pass: number;
	/** Which pass is playing, when the pose has variant passes: 0 is the pose's own frames, k its
	 * k-th beat (`Pose.beats`). */
	beat?: number;
}

/** A looping pose's variant passes, and which one each pass plays (0 for the pose's own). Every
 * variant lasts as long as the pose's own pass, so where a pass starts never depends on the
 * passes before it. */
export interface Passes<F extends { ms: number } = { ms: number }> {
	sets: F[][];
	pick: (pass: number) => number;
}

/** Which frame of `frames` shows `ms` after the pose started. `loops` caps the passes (Infinity
 * loops forever); past the cap, the last frame holds. With `passes`, each pass may play a variant. */
export function frameAt(frames: { ms: number }[], ms: number, loops: number, passes?: Passes): FrameAt {
	const total = duration(frames);
	if (frames.length === 0 || total <= 0) return { index: 0, holding: true, pass: 0 };
	const t = Math.max(0, ms);
	const pass = Math.floor(t / total);
	if (pass >= loops) return { index: frames.length - 1, holding: true, pass: loops, ...(passes ? { beat: 0 } : {}) };
	const beat = passes ? passes.pick(pass) : 0;
	const set = beat > 0 ? (passes!.sets[beat - 1] ?? frames) : frames;
	const tag = passes ? { beat: set === frames ? 0 : beat } : {};
	let u = t - pass * total;
	for (let i = 0; i < set.length; i++) {
		if (u < set[i]!.ms) return { index: i, holding: false, pass, ...tag };
		u -= set[i]!.ms;
	}
	return { index: set.length - 1, holding: false, pass, ...tag };
}

/**
 * Which pass a looping pose plays on pass `pass` (0 its own frames, k its k-th of `count` beats):
 * a share of passes, picked from the id, the pose and the pass number, so the same character
 * breaks the same loop the same way every time. The first pass is always the pose's own, and a
 * beat never follows a beat, so the loop's own rhythm stays the one you see most.
 */
export function passBeat(id: string, pose: string, pass: number, count: number, share: number): number {
	if (count <= 0 || pass < 1) return 0;
	// Pass numbers run in sequence, and FNV-1a barely moves its top bits for a last digit that
	// counts up: a finaliser spreads them so the share holds.
	const rolls = (p: number) => mixHash(hash(`${id}|${pose}#${p}`)) / 0x1_0000_0000 < share;
	if (!rolls(pass) || (pass > 1 && rolls(pass - 1))) return 0;
	return 1 + (mixHash(hash(`${id}|${pose}|${pass}|beat`)) % count);
}

/** A 32-bit finaliser (MurmurHash3's fmix32): every input bit moves every output bit. */
function mixHash(h: number): number {
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h >>> 0;
}

/** A stable 32-bit hash of a string (FNV-1a). All variation comes from here, never Math.random. */
export const hash = fnv1a;

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
