// window.__busybodies: the scene, readable and steerable as data. Agents (and tests) use it to check
// scene work through the browser pane or headless Chrome without reading pixels. Installed in dev
// builds and whenever the URL has ?inspect.
import type { Application } from "pixi.js";
import type { Stop } from "../scene/office/camera";
import type { Office } from "../scene/office/office";
import type { SignText } from "../scene/office/paper";
import type { Snapshot } from "../watcher/model";

export interface Inspector {
	/** True once the first snapshot has been drawn. */
	ready: boolean;
	snapshot(): Snapshot | undefined;
	/** Every character: key, mood, size, position and how high it is bouncing right now. */
	entities(): ReturnType<Office["entities"]>;
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
	/** The office as data: every area (rect, desks, fixtures, wall slots) and every desk's slot. */
	layout(): ReturnType<typeof summarise> | undefined;
	/** Where the camera is, and how sharp static layers are baked. */
	camera(): { stop: Stop; scale: number; x: number; y: number; moving: boolean; bake: number };
	/** Move the camera to a stop. `animate: false` jumps there (for screenshots). */
	goTo(stop: Stop, animate?: boolean): void;
	/** Every named sign slot, with its text. */
	signs(): ReturnType<Office["signs"]>;
	setSign(id: string, text: SignText | undefined): void;
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
		layout: () => summarise(office),
		camera: () => ({ stop: office.stop, ...office.view, moving: office.moving, bake: office.bakeResolution }),
		goTo: (stop, animate = true) => {
			office.goTo(stop, animate);
			scene.redraw();
		},
		signs: () => office.signs(),
		setSign: (id, text) => office.setSign(id, text),
	};
	window.__busybodies = inspector;
	return inspector;
}
