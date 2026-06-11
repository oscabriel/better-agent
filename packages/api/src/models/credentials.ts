import type { ProductDb } from "@better-agent/db";
import { userProviderCredentials } from "@better-agent/db/schema/settings";
import { and, eq } from "drizzle-orm";

import type { ModelProviderId } from "./catalog";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (value: ArrayBuffer | ArrayBufferView): string => {
	const bytes =
		value instanceof ArrayBuffer
			? new Uint8Array(value)
			: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	return btoa(String.fromCodePoint(...bytes));
};
const fromBase64 = (value: string): Uint8Array =>
	Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0);

const importKey = async (secret: string): Promise<CryptoKey> => {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
	return await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export const encryptCredential = async (credential: string, secret: string): Promise<string> => {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ iv, name: "AES-GCM" },
		await importKey(secret),
		encoder.encode(credential),
	);
	return JSON.stringify({ alg: "AES-GCM", ciphertext: toBase64(ciphertext), iv: toBase64(iv) });
};

export const decryptCredential = async (
	encryptedCredential: string,
	secret: string,
): Promise<string> => {
	const payload = JSON.parse(encryptedCredential) as { iv: string; ciphertext: string };
	const plaintext = await crypto.subtle.decrypt(
		{ iv: fromBase64(payload.iv), name: "AES-GCM" },
		await importKey(secret),
		fromBase64(payload.ciphertext),
	);
	return decoder.decode(plaintext);
};

export const redactCredential = (credential: string): string => {
	if (credential.length <= 8) {
		return "••••";
	}
	return `${credential.slice(0, 4)}…${credential.slice(-4)}`;
};

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
