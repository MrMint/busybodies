// A placeholder character, until the pose rig from the chosen design replaces it. Drawn once per
// mood. Only busy characters animate, so a quiet office never runs the frame loop.
import { Container, Graphics, Text } from "pixi.js";

export type Mood = "busy" | "idle" | "stalled" | "done";

const INK = 0x2b2340;
const CHEEK = 0xff9eb1;

export class Busybody extends Container {
	readonly rig = new Container();
	#body = new Graphics();
	#face = new Graphics();
	#zzz = new Text({ text: "z z", style: { fill: INK, fontSize: 14, fontWeight: "700" } });
	#mood?: Mood;
	#phase: number;

	/** `phase` offsets the animation so a crowd doesn't bounce in step. Pass a value derived from
	 * the character's id, not a random one, so the same scene always renders the same frames. */
	constructor(
		readonly colour: number,
		readonly size: number,
		phase = 0,
	) {
		super();
		this.#phase = phase;
		const s = size;
		this.#body
			.roundRect(-s * 0.42, -s, s * 0.84, s, s * 0.38)
			.fill(colour)
			.stroke({ width: Math.max(2, s / 22), color: INK });
		this.#zzz.position.set(s * 0.3, -s * 1.25);
		this.rig.addChild(this.#body, this.#face, this.#zzz);
		this.addChild(this.rig);
	}

	get mood(): Mood | undefined {
		return this.#mood;
	}

	get animating(): boolean {
		return this.#mood === "busy";
	}

	setMood(mood: Mood): void {
		if (mood === this.#mood) return;
		this.#mood = mood;
		const s = this.size;
		const ey = -s * 0.62;
		const ex = s * 0.15;
		const er = Math.max(2, s * 0.06);
		const line = { width: Math.max(2, s / 20), color: INK };
		const f = this.#face.clear();
		switch (mood) {
			case "busy": // wide eyes, a determined little mouth
				f.circle(-ex, ey, er).circle(ex, ey, er).fill(INK);
				f.moveTo(-s * 0.08, -s * 0.42)
					.lineTo(s * 0.08, -s * 0.42)
					.stroke(line);
				break;
			case "idle": // asleep: eyes shut, a soft smile
				f.arc(-ex, ey, er * 1.3, 0.2, Math.PI - 0.2)
					.arc(ex, ey, er * 1.3, 0.2, Math.PI - 0.2)
					.stroke(line);
				break;
			case "stalled": // heavy lids and a yawn
				f.moveTo(-ex - er, ey)
					.lineTo(-ex + er, ey)
					.moveTo(ex - er, ey)
					.lineTo(ex + er, ey)
					.stroke(line);
				f.ellipse(0, -s * 0.4, s * 0.07, s * 0.09).fill(INK);
				break;
			case "done": // pleased with itself
				f.arc(-ex, ey + er, er * 1.3, Math.PI + 0.3, -0.3)
					.arc(ex, ey + er, er * 1.3, Math.PI + 0.3, -0.3)
					.stroke(line);
				f.arc(0, -s * 0.46, s * 0.1, 0.2, Math.PI - 0.2).stroke(line);
				break;
		}
		f.circle(-s * 0.27, -s * 0.48, s * 0.05)
			.circle(s * 0.27, -s * 0.48, s * 0.05)
			.fill({ color: CHEEK, alpha: 0.7 });
		this.#zzz.visible = mood === "idle";
		this.alpha = mood === "done" ? 0.6 : 1;
		// Lean back when idle, slump when stalled. Rotation is about the feet.
		this.rig.rotation = mood === "idle" ? -0.22 : mood === "stalled" ? 0.12 : 0;
		this.rig.y = 0;
		this.rig.scale.set(1);
	}

	/** One frame of typing: a quick bounce with squash. */
	tick(dt: number): void {
		if (this.#mood !== "busy") return;
		this.#phase += 0.35 * dt;
		const b = Math.abs(Math.sin(this.#phase));
		this.rig.y = -b * this.size * 0.08;
		this.rig.scale.set(1 + (1 - b) * 0.05, 1 - (1 - b) * 0.05);
	}
}
