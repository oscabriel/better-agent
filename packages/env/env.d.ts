import type { CloudflareEnv } from "./src/types";

// This file declares the cloudflare:workers environment shape used by the app.
// Runtime bindings are configured in packages/infra/alchemy.run.ts.

declare global {
	type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		export interface Env extends CloudflareEnv {
			DB: CloudflareEnv["DB"];
		}
	}
}
