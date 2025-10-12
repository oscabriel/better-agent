import { eq } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { usageEvents } from "@/server/db/d1/schema/usage";
import { getDailyUsage, getDaysSinceEpoch } from "./queries";
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

function serializeModelUsage(entries: Record<string, ModelUsageEntry>): string {
	return JSON.stringify(entries);
}

function createUsageId(userId: string, daysSinceEpoch: number) {
	return `${userId}:${daysSinceEpoch}`;
}

async function ensureDailyUsage(
	userId: string,
	daysSinceEpoch: number,
): Promise<UsageRecord> {
	const existing = await getDailyUsage(userId, daysSinceEpoch);
	if (existing) return existing;

	const now = new Date();
	const record: UsageRecord = {
		id: createUsageId(userId, daysSinceEpoch),
		userId,
		daysSinceEpoch,
		messagesCount: 0,
		modelUsage: "{}",
		lastMessageAt: null,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(usageEvents).values(record).onConflictDoNothing();
	return (await getDailyUsage(userId, daysSinceEpoch)) ?? record;
}

export async function recordUsage(
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
	const now = new Date();
	const today = getDaysSinceEpoch(now);
	const inputTokens = params.usage?.inputTokens ?? 0;
	const outputTokens = params.usage?.outputTokens ?? 0;
	const reasoningTokens = params.usage?.reasoningTokens ?? 0;

	const existing = await ensureDailyUsage(userId, today);
	const modelUsage = parseModelUsage(existing.modelUsage);
	const current = modelUsage[params.modelId] ?? {
		messages: 0,
		inputTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0,
	};

	modelUsage[params.modelId] = {
		messages: current.messages + 1,
		inputTokens: current.inputTokens + inputTokens,
		outputTokens: current.outputTokens + outputTokens,
		reasoningTokens: current.reasoningTokens + reasoningTokens,
	};

	await db
		.update(usageEvents)
		.set({
			messagesCount: (existing.messagesCount ?? 0) + 1,
			modelUsage: serializeModelUsage(modelUsage),
			lastMessageAt: now,
			updatedAt: now,
		})
		.where(eq(usageEvents.id, createUsageId(userId, today)));
}
