import { env } from "cloudflare:workers";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { aiRoutes } from "./features/ai/routes";
import { auth } from "./lib/auth";
import { createContext } from "./lib/context";
import { appRouter } from "./lib/router";

export { UserDurableObject } from "./db/do/user-durable-object";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

const rpcHandler = new RPCHandler(appRouter);

app.use(logger());

app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN || "http://localhost:3001",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "User-Agent"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw));

app.use("/orpc/*", async (c) => {
	const { matched, response } = await rpcHandler.handle(c.req.raw, {
		prefix: "/api/orpc",
		context: await createContext({ context: c }),
	});

	if (!matched || !response) {
		return c.notFound();
	}

	return response;
});

app.route("/ai", aiRoutes);

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
