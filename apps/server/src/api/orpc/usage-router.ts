import { z } from "zod";
import { protectedProcedure } from "@/server/lib/orpc";
import { UsageTrackingService } from "@/server/services/usage/usage-tracking-service";

export const usageRouter = {
	getCurrentSummary: protectedProcedure.handler(async ({ context }) => {
		const service = new UsageTrackingService();
		return await service.getCurrentUsageSummary(context.session.user.id);
	}),

	getStats: protectedProcedure
		.input(
			z.object({
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const service = new UsageTrackingService();
			return await service.getUsageStats(
				context.session.user.id,
				input.startDate,
				input.endDate,
			);
		}),
} as const;
