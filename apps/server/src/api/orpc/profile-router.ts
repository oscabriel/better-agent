import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/server/infra/auth";
import { user } from "@/server/infra/db/schema/auth";
import { protectedProcedure } from "@/server/lib/orpc";

export const profileRouter = {
	getProfile: protectedProcedure.handler(async ({ context }) => {
		return await context.db
			.select()
			.from(user)
			.where(eq(user.id, context.session.user.id))
			.get();
	}),

	updateProfile: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				image: z.string().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			return await context.db
				.update(user)
				.set({
					name: input.name,
					image: input.image,
					updatedAt: new Date(),
				})
				.where(eq(user.id, context.session.user.id))
				.returning()
				.get();
		}),

	listSessions: protectedProcedure.handler(async ({ context }) => {
		try {
			const sessions = await auth.api.listSessions({
				headers: context.headers,
			});

			return Array.isArray(sessions) ? sessions : [];
		} catch (error) {
			console.error("Error listing sessions:", error);
			return [];
		}
	}),

	revokeSession: protectedProcedure
		.input(z.object({ token: z.string() }))
		.handler(async ({ context, input }) => {
			try {
				const result = await auth.api.revokeSession({
					headers: context.headers,
					body: { token: input.token },
				});

				if (!result) {
					throw new Error("Failed to revoke session");
				}

				return { success: true };
			} catch (error) {
				console.error("Error revoking session:", error);
				throw new Error("Failed to revoke session");
			}
		}),

	getInitials: protectedProcedure
		.input(
			z.object({
				name: z.string().nullable(),
				email: z.string(),
			}),
		)
		.handler(async ({ input }) => {
			if (input.name) {
				return input.name
					.split(" ")
					.map((part) => part.charAt(0))
					.join("")
					.toUpperCase()
					.slice(0, 2);
			}
			return input.email.charAt(0).toUpperCase();
		}),

	getDeviceInfo: protectedProcedure
		.input(
			z.object({
				userAgent: z.string().nullable(),
			}),
		)
		.handler(async ({ input }) => {
			if (!input.userAgent) return "Unknown Device";

			let browser = "Unknown Browser";
			let os = "Unknown OS";

			if (input.userAgent.includes("Chrome")) browser = "Chrome";
			else if (input.userAgent.includes("Firefox")) browser = "Firefox";
			else if (input.userAgent.includes("Safari")) browser = "Safari";
			else if (input.userAgent.includes("Edge")) browser = "Edge";

			if (input.userAgent.includes("Windows")) os = "Windows";
			else if (
				input.userAgent.includes("iPhone") ||
				input.userAgent.includes("iPad") ||
				input.userAgent.includes("iPod")
			)
				os = "iOS";
			else if (input.userAgent.includes("Android")) os = "Android";
			else if (input.userAgent.includes("Mac")) os = "macOS";
			else if (input.userAgent.includes("Linux")) os = "Linux";

			return `${browser}, ${os}`;
		}),
} as const;
