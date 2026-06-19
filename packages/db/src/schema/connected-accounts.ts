import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { timestampMsNow } from "./common";

export const connectedAccountCatalog = sqliteTable("connected_account_catalog", {
	authType: text("auth_type").default("pat").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
	id: text("id").primaryKey(),
	metadata: text("metadata").default("{}").notNull(),
	name: text("name").notNull(),
	riskLevel: text("risk_level").default("unknown").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(timestampMsNow)
		.$onUpdate(() => new Date())
		.notNull(),
});

export const userConnectedAccounts = sqliteTable(
	"user_connected_accounts",
	{
		catalogId: text("catalog_id").references(() => connectedAccountCatalog.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		credentialType: text("credential_type").default("pat").notNull(),
		encryptedCredential: text("encrypted_credential").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		externalAccountId: text("external_account_id"),
		id: text("id").primaryKey(),
		label: text("label"),
		metadata: text("metadata").default("{}").notNull(),
		refreshToken: text("refresh_token"),
		scopes: text("scopes").default("[]").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("idx_user_connected_accounts_user").on(table.userId),
		index("idx_user_connected_accounts_catalog").on(table.catalogId),
		uniqueIndex("idx_user_connected_accounts_user_catalog").on(table.userId, table.catalogId),
	],
);

export const connectedAccountCatalogRelations = relations(connectedAccountCatalog, ({ many }) => ({
	accounts: many(userConnectedAccounts),
}));

export const userConnectedAccountsRelations = relations(userConnectedAccounts, ({ one }) => ({
	catalogEntry: one(connectedAccountCatalog, {
		fields: [userConnectedAccounts.catalogId],
		references: [connectedAccountCatalog.id],
	}),
	user: one(user, {
		fields: [userConnectedAccounts.userId],
		references: [user.id],
	}),
}));

export type ConnectedAccountCatalogEntry = typeof connectedAccountCatalog.$inferSelect;
export type NewConnectedAccountCatalogEntry = typeof connectedAccountCatalog.$inferInsert;
export type UserConnectedAccount = typeof userConnectedAccounts.$inferSelect;
export type NewUserConnectedAccount = typeof userConnectedAccounts.$inferInsert;
