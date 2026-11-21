// window.__busybodies: the scene, readable and steerable as data. Agents (and tests) use it to check
// scene work through the browser pane or headless Chrome without reading pixels. Installed in dev
// builds and whenever the URL has ?inspect.
import type { Application } from "pixi.js";
import type { Snapshot } from "../watcher/model";

/** One character, as the inspector reports it. */
export interface Entity {
	key: string;
	mood: string;
	size: number;
	x: number;
	y: number;
	lift: number;
	/** From the rig: costume, the pose playing, and which of its frames shows. */
	role?: string;
	pose?: string;
	frame?: number;
	frames?: number;
	/** The current frame's parts that differ from rest. */
	params?: Record<string, string>;
}

/** What the inspector drives: the office, or a rig test scene. */
export interface InspectedScene {
	entities(): Entity[];
	tick(dt: number): void;
}

export interface Inspector {
	/** True once the first snapshot has been drawn. */
	ready: boolean;
	snapshot(): Snapshot | undefined;
	/** Every character: key, mood, size, position, how high it is bouncing right now, and its role,
	 * pose and frame. */
	entities(): Entity[];
	/** Frame accounting since load (or since resetCounters). */
	counters(): { renders: number; animationFrames: number; tickerRunning: boolean; maxFPS: number };
	resetCounters(): void;
	/** Stop the clock: the ticker halts and nothing animates until unfreeze(). */
	freeze(): void;
	unfreeze(): void;
	/** Advance a frozen scene by n frames of 1/60 s each, then render once. */
	step(n?: number): void;
	/** Show a snapshot as if the watcher had sent it. */
	show(snapshot: Snapshot): void;
}

declare global {
	interface Window {
		__busybodies?: Inspector;
	}
}

export function installInspector(
	app: Application,
	office: InspectedScene,
	scene: { show(s: Snapshot): void; frozen: boolean; redraw(): void; current?: Snapshot },
): Inspector {
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
		snapshot: () => scene.current,
		entities: () => office.entities(),
		counters: () => ({ renders, animationFrames, tickerRunning: app.ticker.started, maxFPS: app.ticker.maxFPS }),
		resetCounters: () => {
			renders = 0;
			animationFrames = 0;
		},
		freeze: () => {
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
		show: (s) => scene.show(s),
	};
	window.__busybodies = inspector;
	return inspector;
}
