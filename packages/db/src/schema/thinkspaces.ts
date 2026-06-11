import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { timestampMsNow } from "./common";

/**
 * A Thinkspace begins as a draft the moment the user starts shaping it with
 * the Curator, and becomes active when its Goal and first Agent Profile
 * revision are activated together. Draft Thinkspaces preserve the judgement
 * already spent in the Curator session; abandoning curation never silently
 * discards them.
 */
export const THINKSPACE_STATUS = {
	ACTIVE: "active",
	ARCHIVED: "archived",
	DRAFT: "draft",
} as const;

export type ThinkspaceStatus = (typeof THINKSPACE_STATUS)[keyof typeof THINKSPACE_STATUS];

export const thinkspaces = sqliteTable(
	"thinkspaces",
	{
		/**
		 * @deprecated Legacy curation config. Approval policy is Permission/
		 * Approval-owned and never lives on the Agent Profile; this column is
		 * superseded by Thinkspace-owned Permission storage (ADR-0003/0004/0007).
		 */
		approvalDefaults: text("approval_defaults").default("{}").notNull(),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		configurationSummary: text("configuration_summary").default("").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		/**
		 * @deprecated Legacy curation config. Tool enablement is migrating to
		 * versioned Agent Profile revisions in `thinkspace_agent_profiles`
		 * (ADR-0007).
		 */
		enabledToolIds: text("enabled_tool_ids").default("[]").notNull(),
		goal: text("goal").notNull(),
		id: text("id").primaryKey(),
		memoryGovernance: text("memory_governance").default("{}").notNull(),
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/**
		 * @deprecated Legacy curation config, still read by model-credential
		 * readiness checks. Permission requests are migrating to draft Agent
		 * Profile revisions; granted Permissions belong to Thinkspace-owned
		 * Permission storage (ADR-0007).
		 */
		requestedPermissions: text("requested_permissions").default("[]").notNull(),
		status: text("status").default(THINKSPACE_STATUS.DRAFT).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_thinkspaces_owner_status_updated").on(
			table.ownerUserId,
			table.status,
			table.updatedAt,
		),
		index("idx_thinkspaces_owner_created").on(table.ownerUserId, table.createdAt),
		index("idx_thinkspaces_owner_archived").on(table.ownerUserId, table.archivedAt),
	],
);

export const thinkspaceRelations = relations(thinkspaces, ({ one }) => ({
	owner: one(user, {
		fields: [thinkspaces.ownerUserId],
		references: [user.id],
	}),
}));

export type Thinkspace = typeof thinkspaces.$inferSelect;
export type NewThinkspace = typeof thinkspaces.$inferInsert;
