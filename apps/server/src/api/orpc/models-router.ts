import { protectedProcedure, publicProcedure } from "@/server/lib/orpc";
import {
	getBYOKModels,
	getFreeModels,
	getModelCatalog,
	getUserAvailableModels,
} from "@/server/services/models/model-catalog";
import { UserSettingsService } from "@/server/services/users/user-settings-service";

export const modelsRouter = {
	list: publicProcedure.handler(() => {
		return getModelCatalog();
	}),

	listFree: publicProcedure.handler(() => {
		return getFreeModels();
	}),

	listBYOK: publicProcedure.handler(() => {
		return getBYOKModels();
	}),

	listAvailable: protectedProcedure.handler(async ({ context }) => {
		const settingsService = new UserSettingsService();
		const userSettings = await settingsService.getSettings(
			context.session.user.id,
		);
		return getUserAvailableModels(userSettings.apiKeys || {});
	}),
} as const;
