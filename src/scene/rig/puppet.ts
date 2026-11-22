// A mochi puppet: about 18 sprites from the shared atlas in a small tree of containers. A pose
// sets targets; every continuous part (shoulders, elbows, legs, body squash, brows, where the face
// looks) springs towards them, and every swapped part (eyes, mouth, props, effects) pops in on a
// spring, so nothing ever snaps. The puppet has no clock of its own: its owner calls tick() from
// the app ticker, and it reports `animating` so the owner can stop the ticker once it settles.
import { Container, Sprite } from "pixi.js";
import type { Atlas } from "./atlas";
import { CHANNELS, type ChannelName, type Frame, REST, type TimedFrame, channels, diff } from "./frame";
import { FEEL, Spring, SpringSet } from "./motion";
import { frameAt, unit } from "./player";
import { POSE, type Pose, duration } from "./poses";
import { COSTUMES, type Role } from "./roles";
import { ANCHORS as A, ACCENTS } from "./theme";
import { CHEEKS } from "./vocab";

const RAD = Math.PI / 180;
const MS_PER_TICK = 1000 / 60;

/** Spring feel per channel: limbs bounce, the body wobbles, the face is quick. */
const feelOf = (c: ChannelName) =>
	c.startsWith("body") || c === "hop" ? FEEL.body : c.startsWith("look") || c.startsWith("brow") || c === "cheek" ? FEEL.face : FEEL.limb;

export interface PuppetOptions {
	/** Stable id: picks the loop phase and any variation, so the same id always acts the same. */
	id: string;
	role: Role;
	/** The lead's tie and headset colour (the project's). Defaults to one picked from the id. */
	accent?: number;
	/** Draw the rig's own desk when a pose asks for one. The office turns this off at a real desk. */
	desk?: boolean;
}

export interface PlayOptions {
	/** Passes before holding the last frame. Defaults to Infinity for `loop` poses, 1 for `once`. */
	loops?: number;
	/** Play the second character's part of a two-hander. */
	as?: "lead" | "partner";
	/** Start in place, with no spring-in (a character's first appearance). */
	snap?: boolean;
	/** `end` starts a finite pose already played through, holding its last frame: a character
	 * found idle is already mid-habit, and costs nothing to draw. */
	at?: "start" | "end";
}

export interface PuppetState {
	id: string;
	role: Role;
	pose: string;
	/** 0-based frame index, and how many frames the pose has. */
	frame: number;
	frames: number;
	holding: boolean;
	settled: boolean;
	/** The current frame's parts that differ from rest. */
	params: Record<string, string>;
}

type ArmParts = { root: Container; upper: Sprite; fore: Container; foreSprite: Sprite; hand: Container; handSprite: Sprite; held: Sprite };

export class Puppet extends Container {
	readonly id: string;
	readonly role: Role;
	readonly accent: number;
	/** Everything that moves; the puppet itself is placed by its owner. */
	readonly rig = new Container();

	#atlas: Atlas;
	#desk: boolean;
	#springs: SpringSet<ChannelName>;
	#pop = { face: new Spring(1, FEEL.pop), heldL: new Spring(1, FEEL.pop), heldR: new Spring(1, FEEL.pop), front: new Spring(1, FEEL.pop), fx: new Spring(1, FEEL.pop) };

	#pose: Pose = POSE.rest!;
	#frames: TimedFrame[] = POSE.rest!.frames;
	#as: "lead" | "partner" = "lead";
	#loops = 1;
	#ms = 0;
	#offset = 0;
	#index = -1;
	#holding = true;
	#frame: Frame = REST;
	#legsUp = false;
	#played?: { pose: Pose; opts: PlayOptions };

	// Parts, back to front.
	#shadow: Sprite;
	#back: Sprite;
	#legL: Sprite;
	#legR: Sprite;
	#torso = new Container();
	#body: Sprite;
	#costume: Sprite;
	#cheekL: Sprite;
	#cheekR: Sprite;
	#face = new Container();
	#eyeL: Sprite;
	#eyeR: Sprite;
	#browL: Sprite;
	#browR: Sprite;
	#mouth: Sprite;
	#costumeWear?: Sprite;
	#wear: Sprite;
	#hat: Sprite;
	#cup?: Sprite;
	#deskSprite: Sprite;
	#upper = new Container();
	#front: Sprite;
	#armL: ArmParts;
	#armR: ArmParts;
	#fx: Sprite;

	constructor(atlas: Atlas, opts: PuppetOptions) {
		super();
		this.#atlas = atlas;
		this.id = opts.id;
		this.role = opts.role;
		this.accent = opts.accent ?? ACCENTS[Math.floor(unit(opts.id, "accent") * ACCENTS.length)]!;
		this.#desk = opts.desk ?? true;
		this.#springs = new SpringSet(channels(REST), feelOf);
		const costume = COSTUMES[opts.role];

		const s = (name: string) => new Sprite(atlas.get(name));
		this.#shadow = s("shadow");
		this.#back = s("prop/chair");
		this.#legL = s("leg");
		this.#legR = s("leg");
		this.#legR.scale.x = -1;

		this.#body = s(`body/${opts.role}`);
		this.#costume = s(costume.front ?? "front/tie");
		this.#costume.visible = !!costume.front;
		if (costume.front === "front/tie") this.#costume.tint = this.accent;
		this.#cheekL = s("cheek");
		this.#cheekR = s("cheek");
		this.#cheekL.position.set(-A.cheekX, A.cheekY);
		this.#cheekR.position.set(A.cheekX, A.cheekY);
		this.#eyeL = s("eye/rest");
		this.#eyeR = s("eye/rest");
		this.#eyeL.position.set(-A.eyeX, A.eyeY);
		this.#eyeR.position.set(A.eyeX, A.eyeY);
		this.#browL = s("brow");
		this.#browR = s("brow");
		this.#mouth = s("mouth/rest");
		this.#mouth.position.set(0, A.mouthY);
		this.#face.addChild(this.#eyeL, this.#eyeR, this.#browL, this.#browR, this.#mouth);
		// The face pops about its middle, not about the body's base.
		this.#face.origin.set(0, A.eyeY + 6);
		this.#wear = s("wear/binoc");
		this.#wear.visible = false;
		if (costume.wear) this.#costumeWear = s(costume.wear);
		this.#hat = s(costume.hat);
		if (opts.role === "lead") {
			this.#cup = s("hat/lead-cup");
			this.#cup.tint = this.accent;
		}
		this.#torso.addChild(
			...[this.#body, this.#costume, this.#cheekL, this.#cheekR, this.#face, this.#costumeWear, this.#wear, this.#hat, this.#cup].filter(
				(x): x is Sprite | Container => !!x,
			),
		);

		this.#deskSprite = s("prop/desk");
		this.#deskSprite.visible = false;

		// Arms and anything held in front ride a layer of their own with the torso's transform, so a
		// desk can sit between the body and the hands on its keyboard.
		this.#front = s("prop/box");
		this.#front.visible = false;
		this.#armL = this.#arm(-1);
		this.#armR = this.#arm(1);
		this.#upper.addChild(this.#front, this.#armL.root, this.#armR.root);

		this.#fx = s("fx/pop");
		this.#fx.visible = false;

		this.#back.visible = false;
		this.rig.addChild(this.#shadow, this.#back, this.#legL, this.#legR, this.#torso, this.#deskSprite, this.#upper, this.#fx);
		this.addChild(this.rig);

		this.#apply();
	}

	#arm(side: -1 | 1): ArmParts {
		const a = this.#atlas;
		const root = new Container();
		root.position.set(side * A.shoulderX, A.shoulderY);
		const upper = new Sprite(a.get("arm/upper"));
		const fore = new Container();
		fore.y = A.upper;
		const foreSprite = new Sprite(a.get("arm/fore"));
		const hand = new Container();
		hand.y = A.fore;
		const handSprite = new Sprite(a.get(`hand/${this.role}`));
		const held = new Sprite(a.get("held/mug"));
		held.visible = false;
		hand.addChild(handSprite, held);
		fore.addChild(foreSprite, hand);
		root.addChild(upper, fore);
		return { root, upper, fore, foreSprite, hand, handSprite, held };
	}

	// Playing -------------------------------------------------------------------------------------

	get pose(): Pose {
		return this.#pose;
	}

	/** Play a pose (or a pose's partner part) from its first frame. */
	play(pose: Pose | string, opts: PlayOptions = {}): void {
		const p = typeof pose === "string" ? POSE[pose] : pose;
		if (!p) throw new Error(`no pose "${pose}"`);
		const as = opts.as ?? "lead";
		const frames = as === "partner" && p.partner ? p.partner.frames : p.frames;
		this.#played = { pose: p, opts };
		this.#pose = p;
		this.#as = as;
		this.#frames = frames;
		this.#loops = opts.loops ?? (p.play === "loop" ? Infinity : 1);
		this.#ms = opts.at === "end" && Number.isFinite(this.#loops) ? duration(frames) * this.#loops : 0;
		// Loops start at a phase picked from the id, so a busy crowd doesn't type in step. A
		// two-hander's parts must stay in step with each other, so they start together.
		this.#offset = p.play === "loop" && !p.partner && opts.at !== "end" ? Math.floor(unit(this.id, p.name) * duration(frames)) : 0;
		this.#index = -1;
		this.#advance(0);
		if (opts.snap || opts.at === "end") this.snap();
		this.#apply();
	}

	/** Replay the current pose from its start, settled in place: the inspector's freeze() uses this
	 * so step(n) after it gives the same frames however long the page ran before. */
	rewind(): void {
		if (this.#played) this.play(this.#played.pose, { ...this.#played.opts, snap: true });
		else this.snap();
	}

	/** Show one frame and hold it (the pose sheet's cells). */
	showFrame(frame: Frame): void {
		this.#pose = POSE.rest!;
		this.#frames = [{ ...frame, ms: 1 }];
		this.#loops = 1;
		this.#ms = 1;
		this.#index = 0;
		this.#holding = true;
		this.#setFrame(frame);
		this.#apply();
	}

	/** Jump every spring to its target. */
	snap(): void {
		this.#springs.snap();
		for (const p of Object.values(this.#pop)) {
			p.target = 1;
			p.snap();
		}
		this.#apply();
	}

	get settled(): boolean {
		if (!this.#springs.settled) return false;
		for (const p of Object.values(this.#pop)) if (!p.settled) return false;
		return true;
	}

	/** True while there is anything left to draw: a looping pose, frames to come, or springs moving. */
	get animating(): boolean {
		return !this.#holding || !this.settled;
	}

	/** Advance by `dt` ticks (1 = 1/60 s, as Pixi's ticker counts). */
	tick(dt: number): void {
		if (!this.animating) return;
		const ms = dt * MS_PER_TICK;
		this.#advance(ms);
		this.#springs.step(ms / 1000);
		for (const p of Object.values(this.#pop)) p.step(ms / 1000);
		this.#apply();
	}

	state(): PuppetState {
		return {
			id: this.id,
			role: this.role,
			pose: this.#as === "partner" ? `${this.#pose.name}/partner` : this.#pose.name,
			frame: Math.max(0, this.#index),
			frames: this.#frames.length,
			holding: this.#holding,
			settled: this.settled,
			params: diff(this.#frame),
		};
	}

	/** The current frame (complete, every part named). */
	get frame(): Frame {
		return this.#frame;
	}

	/** How far the body is lifted off the ground right now, in rig units. */
	get lift(): number {
		return -(this.#springs.value("bodyY") + Math.min(0, this.#springs.value("hop")));
	}

	#advance(ms: number): void {
		if (this.#holding && this.#index >= 0 && ms > 0) return;
		this.#ms += ms;
		const at = frameAt(this.#frames, this.#ms + this.#offset, this.#loops);
		this.#holding = at.holding;
		if (at.index !== this.#index) {
			this.#index = at.index;
			this.#setFrame(this.#frames[at.index]!);
		}
	}

	#setFrame(f: Frame): void {
		const prev = this.#frame;
		this.#frame = f;
		this.#springs.setTargets(channels(f));
		const a = this.#atlas;

		if (f.eyes !== prev.eyes || f.mouth !== prev.mouth) {
			this.#eyeL.texture = a.get(`eye/${f.eyes}`);
			this.#eyeR.texture = a.get(`eye/${f.eyes}`);
			// Side-eye looks the same way with both eyes; everything else mirrors.
			this.#eyeR.scale.x = f.eyes === "side" ? 1 : -1;
			this.#mouth.texture = a.get(`mouth/${f.mouth}`);
			this.#kick(this.#pop.face, 1.1);
		}
		const tint = CHEEKS[f.cheeks][1];
		this.#cheekL.tint = tint;
		this.#cheekR.tint = tint;

		this.#swap(this.#armL.held, f.props.left && `held/${f.props.left}`, prev.props.left !== f.props.left, this.#pop.heldL);
		this.#swap(this.#armR.held, f.props.right && `held/${f.props.right}`, prev.props.right !== f.props.right, this.#pop.heldR);
		const front = f.props.front === "desk" ? undefined : f.props.front;
		this.#swap(this.#front, front && `prop/${front}`, (prev.props.front === "desk" ? undefined : prev.props.front) !== front, this.#pop.front);
		this.#deskSprite.visible = this.#desk && f.props.front === "desk";
		this.#back.visible = f.props.back === "chair";
		// Feet up go on the desk, in front of it; otherwise legs stand behind the body.
		const up = f.feet === "up";
		if (up !== this.#legsUp) {
			this.#legsUp = up;
			this.rig.removeChild(this.#legL, this.#legR);
			const at = up ? this.rig.getChildIndex(this.#deskSprite) + 1 : this.rig.getChildIndex(this.#torso);
			this.rig.addChildAt(this.#legL, at);
			this.rig.addChildAt(this.#legR, at + 1);
		}
		this.#wear.visible = f.props.wear === "binoc";
		// Binoculars cover the eyes, and the reviewer's glasses would sit on top of them.
		if (this.#costumeWear) this.#costumeWear.visible = !this.#wear.visible;
		this.#swap(this.#fx, f.fx && `fx/${f.fx}`, prev.fx !== f.fx, this.#pop.fx, 0.6);
	}

	/** Swap a sprite's texture (or hide it) and pop it in. */
	#swap(sprite: Sprite, name: string | undefined, changed: boolean, pop: Spring, from = 0.3): void {
		if (!name) {
			sprite.visible = false;
			return;
		}
		sprite.visible = true;
		if (!changed) return;
		sprite.texture = this.#atlas.get(name);
		sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0, y: 0 });
		pop.value = from;
		pop.velocity = 0;
		pop.target = 1;
	}

	#kick(pop: Spring, to: number): void {
		pop.value = to;
		pop.target = 1;
	}

	#apply(): void {
		const v = (c: ChannelName) => this.#springs.value(c);
		const pop = this.#pop;

		// A two-hander's second character walks between spots and fades in.
		this.rig.x = v("spotX");
		this.rig.alpha = Math.max(0, Math.min(1, v("spotA")));
		this.rig.scale.set(Math.max(0.01, v("spotS")));

		const hop = v("hop");
		this.#shadow.scale.set(1 + Math.min(0, hop) / 60, 1 + Math.min(0, hop) / 60);
		this.#shadow.x = v("bodyX") * 0.5;
		this.#legL.position.set(-A.legX, A.legY + hop + v("liftL"));
		this.#legL.rotation = v("legL") * RAD;
		this.#legR.position.set(A.legX, A.legY + hop + v("liftR"));
		this.#legR.rotation = v("legR") * RAD;

		for (const c of [this.#torso, this.#upper]) {
			c.position.set(v("bodyX"), v("bodyY") + A.base);
			c.rotation = v("bodyR") * RAD;
			c.scale.set(v("bodySX"), v("bodySY"));
		}

		this.#face.position.set(v("lookX"), v("lookY"));
		this.#face.scale.set(pop.face.value, 2 - pop.face.value);
		this.#browL.position.set(-A.eyeX, A.browY + v("browLY"));
		this.#browL.rotation = v("browLR") * RAD;
		this.#browR.position.set(A.eyeX, A.browY + v("browRY"));
		this.#browR.rotation = v("browRR") * RAD;
		const ba = Math.max(0, Math.min(1, v("browA")));
		this.#browL.alpha = ba;
		this.#browR.alpha = ba;
		this.#browL.visible = this.#browR.visible = ba > 0.01;
		this.#cheekL.scale.set(v("cheek"));
		this.#cheekR.scale.set(v("cheek"));

		this.#armPose(this.#armL, v("shoulderL"), v("elbowL"), v("handL"), pop.heldL.value);
		this.#armPose(this.#armR, v("shoulderR"), v("elbowR"), v("handR"), pop.heldR.value);
		this.#front.scale.set(pop.front.value);

		this.#fx.position.set(v("bodyX"), v("bodyY") + A.base);
		this.#fx.scale.set(pop.fx.value);
		this.#fx.alpha = Math.max(0, Math.min(1, pop.fx.value));
	}

	#armPose(arm: ArmParts, shoulder: number, elbow: number, hand: number, heldScale: number): void {
		arm.root.rotation = shoulder * RAD;
		arm.fore.rotation = elbow * RAD;
		// Whatever is held stays upright, then turns by the hand's own angle (a hammer swing).
		arm.held.rotation = (-(shoulder + elbow) + hand) * RAD;
		arm.held.scale.set(heldScale);
	}
}

export { CHANNELS };
