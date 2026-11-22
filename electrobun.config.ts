import type { ElectrobunConfig } from "electrobun";

// The release workflow sets these from the tag. Local builds keep package.json's version and
// look for updates on the latest published GitHub Release (see docs/decisions.md, "releases").
const version = process.env.BUSYBODIES_VERSION || "0.0.1";
const updateBaseUrl =
	process.env.BUSYBODIES_UPDATE_BASE_URL || "https://github.com/MrMint/busybodies/releases/latest/download";
// Signing and notarization switch on only when the release workflow has Apple credentials.
const codesign = process.env.BUSYBODIES_CODESIGN === "1";

export default {
	app: {
		name: "Busybodies",
		identifier: "app.busybodies",
		version,
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"assets/tray": "views/tray",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			icons: "assets/icon.iconset",
			codesign,
			notarize: codesign && process.env.BUSYBODIES_NOTARIZE === "1",
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
	runtime: {
		// Closing the office window leaves Busybodies in the menu bar; Quit is in the tray menu.
		exitOnLastWindowClosed: false,
	},
	release: {
		baseUrl: updateBaseUrl,
		// Full bundles only: a release is ~32 MB, and patches would add a second artifact per
		// previous version to upload and keep in step.
		generatePatch: false,
	},
} satisfies ElectrobunConfig;
