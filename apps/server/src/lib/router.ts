import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { chatRouter } from "@/server/features/chat/routes";
import { modelsRouter } from "@/server/features/models/routes";
import { profileRouter } from "@/server/features/profile/routes";
import { settingsRouter } from "@/server/features/settings/routes";
import { mcpRouter } from "@/server/features/tools/mcp/routes";
import { usageRouter } from "@/server/features/usage/routes";
import { publicProcedure } from "./orpc";

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
	settings: settingsRouter,
	profile: profileRouter,
} as const;

export type AppRouter = typeof appRouter;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
export type {
	AppMessageMetadata,
	AppUIMessage,
} from "@/server/features/ai/types";
export type RouterInputs = InferRouterInputs<AppRouter>;
