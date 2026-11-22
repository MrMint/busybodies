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
import { type Bridge, installShell } from "./shell";
import { placeholders } from "./placeholder";
import { Atlas, buildPoseSheet, paperTheme, rigCharacters } from "../scene/rig";
import { Director, placeholderVoice } from "../scene/director";
import { Voice } from "../scene/sass";

const params = new URLSearchParams(location.search);
/** ?compact: the small floating window (transparent, always on top; src/bun/compact.ts). */
const compact = params.has("compact");

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
		// The compact window is transparent: the office floats on the desktop.
		backgroundAlpha: compact ? 0 : 1,
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

	// The rig's parts, painted once and baked into one texture (src/scene/rig/atlas.ts).
	const atlas = Atlas.build(app.renderer, paperTheme());

	// ?sheet: every pose's frames, drawn once and left on screen (tools/pose-sheet.ts shoots it).
	if (params.has("sheet")) {
		const { sheet, width, height } = buildPoseSheet(atlas);
		app.resizeTo = undefined as unknown as HTMLElement;
		app.renderer.resize(width, height);
		app.stage.addChild(sheet);
		app.render();
		Object.assign(window, { __sheet: { width, height, ready: true } });
		return;
	}

	// Mochi characters from the rig; ?placeholders draws the old stand-ins (for A/B profiling).
	const characters = params.has("placeholders") ? placeholders(app.renderer) : rigCharacters(atlas);
	// The director decides who stands where and in which pose; the office draws it.
	const director = new Director();
	const office = new Office({ renderer: app.renderer, characters, wake: () => scene.redraw(), cast: director.cast, builds: director.builds, top: compact ? 40 : 64 });
	app.stage.addChild(office);
	// The office's voice (src/scene/sass): bubbles and signs from what the sessions are doing.
	// ?toolvoice keeps the director's placeholder (each busy lead says its tool). A live scene lets
	// the room settle a few seconds before the naps and waits start talking; a frozen one (tests,
	// screenshots) speaks at once; ?settle=<ms> sets it (the walk e2e keeps the voice out of its way).
	const settleMs = params.has("settle") ? Number(params.get("settle")) : params.has("frozen") ? 0 : 6_000;
	const voice = params.has("toolvoice") ? undefined : new Voice(office, { settleMs });
	director.on((events) => {
		for (const e of events) if (e.type === "leave") voice?.gone(e.key);
	});

	// Ambient motion doesn't need the display's full rate (120 Hz on ProMotion screens). A camera
	// move and a walk must be smooth, so they get 60 for as long as they last.
	const AMBIENT_FPS = 30;
	const MOVING_FPS = 60;
	app.ticker.maxFPS = AMBIENT_FPS;
	app.ticker.add((t) => {
		office.tick(t.deltaTime);
		app.ticker.maxFPS = office.moving || office.walking ? MOVING_FPS : AMBIENT_FPS;
		if (!office.animating) app.ticker.stop();
	});

	const scene = {
		current: undefined as Snapshot | undefined,
		direct: () => {},
		/** The clock is stopped and only the inspector's step() moves the scene. Set by the inspector,
		 * or from load with ?frozen (for deterministic screenshots: tools/shoot.ts). */
		frozen: params.has("frozen"),
		/** Stops a scripted demo day: set while one plays. */
		stopDemo: undefined as (() => void) | undefined,
		redraw() {
			if (office.animating && !scene.frozen) {
				if (office.moving || office.walking) app.ticker.maxFPS = MOVING_FPS;
				if (!app.ticker.started) app.ticker.start();
			} else {
				app.render();
			}
		},
		show(snapshot: Snapshot) {
			scene.current = snapshot;
			director.now = snapshot.at;
			scene.direct();
			hud.update(snapshot);
			shell.update(snapshot);
			if (inspector) inspector.ready = true;
			if (import.meta.env.DEV) {
				const count = (l: Snapshot["sessions"]): number => l.reduce((n, s) => n + 1 + count(s.children), 0);
				console.info(`[busybodies] drew ${count(snapshot.sessions)} sessions; animating: ${office.animating}`);
			}
		},
	};
	/** What the camera shows, for the voice: its scale, and the project whose room it is on. */
	const viewOf = () => {
		const stop = office.stop;
		const room = stop.kind === "room" && stop.id.startsWith("room:") ? stop.id.slice(5) : undefined;
		// Zooming into a room or a desk counts from the click, before the camera gets there.
		return { zoom: stop.kind === "office" ? office.view.scale : Math.max(office.view.scale, 1.5), room };
	};
	/** Direct the current snapshot at `director.now`, draw it, voice it, and book the next wake-up. */
	let wakeTimer: ReturnType<typeof setTimeout> | undefined;
	const direct = () => {
		const snap = scene.current;
		if (!snap) return;
		office.show(snap, app.screen.width, app.screen.height);
		const world = director.world;
		if (voice) voice.run(snap, director.now, viewOf());
		else if (world) placeholderVoice(world, snap, (k, t, kind) => office.say(k, t, kind), director.now);
		const waiting = director.waiting();
		office.pulse(waiting.map((w) => w.area));
		hud.waiting(waiting.length);
		scene.redraw();
		// The world changes on its own when an acted pose ends or a habit rotates: wake for it.
		// A timer, not frames, so an idle office still costs nothing in between.
		clearTimeout(wakeTimer);
		const wakes = [director.wake, voice?.nextWake(director.now)].filter((t): t is number => t !== undefined);
		const at = wakes.length ? Math.min(...wakes) : undefined;
		if (at !== undefined && !scene.frozen) {
			wakeTimer = setTimeout(() => {
				director.now = at;
				direct();
			}, Math.max(0, at - director.now));
		}
	};
	Object.assign(scene, { direct });
	const show = scene.show;
	const redraw = scene.redraw;
	const inspector = import.meta.env.DEV || params.has("inspect") ? installInspector(app, office, scene, director, voice && { voice, now: () => director.now }) : undefined;
	let bridge: Bridge | undefined;
	const shell = installShell({
		bridge: { status: () => bridge!.status(), setCompact: (on) => bridge?.setCompact(on), showOffice: () => bridge?.showOffice(), openProjectPage: () => bridge?.openProjectPage() },
		live: !params.has("demo") && !params.has("replay"),
		compact,
		// ?demo=nohome: the "no coding agent found" state, without a real home folder.
		status: params.get("demo") === "nohome" ? { homeFound: false, home: "~/.claude" } : undefined,
	});
	const hud = installHud(office, {
		compact,
		about: () => shell.about(),
		expand: () => bridge?.showOffice(),
		hide: () => bridge?.setCompact(false),
	});
	if (params.has("about")) shell.about();

	// Click a room to zoom to it, then a desk; click outside the rooms for the whole office.
	app.stage.eventMode = "static";
	app.stage.hitArea = app.screen;
	app.stage.cursor = "zoom-in";
	app.stage.on("pointertap", (e) => {
		office.click(e.global.x, e.global.y);
		// Zoomed into a room, the longer lines can show: let the voice look again.
		if (voice) direct();
	});

	app.renderer.on("resize", (w, h) => {
		office.layout(w, h);
		redraw();
	});

	if (params.has("demo")) {
		const { demo, demoDay, releaseDay } = await import("./demo");
		const name = params.get("demo");
		// ?demo=day-N: the demo day's first N beats, played at once (for screenshots of a beat).
		const beat = name?.match(/^day-(\d)$/);
		const day = demo(beat ? null : name);
		for (const [id, sign] of Object.entries(day.signs)) office.setSign(id, sign);
		show(day.snapshot);
		if (beat) for (const b of demoDay().slice(0, Number(beat[1]))) show(b.snapshot);
		// Plain ?demo plays the day through the director: arrivals, a review, a wait, departures.
		// ?demo=release plays the release crew's beats. Frozen scenes (tests, screenshots) stay on
		// their first moment.
		const days = { "": demoDay, release: releaseDay } as Record<string, (() => { after: number; snapshot: Snapshot }[]) | undefined>;
		const play = days[name ?? ""];
		if (play && !params.has("frozen")) {
			const timers = play().map(({ after, snapshot }) => setTimeout(() => !scene.frozen && show(snapshot), after));
			scene.stopDemo = () => timers.forEach(clearTimeout);
		}
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
		handlers: { messages: { snapshot: show, about: () => shell.about() } },
	});
	new Electroview({ rpc });
	bridge = {
		status: () => rpc.request.status(),
		setCompact: (on) => void rpc.request.setCompact({ on }),
		showOffice: () => void rpc.request.showOffice(),
		openProjectPage: () => void rpc.request.openProjectPage(),
	};

	const first = await rpc.request.snapshot();
	if (first) show(first);
})();
