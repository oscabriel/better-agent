import type { Context, Next } from "hono";
import { getCurrentUsageSummary } from "@/server/features/usage/handlers";
import { requireUserId, UnauthorizedError } from "./auth-guards";

/**
 * Rate limiting middleware for AI endpoints
 * Checks user's daily and monthly message quotas before allowing requests
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
	try {
		const userId = await requireUserId(c);
		const usage = await getCurrentUsageSummary(userId);

		if (!usage.daily.allowed || !usage.monthly.allowed) {
			return c.json(
				{
					error:
						usage.daily.allowed && !usage.monthly.allowed
							? "Monthly message limit reached"
							: "Daily message limit reached",
					dailyUsed: usage.daily.used,
					monthlyUsed: usage.monthly.used,
				},
				429, // Too Many Requests
			);
		}

		c.set("rateLimitInfo", {
			dailyUsed: usage.daily.used,
			monthlyUsed: usage.monthly.used,
		});

		await next();
	} catch (err) {
		if (err instanceof UnauthorizedError) {
			return c.json({ error: "Authentication required" }, 401);
		}
		throw err;
	}
}
