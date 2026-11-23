// @hutch cli=0.30.0 cottontail=0.7.3
export default {
	scripts: {
		install: ["hutch", "install", "--frozen-lockfile"],
		start: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev",
		dev: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch",
		"dev:hmr": ["hutch", "pm", "exec", "--", "concurrently", "hutch run hmr", "hutch run start"],
		hmr: "hutch electrobun prepare && hutch pm exec -- vite --port 5173",
		build: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable",
		// Lint (Biome) and dead code (knip). The formatter isn't enforced yet: see docs/architecture-review.md.
		lint: ["hutch", "pm", "exec", "--", "biome", "ci", "--formatter-enabled=false", "."],
		format: ["hutch", "pm", "exec", "--", "biome", "format", "--write", "."],
		knip: ["hutch", "pm", "exec", "--", "knip"],
		"build:canary": "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=canary",
	},
	electrobun: {
		version: "2.0.7",
	},
};
