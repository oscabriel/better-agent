import { defineConfig } from "drizzle-kit";

import {
	getDrizzleD1Mode,
	loadDrizzleEnv,
	resolveLocalD1DatabaseUrl,
	resolveRemoteD1DatabaseCredentials,
} from "./src/utils";

loadDrizzleEnv();

const baseConfig = {
	dialect: "sqlite",
	out: "./src/migrations",
	schema: "./src/schema/index.ts",
} as const;

const drizzleConfig = () => {
	const mode = getDrizzleD1Mode();

	if (mode === "local") {
		return {
			...baseConfig,
			dbCredentials: {
				url: resolveLocalD1DatabaseUrl(),
			},
		};
	}

	if (mode === "remote") {
		return {
			...baseConfig,
			dbCredentials: resolveRemoteD1DatabaseCredentials(),
			driver: "d1-http" as const,
		};
	}

	return baseConfig;
};

export default defineConfig(drizzleConfig());
