import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { usageEvents } from "@/server/db/d1/schema/usage";
import type { ModelUsageEntry } from "./types";

type UsageRecord = typeof usageEvents.$inferSelect;

function parseModelUsage(value: unknown): Record<string, ModelUsageEntry> {
	if (value == null) return {};

	let raw: unknown = value;
	if (typeof value === "string" && value.length > 0) {
		try {
			raw = JSON.parse(value);
		} catch (error) {
			console.error("failed to parse model usage json", { value, error });
			return {};
		}
	}

	if (!raw || typeof raw !== "object") {
		return {};
	}

	const result: Record<string, ModelUsageEntry> = {};
	for (const [modelId, entry] of Object.entries(
		raw as Record<string, unknown>,
	)) {
		if (entry && typeof entry === "object") {
			const messages = Number((entry as { messages?: unknown }).messages ?? 0);
			const inputTokens = Number(
				(entry as { inputTokens?: unknown }).inputTokens ?? 0,
			);
			const outputTokens = Number(
				(entry as { outputTokens?: unknown }).outputTokens ?? 0,
			);
			const reasoningTokens = Number(
				(entry as { reasoningTokens?: unknown }).reasoningTokens ?? 0,
			);

			result[modelId] = {
				messages: Number.isFinite(messages) ? messages : 0,
				inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
				outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
				reasoningTokens: Number.isFinite(reasoningTokens) ? reasoningTokens : 0,
			};
		} else {
			const numericValue = Number(entry);
			result[modelId] = {
				messages: Number.isFinite(numericValue) ? numericValue : 0,
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
			};
		}
	}

	return result;
}

export function getDaysSinceEpoch(date: Date = new Date()): number {
	return Math.floor(date.getTime() / 86400000);
}

export function dateFromDaysSinceEpoch(days: number): Date {
	return new Date(days * 86400000);
}

export async function getDailyUsage(
	userId: string,
	daysSinceEpoch: number,
): Promise<UsageRecord | null> {
	const result = await db
		.select()
		.from(usageEvents)
		.where(
			and(
				eq(usageEvents.userId, userId),
				eq(usageEvents.daysSinceEpoch, daysSinceEpoch),
			),
		)
		.get();
	return result ?? null;
}

export async function getMonthlyUsage(userId: string) {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const monthStartDay = getDaysSinceEpoch(startOfMonth);

	const monthlyRecords = await db
		.select({ messagesCount: usageEvents.messagesCount })
		.from(usageEvents)
		.where(
			and(
				eq(usageEvents.userId, userId),
				gte(usageEvents.daysSinceEpoch, monthStartDay),
			),
		)
		.all();

	return monthlyRecords.reduce(
		(sum, record) => sum + (record.messagesCount ?? 0),
		0,
	);
}

export async function getUsageStats(
	userId: string,
	startDate?: string,
	endDate?: string,
) {
	const conditions = [eq(usageEvents.userId, userId)];

	if (startDate) {
		const startDay = getDaysSinceEpoch(new Date(startDate));
		conditions.push(gte(usageEvents.daysSinceEpoch, startDay));
	}

	if (endDate) {
		const endDay = getDaysSinceEpoch(new Date(endDate));
		conditions.push(lte(usageEvents.daysSinceEpoch, endDay));
	}

	const records = await db
		.select()
		.from(usageEvents)
		.where(and(...conditions))
		.orderBy(desc(usageEvents.daysSinceEpoch))
		.all();

	const daily = records.map((record) => {
		const modelUsage = parseModelUsage(record.modelUsage);
		const tokenTotals = Object.values(modelUsage).reduce(
			(acc, entry) => {
				acc.input += entry.inputTokens;
				acc.output += entry.outputTokens;
				acc.reasoning += entry.reasoningTokens;
				return acc;
			},
			{ input: 0, output: 0, reasoning: 0 },
		);

		const date = dateFromDaysSinceEpoch(record.daysSinceEpoch)
			.toISOString()
			.split("T")[0];

		return {
			date,
			messages: record.messagesCount ?? 0,
			tokens: {
				input: tokenTotals.input,
				output: tokenTotals.output,
				reasoning: tokenTotals.reasoning,
				total: tokenTotals.input + tokenTotals.output + tokenTotals.reasoning,
			},
			models: modelUsage,
		};
	});

	const totals = records.reduce(
		(acc, record) => {
			acc.messages += record.messagesCount ?? 0;
			const modelUsage = parseModelUsage(record.modelUsage);
			for (const entry of Object.values(modelUsage)) {
				acc.tokens.input += entry.inputTokens;
				acc.tokens.output += entry.outputTokens;
				acc.tokens.reasoning += entry.reasoningTokens;
			}
			return acc;
		},
		{ messages: 0, tokens: { input: 0, output: 0, reasoning: 0, total: 0 } },
	);

	const modelTotals: Record<string, ModelUsageEntry> = {};
	for (const record of records) {
		const modelUsage = parseModelUsage(record.modelUsage);
		for (const [modelId, entry] of Object.entries(modelUsage)) {
			const aggregate = modelTotals[modelId] || {
				messages: 0,
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
			};
			aggregate.messages += entry.messages;
			aggregate.inputTokens += entry.inputTokens;
			aggregate.outputTokens += entry.outputTokens;
			aggregate.reasoningTokens += entry.reasoningTokens;
			modelTotals[modelId] = aggregate;
		}
	}

	totals.tokens.total =
		totals.tokens.input + totals.tokens.output + totals.tokens.reasoning;

	return {
		daily,
		totals: {
			messages: totals.messages,
			tokens: totals.tokens,
			models: modelTotals,
		},
	};
}
