# Better Agent repo-swap readiness checklist

Date: 2026-06-07
Branch validated: `better-agent-rewrite`
Issue: #16

This checklist records the final dependency-aligned salvage validation for replacing the Better Chat product core with the Better Agent Thinkspace slice. It is intentionally split into automated evidence and human approval gates because production/staging resource mapping, final `better-agent-rewrite` -> `main` merge timing, and repository rename coordination remain human-owned decisions.

## Automated validation evidence

Commands run from `/Users/oscargabriel/Developer/projects/better-chat-better-agent-rewrite`:

```sh
bun x ultracite check
bun run check-types
bun run build
bun test \
  packages/api/src/thinkspaces/lifecycle.test.ts \
  packages/api/src/thinkspaces/policy.test.ts \
  packages/api/src/models/resolver.test.ts \
  packages/api/src/mcp/url-policy.test.ts
```

Results:

- Ultracite formatting/lint: passed.
- Typecheck: passed.
- Build: passed.
- Pure domain tests: 17 passed.
- Known non-blocking warning: Vite reports the existing large client/SSR chunk warning.

Static guardrail searches run:

```sh
rg 'path: "/(chat|ai)"|to="/(chat|ai)"|/chat|/ai' apps packages -n
rg 'UserDurableObject|USER_DO|DEFAULT_ENABLED_MCP_SERVERS' apps packages -n
rg 'conversation|message(s)? table|chat' apps packages -n
rg 'Better Chat' apps packages -n
rg 'enabledByDefaultForThinkspaces: true|DEFAULT_ENABLED|context7.*enabled|enabledMcpServers' apps packages -n
```

Results:

- No primary `/chat` or `/ai` product path found.
- No `UserDurableObject`, `USER_DO`, or `DEFAULT_ENABLED_MCP_SERVERS` binding/path found.
- No conversation compatibility layer found in `apps` or `packages`.
- No product-facing Better Chat copy found in `apps`; one backend catalog source string intentionally references Better Chat as salvage provenance.
- No global Thinkspace tool/MCP enablement found.

## Acceptance checklist

| Check                                                                            | Status                              | Evidence / notes                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build and typecheck pass or failures documented                                  | Passed                              | `bun run check-types`, `bun run build` passed.                                                                                                                               |
| Auth works locally and in staging                                                | Human validation required           | Auth code builds and protected procedures use `auth.api.getSession`; local/staging interactive auth was not exercised in this automated pass.                                |
| D1 migrations tested against disposable/dev/staging database                     | Human validation required           | Migration files exist under `packages/db/src/migrations`; this pass did not mutate a Cloudflare/dev D1 database. Run disposable/staging migration before production cutover. |
| Thinkspace create/list/get/archive works through API and UI                      | Partially validated                 | API lifecycle/policy pure tests passed and UI builds. Interactive browser/API smoke remains recommended before main cutover.                                                 |
| Archived Thinkspaces are inert but inspectable                                   | Passed by module/UI review          | `createThinkspaceArchivePatch` rejects re-archive; UI disables archive/action affordances for archived Thinkspaces; tool selection mutation rejects archived Thinkspaces.    |
| No primary `/chat` or `/ai` product path exists                                  | Passed                              | Static search found no `/chat` or `/ai` route/path in `apps` or `packages`.                                                                                                  |
| No old conversation compatibility layer exists                                   | Passed                              | Static search found no conversation compatibility layer in `apps` or `packages`.                                                                                             |
| No globally configured MCP/tool/model catalog item auto-enables for a Thinkspace | Passed                              | New Thinkspaces default `enabledToolIds` to `[]`; MCP built-ins use `enabledByDefaultForThinkspaces: false`; static search found no global enablement.                       |
| Product-facing UI uses Better Agent domain vocabulary                            | Passed by source review             | UI surfaces use Better Agent, Thinkspace, Goal, Permission, Approval, Source, Memory, Skill, Artifact, Audit Trail, Review Queue.                                            |
| BYOK and MCP secrets are encrypted/redacted                                      | Passed by module review/tests       | Provider credentials and MCP headers use AES-GCM helper and redacted outputs.                                                                                                |
| Alchemy resources and routes mapped deliberately for final cutover               | Partial / human validation required | `packages/infra/alchemy.run.ts` uses stage-aware names and D1/KV/R2/Worker/web mappings. Actual production route/domain values must be approved before deploy.               |
| `UserDurableObject` not bound in production path                                 | Passed                              | Static search found no `UserDurableObject` or `USER_DO`.                                                                                                                     |
| Final human-approved merge/rename plan exists                                    | Proposed below; approval required   | This document provides the plan. Human must approve timing and execute/authorize main merge + repo rename.                                                                   |

## Resource mapping for cutover review

| Resource             | Better Agent target                                                   | Notes                                                                                                           |
| -------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Product D1           | `${app.name}-${stage}-product-db` bound as `DB`                       | Uses `packages/db/src/migrations`. Non-local deploys use `adopt: true`.                                         |
| Session/cache KV     | `${app.name}-${stage}-session-cache` bound as `SESSION_KV`            | Non-authoritative session/cache binding.                                                                        |
| Sources/Artifacts R2 | `${app.name}-${stage}-sources-artifacts` bound as `SOURCES_ARTIFACTS` | Prepared for future Sources/Artifacts blobs.                                                                    |
| API Worker           | `${app.name}-${stage}-api`                                            | Hono/oRPC/auth control plane. No old chat DO binding.                                                           |
| Web app              | `${app.name}-${stage}-web`                                            | TanStack Start app.                                                                                             |
| Future Agent runtime | `ThinkspaceAgent` only, deferred                                      | No Durable Object namespace is currently bound; future runtime must be Thinkspace-scoped, not user/chat-scoped. |
| Alchemy state        | CloudflareStateStore for non-local stages                             | Requires `ALCHEMY_STATE_TOKEN`; dev/local use local state.                                                      |

## Required human gates before merging to `main`

1. Confirm all blocking child issues #4 through #15 are closed and merged into `better-agent-rewrite`.
2. Confirm the exact deployment stage order: dev/disposable -> staging -> production.
3. Confirm Cloudflare resource naming and whether `adopt: true` should attach to existing resources or create replacements for each non-local stage.
4. Run D1 migrations against a disposable or staging D1 database before production.
5. Run local/staging auth smoke checks:
   - sign in;
   - session restore;
   - protected oRPC procedure receives session;
   - sign out clears usable session.
6. Run Thinkspace UI smoke checks in browser:
   - create Thinkspace;
   - list Thinkspaces;
   - open detail;
   - archive;
   - confirm archived Thinkspace is inspectable and inert;
   - select/remove MCP catalog tool placeholder before archive.
7. Verify product settings UI redacts BYOK/MCP credentials after save.
8. Approve the `better-agent-rewrite` -> `main` merge window.
9. Merge `better-agent-rewrite` into `main` as the whole-cloth replacement.
10. Rename repository/product metadata from Better Chat to Better Agent after merge, preserving issue/PR history.
11. Keep old Better Chat source recoverable through git history during the final verification window.

## Recommended final commands after human approval

```sh
git switch better-agent-rewrite
git pull --ff-only
bun x ultracite check
bun run check-types
bun run build
bun test \
  packages/api/src/thinkspaces/lifecycle.test.ts \
  packages/api/src/thinkspaces/policy.test.ts \
  packages/api/src/models/resolver.test.ts \
  packages/api/src/mcp/url-policy.test.ts

# after staging/deploy validation and explicit human approval
git switch main
git pull --ff-only
git merge --ff-only better-agent-rewrite
git push origin main
```

If `main` cannot fast-forward, stop and review the diff. Do not merge production cutover conflicts mechanically.
