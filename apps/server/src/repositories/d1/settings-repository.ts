import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS } from "@/server/domain/settings";
import {
	decryptApiKeys,
	encryptApiKeys,
	isEncrypted,
} from "@/server/infra/crypto";
import { db } from "@/server/infra/db";
import { userSettings } from "@/server/infra/db/schema/settings";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch (error) {
		console.warn("Failed to parse JSON value", { value, error });
		return fallback;
	}
}

async function ensureSettingsRow(userId: string): Promise<void> {
	const now = new Date();
	await db
		.insert(userSettings)
		.values({
			userId,
			selectedModel: DEFAULT_SETTINGS.selectedModel,
			apiKeys: JSON.stringify({}),
			enabledModels: JSON.stringify(DEFAULT_SETTINGS.enabledModels),
			enabledMcpServers: JSON.stringify(DEFAULT_SETTINGS.enabledMcpServers),
			webSearchEnabled: DEFAULT_SETTINGS.webSearchEnabled,
			reasoningEffort: DEFAULT_SETTINGS.reasoningEffort,
			theme: DEFAULT_SETTINGS.theme,
			chatWidth: DEFAULT_SETTINGS.chatWidth,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: userSettings.userId });
}

async function migrateApiKeysIfNeeded(
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

export async function getUserSettings(userId: string) {
	await ensureSettingsRow(userId);

	const row = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.get();

	if (!row) {
		return { ...DEFAULT_SETTINGS };
	}

	const storedApiKeys = parseJson<Record<string, string>>(row.apiKeys, {});
	const encryptionKey = env.API_ENCRYPTION_KEY;

	let apiKeys: Record<string, string> = {};

	if (!encryptionKey) {
		apiKeys = storedApiKeys;
	} else {
		apiKeys = await migrateApiKeysIfNeeded(userId, storedApiKeys);
	}

	return {
		selectedModel: row.selectedModel ?? DEFAULT_SETTINGS.selectedModel,
		apiKeys,
		enabledModels: parseJson<string[]>(row.enabledModels, []),
		enabledMcpServers: parseJson<string[]>(
			row.enabledMcpServers,
			DEFAULT_SETTINGS.enabledMcpServers,
		),
		webSearchEnabled: row.webSearchEnabled ?? DEFAULT_SETTINGS.webSearchEnabled,
		reasoningEffort:
			(row.reasoningEffort as "off" | "low" | "medium" | "high") ??
			DEFAULT_SETTINGS.reasoningEffort,
		theme: row.theme ?? DEFAULT_SETTINGS.theme,
		chatWidth: row.chatWidth ?? DEFAULT_SETTINGS.chatWidth,
	};
}

export async function updateUserSettings(
	userId: string,
	updates: Partial<{
		selectedModel: string;
		apiKeys: Record<string, string>;
		enabledModels: string[];
		enabledMcpServers: string[];
		webSearchEnabled: boolean;
		reasoningEffort: "off" | "low" | "medium" | "high";
		theme: string;
		chatWidth: string;
	}>,
) {
	await ensureSettingsRow(userId);

	const updateFields: Partial<typeof userSettings.$inferInsert> = {
		updatedAt: new Date(),
	};

	if (updates.selectedModel !== undefined) {
		updateFields.selectedModel = updates.selectedModel;
	}
	if (updates.enabledModels !== undefined) {
		updateFields.enabledModels = JSON.stringify(updates.enabledModels);
	}
	if (updates.enabledMcpServers !== undefined) {
		updateFields.enabledMcpServers = JSON.stringify(updates.enabledMcpServers);
	}
	if (updates.webSearchEnabled !== undefined) {
		updateFields.webSearchEnabled = updates.webSearchEnabled;
	}
	if (updates.reasoningEffort !== undefined) {
		updateFields.reasoningEffort = updates.reasoningEffort;
	}
	if (updates.theme !== undefined) {
		updateFields.theme = updates.theme;
	}
	if (updates.chatWidth !== undefined) {
		updateFields.chatWidth = updates.chatWidth;
	}

	if (updates.apiKeys !== undefined) {
		const current = await getUserSettings(userId);
		const merged = { ...current.apiKeys, ...updates.apiKeys };
		const encryptionKey = env.API_ENCRYPTION_KEY;

		if (encryptionKey) {
			const encrypted = await encryptApiKeys(merged, encryptionKey, userId);
			updateFields.apiKeys = JSON.stringify(encrypted);
		} else {
			updateFields.apiKeys = JSON.stringify(merged);
		}
	}

	await db
		.update(userSettings)
		.set(updateFields)
		.where(eq(userSettings.userId, userId));

	return getUserSettings(userId);
}
