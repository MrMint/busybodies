// The scene: listens for snapshots from the Bun process and draws them as an office. Rendering is
// on demand: the ticker runs while someone acts, walks or the camera moves, and at a lower rate
// while the cast only blinks and glances (life). Off screen it draws nothing at all; in calm mode
// (?calm, or the system's reduced motion) there is no life, so a quiet office draws nothing either.
import { Electroview } from "electrobun/view";
import { Application, Ticker } from "pixi.js";
import type { BusybodiesRPC } from "../shared/rpc";
import type { Snapshot } from "../watcher/model";
import { Office } from "../scene/office/office";
import { type ThemeId, sceneTheme, themeId } from "../scene/theme";
import { TILES_H, installHud } from "./hud";
import { type Camerawork, installCamerawork } from "./shots";
import { installInspector } from "./inspector";
import { watchVisibility } from "./visibility";
import { Sound } from "./sound";
import { type Bridge, installShell } from "./shell";
import { placeholders } from "./placeholder";
import { Atlas, buildPoseSheet, rigCharacters, rigTheme } from "../scene/rig";
import { Director, NOTICE, placeholderVoice } from "../scene/director";
import { Voice } from "../scene/sass";

const params = new URLSearchParams(location.search);
/** ?compact: the small floating window (transparent, always on top; src/bun/compact.ts). */
const compact = params.has("compact");
/** The camera cuts to what just happened (mainview/shots.ts): always in compact; in the full
 * office only with ?follow (off by default there: the person drives that camera). */
const follow = compact || params.has("follow");
/** ?theme=factory: which world the cast works in (src/scene/theme/). The app passes the saved
 * choice the same way, and switches it live over RPC (the tray's Theme menu). */
let theme: ThemeId = themeId(params.get("theme"));
/** The office's light (src/scene/office/light.ts): ?hour=<0-23> pins the time of day (screenshots,
 * tests), the director's rush flickers a room's lights, and the compact window floats on the
 * desktop with no lawn round it. */
const lightOptions = (director: Director) => ({
	hour: params.get("hour") && Number.isFinite(Number(params.get("hour"))) ? Number(params.get("hour")) : undefined,
	rush: () => Object.keys(director.world?.rush ?? {}),
	outside: !compact,
});

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
	const stage = document.getElementById("stage")!;
	// Compact keeps a strip clear under the picture for the room tiles (hud.ts).
	if (compact) stage.style.bottom = `${TILES_H}px`;
	await app.init({
		resizeTo: compact ? stage : window,
		background: sceneTheme(theme).lawn,
		// The compact window is transparent: the office floats on the desktop.
		backgroundAlpha: compact ? 0 : 1,
		antialias: true,
		autoDensity: true,
		resolution: window.devicePixelRatio,
		preference: "webgl",
		autoStart: false,
	});
	stage.appendChild(app.canvas);

	// Pixi's global tickers each run a 60 fps requestAnimationFrame loop from load, even with the
	// app's own ticker stopped: an idle scene still cost ~4% in the webview and ~5% in the Bun
	// process that composites the window. Ticker.system serves only 'dynamic' hover (unused) and
	// Ticker.shared drives AnimatedSprite (not used yet: give it the app ticker when it is).
	for (const t of [Ticker.shared, Ticker.system]) {
		t.autoStart = false;
		t.stop();
	}

	// The rig's parts, painted once and baked into one texture (src/scene/rig/atlas.ts).
	let atlas = Atlas.build(app.renderer, rigTheme(theme));

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
	const charactersFor = (a: Atlas) => (params.has("placeholders") ? undefined : rigCharacters(a));
	// The director decides who stands where and in which pose; the office draws it.
	const director = new Director();
	const office = new Office({ renderer: app.renderer, characters, wake: () => scene.redraw(), cast: director.cast, builds: director.builds, metrics: director.metrics, top: compact ? 40 : 64, theme: sceneTheme(theme), ...lightOptions(director) });
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
	// move must be smooth (the whole view slides), so it gets 60 for as long as it lasts. Walks stay
	// at 30: a busy room has someone walking nearly all the time (trips, brick runs, rounds), and a
	// walker moves a few pixels a frame, which reads fine at 30.
	// Life alone (blinks, glances) gets less again: a blink is a couple of frames at 20.
	const AMBIENT_FPS = 30;
	const MOVING_FPS = 60;
	const LIFE_FPS = 20;
	const fps = () => (office.moving ? MOVING_FPS : office.acting ? AMBIENT_FPS : LIFE_FPS);
	app.ticker.maxFPS = AMBIENT_FPS;
	app.ticker.add((t) => {
		office.tick(t.deltaTime);
		app.ticker.maxFPS = fps();
		if (!office.animating || !visibility.visible) app.ticker.stop();
	});

	// Calm mode: no life, and no sound. From ?calm (the tray's Calm office, as saved; switched live
	// over RPC), or the system's "reduce motion" setting.
	const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	let calmOn = params.has("calm");
	const calm = () => calmOn || !!reduced?.matches;
	// Back on screen after a while away, the cast notices you (director/social.ts): the director
	// takes it as an input, like the voice takes the view. ?away=<ms> sets how long counts.
	const awayMs = params.has("away") ? Number(params.get("away")) : NOTICE.awayMs;
	let hiddenAt: number | undefined;
	const visibility = watchVisibility((visible) => {
		office.life = visible && !calm();
		sound?.update();
		if (!visible) {
			hiddenAt = performance.now();
			app.ticker.stop();
			return;
		}
		// Back on screen, a following camera starts over: it cuts to the most important thing.
		camerawork?.back();
		const away = hiddenAt === undefined ? 0 : performance.now() - hiddenAt;
		hiddenAt = undefined;
		if (away >= awayMs && !calm() && scene.current) director.view = { back: director.now };
		if (scene.current) scene.direct();
		else scene.redraw();
	});
	reduced?.addEventListener?.("change", () => {
		office.life = visibility.visible && !calm();
		sound?.update();
		// Life on or off changes how idle habits run: direct again, not just redraw.
		if (scene.current) scene.direct();
		else scene.redraw();
	});
	// Sound (src/mainview/sound.ts): from ?sound (the tray's Sound, as saved). Only the full office
	// window plays it, so the compact one never doubles it.
	const sound = compact
		? undefined
		: new Sound({
				enabled: params.has("sound"),
				visible: () => visibility.visible,
				calm,
				theme: () => theme,
				floor: () => office.layoutData,
				view: () => office.view,
				stop: () => office.stop,
				width: () => app.screen.width,
			});
	director.on((events, world) => sound?.hear(events, world));
	/** The tray's Sound and Calm office toggles, live. */
	const setToggles = (change: { sound?: boolean; calm?: boolean }) => {
		if (change.calm !== undefined) calmOn = change.calm;
		office.life = visibility.visible && !calm();
		if (change.sound !== undefined) sound?.setEnabled(change.sound);
		else sound?.update();
		// Life on or off changes how idle habits run: direct again, not just redraw.
		if (scene.current) scene.direct();
		else scene.redraw();
	};

	const scene = {
		current: undefined as Snapshot | undefined,
		direct: () => {},
		/** The clock is stopped and only the inspector's step() moves the scene. Set by the inspector,
		 * or from load with ?frozen (for deterministic screenshots: tools/shoot.ts). */
		frozen: params.has("frozen"),
		/** Stops a scripted demo day: set while one plays. */
		stopDemo: undefined as (() => void) | undefined,
		redraw() {
			// Off screen nothing is drawn; coming back on screen redraws.
			if (!visibility.visible) return;
			if (office.animating && !scene.frozen) {
				app.ticker.maxFPS = fps();
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
	// Life starts with the scene: on when the window is on screen and the office isn't calm.
	office.life = visibility.visible && !calm();
	/** What the camera shows, for the voice: its scale, and the project whose room it is on. */
	const viewOf = () => {
		const stop = office.stop;
		const room = stop.kind === "room" && stop.id.startsWith("room:") ? stop.id.slice(5) : undefined;
		// Zooming into a room or a desk counts from the click, before the camera gets there.
		return { zoom: stop.kind === "office" ? office.view.scale : Math.max(office.view.scale, 1.5), room };
	};
	/** The following camera (compact, or ?follow): set once the top bar is up. */
	let camerawork: Camerawork | undefined;
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
		camerawork?.update(snap, director.now);
		scene.redraw();
		// The world changes on its own when an acted pose ends or a habit rotates: wake for it.
		// A timer, not frames, so an idle office still costs nothing in between.
		clearTimeout(wakeTimer);
		const wakes = [director.wake, voice?.nextWake(director.now), camerawork?.wake(director.now)].filter((t): t is number => t !== undefined);
		const at = wakes.length ? Math.min(...wakes) : undefined;
		if (at !== undefined && !scene.frozen) {
			wakeTimer = setTimeout(() => {
				director.now = at;
				direct();
			}, Math.max(0, at - director.now));
		}
	};
	Object.assign(scene, { direct });
	/** Switch theme without a reload: a new atlas for the rig's parts, the office redrawn in the new
	 * look, then the old atlas freed (its characters are gone by then). */
	const setTheme = (id: ThemeId) => {
		if (id === theme) return;
		theme = id;
		const old = atlas;
		atlas = Atlas.build(app.renderer, rigTheme(id));
		office.setTheme(sceneTheme(id), charactersFor(atlas));
		old.destroy();
		if (!compact) app.renderer.background.color = sceneTheme(id).lawn;
		sound?.themeChanged();
		direct();
		scene.redraw();
	};
	const show = scene.show;
	const redraw = scene.redraw;
	const inspector = import.meta.env.DEV || params.has("inspect") ? installInspector(app, office, scene, director, voice && { voice, now: () => director.now }, { current: () => theme, set: setTheme }, visibility) : undefined;
	if (inspector) Object.assign(inspector, { sound: () => sound?.state(), setToggles });
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
		pin: (area) => {
			camerawork?.pin(area);
			direct();
		},
	});
	if (follow) {
		camerawork = installCamerawork(office, director, { visible: () => visibility.visible, tiles: (t, shot) => hud.tiles(t, shot), redraw: () => scene.redraw() });
		inspector?.shots(camerawork);
	}
	if (params.has("about")) shell.about();

	// Click a room to zoom to it, then a desk; click outside the rooms for the whole office.
	app.stage.eventMode = "static";
	app.stage.hitArea = app.screen;
	app.stage.cursor = "zoom-in";
	app.stage.on("pointertap", (e) => {
		// Compact: a click on a room pins the camera there, like its tile; elsewhere it unpins.
		if (compact && camerawork) {
			camerawork.pin(office.hit(e.global.x, e.global.y).area?.id);
			return direct();
		}
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
		handlers: { messages: { snapshot: show, about: () => shell.about(), theme: ({ id }) => setTheme(themeId(id)), settings: (s) => setToggles(s) } },
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
