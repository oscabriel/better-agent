import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { timestampMsNow } from "./common";

export const userProductSettings = sqliteTable("user_product_settings", {
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
	defaultModel: text("default_model"),
	reasoningEffort: text("reasoning_effort").default("medium").notNull(),
	theme: text("theme").default("system").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(timestampMsNow)
		.$onUpdate(() => new Date())
		.notNull(),
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	webSearchEnabled: integer("web_search_enabled", { mode: "boolean" }).default(false).notNull(),
});

export const userProviderCredentials = sqliteTable(
	"user_provider_credentials",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		encryptedCredential: text("encrypted_credential").notNull(),
		id: text("id").primaryKey(),
		label: text("label"),
		metadata: text("metadata").default("{}").notNull(),
		providerId: text("provider_id").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("idx_user_provider_credentials_user").on(table.userId),
		uniqueIndex("idx_user_provider_credentials_user_provider").on(table.userId, table.providerId),
	],
);

export const mcpServerCatalog = sqliteTable("mcp_server_catalog", {
	authType: text("auth_type").default("none").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
	description: text("description"),
	id: text("id").primaryKey(),
	metadata: text("metadata").default("{}").notNull(),
	name: text("name").notNull(),
	riskLevel: text("risk_level").default("unknown").notNull(),
	transport: text("transport").default("streamable_http").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(timestampMsNow)
		.$onUpdate(() => new Date())
		.notNull(),
	url: text("url").notNull(),
});

export const userMcpConnections = sqliteTable(
	"user_mcp_connections",
	{
		catalogVisible: integer("catalog_visible", { mode: "boolean" }).default(true).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		description: text("description"),
		encryptedHeaders: text("encrypted_headers").default("{}").notNull(),
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		serverId: text("server_id").references(() => mcpServerCatalog.id, { onDelete: "set null" }),
		transport: text("transport").default("streamable_http").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		url: text("url").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("idx_user_mcp_connections_user").on(table.userId),
		index("idx_user_mcp_connections_server").on(table.serverId),
	],
);

export const userProductSettingsRelations = relations(userProductSettings, ({ one }) => ({
	user: one(user, {
		fields: [userProductSettings.userId],
		references: [user.id],
	}),
}));

export const userProviderCredentialsRelations = relations(userProviderCredentials, ({ one }) => ({
	user: one(user, {
		fields: [userProviderCredentials.userId],
		references: [user.id],
	}),
}));

export const mcpServerCatalogRelations = relations(mcpServerCatalog, ({ many }) => ({
	connections: many(userMcpConnections),
}));

export const userMcpConnectionsRelations = relations(userMcpConnections, ({ one }) => ({
	server: one(mcpServerCatalog, {
		fields: [userMcpConnections.serverId],
		references: [mcpServerCatalog.id],
	}),
	user: one(user, {
		fields: [userMcpConnections.userId],
		references: [user.id],
	}),
}));

export type UserProductSettings = typeof userProductSettings.$inferSelect;
export type NewUserProductSettings = typeof userProductSettings.$inferInsert;
export type UserProviderCredential = typeof userProviderCredentials.$inferSelect;
export type NewUserProviderCredential = typeof userProviderCredentials.$inferInsert;
export type McpServerCatalogEntry = typeof mcpServerCatalog.$inferSelect;
export type NewMcpServerCatalogEntry = typeof mcpServerCatalog.$inferInsert;
export type UserMcpConnection = typeof userMcpConnections.$inferSelect;
export type NewUserMcpConnection = typeof userMcpConnections.$inferInsert;
