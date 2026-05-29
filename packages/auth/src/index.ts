import { createDb } from "@better-agent/db";
import type { ProductDb } from "@better-agent/db";
import * as schema from "@better-agent/db/schema/auth";
import { env as serverEnv } from "@better-agent/env/server";
import type { CloudflareEnv } from "@better-agent/env/types";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

type AuthEnv = Pick<CloudflareEnv, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "CORS_ORIGIN">;

export interface CreateAuthOptions {
	db?: ProductDb;
	env?: AuthEnv;
}

export const createAuth = (options: CreateAuthOptions = {}) => {
	const bindings = options.env ?? serverEnv;
	const db = options.db ?? createDb();

	return betterAuth({
		advanced: {
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: "none",
				secure: true,
			},
		},
		baseURL: bindings.BETTER_AUTH_URL,
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
		secret: bindings.BETTER_AUTH_SECRET,
		trustedOrigins: [bindings.CORS_ORIGIN],
	});
};
