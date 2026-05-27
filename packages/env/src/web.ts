import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

interface ImportMetaWithEnv extends ImportMeta {
	env: Record<string, string | boolean | undefined>;
}

export const env = createEnv({
	client: {
		VITE_SERVER_URL: z.url(),
	},
	clientPrefix: "VITE_",
	emptyStringAsUndefined: true,
	runtimeEnv: (import.meta as ImportMetaWithEnv).env,
});
