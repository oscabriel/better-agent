# Dependency study: Cloudflare Project Think + Agents SDK runtime

Date: 2026-06-08

Scope: current `@cloudflare/think` / Cloudflare Agents SDK source-first research for implementing Better Agent's first real **Thinkspace Agent** runtime after the control-plane rewrite landed on `main`.

Source inspected via replicant local clone:

- Repo: `github.com/cloudflare/agents`
- Fetched source ref: `origin/main`
- Commit: `99a1f31bbb0f7641824dcc4453847cffffa578dc`
- Local checkout note: the clone worktree remained on `6fa7fd744090f3868ae6af6b89f92b6280738504`; I fetched `origin/main` and inspected that tree directly to avoid mutating the checkout.
- Installed Alchemy source checked locally in this repo for `DurableObjectNamespace` shape.

## Executive recommendation

Use **Project Think (`@cloudflare/think`) as the first Thinkspace Agent runtime layer**, not raw `Agent` and not `AIChatAgent`, for the first vertical runtime slice.

Reasoning:

- Think is explicitly the opinionated chat-agent base class for Cloudflare Workers. It owns the agentic loop, message persistence, streaming, tool execution, client tools, stream resumption, extensions, and Durable Object SQLite backing. Evidence: `cloudflare/agents@99a1f31b docs/think/index.md:1-7`, `packages/think/src/think.ts:1-42`.
- It extends the Agents SDK `Agent<Env, State, Props>`, so it still maps cleanly to a Durable Object instance per Thinkspace. Evidence: `packages/think/src/think.ts:1619-1623`.
- It uses Session-backed storage with tree-structured messages, context blocks, compaction, FTS5 search, and multi-session support. Those map better to Better Agent's long-lived Thinkspace model than flat chat-turn storage. Evidence: `packages/think/src/think.ts:8-10`, `docs/think/index.md:567-577`, `docs/sessions.md:1-5`.
- It gives durable `submitMessages()` for server/programmatic triggers, which aligns with Thinkspace work that may be accepted durably and inspected later rather than only browser chat. Evidence: `docs/think/index.md:595-616`, `docs/think/programmatic-submissions.md:1-15`, `examples/think-submissions/src/server.ts:39-62`.

Do **not** treat Think as the product's domain model. It is an implementation/runtime substrate. Better Agent's domain terms still win:

- Think's “agent” = Better Agent **Thinkspace Agent** runtime.
- Think's “session” = an interaction/session surface inside one **Thinkspace**, not the top-level product container.
- Think's “workspace” = runtime-local virtual filesystem; it may back some **Sources**/**Artifacts**, but it is not automatically user-facing Memory/Artifact without product acceptance rules.
- Think's built-in tool approval flow is useful but not sufficient by itself; Better Agent's **Permission** and **Approval** policy remains authoritative.

## Current package/API facts

`@cloudflare/think` is experimental but published as `0.8.8` in the inspected source. It peers on `agents >=0.14.0 <1.0.0`, `ai ^6.0.182`, `vite >=6 <9`, and `zod ^4.0.0`. Evidence: `packages/think/package.json:1-60`.

Better Agent already uses AI SDK v6 and Vite 8/TanStack Start. The missing dependencies for runtime work are likely:

- `@cloudflare/think`
- `@cloudflare/ai-chat` if using `useAgentChat` from the Think docs
- `agents`
- possibly `@cloudflare/shell` if using exported workspace types directly

Think docs' minimal install includes `@cloudflare/think`, `@cloudflare/ai-chat`, `agents`, `ai`, `@cloudflare/shell`, `zod`, and a provider package. Evidence: `docs/think/getting-started.md:25-30`.

## Worker routing options

There are two viable routing shapes.

### Option A: direct/manual Agent routing

A manual Worker can export a `Think` subclass and call `routeAgentRequest(request, env)` before returning a fallback. Evidence: quick start shows `export class MyAgent extends Think<Env>` plus `routeAgentRequest` in fetch: `docs/think/index.md:17-42`, `docs/think/getting-started.md:75-104`. The underlying Agents SDK helper uses the `/agents` prefix by default. Evidence: `packages/agents/src/index.ts:11061-11071`.

This shape is closest to the current `apps/server/src/index.ts`, which already exports a custom Worker object that delegates to Hono. It would mean:

```ts
export class ThinkspaceAgent extends Think<CloudflareEnv> {
	/* ... */
}

export default {
	async fetch(request, env, ctx) {
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return app.fetch(request, env, ctx);
	},
};
```

But direct `/agents/*` routing is not automatically auth-gated. We would need to gate agent traffic by request path/session/owner before letting the request reach the agent, or use an app-owned proxy route/callable strategy.

### Option B: Think Vite framework routing

Think has a Vite plugin (`@cloudflare/think/vite`) that discovers an `agents/` tree, generates Worker entry exports, and stable Durable Object class names/bindings. Evidence: `docs/think/index.md:44-103`. It has explicit TanStack Start host guidance: use `think({ routePrefix: "/api/agents", allowNonVirtualMain: true })`, export a Worker shim from `virtual:think/entry`, and have app server return `null` for the Think route prefix. Evidence: `docs/think/index.md:295-355`.

This is powerful but it collides with the current repo shape in two ways:

1. Better Agent has a separate API Worker (`apps/server`) and web/TanStack app (`apps/web`) managed by Alchemy. The Think docs' TanStack shape assumes the host framework Worker and Think entry are unified.
2. Better Agent currently wants the API/control-plane Worker to own auth, oRPC, product APIs, and runtime routing. That points to keeping the first runtime slice in `apps/server`, not inside the web app build.

Recommendation for first slice: **manual routing in `apps/server`**. Revisit the Think Vite framework only if we consolidate web and runtime routing into one Worker or want convention-generated sub-agent classes later.

## Durable Object / Alchemy binding requirements

Manual Think usage requires a SQLite-backed Durable Object binding and migration for the exported agent class. Evidence: manual Wrangler config in `docs/think/index.md:539-557`; getting-started config in `docs/think/getting-started.md:32-52`.

Alchemy's installed `DurableObjectNamespace` helper accepts:

```ts
DurableObjectNamespace("thinkspace-agent", {
	className: "ThinkspaceAgent",
	sqlite: true,
});
```

Evidence: local installed Alchemy `node_modules/alchemy/src/cloudflare/durable-object-namespace.ts:6-18,64-75`.

Better Agent's `packages/infra/alchemy.run.ts` should add:

- import `DurableObjectNamespace` from `alchemy/cloudflare`
- `const thinkspaceAgents = DurableObjectNamespace("thinkspace-agent", { className: "ThinkspaceAgent", sqlite: true })`
- add `THINKSPACE_AGENT: thinkspaceAgents` to `commonBindings` (or whatever binding name we standardize)

Open verification item: confirm that Alchemy Worker metadata emits the right `new_sqlite_classes` migration entry for the bound class and handles class export presence in `apps/server/src/index.ts`. The Alchemy resource shape supports SQLite DOs, but deployment should be validated in dev.

## Runtime identity and routing

The Better Agent invariant should be: one stable **Thinkspace Agent** runtime instance per Thinkspace id.

Agents SDK routes identify an Agent class and an instance name. Think's routing helper builds paths as `/<prefix>/<agent>/<name>` and defaults the route prefix to `/agents`. Evidence: `packages/think/src/server-entry.ts:189-228,489-495`; quickstart route helper via `routeAgentRequest` uses `prefix: "agents"`: `packages/agents/src/index.ts:11061-11071`.

Recommended naming:

- Class/export: `ThinkspaceAgent`
- DO binding: `THINKSPACE_AGENT`
- Agent route segment: `thinkspace-agent` if using raw `routeAgentRequest` camel-case/kebab behavior, or explicit framework alias if using Think Vite later.
- Instance name: the stable `thinkspace.id` value, e.g. `thinkspace_...`

Do not name instances by user id, conversation id, session id, or goal text.

## Auth and tenancy boundary

Think docs explicitly allow auth-gated apps to stop fallthrough into Think routing by returning any `Response`, including 404, before the Think router handles `/agents/*`. Evidence: `docs/think/index.md:132-137`. They also show app-owned routing that resolves the agent instance after `requireUser(request)`, keeping authentication and tenancy in app code. Evidence: `docs/think/index.md:151-204`.

For Better Agent, direct browser access to `/agents/thinkspace-agent/:thinkspaceId` should not be public. First-slice options:

1. **App-owned proxy endpoints/callables (preferred first):** expose oRPC protected procedures that verify session + Thinkspace ownership, then call an Agent stub by stable name. Use `submitMessages()` or a custom `@callable()` method for durable work. This avoids exposing raw route semantics before auth is hardened.
2. **Gated `/api/agents/*` route:** in Worker fetch, detect agent routes, validate Better Auth session and Thinkspace ownership from the route name, then call `routeAgentRequest`. This is necessary if using `useAgentChat` WebSocket from the browser. Cookies should be forwarded and route parsing must reject unknown/mismatched Thinkspace ids before routeAgentRequest.

The Agents client warns that identity can change with server-side routing where instance is determined by auth/session; server identity is authoritative. Evidence: `packages/agents/src/client.ts:330-365`. That reinforces explicit handling if we hide raw instance ids from the browser later.

## Think turn APIs and Better Agent fit

Think exposes several turn entry paths. Its docs recommend choosing based on who drives the work:

- Browser user sends chat messages: `useAgentChat` over WebSocket.
- Server code can wait: `saveMessages()`.
- Server code needs fast durable acceptance and later status: `submitMessages()`.
- Recurring prompt/handler tasks: `getScheduledTasks()`.
- Parent-child streaming: sub-agent `chat()`.
- Multi-step orchestration: Workflows.

Evidence: `docs/think/index.md:595-616`.

For Better Agent's first runtime slice, prefer **`submitMessages()` behind an authenticated callable/procedure** unless the immediate product goal is interactive chat streaming. This maps to durable delegation better than a chat UI:

- `submitMessages()` returns quickly after durable acceptance and can be inspected later. Evidence: `docs/think/programmatic-submissions.md:1-7,24-41`.
- It supports idempotency keys for safe retries. Evidence: `docs/think/programmatic-submissions.md:44-55,134-144`; example callable at `examples/think-submissions/src/server.ts:39-62`.
- Workflows are recommended for multi-step orchestration with retries, long waits, external events, or human approvals. Evidence: `docs/think/programmatic-submissions.md:146-151`. That means Better Agent approval-heavy flows may eventually use Workflows or app-owned ledgers around Think, not just one Think turn.

Recommended first vertical slice:

1. `@callable() submitGoalTurn(input)` or protected oRPC endpoint creates a `UIMessage` from the user's instruction/initial brief.
2. Agent calls `submitMessages(messages, { idempotencyKey, metadata: { thinkspaceId, source: "better-agent" } })`.
3. UI can inspect submission status via callable/oRPC (`inspectSubmission`) and/or later add streaming WebSocket.

## Model resolution

Think requires subclasses to override `getModel()` and return an AI SDK `LanguageModel`. Evidence: `packages/think/src/think.ts:2350-2352`; docs quickstart `docs/think/getting-started.md:84-89`.

Better Agent already has `packages/api/src/models/resolver.ts`, but it currently resolves from explicit inputs and the D1 database access helpers live in the API package. Runtime implementation should extract or duplicate a **runtime-safe model resolver** seam that `ThinkspaceAgent` can use from inside the Durable Object:

- read product metadata from `env.DB` using `createDb(env.DB)`
- verify Thinkspace model policy / owner permissions
- decrypt BYOK credentials only when a Permission exists
- return the AI SDK `LanguageModel`

Avoid importing oRPC router/procedure code into the agent runtime. Pull pure model catalog/resolver pieces into a shared package/module if needed.

## Session, Memory, and Context implications

Think uses Session for conversation storage, context blocks, compaction overlays, FTS5 search, and multi-session support. Evidence: `docs/sessions.md:1-5,34-90`. Think's `configureSession(session)` is called during `onStart` and can add context blocks, compaction, search, and skills. Evidence: `packages/think/src/think.ts:2661-2676`; `docs/think/index.md:988-1015`.

This is useful, but Better Agent must preserve its domain distinctions:

- Think Session messages are runtime-local conversation/session state.
- Think context blocks can implement draft/runtime **Memory**, but accepted Better Agent **Memory** must still be governed by user review where policy says so.
- Think compaction overlays are not Better Agent Memory; they are runtime prompt-management artifacts unless surfaced/accepted.
- Session FTS and cross-session search are implementation features, not product-level Sources or Artifacts.

First slice recommendation: configure only a minimal context block for system/persona and leave user-reviewed Memory for a later slice. Do not let Think's LLM-writable context silently become canonical user-facing Memory until Review Queue/Memory acceptance exists.

## Tools and permissions implications

Think merges tools from many sources every turn in this order:

1. Workspace tools (`read`, `write`, `edit`, `list`, `find`, `grep`, `delete`, `bash`)
2. `getTools()` custom server-side tools
3. Extension tools
4. Session tools
5. Skill tools
6. MCP tools
7. Client tools

Evidence: `docs/think/tools.md:1-19`; source merge at `packages/think/src/think.ts:3300-3313`.

This has an important Better Agent safety consequence: **a default Think agent exposes workspace mutating tools unless we restrict them**. The built-in workspace tools include write/edit/delete and Bash. Evidence: `docs/think/tools.md:21-59`. Bash is enabled by default and can write back workspace file changes, though network is disabled by default. Evidence: `docs/think/tools.md:36-47`; source default `workspaceBash = true` at `packages/think/src/think.ts:1726-1732`.

For Better Agent first slice:

- Set `workspaceBash = false` initially.
- Use `beforeTurn()` to restrict `activeTools` to a minimal safe set, probably read/list/find/grep only or even `[]` for the first model-only turn. `beforeTurn` can return `activeTools`. Evidence: `docs/think/lifecycle-hooks.md:97-132,157-163`; source types at `packages/think/src/think.ts:1169-1206`.
- Do not connect MCP servers directly from product catalog until the Thinkspace's enabled tools and Permission policy have been loaded and enforced.

Think supports custom tool approval via AI SDK `needsApproval`; when approval is needed, the call is sent to the client and pauses until a client approval message. Evidence: `docs/think/tools.md:144-165`. This is not enough by itself for Better Agent because Better Agent distinguishes product-level **Permission** from per-action **Approval** and wants cross-Thinkspace Review Queue/backpressure. Use Think's tool approval mechanics as a transport/turn-pause primitive only after mapping it to product Approval records and Review Queue entries.

Think also offers `beforeToolCall()` / `afterToolCall()` hooks. `beforeToolCall()` can block or substitute results; `afterToolCall()` observes outcomes. Evidence: `packages/think/src/think.ts:2858-2916`; docs `docs/think/lifecycle-hooks.md:376-479`. These hooks are the right place to write Audit Trail-ready runtime records and enforce Permission/Approval gates for server-side tools.

## MCP implications

Think inherits MCP support from `Agent`; connected MCP tools are automatically merged into every turn. Evidence: `docs/think/tools.md:181-220`. Agents SDK MCP client includes private/internal URL blocking. Evidence: `packages/agents/src/mcp/client.ts:88-121,948-990`. It also has a `waitForConnections()` helper. Evidence: `packages/agents/src/mcp/client.ts:882-910`.

Better Agent already has product-level MCP catalog/connection storage and URL safety policy in D1. Do not call `addMcpServer` just because a user has a Connected Account or custom connection. Runtime should:

1. Load only the Thinkspace's `enabledToolIds`.
2. Resolve associated product-level MCP connection/credential.
3. Register/connect only those servers in this ThinkspaceAgent instance.
4. Enforce per-tool Permission/Approval in `beforeToolCall()`.
5. Redact args/results for Audit Trail.

Open design question: whether to persist Agent SDK MCP connections in the DO (`cf_agents_mcp_servers`) or recreate/reconcile from D1 Thinkspace config on startup. Given Better Agent's D1 is product-control-plane source of truth for enabled tools, prefer **reconcile from D1** and treat Agent SDK MCP storage as runtime connection state.

## Recovery, durability, and backpressure

Think has chat recovery enabled by default, wrapping turns in durable fibers and recovering after Durable Object eviction/restart/deploy/stalls. Evidence: source `chatRecovery = true` and comments at `packages/think/src/think.ts:1660-1670`; docs `docs/think/index.md:774-801`.

This is useful for Better Agent but does not implement product Backpressure by itself. Think serializes turns and provides message concurrency strategies. Default browser submit concurrency is `queue`; alternatives include `latest`, `merge`, `drop`, and debounce. Evidence: `docs/think/client-tools.md:126-151`.

Better Agent's Backpressure is about **human judgement capacity**, not technical turn serialization. First runtime slice should not expose producer metrics or running-agent counts. Later slices should translate approval/memory/artifact holdpoints into Review Queue entries and possibly slow/suspend new work when Review Queue is saturated.

## Scheduled work

Think supports `getScheduledTasks()` declarations and automatically reconciles static tasks on startup. Handler tasks get idempotency metadata and are intended for app-owned work such as creating workflow runs or run ledgers. Delivery is at-least-once and callers should use `idempotencyKey`/`occurrenceKey`. Evidence: source `getScheduledTasks()` default at `packages/think/src/think.ts:2422-2435`; docs `docs/think/index.md:971-986`; example `examples/think-submissions/src/server.ts:29-37`.

Do not implement recurring Thinkspace work in the first slice unless required. When added, scheduled tasks should create Review Queue-aware work, not silent external mutations.

## Recommended first implementation slice

### Goal

Create one real, durable Thinkspace Agent runtime per Thinkspace, capable of accepting one authenticated user instruction, resolving a model, running a bounded Think turn, and returning/inspecting the result, without MCP/external mutations yet.

### Proposed tasks

1. Add dependencies:
   - `@cloudflare/think`
   - `@cloudflare/ai-chat` if using `useAgentChat`
   - `agents`
   - ensure AI SDK v6 alignment remains intact.
2. Add `apps/server/src/agents/thinkspace-agent.ts` exporting `ThinkspaceAgent extends Think<CloudflareEnv>`.
3. Export `ThinkspaceAgent` from `apps/server/src/index.ts`.
4. In `packages/infra/alchemy.run.ts`, add `DurableObjectNamespace("thinkspace-agent", { className: "ThinkspaceAgent", sqlite: true })` and bind it as `THINKSPACE_AGENT`.
5. Update `CloudflareEnv` types with the DO binding.
6. Add Worker fetch routing seam:
   - either protected app-owned oRPC/callable path into the Agent stub; or
   - gated `/api/agents/*` route before `routeAgentRequest`.
7. Implement `getModel()` using a runtime-safe resolver and current Thinkspace policy.
8. Set conservative defaults:
   - `workspaceBash = false`
   - `maxSteps` low, e.g. 3 for first slice
   - `beforeTurn()` returns `activeTools: []` or a safe read-only subset until Permissions are wired.
9. Add a callable such as `submitTurn(prompt, idempotencyKey)` using `submitMessages()`.
10. Add `inspectTurn(submissionId)` using `inspectSubmission()`.
11. Add server/API tests or type-level tests for route parsing/ownership checks where possible; add manual dev smoke checklist for DO deployment because Durable Objects require runtime validation.

### Out of scope for first slice

- MCP tool execution.
- Tool approvals mapped to Review Queue.
- Memory acceptance.
- Source uploads/R2 workspace spillover.
- Artifacts.
- Coordinator runtime.
- Sub-agents.
- Workflows.
- Scheduled tasks.
- Think Vite framework conventions.

## ADR recommendation

Create ADR-0006 after the team accepts this study:

**ADR title:** Project Think for Thinkspace Agent Runtime

Decision summary: Better Agent will implement the first Thinkspace Agent runtime on `@cloudflare/think` over raw `Agent`/`AIChatAgent`, while keeping Better Agent's Permission/Approval/Review Queue domain model authoritative over Think's tool/session primitives.

This qualifies as an ADR because it is hard to reverse, surprising without source context, and trades opinionated framework leverage against lower-level control.

## Key citations

Cloudflare Agents / Think source (`github.com/cloudflare/agents@99a1f31bbb0f7641824dcc4453847cffffa578dc`):

- `packages/think/package.json:1-60` — package version and peer dependencies.
- `docs/think/index.md:1-42` — Think overview and quickstart routing.
- `docs/think/index.md:44-103` — Think Vite framework conventions and generated Durable Object classes.
- `docs/think/index.md:120-204` — custom route prefix and auth-gated app-owned routing.
- `docs/think/index.md:295-355` — TanStack Start host guidance.
- `docs/think/index.md:539-557` — manual Wrangler DO binding/migration.
- `docs/think/index.md:559-616` — Think vs AIChatAgent and turn API selection.
- `docs/think/index.md:774-814` — chat recovery behavior.
- `docs/think/index.md:971-1015` — schedules and session integration.
- `docs/think/getting-started.md:20-112` — install/config/server quickstart.
- `docs/think/getting-started.md:113-190` — React client via `useAgentChat`.
- `docs/think/programmatic-submissions.md:1-62,118-151` — `submitMessages()` semantics and Workflow boundary.
- `docs/think/tools.md:1-59` — tool merge order and default workspace/Bash tools.
- `docs/think/tools.md:144-165` — Think tool approval primitive.
- `docs/think/tools.md:181-220` — MCP integration.
- `docs/think/lifecycle-hooks.md:97-132,157-179,376-479` — beforeTurn and tool hooks.
- `docs/sessions.md:1-100,320-390,520-590` — Session API, context, compaction, search.
- `packages/think/src/think.ts:1-75` — source-level feature summary.
- `packages/think/src/think.ts:1619-1725` — `Think extends Agent`, recovery/config/workspace fields.
- `packages/think/src/think.ts:2350-2373` — `getModel`, `getSystemPrompt`, `getTools` defaults.
- `packages/think/src/think.ts:2660-2676` — `configureSession`.
- `packages/think/src/think.ts:2858-2916` — `beforeToolCall` / `afterToolCall`.
- `packages/think/src/think.ts:3300-3363` — actual tool merge and beforeTurn assembly.
- `packages/think/src/think.ts:5776-5818,6273-6322` — `submitMessages()` and `saveMessages()` source behavior.
- `packages/think/src/server-entry.ts:64-75,129-171,189-228,440-495` — routeThinkRequest, createThinkWorkerEntry, path building, env aliasing.
- `packages/agents/src/index.ts:11061-11071` — raw `routeAgentRequest` prefix.
- `packages/agents/src/client.ts:330-365` — server-authoritative identity changes.
- `packages/agents/src/mcp/client.ts:88-121,882-910,948-990` — MCP URL safety/wait/connect details.
- `examples/think-submissions/src/server.ts:1-62` — callable + durable submission example.

Local Alchemy source:

- `node_modules/alchemy/src/cloudflare/durable-object-namespace.ts:6-18,64-75` — `DurableObjectNamespace` props and SQLite flag.
