import { appRouter, createContext } from "@better-agent/api";
import { createAuth } from "@better-agent/auth";
import { createDb } from "@better-agent/db";
import { env } from "@better-agent/env/server";
import type { CloudflareEnv } from "@better-agent/env/types";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import type { ErrorHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

export { ThinkspaceAgent } from "./agents/thinkspace-agent";

const app = new Hono<{ Bindings: CloudflareEnv }>();

const logError = (error: unknown) => {
	console.error(error);
};

const errorHandler: ErrorHandler<{ Bindings: CloudflareEnv }> = (error, c) => {
	logError(error);

	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	return c.json({ error: "Internal Server Error" }, 500);
};

const apiHandler = new OpenAPIHandler(appRouter, {
	interceptors: [onError(logError)],
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
});

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [onError(logError)],
});

app.use(logger());
app.use(
	"/*",
	cors({
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: true,
		origin: env.CORS_ORIGIN,
	}),
);

app.on(["GET", "POST"], "/api/auth/*", (c) =>
	createAuth({
		db: createDb(c.env.DB),
		env: c.env,
	}).handler(c.req.raw),
);

app.use("/api/rpc/*", async (c, next) => {
	const result = await rpcHandler.handle(c.req.raw, {
		context: await createContext({
			env: c.env,
			executionCtx: c.executionCtx,
			headers: c.req.raw.headers,
		}),
		prefix: "/api/rpc",
	});

	if (!result.matched) {
		return next();
	}

	return c.newResponse(result.response.body, result.response);
});

app.use("/api/openapi/*", async (c, next) => {
	const result = await apiHandler.handle(c.req.raw, {
		context: await createContext({
			env: c.env,
			executionCtx: c.executionCtx,
			headers: c.req.raw.headers,
		}),
		prefix: "/api/openapi",
	});

	if (!result.matched) {
		return next();
	}

	return c.newResponse(result.response.body, result.response);
});

app.onError(errorHandler);

app.get("/", (c) => c.text("OK"));
app.get("/api/health", (c) => c.text("OK"));

const worker: ExportedHandler = {
	fetch(request, bindings, executionCtx) {
		return app.fetch(request, bindings as CloudflareEnv, executionCtx);
	},
};

export default worker;
