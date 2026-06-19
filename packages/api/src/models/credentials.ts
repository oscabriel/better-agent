import type { ProductDb } from "@better-agent/db";
import { userProviderCredentials } from "@better-agent/db/schema/settings";
import { and, eq } from "drizzle-orm";

import { decryptCredential } from "../crypto";
import type { ModelProviderId } from "./catalog";

export const upsertProviderCredential = async (
	db: ProductDb,
	input: {
		encryptedCredential: string;
		id: string;
		label?: string;
		providerId: ModelProviderId;
		userId: string;
	},
) => {
	const now = new Date();
	await db
		.insert(userProviderCredentials)
		.values({
			encryptedCredential: input.encryptedCredential,
			id: input.id,
			label: input.label,
			metadata: JSON.stringify({ permissionBoundary: "product_connected_account_only" }),
			providerId: input.providerId,
			updatedAt: now,
			userId: input.userId,
		})
		.onConflictDoUpdate({
			set: { encryptedCredential: input.encryptedCredential, label: input.label, updatedAt: now },
			target: [userProviderCredentials.userId, userProviderCredentials.providerId],
		});
};

export const listProviderCredentials = async (db: ProductDb, userId: string) =>
	await db.select().from(userProviderCredentials).where(eq(userProviderCredentials.userId, userId));

export const getCredentialMap = async (
	db: ProductDb,
	userId: string,
): Promise<Partial<Record<ModelProviderId, true>>> => {
	const rows = await listProviderCredentials(db, userId);
	return Object.fromEntries(rows.map((row) => [row.providerId, true])) as Partial<
		Record<ModelProviderId, true>
	>;
};

export const getDecryptedCredential = async (
	db: ProductDb,
	input: { providerId: ModelProviderId; secret: string; userId: string },
): Promise<string | null> => {
	const [row] = await db
		.select()
		.from(userProviderCredentials)
		.where(
			and(
				eq(userProviderCredentials.userId, input.userId),
				eq(userProviderCredentials.providerId, input.providerId),
			),
		)
		.limit(1);
	return typeof row?.encryptedCredential === "string"
		? await decryptCredential(row.encryptedCredential, input.secret)
		: null;
};
