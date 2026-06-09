# PRD: First Thinkspace Agent Runtime Slice

## Status

Draft created from:

- `CONTEXT.md`
- ADRs `0001` through `0006`
- `.agents/docs/dependency-studies/cloudflare-project-think.md`
- `.agents/docs/dependency-studies/cloudflare-alchemy-agents.md`
- the merged Better Agent rewrite on `main`

## Problem Statement

Better Agent now has a control plane for authentication, Thinkspace CRUD/lifecycle, model configuration, MCP/catalog setup, Thinkspace-scoped tool placeholders, settings, and Cloudflare/Alchemy infrastructure. It does not yet create or run a real Cloudflare-native **Thinkspace Agent** runtime.

Without the runtime slice, a Thinkspace remains a product record rather than a durable environment that can accept a Goal-directed instruction, run a bounded model turn, persist runtime-local conversation state, and be inspected later. The next implementation should add the smallest real runtime path while preserving Better Agent's domain boundaries and safety model.

This first slice is intentionally not a full agent platform. It should prove the durable runtime shape, tenancy boundary, model resolution seam, and conservative tool policy before adding MCP execution, product-level Approvals, Memory acceptance, Artifacts, or Review Queue population.

## Product Goal

Create one real, durable **Thinkspace Agent** runtime per Thinkspace that can:

1. accept one authenticated user instruction for an owned Thinkspace;
2. resolve an allowed model through Better Agent's model/BYOK policy;
3. run a bounded Project Think turn with no unsafe tools enabled;
4. persist runtime-local state in the Thinkspace Agent Durable Object; and
5. allow the product API/UI to inspect the accepted turn/result later.

The outcome should establish the runtime foundation for later Permission, Approval, Review Queue, MCP, Memory, and Artifact slices without shipping those behaviors prematurely.

## Non-Negotiable Domain Constraints

- **Thinkspace** remains the top-level work container.
- There is one stable **Thinkspace Agent** runtime identity per Thinkspace.
- The runtime instance name must be the stable Thinkspace id.
- **Goal** is the bounded outcome the Thinkspace is pursuing; it is not a session id or runtime instance name.
- **Permission** and **Approval** remain Better Agent domain concepts and are not replaced by Think tool approvals.
- **Connected Account** records do not grant Thinkspace Agent access by themselves.
- **Memory** must not be silently created from Think context, compaction overlays, or hidden runtime state.
- **Artifacts** and **Sources** are product concepts and are not automatically equivalent to Think workspace files.
- **Audit Trail** is user-facing meaningful history, not raw developer logging.
- **Review Queue** and **Backpressure** are out of scope for this first runtime slice, but the implementation must not bypass them for external mutations.

## Runtime Decision

Use Project Think (`@cloudflare/think`) as decided in ADR-0006.

For the first slice, prefer app-owned authenticated API procedures/callables that talk to the Durable Object by Thinkspace id. Do not expose raw `/agents/*` or `/api/agents/*` routes to browsers until the route is explicitly gated by Better Auth session and Thinkspace ownership checks.

Use manual runtime wiring in `apps/server` rather than adopting Think's Vite framework conventions immediately. Revisit Think's framework routing later if the app consolidates web and runtime routing or needs generated agent trees.

## Scope

### In scope

- Add the Project Think/Agents dependencies required for a server-side Thinkspace Agent runtime.
- Add `ThinkspaceAgent extends Think<CloudflareEnv>` in the server/runtime Worker.
- Export the Durable Object class from the Worker entry.
- Add an Alchemy SQLite Durable Object namespace binding for `ThinkspaceAgent`.
- Add/update Cloudflare environment types for the new binding.
- Add an authenticated, Thinkspace-owned submit endpoint/procedure.
- Add an authenticated, Thinkspace-owned inspect endpoint/procedure.
- Use a runtime-safe model resolver seam from inside the Durable Object.
- Disable unsafe default Think tools for the first slice.
- Add tests for authorization, route/procedure boundaries, and policy seams where local tests can cover them.
- Add a manual dev smoke checklist for Durable Object deployment/runtime behavior that cannot be fully covered locally.

### Out of scope

- MCP tool execution.
- Connected Account credential use by the runtime.
- Product-level Permission enforcement beyond the no-tools baseline.
- Product-level Approval creation or Review Queue population.
- External mutations.
- Memory acceptance or Memory review.
- Source uploads/R2 ingestion into the runtime.
- Artifact creation/publishing.
- Coordinator runtime behavior.
- Sub-agents.
- Workflows.
- Scheduled recurring work.
- Think Vite framework adoption.
- Browser streaming chat UI.

## User Stories

### Runtime submission

As an authenticated user who owns a Thinkspace, I can submit a bounded instruction to that Thinkspace's Thinkspace Agent so the product can durably accept the work instead of depending on one request-scoped chat completion.

### Runtime inspection

As an authenticated user who owns a Thinkspace, I can inspect the accepted runtime turn so I can see whether the Thinkspace Agent has completed and what it produced.

### Tenancy protection

As a user, I cannot submit work to or inspect another user's Thinkspace Agent, even if I know or guess a Thinkspace id or runtime route.

### Safety baseline

As a user, my first Thinkspace Agent runtime cannot execute shell commands, MCP tools, connected-account mutations, or workspace writes merely because Project Think provides those features.

## Requirements

### 1. Dependencies

Add the minimum runtime dependencies needed for the first slice:

- `@cloudflare/think`
- `agents`
- any direct peer/runtime dependency not already satisfied by the repo

Do not add `@cloudflare/ai-chat` unless this slice adds a browser chat client. The preferred first interface is authenticated submit/inspect, not `useAgentChat`.

### 2. Durable Object binding

Add a SQLite-backed Durable Object namespace for `ThinkspaceAgent` in Alchemy infrastructure.

Suggested binding shape:

```ts
DurableObjectNamespace("thinkspace-agent", {
  className: "ThinkspaceAgent",
  sqlite: true,
});
```

Bind it under a clear environment name such as `THINKSPACE_AGENT` and update runtime types accordingly.

### 3. ThinkspaceAgent class

Create a server/runtime module for `ThinkspaceAgent extends Think<CloudflareEnv>`.

Minimum runtime configuration:

- `workspaceBash = false`
- low bounded `maxSteps`, e.g. `3`
- `beforeTurn()` returns `activeTools: []` or an explicitly safe read-only subset
- no MCP registration
- no external mutation tools
- minimal system/persona context aligned with Better Agent language

The class must not import oRPC router/procedure code. Runtime dependencies should be pure seams or shared helpers that are safe inside a Durable Object.

### 4. Runtime identity

The app must address the Durable Object by stable Thinkspace id.

Do not derive runtime identity from:

- user id;
- email;
- session id;
- conversation id;
- prompt text;
- Goal text;
- display name.

### 5. Authenticated submit path

Add a protected app-owned submit operation, for example:

```txt
runtime.submitTurn({ thinkspaceId, prompt, idempotencyKey })
```

The operation must:

1. require an authenticated Better Auth session;
2. verify the user owns or is authorized for the Thinkspace;
3. resolve the Thinkspace Agent Durable Object by `thinkspaceId`;
4. pass the instruction to the runtime through `submitMessages()` or an equivalent callable wrapper;
5. include an idempotency key for safe retries;
6. return a durable accepted/submission identifier rather than pretending the entire turn is always request-synchronous.

### 6. Authenticated inspect path

Add a protected app-owned inspect operation, for example:

```txt
runtime.inspectTurn({ thinkspaceId, submissionId })
```

The operation must:

1. require an authenticated Better Auth session;
2. verify Thinkspace ownership/authorization;
3. resolve the same Thinkspace Agent Durable Object by `thinkspaceId`;
4. inspect the submission or runtime-local turn status;
5. return enough state for the product surface to show accepted, running, completed, failed, or unknown states.

### 7. Model resolution

Implement a runtime-safe model resolver seam for `ThinkspaceAgent.getModel()`.

The seam should:

- read product metadata from D1 using server/runtime-safe database helpers;
- respect the Thinkspace's configured model policy;
- resolve provider credentials through the existing BYOK model rules;
- avoid importing web/client code or transport routers;
- fail closed when a provider key or model permission is missing.

If full BYOK decryption/policy is too large for the first implementation PR, the first PR may use a single configured server-side model only if the limitation is explicit, tested, and does not bypass future Thinkspace policy.

### 8. Tool and mutation safety

The first slice must be model-only or read-only.

It must not enable:

- workspace Bash;
- workspace write/edit/delete tools;
- MCP tools;
- Connected Account tools;
- external service mutations;
- Local Node access;
- product Memory writes;
- Artifact publishing.

Any future tool execution must pass through Thinkspace-scoped Permission policy and, where judgement is required, product-level Approval and Review Queue flows.

### 9. Storage ownership

Respect ADR-0002:

- D1 remains the source for product indexes, Thinkspace ownership, authorization metadata, model settings, and catalog configuration.
- Durable Object SQLite owns runtime-local Thinkspace Agent messages/session/turn state.
- R2 remains the target for large Sources and Artifacts when later slices need them.

Do not duplicate product ownership decisions into Durable Object SQLite as the authority.

### 10. Observability and Audit Trail boundary

Add developer logs only where useful for debugging runtime wiring. Do not call those logs the Audit Trail.

The first slice may defer user-facing Audit Trail events, but it must leave an obvious seam for later recording meaningful runtime actions such as accepted turn, completed turn, failed turn, proposed external action, and accepted Memory/Artifact changes.

## Acceptance Criteria

- A real `ThinkspaceAgent` Durable Object class exists and is exported from the server Worker.
- Alchemy config includes a SQLite Durable Object binding for the class.
- Environment types compile with the new binding.
- An authenticated owner can submit a prompt/instruction to a Thinkspace Agent by Thinkspace id.
- The submit operation returns a durable accepted/submission identifier or equivalent inspectable handle.
- The same owner can inspect the submitted turn by Thinkspace id and handle.
- An unauthenticated request cannot submit or inspect runtime work.
- An authenticated non-owner cannot submit or inspect another user's Thinkspace Agent.
- The runtime instance identity is stable across retries for the same Thinkspace id.
- Workspace Bash is disabled.
- No MCP, Connected Account, external mutation, Memory write, or Artifact publishing tool is active.
- Missing model credentials or disallowed models fail closed with a typed/product-safe error.
- Existing Thinkspace CRUD/control-plane behavior continues to work.
- Tests cover authorization and policy seams where possible.
- A manual dev smoke checklist documents how to verify Durable Object creation, submission, inspection, and failure behavior in a Cloudflare-compatible environment.

## Suggested Implementation Order

1. Add dependencies and confirm package/lockfile compatibility.
2. Add the Durable Object binding in Alchemy and environment types.
3. Add `ThinkspaceAgent` with conservative defaults and stub/minimal `getModel()` wiring.
4. Export the class from the server Worker entry.
5. Add protected submit/inspect procedures with Thinkspace ownership checks.
6. Add model resolver seam and fail-closed errors.
7. Add unit/integration tests for auth, ownership, model policy, and no-tools policy.
8. Add the manual runtime smoke checklist.
9. Run typecheck/lint/tests and a Cloudflare-compatible local deployment smoke.

## Open Questions

- Should the first implementation use `submitMessages()` directly through an app-owned stub/callable, or wrap it in a custom `@callable()` method with Better Agent-specific input and metadata?
- Which model should be the required default for local/dev runtime smoke if no user BYOK key is configured?
- Where should runtime-safe model resolution live so both API procedures and Durable Objects can use it without importing transport code?
- What is the minimal product UI for inspecting the first runtime turn: Thinkspace detail panel, developer-only route, or hidden diagnostic action?
- When should accepted/completed runtime turns become user-facing Audit Trail entries?

## Future Slices

After this PRD is implemented and validated, later PRDs should cover:

- Thinkspace-scoped MCP enablement and runtime reconciliation.
- Permission enforcement in `beforeToolCall()`.
- Product-level Approval records backed by Think tool pause/resume mechanics.
- Review Queue population and Backpressure for judgement-bearing work.
- Memory proposal, review, acceptance, and runtime context injection.
- Source ingestion and R2-backed large material handling.
- Artifact creation, review, publishing, and citation behavior.
- Coordinator-owned Review Queue surfaces.
- Scheduled/recurring Thinkspace work.
