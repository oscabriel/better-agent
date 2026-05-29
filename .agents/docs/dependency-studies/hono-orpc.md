# Hono + oRPC dependency study for Better Agent API routing and Better Chat router salvage

Date: 2026-05-27

## Scope and sources

Studied latest local clones via Offworld/replicant:

- `honojs/hono` at `hono@4.12.23` (`/Users/oscargabriel/Developer/clones/github/honojs/hono/package.json:1-4`).
- `middleapi/orpc` at `@orpc/*@1.14.3` (`/Users/oscargabriel/Developer/clones/github/middleapi/orpc/package.json:1-6`).

Inspected Better Agent API/server and Better Chat server routers listed in the task. Better Agent target domain constraints come from `CONTEXT.md` and ADRs: Cloudflare-native runtime and Thinkspace-owned durable state (`docs/adr/0001-cloudflare-native-agent-runtime.md`), split storage ownership (`docs/adr/0002-split-storage-ownership.md`), approvals for external mutations (`docs/adr/0003-draft-or-approval-for-external-mutations.md`), and Thinkspace-scoped tool enablement (`docs/adr/0004-thinkspace-scoped-tool-enablement.md`).

## Executive recommendations

1. **Keep the Hono server as the Cloudflare module-worker entrypoint and control-plane router.** Use `new Hono<{ Bindings: Env; Variables?: ... }>().basePath('/api')`, route Better Auth before oRPC, then mount oRPC handlers under explicit prefixes. Hono's `fetch(request, env, executionCtx)` is the app entrypoint and exposes Cloudflare bindings on `c.env` and `c.executionCtx` (`hono/src/hono-base.ts:468-485`, `hono/src/context.ts:300-315`, `hono/src/context.ts:391-397`).
2. **Adopt the Better Agent split: API package owns `appRouter`, `publicProcedure`, `protectedProcedure`, and type exports; app server owns Hono, CORS, auth, handler prefixes, and Cloudflare context creation.** Better Agent already follows this pattern (`better-agent/packages/api/src/index.ts:5-20`, `better-agent/packages/api/src/routers/index.ts:5-13`, `better-agent/apps/server/src/index.ts:36-68`).
3. **For oRPC on Hono, use the Fetch adapter; there is no dedicated Hono adapter required.** oRPC docs show `RPCHandler` from `@orpc/server/fetch` mounted with `app.use('/rpc/*')`, `handler.handle(c.req.raw, { prefix, context })`, and `c.newResponse(response.body, response)` (`orpc/apps/content/docs/adapters/hono.md:12-40`). The same Hono wrapper can host `RPCHandler`, `OpenAPIHandler`, or custom handlers (`orpc/apps/content/docs/adapters/hono.md:77-79`).
4. **Keep `/rpc` and REST/OpenAPI surfaces separate.** `RPCHandler` is proprietary, RPCLink-only, and not OpenAPI-compatible (`orpc/apps/content/docs/rpc-handler.md:6-12`). Use `OpenAPIHandler` for REST/OpenAPI and generated docs/specs (`orpc/apps/content/docs/openapi/openapi-handler.md:6-9`, `orpc/apps/content/docs/openapi/openapi-handler.md:66-90`).
5. **Port Better Chat routers only if they are product-control-plane capabilities, not chat runtime capabilities.** `models`, `mcp`, and `settings` are salvageable as account/product/Thinkspace configuration routers; `chat`, AI messages, usage shaped around chat turns, and UI-only settings should not define the Better Agent API core. Better Chat's current root router imports chat and AI types (`better-chat/apps/server/src/lib/router.ts:2-3`, `better-chat/apps/server/src/lib/router.ts:27-30`), which should be removed from the Better Agent router type surface.

## Hono current best practices for Cloudflare

### App structure and routing

- Prefer module-worker export: build one `Hono` app and `export default app`. Hono's `fetch` is the entrypoint and accepts the Cloudflare `Env` and `ExecutionContext` (`hono/src/hono-base.ts:468-485`).
- Type Cloudflare bindings at app creation: `new Hono<{ Bindings: Env }>()`. Hono's `Env` type has `Bindings` and `Variables` slots (`hono/src/types.ts:30-33`); Cloudflare bindings are exposed via `c.env` (`hono/src/context.ts:300-315`). Better Chat already does this with `new Hono<{ Bindings: Env }>().basePath('/api')` (`better-chat/apps/server/src/index.ts:13`).
- Use `.basePath('/api')` for a whole API subtree. Hono clones the app and merges the base path (`hono/src/hono-base.ts:234-252`). With this pattern, Hono route declarations are relative to `/api`; Better Chat's `/auth/*` route is externally `/api/auth/*` (`better-chat/apps/server/src/index.ts:13`, `better-chat/apps/server/src/index.ts:29`).
- Use `.route('/prefix', subApp)` for Hono sub-apps; Hono re-adds sub-app routes under the merged prefix (`hono/src/hono-base.ts:190-231`). Better Chat currently routes `aiRoutes` this way (`better-chat/apps/server/src/index.ts:44`), but Better Agent should avoid request-scoped chat/AI routes as the durable runtime surface.
- Middleware that calls `next` must `await next()` or return a response; otherwise Hono throws a finalization error (`hono/src/hono-base.ts:450-463`).

### CORS and auth route ordering

- Hono CORS supports static, array, or function origins plus method/header/credential/max-age/expose options (`hono/src/middleware/cors/index.ts:9-22`). Defaults are permissive (`origin: '*'`) and preflight returns `204` with appropriate CORS headers (`hono/src/middleware/cors/index.ts:63-70`, `hono/src/middleware/cors/index.ts:119-154`).
- If `credentials: true` is used with wildcard origin, Hono reflects the request origin because browsers reject wildcard credentials (`hono/src/middleware/cors/index.ts:72-80`). Production should use explicit configured origins, not a silent localhost fallback.
- Better Agent currently applies Hono CORS globally and routes Better Auth at `/api/auth/*` before oRPC handlers (`better-agent/apps/server/src/index.ts:23-34`). Better Chat does the same relative to `.basePath('/api')` (`better-chat/apps/server/src/index.ts:17-31`). Keep auth before oRPC so Better Auth owns its endpoints.
- oRPC also has a `CORSPlugin` usable with any oRPC handler (`orpc/apps/content/docs/plugins/cors.md:8-27`). Choose one CORS owner per prefix. If Hono owns all `/api/*` CORS, do not also add oRPC CORS plugins unless testing proves no duplicate/divergent preflight behavior. If oRPC handlers are exposed outside the Hono CORS scope, add `CORSPlugin` to those handlers.

### RPC/OpenAPI handlers in Hono

Recommended Hono shape for Better Agent:

```ts
const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: env.CORS_ORIGIN,
		credentials: true,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.use("/rpc/*", async (c, next) => {
	const result = await rpcHandler.handle(c.req.raw, {
		prefix: "/api/rpc",
		context: await createContext({ context: c }),
	});
	return result.matched ? c.newResponse(result.response.body, result.response) : next();
});

app.use("/openapi/*", async (c, next) => {
	const result = await openAPIHandler.handle(c.req.raw, {
		prefix: "/api/openapi",
		context: await createContext({ context: c }),
	});
	return result.matched ? c.newResponse(result.response.body, result.response) : next();
});
```

Notes:

- Because Better Chat uses `.basePath('/api')`, its current oRPC mount `app.use('/orpc/*')` and handler prefix `/api/orpc` are consistent with the raw URL including `/api/orpc` (`better-chat/apps/server/src/index.ts:13`, `better-chat/apps/server/src/index.ts:31-35`). Rename `/orpc` to `/rpc` only if the client surface is being cleaned up.
- Prefer `c.newResponse(response.body, response)` as shown in oRPC Hono docs (`orpc/apps/content/docs/adapters/hono.md:27-35`). Better Chat currently returns `response` directly (`better-chat/apps/server/src/index.ts:37-41`); that likely works because Hono handlers may return `Response`, but `c.newResponse` is the documented adapter pattern.
- If upstream Hono middleware reads the request body before oRPC, oRPC documents a proxy that delegates body parser methods to `c.req` (`orpc/apps/content/docs/adapters/hono.md:43-72`). Add this only if body-consumption errors appear.

## oRPC current best practices

### Context, procedures, middleware

- oRPC context is typed dependency injection. It distinguishes **initial context** passed to handlers from **execution context** injected by middleware (`orpc/apps/content/docs/context.md:8-12`). Use `os.$context<Context>()` for required request/env/db/session dependencies (`orpc/apps/content/docs/context.md:17-28`).
- Better Chat's `createContext` already passes session, D1 db, env, and headers (`better-chat/apps/server/src/lib/context.ts:10-19`). Better Agent's current `createContext` passes session only plus `auth: null` (`better-agent/packages/api/src/context.ts:8-18`). For Cloudflare-native Better Agent, the context should include `headers`, Cloudflare `env`/bindings, product DB access, and user/session where appropriate; Thinkspace runtime state should remain in Durable Objects per ADR 0001/0002.
- Procedure chains are `.use`, `.input`, `.output`, `.handler`; only `.handler` is required (`orpc/apps/content/docs/procedure.md:17-36`). Use Standard Schema validation such as Zod for inputs/outputs (`orpc/apps/content/docs/procedure.md:38-44`).
- oRPC middleware should inject or guard context and call `next`; additional context passed to `next` is merged (`orpc/apps/content/docs/middleware.md:63-98`). Better Agent's `protectedProcedure` and Better Chat's `protectedProcedure` both correctly guard `context.session` and narrow context (`better-agent/packages/api/src/index.ts:9-20`, `better-chat/apps/server/src/lib/orpc.ts:8-25`).
- Avoid duplicating auth middleware at router and procedure levels. oRPC docs warn router-level plus procedure-level `.use` can execute middleware multiple times (`orpc/apps/content/docs/router.md:27-44`).

### Router and type exports

- oRPC routers are plain nestable objects of procedures (`orpc/apps/content/docs/router.md:8-25`). This matches Better Chat's `appRouter` and feature routers (`better-chat/apps/server/src/lib/router.ts:10-23`).
- Export server-side types, not duplicated client shapes. oRPC exports `RouterClient`, `InferRouterInputs`, `InferRouterOutputs`, and context inference utilities from `@orpc/server` (`orpc/packages/server/src/index.ts:1-24`; router utility docs at `orpc/apps/content/docs/router.md:108-148`). Better Agent already exports `AppRouter` and `AppRouterClient` (`better-agent/packages/api/src/routers/index.ts:12-13`); Better Chat exports `RouterInputs`/`RouterOutputs` (`better-chat/apps/server/src/lib/router.ts:25-31`).
- For client packages, export `type AppRouter = typeof appRouter`, `type AppRouterClient = RouterClient<AppRouter>`, `type RouterInputs = InferRouterInputs<AppRouter>`, and `type RouterOutputs = InferRouterOutputs<AppRouter>` from a shared API module. Avoid exporting runtime server imports into frontend bundles.

### Version alignment and package set

- Latest studied oRPC monorepo is `1.14.3`; keep all `@orpc/*` packages on the same minor/patch (`orpc/package.json:1-6`). Better Agent currently catalogs `@orpc/server`, `@orpc/openapi`, `@orpc/zod`, and `@orpc/client` at `^1.13.14`, while Better Chat server only depends on `@orpc/server@^1.12.2` (`better-agent/package.json:15-18`, `better-agent/package.json:26`; `better-chat/apps/server/package.json:28`).
- For OpenAPI salvage, Better Chat will need `@orpc/openapi` and likely `@orpc/zod` aligned with `@orpc/server`; Better Agent already demonstrates `OpenAPIHandler`, `OpenAPIReferencePlugin`, and `ZodToJsonSchemaConverter` (`better-agent/apps/server/src/index.ts:7-11`, `better-agent/apps/server/src/index.ts:36-43`).
- Latest studied Hono is `4.12.23`; Better Chat is on `^4.10.8`, Better Agent catalog on `^4.8.2` (`hono/package.json:1-4`; `better-chat/apps/server/package.json:35`; `better-agent/package.json:15`). No breaking source-level issue was found for the patterns above, but align/test before copying code between repos.

## Better Chat router salvage guidance

### Keep and port: models router

Current shape:

- Public model catalog/list/free/BYOK endpoints (`better-chat/apps/server/src/features/models/routes.ts:10-21`).
- Protected available-model endpoint using the user's settings/API keys (`better-chat/apps/server/src/features/models/routes.ts:23-26`).

Porting guidance:

- Keep as a **model catalog/configuration router**, not as chat model selection. Rename outputs/fields where needed to product language: available models for an account or Thinkspace, not chat defaults.
- `list`, `listFree`, and `listBYOK` can remain public if they expose only static catalog metadata.
- `listAvailable` should remain protected and should derive availability from account settings and/or Thinkspace Permissions. Do not infer tool/model availability globally for every Thinkspace.
- Add explicit `.output(...)` schemas or handler return types for TypeScript performance and OpenAPI quality; oRPC recommends explicit output or return type for faster inference (`orpc/apps/content/docs/procedure.md:42-44`).

### Keep with domain changes: MCP router

Current shape:

- Protected list of all MCP servers for a user (`better-chat/apps/server/src/features/tools/mcp/routes.ts:20-23`).
- Add custom MCP server with name/url/type/description/headers (`better-chat/apps/server/src/features/tools/mcp/routes.ts:7-13`, `better-chat/apps/server/src/features/tools/mcp/routes.ts:25-47`).
- Toggle and remove servers by `serverId` (`better-chat/apps/server/src/features/tools/mcp/routes.ts:49-74`).

Porting guidance:

- Split product-level MCP catalog management from Thinkspace-scoped enablement. ADR 0004 says catalogs may exist at product level, but no tool is exposed to a Thinkspace Agent by default; tools must be explicitly enabled for that Thinkspace.
- Replace global `toggleServer(userId, serverId, enabled)` semantics with something like `enableForThinkspace({ thinkspaceId, serverId })` / `disableForThinkspace(...)`, gated by Permission/Approval policy where external effects are possible.
- Treat `headers` as sensitive connected-account or credential material, not ordinary settings. Do not return raw headers in list responses. Consider separate mutation for credential update and redacted output.
- Replace `serverId = custom_${Date.now()}` with durable ID generation suitable for D1/DO state and tests. Date-based IDs are hard to validate and can collide under concurrency.
- Throw `ORPCError` for user-facing procedure failures instead of raw `Error`, so clients receive typed errors; current built-in delete guard throws `new Error('Cannot delete built-in servers')` (`better-chat/apps/server/src/features/tools/mcp/routes.ts:65-70`).

### Keep selectively: settings router

Current shape:

- Protected get ensures settings row and returns user settings (`better-chat/apps/server/src/features/settings/routes.ts:20-25`).
- Protected update accepts selected model, API keys, enabled models/MCP servers, web search, reasoning effort, theme, chat width (`better-chat/apps/server/src/features/settings/routes.ts:9-18`, `better-chat/apps/server/src/features/settings/routes.ts:27-31`).

Porting guidance:

- Split into account preferences, secret/API key management, and Thinkspace defaults. `theme` and `chatWidth` are UI preferences; `apiKeys` are sensitive account/connected-account material; `enabledMcpServers` and model enablement are Thinkspace-scoped or policy-scoped in Better Agent.
- Keep `reasoningEffort`/model preferences only if framed as defaults for new Thinkspaces or per-Thinkspace configuration, not as chat-thread state.
- Use narrower mutation schemas. A single broad optional update object is easy for clients to misuse and hard to approve/audit.

### Do not port as API core without redesign

- Better Chat's root `appRouter` imports `chatRouter` and exports AI message types from server AI modules (`better-chat/apps/server/src/lib/router.ts:2`, `better-chat/apps/server/src/lib/router.ts:27-30`). Better Agent ADR 0001 says durable Thinkspace Agent runtimes own messages/tool runs/approvals/memory, while product APIs are the control plane. Keep chat-turn procedures out of the main control-plane router unless redesigned as Thinkspace interaction/runtime commands.
- Usage/profile routers were not in the task's detailed local file list. Treat them as unknown until inspected; port only if they are account/product metadata rather than chat-session state.

## Proposed target router shape

```ts
export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	models: modelsRouter,
	mcpCatalog: mcpCatalogRouter,
	thinkspaceTools: thinkspaceToolsRouter,
	accountSettings: accountSettingsRouter,
	thinkspaceSettings: thinkspaceSettingsRouter,
} as const;

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
export type RouterInputs = InferRouterInputs<AppRouter>;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
```

Principles:

- Router keys should name product capabilities, not chat UI surfaces.
- Mutations that can affect external systems should create drafts or require Approvals per ADR 0003.
- Tool/model enablement should be scoped to a Thinkspace per ADR 0004.
- Durable runtime state should remain in Thinkspace Agent Durable Objects, with D1 used for account/catalog/index metadata per ADR 0001/0002.

## Validation and acceptance criteria

### Dependency/API alignment

- `@orpc/server`, `@orpc/client`, `@orpc/openapi`, and `@orpc/zod` are present only where needed and pinned/aligned to the same minor/patch.
- Hono is upgraded/aligned across Better Agent and Better Chat salvage work, then type-checks and runtime smoke tests pass.
- No code imports a nonexistent oRPC Hono adapter; Hono integration uses `@orpc/server/fetch` and optionally `@orpc/openapi/fetch`.

### Hono runtime behavior

- Cloudflare worker default export is a Hono app typed with `Bindings: Env`.
- `/api/auth/*` reaches Better Auth for `GET` and `POST`.
- `/api/rpc/*` reaches `RPCHandler` with the correct prefix and context.
- Optional `/api/openapi/*` or `/api-reference/*` reaches `OpenAPIHandler`/reference plugins with aligned schema converters.
- CORS preflight for auth and RPC returns expected `204` and headers for configured origins; credentials are not paired with an unsafe wildcard in production.
- Hono middleware either returns a response or awaits/returns `next()`; no “Context is not finalized” errors.

### oRPC type and validation behavior

- `createContext` returns typed `headers`, `env`/bindings, db/index access, and nullable session. Protected procedures narrow session to non-null.
- Public procedures are used only for static/non-sensitive catalog reads and health checks.
- Protected procedures throw `ORPCError('UNAUTHORIZED')` for missing sessions and typed `ORPCError` variants for expected domain failures.
- All mutations have `.input(...)` schemas; OpenAPI-exposed procedures have explicit output schemas or handler return types.
- Server/shared API modules export `AppRouter`, `AppRouterClient`, `RouterInputs`, and `RouterOutputs` as types without forcing frontend bundles to import Cloudflare/server runtime values.

### Router salvage behavior

- `models` router has no dependency on chat messages, chat sessions, or UI chat width; protected availability is account/Thinkspace-aware.
- `mcp` salvage separates product catalog/custom-server CRUD from Thinkspace-specific enablement and does not globally expose tools to every Thinkspace.
- MCP credentials/headers are write-only or redacted in outputs.
- Settings are split so UI preferences, secrets, account defaults, and Thinkspace defaults are not updated through one broad chat-era mutation.
- Root `appRouter` no longer imports `chatRouter` or exports AI chat message types unless those have been redesigned as Better Agent Thinkspace runtime APIs.

## Main risks

- **Semantic drift from Better Chat.** Existing router names and settings fields encode chat assumptions; blindly copying them would conflict with Better Agent terminology and ADRs.
- **Global tool exposure.** `enabledMcpServers` and user-level toggles are unsafe for Better Agent unless scoped to a Thinkspace and Permission.
- **Secret leakage.** MCP `headers` and model `apiKeys` must not be listed back to clients as ordinary settings.
- **Mixed oRPC versions.** Better Chat (`@orpc/server@^1.12.2`) and Better Agent (`^1.13.14`) lag the studied `1.14.3`; adding OpenAPI packages without alignment can create subtle type/runtime mismatches.
- **Prefix mistakes with Hono `.basePath`.** Handler `prefix` must match the raw external URL (`/api/rpc` if the Hono app uses `.basePath('/api')` and the route is `/rpc/*`).
