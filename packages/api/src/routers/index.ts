import type { InferRouterInputs, InferRouterOutputs, RouterClient } from "@orpc/server";

import { publicProcedure } from "../procedures";
import { thinkspacesRouter } from "../thinkspaces/router";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	thinkspaces: thinkspacesRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
