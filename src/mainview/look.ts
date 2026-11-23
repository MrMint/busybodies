// Looks as render passes (?look=, the settings cog, the tray's Look menu; ids in shared/look.ts).
//
// pixel: the office is drawn into a render texture at a quarter of the resolution, and that texture
// is the only thing on the stage, blown up with nearest filtering so the pixels stay crisp. The pass
// rides the app's own render: whenever the stage renders (a ticker frame, a redraw, the inspector's
// step) the office renders into the texture first, so the look costs no frames of its own and an
// idle or hidden office still draws nothing. The stage keeps its hit area and handlers, and the
// office's hit testing is geometry (office.hit), so clicks and camera moves work as before.
//
// night: the light layer's night phase (office/daylight.ts), held: the hour is pinned to the night
// whatever the clock says, as the inspector's setHour does. Leaving it gives the hour back to
// ?hour= or the clock.
import { type Application, type Container, type RenderOptions, RenderTexture, Sprite } from "pixi.js";
import type { Office } from "../scene/office/office";
import { type LookId, lookId } from "../shared/look";

/** One pixel of the pixel look, in CSS pixels: a quarter of the resolution across and down. */
export const PIXEL = 4;
/** The compact window is a quarter of the office's width: its pixels are half as big, or a mochi is a
 * handful of blocks. */
export const COMPACT_PIXEL = 2;
/** The hour the night look holds: the night phase (PHASE_START.night is 20). */
export const NIGHT_HOUR = 22;

export interface Looks {
	readonly current: LookId;
	set(id: LookId): void;
	/** For the inspector: the look, and the pixel pass's texture size in its own pixels. */
	info(): { look: LookId; pixel?: { width: number; height: number; resolution: number } };
}

export function installLooks(app: Application, office: Office, opts: { look: LookId; hour?: number; compact?: boolean; redraw(): void }): Looks {
	const size = opts.compact ? COMPACT_PIXEL : PIXEL;
	let look: LookId = "plain";
	let texture: RenderTexture | undefined;
	let sprite: Sprite | undefined;

	const renderer = app.renderer;
	const render = renderer.render.bind(renderer);
	// The pass: before the stage renders to the screen, the office renders into the small texture.
	renderer.render = ((...args: Parameters<typeof render>) => {
		const options = args[0] as Container | RenderOptions;
		const toScreen = options === app.stage || ("container" in options && options.container === app.stage && !options.target);
		if (look === "pixel" && texture && toScreen) {
			const { width, height } = app.screen;
			if (texture.width !== width || texture.height !== height) {
				texture.resize(width, height, 1 / size);
				sprite!.setSize(width, height);
			}
			render({ container: office, target: texture, clear: true, clearColor: renderer.background.colorRgba });
		}
		return render(...args);
	}) as typeof renderer.render;

	const pixel = (on: boolean) => {
		if (on && !texture) {
			const { width, height } = app.screen;
			texture = RenderTexture.create({ width, height, resolution: 1 / size, scaleMode: "nearest", antialias: false });
			sprite = new Sprite(texture);
			sprite.setSize(width, height);
			// The office leaves the stage: it is drawn into the texture, and only the texture is on screen.
			app.stage.removeChild(office);
			app.stage.addChild(sprite);
		} else if (!on && texture) {
			app.stage.removeChild(sprite!);
			app.stage.addChildAt(office, 0);
			sprite!.destroy();
			texture.destroy(true);
			sprite = undefined;
			texture = undefined;
		}
	};

	const apply = (id: LookId) => {
		id = lookId(id);
		if (id === look) return false;
		const was = look;
		look = id;
		pixel(id === "pixel");
		if (id === "night") office.setHour(NIGHT_HOUR);
		else if (was === "night") office.setHour(opts.hour);
		return true;
	};
	const looks: Looks = {
		get current() {
			return look;
		},
		set: (id) => void (apply(id) && opts.redraw()),
		info: () => ({ look, pixel: texture && { width: texture.source.pixelWidth, height: texture.source.pixelHeight, resolution: texture.source.resolution } }),
	};
	// The first look comes with the first draw, not a frame of its own.
	apply(opts.look);
	return looks;
}
