import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { userSettings } from "@/server/db/d1/schema/settings";
import {
	decryptApiKeys,
	encryptApiKeys,
	isEncrypted,
} from "@/server/lib/crypto";

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch (error) {
		console.warn("Failed to parse JSON value", { value, error });
		return fallback;
	}
}

export async function migrateApiKeysIfNeeded(
	userId: string,
	storedApiKeys: Record<string, string>,
): Promise<Record<string, string>> {
	const encryptionKey = env.API_ENCRYPTION_KEY;
	if (!encryptionKey) {
		return storedApiKeys;
	}

	let needsMigration = false;
	for (const key of Object.values(storedApiKeys)) {
		if (key && !isEncrypted(key)) {
			needsMigration = true;
			break;
		}
	}

	if (!needsMigration) {
		return await decryptApiKeys(storedApiKeys, encryptionKey, userId);
	}

	const plainKeys: Record<string, string> = {};

	for (const [provider, key] of Object.entries(storedApiKeys)) {
		if (!key) continue;

		if (isEncrypted(key)) {
			plainKeys[provider] = await decryptApiKeys(
				{ [provider]: key },
				encryptionKey,
				userId,
			).then((result) => result[provider]);
		} else {
			plainKeys[provider] = key;
		}
	}

	const encryptedKeys = await encryptApiKeys(plainKeys, encryptionKey, userId);

	await db
		.update(userSettings)
		.set({
			apiKeys: JSON.stringify(encryptedKeys),
			updatedAt: new Date(),
		})
		.where(eq(userSettings.userId, userId));

	return plainKeys;
}
