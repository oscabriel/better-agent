import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { userSettings } from "@/server/db/d1/schema/settings";
import { encryptApiKeys } from "@/server/lib/crypto";
import { getSettingsRow, getUserSettings } from "./queries";
import { DEFAULT_SETTINGS } from "./types";
import { migrateApiKeysIfNeeded, parseJson } from "./utils";

export async function ensureSettingsRow(userId: string): Promise<void> {
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
		const row = await getSettingsRow(userId);

		const currentApiKeys = row
			? parseJson<Record<string, string>>(row.apiKeys, {})
			: {};
		const encryptionKey = env.API_ENCRYPTION_KEY;

		let currentDecrypted = currentApiKeys;
		if (encryptionKey) {
			currentDecrypted = await migrateApiKeysIfNeeded(userId, currentApiKeys);
		}

		const merged = { ...currentDecrypted, ...updates.apiKeys };

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
