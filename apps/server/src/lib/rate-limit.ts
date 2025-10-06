import type { Context, Next } from "hono";
import {
	requireUserId,
	UnauthorizedError,
} from "@/server/services/auth/session-guard";
import { UsageTrackingService } from "@/server/services/usage/usage-tracking-service";

/**
 * Rate limiting middleware for AI endpoints
 * Checks user's daily and monthly message quotas before allowing requests
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
	try {
		const userId = await requireUserId(c);
		const usageService = new UsageTrackingService();
		const usage = await usageService.getCurrentUsageSummary(userId);

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
