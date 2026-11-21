// A crowd of puppets on a grid: the rig's load test. ?crowd=200 fills the screen with 200
// characters; about two in three are busy (looping poses), the rest play one-shot poses and
// settle. ?crowd=200&idle makes everyone idle: each starts mid-habit, so nothing draws at all.
import { Container } from "pixi.js";
import type { Atlas } from "./atlas";
import { choosePose, unit } from "./player";
import type { Trigger } from "./poses";
import { Puppet } from "./puppet";
import { ROLES } from "./roles";

const BUSY: Trigger[] = ["busy", "busy", "busy", "busy", "waiting", "long-build"];
const ONCE: Trigger[] = ["idle", "test-failed", "pr-opened", "thinking", "stalled", "finished", "idle-long"];

export class Crowd extends Container {
	readonly puppets: Puppet[] = [];

	constructor(
		atlas: Atlas,
		readonly count: number,
		readonly idle: boolean,
	) {
		super();
		for (let i = 0; i < count; i++) {
			const id = `crowd-${i}`;
			const role = ROLES[i % ROLES.length]!;
			const p = new Puppet(atlas, { id, role });
			const busy = !idle && unit(id, "busy") < 2 / 3;
			const list = busy ? BUSY : idle ? ["idle" as const] : ONCE;
			const trigger = list[Math.floor(unit(id, "trigger") * list.length)]!;
			p.play(choosePose(trigger, id, role), { snap: true, at: idle ? "end" : "start" });
			this.puppets.push(p);
			this.addChild(p);
		}
	}

	layout(width: number, height: number): void {
		const cols = Math.ceil(Math.sqrt((this.count * width) / height));
		const rows = Math.ceil(this.count / cols);
		const cw = width / cols;
		const ch = height / rows;
		const size = Math.min(cw * 0.75, ch * 0.62);
		this.puppets.forEach((p, i) => {
			p.position.set((i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch * 0.86);
			p.scale.set(size / 100);
		});
	}

	get animating(): boolean {
		for (const p of this.puppets) if (p.animating) return true;
		return false;
	}

	tick(dt: number): void {
		for (const p of this.puppets) p.tick(dt);
	}

	entities() {
		return this.puppets.map((p) => {
			const at = p.getGlobalPosition();
			const s = p.state();
			return {
				key: p.id,
				mood: s.holding ? "still" : "acting",
				size: Math.round(p.scale.x * 100),
				x: Math.round(at.x),
				y: Math.round(at.y),
				lift: Math.round(p.lift * 100) / 100,
				role: s.role,
				pose: s.pose,
				frame: s.frame,
				frames: s.frames,
				params: s.params,
			};
		});
	}
}
