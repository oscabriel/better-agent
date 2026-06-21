import type { ProductDb } from "@better-agent/db";
import { thinkspaceAgentProfiles } from "@better-agent/db/schema/agent-profiles";
import { THINKSPACE_STATUS, thinkspaces } from "@better-agent/db/schema/thinkspaces";
import type { Thinkspace, ThinkspaceStatus } from "@better-agent/db/schema/thinkspaces";
import { and, desc, eq, ne, or } from "drizzle-orm";

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

export interface UpdateCurationDraftThinkspaceInput {
	ownerUserId: string;
	patch: Partial<Pick<typeof thinkspaces.$inferInsert, "configurationSummary" | "goal">> & {
		updatedAt: Date;
	};
	thinkspaceId: string;
}

/**
 * Applies a Curator-proposed change to a draft Thinkspace's own fields (Goal,
 * configuration summary). Owner-scoped as defense in depth even though the
 * Curator runtime is already bound to one owner+draft: the patch can only land
 * on a Thinkspace the caller owns, and a miss returns null so the tool fails
 * product-safely. Giving an empty-Goal draft a real Goal is what returns it to
 * the owner's list (see `listThinkspaces`).
 */
export const updateCurationDraftThinkspace = async (
	db: ProductDb,
	{ ownerUserId, patch, thinkspaceId }: UpdateCurationDraftThinkspaceInput,
): Promise<Thinkspace | null> => {
	const [updated] = await db
		.update(thinkspaces)
		.set(patch)
		.where(and(eq(thinkspaces.id, thinkspaceId), eq(thinkspaces.ownerUserId, ownerUserId)))
		.returning();

	return updated ?? null;
};

export interface ApplyCurationGoalInput {
	displayName: string;
	goal: string;
	ownerUserId: string;
	revisionId: string;
	thinkspaceId: string;
	updatedAt: Date;
}

/**
 * Atomically gives a curation draft a real Goal and the matching display name:
 * the Thinkspace row's Goal (which returns the draft to the owner's list) and
 * the draft revision's display name move together in one D1 batch, so a failure
 * can never leave the Goal set while the agent card still reads "Untitled
 * Thinkspace". Owner-scoped on the Thinkspace; returns null (no Thinkspace
 * updated) so the caller fails product-safely without having written anything.
 */
export const applyCurationGoal = async (
	db: ProductDb,
	{ displayName, goal, ownerUserId, revisionId, thinkspaceId, updatedAt }: ApplyCurationGoalInput,
): Promise<Thinkspace | null> => {
	const [thinkspaceRows] = await db.batch([
		db
			.update(thinkspaces)
			.set({ goal, updatedAt })
			.where(and(eq(thinkspaces.id, thinkspaceId), eq(thinkspaces.ownerUserId, ownerUserId)))
			.returning(),
		db
			.update(thinkspaceAgentProfiles)
			.set({ displayName, updatedAt })
			.where(eq(thinkspaceAgentProfiles.id, revisionId)),
	]);
	const [updated] = thinkspaceRows;

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
				// An empty-Goal draft is an in-progress curation: keep it out of the
				// list until the Curator gives it a real Goal. The draft still
				// persists and stays fetchable by id, it just does not clutter the
				// list. A draft that has gained a Goal has goal != '' and reappears.
				or(ne(thinkspaces.status, THINKSPACE_STATUS.DRAFT), ne(thinkspaces.goal, "")),
			),
		)
		.orderBy(desc(thinkspaces.updatedAt));
