import { z } from "zod";
import { protectedProcedure } from "@/server/lib/orpc";
import { getCurrentUsageSummary, getUsageStats } from "./handlers";

export const usageRouter = {
	getCurrentSummary: protectedProcedure.handler(async ({ context }) => {
		return await getCurrentUsageSummary(context.session.user.id);
	}),

	getStats: protectedProcedure
		.input(
			z.object({
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			return await getUsageStats(
				context.session.user.id,
				input.startDate,
				input.endDate,
			);
		}),
} as const;
