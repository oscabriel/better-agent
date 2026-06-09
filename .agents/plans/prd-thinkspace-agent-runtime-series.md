# PRD: First Thinkspace Agent Runtime Series

## Problem Statement

Better Agent has the control-plane shape for authenticated Thinkspaces, model/provider configuration, MCP catalog setup, Thinkspace-scoped tool placeholders, settings, and Cloudflare deployment infrastructure. But from the user's perspective, a Thinkspace is still only a product record: it cannot yet accept Goal-directed work into a durable **Thinkspace Agent**, run a bounded model turn, persist runtime-local state, or provide an inspectable result.

This blocks the next product step. Users should be able to create a Thinkspace and know there is one real, durable Thinkspace Agent behind it, without prematurely exposing unsafe tool execution, Connected Account access, external mutations, unreviewed Memory, or Artifact publishing. The runtime must establish the Cloudflare-native foundation while preserving Better Agent's domain boundary: Project Think is the implementation substrate, not the product model.

## Solution

Implement the first Project Think-backed **Thinkspace Agent runtime** series.

From the user's perspective, an authenticated owner of a Thinkspace will be able to submit a bounded instruction to that Thinkspace, have the work durably accepted by the Thinkspace Agent, and inspect the turn status/result later. The product should behave like durable delegation rather than a request-scoped chat completion.

The first runtime series should be deliberately conservative:

- one durable Thinkspace Agent instance per Thinkspace;
- stable runtime identity based on the Thinkspace id;
- app-owned authenticated submit and inspect operations;
- Project Think used for the runtime loop, Durable Object state, message/session persistence, and recovery;
- Better Agent control-plane data used for ownership, model policy, and credential policy;
- no default workspace Bash;
- no MCP tools;
- no Connected Account tools;
- no external mutations;
- no product Memory writes;
- no Artifact publishing;
- no public raw Project Think routes until Better Auth and Thinkspace ownership gates are explicit.

This PRD should produce a runtime foundation that later implementation series can extend with Thinkspace-scoped Permissions, product-level Approvals, Review Queue entries, MCP execution, Memory acceptance, Sources, Artifacts, scheduled work, and Backpressure.

## User Stories

1. As an authenticated Better Agent user, I want to submit an instruction to a Thinkspace Agent, so that the Thinkspace can begin real durable work instead of remaining a static product record.
2. As a Thinkspace owner, I want the submitted instruction to be tied to the Thinkspace id, so that runtime state remains scoped to the correct Thinkspace.
3. As a Thinkspace owner, I want retries to address the same Thinkspace Agent instance, so that duplicate network attempts do not create separate runtime identities.
4. As a Thinkspace owner, I want submit requests to include an idempotency mechanism, so that transient failures can be retried safely.
5. As a Thinkspace owner, I want submit to return an accepted or inspectable handle, so that I can tell the work was durably accepted even if completion is asynchronous.
6. As a Thinkspace owner, I want to inspect a submitted turn later, so that I can see whether the Thinkspace Agent is accepted, running, completed, failed, or unknown.
7. As a Thinkspace owner, I want inspection to use the same Thinkspace identity as submission, so that I never inspect a different runtime by accident.
8. As an authenticated user, I want non-owned Thinkspaces to be inaccessible through runtime submission, so that another user cannot make my Thinkspace Agent work.
9. As an authenticated user, I want non-owned Thinkspaces to be inaccessible through runtime inspection, so that another user cannot read my Thinkspace Agent state.
10. As an unauthenticated visitor, I want runtime operations to be rejected, so that private Thinkspaces cannot be driven or inspected anonymously.
11. As a user, I want guessed Thinkspace ids to be useless without authorization, so that identifier leakage does not become runtime access.
12. As a user, I want raw Project Think routes to remain private or disabled by default, so that runtime internals are not accidentally exposed as a public API.
13. As a user, I want the runtime to use the model configuration governed by Better Agent, so that the Thinkspace Agent respects product-level model choices.
14. As a user, I want missing model credentials to fail clearly and safely, so that the runtime does not silently pick an unintended provider.
15. As a user with BYOK credentials, I want saved provider credentials to require the appropriate Thinkspace Permission policy, so that credentials are not globally inherited by every Thinkspace.
16. As a user with app-provided models available, I want the runtime to use only configured app credentials, so that the product fails closed when deployment credentials are absent.
17. As a Thinkspace owner, I want runtime errors to be product-safe, so that provider keys, internal bindings, and raw stack details are not exposed.
18. As a Thinkspace owner, I want the first runtime to be model-only or read-only, so that creating a Thinkspace Agent does not grant it unsafe powers.
19. As a Thinkspace owner, I want workspace Bash disabled, so that the runtime cannot execute shell commands by default.
20. As a Thinkspace owner, I want workspace write/edit/delete tools disabled, so that the runtime cannot mutate its workspace before product rules exist.
21. As a Thinkspace owner, I want MCP tools disabled in the first runtime slice, so that catalog entries and Connected Accounts cannot be used without explicit Thinkspace-scoped Permissions.
22. As a Thinkspace owner, I want Connected Accounts to remain separate from runtime access, so that connecting an account does not implicitly grant every Thinkspace Agent that account.
23. As a Thinkspace owner, I want no external mutations in the first runtime slice, so that the system cannot create issues, send messages, update files, or change services before Approvals exist.
24. As a Thinkspace owner, I want no product Memory writes in the first runtime slice, so that runtime context and compaction do not become accepted Memory without review.
25. As a Thinkspace owner, I want no Artifact publishing in the first runtime slice, so that a model response does not automatically become durable output without product acceptance rules.
26. As a user, I want Project Think's sessions and workspace concepts to stay internal, so that Better Agent's Thinkspace, Source, Memory, Artifact, Permission, and Approval meanings remain clear.
27. As a user, I want the first runtime to leave room for future Review Queue holdpoints, so that later judgement-bearing work can be batched instead of auto-merged.
28. As a user, I want Backpressure to remain a future product layer, so that the first runtime does not optimize for noisy agent activity over understood outcomes.
29. As a developer, I want the Thinkspace Agent class exported by the Worker, so that Cloudflare can instantiate the Durable Object runtime.
30. As a developer, I want the infrastructure layer to declare a SQLite Durable Object binding for the Thinkspace Agent, so that runtime state is colocated with the Durable Object.
31. As a developer, I want environment types to include the new runtime binding, so that runtime calls are typechecked instead of stringly typed.
32. As a developer, I want the server Worker to keep owning auth and API routing, so that Project Think does not bypass Better Agent's tenancy checks.
33. As a developer, I want runtime submit and inspect to be exposed through the existing typed API style, so that the web app can call them consistently with existing product operations.
34. As a developer, I want ownership checks to reuse the existing Thinkspace repository/policy seams, so that runtime authorization matches Thinkspace CRUD authorization.
35. As a developer, I want model resolution to be shared through a runtime-safe seam, so that Durable Objects do not import transport/router code.
36. As a developer, I want Project Think dependencies added deliberately, so that the repo stays aligned with AI SDK v6 and Cloudflare Workers constraints.
37. As a developer, I want the implementation to avoid Think's Vite framework conventions for now, so that the first runtime slice fits the existing API Worker architecture.
38. As a developer, I want runtime-local state to live in Durable Object SQLite, so that product D1 remains the source for indexes and authorization metadata while the agent owns messages/session state.
39. As a developer, I want product D1 to remain the authority for ownership, model policy, and catalog configuration, so that runtime-local state cannot override product permissions.
40. As a developer, I want clear typed errors for unauthenticated, unauthorized, not found, missing model, and runtime failure cases, so that clients can render safe states.
41. As a developer, I want submitted turns to carry Better Agent metadata, so that later Audit Trail, Review Queue, and debugging layers can correlate work with a Thinkspace.
42. As a developer, I want developer logs to remain distinct from Audit Trail, so that implementation diagnostics are not confused with user-facing history.
43. As a developer, I want a manual Cloudflare-compatible smoke checklist, so that Durable Object behavior can be verified where local unit tests are insufficient.
44. As a developer, I want existing Thinkspace CRUD behavior to keep passing, so that adding the runtime does not regress the control plane.
45. As a developer, I want tests to prove no tools are active by default, so that future tool work has an explicit policy gate.
46. As a developer, I want tests to prove raw runtime access cannot bypass auth, so that public routing mistakes are caught early.
47. As a developer, I want tests to prove stable runtime identity, so that every operation for a Thinkspace reaches the same Thinkspace Agent.
48. As a developer, I want tests around missing or disallowed model credentials, so that runtime work fails closed.
49. As a developer, I want the first UI surface to be minimal, so that implementation energy goes into runtime correctness rather than premature chat UX.
50. As a future implementer, I want the first runtime to leave clean seams for MCP, Approvals, Memory, Artifacts, and Review Queue work, so that the runtime foundation can grow without a rewrite.

## Implementation Decisions

- Use Project Think as the first runtime layer for the Thinkspace Agent, in line with the Project Think ADR.
- Keep Better Agent's domain model authoritative over Project Think terminology and primitives.
- Create one durable Thinkspace Agent runtime instance per Thinkspace.
- Use the stable Thinkspace id as the runtime instance name.
- Do not use user id, session id, conversation id, Goal text, prompt text, or display name as runtime identity.
- Implement the first slice in the API/runtime Worker rather than adopting Project Think's framework routing conventions.
- Keep the server Worker responsible for Better Auth, typed API routing, ownership checks, and the runtime access boundary.
- Add a SQLite Durable Object namespace binding for the Thinkspace Agent runtime.
- Export the Thinkspace Agent Durable Object class from the Worker module so Cloudflare can instantiate it.
- Add the runtime binding to shared Cloudflare environment types.
- Add the minimum Project Think and Cloudflare Agents dependencies required for server-side runtime work.
- Do not add the browser chat package unless this implementation also ships a browser streaming chat client.
- Prefer app-owned typed API operations for submit and inspect over browser-reachable raw Project Think routes.
- If any raw Project Think route is introduced, it must be gated before Project Think handles the request.
- Add a runtime submit operation that requires an authenticated session, verifies Thinkspace ownership, resolves the Thinkspace Agent by Thinkspace id, passes the instruction into Project Think, and returns an inspectable handle.
- Add a runtime inspect operation that requires an authenticated session, verifies Thinkspace ownership, resolves the same Thinkspace Agent by Thinkspace id, and returns product-safe turn state.
- Treat durable acceptance separately from model completion; the submit operation should not imply synchronous completion.
- Include idempotency for submit so clients can retry safely.
- Add product-safe turn states such as accepted, running, completed, failed, and unknown.
- Reuse existing Thinkspace ownership repository behavior rather than inventing a separate runtime ownership model.
- Keep D1 as the authority for product indexes, Thinkspace ownership, model settings, catalog configuration, and authorization metadata.
- Keep Durable Object SQLite as the owner of runtime-local Project Think message/session/turn state.
- Keep R2 out of this slice except as a future home for large Sources and Artifacts.
- Implement a runtime-safe model resolution seam that can be used from inside the Thinkspace Agent without importing transport routers.
- Reuse the existing model catalog and model resolver behavior where it is safe for the runtime.
- Fail closed when a model id is unknown, credentials are missing, or BYOK use lacks the required Thinkspace Permission policy.
- If a full BYOK runtime path is too large for the first implementation, allow a narrow app-provided model fallback only when explicitly documented, tested, and compatible with future Thinkspace policy.
- Disable workspace Bash in the Thinkspace Agent runtime.
- Keep Project Think step count low for this first slice.
- Return no active tools or only explicitly safe read-only tools during the first runtime slice.
- Do not register MCP servers during this PRD.
- Do not expose Connected Account tools during this PRD.
- Do not execute external mutations during this PRD.
- Do not write product Memory during this PRD.
- Do not publish Artifacts during this PRD.
- Keep Project Think tool approval mechanics out of product behavior for now; later work may map them to Better Agent Approval records and Review Queue entries.
- Add a seam for future user-facing Audit Trail events, but do not call developer logs the Audit Trail.
- Preserve existing Thinkspace CRUD and tool-selection placeholder behavior.
- Keep the initial UI minimal: enough to invoke or inspect the runtime if needed, not a full chat product.
- Do not make running-agent count or producer-side activity a primary surface.

## Testing Decisions

- Test external behavior and policy outcomes, not Project Think internals or implementation details.
- The highest automated seam should be the protected typed API operations for runtime submit and inspect, because those are the product boundary users and the web app depend on.
- Runtime submit tests should prove unauthenticated requests are rejected, non-owner requests are rejected, owners can submit, and submit returns a durable inspectable handle.
- Runtime inspect tests should prove unauthenticated requests are rejected, non-owner requests are rejected, owners can inspect their own submitted work, and unknown handles return product-safe states.
- Authorization tests should reuse the existing Thinkspace ownership style as prior art from the Thinkspace CRUD router/repository behavior.
- Model policy tests should reuse the existing model resolver tests as prior art, especially unknown model rejection, BYOK Permission requirements, provider selection, and reasoning option mapping.
- Add tests around the runtime-safe model resolver seam rather than testing provider SDK internals.
- Add tests proving missing provider credentials fail closed with a typed/product-safe error.
- Add tests proving BYOK credentials cannot be used without Thinkspace Permission policy.
- Add tests for the pure runtime safety policy: workspace Bash disabled, no mutating workspace tools, no MCP tools, no Connected Account tools, no external mutation tools, no Memory write tools, and no Artifact publishing tools.
- Add tests proving runtime identity derives from Thinkspace id and remains stable across repeated submit/inspect calls.
- Add tests proving archived or missing Thinkspaces cannot receive runtime submissions if the implementation chooses to block archived Thinkspaces.
- Add tests around idempotency behavior at the highest seam available: repeated submit with the same idempotency key should not create ambiguous duplicate work.
- Add tests for product-safe runtime states so clients can render accepted, running, completed, failed, and unknown without parsing raw Project Think errors.
- Add typecheck/build verification for the server Worker export and new environment binding.
- Add infrastructure verification through typecheck/build for the SQLite Durable Object binding.
- Use existing node test style in the API package as prior art for pure policy and resolver tests.
- Do not mock or assert Project Think's private storage tables; test through the runtime/API contract.
- Do not rely solely on unit tests for Durable Object behavior; include a manual Cloudflare-compatible smoke checklist.
- Manual smoke should verify creating a Thinkspace, submitting a runtime turn, inspecting it, retrying with the same idempotency key, rejecting unauthenticated access, rejecting non-owner access, failing closed on missing model credentials, and confirming no tools are available.
- Manual smoke should verify deployment/runtime wiring in a Cloudflare-compatible environment because Durable Object migrations and bindings cannot be fully proven by local pure unit tests.
- Existing full-repo checks should continue to pass: formatting/linting, package typechecks, and server build.

## Out of Scope

- MCP tool execution.
- Connected Account credential use by the runtime.
- Local Node access.
- External service mutations.
- Product-level Approval records.
- Review Queue population.
- Backpressure behavior.
- Memory proposal, review, or acceptance.
- Source ingestion into runtime context.
- R2-backed large material handling.
- Artifact creation, publishing, or review.
- Coordinator runtime behavior.
- Sub-agents.
- Workflows.
- Scheduled recurring Thinkspace work.
- Project Think Vite framework adoption.
- Generic browser chat UI.
- WebSocket streaming.
- Public raw Project Think routes without Better Auth and Thinkspace ownership gates.
- User-facing Audit Trail entries beyond leaving a future seam.
- Selling or surfacing running-agent count as the product value.

## Further Notes

This PRD follows the Cloudflare-native runtime, split storage ownership, draft-or-approval, Thinkspace-scoped tool enablement, attention-respecting orchestration, and Project Think runtime ADRs.

The most important architectural boundary is that Project Think is the runtime substrate, not the Better Agent product model. Think sessions, workspace files, context blocks, compaction, tool approvals, and MCP helpers must not silently become Better Agent Sessions, Sources, Memory, Artifacts, Permissions, or Approvals.

This PRD should be the first runtime implementation series after the control-plane rewrite. Later PRDs should build on it in narrow vertical slices: MCP reconciliation, Permission enforcement, Approval/Review Queue integration, Memory acceptance, Artifact handling, scheduled work, and Coordinator-owned Review Queue behavior.
