import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { timestampMsNow } from "./common";
import { thinkspaces } from "./thinkspaces";

/**
 * Agent Profile revision lifecycle (ADR-0007): a revision is shaped as a
 * resumable draft, takes effect only when the user activates it, and the
 * previously active revision becomes superseded. Past turns stay
 * attributable to the revision they ran under, so revisions are never
 * deleted or edited in place once activated.
 */
export const AGENT_PROFILE_REVISION_STATUS = {
	ACTIVE: "active",
	DRAFT: "draft",
	SUPERSEDED: "superseded",
} as const;

export type AgentProfileRevisionStatus =
	(typeof AGENT_PROFILE_REVISION_STATUS)[keyof typeof AGENT_PROFILE_REVISION_STATUS];

/**
 * One row per Agent Profile revision. The Profile owns only the pieces with
 * no other home (name, instructions, model behavior) and references the rest
 * (tool enablements, Skills, Routines). It never stores Permission or
 * Approval data: enablement makes a tool present, a Permission makes it
 * potent, and Permissions are owned by the Thinkspace, not the Profile.
 */
export const thinkspaceAgentProfiles = sqliteTable(
	"thinkspace_agent_profiles",
	{
		activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		displayName: text("display_name").notNull(),
		id: text("id").primaryKey(),
		instructions: text("instructions").default("").notNull(),
		modelId: text("model_id").notNull(),
		reasoningLevel: text("reasoning_level").notNull(),
		/**
		 * Draft-only Permission *requests* proposed with the Curator. Only the
		 * user grants Permissions, at activation, into Thinkspace-owned
		 * Permission storage — never through this table.
		 */
		requestedPermissions: text("requested_permissions").default("[]").notNull(),
		routines: text("routines").default("[]").notNull(),
		skillReferences: text("skill_references").default("[]").notNull(),
		status: text("status").default(AGENT_PROFILE_REVISION_STATUS.DRAFT).notNull(),
		supersededAt: integer("superseded_at", { mode: "timestamp_ms" }),
		thinkspaceId: text("thinkspace_id")
			.notNull()
			.references(() => thinkspaces.id, { onDelete: "cascade" }),
		toolEnablements: text("tool_enablements").default("[]").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		version: integer("version").notNull(),
	},
	(table) => [
		uniqueIndex("uq_agent_profiles_thinkspace_version").on(table.thinkspaceId, table.version),
		// Mechanical enforcement of the lifecycle invariant: at most one
		// active and at most one draft revision per Thinkspace.
		uniqueIndex("uq_agent_profiles_thinkspace_active")
			.on(table.thinkspaceId)
			.where(sql`status = 'active'`),
		uniqueIndex("uq_agent_profiles_thinkspace_draft")
			.on(table.thinkspaceId)
			.where(sql`status = 'draft'`),
		index("idx_agent_profiles_thinkspace_status").on(table.thinkspaceId, table.status),
	],
);

export const thinkspaceAgentProfileRelations = relations(thinkspaceAgentProfiles, ({ one }) => ({
	thinkspace: one(thinkspaces, {
		fields: [thinkspaceAgentProfiles.thinkspaceId],
		references: [thinkspaces.id],
	}),
}));

export type ThinkspaceAgentProfile = typeof thinkspaceAgentProfiles.$inferSelect;
export type NewThinkspaceAgentProfile = typeof thinkspaceAgentProfiles.$inferInsert;
