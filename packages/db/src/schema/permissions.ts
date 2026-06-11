import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { timestampMsNow } from "./common";
import { thinkspaces } from "./thinkspaces";

export const THINKSPACE_PERMISSION_KINDS = {
	MCP_TOOL_ACCESS: "mcp_tool_access",
	MODEL_PROVIDER_CREDENTIAL: "model_provider_credential",
} as const;

export type ThinkspacePermissionKind =
	(typeof THINKSPACE_PERMISSION_KINDS)[keyof typeof THINKSPACE_PERMISSION_KINDS];

export const thinkspacePermissions = sqliteTable(
	"thinkspace_permissions",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		grantedByUserId: text("granted_by_user_id").notNull(),
		id: text("id").primaryKey(),
		kind: text("kind").notNull(),
		/**
		 * The granted resource identity for kinds that target one: the model
		 * provider id for `model_provider_credential` grants, the built-in MCP
		 * server id for `mcp_tool_access` grants. The unique index below gives
		 * every kind per-Thinkspace, per-resource uniqueness.
		 */
		providerId: text("provider_id"),
		reason: text("reason").default("").notNull(),
		thinkspaceId: text("thinkspace_id")
			.notNull()
			.references(() => thinkspaces.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("idx_thinkspace_permissions_thinkspace").on(table.thinkspaceId),
		uniqueIndex("uidx_thinkspace_permissions_model_provider").on(
			table.thinkspaceId,
			table.kind,
			table.providerId,
		),
	],
);

export const thinkspacePermissionRelations = relations(thinkspacePermissions, ({ one }) => ({
	thinkspace: one(thinkspaces, {
		fields: [thinkspacePermissions.thinkspaceId],
		references: [thinkspaces.id],
	}),
}));

export type ThinkspacePermission = typeof thinkspacePermissions.$inferSelect;
export type NewThinkspacePermission = typeof thinkspacePermissions.$inferInsert;
