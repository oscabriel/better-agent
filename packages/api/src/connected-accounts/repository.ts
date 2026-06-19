import type { ProductDb } from "@better-agent/db";
import { userConnectedAccounts } from "@better-agent/db/schema/connected-accounts";
import { and, eq } from "drizzle-orm";

export interface UpsertConnectedAccountInput {
	catalogId: string;
	credentialType: "oauth" | "pat";
	encryptedCredential: string;
	externalAccountId: string;
	id: string;
	label?: string;
	userId: string;
}

/**
 * One Connected Account per provider per user: upsert keyed on
 * (userId, catalogId) so reconnecting replaces the credential and identity
 * in place rather than accumulating rows.
 */
export const upsertConnectedAccount = async (db: ProductDb, input: UpsertConnectedAccountInput) => {
	const now = new Date();
	const [row] = await db
		.insert(userConnectedAccounts)
		.values({
			catalogId: input.catalogId,
			credentialType: input.credentialType,
			encryptedCredential: input.encryptedCredential,
			externalAccountId: input.externalAccountId,
			id: input.id,
			label: input.label,
			updatedAt: now,
			userId: input.userId,
		})
		.onConflictDoUpdate({
			set: {
				credentialType: input.credentialType,
				encryptedCredential: input.encryptedCredential,
				externalAccountId: input.externalAccountId,
				label: input.label,
				updatedAt: now,
			},
			target: [userConnectedAccounts.userId, userConnectedAccounts.catalogId],
		})
		.returning();
	if (!row) {
		throw new Error("Connected account was not persisted.");
	}

	return row;
};

export const listConnectedAccounts = async (db: ProductDb, userId: string) =>
	await db.select().from(userConnectedAccounts).where(eq(userConnectedAccounts.userId, userId));

export const deleteConnectedAccount = async (
	db: ProductDb,
	input: { id: string; userId: string },
) => {
	const deleted = await db
		.delete(userConnectedAccounts)
		.where(
			and(eq(userConnectedAccounts.id, input.id), eq(userConnectedAccounts.userId, input.userId)),
		)
		.returning();
	return deleted.length > 0;
};
