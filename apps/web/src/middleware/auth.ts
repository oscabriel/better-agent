import { createAuth } from "@better-agent/auth";
import { createDb } from "@better-agent/db";
import { env } from "@better-agent/env/server";
import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
	const session = await createAuth({
		db: createDb(env.DB),
		env,
	}).api.getSession({
		headers: request.headers,
	});

	return next({
		context: { session },
	});
});
