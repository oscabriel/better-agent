import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestampMsNow = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
	id: text("id").primaryKey(),
	image: text("image"),
	name: text("name").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(timestampMsNow)
		.$onUpdate(() => new Date())
		.notNull(),
});

export const session = sqliteTable(
	"session",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		id: text("id").primaryKey(),
		ipAddress: text("ip_address"),
		token: text("token").notNull().unique(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		accessToken: text("access_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp_ms",
		}),
		accountId: text("account_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		id: text("id").primaryKey(),
		idToken: text("id_token"),
		password: text("password"),
		providerId: text("provider_id").notNull(),
		refreshToken: text("refresh_token"),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp_ms",
		}),
		scope: text("scope"),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("account_userId_idx").on(table.userId),
		index("idx_account_provider_account").on(table.providerId, table.accountId),
	],
);

export const verification = sqliteTable(
	"verification",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(timestampMsNow).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampMsNow)
			.$onUpdate(() => new Date())
			.notNull(),
		value: text("value").notNull(),
	},
	(table) => [
		index("verification_identifier_idx").on(table.identifier),
		index("idx_verification_expires_at").on(table.expiresAt),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	accounts: many(account),
	sessions: many(session),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));
