import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { timestampMsNow } from "./common";
import { thinkspaces } from "./thinkspaces";

/**
 * A Source is material the user hands to one Thinkspace — requirement docs,
 * exported PDFs as text, ADRs — so the Thinkspace Agent can ground its work
 * in the user's material instead of training data. This table is the D1
 * index half of the storage split (ADR-0002): metadata lives here, the
 * verbatim content blob lives in the SOURCES_ARTIFACTS R2 bucket. Sources
 * are scoped to exactly one Thinkspace; material shared for one Goal never
 * leaks into another Thinkspace's turns.
 */
export const thinkspaceSources = sqliteTable(
	"thinkspace_sources",
	{
		contentType: text("content_type").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		description: text("description").default("").notNull(),
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		thinkspaceId: text("thinkspace_id")
			.notNull()
			.references(() => thinkspaces.id, { onDelete: "cascade" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_thinkspace_sources_thinkspace_created").on(table.thinkspaceId, table.createdAt),
	],
);

export const thinkspaceSourceRelations = relations(thinkspaceSources, ({ one }) => ({
	thinkspace: one(thinkspaces, {
		fields: [thinkspaceSources.thinkspaceId],
		references: [thinkspaces.id],
	}),
}));

export type ThinkspaceSource = typeof thinkspaceSources.$inferSelect;
export type NewThinkspaceSource = typeof thinkspaceSources.$inferInsert;
