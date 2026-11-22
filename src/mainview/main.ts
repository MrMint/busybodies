// The scene: listens for snapshots from the Bun process and draws them as an office. Rendering is
// on demand: the ticker runs only while someone is busy or the camera moves; otherwise the last
// frame just stays up.
import { Electroview } from "electrobun/view";
import { Application, Ticker } from "pixi.js";
import type { BusybodiesRPC } from "../shared/rpc";
import type { Snapshot } from "../watcher/model";
import { Office } from "../scene/office/office";
import { LAWN } from "../scene/office/paper";
import { installHud } from "./hud";
import { installInspector } from "./inspector";
import { placeholders } from "./placeholder";

const params = new URLSearchParams(location.search);

/** Profiling modes: ?blank draws nothing but still takes snapshots; ?blank&norpc does neither. */
function blank(): void {
	document.getElementById("stage")!.textContent = "blank scene (profiling)";
	if (params.has("norpc")) return;
	const rpc = Electroview.defineRPC<BusybodiesRPC>({ handlers: { messages: { snapshot: () => {} } } });
	new Electroview({ rpc });
}

(async () => {
	if (params.has("blank")) return blank();
	const app = new Application();
	await app.init({
		resizeTo: window,
		background: LAWN,
		antialias: true,
		autoDensity: true,
		resolution: window.devicePixelRatio,
		preference: "webgl",
		autoStart: false,
	});
	document.getElementById("stage")!.appendChild(app.canvas);

	// Pixi's global tickers each run a 60 fps requestAnimationFrame loop from load, even with the
	// app's own ticker stopped: an idle scene still cost ~4% in the webview and ~5% in the Bun
	// process that composites the window. Ticker.system serves only 'dynamic' hover (unused) and
	// Ticker.shared drives AnimatedSprite (not used yet: give it the app ticker when it is).
	for (const t of [Ticker.shared, Ticker.system]) {
		t.autoStart = false;
		t.stop();
	}

	const office = new Office({ renderer: app.renderer, characters: placeholders(app.renderer), wake: () => scene.redraw() });
	app.stage.addChild(office);

	// Ambient motion doesn't need the display's full rate (120 Hz on ProMotion screens). A camera
	// move must be smooth, so it gets 60 for as long as it lasts.
	const AMBIENT_FPS = 30;
	const MOVING_FPS = 60;
	app.ticker.maxFPS = AMBIENT_FPS;
	app.ticker.add((t) => {
		office.tick(t.deltaTime);
		app.ticker.maxFPS = office.moving ? MOVING_FPS : AMBIENT_FPS;
		if (!office.animating) app.ticker.stop();
	});

	const scene = {
		current: undefined as Snapshot | undefined,
		/** The clock is stopped and only the inspector's step() moves the scene. Set by the inspector,
		 * or from load with ?frozen (for deterministic screenshots: tools/shoot.ts). */
		frozen: params.has("frozen"),
		redraw() {
			if (office.animating && !scene.frozen) {
				if (office.moving) app.ticker.maxFPS = MOVING_FPS;
				if (!app.ticker.started) app.ticker.start();
			} else {
				app.render();
			}
		},
		show(snapshot: Snapshot) {
			scene.current = snapshot;
			office.show(snapshot, app.screen.width, app.screen.height);
			scene.redraw();
			hud.update(snapshot);
			if (inspector) inspector.ready = true;
			if (import.meta.env.DEV) {
				const count = (l: Snapshot["sessions"]): number => l.reduce((n, s) => n + 1 + count(s.children), 0);
				console.info(`[busybodies] drew ${count(snapshot.sessions)} sessions; animating: ${office.animating}`);
			}
		},
	};
	const show = scene.show;
	const redraw = scene.redraw;
	const inspector = import.meta.env.DEV || params.has("inspect") ? installInspector(app, office, scene) : undefined;
	const hud = installHud(office);

	// Click a room to zoom to it, then a desk; click outside the rooms for the whole office.
	app.stage.eventMode = "static";
	app.stage.hitArea = app.screen;
	app.stage.cursor = "zoom-in";
	app.stage.on("pointertap", (e) => office.click(e.global.x, e.global.y));

	app.renderer.on("resize", (w, h) => {
		office.layout(w, h);
		redraw();
	});

	if (params.has("demo")) {
		const { demo } = await import("./demo");
		const day = demo(params.get("demo"));
		for (const [id, sign] of Object.entries(day.signs)) office.setSign(id, sign);
		show(day.snapshot);
		return;
	}

	if (params.has("replay")) {
		// A recorded day from fixtures/ (tools/record.ts), played instead of the watcher.
		const [{ loadFixture, fixtureNames }, { parseRecording, replay }] = await Promise.all([import("./fixtures"), import("../watcher/replay")]);
		const text = await loadFixture(params.get("replay") ?? "");
		if (!text) throw new Error(`no fixture "${params.get("replay")}"; have: ${fixtureNames().join(", ")}`);
		replay(parseRecording(text), show, { speed: Number(params.get("speed") ?? 1), loop: params.has("loop") });
		return;
	}

	const rpc = Electroview.defineRPC<BusybodiesRPC>({
		handlers: { messages: { snapshot: show } },
	});
	new Electroview({ rpc });

	const first = await rpc.request.snapshot();
	if (first) show(first);
})();
