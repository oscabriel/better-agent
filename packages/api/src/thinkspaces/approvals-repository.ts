import type { ProductDb } from "@better-agent/db";
import { THINKSPACE_APPROVAL_STATUS, thinkspaceApprovals } from "@better-agent/db/schema/approvals";
import type {
	ThinkspaceApproval,
	ThinkspaceApprovalStatus,
} from "@better-agent/db/schema/approvals";
import { and, desc, eq } from "drizzle-orm";

export interface UpsertPendingThinkspaceApprovalInput {
	record: {
		actionKind: string;
		approvalRequestId: string;
		id: string;
		ownerUserId: string;
		profileRevisionId: string | null;
		profileVersion: number | null;
		proposedContent: string;
		proposedSummary: string;
		submissionId: string | null;
		thinkspaceId: string;
		toolCallId: string;
	};
}

export interface GetThinkspaceApprovalInput {
	approvalId: string;
	thinkspaceId: string;
}

export interface ResolveThinkspaceApprovalInput {
	approvalId: string;
	resolvedAt: Date;
	status: Extract<ThinkspaceApprovalStatus, "approved" | "rejected">;
	thinkspaceId: string;
}

const getThinkspaceApprovalByToolCall = async (
	db: ProductDb,
	{ thinkspaceId, toolCallId }: { thinkspaceId: string; toolCallId: string },
): Promise<ThinkspaceApproval | null> => {
	const [approval] = await db
		.select()
		.from(thinkspaceApprovals)
		.where(
			and(
				eq(thinkspaceApprovals.thinkspaceId, thinkspaceId),
				eq(thinkspaceApprovals.toolCallId, toolCallId),
			),
		)
		.limit(1);

	return approval ?? null;
};

/**
 * Records a pending Approval the moment the hold is raised. Idempotent on
 * (thinkspaceId, toolCallId): reconciling the same parked turn again resolves
 * to the existing row instead of inserting a duplicate, and never disturbs an
 * Approval that has since been decided. Always returns the authoritative row.
 */
export const upsertPendingThinkspaceApproval = async (
	db: ProductDb,
	{ record }: UpsertPendingThinkspaceApprovalInput,
): Promise<ThinkspaceApproval> => {
	const [created] = await db
		.insert(thinkspaceApprovals)
		.values({ ...record, status: THINKSPACE_APPROVAL_STATUS.PENDING })
		.onConflictDoNothing({
			target: [thinkspaceApprovals.thinkspaceId, thinkspaceApprovals.toolCallId],
		})
		.returning();

	if (created) {
		return created;
	}

	const existing = await getThinkspaceApprovalByToolCall(db, {
		thinkspaceId: record.thinkspaceId,
		toolCallId: record.toolCallId,
	});

	if (!existing) {
		throw new Error("Approval was not persisted.");
	}

	return existing;
};

/**
 * Reads one Approval keyed by (thinkspaceId, approvalId) together, so an
 * Approval id forged from another Thinkspace can never resolve here.
 */
export const getThinkspaceApproval = async (
	db: ProductDb,
	{ approvalId, thinkspaceId }: GetThinkspaceApprovalInput,
): Promise<ThinkspaceApproval | null> => {
	const [approval] = await db
		.select()
		.from(thinkspaceApprovals)
		.where(
			and(
				eq(thinkspaceApprovals.id, approvalId),
				eq(thinkspaceApprovals.thinkspaceId, thinkspaceId),
			),
		)
		.limit(1);

	return approval ?? null;
};

export const listPendingThinkspaceApprovals = async (
	db: ProductDb,
	{ thinkspaceId }: { thinkspaceId: string },
): Promise<ThinkspaceApproval[]> =>
	await db
		.select()
		.from(thinkspaceApprovals)
		.where(
			and(
				eq(thinkspaceApprovals.thinkspaceId, thinkspaceId),
				eq(thinkspaceApprovals.status, THINKSPACE_APPROVAL_STATUS.PENDING),
			),
		)
		.orderBy(desc(thinkspaceApprovals.createdAt));

/**
 * Moves a pending Approval to its decided status. The `status = pending` guard
 * makes resolution a no-op once the Approval has already left the queue, so a
 * late or duplicate decision can never overwrite an earlier one. Returns the
 * updated row, or null when nothing pending matched.
 */
export const resolveThinkspaceApproval = async (
	db: ProductDb,
	{ approvalId, resolvedAt, status, thinkspaceId }: ResolveThinkspaceApprovalInput,
): Promise<ThinkspaceApproval | null> => {
	const [resolved] = await db
		.update(thinkspaceApprovals)
		.set({ resolvedAt, status })
		.where(
			and(
				eq(thinkspaceApprovals.id, approvalId),
				eq(thinkspaceApprovals.thinkspaceId, thinkspaceId),
				eq(thinkspaceApprovals.status, THINKSPACE_APPROVAL_STATUS.PENDING),
			),
		)
		.returning();

	return resolved ?? null;
};
