// Time of day, as data: which light phase the local hour falls in, when the next one starts, where
// the sun is (for shadows and the windows), the windows' glass and panes, and a rush room's
// flicker. Pixi-free, so it is unit-tested; office/light.ts and office/outlook.ts draw it. Five
// phases after design/boards/PaperNight and plan-alive stream C.
export type Phase = "morning" | "noon" | "afternoon" | "dusk" | "night";

export const PHASES: Phase[] = ["morning", "noon", "afternoon", "dusk", "night"];

/** The hour each phase starts (local time); night runs past midnight to the morning. */
export const PHASE_START: Record<Phase, number> = { morning: 6, noon: 10, afternoon: 15, dusk: 18, night: 20 };

/** The phase an hour (0 to 23, any number is wrapped) falls in. */
export function phaseOf(hour: number): Phase {
	const h = (((Math.floor(hour) % 24) + 24) % 24);
	if (h >= PHASE_START.night || h < PHASE_START.morning) return "night";
	if (h >= PHASE_START.dusk) return "dusk";
	if (h >= PHASE_START.afternoon) return "afternoon";
	if (h >= PHASE_START.noon) return "noon";
	return "morning";
}

/** Milliseconds from `now` until the next phase starts (on the hour, local time). */
export function msToNextPhase(now: Date): number {
	const phase = phaseOf(now.getHours());
	const next = new Date(now);
	next.setMinutes(0, 0, 0);
	do next.setHours(next.getHours() + 1);
	while (phaseOf(next.getHours()) === phase);
	return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * Where the light comes from in each phase: the direction shadows fall (a unit-ish vector in world
 * px, +x right, +y down the screen) and how far. Morning sun is low in the east (shadows fall
 * right), late afternoon low in the west (left), dusk lower still; at noon and at night shadows
 * sit almost under things (the sun overhead, then the lamps).
 */
export const SHADOW: Record<Phase, { x: number; y: number }> = {
	morning: { x: 6, y: 4 },
	noon: { x: 1.5, y: 4 },
	afternoon: { x: -6, y: 4 },
	dusk: { x: -8, y: 5 },
	night: { x: 0, y: 3 },
};

/** Light coming in through the windows as patches on the floor: their slant (x per y) and strength. */
export const SUNLIGHT: Record<Phase, { slant: number; alpha: number } | undefined> = {
	morning: { slant: 0.55, alpha: 0.2 },
	noon: undefined,
	afternoon: { slant: -0.55, alpha: 0.18 },
	dusk: undefined,
	night: undefined,
};

/** Desk lamps and overhead lights count from dusk on; by day they barely show. */
export const LAMPS_ON: Record<Phase, number> = { morning: 0.35, noon: 0, afternoon: 0.3, dusk: 0.85, night: 1 };

// --- Windows -------------------------------------------------------------------------------------

/** A theme's window, as the view out needs it (SceneLight.window). */
export interface WindowShape {
	window: { inset: number; height?: number; panes: number; transom: boolean; bar: number };
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The glass inside a window wall item's rect, for this theme. */
export function glassOf(r: Rect, light: WindowShape): Rect {
	const { inset, height } = light.window;
	const h = Math.min(r.h, height ?? r.h);
	return { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: h - inset * 2 };
}

/** The panes clouds drift across: the glass split by its bars (the top row, under a transom). */
export function panesOf(glass: Rect, light: WindowShape): Rect[] {
	const { panes, bar, transom } = light.window;
	const pw = (glass.w - bar * (panes - 1)) / panes;
	const h = transom ? (glass.h - bar) / 2 : glass.h;
	return Array.from({ length: panes }, (_, i) => ({ x: glass.x + i * (pw + bar), y: glass.y, w: pw, h }));
}

/** Where the sun (or the moon) shows: which window, by its wall rect's x, and the body's kind. */
export interface SunSpot {
	x: number;
	kind: "sun" | "moon" | "setting";
	/** Height in the glass, 0 top to 1 bottom. */
	at: number;
	/** Across the glass, 0 to 1. */
	across: number;
}

/** Pick the window the sun or moon shows in: low in the east window in the morning, the west in the
 * afternoon and at dusk, the moon high in a middle one at night. Noon's sun is overhead. */
export function sunSpot(windows: Rect[], phase: Phase): SunSpot | undefined {
	if (windows.length === 0 || phase === "noon") return undefined;
	const byX = [...windows].sort((a, b) => a.x - b.x);
	if (phase === "morning") return { x: byX[0]!.x, kind: "sun", at: 0.52, across: 0.3 };
	if (phase === "afternoon") return { x: byX[byX.length - 1]!.x, kind: "sun", at: 0.5, across: 0.7 };
	if (phase === "dusk") return { x: byX[byX.length - 1]!.x, kind: "setting", at: 0.8, across: 0.72 };
	return { x: byX[Math.floor((byX.length - 1) / 2)]!.x, kind: "moon", at: 0.3, across: 0.28 };
}

// --- Rush ----------------------------------------------------------------------------------------

/**
 * A rush room's light: mostly steady, with a stutter now and then (a dip, a catch, a deeper dip),
 * each room on its own beat. How dark the room goes at `t` ms, 0 to ~0.4. Pure, so stepping a
 * frozen scene gives the same flicker every time.
 */
export function flicker(t: number, seed: number): number {
	const period = 2600 + (seed % 7) * 230;
	const u = (t + (seed % 997) * 13) % period;
	if (u < 70) return 0.34;
	if (u < 140) return 0;
	if (u < 190) return 0.2;
	if (u < 260) return 0;
	if (u < 330 && seed % 2 === 0) return 0.4;
	return 0;
}
