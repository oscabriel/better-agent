import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	deps: {
		alwaysBundle: [/@better-agent\/.*/u],
		neverBundle: ["cloudflare:workers"],
		onlyBundle: ["drizzle-orm"],
	},
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
});
