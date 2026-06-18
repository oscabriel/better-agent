import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { timestampMsNow } from "./common";
import { thinkspaces } from "./thinkspaces";

/**
 * A Product Memory is something a Thinkspace Agent learned and the owner
 * consented to keep — durable understanding that persists across turns instead
 * of evaporating when a turn ends. This is the minimal store the held
 * Memory-proposing tool writes into once an Approval is granted (PRD #92): the
 * agent proposes a Memory, the owner approves it, and the approved content
 * lands here, scoped to exactly one Thinkspace.
 *
 * `tool_call_id` is the held tool call that produced this Memory; the unique
 * index on (thinkspace_id, tool_call_id) makes the post-approval write
 * idempotent, so a resumed or retried continuation can never double-write the
 * same proposed Memory.
 */
export const thinkspaceMemories = sqliteTable(
	"thinkspace_memories",
	{
		content: text("content").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		id: text("id").primaryKey(),
		profileRevisionId: text("profile_revision_id"),
		profileVersion: integer("profile_version"),
		thinkspaceId: text("thinkspace_id")
			.notNull()
			.references(() => thinkspaces.id, { onDelete: "cascade" }),
		toolCallId: text("tool_call_id").notNull(),
	},
	(table) => [
		index("idx_thinkspace_memories_thinkspace_created").on(table.thinkspaceId, table.createdAt),
		uniqueIndex("uq_thinkspace_memories_thinkspace_tool_call").on(
			table.thinkspaceId,
			table.toolCallId,
		),
	],
);

export const thinkspaceMemoryRelations = relations(thinkspaceMemories, ({ one }) => ({
	thinkspace: one(thinkspaces, {
		fields: [thinkspaceMemories.thinkspaceId],
		references: [thinkspaces.id],
	}),
}));

export type ThinkspaceMemory = typeof thinkspaceMemories.$inferSelect;
export type NewThinkspaceMemory = typeof thinkspaceMemories.$inferInsert;
