// The in-house tween and spring helper (no GSAP; see docs/decisions.md). Pixi-free and
// deterministic: the same sequence of steps always gives the same numbers, because time only
// moves in fixed sub-steps.

/** Easings for tweens, t in [0, 1]. */
export const ease = {
	linear: (t: number) => t,
	inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
	out: (t: number) => 1 - (1 - t) ** 3,
	back: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
} as const;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A value moving from `from` to `to` over `ms`. */
export class Tween {
	elapsed = 0;
	constructor(
		readonly from: number,
		readonly to: number,
		readonly ms: number,
		readonly easing: (t: number) => number = ease.inOut,
	) {}
	get done(): boolean {
		return this.elapsed >= this.ms;
	}
	get value(): number {
		return lerp(this.from, this.to, this.easing(Math.min(1, this.ms <= 0 ? 1 : this.elapsed / this.ms)));
	}
	step(ms: number): number {
		this.elapsed = Math.min(this.ms, this.elapsed + ms);
		return this.value;
	}
}

/** How a spring feels: stiffness (per s²) and damping ratio (1 is critical, lower bounces). */
export interface SpringFeel {
	stiffness: number;
	damping: number;
	/** Close enough to rest, in the channel's own units. */
	epsilon: number;
}

export const FEEL = {
	/** Arms and legs: quick and decisive, landing where the pose puts them inside a beat with only
	 * a hair of overshoot, so a strike lands on its target instead of wobbling about it. */
	limb: { stiffness: 620, damping: 0.74, epsilon: 0.05 },
	/** The angle of a hand, so of anything held: a little looser than the arm, so a hammer or wrench
	 * trails the swing and follows through past the stop by a few degrees. */
	tool: { stiffness: 520, damping: 0.6, epsilon: 0.05 },
	/** The mochi body: it leans and recoils when the action asks, and settles without jiggling. */
	body: { stiffness: 260, damping: 0.85, epsilon: 0.01 },
	/** Face parts: fast and flat, so expressions and glances read at once. */
	face: { stiffness: 620, damping: 0.85, epsilon: 0.01 },
	/** Something arriving (a prop in the hand, an effect): a quick ease in with a small settle. */
	pop: { stiffness: 600, damping: 0.62, epsilon: 0.002 },
} as const satisfies Record<string, SpringFeel>;

/** The fixed sub-step. Whatever the frame rate, a spring integrates in steps of this size. */
export const SUBSTEP_S = 1 / 240;

/** A damped spring chasing `target`, integrated with semi-implicit Euler in fixed sub-steps. */
export class Spring {
	value: number;
	velocity = 0;
	target: number;
	#carry = 0;

	constructor(
		value: number,
		readonly feel: SpringFeel,
	) {
		this.value = value;
		this.target = value;
	}

	get settled(): boolean {
		return Math.abs(this.target - this.value) < this.feel.epsilon && Math.abs(this.velocity) < this.feel.epsilon * 10;
	}

	/** Jump to the target with no motion (for the pose sheet and for a character's first frame). */
	snap(): void {
		this.value = this.target;
		this.velocity = 0;
		this.#carry = 0;
	}

	/** Advance by `seconds`. Returns the new value. */
	step(seconds: number): number {
		if (this.settled) {
			this.snap();
			return this.value;
		}
		const k = this.feel.stiffness;
		const c = 2 * Math.sqrt(k) * this.feel.damping;
		this.#carry += seconds;
		while (this.#carry >= SUBSTEP_S) {
			this.#carry -= SUBSTEP_S;
			const a = k * (this.target - this.value) - c * this.velocity;
			this.velocity += a * SUBSTEP_S;
			this.value += this.velocity * SUBSTEP_S;
		}
		if (this.settled) this.snap();
		return this.value;
	}
}

/** A named set of springs moving together, such as every channel of one puppet. */
export class SpringSet<K extends string> {
	readonly springs: Record<K, Spring>;
	constructor(initial: Record<K, number>, feelOf: (k: K) => SpringFeel) {
		this.springs = {} as Record<K, Spring>;
		for (const k of Object.keys(initial) as K[]) this.springs[k] = new Spring(initial[k], feelOf(k));
	}
	setTargets(t: Record<K, number>): void {
		for (const k in t) this.springs[k].target = t[k];
	}
	get settled(): boolean {
		for (const k in this.springs) if (!this.springs[k].settled) return false;
		return true;
	}
	step(seconds: number): void {
		for (const k in this.springs) this.springs[k].step(seconds);
	}
	snap(): void {
		for (const k in this.springs) this.springs[k].snap();
	}
	value(k: K): number {
		return this.springs[k].value;
	}
}
