// The typed channel between the Bun process (which runs the watcher) and the scene in the webview.
import type { RPCSchema } from "electrobun/view";
import type { Snapshot } from "../watcher/model";

export type BusybodiesRPC = {
	/** What the Bun process answers. */
	bun: RPCSchema<{
		requests: {
			/** The current snapshot, for a scene that just loaded or reloaded. */
			snapshot: { params: undefined; response: Snapshot | null };
		};
		messages: {};
	}>;
	/** What the webview listens for. */
	webview: RPCSchema<{
		requests: {};
		messages: {
			/** Sent whenever the snapshot's content changes. */
			snapshot: Snapshot;
		};
	}>;
};
