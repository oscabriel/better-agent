import { protectedProcedure, publicProcedure } from "@/server/lib/orpc";
import { getUserSettings } from "../settings/queries";
import {
	getBYOKModels,
	getFreeModels,
	getModelCatalog,
	getUserAvailableModels,
} from "./utils";

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
		const userSettings = await getUserSettings(context.session.user.id);
		return getUserAvailableModels(userSettings.apiKeys || {});
	}),
} as const;
