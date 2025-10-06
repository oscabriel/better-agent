import { env } from "cloudflare:workers";
import type { Context as HonoContext } from "hono";
import { auth } from "@/server/infra/auth";
import { db } from "@/server/infra/db";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	return {
		session,
		db,
		env,
		headers: context.req.raw.headers,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
