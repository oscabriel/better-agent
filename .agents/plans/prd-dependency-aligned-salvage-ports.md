# PRD: Dependency-Aligned Better Chat Salvage Ports for Better Agent

## Status

Draft created from:

- `CONTEXT.md`
- ADRs `0001` through `0005`
- GitHub issue `#3`: `PRD: Replace Better Chat product core with the first Better Agent Thinkspace slice`
- `docs/salvage-map-better-chat.md`
- local source inspection of:
  - `/Users/oscargabriel/Developer/projects/better-agent`
  - `/Users/oscargabriel/Developer/projects/better-chat`
- dependency research briefs in `dependency-studies/` produced by dedicated subagents using the `replicant` extension where available:
  - `dependency-studies/better-auth.md`
  - `dependency-studies/tanstack-web.md`
  - `dependency-studies/cloudflare-alchemy-agents.md`
  - `dependency-studies/hono-orpc.md`
  - `dependency-studies/drizzle-d1.md`
  - `dependency-studies/ai-sdk-models.md`
  - `dependency-studies/mcp.md`
  - `dependency-studies/react-ui-tailwind.md`
- additional direct `replicant` evidence for Better Auth, TanStack, oRPC, Alchemy, Drizzle, Hono, Vercel AI SDK, Tailwind, React, and Cloudflare Agents.

## Problem Statement

Better Agent should use `/Users/oscargabriel/Developer/projects/better-agent` as the new implementation base and treat `/Users/oscargabriel/Developer/projects/better-chat` as a selective salvage source. The existing salvage map identifies which Better Chat modules are worth porting, quarantining, or rejecting, but it does not yet turn those decisions into a dependency-aware implementation PRD.

This matters because the target base is on newer major/minor dependency lines than Better Chat:

- Better Agent uses Better Auth `1.6.11`; Better Chat uses Better Auth `1.4.5`.
- Better Agent uses AI SDK `6.x`; Better Chat uses AI SDK `5.x`.
- Better Agent uses TanStack Start and newer Router/Query packages; Better Chat is a Vite-only app with older Router/Query packages.
- Better Agent has package seams for `api`, `auth`, `db`, `env`, `infra`, and `ui`; Better Chat has mature code mostly inside `apps/server/src` and `apps/web/src`.
- Better Agent has an Alchemy/TanStack Start scaffold; Better Chat has richer Cloudflare production deployment knowledge.

Blindly copying Better Chat code would preserve older APIs, chat-first assumptions, user-global tool settings, plaintext MCP header storage, request-scoped `/ai` completion, and a per-user Durable Object. Those conflict with Better Agent's target domain and with the current source/docs of the dependencies we are building on.

This PRD defines how to port the valuable Better Chat infrastructure into Better Agent while aligning each port with current dependency best practices and the Better Agent domain model.

## Product Goal

Implement a dependency-aligned salvage layer in `better-agent` that ports only target-aligned Better Chat infrastructure needed for the first Better Agent Thinkspace slice:

- richer auth;
- D1 schema and migration foundations;
- model catalog and BYOK configuration;
- MCP catalog and credential infrastructure;
- settings/profile/provider UI;
- reusable UI primitives;
- Cloudflare/Alchemy deployment knowledge;
- API routing patterns;
- TanStack route/query patterns.

The result should make Better Agent ready to build and ship the first Thinkspace list/create/detail/archive product slice — where `/thinkspaces` is a Thinkspace list with a Review Queue entry point — without reintroducing Better Chat's chat-first runtime model or a producer-side orchestration dashboard.

## Non-Negotiable Domain Constraints

- Better Agent is the product name.
- Thinkspace is the top-level work container.
- Goal is the bounded outcome a Thinkspace is created around.
- Coordinator is a setup/routing role and the per-user owner of the Review Queue; it is not a global assistant.
- Thinkspace Agent is the future bounded runtime for one Thinkspace.
- Connected Account does not grant Thinkspace access by itself.
- Permission is Thinkspace-scoped possible access.
- Approval is user consent for an action within a Permission; an Approval is a holdpoint that enters the Review Queue.
- Source is input material; Memory is retained understanding; Artifact is durable output.
- Audit Trail is user-facing Thinkspace history, not developer logs.
- Attention is the scarce serial resource the product is architected around; agent supply is not the constraint.
- Review Queue is the batched, prioritized, cross-Thinkspace set of items awaiting the user's judgement (pending Approvals, drafts, Memory to accept, Goal assessments).
- Backpressure paces Thinkspace Agent production to the user's review rate; the product must never auto-merge work past the user's judgement, and must not sell agent count or live activity over shipped, understood outcomes.

## Architecture Constraints From ADRs

- ADR-0001: target runtime is Cloudflare-native; future primary runtime identity is one Thinkspace Agent runtime per Thinkspace.
- ADR-0002: D1 stores product indexes and authorization metadata; Durable Object SQLite stores Thinkspace runtime-local state; R2 stores large Sources and Artifacts.
- ADR-0003: external mutations default to drafts or explicit Approvals.
- ADR-0004: tools and Skills are explicitly enabled per Thinkspace and never globally inherited by default.
- ADR-0005: the product is architected around the user's Attention; judgement-bearing work batches under Backpressure into a per-user Review Queue owned by the Coordinator and never auto-merges. The landing surface is a Thinkspace list with a Review Queue entry point, not a producer-side orchestration dashboard.

## Dependency-Informed Implementation Decisions

### 1. Better Auth Port

#### Source modules

Port from Better Chat:

- `apps/server/src/lib/auth.ts`
- `apps/server/src/db/d1/schema/auth.ts`, selectively
- `apps/web/src/lib/auth-client.ts`
- `apps/web/src/routes/auth/-components/*`, selectively

Target in Better Agent:

- `packages/auth/src/index.ts`
- `packages/db/src/schema/auth.ts`
- `apps/web/src/lib/auth-client.ts`
- `apps/web/src/components` or `apps/web/src/routes/login.tsx`

#### Dependency guidance

Better Agent already uses Better Auth `1.6.11`. Better Chat uses `1.4.5`. This is a version port, not a copy.

Current Better Auth guidance from source/docs:

- `betterAuth(options)` returns an `Auth` object with `handler`, `api`, `options`, `$context`, and inferred types.
- On Hono/Workers, mount only `GET`/`POST` auth requests and pass `c.req.raw` to `auth.handler`.
- `basePath` defaults to `/api/auth`, but should be set explicitly to keep Worker route, client base URL, and OAuth callback URLs aligned.
- Drizzle/D1 remains valid through `drizzleAdapter(db, { provider: "sqlite", schema })`, but Better Auth also has newer native D1 support. For this repo, keep Drizzle because `packages/db` owns schema/migrations.
- `emailOTP` still exists, but OTP storage, resend/attempt limits, rate limiting, and production email delivery must be configured deliberately.
- `secondaryStorage` is valid for KV-backed short-lived auth/session/rate-limit state, but should not be copied unless `SESSION_KV` exists in Alchemy bindings.

#### Requirements

- Keep `@better-agent/auth` as the package boundary.
- Extend `createAuth()` with only the selected Better Chat auth features:
  - Google OAuth if desired;
  - GitHub OAuth if desired;
  - email OTP if desired;
  - session KV/cookie cache only if a KV binding is added.
- Set `basePath: "/api/auth"` explicitly on server and client.
- Keep Better Agent's Better Auth `1.6.11` baseline.
- Reconcile auth schema by starting from Better Agent's current `timestamp_ms` schema, then adding useful indexes from Better Chat, such as provider/account lookup, if compatible.
- Do not overwrite Better Agent's auth schema with Better Chat's older `timestamp` schema.
- If enabling email OTP:
  - add `emailOTPClient()` to the web client;
  - add Resend or selected email provider bindings;
  - make dev OTP logging explicit and stage-gated;
  - avoid unbound `SESSION_KV`/`RESEND_API_KEY` references.

#### Acceptance criteria

- `GET`/`POST /api/auth/*` work through Hono and Better Auth.
- `auth.api.getSession({ headers })` works in oRPC/Start context.
- Email/password or selected passwordless sign-in works locally.
- Selected OAuth providers work in staging with correct callback URLs.
- Missing optional provider secrets fail at deploy/start only when the feature is enabled.
- No `better-auth@1.4.5` assumptions remain.

### 2. TanStack Router / Query / Start Web Port

#### Source modules

Port concepts from Better Chat:

- `apps/web/src/lib/route-guards.ts`
- `apps/web/src/lib/orpc.ts`
- `apps/web/src/routes/settings/route.tsx`
- settings child routes and components
- query/mutation hooks such as `use-user-settings`

Target in Better Agent:

- `apps/web/src/router.tsx`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/_authenticated.tsx`
- `apps/web/src/routes/_authenticated/thinkspaces.*`
- `apps/web/src/routes/_authenticated/settings.*`
- `apps/web/src/utils/orpc.ts`
- `apps/web/src/functions/*`

#### Dependency guidance

Better Agent uses TanStack Start, Router SSR Query integration, and newer Router/Query packages. Better Chat is Vite-only and older.

Current TanStack guidance:

- Use file-based routing with generated `routeTree.gen.ts`; do not hand-edit the route tree.
- Use `_` pathless layout routes for auth-guarded areas.
- Use `beforeLoad` for auth redirects; it runs before child route loading.
- Use Router context for `queryClient`, `orpc`, and other stable service dependencies.
- Use route loaders to call `context.queryClient.ensureQueryData(context.orpc.*.queryOptions(...))` for critical route data.
- Use `@tanstack/react-router-ssr-query` with a per-request QueryClient for SSR/authenticated data safety.
- Start server functions are direct RPC endpoints; route guards do not secure them. Sensitive `createServerFn`s need middleware/handler auth checks.

#### Requirements

- Replace current scaffold `/dashboard` and `/ai` primary nav with Thinkspace routes.
- Add an authenticated pathless route, for example:

```txt
apps/web/src/routes/_authenticated.tsx
apps/web/src/routes/_authenticated/thinkspaces.route.tsx
apps/web/src/routes/_authenticated/thinkspaces.index.tsx
apps/web/src/routes/_authenticated/thinkspaces.create.tsx
apps/web/src/routes/_authenticated/thinkspaces.$thinkspaceId.tsx
apps/web/src/routes/_authenticated/settings.route.tsx
```

- Use `beforeLoad` to fetch/session-check and redirect unauthenticated users to the chosen login route with a redirect search param.
- Keep `HeadContent`, `Outlet`, and `Scripts` in the Start root document.
- Use route loaders + `ensureQueryData` for Thinkspace list/detail/create-review/settings data.
- Salvage Better Chat settings shell layout mechanics, but rewrite copy and route constants to Better Agent language.
- Verify QueryClient isolation for SSR/authenticated data.

#### Acceptance criteria

- `/thinkspaces` is the authenticated landing surface.
- Unauthenticated Thinkspace/settings routes redirect before child loaders execute.
- Critical Thinkspace page data is loaded through route loaders and oRPC query options.
- `routeTree.gen.ts` is generated by TanStack tooling.
- No primary navigation points to `/ai` or `/chat`.
- No user-facing copy uses chat/thread/workspace/project/task when Better Agent terms apply.

### 3. Hono + oRPC API Port

#### Source modules

Port selectively from Better Chat:

- `apps/server/src/index.ts`, routing/CORS shape only
- `apps/server/src/lib/context.ts`
- `apps/server/src/lib/orpc.ts`
- `apps/server/src/lib/router.ts`, excluding chat imports
- `apps/server/src/features/models/routes.ts`
- `apps/server/src/features/tools/mcp/routes.ts`
- `apps/server/src/features/settings/routes.ts`

Target in Better Agent:

- `apps/server/src/index.ts`
- `packages/api/src/context.ts`
- `packages/api/src/index.ts`
- `packages/api/src/routers/*`

#### Dependency guidance

Current Hono guidance:

- Use the Hono app as the Cloudflare Worker module export.
- Type bindings through `new Hono<{ Bindings: Env }>()` where applicable.
- Use `c.env` and `c.executionCtx` rather than global assumptions when runtime context matters.
- Use Hono CORS globally or by prefix; avoid duplicate/contradictory CORS between Hono and oRPC plugins.
- Use `app.onError()` for normalized error responses.

Current oRPC guidance:

- Routers are plain nestable objects.
- Context is dependency injection.
- Middleware should narrow context and enforce auth/resource access.
- `RPCHandler` is for first-party typed clients through `RPCLink`.
- `OpenAPIHandler` is for REST/OpenAPI surfaces.
- Hono integration uses the fetch adapters; no special Hono adapter is required.

#### Requirements

- Keep `packages/api` as the transport-neutral API package.
- Server app owns Hono, CORS, Better Auth route mounting, RPC/OpenAPI handler mounting, and Cloudflare request context creation.
- Expand `createContext` to include needed control-plane dependencies:
  - headers;
  - env/bindings where useful;
  - product DB accessor;
  - nullable session.
- Keep `protectedProcedure` as the auth guard and add resource-specific middleware later for Thinkspace ownership.
- Port routers only when renamed around Better Agent capabilities:
  - `modelsRouter` as model catalog/config router;
  - `mcpCatalogRouter` as catalog/connection router;
  - `accountSettingsRouter` as product settings router;
  - `thinkspacesRouter` as first-slice product router.
- Remove chat router and AI message type exports from the Better Agent `appRouter`.

#### Acceptance criteria

- `/api/auth/*` reaches Better Auth.
- `/rpc/*` or `/api/rpc/*` reaches oRPC with correct prefix and context.
- Optional OpenAPI/docs surface is mounted separately and does not expose internal procedures unintentionally.
- Protected procedures throw typed `ORPCError("UNAUTHORIZED")`.
- Model/MCP/settings routers import no chat modules.
- Root `appRouter` has no `chat`, request-scoped `ai`, or old message type exports.

### 4. Drizzle / D1 Schema Port

#### Source modules

Port selectively from Better Chat:

- `apps/server/src/db/d1/schema/auth.ts`, indexes only as needed
- `apps/server/src/db/d1/schema/settings.ts`, redesigned
- D1 migration workflow ideas

Do not port:

- `apps/server/src/db/do/schema/chat.ts`
- `apps/server/src/db/do/migrations/*`
- per-user conversation/message tables

Target in Better Agent:

- `packages/db/src/index.ts`
- `packages/db/src/schema/auth.ts`
- `packages/db/src/schema/settings.ts`
- `packages/db/src/schema/thinkspaces.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/src/migrations/*`

#### Dependency guidance

Current Drizzle/D1 guidance:

- Use `drizzle(env.DB, { schema })` so relation metadata is available.
- D1 Kit HTTP config requires `dialect: "sqlite"`, `driver: "d1-http"`, and `dbCredentials.accountId/databaseId/token`.
- Use generated migrations for shared environments; avoid `push` except disposable local databases.
- Use `timestamp_ms` consistently when millisecond precision is desired.
- `$defaultFn`/`$onUpdateFn` are runtime-only and do not affect generated SQL. Use `.default(sql`...`)` for migration-visible defaults.
- Drizzle Kit does not support normal `migrate/push/pull/studio` flows for `durable-sqlite`; DO migrations must be generated and applied programmatically inside the DO runtime.

#### Requirements

- Make `@better-agent/db` the D1 source of truth.
- Add `thinkspaces` product-index schema with:
  - stable ID;
  - owner user ID;
  - Goal;
  - initial instructions;
  - configuration summary;
  - active/archived status;
  - created/updated/archived timestamps;
  - empty default placeholders for selected Skills/tools, requested Permissions, Approval defaults, and Memory governance defaults if these belong in product metadata.
- Add indexes for dashboard list/get paths:
  - owner/status/updated;
  - owner/created or archived where needed.
- Redesign settings instead of copying Better Chat's `user_settings`:
  - keep product preferences such as theme, default model, reasoning effort if still desired;
  - move provider API keys to encrypted credential records;
  - move MCP headers/tokens to encrypted credential/connection records;
  - remove `chatWidth`;
  - remove global default `enabledMcpServers`.
- Fix `drizzle.config.ts` for local and remote D1 migration workflows.

#### Acceptance criteria

- Generated D1 migrations include auth, redesigned settings, credentials/catalog tables, and `thinkspaces`.
- Generated D1 migrations include no `conversations` or `messages` table.
- All new timestamps use one convention, preferably `timestamp_ms`.
- `updatedAt` fields have migration-visible SQL defaults where required.
- No new D1 table stores runtime-local messages, tool runs, Memory changes, Approval execution records, or Audit Trail entries.
- `bun run db:generate`, `bun run check-types`, and `bun run build` pass in Better Agent.

### 5. Model Catalog / BYOK / AI SDK Port

#### Source modules

Port from Better Chat:

- `apps/server/src/features/models/catalog.ts`
- `apps/server/src/features/models/providers.ts`
- `apps/server/src/features/models/types.ts`
- `apps/server/src/features/models/utils.ts`
- `apps/server/src/features/models/user-registry-factory.ts`
- selected settings credential logic

Quarantine or reject:

- `apps/server/src/features/ai/routes.ts`
- `apps/server/src/features/ai/completion.ts`
- request-scoped `/ai` primary product path
- conversation title generation
- chat messages/types as product architecture

Target in Better Agent:

- `packages/api/src/models/*` or equivalent model catalog module
- `packages/api/src/routers/models.ts`
- `packages/db/src/schema/settings.ts` / credentials schema
- future Thinkspace runtime seam

#### Dependency guidance

Better Agent is on AI SDK `6.x`; Better Chat is on AI SDK `5.x`.

Current AI SDK guidance:

- Centralize provider/model access with `createProviderRegistry` and `customProvider`.
- Normalize executable IDs to provider/model IDs such as `openai:gpt-4.1` or aliases through `customProvider`.
- Create per-user/per-request provider instances only when BYOK credentials are needed.
- Align `ai` and all `@ai-sdk/*` packages on the same v6 generation; do not mix Better Chat's v5 providers with Better Agent's v6 core.
- Use native provider factories for BYOK: `createOpenAI`, `createAnthropic`, and `createGoogle`. Do not preserve Better Chat's Google-through-OpenAI-compatibility path unless it is explicitly modeled as a separate compatibility provider.
- Use provider-native reasoning options: OpenAI `providerOptions.openai.reasoningEffort`, Anthropic `providerOptions.anthropic.thinking`, and Google `providerOptions.google.thinkingConfig`.
- Use `convertToModelMessages` instead of removed `convertToCoreMessages`/`CoreMessage` patterns, and respect v6 async conversion semantics.
- Use `streamText` and `toUIMessageStreamResponse` only in actual runtime/interaction surfaces.
- If a persisted/resumable UI message stream is implemented later, pass `originalMessages` and handle abort-aware completion/cleanup with AI SDK's current stream-consumption guidance.
- Use `DefaultChatTransport` for UI chat only when there is an approved chat-like interaction surface.

#### Requirements

- Port the model catalog as a product-level capability catalog, not as chat model selection.
- Port BYOK as encrypted provider credential storage and a model resolver service.
- Add a model resolver interface that future Thinkspace Agent runtime can call:

```ts
type ModelResolver = {
	resolveLanguageModel(input: {
		userId: string;
		thinkspaceId?: string;
		modelId: string;
	}): Promise<LanguageModel>;
};
```

- Keep public catalog endpoints for non-sensitive model metadata.
- Keep protected endpoints for account-available models and saved provider credentials.
- Add version/source/review metadata to static model catalog entries because model IDs, capabilities, and prices drift.
- Represent Thinkspace model policy separately from account credentials: selected model, allowed fallbacks, reasoning profile, caps/guardrails, and credential reference.
- Remove Better Agent scaffold `/ai` route as a primary product path before the Thinkspace slice ships.
- Do not port Better Chat's completion orchestration as Better Agent architecture.
- Quarantine usage metadata from Better Chat as a future runtime/Audit Trail input, not a chat-route concern.

#### Acceptance criteria

- Model catalog can list public model metadata without auth if chosen.
- Protected model availability uses account credentials and future Thinkspace policy seams.
- Provider API keys are encrypted/redacted.
- No `/ai` route is in primary navigation or accepted as the main product path.
- AI SDK v6 APIs are used where runtime model calls remain: `convertToModelMessages`, `streamText`, provider registry, `toUIMessageStreamResponse` only in approved runtime code.
- OpenAI, Anthropic, and Google BYOK model resolution use native provider factories and are covered by resolver tests or mocks.
- Regression coverage confirms Google BYOK is not routed through OpenAI compatibility unless explicitly configured as a distinct compatibility provider.

### 6. MCP Catalog / Client / Permission Port

#### Source modules

Port selectively from Better Chat:

- `apps/server/src/features/tools/mcp/catalog.ts`
- `apps/server/src/features/tools/mcp/client.ts`, adapter ideas only
- `apps/server/src/features/tools/mcp/types.ts`, redesigned
- `apps/server/src/features/tools/mcp/mutations.ts`, redesigned
- `apps/server/src/features/tools/mcp/queries.ts`, redesigned
- `apps/server/src/features/tools/mcp/routes.ts`, redesigned
- `apps/web/src/routes/settings/-components/tools/*`, rewritten

Do not port unchanged:

- global `enabledMcpServers`
- `DEFAULT_ENABLED_MCP_SERVERS = ["context7"]`
- plaintext `headers` storage
- custom servers auto-enabled for every runtime
- completion-time loading of all globally enabled MCP tools

Target in Better Agent:

- `packages/api/src/mcp-catalog/*`
- `packages/api/src/routers/mcp-catalog.ts`
- `packages/api/src/routers/thinkspace-tools.ts`, later or placeholder
- `packages/db/src/schema/settings.ts` / `mcp.ts`
- UI settings/catalog pages
- Thinkspace Permission placeholders

#### Dependency guidance

MCP TypeScript SDK guidance:

- For remote production servers, prefer Streamable HTTP.
- SSE is legacy/backwards-compatible.
- Tool listing can be paginated; clients should loop `nextCursor`.
- Tool calls can return tool-level `isError` rather than throwing protocol errors.
- Streamable HTTP sessions should be terminated/closed on cleanup.
- Headers/tokens should be handled through auth providers or encrypted credential stores.

AI SDK MCP guidance:

- AI SDK MCP client is convenient for converting MCP tools into AI SDK tools, but may not cover all full-client features.
- Close MCP clients on finish, error, abort, and timeout.

#### Requirements

- Split MCP into five concepts:
  1. MCP Server Catalog;
  2. MCP Connection/Credential;
  3. Thinkspace Tool Enablement;
  4. Permission;
  5. Approval.
- Built-in MCP servers may be in a global catalog, but none are active in a Thinkspace by default.
- New users and new Thinkspaces have zero MCP tools exposed until explicit Thinkspace enablement.
- Store MCP secrets encrypted at rest.
- Redact saved secrets in API responses and UI.
- Validate MCP URLs:
  - HTTPS by default;
  - localhost/dev exceptions only when explicitly configured;
  - block private/link-local/cloud-metadata IPs for server-side requests unless an admin allowlist exists.
- Store canonical tool identity as `{ serverId, toolName }`; use prefixed aliases only for model tool-name collision avoidance.
- Classify tools by risk; unknown tools default to disabled or approval-required.
- Mutating tools require Permission plus draft/Approval flow by default.

#### Acceptance criteria

- Context7 is not enabled for a new Thinkspace unless explicitly selected.
- MCP credentials are never returned in full after save.
- Tool discovery stores canonical identity, schema, annotations, discovered timestamp, and source server.
- Thinkspace runtime toolset includes only explicitly enabled tools.
- All MCP tool calls create Audit Trail-ready records with redacted args/results and Approval ID where relevant.
- MCP clients close on success, error, abort, and timeout.

### 7. Cloudflare / Agents / Alchemy Infrastructure Port

#### Source modules

Port selectively from Better Chat:

- `alchemy.run.ts`
- deployment env/stage conventions
- D1/KV resource setup
- custom domains/routes
- observability

Do not port unchanged:

- `USER_DO` binding
- `UserDurableObject`
- per-user chat DO class
- old DO migrations

Target in Better Agent:

- `packages/infra/alchemy.run.ts`
- `apps/server/src/index.ts`
- future `ThinkspaceAgent` runtime seam

#### Dependency guidance

Alchemy guidance:

- Use `await alchemy("better-agent", { stateStore })` and always `await app.finalize()`.
- Use `CloudflareStateStore` in CI/staging/prod to avoid orphaned infrastructure.
- Use explicit stage naming and resource names such as `${app.name}-${app.stage}-db`.
- Use `alchemy.secret.env.*` for secrets and `alchemy.env.*` for non-secret required env.
- Use `adopt: true` only for known pre-existing resources.
- Bind D1, KV, R2, and Durable Object namespaces through Worker/TanStackStart bindings.

Cloudflare Agents guidance:

- Future runtime should be Cloudflare Agents / Durable Object-backed.
- Agent instance identity should be stable by Thinkspace ID, not user ID.
- Agent state/SQL/session/scheduling/resumable stream concepts are SDK-owned or runtime-owned; do not duplicate them with the old hand-written per-user chat DO.
- Leave runtime seams now; full Thinkspace Agent runtime implementation is out of this PRD unless explicitly pulled into a later slice.

#### Requirements

- Adapt Better Chat's mature Alchemy deployment patterns into Better Agent's `packages/infra`.
- Add stage env loading and persistent state store.
- Add D1 and KV where needed for auth/session/product metadata.
- Add R2 bucket for future Sources/Artifacts if this PRD includes infra prep for them.
- Do not bind `UserDurableObject`.
- If a Durable Object namespace is added now, name it for `ThinkspaceAgent` and leave it unused or behind a future runtime seam unless the runtime slice is explicitly in scope.
- Document resource mapping from old Better Chat production resources to new Better Agent resources before final repo swap.

#### Acceptance criteria

- `packages/infra/alchemy.run.ts` has stage-aware resource names.
- Persistent state store is configured for non-local deploys.
- Secrets use `alchemy.secret.env.*`.
- D1/KV/R2/Worker/web resources are mapped deliberately.
- No production path binds or exports `UserDurableObject`.
- Dev deploy uses non-production resource names.

### 8. React / Tailwind / UI Primitives Port

#### Source modules

Port selectively from Better Chat:

- `apps/web/src/components/ui/*`
- `apps/web/src/routes/settings/-components/*`
- `apps/web/src/components/navigation/*`, only if useful

Target in Better Agent:

- `packages/ui/src/components/*`
- `packages/ui/src/styles/globals.css`
- `apps/web/src/components/*`
- `apps/web/src/routes/_authenticated/settings.*`
- Thinkspace dashboard/detail empty-state UI

#### Dependency guidance

React 19 guidance:

- Prefer function components.
- New components may use `ref` as a prop; `forwardRef` remains available for compatibility.
- Remove reliance on `defaultProps` for functions, PropTypes, string refs, legacy context, `findDOMNode`, and old `ReactDOM.render`/`hydrate` APIs.
- Use React Testing Library rather than `react-test-renderer`.
- Actions/`useActionState`/`useFormStatus` are available, but should be used only where they fit the TanStack Start/router architecture.

Tailwind v4 guidance:

- Use CSS-first config with `@import "tailwindcss"`.
- Define theme tokens in CSS with `@theme`.
- Use `@source` to include workspace package UI source paths.
- Define class/data dark mode with `@custom-variant dark` if not using media dark mode.
- Keep Tailwind build ownership in `apps/web`; do not make `packages/ui` generate its own Tailwind CSS.

shadcn/current primitive guidance:

- Current v4-era components use React 19 component shapes, `React.ComponentProps`, `data-slot`, Tailwind v4 tokens, and no required `forwardRef` for new code.
- Better Chat's UI is already shadcn v4/Radix-like, including unified `radix-ui`, `data-slot`, and `React.ComponentProps` patterns.
- Better Agent's `packages/ui` is currently Base UI-first. Keep that direction unless the implementation explicitly adds `radix-ui` to `@better-agent/ui` and records the decision.
- Base UI uses `render` and state data attributes such as `data-open`, `data-checked`, and `data-highlighted`, while Better Chat/Radix components use `asChild`, Radix Slot, `data-[state=...]`, and `--radix-*` CSS variables. Direct copies must be adapted.

#### Requirements

- Salvage missing/better UI primitives first:
  - dialog;
  - badge;
  - select;
  - separator;
  - switch;
  - textarea;
  - tooltip;
  - possibly sheet/sidebar if needed for settings/dashboard layout.
- Keep `packages/ui` source-only for class-based primitives.
- Make `apps/web` own Tailwind scanning and tokens; ensure it scans `packages/ui/src/**/*.{ts,tsx}`.
- Add `data-slot` to ported primitives where useful for styling/test selectors.
- Use accessible component structures for dialogs, selects, switches, forms, and error states.
- Port low-risk pure primitives first: `alert`, `badge`, `textarea`, `separator`, and `progress` if needed.
- Rebuild medium-risk primitives (`dialog`, `select`, `switch`, `tooltip`) against the chosen Base UI or Radix primitive family; do not leave stale Radix selectors in Base UI wrappers.
- Treat `sidebar` and settings composites as high-risk references until primitive and route/data contracts exist.
- Port settings components only after domain copy rewrite.
- Do not port markdown/code/chat renderers into the first Thinkspace shell except as quarantined future references.

#### Acceptance criteria

- `packages/ui` contains the primitives needed by salvaged settings and Thinkspace shell.
- Tailwind v4 scans `packages/ui` classes.
- Dark mode behavior is explicit and matches Better Agent theme provider.
- Ported forms/dialogs/selects/switches meet keyboard and screen-reader basics.
- Base UI vs Radix dependency choice is documented; if Base UI is chosen, no Radix-specific `data-[state]` selectors or `--radix-*` variables remain in wrappers.
- Tailwind production build includes all classes used by `packages/ui` and salvaged settings components.
- No UI copy says Better Chat or centers chat.

## Feature Workstreams

### Workstream A: Prepare Better Agent Base

Requirements:

- Copy/keep domain docs and ADRs in the new base.
- Rename app metadata, title, and nav copy to Better Agent.
- Remove or demote scaffold `/ai` route and server `/ai` endpoint from primary product path.
- Add dependency study references to implementation issues or docs.

Acceptance:

- Visible product copy says Better Agent.
- Primary authenticated route is Thinkspaces, not AI Chat.
- Build/typecheck pass before salvage begins.

### Workstream B: Auth + Env + Session Infrastructure

Requirements:

- Port selected Better Chat auth features into `@better-agent/auth`.
- Add env validation and Alchemy bindings for selected providers.
- Reconcile auth schema/migrations.
- Verify cookies/CORS/trusted origins.

Acceptance:

- Sign-in, sign-out, session restore, and protected oRPC procedure access work locally.
- OAuth/OTP features work only if selected and configured.

### Workstream C: D1 Schema + Thinkspace Product Index

Requirements:

- Add Thinkspace product index.
- Redesign settings/credentials/catalog tables.
- Fix migration workflow.
- Keep runtime-local state out of D1.

Acceptance:

- D1 migrations pass in disposable dev DB.
- No chat tables are generated.

### Workstream D: API Routers

Requirements:

- Port model catalog router.
- Add redesigned MCP catalog/router.
- Add account settings router.
- Add Thinkspace create/list/get/archive router.
- Enforce protected procedures and ownership checks.

Acceptance:

- oRPC client types compile.
- Protected routes reject unauthenticated calls.
- Thinkspace ownership checks are tested.

### Workstream E: Model/BYOK

Requirements:

- Port model catalog metadata.
- Add encrypted provider credentials.
- Add model resolver service.
- Remove request-scoped chat completion from product core.

Acceptance:

- Account can configure provider credentials without exposing secrets.
- Future Thinkspace Agent runtime can ask for a model through a stable resolver interface.

### Workstream F: MCP Catalog + Permission Placeholders

Requirements:

- Port built-in MCP metadata.
- Add custom server/connection records with encrypted credentials.
- Add discovery and tool identity model.
- Add Thinkspace enablement placeholders.
- Add Permission/Approval policy placeholders.

Acceptance:

- New Thinkspace starts with no tools.
- Catalog configuration does not expose tools to the Thinkspace Agent by default.
- Mutating/unknown tools are approval-required by default.

### Workstream G: Web Shell + Settings UI

Requirements:

- Add authenticated Thinkspace list at `/thinkspaces` (a list of bounded work areas, not an orchestration dashboard).
- Add a Review Queue entry point on `/thinkspaces` that links to the per-user, cross-Thinkspace set of items awaiting judgement; in this slice it may be an empty/placeholder Review Queue surface, since holdpoints are runtime-dependent.
- Add create/review flow.
- Add Thinkspace detail route with empty states for Sources, Memory, Skills, Permissions, Approvals, Audit Trail, and Artifacts.
- Port settings shell/providers/tools/profile UI selectively.
- Rewrite all copy in Better Agent vocabulary.

Acceptance:

- User can create, list, open, and archive Thinkspaces.
- `/thinkspaces` shows a Review Queue entry point alongside the Thinkspace list; it does not surface running-agent counts or live activity as the primary signal.
- Empty states describe target modules without pretending implementation is complete.
- Settings UI distinguishes product-level Connected Accounts/catalogs from Thinkspace Permissions.

### Workstream H: Infra / Deployment

Requirements:

- Adapt Better Chat Alchemy production knowledge into Better Agent `packages/infra`.
- Add persistent state store and stage naming.
- Add deliberate resource mapping table.
- Do not port per-user chat Durable Object.

Acceptance:

- Dev deployment uses isolated resources.
- Staging deployment maps required D1/KV/R2/Worker/web bindings.
- No production route points to a Worker missing required bindings.

## User Stories

1. As a Better Agent user, I can sign in and stay signed in so that my Thinkspaces belong to my account.
2. As a Better Agent user, I can create a Thinkspace around a Goal so that work is bounded and assessable.
3. As a Better Agent user, I can review the Thinkspace configuration before creation so that I understand the initial Goal, instructions, Skills/tools placeholders, Permissions, Approval defaults, and Memory governance defaults.
4. As a Better Agent user, I can list my Thinkspaces so that I can return to bounded work areas.
5. As a Better Agent user, I can archive a Thinkspace so that it becomes inert but inspectable.
6. As a Better Agent user, I can configure product-level model providers/BYOK keys without those keys automatically granting a Thinkspace access.
7. As a Better Agent user, I can configure MCP catalog entries without exposing all tools to every Thinkspace.
8. As a Better Agent user, I can see empty states for Sources, Memory, Skills, Permissions, Approvals, Audit Trail, and Artifacts so that the product communicates the target architecture.
9. As a Better Agent user, I can reach a Review Queue entry point from `/thinkspaces` so that the product is oriented around what needs my judgement, not around how many agents are running.
10. As a developer, I can port Better Chat auth into Better Agent without downgrading Better Auth or copying stale schema assumptions.
11. As a developer, I can port model/BYOK code behind a resolver seam without preserving Better Chat's request-scoped chat completion.
12. As a developer, I can port MCP code as catalog/connection infrastructure without preserving global tool enablement.
13. As a developer, I can generate D1 migrations from Better Agent schema and verify they contain product indexes, not chat runtime state.
14. As a developer, I can deploy with Alchemy using deliberate stage/resource naming and without binding the old `UserDurableObject`.

## Out of Scope

- Old Better Chat conversation migration.
- Backward-compatible chat APIs.
- Request-scoped `/ai` as the product core.
- Full Coordinator LLM behavior.
- Full Thinkspace Agent runtime.
- Full Cloudflare Agents/Think implementation.
- Runtime-local DO SQLite schema for messages/tool runs/Memory changes/Approval execution/Audit Trail.
- Real external tool execution.
- Approval execution workflows beyond policy placeholders.
- Local Node support.
- Multi-user Thinkspaces/membership beyond first-slice ownership.
- A populated Review Queue and cross-Thinkspace Backpressure pacing (runtime-dependent); this slice ships only the Review Queue entry point and its empty state, reserving the seam for later population.
- Usage accounting unless explicitly pulled from quarantine.
- Chat markdown/code/tool-call renderers as first-slice architecture.

## Global Acceptance Checklist

- Better Agent builds and typechecks.
- Auth works locally and in staging.
- D1 migrations are generated and tested against disposable/dev D1.
- Thinkspace create/list/get/archive works through API and UI.
- Archived Thinkspaces are inert but inspectable.
- No primary `/chat` or `/ai` product path exists.
- `/thinkspaces` is a Thinkspace list with a Review Queue entry point; no surface frames the product as an orchestration dashboard or sells running-agent count/live activity as the primary value.
- No old conversation compatibility layer exists.
- No globally configured model/tool/MCP catalog item is automatically enabled for a Thinkspace.
- Product-facing UI uses Better Agent, Thinkspace, Goal, Permission, Approval, Source, Memory, Skill, Artifact, and Audit Trail language.
- Secrets are encrypted/redacted for BYOK and MCP credentials.
- Alchemy resources are stage-named and mapped deliberately.
- `UserDurableObject` is not bound in the new production path.
- Dependency versions are recorded in the implementation PR/issue and aligned per package family.

## Suggested Implementation Sequence

1. Prepare Better Agent base and remove visible chat scaffold paths.
2. Port auth/env/session infrastructure.
3. Reconcile auth schema and add D1 migration workflow.
4. Add Thinkspace product index and lifecycle/config/policy modules.
5. Add Thinkspace oRPC router and web dashboard/create/detail/archive shell.
6. Port settings shell and provider/BYOK UI.
7. Port model catalog/BYOK resolver.
8. Port MCP catalog/connection infrastructure with no default Thinkspace enablement.
9. Adapt Alchemy deployment knowledge and resource mapping.
10. Run final build/typecheck/migration/staging validation.

## Research Artifacts

Keep these briefs as implementation references:

- `dependency-studies/better-auth.md`
- `dependency-studies/tanstack-web.md`
- `dependency-studies/hono-orpc.md`
- `dependency-studies/drizzle-d1.md`
- `dependency-studies/ai-sdk-models.md`
- `dependency-studies/mcp.md`
- `dependency-studies/cloudflare-alchemy-agents.md`
- `dependency-studies/react-ui-tailwind.md`

The implementation agent should read the relevant brief before touching each module family.
