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
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		configurationSummary: text("configuration_summary").default("").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		goal: text("goal").notNull(),
		id: text("id").primaryKey(),
		memoryGovernance: text("memory_governance").default("{}").notNull(),
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
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
