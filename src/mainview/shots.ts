// Compact mode's camera operator: feeds the director's events, each room's heat and who is waiting
// into the pure shot picker (src/scene/director/shots.ts), and moves the camera only when the shot's
// stop changes, so between cuts it costs no frames. Off screen it collects news but never cuts;
// back on screen it starts over and cuts straight to the most important thing. A pinned room holds
// the camera until unpinned.
import type { Director } from "../scene/director";
import { type News, type ShotState, SHOTS, type Tile, newsFrom, nextShot, scoreByArea, shotWake, tilesFor } from "../scene/director/shots";
import { type Stop, sameStop } from "../scene/world/camera";
import type { Office } from "../scene/office/office";
import type { AreaKind } from "../scene/world/world";
import { type ThemeWords, areaLabel } from "../scene/theme/words";
import type { Snapshot } from "../watcher/model";

export interface ShotReport {
	stop: Stop;
	area?: string;
	reason: string;
	since: number;
	until: number | null;
	pinned: boolean;
	news?: string;
	/** Cuts made since load: each one a camera move. */
	cuts: number;
	tiles: Tile[];
}

export interface Camerawork {
	/** Pick the shot for this moment and cut if its stop changed. Call after each direction. */
	update(snapshot: Snapshot, now: number): void;
	/** When the shot changes on its own (a hold ends), for the app's wake-up timer. */
	wake(now: number): number | undefined;
	/** Pin the camera on a room; undefined unpins. Takes effect on the next update (direct again). */
	pin(area: string | undefined): void;
	/** Back on screen: the next update starts over. */
	back(): void;
	report(): ShotReport | undefined;
}

/** The areas as the compact strip names them: in the theme's words, not always the office's. */
export const tileAreas = (areas: readonly { id: string; kind: AreaKind; name: string }[], words: ThemeWords) =>
	areas.map((a) => ({ id: a.id, kind: a.kind, name: areaLabel(a, words) }));

export function installCamerawork(
	office: Office,
	director: Director,
	opts: { visible(): boolean; tiles(tiles: Tile[], shot: ShotState["shot"]): void; redraw(): void },
): Camerawork {
	let news: News[] = [];
	let state: ShotState | undefined;
	let pinned: string | undefined;
	let fresh = true;
	let cuts = 0;
	let tiles: Tile[] = [];

	const areaOf = (session: string) => office.layoutData?.desks.get(session)?.areaId;
	const yours = () => office.layoutData?.areas.find((a) => a.kind === "yours")?.id;
	director.on((events, world) => {
		news.push(...newsFrom(events, world, areaOf, yours()));
		const newest = news.reduce((t, n) => Math.max(t, n.at), 0);
		news = news.filter((n) => newest - n.at <= SHOTS.freshMs).slice(-100);
	});

	const update = (snapshot: Snapshot, now: number) => {
		const floor = office.layoutData;
		if (!floor) return;
		const world = director.world;
		const score = scoreByArea(snapshot.sessions, world?.builds ?? {}, areaOf, now);
		const waits = director.waiting();
		const waitAreas = new Set(waits.map((w) => w.area));
		const mine = yours();
		if (waits.length && mine) waitAreas.add(mine);
		const rush = new Set(
			Object.keys(world?.rush ?? {})
				.map(areaOf)
				.filter((a): a is string => !!a),
		);
		const areas = tileAreas(floor.areas, office.theme.words);
		if (pinned !== undefined && !areas.some((a) => a.id === pinned)) pinned = undefined;
		tiles = tilesFor(areas, score, rush, waitAreas);
		// Off screen: keep the news, cut nothing.
		if (!opts.visible()) return;
		const was = state;
		const restart = fresh;
		state = nextShot(restart ? undefined : was, { now, news, areas, score, waiting: waits.length > 0, pinned, fresh: restart });
		fresh = false;
		// Cut only when the shot's stop changes (or on starting over): a key press (n, →) holds until
		// the next cut. The first shot is a jump: the window opens on it.
		const changed = restart || !was || !sameStop(was.shot.stop, state.shot.stop);
		if (changed && !sameStop(office.stop, state.shot.stop)) {
			office.goTo(state.shot.stop, !!was);
			if (was) cuts++;
			opts.redraw();
		}
		opts.tiles(tiles, state.shot);
	};

	return {
		update,
		wake: (now) => shotWake(state, now),
		pin(area) {
			if (area === pinned) return;
			pinned = area;
			// Unpinning starts over: the camera goes to what matters now (on the next update).
			if (area === undefined) fresh = true;
		},
		back() {
			fresh = true;
		},
		report: () =>
			state && {
				stop: state.shot.stop,
				...(state.shot.area ? { area: state.shot.area } : {}),
				reason: state.shot.reason,
				since: state.shot.since,
				until: Number.isFinite(state.shot.until) ? state.shot.until : null,
				pinned: state.shot.pinned,
				...(state.shot.news ? { news: state.shot.news } : {}),
				cuts,
				tiles,
			},
	};
}
