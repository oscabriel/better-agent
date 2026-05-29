import { env as workerEnv } from "cloudflare:workers";

import type { CloudflareEnv } from "./types";

// For Cloudflare Workers, env is accessed via cloudflare:workers module.
// Bindings are configured in packages/infra/alchemy.run.ts.
export const env = workerEnv as CloudflareEnv;
