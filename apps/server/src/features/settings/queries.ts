import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/d1";
import { userSettings } from "@/server/db/d1/schema/settings";
import { DEFAULT_SETTINGS } from "./types";
import { migrateApiKeysIfNeeded, parseJson } from "./utils";

export async function getUserSettings(userId: string) {
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

export async function getSettingsRow(userId: string) {
	return await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.get();
}
