import type { ProductDb } from "@better-agent/db";
import { userConnectedAccounts } from "@better-agent/db/schema/connected-accounts";
import { and, eq } from "drizzle-orm";

import { decryptCredential } from "../crypto";

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

/**
 * Decrypt the owner's stored credential for one provider, or `null` if no
 * Connected Account exists for (userId, catalogId). Mirrors the model-provider
 * `getDecryptedCredential`: plaintext is materialised only here, at the moment
 * of use — for the held GitHub-issue tool, that is inside `execute`, after the
 * owner approves the proposal (the PRD #108 / ADR-0009 security invariant).
 */
export const getDecryptedConnectedAccountCredential = async (
	db: ProductDb,
	input: { catalogId: string; secret: string; userId: string },
): Promise<string | null> => {
	const [row] = await db
		.select()
		.from(userConnectedAccounts)
		.where(
			and(
				eq(userConnectedAccounts.userId, input.userId),
				eq(userConnectedAccounts.catalogId, input.catalogId),
			),
		)
		.limit(1);
	return typeof row?.encryptedCredential === "string"
		? await decryptCredential(row.encryptedCredential, input.secret)
		: null;
};
