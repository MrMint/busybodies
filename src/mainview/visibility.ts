// Is the scene on screen? WebKit reports a page hidden when its window is minimized, closed to the
// menu bar, on another Space, fully covered by other windows, or the screen is locked. While
// hidden the scene draws nothing at all (no ticker, no renders); while visible it may keep a low
// frame rate of life going (src/scene/rig/life.ts). Tests and the inspector can force either
// state, since headless Chrome is always "visible".

export interface Visibility {
	readonly visible: boolean;
	/** Pretend the page is hidden or visible (the inspector's setVisible); undefined goes back to
	 * what the browser says. */
	force(visible: boolean | undefined): void;
}

export function watchVisibility(onChange: (visible: boolean) => void): Visibility {
	let forced: boolean | undefined;
	const actual = () => document.visibilityState !== "hidden";
	let last = actual();
	const check = () => {
		const now = forced ?? actual();
		if (now === last) return;
		last = now;
		onChange(now);
	};
	document.addEventListener("visibilitychange", check);
	return {
		get visible() {
			return last;
		},
		force(visible) {
			forced = visible;
			check();
		},
	};
}
