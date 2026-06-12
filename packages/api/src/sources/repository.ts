import type { ProductDb } from "@better-agent/db";
import { thinkspaceSources } from "@better-agent/db/schema/sources";
import type { ThinkspaceSource } from "@better-agent/db/schema/sources";
import { and, desc, eq } from "drizzle-orm";

export interface CreateThinkspaceSourceInput {
	record: typeof thinkspaceSources.$inferInsert;
}

export interface GetThinkspaceSourceInput {
	sourceId: string;
	thinkspaceId: string;
}

export interface ListThinkspaceSourcesInput {
	thinkspaceId: string;
}

export const createThinkspaceSource = async (
	db: ProductDb,
	{ record }: CreateThinkspaceSourceInput,
): Promise<ThinkspaceSource> => {
	const [created] = await db.insert(thinkspaceSources).values(record).returning();

	if (!created) {
		throw new Error("Source was not persisted.");
	}

	return created;
};

/**
 * Every read and delete is keyed by (thinkspaceId, sourceId) together, so a
 * Source id forged from another Thinkspace can never resolve here.
 */
export const getThinkspaceSource = async (
	db: ProductDb,
	{ sourceId, thinkspaceId }: GetThinkspaceSourceInput,
): Promise<ThinkspaceSource | null> => {
	const [source] = await db
		.select()
		.from(thinkspaceSources)
		.where(
			and(eq(thinkspaceSources.id, sourceId), eq(thinkspaceSources.thinkspaceId, thinkspaceId)),
		)
		.limit(1);

	return source ?? null;
};

export const listThinkspaceSources = async (
	db: ProductDb,
	{ thinkspaceId }: ListThinkspaceSourcesInput,
): Promise<ThinkspaceSource[]> =>
	await db
		.select()
		.from(thinkspaceSources)
		.where(eq(thinkspaceSources.thinkspaceId, thinkspaceId))
		.orderBy(desc(thinkspaceSources.createdAt));

export const deleteThinkspaceSource = async (
	db: ProductDb,
	{ sourceId, thinkspaceId }: GetThinkspaceSourceInput,
): Promise<ThinkspaceSource | null> => {
	const [deleted] = await db
		.delete(thinkspaceSources)
		.where(
			and(eq(thinkspaceSources.id, sourceId), eq(thinkspaceSources.thinkspaceId, thinkspaceId)),
		)
		.returning();

	return deleted ?? null;
};
