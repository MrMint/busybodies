// A bay's robot arm, drawn (the motion is armplan.ts). Each part is drawn once, around its own
// joint, and only moved by its transform: a move costs no redraw and no tessellation, and every
// part joins the batch. Cut paper like the rest: safety-yellow arms, steel joints, the same ink.
import { Container, Graphics } from "pixi.js";
import { INK, line } from "../../scene/office/paper";
import { ARM, ArmPlan, type Point, solve } from "./armplan";

const YELLOW = 0xffc928;
const STEEL = 0x9aa5b1;
const STEEL_DARK = 0x5d6b7a;
const CRATE = 0xd9a066;
/** The forearm's sleeve; the rod slides out of it. */
const SLEEVE = 36;

function part(): Graphics {
	const g = new Graphics();
	g.context.batchMode = "batch";
	return g;
}

export class RobotArm extends Container {
	readonly plan: ArmPlan;
	#carriage = part();
	#upper = part();
	#sleeve = part();
	#rod = part();
	#hand = part();
	#fingers = [part(), part()];
	#load = part();

	constructor(left: number, floorY: number) {
		super();
		this.plan = new ArmPlan(left, floorY);
		// The carriage on the rail, its shoulder hub on top.
		this.#carriage.roundRect(-17, -ARM.shoulder - 6, 34, ARM.shoulder + 10, 5).fill(STEEL_DARK).stroke(line(3));
		this.#carriage.circle(-10, 4, 3.5).circle(10, 4, 3.5).fill(INK);
		this.#carriage.circle(0, -ARM.shoulder, 8).fill(STEEL).stroke(line(3));
		// The upper arm, from its shoulder along +x, its elbow hub at the far end.
		this.#upper.roundRect(-6, -7, ARM.upper + 12, 14, 7).fill(YELLOW).stroke(line(3));
		this.#upper.moveTo(10, 0).lineTo(ARM.upper - 10, 0).stroke({ width: 1.5, color: INK, alpha: 0.35 });
		this.#upper.circle(ARM.upper, 0, 7).fill(STEEL).stroke(line(2.5));
		this.#upper.circle(0, 0, 4).fill(INK);
		// The forearm's sleeve, and the rod that telescopes out of it (a unit long, stretched along x:
		// only its long edges are drawn, so stretching keeps them crisp).
		this.#sleeve.roundRect(-4, -6, SLEEVE + 4, 12, 5).fill(YELLOW).stroke(line(3));
		this.#rod.rect(0, -3, 1, 6).fill(STEEL);
		this.#rod.rect(0, -3.75, 1, 1.5).rect(0, 2.25, 1, 1.5).fill(INK);
		// The wrist and the gripper's two fingers (each pivots at the wrist).
		this.#hand.roundRect(-8, -3, 16, 7, 3).fill(STEEL_DARK).stroke(line(2.5));
		for (const [i, f] of this.#fingers.entries()) {
			const s = i ? 1 : -1;
			f.poly([0, 0, s * 3, 0, s * 4, 11, s * 1, 13]).fill(STEEL).stroke(line(2));
		}
		// What it carries: a crate, middle at the origin.
		this.#load.rect(-6, -4.5, 12, 9).fill(CRATE).stroke({ width: 1.5, color: INK });
		this.#load.moveTo(-5, 0).lineTo(5, 0).stroke({ width: 1, color: INK, alpha: 0.45 });
		this.addChild(this.#upper, this.#rod, this.#sleeve, this.#load, this.#fingers[0]!, this.#fingers[1]!, this.#hand, this.#carriage);
		this.#apply();
	}

	get moving(): boolean {
		return this.plan.moving;
	}

	/** Move on `ms`. */
	step(ms: number): void {
		if (this.plan.step(ms)) this.#apply();
	}

	rewind(): void {
		this.plan.rewind();
		this.#apply();
	}

	place(at: Point): number | undefined {
		const d = this.plan.place(at);
		this.#apply();
		return d;
	}

	ship(from: Point, to: Point): number | undefined {
		const d = this.plan.ship(from, to);
		this.#apply();
		return d;
	}

	/** Pose every part from the plan's pose: transforms only. */
	#apply(): void {
		const p = this.plan.pose;
		const shoulder = { x: p.base, y: this.plan.shoulderY };
		const j = solve(shoulder, p.wrist);
		this.#carriage.position.set(p.base, this.plan.railY);
		this.#upper.position.set(shoulder.x, shoulder.y);
		this.#upper.rotation = j.upper;
		this.#sleeve.position.set(j.elbow.x, j.elbow.y);
		this.#sleeve.rotation = j.fore;
		this.#rod.position.set(j.elbow.x + Math.cos(j.fore) * (SLEEVE - 4), j.elbow.y + Math.sin(j.fore) * (SLEEVE - 4));
		this.#rod.rotation = j.fore;
		this.#rod.scale.x = Math.max(0.01, j.length - SLEEVE + 4);
		this.#hand.position.set(p.wrist.x, p.wrist.y);
		const open = (1 - p.grip) * 0.5;
		for (const [i, f] of this.#fingers.entries()) {
			f.position.set(p.wrist.x + (i ? 4 : -4), p.wrist.y + 2);
			f.rotation = (i ? -1 : 1) * open;
		}
		this.#load.visible = p.holding;
		this.#load.position.set(p.wrist.x, p.wrist.y + ARM.hold);
	}
}
