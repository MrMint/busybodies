// The scene: listens for snapshots from the Bun process and draws them as an office. Rendering is
// on demand: the ticker runs only while someone is busy; otherwise the last frame just stays up.
import { Electroview } from "electrobun/view";
import { Application } from "pixi.js";
import type { BusybodiesRPC } from "../shared/rpc";
import type { Snapshot } from "../watcher/model";
import { Office } from "./office";

(async () => {
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

	const office = new Office();
	app.stage.addChild(office);

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

	if (new URLSearchParams(location.search).has("demo")) {
		show((await import("./demo")).demoSnapshot);
		return;
	}

	const rpc = Electroview.defineRPC<BusybodiesRPC>({
		handlers: { messages: { snapshot: show } },
	});
	new Electroview({ rpc });

	const first = await rpc.request.snapshot();
	if (first) show(first);
})();
