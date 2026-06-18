import type { ProductDb } from "@better-agent/db";
import * as schema from "@better-agent/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export interface AuthBindings {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
}

export interface CreateAuthOptions {
	db: ProductDb;
	env: AuthBindings;
}

export const createAuth = ({ db, env }: CreateAuthOptions) => {
	// In local dev BETTER_AUTH_URL is plain http (e.g. http://localhost:3000), where
	// browsers refuse to persist `secure` / `sameSite: "none"` cookies — so the session
	// silently disappears and protected requests start 401ing. Only harden the cookie
	// when we're actually served over https (the deployed, cross-origin setup).
	const isSecureOrigin = env.BETTER_AUTH_URL.startsWith("https://");

	return betterAuth({
		advanced: {
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: isSecureOrigin ? "none" : "lax",
				secure: isSecureOrigin,
			},
		},
		basePath: "/api/auth",
		baseURL: env.BETTER_AUTH_URL,
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.CORS_ORIGIN],
	});
};
