// A mochi puppet: about 18 sprites from the shared atlas in a small tree of containers. A pose
// sets targets; every continuous part (shoulders, elbows, legs, the body's lean, brows, where the face
// looks) springs towards them, and every swapped part (eyes, mouth, props, effects) pops in on a
// spring, so nothing ever snaps. The puppet has no clock of its own: its owner calls tick() from
// the app ticker, and it reports `animating` so the owner can stop the ticker once it settles.
import { Container, Sprite } from "pixi.js";
import type { Atlas } from "./atlas";
import { type ChannelName, type Frame, REST, type TimedFrame, channels, diff } from "./data/frame";
import { FEEL, Spring, SpringSet } from "./data/motion";
import { type Passes, frameAt, passBeat, unit } from "./data/player";
import { POSE, type Pose, duration } from "./data/poses";
import { COSTUMES, type Role } from "./data/roles";
import { ANCHORS as A, ACCENTS, PAPER_PALETTE } from "./theme";
import { CHEEKS, LOOKS } from "./data/vocab";
import { type LifeBeat, STILL, lifeAt } from "./data/life";
import { type Aim, SIDE_EYES, WORK_LOOKS } from "./data/gaze";
import { PLUMP_SHAPE, type Plump, WADDLE_DEG, bodyPart, plumpOffsets } from "./data/plump";

const RAD = Math.PI / 180;
/** The poses that walk: a plum waddles in them. */
const WALKS = new Set(["walk", "carry", "rushRun", "slowWalk", "envelopeCarry", "stickyCarry"]);
const PLAIN: Plump = { level: 0, ripe: false };
const MS_PER_TICK = 1000 / 60;

/** Spring feel per channel: limbs are quick and land, the hand's angle (so a held tool) trails the
 * arm a touch and follows through, the body moves without wobbling, the face is quick. */
const feelOf = (c: ChannelName) =>
	c.startsWith("body") || c === "hop"
		? FEEL.body
		: c.startsWith("look") || c.startsWith("brow") || c === "cheek"
			? FEEL.face
			: c === "handL" || c === "handR"
				? FEEL.tool
				: FEEL.limb;

export interface PuppetOptions {
	/** Stable id: picks the loop phase and any variation, so the same id always acts the same. */
	id: string;
	role: Role;
	/** How full its context is, worn as its body (plump.ts). Defaults to the plain mochi. */
	plump?: Plump;
	/** The lead's tie and headset colour (the project's). Defaults to one picked from the id. */
	accent?: number;
	/** Draw the rig's own desk when a pose asks for one. The office turns this off at a real desk. */
	desk?: boolean;
	/** Something worn on the face besides the costume's (a regular's accessory, rig/data/roles.ts): an
	 * atlas part like `wear/glasses`. */
	wear?: string;
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
	/** How fast the frames run: 1 is as written. Springs keep real time, so only the beat changes. */
	tempo?: number;
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
	/** The body's plump level (plump.ts), and whether it is ripe. */
	plump: number;
	ripe: boolean;
	/** The variant pass playing (`Pose.beats`), by name; "" for the pose's own frames. */
	beat: string;
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
	/** The hand colour, for a prop that is the hand itself (a finger-gun). */
	#skin: number;
	#springs: SpringSet<ChannelName>;
	#pop = {
		face: new Spring(1, FEEL.pop),
		heldL: new Spring(1, FEEL.pop),
		heldR: new Spring(1, FEEL.pop),
		front: new Spring(1, FEEL.pop),
		fx: new Spring(1, FEEL.pop),
		/** A change of plump: the body swells or deflates to its new size with a wobble. Never a
		 * squash to act: it only moves when the context does. */
		plump: new Spring(1, FEEL.plump),
		/** A new hire buds off its boss like a pinch of mochi dough: it swells from a bead. */
		bud: new Spring(1, FEEL.plump),
	};
	/** The pops as a list, for the per-frame loops (no array made each frame). */
	#pops: Spring[] = Object.values(this.#pop);
	/** The parts that come and go (props, the desk, the work, binoculars, the fx) shown now. They
	 * come and go by alpha, not `visible`: Pixi rebuilds the whole office's draw list on any
	 * visibility change, and a busy cast swaps props every few frames. Alpha 0 draws nothing. */
	#on = new Set<Sprite>();
	/** How the eyes and mouth arrive on a change: a slight swell, not a squash. */
	static readonly FACE_KICK = 1.04;

	#pose: Pose = POSE.rest!;
	#frames: TimedFrame[] = POSE.rest!.frames;
	#as: "lead" | "partner" = "lead";
	#loops = 1;
	#ms = 0;
	#offset = 0;
	#tempo = 1;
	#index = -1;
	/** Which pass is showing: 0 the pose's own frames, k its k-th beat. */
	#beatPass = 0;
	/** The pose's variant passes and their picker, when it has any (lead parts of loops only). */
	#passes?: Passes<TimedFrame>;
	#holding = true;
	#frame: Frame = REST;
	#legsUp = false;
	#plump: Plump = PLAIN;
	#off = plumpOffsets(0);
	#played?: { pose: Pose; opts: PlayOptions };
	/** Life (src/scene/rig/life.ts): blinks and glances on top of the pose, while the app is on
	 * screen. Its own clock, so a pose change doesn't restart it. */
	#life = false;
	#lifeMs = 0;
	#beat: LifeBeat = STILL;
	/** Where something else asked the face to look (a teammate walking past), in rig units on top
	 * of the pose's own look; it wins over a glance. */
	#gaze?: readonly [number, number];
	/** Where the director pointed the face (gaze.ts): a look in rig units that replaces the pose's
	 * own, except on frames whose eyes are on the work. It wins over a glance and over `gaze`. */
	#aim?: Aim;

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
	#work: Sprite;
	#armL: ArmParts;
	#armR: ArmParts;
	#fx: Sprite;
	/** Weather over the head (director/weather.ts): rides the torso, above the hat. */
	#over: Sprite;
	#weather?: "rain" | "sun";

	constructor(atlas: Atlas, opts: PuppetOptions) {
		super();
		this.#atlas = atlas;
		this.id = opts.id;
		this.role = opts.role;
		this.accent = opts.accent ?? ACCENTS[Math.floor(unit(opts.id, "accent") * ACCENTS.length)]!;
		this.#desk = opts.desk ?? true;
		this.#skin = PAPER_PALETTE.role[opts.role];
		this.#springs = new SpringSet(channels(REST), feelOf);
		const costume = COSTUMES[opts.role];

		const s = (name: string) => new Sprite(atlas.get(name));
		this.#shadow = s("shadow");
		this.#back = s("prop/chair");
		// A theme may give a role its own leg or upper arm (the factory's knee pads and armband).
		const leg = atlas.has(`leg/${opts.role}`) ? `leg/${opts.role}` : "leg";
		this.#legL = s(leg);
		this.#legR = s(leg);
		this.#legR.scale.x = -1;

		this.#body = s(`body/${opts.role}`);
		// A theme may leave a role's belly bare by not painting its front piece (the office designer).
		const front = costume.front && atlas.has(costume.front) ? costume.front : undefined;
		this.#costume = s(front ?? "front/tie");
		this.#costume.visible = !!front;
		if (front === "front/tie") this.#costume.tint = this.accent;
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
		this.#wear.alpha = 0;
		const worn = costume.wear ?? (opts.wear && atlas.has(opts.wear) ? opts.wear : undefined);
		if (worn) {
			this.#costumeWear = s(worn);
			this.#on.add(this.#costumeWear);
		}
		this.#hat = s(costume.hat);
		this.#over = s("over/sun1");
		this.#over.alpha = 0;
		if (opts.role === "lead") {
			this.#cup = s("hat/lead-cup");
			this.#cup.tint = this.accent;
		}
		this.#torso.addChild(
			...[this.#over, this.#body, this.#costume, this.#cheekL, this.#cheekR, this.#face, this.#costumeWear, this.#wear, this.#hat, this.#cup].filter(
				(x): x is Sprite | Container => !!x,
			),
		);

		this.#deskSprite = s("prop/desk");
		this.#deskSprite.alpha = 0;
		// The work out front stands on the floor: it doesn't ride the body.
		this.#work = s("work/nail1");
		this.#work.alpha = 0;

		// Arms and anything held in front ride a layer of their own with the torso's transform, so a
		// desk can sit between the body and the hands on its keyboard.
		this.#front = s("prop/box");
		this.#front.alpha = 0;
		this.#armL = this.#arm(-1);
		this.#armR = this.#arm(1);
		this.#upper.addChild(this.#front, this.#armL.root, this.#armR.root);

		this.#fx = s("fx/pop");
		this.#fx.alpha = 0;

		this.#back.alpha = 0;
		this.#over.y = A.bodyTop - 22;
		if (opts.plump) this.#setPlump(opts.plump, false);
		this.rig.addChild(this.#shadow, this.#back, this.#legL, this.#legR, this.#torso, this.#deskSprite, this.#work, this.#upper, this.#fx);
		this.addChild(this.rig);

		this.#apply();
	}

	#arm(side: -1 | 1): ArmParts {
		const a = this.#atlas;
		const root = new Container();
		root.position.set(side * A.shoulderX, A.shoulderY);
		// A role's own upper arm, if the theme has one, goes on the left arm only (an armband).
		const own = `arm/upper/${this.role}`;
		const upper = new Sprite(a.get(side < 0 && a.has(own) ? own : "arm/upper"));
		const fore = new Container();
		fore.y = A.upper;
		const foreSprite = new Sprite(a.get("arm/fore"));
		const hand = new Container();
		hand.y = A.fore;
		const handSprite = new Sprite(a.get(`hand/${this.role}`));
		const held = new Sprite(a.get("held/mug"));
		held.alpha = 0;
		hand.addChild(handSprite, held);
		fore.addChild(foreSprite, hand);
		root.addChild(upper, fore);
		return { root, upper, fore, foreSprite, hand, handSprite, held };
	}

	// Plump -----------------------------------------------------------------------------------------

	get plump(): Plump {
		return this.#plump;
	}

	/** Wear a context's fullness as the body (plump.ts): a new size swells or deflates in with a
	 * wobble; a ripe plum blushes. */
	set plump(g: Plump | undefined) {
		this.#setPlump(g ?? PLAIN, true);
	}

	#setPlump(g: Plump, wobble: boolean): void {
		const was = this.#plump;
		if (g.level === was.level && g.ripe === was.ripe) return;
		this.#plump = g;
		const o = (this.#off = plumpOffsets(g.level));
		const ripe = g.ripe && this.#atlas.has(bodyPart(this.role, 3, true));
		this.#body.texture = this.#atlas.get(bodyPart(this.role, g.level, ripe));
		this.#body.anchor.copyFrom(this.#body.texture.defaultAnchor ?? { x: 0, y: 0 });
		this.#cheekL.position.set(-A.cheekX - o.cheekX, A.cheekY + o.cheekY);
		this.#cheekR.position.set(A.cheekX + o.cheekX, A.cheekY + o.cheekY);
		this.#hat.y = o.top;
		this.#over.y = A.bodyTop + o.top - 22;
		if (this.#cup) this.#cup.y = o.top;
		this.#wear.y = o.face;
		if (this.#costumeWear) this.#costumeWear.y = o.face;
		this.#armL.root.position.set(-A.shoulderX - o.shoulderX, A.shoulderY + o.shoulderY);
		this.#armR.root.position.set(A.shoulderX + o.shoulderX, A.shoulderY + o.shoulderY);
		this.#shadow.scale.x = PLUMP_SHAPE[g.level]!.w / 100;
		if (wobble && g.level !== was.level) {
			// Start at the old width and spring to the new: a puff out, or a deflate.
			const p = this.#pop.plump;
			p.value = PLUMP_SHAPE[was.level]!.w / PLUMP_SHAPE[g.level]!.w;
			p.velocity = 0;
			p.target = 1;
		}
		this.#apply();
	}

	/** The weather over its head, or none. It drifts and drips on the life clock. */
	set weather(w: "rain" | "sun" | undefined) {
		if (w === this.#weather) return;
		this.#weather = w;
		this.#over.alpha = w ? 1 : 0;
		this.#drift();
	}

	get weather(): "rain" | "sun" | undefined {
		return this.#weather;
	}

	/** The weather's frame for the life clock: rain falls and the sun turns, a step every 280 ms. */
	#drift(): void {
		if (!this.#weather) return;
		const k = Math.floor(this.#lifeMs / 280) % 2;
		const tex = this.#atlas.get(`over/${this.#weather}${k + 1}`);
		if (this.#over.texture !== tex) {
			this.#over.texture = tex;
			this.#over.anchor.copyFrom(tex.defaultAnchor ?? { x: 0, y: 0 });
		}
	}

	/** Bud: start as a small bead and swell, wobbling, to full size (a new hire). */
	bud(): void {
		const p = this.#pop.bud;
		p.value = 0.18;
		p.velocity = 0;
		p.target = 1;
	}

	/** A poke: the body wobbles like jelly once, about its own size. */
	jiggle(): void {
		const p = this.#pop.plump;
		p.value = 1.09;
		p.velocity = 0;
		p.target = 1;
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
		this.#tempo = opts.tempo ?? 1;
		// A looping pose may break its rhythm now and then with a variant pass (Pose.beats).
		const beats = as === "lead" && !p.partner && p.play === "loop" ? p.beats : undefined;
		this.#passes = beats
			? { sets: beats.passes.map((b) => b.frames), pick: (pass) => passBeat(this.id, p.name, pass, beats.passes.length, beats.share) }
			: undefined;
		this.#index = -1;
		this.#beatPass = 0;
		this.#advance(0);
		if (opts.snap || opts.at === "end") this.snap();
		this.#apply();
	}

	/** Change how fast the current pose runs, without starting it over. */
	setTempo(tempo: number): void {
		this.#tempo = tempo;
		if (this.#played) this.#played.opts = { ...this.#played.opts, tempo };
	}

	get tempo(): number {
		return this.#tempo;
	}

	/** How long the pose plays through once its passes are done, ms (Infinity for a loop). */
	get playMs(): number {
		return Number.isFinite(this.#loops) ? (duration(this.#frames) * this.#loops) / this.#tempo : Infinity;
	}

	/** Replay the current pose from its start, settled in place: the inspector's freeze() uses this
	 * so step(n) after it gives the same frames however long the page ran before. */
	rewind(): void {
		this.#lifeMs = 0;
		if (this.#played) this.play(this.#played.pose, { ...this.#played.opts, snap: true });
		else this.snap();
	}

	/** Show one frame and hold it (the pose sheet's cells). */
	showFrame(frame: Frame): void {
		this.#pose = POSE.rest!;
		this.#frames = [{ ...frame, ms: 1 }];
		this.#passes = undefined;
		this.#beatPass = 0;
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
		for (const p of this.#pops) {
			p.target = 1;
			p.snap();
		}
		this.#apply();
	}

	get settled(): boolean {
		if (!this.#springs.settled) return false;
		for (const p of this.#pops) if (!p.settled) return false;
		return true;
	}

	/** True while there is anything left to draw: a looping pose, frames to come, or springs moving. */
	get animating(): boolean {
		return !this.#holding || !this.settled;
	}

	/** Life on: the puppet keeps blinking and glancing even when its pose holds still. */
	get alive(): boolean {
		return this.#life;
	}

	set life(on: boolean) {
		if (on === this.#life) return;
		this.#life = on;
		if (!on) this.#setBeat(STILL);
	}

	/** Look somewhere (rig units added to the pose's look, in the puppet's own facing), or stop. */
	gaze(at: readonly [number, number] | undefined): void {
		const same = at === this.#gaze || (at && this.#gaze && at[0] === this.#gaze[0] && at[1] === this.#gaze[1]);
		if (same) return;
		this.#gaze = at;
		this.#setBeat(this.#lifeBeat());
	}

	/** Look at something the director chose (gaze.ts `aimAt`), or stop. */
	aim(at: Aim | undefined): void {
		const was = this.#aim;
		if (at === was || (at && was && at.x === was.x && at.y === was.y && at.side === was.side)) return;
		this.#aim = at;
		this.#beatFrame();
	}

	/** The aim in force on this frame, if any (a frame with eyes on the work ignores it). */
	get aimed(): Aim | undefined {
		return this.#aim && !WORK_LOOKS.has(this.#frame.look) ? this.#aim : undefined;
	}

	/** Advance by `dt` ticks (1 = 1/60 s, as Pixi's ticker counts). */
	tick(dt: number): void {
		const ms = dt * MS_PER_TICK;
		if (this.#life) {
			this.#lifeMs += ms;
			this.#setBeat(this.#lifeBeat());
			this.#drift();
		}
		if (!this.animating) return;
		this.#advance(ms * this.#tempo);
		this.#springs.step(ms / 1000);
		for (const p of this.#pops) p.step(ms / 1000);
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
			plump: this.#plump.level,
			ripe: this.#plump.ripe,
			beat: this.#beatPass > 0 ? (this.#pose.beats?.passes[this.#beatPass - 1]?.name ?? "") : "",
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
		const at = frameAt(this.#frames, this.#ms + this.#offset, this.#loops, this.#passes);
		this.#holding = at.holding;
		const pass = at.beat ?? 0;
		if (at.index !== this.#index || pass !== this.#beatPass) {
			this.#index = at.index;
			this.#beatPass = pass;
			const set = pass > 0 ? this.#passes!.sets[pass - 1]! : this.#frames;
			this.#setFrame(set[at.index]!);
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
			this.#kick(this.#pop.face, Puppet.FACE_KICK);
		}
		this.#beatFrame();
		const tint = CHEEKS[f.cheeks][1];
		this.#cheekL.tint = tint;
		this.#cheekR.tint = tint;

		this.#swap(this.#armL.held, f.props.left && `held/${f.props.left}`, prev.props.left !== f.props.left, this.#pop.heldL);
		this.#swap(this.#armR.held, f.props.right && `held/${f.props.right}`, prev.props.right !== f.props.right, this.#pop.heldR);
		// A finger-gun is the hand itself: drawn white, it takes the hand's colour.
		this.#armL.held.tint = f.props.left === "finger" ? this.#skin : 0xffffff;
		this.#armR.held.tint = f.props.right === "finger" ? this.#skin : 0xffffff;
		const front = f.props.front === "desk" ? undefined : f.props.front;
		this.#swap(this.#front, front && `prop/${front}`, (prev.props.front === "desk" ? undefined : prev.props.front) !== front, this.#pop.front);
		this.#show(this.#deskSprite, this.#desk && f.props.front === "desk");
		// The work changes state in place (the nail goes down): no pop, so the change is the effect.
		this.#show(this.#work, !!f.props.work);
		if (f.props.work && f.props.work !== prev.props.work) {
			this.#work.texture = a.get(`work/${f.props.work}`);
			this.#work.anchor.copyFrom(this.#work.texture.defaultAnchor ?? { x: 0, y: 0 });
		}
		this.#show(this.#back, !!f.props.back);
		if (f.props.back && f.props.back !== prev.props.back) this.#back.texture = a.get(`prop/${f.props.back}`);
		// Feet up go on the desk, in front of it, and a kick swings out in front of the body;
		// otherwise legs stand behind the body.
		const up = f.feet === "up" || f.feet === "boot";
		if (up !== this.#legsUp) {
			this.#legsUp = up;
			this.rig.removeChild(this.#legL, this.#legR);
			const at = up ? this.rig.getChildIndex(this.#deskSprite) + 1 : this.rig.getChildIndex(this.#torso);
			this.rig.addChildAt(this.#legL, at);
			this.rig.addChildAt(this.#legR, at + 1);
		}
		this.#show(this.#wear, f.props.wear === "binoc");
		// Binoculars cover the eyes, and the reviewer's glasses would sit on top of them.
		if (this.#costumeWear) this.#show(this.#costumeWear, f.props.wear !== "binoc");
		this.#swap(this.#fx, f.fx && `fx/${f.fx}`, prev.fx !== f.fx, this.#pop.fx, 0.7);
	}

	#lifeBeat(): LifeBeat {
		const beat = this.#life ? lifeAt(this.id, this.#lifeMs, this.#frame.eyes) : STILL;
		return this.#gaze ? { ...beat, lookX: this.#gaze[0], lookY: this.#gaze[1] } : beat;
	}

	/** Put life's beat on: re-aim the face's look springs, and shut or open the eyes. */
	#setBeat(beat: LifeBeat): void {
		const was = this.#beat;
		if (beat.blink === was.blink && beat.lookX === was.lookX && beat.lookY === was.lookY) return;
		this.#beat = beat;
		this.#beatFrame();
	}

	/** The current frame's eyes and look, with life's beat and the director's aim on top. No pop: a
	 * blink just happens. */
	#beatFrame(): void {
		const f = this.#frame;
		const aim = this.aimed;
		const eyes = this.#beat.blink ? "closed" : aim?.side && SIDE_EYES.has(f.eyes) ? "side" : f.eyes;
		const tex = this.#atlas.get(`eye/${eyes}`);
		if (this.#eyeL.texture !== tex) {
			this.#eyeL.texture = tex;
			this.#eyeR.texture = tex;
		}
		// Side-eye looks the same way with both eyes (right as drawn, both mirrored for an aim to the
		// left); everything else mirrors the right eye.
		const side = eyes === "side";
		const sx = side && aim && aim.x < 0 ? -1 : 1;
		this.#eyeL.scale.x = side ? sx : 1;
		this.#eyeR.scale.x = side ? sx : -1;
		if (aim) {
			this.#springs.springs.lookX.target = aim.x;
			this.#springs.springs.lookY.target = aim.y;
			return;
		}
		const [x, y] = LOOKS[f.look];
		this.#springs.springs.lookX.target = x + this.#beat.lookX;
		this.#springs.springs.lookY.target = y + this.#beat.lookY;
	}

	/** Swap a sprite's texture (or hide it). Something arriving from nothing pops in; one thing
	 * turning into another (a sheet unrolling, a brick changing hands) just changes. */
	#swap(sprite: Sprite, name: string | undefined, changed: boolean, pop: Spring, from = 0.55): void {
		if (!name) {
			this.#show(sprite, false);
			return;
		}
		const arriving = !this.#on.has(sprite);
		this.#show(sprite, true);
		if (!changed) return;
		sprite.texture = this.#atlas.get(name);
		sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0, y: 0 });
		if (!arriving) return;
		pop.value = from;
		pop.velocity = 0;
		pop.target = 1;
	}

	/** Show or hide a part that comes and goes (see `#on`). The fx's alpha also follows its pop. */
	#show(sprite: Sprite, on: boolean): void {
		if (on === this.#on.has(sprite)) return;
		if (on) this.#on.add(sprite);
		else this.#on.delete(sprite);
		sprite.alpha = on ? (sprite === this.#fx ? Math.max(0, Math.min(1, this.#pop.fx.value)) : 1) : 0;
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
		this.rig.scale.set(Math.max(0.01, v("spotS") * pop.bud.value));

		const hop = v("hop");
		const o = this.#off;
		const wide = PLUMP_SHAPE[this.#plump.level]!.w / 100;
		this.#shadow.scale.set(wide * (1 + Math.min(0, hop) / 60), 1 + Math.min(0, hop) / 60);
		this.#shadow.x = v("bodyX") * 0.5;
		this.#legL.position.set(-A.legX - o.legX, A.legY + hop + v("liftL"));
		this.#legL.rotation = v("legL") * RAD;
		this.#legR.position.set(A.legX + o.legX, A.legY + hop + v("liftR"));
		this.#legR.rotation = v("legR") * RAD;

		// A plum waddles: a walk rocks it from foot to foot, once each way per stride.
		const waddle =
			WADDLE_DEG[this.#plump.level]! && WALKS.has(this.#pose.name)
				? WADDLE_DEG[this.#plump.level]! * Math.sin((2 * Math.PI * this.#ms) / Math.max(1, duration(this.#frames)))
				: 0;
		const g = pop.plump.value;
		for (const c of [this.#torso, this.#upper]) {
			c.position.set(v("bodyX"), v("bodyY") + A.base);
			c.rotation = (v("bodyR") + waddle) * RAD;
			c.scale.set(v("bodySX") * g, v("bodySY") * (1 + (1 - g) * 0.4));
		}

		this.#face.position.set(v("lookX"), v("lookY") + o.face);
		this.#face.scale.set(pop.face.value, 2 - pop.face.value);
		this.#browL.position.set(-A.eyeX, A.browY + v("browLY"));
		this.#browL.rotation = v("browLR") * RAD;
		this.#browR.position.set(A.eyeX, A.browY + v("browRY"));
		this.#browR.rotation = v("browRR") * RAD;
		const ba = Math.max(0, Math.min(1, v("browA")));
		// Under 0.01 the brows are off; by alpha, not visible (see `#on`).
		this.#browL.alpha = this.#browR.alpha = ba > 0.01 ? ba : 0;
		this.#cheekL.scale.set(v("cheek"));
		this.#cheekR.scale.set(v("cheek"));

		this.#armPose(this.#armL, v("shoulderL"), v("elbowL"), v("handL"), pop.heldL.value);
		this.#armPose(this.#armR, v("shoulderR"), v("elbowR"), v("handR"), pop.heldR.value);
		this.#front.scale.set(pop.front.value);

		this.#fx.position.set(v("bodyX"), v("bodyY") + A.base);
		this.#fx.scale.set(pop.fx.value);
		this.#fx.alpha = this.#on.has(this.#fx) ? Math.max(0, Math.min(1, pop.fx.value)) : 0;
	}

	#armPose(arm: ArmParts, shoulder: number, elbow: number, hand: number, heldScale: number): void {
		arm.root.rotation = shoulder * RAD;
		arm.fore.rotation = elbow * RAD;
		// Whatever is held stays upright, then turns by the hand's own angle (a hammer swing).
		arm.held.rotation = (-(shoulder + elbow) + hand) * RAD;
		arm.held.scale.set(heldScale);
	}
}
