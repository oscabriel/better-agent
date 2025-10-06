import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { publicProcedure } from "@/server/lib/orpc";
import { chatRouter } from "./chat-router";
import { mcpRouter } from "./mcp-router";
import { modelsRouter } from "./models-router";
import { profileRouter } from "./profile-router";
import { usageRouter } from "./usage-router";
import { userSettingsRouter } from "./user-settings-router";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	helloFrom: publicProcedure.handler(() => {
		return "CF+Hono+oRPC";
	}),
	chat: chatRouter,
	mcp: mcpRouter,
	models: modelsRouter,
	usage: usageRouter,
	settings: userSettingsRouter,
	profile: profileRouter,
} as const;

export type AppRouter = typeof appRouter;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type {
	AppMessageMetadata,
	AppUIMessage,
} from "@/server/domain/ui-messages";
export type RouterInputs = InferRouterInputs<AppRouter>;
