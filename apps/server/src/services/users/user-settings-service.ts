import type { UserSettingsRecord } from "@/server/domain/settings";
import {
	getUserSettings,
	updateUserSettings,
} from "@/server/repositories/d1/settings-repository";

export class UserSettingsService {
	async getSettings(userId: string): Promise<UserSettingsRecord> {
		return await getUserSettings(userId);
	}

	async updateSettings(
		userId: string,
		updates: Partial<UserSettingsRecord>,
	): Promise<UserSettingsRecord> {
		return await updateUserSettings(userId, updates);
	}

	async updateAPIKeys(
		userId: string,
		apiKeys: Record<string, string>,
	): Promise<UserSettingsRecord> {
		return await updateUserSettings(userId, { apiKeys });
	}

	async updateSelectedModel(
		userId: string,
		modelId: string,
	): Promise<UserSettingsRecord> {
		return await updateUserSettings(userId, { selectedModel: modelId });
	}

	async updateTheme(
		userId: string,
		theme: string,
	): Promise<UserSettingsRecord> {
		return await updateUserSettings(userId, { theme });
	}

	async updateChatWidth(
		userId: string,
		chatWidth: string,
	): Promise<UserSettingsRecord> {
		return await updateUserSettings(userId, { chatWidth });
	}
}
