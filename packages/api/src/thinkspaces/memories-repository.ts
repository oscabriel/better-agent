import type { ProductDb } from "@better-agent/db";
import { thinkspaceMemories } from "@better-agent/db/schema/memories";
import type { ThinkspaceMemory } from "@better-agent/db/schema/memories";
import { and, desc, eq } from "drizzle-orm";

export interface CreateThinkspaceMemoryInput {
	record: {
		content: string;
		id: string;
		profileRevisionId: string | null;
		profileVersion: number | null;
		thinkspaceId: string;
		toolCallId: string;
	};
}

export interface ListThinkspaceMemoriesInput {
	thinkspaceId: string;
}

const getThinkspaceMemoryByToolCall = async (
	db: ProductDb,
	{ thinkspaceId, toolCallId }: { thinkspaceId: string; toolCallId: string },
): Promise<ThinkspaceMemory | null> => {
	const [memory] = await db
		.select()
		.from(thinkspaceMemories)
		.where(
			and(
				eq(thinkspaceMemories.thinkspaceId, thinkspaceId),
				eq(thinkspaceMemories.toolCallId, toolCallId),
			),
		)
		.limit(1);

	return memory ?? null;
};

/**
 * Writes an approved Memory into the per-Thinkspace store. The write is
 * idempotent on (thinkspaceId, toolCallId): a resumed or retried continuation
 * of the held tool call resolves to the already-stored Memory instead of
 * inserting a duplicate, so approving once can only ever produce one Memory.
 */
export const createThinkspaceMemory = async (
	db: ProductDb,
	{ record }: CreateThinkspaceMemoryInput,
): Promise<ThinkspaceMemory> => {
	const [created] = await db
		.insert(thinkspaceMemories)
		.values(record)
		.onConflictDoNothing({
			target: [thinkspaceMemories.thinkspaceId, thinkspaceMemories.toolCallId],
		})
		.returning();

	if (created) {
		return created;
	}

	const existing = await getThinkspaceMemoryByToolCall(db, {
		thinkspaceId: record.thinkspaceId,
		toolCallId: record.toolCallId,
	});

	if (!existing) {
		throw new Error("Memory was not persisted.");
	}

	return existing;
};

export const listThinkspaceMemories = async (
	db: ProductDb,
	{ thinkspaceId }: ListThinkspaceMemoriesInput,
): Promise<ThinkspaceMemory[]> =>
	await db
		.select()
		.from(thinkspaceMemories)
		.where(eq(thinkspaceMemories.thinkspaceId, thinkspaceId))
		.orderBy(desc(thinkspaceMemories.createdAt));
