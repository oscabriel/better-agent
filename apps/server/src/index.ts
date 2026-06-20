import { appRouter, createContext } from "@better-agent/api";
import {
	CURATION_FORWARD_CONTEXT_HEADER,
	encodeCurationForwardContext,
	parseCurationDraftThinkspaceId,
} from "@better-agent/api/curator/forward-context";
import { getOwnedCuratorAgentRuntimeReadiness } from "@better-agent/api/curator/runtime";
import { getOwnedThinkspaceAgentRuntimeReadiness } from "@better-agent/api/thinkspaces/runtime";
import {
	encodeSittingForwardContext,
	parseSittingThinkspaceId,
	SITTING_FORWARD_CONTEXT_HEADER,
} from "@better-agent/api/thinkspaces/sittings";
import { createAuth } from "@better-agent/auth";
import { createDb } from "@better-agent/db";
import { env } from "@better-agent/env/server";
import type { CloudflareEnv } from "@better-agent/env/types";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { getAgentByName } from "agents";
import { Hono } from "hono";
import type { ErrorHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

export { CuratorAgent } from "./agents/curator-agent";
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

/**
 * The one authenticated seam by which browser traffic reaches a Thinkspace
 * Agent runtime: a Sitting. The worker verifies the Better Auth session and
 * Thinkspace ownership (the same gate the owner-gated turn procedures use), then
 * strips any client-supplied forward header and stamps its own authenticated
 * (owner, Thinkspace) context before handing the request to the runtime resolved
 * by Thinkspace id. Project Think's chat protocol takes it from there. Every
 * other outcome — bad path, unauthenticated, non-owner, missing Thinkspace —
 * returns the same 404, so ownership stays the only signal.
 */
app.use("/api/sittings/*", async (c) => {
	const thinkspaceId = parseSittingThinkspaceId(new URL(c.req.url).pathname);

	if (!thinkspaceId) {
		return c.notFound();
	}

	const db = createDb(c.env.DB);
	const session = await createAuth({ db, env: c.env }).api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user) {
		return c.notFound();
	}

	const readiness = await getOwnedThinkspaceAgentRuntimeReadiness({
		db,
		env: c.env,
		ownerUserId: session.user.id,
		thinkspaceId,
	});

	if (!readiness) {
		return c.notFound();
	}

	const forwardHeaders = new Headers(c.req.raw.headers);
	forwardHeaders.delete(SITTING_FORWARD_CONTEXT_HEADER);
	forwardHeaders.set(
		SITTING_FORWARD_CONTEXT_HEADER,
		encodeSittingForwardContext({ ownerUserId: session.user.id, thinkspaceId }),
	);

	const runtime = await getAgentByName(
		c.env.THINKSPACE_AGENT as unknown as Parameters<typeof getAgentByName>[0],
		readiness.runtimeName,
	);

	return runtime.fetch(new Request(c.req.raw, { headers: forwardHeaders }));
});

/**
 * The one authenticated seam by which browser traffic reaches a Curator runtime:
 * the creation conversation over a draft Thinkspace. Mirrors the Sitting seam
 * exactly — the worker verifies the Better Auth session and draft ownership, then
 * strips any client-supplied forward header and stamps its own authenticated
 * (owner, draft) context before handing the request to the runtime resolved by
 * draft id. Every other outcome — bad path, unauthenticated, non-owner, missing
 * draft — returns the same 404, so ownership stays the only signal.
 */
app.use("/api/curator/*", async (c) => {
	const draftThinkspaceId = parseCurationDraftThinkspaceId(new URL(c.req.url).pathname);

	if (!draftThinkspaceId) {
		return c.notFound();
	}

	const db = createDb(c.env.DB);
	const session = await createAuth({ db, env: c.env }).api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user) {
		return c.notFound();
	}

	const readiness = await getOwnedCuratorAgentRuntimeReadiness({
		db,
		draftThinkspaceId,
		env: c.env,
		ownerUserId: session.user.id,
	});

	if (!readiness) {
		return c.notFound();
	}

	const forwardHeaders = new Headers(c.req.raw.headers);
	forwardHeaders.delete(CURATION_FORWARD_CONTEXT_HEADER);
	forwardHeaders.set(
		CURATION_FORWARD_CONTEXT_HEADER,
		encodeCurationForwardContext({ draftThinkspaceId, ownerUserId: session.user.id }),
	);

	const runtime = await getAgentByName(
		c.env.CURATOR_AGENT as unknown as Parameters<typeof getAgentByName>[0],
		readiness.runtimeName,
	);

	return runtime.fetch(new Request(c.req.raw, { headers: forwardHeaders }));
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
