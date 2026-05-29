# Dependency study: Cloudflare Workers / Agents + Alchemy

Date: 2026-05-27

Scope: Better Agent infra/runtime salvage from `better-agent` into `better-chat`, centered on Alchemy-managed Cloudflare resources and a Cloudflare-native Thinkspace Agent runtime.

## Executive recommendation

Keep the Better Chat Alchemy direction, but reshape it around the ADR runtime model:

- **One thin API/control-plane Worker** for auth, account/product APIs, D1 indexes, R2 source/artifact APIs, and routing into agents.
- **One Cloudflare Agents Durable Object class per Thinkspace runtime**, named by stable Thinkspace id, not by user id or conversation id.
- **D1** for product-level indexes and authorization metadata.
- **Agents / Durable Object SQLite** for runtime-local owner state: messages, runs, tool calls, approvals, memory changes, schedules, stream state.
- **R2** for large Sources/Artifacts.
- **KV only for cache/session/token-adjacent data**, not authoritative Thinkspace state.
- **Alchemy with persistent `CloudflareStateStore`**, explicit stage naming, `adopt: true` only for known pre-existing Cloudflare resources, and `app.finalize()` as a non-optional deployment invariant.

This aligns with ADR-0001 (Cloudflare-native agent runtime), ADR-0002 (split storage ownership), ADR-0003 (draft/approval default for external mutations), and ADR-0004 (Thinkspace-scoped tool enablement).

## Local evidence

### Better Agent baseline

`better-agent/packages/infra/alchemy.run.ts` is minimal:

- Creates `alchemy("better-agent")` with default local state store.
- Creates one D1 database from `../../packages/db/src/migrations`.
- Deploys TanStack Start web plus a Worker server.
- Binds only D1 and app secrets/env.
- Calls `await app.finalize()`.

`better-agent/apps/server/src/index.ts` is request-scoped Hono/oRPC plus `/ai` streaming. It does not export Durable Objects or use Agents. This is useful as an API/auth shape, but not as a durable agent runtime.

### Better Chat current infra

`better-chat/alchemy.run.ts` is already closer to target:

- Uses `CloudflareStateStore` with `ALCHEMY_STATE_TOKEN`.
- Reads `app.stage` and loads `.env.${stage}` files.
- Creates stage-named D1 with migrations, `adopt: true`, and D1 read replication.
- Creates stage-named KV sessions with `adopt: true`.
- Creates `DurableObjectNamespace("user-do", { className: "UserDurableObject", sqlite: true })`.
- Deploys Vite web with domains and Worker API with routes, observability, node compatibility, SQL text loader, and many bindings.
- Exports `UserDurableObject` from the server Worker.

This is the right Alchemy deployment skeleton, but the DO binding should be renamed/replaced around a `ThinkspaceAgent` Cloudflare Agents class and should add R2 for Sources/Artifacts.

### Current server integration seam

`better-chat/apps/server/src/index.ts` imports `env` from `cloudflare:workers`, exports `UserDurableObject`, and defines a Hono app with `.basePath("/api")`. It currently routes auth, oRPC, and `/ai`. For Agents, the top-level Worker `fetch` must route agent traffic before ordinary Hono fallbacks, or the Hono Agents middleware must be mounted deliberately. The current default export is only `app`, so the PRD should require an explicit Worker fetch integration if using `routeAgentRequest(request, env)`.

### UserDurableObject salvage risk

`apps/server/src/db/do/user-durable-object.ts` is a hand-rolled SQLite-backed Durable Object using `drizzle-orm/durable-sqlite`, per-user identity, constructor migrations via `ctx.blockConcurrencyWhile`, and chat-specific methods (`listConversations`, `listMessages`, `appendMessages`, `deleteConversation`). Do **not** port this as-is:

- The runtime identity is **per user**, while ADR-0001 says primary work runtime identity is **one Thinkspace Agent runtime per Thinkspace**.
- It owns conversations/messages as a chat store, while ADR-0001 says conversations/sessions are interaction surfaces and the Thinkspace Agent owns messages, tool runs, approvals, memory changes.
- It duplicates responsibilities that Cloudflare Agents already provides: Agent state, SQL store, schedules, WebSocket sync, and AI chat persistence.
- Its migration model is app-owned Drizzle migrations; Cloudflare Agents runs SDK-owned internal schema/migrations in the same DO SQLite database and custom migrations must avoid `cf_agents_*` tables.
- It has no approval/tool/schedule/run model and no Agents routing/callable boundary.

Potentially salvageable pieces: UI message validation/normalization concepts, fallback handling for corrupt stored messages, batch-size guardrails, and conversation listing semantics as product/query APIs. Do not salvage per-user DO identity or direct `UserDurableObject` binding shape.

## Latest dependency findings

### Alchemy patterns to standardize

Replicant source/doc evidence from `alchemy-run/alchemy`:

- App lifecycle is `const app = await alchemy("name", opts)` and `await app.finalize()`. `finalize()` saves state and triggers orphan cleanup. Evidence: Offworld Alchemy reference lines 38-52 and 75-76; `alchemy/src/scope.ts:564-624` orphan-finalize flow.
- Stage defaults come from `ALCHEMY_STAGE ?? USER ?? USERNAME ?? "dev"`; CLI parsing honors `--stage` and `process.env.STAGE`. Evidence: `alchemy/src/scope.ts:151-155`, `alchemy/src/alchemy.ts:105-126`, `alchemy/src/alchemy.ts:291-297`.
- In CI, Alchemy throws unless a persistent `stateStore` is supplied or the CI check is disabled; recommended stores include `CloudflareStateStore` and `S3StateStore`. Evidence: `alchemy/src/alchemy.ts:130-145`.
- Default state is filesystem under `.alchemy`, inherited from parent scopes or `new FileSystemStateStore(scope)`. Evidence: `alchemy/src/scope.ts:264-335`, `alchemy/src/state/file-system-state-store.ts:10-24,42-92`.
- `CloudflareStateStore` is backed by a Cloudflare Worker plus Durable Object SQLite. It requires `ALCHEMY_STATE_TOKEN`/`stateToken`; binds `STORE: DurableObjectNamespace(... { className: "Store", sqlite: true })` and `STATE_TOKEN`. Evidence: `alchemy/src/state/cloudflare-state-store.ts:22-60,101-149`.
- Deprecated `alchemy/cloudflare/state` exports (`DOStateStore`, `D1StateStore`, `R2RestStateStore`) should be avoided in favor of `alchemy/state`. Evidence: `alchemy/src/cloudflare/state.ts:1-27`.
- Resource binding pattern is to create Cloudflare resources (`KVNamespace`, `D1Database`, `R2Bucket`, `DurableObjectNamespace`, etc.) and pass them into `Worker({ bindings })`. Evidence: Offworld Alchemy reference lines 104-137.
- Resource names should include app/stage prefixes to avoid stage conflicts. Evidence: Offworld Alchemy reference lines 78-81 and 113-118.
- `adopt` is a first-class app/scope/resource behavior for pre-existing resources but defaults false. Evidence: `alchemy/src/alchemy.ts:121-126,349-354`, `alchemy/src/scope.ts:319-320`.
- Use `alchemy.env` for non-secret required variables and `alchemy.secret.env.NAME` for secrets. Evidence: `alchemy/src/env.ts:1-32`, `alchemy/src/secret.ts:14-70,83-149`.

Recommended Alchemy PRD shape:

```ts
const app = await alchemy("better-chat", {
	stage: process.env.ALCHEMY_STAGE ?? "dev",
	stateStore: (scope) =>
		new CloudflareStateStore(scope, {
			stateToken: alchemy.secret.env.ALCHEMY_STATE_TOKEN,
		}),
});

const prefix = `${app.name}-${app.stage}`;

const db = await D1Database("product-db", {
	name: `${prefix}-db`,
	migrationsDir: "apps/server/src/db/d1/migrations",
	adopt: true,
	readReplication: { mode: "auto" },
});

const sessions = await KVNamespace("sessions", {
	title: `${prefix}-sessions`,
	adopt: true,
});

const artifacts = await R2Bucket("artifacts", {
	name: `${prefix}-artifacts`,
	adopt: true,
});

const thinkspaces = DurableObjectNamespace("thinkspace-agent", {
	className: "ThinkspaceAgent",
	sqlite: true,
});
```

Provider property names for R2 and Worker domain/route options should be verified against the exact Alchemy version at implementation time; replicant verified source existence but not every provider constructor field.

### Cloudflare bindings patterns

Cloudflare Workers docs define bindings as the way a Worker interacts with platform resources; bindings are “a permission and an API in one piece,” avoiding secret keys/tokens for resources on the same Cloudflare account. Docs list D1, Durable Objects, KV, R2, Queues, Workflows, Secrets, Workers AI, Vectorize, and others as bindings. `env` is accessible via handler argument, as a class property on `DurableObject`, or imported from `cloudflare:workers`.

Important implication for Better Agent:

- Keep Cloudflare resource access through bindings, not REST API tokens.
- Avoid caching binding-derived external clients globally when secret/binding updates must be observed; construct per request or use safe env access patterns.
- Top-level `import { env } from "cloudflare:workers"` is acceptable for env/secrets and DO stub lookup, but binding I/O such as KV calls must happen in request/runtime context.

Citation: Cloudflare Workers bindings docs, fetched 2026-05-27, `https://developers.cloudflare.com/workers/runtime-apis/bindings/`.

### Durable Object SQLite implications

Cloudflare Durable Object docs:

- Each Durable Object has private, transactional, strongly consistent storage.
- In-memory state can be evicted on inactivity or deployments; durable state must be persisted.
- SQL API is available only for SQLite-backed Durable Object classes, configured via `new_sqlite_classes` migrations in Wrangler or equivalent infra.
- SQLite-backed DOs also support PITR bookmarks for recovery over the last 30 days.
- DO SQL storage is colocated with the DO runtime; D1 is a managed database accessed over the network and better for broader product database use.
- To fully remove DO storage, call `storage.deleteAll()` and delete alarms where necessary.

These docs reinforce ADR-0002: D1 for product indexes; DO SQLite for colocated Thinkspace runtime state.

Citations: Cloudflare Durable Object storage docs, fetched 2026-05-27, `https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/` and `https://developers.cloudflare.com/durable-objects/api/sql-storage/`.

### Cloudflare Agents SDK findings

Replicant evidence from `cloudflare/agents` and Cloudflare docs:

- `Agent<Env, State, Props>` extends a Durable-Object-backed server and defaults to hibernation. Evidence: `packages/agents/src/index.ts:1222-1230,1410-1416`.
- Worker integration requires exporting the Agent class and routing `fetch` via `routeAgentRequest(request, env)` before fallback responses. Evidence: Cloudflare Agents reference lines 70-96; class export and DO binding requirement lines 51-56.
- Agent namespace/binding access uses Durable Object namespaces and stable names. Evidence: `packages/agents/src/index.ts:3258-3279`.
- Agent `initialState`, `state`, and `setState` persist JSON state in `cf_agents_state` and broadcast state updates to connections. Evidence: `packages/agents/src/index.ts:1331-1408,2299-2360`.
- Agents expose a tagged-template SQL helper that parameterizes queries against `this.ctx.storage.sql`. Evidence: `packages/agents/src/index.ts:1488-1503`.
- SDK-owned schema/migrations create `cf_agents_state`, MCP, queues, schedules, workflow/run/fiber/tool-run tables and indexes. Constructor runs `_ensureSchema()` before MCP manager initialization. Evidence: `packages/agents/src/index.ts:1504-1803`.
- Schedules are SQL-backed and alarm-driven. Calling `schedule()` from `onStart()` without idempotency can duplicate rows; `scheduleEvery()` is recommended for recurring startup tasks. Evidence: `packages/agents/src/index.ts:3291-3509`; Cloudflare Agents reference lines 57-58 and 134-158.
- `@callable()` is the recommended typed RPC boundary for client/server methods; `agents/vite` is needed if using decorators. Evidence: Cloudflare Agents reference lines 55-62, 70-87.
- `AIChatAgent` provides persistent AI chat with streaming/tools; `useAgentChat` handles the React side. Evidence: Cloudflare Agents reference lines 9-11,106-143.
- `sessionAffinity` is a stable DO-id-derived key useful for Workers AI calls. Evidence: `packages/agents/src/index.ts:1337-1346`.
- Cloudflare docs state each agent runs on a Durable Object with its own SQL database, WebSocket connections, and scheduling; Agents support SQL/KV state, streaming chat, any model provider, tools, human-in-the-loop approvals, schedules, browser tools, voice, workflows, sub-agents, and inbound events. Citation: Cloudflare Agents docs, fetched 2026-05-27, `https://developers.cloudflare.com/agents/`.

## Better Agent runtime PRD implications

### Thinkspace Agent runtime shape

The PRD should require a Cloudflare Agents class approximately like:

```ts
import { Agent, callable } from "agents";

export type ThinkspaceState = {
	status: "idle" | "thinking" | "waiting_for_approval" | "error";
	activeRunId?: string;
};

export class ThinkspaceAgent extends Agent<Env, ThinkspaceState> {
	initialState = { status: "idle" as const };

	async onStart() {
		await this.scheduleEvery(300, "compactMemory");
	}

	@callable()
	async startRun(input: { prompt: string; conversationId?: string }) {
		this.setState({ ...this.state, status: "thinking" });
		// Persist run/message/tool rows with this.sql`...`.
	}

	@callable()
	async approveAction(input: { approvalId: string }) {
		// Validate permission + approval policy; persist audit row.
	}
}
```

Choose `AIChatAgent` only if the Thinkspace runtime is primarily chat-shaped and its message persistence/stream-resume semantics match product needs. Otherwise, use lower-level `Agent` plus explicit callable methods for runs, approvals, memory, tools, and source/artifact operations.

### Worker routing seam

The server entrypoint should either:

1. Export `ThinkspaceAgent`, then default-export a Worker object whose `fetch` first calls `routeAgentRequest(request, env)` and falls back to Hono; or
2. Use the current `hono-agents` package if the team wants agent routing mounted into Hono.

Acceptance should explicitly test that ordinary `/api/*` routes still work and agent WebSocket/RPC routes reach the Agent DO.

### Storage ownership

- D1 tables: users, accounts, orgs, Thinkspaces, membership/ACL, product navigation indexes, source/artifact metadata, global audit summaries, and denormalized latest activity.
- Agent DO SQLite: Thinkspace runtime messages, run graph, tool calls, MCP server runtime state, approval queue, memory mutations, schedule queue, resumable stream metadata, compacted summaries.
- R2: raw Sources, generated Artifacts, large attachments, exports/imports.
- KV: Better Auth/session support, short TTL caches, non-authoritative rate/cache data.

### Tool/approval safety

Agents make tools and human-in-the-loop flows first-class, but ADR-0003 and ADR-0004 should dominate:

- Do not globally mount all tool catalogs into every Thinkspace Agent.
- Load only tools explicitly enabled for that Thinkspace goal.
- External mutations should create drafts or Approval records by default.
- `@callable()` methods that mutate external systems must verify Thinkspace membership, permission, approval, and idempotency keys.

## What not to port from `UserDurableObject`

Do not port:

- `USER_DO` binding/class name as the future runtime name.
- Per-user DO naming/identity.
- Conversation as top-level storage owner.
- Drizzle migrations that assume sole ownership of the DO SQLite database.
- Custom message persistence if `AIChatAgent` already satisfies requirements.
- Direct API service calls to hand-written DO methods as the primary runtime interface, when Agents callables/WebSocket state sync are the intended SDK boundary.

Possible to port/adapt:

- Message normalization/validation and corrupt-message fallback behavior.
- Batch limits on append-like operations.
- Conversation list/delete semantics as compatibility APIs mapped onto Thinkspace-owned storage.
- D1/KV/Auth Hono API shell.

## Infra acceptance criteria

1. **Alchemy state and stages**
   - `alchemy.run.ts` uses `CloudflareStateStore` from `alchemy/state` with `ALCHEMY_STATE_TOKEN`.
   - Stage is explicit and every persistent resource name includes `${app.name}-${app.stage}` or equivalent.
   - `await app.finalize()` is always called.
   - CI deploy fails fast when persistent state store credentials are missing.

2. **Cloudflare resources**
   - D1 database is stage-named, migration-backed, and bound as `DB`.
   - KV namespace is stage-named and bound only for sessions/cache.
   - R2 bucket is stage-named and bound for Sources/Artifacts.
   - Durable Object namespace is stage-named/resource-scoped and bound to `ThinkspaceAgent` with SQLite storage.
   - Worker has observability enabled, deterministic routes/domains, and required secrets via `alchemy.secret.env`.

3. **Agent runtime deployment**
   - Server Worker exports `ThinkspaceAgent`.
   - Alchemy/Wrangler deployment creates the SQLite-backed Durable Object migration/binding for `ThinkspaceAgent`.
   - Worker `fetch` routes Agents SDK traffic before Hono/API fallback.
   - If using `@callable`, build config includes the Agents Vite/decorator support required by the SDK.

4. **Storage boundary**
   - Product index writes go to D1.
   - Runtime-local writes go through `ThinkspaceAgent` state/SQL, not through request-scoped API handlers.
   - Large blobs go to R2.
   - No `cf_agents_*` SDK tables are modified by app migrations.

5. **Runtime behavior**
   - A Thinkspace id maps to one stable Agent instance name.
   - Agent state survives deploy/restart/hibernation.
   - Scheduled maintenance uses idempotent scheduling (`scheduleEvery` or explicit idempotent ids).
   - Start-run, approve-action, and tool-enable flows are exposed as authenticated callables or API methods that route into the Agent.

6. **Salvage guardrails**
   - No new product code depends on `UserDurableObject` as a durable runtime owner.
   - Existing chat history migration, if needed, is a one-time compatibility/migration path into Thinkspace-owned state.
   - Tests verify per-user isolation is replaced by Thinkspace membership/authorization checks.

7. **Operational checks**
   - Dev stage can deploy without touching prod/staging names.
   - `adopt: true` is documented per resource and used only for known existing Cloudflare assets.
   - Destroy/orphan cleanup behavior is reviewed before enabling destructive operations on prod resources.
   - R2/D1/DO backup/export/PITR strategy is documented before production cutover.

## Key citations

- Local: `better-agent/packages/infra/alchemy.run.ts`.
- Local: `better-agent/apps/server/src/index.ts`.
- Local: `better-chat/alchemy.run.ts`.
- Local: `better-chat/apps/server/src/index.ts`.
- Local: `better-chat/apps/server/src/db/do/user-durable-object.ts`.
- Local ADRs: `docs/adr/0001-cloudflare-native-agent-runtime.md`, `0002-split-storage-ownership.md`, `0003-draft-or-approval-for-external-mutations.md`, `0004-thinkspace-scoped-tool-enablement.md`.
- Alchemy source/docs via replicant: `alchemy/src/scope.ts`, `alchemy/src/alchemy.ts`, `alchemy/src/state/cloudflare-state-store.ts`, `alchemy/src/cloudflare/state.ts`, `alchemy/src/env.ts`, `alchemy/src/secret.ts`, Offworld Alchemy reference.
- Cloudflare Agents source/docs via replicant: `packages/agents/src/index.ts`, Offworld Cloudflare Agents reference, Cloudflare Agents docs.
- Cloudflare Workers bindings docs: `https://developers.cloudflare.com/workers/runtime-apis/bindings/`.
- Cloudflare Durable Objects storage docs: `https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/`.
- Cloudflare Durable Objects SQL API docs: `https://developers.cloudflare.com/durable-objects/api/sql-storage/`.
- Cloudflare Agents docs: `https://developers.cloudflare.com/agents/`.
