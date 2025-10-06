import { z } from "zod";
import { protectedProcedure } from "@/server/lib/orpc";
import { UserSettingsService } from "@/server/services/users/user-settings-service";

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

export const userSettingsRouter = {
	get: protectedProcedure.handler(async ({ context }) => {
		const service = new UserSettingsService();
		return await service.getSettings(context.session.user.id);
	}),

	update: protectedProcedure
		.input(updateSettingsSchema)
		.handler(async ({ context, input }) => {
			const service = new UserSettingsService();
			return await service.updateSettings(context.session.user.id, input);
		}),
} as const;
