import { BrowserView, BrowserWindow, Updater } from "electrobun/main";
import type { BusybodiesRPC } from "../shared/rpc";
import { Watcher } from "../watcher/watch";

const DEV_SERVER_URL = "http://localhost:5173";

/** In the dev channel, prefer Vite's dev server (hot reload) when it is running. */
async function mainViewUrl(): Promise<string> {
	if ((await Updater.localInfo.channel()) === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			return DEV_SERVER_URL;
		} catch {
			// No dev server: fall through to the bundled view.
		}
	}
	return "views://mainview/index.html";
}

const watcher = new Watcher();

const rpc = BrowserView.defineRPC<BusybodiesRPC>({
	handlers: {
		requests: {
			snapshot: () => watcher.snapshot ?? null,
		},
	},
});

new BrowserWindow({
	title: "Busybodies",
	url: await mainViewUrl(),
	frame: { width: 1280, height: 800, x: 120, y: 80 },
	rpc,
});

watcher.onChange((snapshot) => rpc.send.snapshot(snapshot));
await watcher.start();
