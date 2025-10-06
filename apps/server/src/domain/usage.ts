export const DEFAULT_DAILY_MESSAGE_LIMIT = 50;
export const DEFAULT_MONTHLY_MESSAGE_LIMIT = 500;

export type ModelUsageEntry = {
	messages: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
};

export interface UsageSummary {
	daily: {
		used: number;
		limit: number;
		remaining: number;
		allowed: boolean;
	};
	monthly: {
		used: number;
		limit: number;
		remaining: number;
		allowed: boolean;
	};
}

export class QuotaExceededError extends Error {
	constructor(readonly limitType: "daily" | "monthly") {
		super(
			limitType === "daily"
				? "Daily message limit reached"
				: "Monthly message limit reached",
		);
		this.name = "QuotaExceededError";
	}
}
