// A character in the placeholder office: a mochi puppet from the rig (src/scene/rig), acting out
// its mood until the director (S4) drives poses from real events. Only characters with something
// left to play animate, so a quiet office never runs the frame loop.
import { Container } from "pixi.js";
import { type Atlas, type Pose, Puppet, type PuppetState, type Role, choosePose } from "../scene/rig";

export type Mood = "busy" | "idle" | "stalled" | "done";

const TRIGGER = { busy: "busy", idle: "idle", stalled: "stalled", done: "finished" } as const;

export class Busybody extends Container {
	readonly puppet: Puppet;
	#mood?: Mood;

	/** `id` picks the loop phase and which habit an idle character falls into, so the same scene
	 * always renders the same frames. */
	constructor(
		atlas: Atlas,
		readonly id: string,
		readonly role: Role,
		readonly size: number,
		accent?: number,
	) {
		super();
		this.puppet = new Puppet(atlas, { id, role, accent, desk: false });
		this.puppet.scale.set(size / 100);
		this.addChild(this.puppet);
	}

	/** The rig, for callers that read its transform (the inspector's lift). */
	get rig(): Container {
		return this.puppet.rig;
	}

	get mood(): Mood | undefined {
		return this.#mood;
	}

	get animating(): boolean {
		return this.puppet.animating;
	}

	get pose(): Pose {
		return this.puppet.pose;
	}

	state(): PuppetState {
		return this.puppet.state();
	}

	setMood(mood: Mood): void {
		if (mood === this.#mood) return;
		const first = this.#mood === undefined;
		this.#mood = mood;
		const pose = choosePose(TRIGGER[mood], this.id, this.role);
		// A character found idle is already mid-habit: it starts settled and costs nothing to draw.
		// One that goes idle while we watch plays its habit through, then settles.
		this.puppet.play(pose, { snap: first, at: first && mood !== "busy" ? "end" : "start" });
		this.alpha = mood === "done" ? 0.6 : 1;
	}

	tick(dt: number): void {
		this.puppet.tick(dt);
	}
}
