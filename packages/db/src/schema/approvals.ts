import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { timestampMsNow } from "./common";
import { thinkspaces } from "./thinkspaces";

/**
 * The status of a pending Approval. An Approval is the owner's consent to one
 * specific proposed action within a Permission's allowance; it stays `pending`
 * until the owner decides it, then leaves the Review Queue as `approved` or
 * `rejected`.
 */
export const THINKSPACE_APPROVAL_STATUS = {
	APPROVED: "approved",
	PENDING: "pending",
	REJECTED: "rejected",
} as const;

export type ThinkspaceApprovalStatus =
	(typeof THINKSPACE_APPROVAL_STATUS)[keyof typeof THINKSPACE_APPROVAL_STATUS];

/**
 * The class of action a pending Approval holds. The first held action was the
 * agent proposing a durable Product Memory; `github_create_issue` is the first
 * held *external* mutation (PRD #108); `mcp_tool_call` is a held call to a tool
 * on a mutating-risk MCP server (ADR-0003). All reuse `proposed_content` /
 * `proposed_summary`, so adding a kind needs no migration.
 */
export const THINKSPACE_APPROVAL_ACTION_KIND = {
	GITHUB_CREATE_ISSUE: "github_create_issue",
	MCP_TOOL_CALL: "mcp_tool_call",
	MEMORY_WRITE: "memory_write",
} as const;

export type ThinkspaceApprovalActionKind =
	(typeof THINKSPACE_APPROVAL_ACTION_KIND)[keyof typeof THINKSPACE_APPROVAL_ACTION_KIND];

/**
 * Whether a stored `action_kind` string is one the product still understands.
 * The decide path uses this to fail closed on an unknown kind rather than
 * trusting an arbitrary row value.
 */
export const isThinkspaceApprovalActionKind = (
	value: string,
): value is ThinkspaceApprovalActionKind =>
	(Object.values(THINKSPACE_APPROVAL_ACTION_KIND) as string[]).includes(value);

/**
 * The D1 index half of a pending Approval (ADR-0002): the authoritative
 * paused-turn state lives in the Thinkspace Agent's Durable Object, where
 * Project Think persists it; this table mirrors one row per pending Approval so
 * the cross-Thinkspace Review Queue can be a simple owner-indexed query and a
 * decision can be applied long after the turn parked. The row is written when
 * the hold is raised and updated when the Approval is resolved.
 *
 * `owner_user_id` is denormalized from the Thinkspace so the Review Queue lists
 * every pending Approval across all of a user's Thinkspaces without a join.
 * `tool_call_id` is the durable, entry-path-agnostic handle into the parked
 * turn's transcript; the unique index on (thinkspace_id, tool_call_id) makes
 * the hold-time upsert idempotent so reconciling the same parked turn twice
 * never duplicates the Approval.
 */
export const thinkspaceApprovals = sqliteTable(
	"thinkspace_approvals",
	{
		actionKind: text("action_kind").notNull(),
		approvalRequestId: text("approval_request_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		id: text("id").primaryKey(),
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		profileRevisionId: text("profile_revision_id"),
		profileVersion: integer("profile_version"),
		proposedContent: text("proposed_content").notNull(),
		proposedSummary: text("proposed_summary").notNull(),
		resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
		status: text("status").default(THINKSPACE_APPROVAL_STATUS.PENDING).notNull(),
		submissionId: text("submission_id"),
		thinkspaceId: text("thinkspace_id")
			.notNull()
			.references(() => thinkspaces.id, { onDelete: "cascade" }),
		toolCallId: text("tool_call_id").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_thinkspace_approvals_owner_status_created").on(
			table.ownerUserId,
			table.status,
			table.createdAt,
		),
		index("idx_thinkspace_approvals_thinkspace_status").on(table.thinkspaceId, table.status),
		uniqueIndex("uq_thinkspace_approvals_thinkspace_tool_call").on(
			table.thinkspaceId,
			table.toolCallId,
		),
	],
);

export const thinkspaceApprovalRelations = relations(thinkspaceApprovals, ({ one }) => ({
	owner: one(user, {
		fields: [thinkspaceApprovals.ownerUserId],
		references: [user.id],
	}),
	thinkspace: one(thinkspaces, {
		fields: [thinkspaceApprovals.thinkspaceId],
		references: [thinkspaces.id],
	}),
}));

export type ThinkspaceApproval = typeof thinkspaceApprovals.$inferSelect;
export type NewThinkspaceApproval = typeof thinkspaceApprovals.$inferInsert;
