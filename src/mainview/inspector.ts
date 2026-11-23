// window.__busybodies: the scene, readable and steerable as data. Agents (and tests) use it to check
// scene work through the browser pane or headless Chrome without reading pixels. Installed in dev
// builds and whenever the URL has ?inspect.
import type { Application } from "pixi.js";
import type { Director, World, WorldEvent } from "../scene/director";
import type { Trigger, Voice } from "../scene/sass";
import type { Stop } from "../scene/office/camera";
import type { Office } from "../scene/office/office";
import type { SignText } from "../scene/office/paper";
import type { Snapshot } from "../watcher/model";
import type { ThemeId } from "../scene/theme/id";
import type { Visibility } from "./visibility";
import type { SoundState } from "./sound";
import type { Camerawork, ShotReport } from "./shots";

export interface Inspector {
	/** True once the first snapshot has been drawn. */
	ready: boolean;
	/** The sass engine: bubbles up now, the last triggers, signs it wrote and slots it had no place for. */
	sass(): { bubbles: ReturnType<Voice["bubbles"]>; triggers: readonly Trigger[]; signs: Record<string, string>; dropped: Record<string, string>; nextWake?: number } | undefined;
	snapshot(): Snapshot | undefined;
	/** Every character: key, mood, size, position, how high it is bouncing right now, and from the
	 * rig its role, pose, frame (of frames) and the frame's non-rest params. */
	entities(): ReturnType<Office["entities"]>;
	/** Frame accounting since load (or since resetCounters). */
	counters(): { renders: number; animationFrames: number; tickerRunning: boolean; maxFPS: number; visible: boolean; life: boolean };
	/** Pretend the window went off screen (false) or came back (true); undefined: what WebKit says. */
	setVisible(visible: boolean | undefined): void;
	resetCounters(): void;
	/** Stop the clock: the ticker halts and nothing animates until unfreeze(). Every character
	 * rewinds to the start of its pose, so step(n) from here is the same on every load. */
	freeze(): void;
	unfreeze(): void;
	/** Advance a frozen scene by n frames of 1/60 s each, then render once. */
	step(n?: number): void;
	/** Show a snapshot as if the watcher had sent it. Stops a scripted demo day. */
	show(snapshot: Snapshot): void;
	/** The director's world: every actor's spot, pose, walk and the signals it last saw. */
	world(): World | undefined;
	/** The director's last 200 events, oldest first. */
	events(): WorldEvent[];
	/** Rooms pulsing because their lead is waiting on you. */
	pulsing(): Office["pulsing"];
	/** The office as data: every area (rect, desks, fixtures, wall slots) and every desk's slot. */
	layout(): ReturnType<typeof summarise> | undefined;
	/** Where the camera is, and how sharp static layers are baked. */
	camera(): { stop: Stop; scale: number; x: number; y: number; moving: boolean; bake: number };
	/** Move the camera to a stop. `animate: false` jumps there (for screenshots). */
	goTo(stop: Stop, animate?: boolean): void;
	/** Every named sign slot, with its text. */
	signs(): ReturnType<Office["signs"]>;
	setSign(id: string, text: SignText | undefined): void;
	/** The scene theme, and switching it live (as the tray's Theme menu does). */
	theme(): ThemeId;
	setTheme(id: ThemeId): void;
	/** The factory's robot arms: whether each moves, and its jobs. */
	arms(): Office["arms"];
	/** Crew-build pieces moving now (or waiting on an arm). */
	bricks(): Office["bricks"];
	/** Sound: on or off, the AudioContext's state, the last earcons scheduled (undefined in the
	 * compact window, which never plays sound). Set by main.ts. */
	sound(): SoundState | undefined;
	/** The tray's Sound and Calm office toggles and its Look, as the app sends them over RPC. Set by main.ts. */
	setToggles(change: { sound?: boolean; calm?: boolean; look?: string }): void;
	/** The look (mainview/look.ts), and the pixel pass's texture size in its own pixels. Set by main.ts. */
	look(): { look: string; pixel?: { width: number; height: number; resolution: number } };
	/** The following camera (compact, or ?follow): its stop, why, until when, pinned, cuts made,
	 * and the room tiles. Undefined when the camera doesn't follow. */
	shot(): ShotReport | undefined;
	/** Pin the following camera on a room (as its tile does); undefined unpins. */
	pin(area?: string): void;
	/** The light: the time-of-day phase and its hour (forced by ?hour= or the clock's), the room in
	 * focus, lamps and overhead lights on, glow, how often it re-baked, rooms in rush, clouds. */
	light(): Office["light"];
	/** Force the hour (0 to 23) as ?hour= does, or undefined to follow the clock. */
	setHour(hour: number | undefined): void;
}

/** The world without Maps, for JSON. */
function summarise(office: Office) {
	const w = office.layoutData;
	if (!w) return undefined;
	return {
		bounds: w.bounds,
		hallway: w.hallway,
		areas: w.areas.map((a) => ({
			id: a.id,
			kind: a.kind,
			name: a.name,
			band: a.band,
			rect: a.rect,
			cols: a.cols,
			rows: a.rows,
			desks: a.desks.map((d) => ({ id: d.id, col: d.col, row: d.row, cell: d.cell, lead: d.lead })),
			fixtures: a.fixtures,
			signs: a.wall.filter((x) => x.slot).map((x) => x.slot!),
			spots: a.spots,
		})),
	};
}

declare global {
	interface Window {
		__busybodies?: Inspector;
	}
}

export function installInspector(
	app: Application,
	office: Office,
	scene: { show(s: Snapshot): void; direct?(): void; frozen: boolean; redraw(): void; current?: Snapshot; stopDemo?: () => void },
	director?: Director,
	voice?: { voice: Voice; now(): number },
	themes?: { current(): ThemeId; set(id: ThemeId): void },
	visibility?: Visibility,
): Inspector & { shots(c: Camerawork): void } {
	let shots: Camerawork | undefined;
	const log: WorldEvent[] = [];
	director?.on((events) => {
		log.push(...events);
		if (log.length > 200) log.splice(0, log.length - 200);
	});
	let renders = 0;
	let animationFrames = 0;

	// Count every render however it was triggered (ticker or on demand).
	const render = app.renderer.render.bind(app.renderer);
	app.renderer.render = ((...args: Parameters<typeof render>) => {
		renders++;
		return render(...args);
	}) as typeof app.renderer.render;

	// Count every animation-frame request on the page, from Pixi or anything else: an idle scene
	// should make none.
	const raf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (cb) => {
		animationFrames++;
		return raf(cb);
	};

	const inspector: Inspector = {
		ready: false,
		sass: () => {
			if (!voice) return undefined;
			const now = voice.now();
			const v = voice.voice;
			return { bubbles: v.bubbles(now), triggers: v.sass.triggers, signs: Object.fromEntries(v.written), dropped: Object.fromEntries(v.dropped), nextWake: v.nextWake(now) };
		},
		snapshot: () => scene.current,
		entities: () => office.entities(),
		counters: () => ({ renders, animationFrames, tickerRunning: app.ticker.started, maxFPS: app.ticker.maxFPS, visible: visibility?.visible ?? true, life: office.life }),
		setVisible: (v) => visibility?.force(v),
		resetCounters: () => {
			renders = 0;
			animationFrames = 0;
		},
		freeze: () => {
			if (!scene.frozen) office.rewind();
			scene.frozen = true;
			app.ticker.stop();
		},
		unfreeze: () => {
			scene.frozen = false;
			scene.redraw();
		},
		step: (n = 1) => {
			inspector.freeze();
			for (let i = 0; i < n; i++) office.tick(1);
			app.render();
		},
		show: (s) => {
			scene.stopDemo?.();
			scene.show(s);
		},
		world: () => director?.world,
		events: () => [...log],
		pulsing: () => office.pulsing,
		layout: () => summarise(office),
		camera: () => ({ stop: office.stop, ...office.view, moving: office.moving, bake: office.bakeResolution }),
		goTo: (stop, animate = true) => {
			office.goTo(stop, animate);
			scene.redraw();
		},
		signs: () => office.signs(),
		setSign: (id, text) => office.setSign(id, text),
		theme: () => themes?.current() ?? "office",
		setTheme: (id) => themes?.set(id),
		arms: () => office.arms,
		bricks: () => office.bricks,
		sound: () => undefined,
		setToggles: () => {},
		look: () => ({ look: "plain" }),
		shot: () => shots?.report(),
		pin: (area) => {
			shots?.pin(area);
			scene.direct?.();
		},
		light: () => office.light,
		setHour: (hour) => {
			office.setHour(hour);
			scene.redraw();
		},
	};
	window.__busybodies = inspector;
	return Object.assign(inspector, { shots: (c: Camerawork) => void (shots = c) });
}
