import { fileURLToPath } from "node:url";

import { config } from "dotenv";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
config();

const runtimeEnv = typeof process === "undefined" ? {} : process.env;

export const env = new Proxy({} as Env, {
	get(_target, prop) {
		if (typeof prop !== "string") {
			return;
		}

		return runtimeEnv[prop];
	},
});
