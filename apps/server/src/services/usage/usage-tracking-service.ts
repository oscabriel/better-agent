import {
	DEFAULT_DAILY_MESSAGE_LIMIT,
	DEFAULT_MONTHLY_MESSAGE_LIMIT,
	QuotaExceededError,
	type UsageSummary,
} from "@/server/domain/usage";
import {
	getDailyUsage,
	getDaysSinceEpoch,
	getMonthlyUsage,
	getUsageStats,
	recordUsage as recordUsageRepo,
} from "@/server/repositories/d1/usage-repository";

export class UsageTrackingService {
	async getCurrentUsageSummary(userId: string): Promise<UsageSummary> {
		const now = new Date();
		const today = getDaysSinceEpoch(now);
		const todayUsage = await getDailyUsage(userId, today);
		const dailyUsed = todayUsage?.messagesCount ?? 0;

		const monthlyUsed = await getMonthlyUsage(userId);

		const dailyLimit = DEFAULT_DAILY_MESSAGE_LIMIT;
		const monthlyLimit = DEFAULT_MONTHLY_MESSAGE_LIMIT;

		return {
			daily: {
				used: dailyUsed,
				limit: dailyLimit,
				remaining: Math.max(dailyLimit - dailyUsed, 0),
				allowed: dailyUsed < dailyLimit,
			},
			monthly: {
				used: monthlyUsed,
				limit: monthlyLimit,
				remaining: Math.max(monthlyLimit - monthlyUsed, 0),
				allowed: monthlyUsed < monthlyLimit,
			},
		};
	}

	async requireAvailableQuota(
		userId: string,
		provider: string,
		userApiKeys: Record<string, string>,
	) {
		if (userApiKeys[provider]) {
			return; // Unlimited usage with BYOK
		}

		const summary = await this.getCurrentUsageSummary(userId);
		if (!summary.daily.allowed) {
			throw new QuotaExceededError("daily");
		}
		if (!summary.monthly.allowed) {
			throw new QuotaExceededError("monthly");
		}
	}

	async recordUsage(
		userId: string,
		params: {
			modelId: string;
			usage?: {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
				reasoningTokens?: number;
			};
			cost?: number;
			conversationId: string;
		},
	) {
		await recordUsageRepo(userId, params);
	}

	async getUsageStats(userId: string, startDate?: string, endDate?: string) {
		return await getUsageStats(userId, startDate, endDate);
	}
}
