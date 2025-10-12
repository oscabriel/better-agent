import { z } from "zod";
import { protectedProcedure } from "@/server/lib/orpc";
import {
	ensureSettingsRow,
	updateUserSettings as updateUserSettingsMutation,
} from "./mutations";
import { getUserSettings as getUserSettingsQuery } from "./queries";

const updateSettingsSchema = z.object({
	selectedModel: z.string().optional(),
	apiKeys: z.record(z.string(), z.string()).optional(),
	enabledModels: z.array(z.string()).optional(),
	enabledMcpServers: z.array(z.string()).optional(),
	webSearchEnabled: z.boolean().optional(),
	reasoningEffort: z.enum(["off", "low", "medium", "high"]).optional(),
	theme: z.string().optional(),
	chatWidth: z.string().optional(),
});

export const settingsRouter = {
	get: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		await ensureSettingsRow(userId);
		return await getUserSettingsQuery(userId);
	}),

	update: protectedProcedure
		.input(updateSettingsSchema)
		.handler(async ({ context, input }) => {
			return await updateUserSettingsMutation(context.session.user.id, input);
		}),
} as const;
