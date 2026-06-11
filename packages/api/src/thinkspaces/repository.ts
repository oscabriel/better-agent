import type { ProductDb } from "@better-agent/db";
import { thinkspaceAgentProfiles } from "@better-agent/db/schema/agent-profiles";
import { THINKSPACE_STATUS, thinkspaces } from "@better-agent/db/schema/thinkspaces";
import type { Thinkspace, ThinkspaceStatus } from "@better-agent/db/schema/thinkspaces";
import { and, desc, eq, ne } from "drizzle-orm";

import { parseAgentProfileRevision, serializeAgentProfileRevision } from "./agent-profile";
import type { DraftAgentProfileRevision } from "./agent-profile";

export interface ListThinkspacesInput {
	ownerUserId: string;
	status?: ThinkspaceStatus;
}

export interface GetThinkspaceInput {
	ownerUserId: string;
	thinkspaceId: string;
}

export interface ArchiveThinkspaceInput extends GetThinkspaceInput {
	patch: Pick<typeof thinkspaces.$inferInsert, "archivedAt" | "status" | "updatedAt">;
}

export interface UpdateThinkspaceConfigurationInput extends GetThinkspaceInput {
	patch: Pick<
		typeof thinkspaces.$inferInsert,
		"approvalDefaults" | "enabledToolIds" | "requestedPermissions" | "updatedAt"
	>;
}

export interface CreateThinkspaceInput {
	record: typeof thinkspaces.$inferInsert;
}

export interface CreateThinkspaceWithAgentProfileDraftInput extends CreateThinkspaceInput {
	draft: DraftAgentProfileRevision;
}

export const createThinkspaceWithAgentProfileDraft = async (
	db: ProductDb,
	{ draft, record }: CreateThinkspaceWithAgentProfileDraftInput,
): Promise<{ draft: DraftAgentProfileRevision; thinkspace: Thinkspace }> => {
	const draftRecord = serializeAgentProfileRevision(draft);
	const [thinkspaceRows, draftRows] = await db.batch([
		db.insert(thinkspaces).values(record).returning(),
		db.insert(thinkspaceAgentProfiles).values(draftRecord).returning(),
	]);
	const [created] = thinkspaceRows;
	const [savedDraft] = draftRows;

	if (!created) {
		throw new Error("Thinkspace was not persisted.");
	}

	if (!savedDraft) {
		throw new Error("Agent Profile draft was not persisted.");
	}

	const savedRevision = parseAgentProfileRevision(savedDraft);

	if (savedRevision.status !== "draft") {
		throw new Error("Agent Profile draft persistence returned a non-draft revision.");
	}

	return { draft: savedRevision, thinkspace: created };
};

export const getThinkspace = async (
	db: ProductDb,
	{ ownerUserId, thinkspaceId }: GetThinkspaceInput,
): Promise<Thinkspace | null> => {
	const [thinkspace] = await db
		.select()
		.from(thinkspaces)
		.where(and(eq(thinkspaces.id, thinkspaceId), eq(thinkspaces.ownerUserId, ownerUserId)))
		.limit(1);

	return thinkspace ?? null;
};

export const archiveThinkspace = async (
	db: ProductDb,
	{ ownerUserId, patch, thinkspaceId }: ArchiveThinkspaceInput,
): Promise<Thinkspace | null> => {
	const [archived] = await db
		.update(thinkspaces)
		.set(patch)
		.where(and(eq(thinkspaces.id, thinkspaceId), eq(thinkspaces.ownerUserId, ownerUserId)))
		.returning();

	return archived ?? null;
};

export const updateThinkspaceConfiguration = async (
	db: ProductDb,
	{ ownerUserId, patch, thinkspaceId }: UpdateThinkspaceConfigurationInput,
): Promise<Thinkspace | null> => {
	const [updated] = await db
		.update(thinkspaces)
		.set(patch)
		.where(and(eq(thinkspaces.id, thinkspaceId), eq(thinkspaces.ownerUserId, ownerUserId)))
		.returning();

	return updated ?? null;
};

export const listThinkspaces = async (
	db: ProductDb,
	{ ownerUserId, status }: ListThinkspacesInput,
): Promise<Thinkspace[]> =>
	await db
		.select()
		.from(thinkspaces)
		.where(
			and(
				eq(thinkspaces.ownerUserId, ownerUserId),
				status
					? eq(thinkspaces.status, status)
					: ne(thinkspaces.status, THINKSPACE_STATUS.ARCHIVED),
			),
		)
		.orderBy(desc(thinkspaces.updatedAt));
