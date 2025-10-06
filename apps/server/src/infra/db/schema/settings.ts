import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const userSettings = sqliteTable("user_settings", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	selectedModel: text("selected_model").default("google:gemini-2.5-flash-lite"),
	apiKeys: text("api_keys").default("{}"),
	enabledModels: text("enabled_models").default("[]"),
	enabledMcpServers: text("enabled_mcp_servers").default('["context7"]'),
	webSearchEnabled: integer("web_search_enabled", { mode: "boolean" }).default(
		false,
	),
	reasoningEffort: text("reasoning_effort").default("medium"),
	theme: text("theme").default("system"),
	chatWidth: text("chat_width").default("cozy"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.$defaultFn(() => new Date())
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.$defaultFn(() => new Date())
		.$onUpdateFn(() => new Date())
		.notNull(),
});

export const userMcpServers = sqliteTable(
	"user_mcp_servers",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		url: text("url").notNull(),
		type: text("type").notNull(),
		description: text("description"),
		headers: text("headers").default("{}"),
		enabled: integer("enabled", { mode: "boolean" }).default(true),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [index("idx_user_mcp_servers_user").on(table.userId)],
);
