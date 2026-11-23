// The way out. Every quit path (the tray's Quit, ⌘Q and the app menu's Quit, the Dock's Quit,
// logging out, SIGTERM and SIGINT) ends in Electrobun's quit(), which emits "before-quit" and then
// has the native side exit the process. The steps here run from that event, once, in order, each on
// its own: one that throws never stops the rest (the diary must be saved even if the watcher's
// stop fails). The process "exit" event runs them too, as a backstop for an exit that skipped
// before-quit (an uncaught exception, say); by then they have usually run and it does nothing.

export interface Shutdown {
	/** Add a step, run in the order added. */
	add(name: string, step: () => void): void;
	/** Run every step (only the first call does anything). True if it ran now. */
	run(why: string): boolean;
	readonly done: boolean;
}

export function shutdown(log: (line: string) => void = (l) => console.info(l)): Shutdown {
	const steps: { name: string; step: () => void }[] = [];
	let done = false;
	return {
		add(name, step) {
			steps.push({ name, step });
		},
		run(why) {
			if (done) return false;
			done = true;
			const t0 = performance.now();
			const failed: string[] = [];
			for (const { name, step } of steps) {
				try {
					step();
				} catch (e) {
					failed.push(`${name} (${e instanceof Error ? e.message : e})`);
				}
			}
			const ms = (performance.now() - t0).toFixed(1);
			log(`[busybodies] shut down (${why}) in ${ms} ms${failed.length ? `; failed: ${failed.join(", ")}` : ""}`);
			return true;
		},
		get done() {
			return done;
		},
	};
}
