import type { InferRouterInputs, InferRouterOutputs, RouterClient } from "@orpc/server";

import { mcpRouter } from "../mcp/router";
import { modelsRouter } from "../models/router";
import { profileRouter } from "../profile/router";
import { publicProcedure } from "../procedures";
import { sourcesRouter } from "../sources/router";
import { thinkspacesRouter } from "../thinkspaces/router";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	mcp: mcpRouter,
	models: modelsRouter,
	profile: profileRouter,
	sources: sourcesRouter,
	thinkspaces: thinkspacesRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
