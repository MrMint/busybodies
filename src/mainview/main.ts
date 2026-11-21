// Placeholder scene: proves PixiJS boots inside the Electrobun webview and that the frame loop
// stops when nothing moves. Click a busybody to toggle it between busy (bouncing) and idle (still).
// The real scene, rig and theme system replace this; see docs/decisions.md.
import { Application, Container, Graphics } from "pixi.js";

const INK = 0x2b2340;
const COLOURS = [0xff8fab, 0x8fd3ff, 0xffd166];

type Busybody = { view: Container; busy: boolean; phase: number };

function drawBusybody(colour: number): Container {
	const view = new Container();
	const body = new Graphics().roundRect(-40, -90, 80, 90, 36).fill(colour).stroke({ width: 4, color: INK });
	const eyes = new Graphics().circle(-14, -58, 6).circle(14, -58, 6).fill(INK);
	const mouth = new Graphics().arc(0, -42, 10, 0.2, Math.PI - 0.2).stroke({ width: 4, color: INK });
	view.addChild(body, eyes, mouth);
	view.eventMode = "static";
	view.cursor = "pointer";
	return view;
}

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

	const wake = () => {
		if (!app.ticker.started) app.ticker.start();
	};

	const crowd: Busybody[] = COLOURS.map((colour, i) => {
		const bb = { view: drawBusybody(colour), busy: i === 0, phase: i * 1.3 };
		app.stage.addChild(bb.view);
		bb.view.on("pointertap", () => {
			bb.busy = !bb.busy;
			wake();
		});
		return bb;
	});

	const layout = (w: number, h: number) =>
		crowd.forEach((bb, i) => bb.view.position.set((w * (i + 1)) / (crowd.length + 1), h * 0.6));
	app.renderer.on("resize", (w, h) => {
		layout(w, h);
		app.render();
	});
	layout(app.screen.width, app.screen.height);

	// Render on demand: the ticker runs only while someone is busy, and the last frame it
	// draws has every idle busybody at rest.
	app.ticker.add((t) => {
		for (const bb of crowd) {
			bb.phase += 0.12 * t.deltaTime;
			const bounce = bb.busy ? Math.abs(Math.sin(bb.phase)) : 0;
			bb.view.pivot.y = bounce * 18;
			bb.view.scale.set(1 + bounce * 0.04, 1 - bounce * 0.04);
		}
		if (!crowd.some((bb) => bb.busy)) app.ticker.stop();
	});

	app.render();
	if (crowd.some((bb) => bb.busy)) wake();
})();
