import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usageEvents = sqliteTable(
	"usage_events",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		daysSinceEpoch: integer("days_since_epoch").notNull(),
		messagesCount: integer("messages_count").notNull().default(0),
		modelUsage: text("model_usage").default("{}"),
		lastMessageAt: integer("last_message_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.$onUpdateFn(() => new Date())
			.notNull(),
	},
	(table) => [
		index("idx_usage_events_user_day").on(table.userId, table.daysSinceEpoch),
	],
);
