import { createAuth } from "@better-agent/auth";
import { createDb } from "@better-agent/db";
import type { CloudflareEnv } from "@better-agent/env/types";

export type ControlPlaneEnv = CloudflareEnv;

export interface CreateContextOptions {
	env: ControlPlaneEnv;
	executionCtx?: ExecutionContext;
	headers: Headers;
}

export const createContext = async ({ env, executionCtx, headers }: CreateContextOptions) => {
	const db = createDb(env.DB);
	const session = await createAuth({ db, env }).api.getSession({
		headers,
	});

	return {
		db,
		env,
		executionCtx,
		headers,
		session,
	};
};

export type Context = Awaited<ReturnType<typeof createContext>>;
