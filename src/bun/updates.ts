import { Updater } from "electrobun/main";

/** How long to wait after launch before the first check, so startup stays quick. */
const FIRST_CHECK_MS = 30_000;
/** How often to look again while the app stays open. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Keeps the app current from GitHub Releases (`release.baseUrl` in electrobun.config.ts).
 *
 * It checks a little after launch and then every few hours. When a newer build is out, it
 * downloads it in the background and applies it, which restarts the app into the new version.
 * Busybodies only shows a scene, so a restart loses nothing. Dev builds never update, and
 * `BUSYBODIES_NO_UPDATE=1` turns updates off.
 */
export async function startUpdates(): Promise<void> {
	if (process.env.BUSYBODIES_NO_UPDATE === "1") return;
	const info = await Updater.getLocalInfo();
	if (info.channel === "dev" || !info.baseUrl || info.updateAuthority === "none") return;

	Updater.onStatusChange((entry) => {
		if (entry.status === "error") console.warn(`[busybodies] update: ${entry.message}`);
	});

	let busy = false;
	const check = async () => {
		if (busy) return;
		busy = true;
		try {
			const result = await Updater.checkForUpdate();
			if (result.error) {
				console.warn(`[busybodies] update check failed: ${result.error}`);
				return;
			}
			if (!result.updateAvailable) return;
			console.info(`[busybodies] updating ${info.version} → ${result.version}`);
			await Updater.downloadUpdate();
			if (Updater.updateInfo().updateReady) await Updater.applyUpdate();
		} catch (error) {
			console.warn(`[busybodies] update failed: ${error instanceof Error ? error.message : error}`);
		} finally {
			busy = false;
		}
	};

	setTimeout(check, FIRST_CHECK_MS);
	setInterval(check, CHECK_EVERY_MS);
}
