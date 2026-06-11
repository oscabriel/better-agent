/**
 * Persistence adapter for Agent Profile revisions.
 *
 * Owner gating follows the existing Thinkspace pattern: callers resolve the
 * Thinkspace through `getThinkspace` (owner-scoped) first; this module only
 * answers questions about a known Thinkspace id. Rows cross the boundary
 * through `parseAgentProfileRevision` / `serializeAgentProfileRevision` so
 * raw JSON columns never leak into the domain.
 */
import type { ProductDb } from "@better-agent/db";
import {
	AGENT_PROFILE_REVISION_STATUS,
	thinkspaceAgentProfiles,
} from "@better-agent/db/schema/agent-profiles";
import { thinkspaces } from "@better-agent/db/schema/thinkspaces";
import { and, asc, eq } from "drizzle-orm";

import { parseAgentProfileRevision, serializeAgentProfileRevision } from "./agent-profile";
import type {
	ActiveAgentProfileRevision,
	AgentProfileRevision,
	DraftAgentProfileRevision,
} from "./agent-profile";
import type { AgentProfileActivation } from "./agent-profile-lifecycle";

export interface GetAgentProfileRevisionInput {
	thinkspaceId: string;
}

const getRevisionByStatus = async (
	db: ProductDb,
	thinkspaceId: string,
	status: (typeof AGENT_PROFILE_REVISION_STATUS)[keyof typeof AGENT_PROFILE_REVISION_STATUS],
): Promise<AgentProfileRevision | null> => {
	const [row] = await db
		.select()
		.from(thinkspaceAgentProfiles)
		.where(
			and(
				eq(thinkspaceAgentProfiles.thinkspaceId, thinkspaceId),
				eq(thinkspaceAgentProfiles.status, status),
			),
		)
		.limit(1);

	return row ? parseAgentProfileRevision(row) : null;
};

export const getActiveAgentProfileRevision = async (
	db: ProductDb,
	{ thinkspaceId }: GetAgentProfileRevisionInput,
): Promise<ActiveAgentProfileRevision | null> => {
	const revision = await getRevisionByStatus(
		db,
		thinkspaceId,
		AGENT_PROFILE_REVISION_STATUS.ACTIVE,
	);

	return revision?.status === AGENT_PROFILE_REVISION_STATUS.ACTIVE ? revision : null;
};

export const getDraftAgentProfileRevision = async (
	db: ProductDb,
	{ thinkspaceId }: GetAgentProfileRevisionInput,
): Promise<DraftAgentProfileRevision | null> => {
	const revision = await getRevisionByStatus(db, thinkspaceId, AGENT_PROFILE_REVISION_STATUS.DRAFT);

	return revision?.status === AGENT_PROFILE_REVISION_STATUS.DRAFT ? revision : null;
};

export const getCurrentAgentProfileRevision = async (
	db: ProductDb,
	{ thinkspaceId }: GetAgentProfileRevisionInput,
): Promise<ActiveAgentProfileRevision | DraftAgentProfileRevision | null> => {
	const active = await getActiveAgentProfileRevision(db, { thinkspaceId });

	if (active) {
		return active;
	}

	return await getDraftAgentProfileRevision(db, { thinkspaceId });
};

export const listAgentProfileRevisions = async (
	db: ProductDb,
	{ thinkspaceId }: GetAgentProfileRevisionInput,
): Promise<AgentProfileRevision[]> => {
	const rows = await db
		.select()
		.from(thinkspaceAgentProfiles)
		.where(eq(thinkspaceAgentProfiles.thinkspaceId, thinkspaceId))
		.orderBy(asc(thinkspaceAgentProfiles.version));

	return rows.map(parseAgentProfileRevision);
};

export interface SaveAgentProfileDraftInput {
	draft: DraftAgentProfileRevision;
}

/** Inserts or resumes (updates) the single draft revision for a Thinkspace. */
export const saveAgentProfileDraft = async (
	db: ProductDb,
	{ draft }: SaveAgentProfileDraftInput,
): Promise<DraftAgentProfileRevision> => {
	const record = serializeAgentProfileRevision(draft);
	const [saved] = await db
		.insert(thinkspaceAgentProfiles)
		.values(record)
		.onConflictDoUpdate({
			set: record,
			target: thinkspaceAgentProfiles.id,
		})
		.returning();

	if (!saved) {
		throw new Error("Agent Profile draft was not persisted.");
	}

	const revision = parseAgentProfileRevision(saved);

	if (revision.status !== AGENT_PROFILE_REVISION_STATUS.DRAFT) {
		throw new Error("Agent Profile draft persistence returned a non-draft revision.");
	}

	return revision;
};

export interface ApplyAgentProfileActivationInput {
	activation: AgentProfileActivation;
}

/**
 * Persists an activation computed by `createAgentProfileActivation`.
 *
 * Writes are batched so revision activation and first Thinkspace activation
 * succeed or fail as one D1 unit. Superseding the previous active revision
 * is ordered before activating the draft to satisfy the partial unique index.
 */
export const applyAgentProfileActivation = async (
	db: ProductDb,
	{ activation }: ApplyAgentProfileActivationInput,
): Promise<void> => {
	const { activatedRevision, supersededRevision, thinkspaceActivationPatch } = activation;
	const activationUpdate = db
		.update(thinkspaceAgentProfiles)
		.set(serializeAgentProfileRevision(activatedRevision))
		.where(eq(thinkspaceAgentProfiles.id, activatedRevision.id));

	if (supersededRevision && thinkspaceActivationPatch) {
		await db.batch([
			db
				.update(thinkspaceAgentProfiles)
				.set(serializeAgentProfileRevision(supersededRevision))
				.where(eq(thinkspaceAgentProfiles.id, supersededRevision.id)),
			activationUpdate,
			db
				.update(thinkspaces)
				.set(thinkspaceActivationPatch)
				.where(eq(thinkspaces.id, activatedRevision.thinkspaceId)),
		]);
		return;
	}

	if (supersededRevision) {
		await db.batch([
			db
				.update(thinkspaceAgentProfiles)
				.set(serializeAgentProfileRevision(supersededRevision))
				.where(eq(thinkspaceAgentProfiles.id, supersededRevision.id)),
			activationUpdate,
		]);
		return;
	}

	if (thinkspaceActivationPatch) {
		await db.batch([
			activationUpdate,
			db
				.update(thinkspaces)
				.set(thinkspaceActivationPatch)
				.where(eq(thinkspaces.id, activatedRevision.thinkspaceId)),
		]);
		return;
	}

	await db.batch([activationUpdate]);
};
