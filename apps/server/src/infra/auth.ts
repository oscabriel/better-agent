import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { db } from "@/server/infra/db";
import * as schema from "@/server/infra/db/schema/auth";
import { renderVerificationCodeEmail } from "@/server/infra/email";
import { EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME } from "@/server/lib/constants";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN],
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	basePath: "/api/auth",
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		},
	},
	plugins: [
		emailOTP({
			async sendVerificationOTP({ email, otp, type }) {
				// In development, just log the OTP instead of sending email
				if (env.ALCHEMY_STAGE === "dev") {
					console.log(`🔑 Verification code for ${email}: ${otp}`);
					return;
				}
				if (type === "sign-in") {
					const resend = new Resend(env.RESEND_API_KEY);
					const emailHtml = await renderVerificationCodeEmail(otp);
					await resend.emails.send({
						from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
						to: email,
						subject: "Your Verification Code",
						html: emailHtml,
					});
				}
			},
		}),
	],
	secondaryStorage: {
		get: async (key) => {
			const value = await env.SESSION_KV.get(key);
			return value;
		},
		set: async (key, value, ttl) => {
			if (ttl) {
				await env.SESSION_KV.put(key, value, { expirationTtl: ttl });
			} else {
				await env.SESSION_KV.put(key, value);
			}
		},
		delete: async (key) => {
			await env.SESSION_KV.delete(key);
		},
	},
	rateLimit: {
		storage: "secondary-storage",
	},
	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: true,
			httpOnly: true,
		},
	},
});
