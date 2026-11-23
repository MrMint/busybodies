// The typed channel between the Bun process (which runs the watcher) and the scene in the webview.
// Both windows (the full office and the compact one) speak it.
import type { RPCSchema } from "electrobun/view";
import type { Snapshot } from "../watcher/model";
import type { Diary } from "./diary";

/** What the app knows about itself and where it looks, for the About screen and empty states. */
export interface AppStatus {
	version: string;
	/** The agent tool's folder the watcher reads. */
	home: string;
	/** False when that folder doesn't exist: no coding agent found. */
	homeFound: boolean;
	compact: boolean;
	/** The saved scene theme. */
	theme?: string;
}

export type BusybodiesRPC = {
	/** What the Bun process answers. */
	bun: RPCSchema<{
		requests: {
			/** The current snapshot, for a scene that just loaded or reloaded. */
			snapshot: { params: undefined; response: Snapshot | null };
			status: { params: undefined; response: AppStatus };
			/** Switch the compact floating window on or off. */
			setCompact: { params: { on: boolean }; response: boolean };
			/** Bring the full office forward (and leave compact mode). */
			showOffice: { params: undefined; response: boolean };
			/** Open the project's page in the browser. Only the project's own URL is allowed. */
			openProjectPage: { params: undefined; response: boolean };
			/** Pick the scene theme (from the settings cog): saved, and both windows switch. */
			setTheme: { params: { id: string }; response: boolean };
			/** Sound and calm office (from the settings sheet): saved, the tray updates, both windows hear. */
			setToggles: { params: { sound?: boolean; calm?: boolean }; response: boolean };
			/** The office's diary (counts and kinds only: src/shared/diary.ts), for a scene that just loaded. */
			diary: { params: undefined; response: Diary | null };
		};
		messages: {};
	}>;
	/** What the webview listens for. */
	webview: RPCSchema<{
		requests: {};
		messages: {
			/** Sent whenever the snapshot's content changes. */
			snapshot: Snapshot;
			/** Show the About screen (from the tray menu). */
			about: undefined;
			/** Switch the scene theme (from the tray's Theme menu or the settings cog): `office` or `factory`. */
			theme: { id: string };
			/** The tray's Sound and Calm office toggles, as saved. Only the full office window plays sound. */
			settings: { sound: boolean; calm: boolean };
			/** The office's diary, whenever it changes (counts and kinds only: src/shared/diary.ts). */
			diary: Diary;
		};
	}>;
};
