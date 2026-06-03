import type { ProductDb } from "@better-agent/db";
import { THINKSPACE_STATUS, thinkspaces } from "@better-agent/db/schema/thinkspaces";
import type { Thinkspace, ThinkspaceStatus } from "@better-agent/db/schema/thinkspaces";
import { and, desc, eq } from "drizzle-orm";

export interface ListThinkspacesInput {
	ownerUserId: string;
	status?: ThinkspaceStatus;
}

export interface CreateThinkspaceInput {
	record: typeof thinkspaces.$inferInsert;
}

export const createThinkspace = async (
	db: ProductDb,
	{ record }: CreateThinkspaceInput,
): Promise<Thinkspace> => {
	const [created] = await db.insert(thinkspaces).values(record).returning();

	if (!created) {
		throw new Error("Thinkspace was not persisted.");
	}

	return created;
};

export const listThinkspaces = async (
	db: ProductDb,
	{ ownerUserId, status = THINKSPACE_STATUS.ACTIVE }: ListThinkspacesInput,
): Promise<Thinkspace[]> =>
	await db
		.select()
		.from(thinkspaces)
		.where(and(eq(thinkspaces.ownerUserId, ownerUserId), eq(thinkspaces.status, status)))
		.orderBy(desc(thinkspaces.updatedAt));
