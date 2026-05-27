import { env as workerEnv } from "cloudflare:workers";

import type { CloudflareEnv } from "../env";

// For Cloudflare Workers, env is accessed via cloudflare:workers module.
// Types are defined in env.d.ts based on your alchemy.run.ts bindings.
export const env = workerEnv as CloudflareEnv;
