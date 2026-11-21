// The scene: listens for snapshots from the Bun process and draws them as an office. Rendering is
// on demand: the ticker runs only while someone is busy; otherwise the last frame just stays up.
import { Electroview } from "electrobun/view";
import { Application, Ticker } from "pixi.js";
import type { BusybodiesRPC } from "../shared/rpc";
import type { Snapshot } from "../watcher/model";
import { Office } from "./office";

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
		background: 0xf6efe4,
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

	const office = new Office();
	app.stage.addChild(office);

	// Ambient motion doesn't need the display's full rate (120 Hz on ProMotion screens). Raise this
	// for a moment that must be smooth, such as a camera move.
	app.ticker.maxFPS = 30;
	app.ticker.add((t) => {
		office.tick(t.deltaTime);
		if (!office.animating) app.ticker.stop();
	});

	const redraw = () => {
		if (office.animating) {
			if (!app.ticker.started) app.ticker.start();
		} else {
			app.render();
		}
	};

	const show = (snapshot: Snapshot) => {
		office.show(snapshot, app.screen.width, app.screen.height);
		redraw();
		if (import.meta.env.DEV) {
			const count = (l: Snapshot["sessions"]): number => l.reduce((n, s) => n + 1 + count(s.children), 0);
			console.info(`[busybodies] drew ${count(snapshot.sessions)} sessions; animating: ${office.animating}`);
		}
	};

	app.renderer.on("resize", (w, h) => {
		office.layout(w, h);
		redraw();
	});

	if (params.has("demo")) {
		const { demoSnapshot, asleep } = await import("./demo");
		show(params.get("demo") === "idle" ? asleep(demoSnapshot) : demoSnapshot);
		return;
	}

	const rpc = Electroview.defineRPC<BusybodiesRPC>({
		handlers: { messages: { snapshot: show } },
	});
	new Electroview({ rpc });

	const first = await rpc.request.snapshot();
	if (first) show(first);
})();
