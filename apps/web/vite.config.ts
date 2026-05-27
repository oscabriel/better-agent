import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig } from "vite";

const alchemyConfigPath = fileURLToPath(new URL(".alchemy/local/wrangler.jsonc", import.meta.url));
const shouldUseAlchemy = existsSync(alchemyConfigPath);
const cloudflareWorkersShimPath = fileURLToPath(
	new URL("../../packages/env/src/cloudflare-local.ts", import.meta.url),
);
const cloudflareWorkersAlias = shouldUseAlchemy
	? {}
	: {
			"cloudflare:workers": cloudflareWorkersShimPath,
		};

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		...(shouldUseAlchemy ? [alchemy({ configPath: alchemyConfigPath })] : []),
	],
	resolve: {
		alias: cloudflareWorkersAlias,
		tsconfigPaths: true,
	},
	server: {
		port: 3001,
	},
});
