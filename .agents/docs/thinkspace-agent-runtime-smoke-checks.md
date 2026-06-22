# Thinkspace Agent runtime smoke checks

Issue #37 closes out the first Thinkspace Agent runtime slice (umbrella #3, PRD
`.agents/plans/prd-thinkspace-agent-runtime.md`). The local suite (79 tests)
covers the authorization, policy, and seam behavior that node tests can reach.
This checklist covers what only a Cloudflare-compatible runtime (workerd) can
prove: Durable Object binding/migration, real DO storage and RPC, real Project
Think submission draining, and real model turns.

Run it after changing the runtime surfaces (`apps/server/src/agents/`,
`packages/api/src/thinkspaces/`, `packages/infra/alchemy.run.ts`) or before
promoting a stage that includes them.

## Secrets hygiene (read first)

- Never paste values of user-provided provider API keys (BYOK credentials),
  `API_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, or `ALCHEMY_STATE_TOKEN` into
  issues, PRs, logs, or this file. Refer to them by name only. There are no
  deploy-time provider key bindings; all inference runs on user-owned
  credentials saved in settings.
- Keep curl cookie jars outside the repo (`/tmp/ba-owner.txt`,
  `/tmp/ba-intruder.txt`) and delete them when done.
- The model-failure check below is designed to need **no** real or fake
  credential material; do not "test" failure modes by pasting a broken key
  anywhere.
- Nothing in this checklist requires committing secrets; if a step seems to,
  the step is being done wrong.

## Developer logs vs Audit Trail

Everything this checklist reads from `alchemy dev` console output, Cloudflare
Workers observability (enabled for the API Worker in
`packages/infra/alchemy.run.ts:108-110`), or DO error messages is **developer
logging** for runtime wiring. None of it is the product **Audit Trail**: that
is a future user-facing surface of meaningful history (accepted turn,
completed turn, proposed external action), per the PRD's observability
boundary. Do not describe log output as Audit Trail entries in findings, and
do not skip a product-surface check because "the logs showed it worked".

## Environment setup

1. Ensure env files exist for the stage (`packages/infra/.env*`,
   `apps/server/.env*`, `apps/web/.env*`); `packages/infra/alchemy.run.ts:37-43`
   fails fast on missing required names.
2. `bun install`.
3. `bun run dev` — runs `alchemy dev`, which manages the local Cloudflare
   resources (workerd via miniflare) and applies the D1 migrations from
   `packages/db/src/migrations` to the local database; it also launches local
   Drizzle Studio as a read-only viewer. Note the printed `Web ->` and
   `Server ->` URLs; the API Worker serves on port 3000
   (`packages/infra/alchemy.run.ts:103-105`).
4. Export for the curl steps below (adjust to the printed URLs):

   ```sh
   export SERVER=http://localhost:3000
   ```

5. For a deployed smoke, use `bun run deploy` with the target stage and
   substitute the deployed server URL.

API procedures are reachable two ways: the web UI at
`/thinkspaces/$thinkspaceId` (`apps/web/src/routes/thinkspaces.$thinkspaceId.tsx`)
and the OpenAPI mapping of the oRPC router at `$SERVER/api/openapi/*`
(`apps/server/src/index.ts:83-98`; procedures without explicit routes map to
`POST /api/openapi/<router>/<procedure>`; open `$SERVER/api/openapi` for the
generated reference if a path 404s).

### Create the smoke users and Thinkspaces

1. Open the web URL, sign up an **owner** user (`/login` → "Sign up"; email +
   password ≥ 8 chars + name ≥ 2 chars).
2. Create two Thinkspaces, **TS-A** and **TS-B** (goal required). Record both
   ids from the URL (`thinkspace_<uuid>`).
3. Sign up a second **intruder** user in a private window. Create one
   Thinkspace for it so the account is fully functional.
4. For curl, capture sessions (Better Auth email endpoints):

   ```sh
   curl -s -c /tmp/ba-owner.txt "$SERVER/api/auth/sign-in/email" \
     -H 'content-type: application/json' \
     -d '{"email":"<owner-email>","password":"<owner-password>"}'
   curl -s -c /tmp/ba-intruder.txt "$SERVER/api/auth/sign-in/email" \
     -H 'content-type: application/json' \
     -d '{"email":"<intruder-email>","password":"<intruder-password>"}'
   ```

## 1. Durable Object binding and migration

Expectation: Alchemy provisions a SQLite-backed DO namespace
`thinkspace-agent` with class `ThinkspaceAgent`
(`packages/infra/alchemy.run.ts:62-65`, bound as `THINKSPACE_AGENT` at
`:83-86`), and the Worker entry exports the class
(`apps/server/src/index.ts:17`).

- [ ] `bun run dev` boots without DO/migration errors (a missing class export
      or missing SQLite migration fails at startup in workerd).
- [ ] `$SERVER/api/health` returns `OK`.
- [ ] Signed in as the owner, `POST $SERVER/api/openapi/thinkspaces/runtimeReadiness`
      with `{"thinkspaceId":"<TS-A>"}` returns
      `status: "ready"`, `bindingName: "THINKSPACE_AGENT"`,
      `className: "ThinkspaceAgent"` (`packages/api/src/thinkspaces/runtime.ts:54-77`).
- [ ] Deployed stages only: the Cloudflare dashboard for the API Worker lists
      the `ThinkspaceAgent` Durable Object class with **SQLite** storage
      backend, and the deploy emitted a `new_sqlite_classes` migration for the
      class on first rollout (the dependency study flagged this as the item to
      verify: `.agents/docs/dependency-studies/cloudflare-project-think.md:104`).

## 2. Stable runtime identity per Thinkspace

Expectation: one runtime identity per Thinkspace, named by the stable
Thinkspace id (`packages/api/src/thinkspaces/runtime.ts:42-52`).

- [ ] On `/thinkspaces/<TS-A>`, the "Thinkspace Agent runtime" panel shows
      `runtimeName` equal to the TS-A id.
- [ ] `runtimeReadiness` for TS-A returns the same `runtimeId` across repeated
      calls and across a dev-server restart (DO ids from `idFromName` are
      deterministic).
- [ ] `runtimeReadiness` for TS-B returns a **different** `runtimeId`.

## 3. Owner submit and inspect end to end

Expectation: an owner-submitted instruction is durably accepted, drained by
the runtime, and inspectable until completed, with the model resolved in
`beforeTurn` from product configuration — the `getModel()` placeholder string
is never used for inference
(`apps/server/src/agents/thinkspace-agent.ts:41-46,139-141,151-166`).

- [ ] The model readiness panel for TS-A shows ready with the default model
      `google:gemini-2.5-flash-lite` (`packages/api/src/models/catalog.ts`)
      once the owner has a saved google credential and TS-A has the granted
      credential Permission.
- [ ] Submit a short instruction (for example "Reply with exactly: smoke-ok")
      from the "Submit a turn" panel. An "accepted" badge appears with a
      `submissionId`.
- [ ] The "Turn status" panel (auto-polls while accepted/running) progresses
      `accepted` → `running` → `completed` and renders the model's
      `resultText`. Project Think drains submissions `pending` → `running` →
      terminal in DO SQLite (Think 0.8.8 source,
      `packages/think/src/think.ts:5899-6028`).
- [ ] Inspect the same `submissionId` again after completion: still
      `completed` with the same result (runtime-local state survived in DO
      SQLite).
- [ ] Restart `bun run dev` (locally) and inspect again: still `completed`
      (state is in DO storage, not memory).

## 4. Idempotent retry behavior

Expectation: re-submitting with the same idempotency key returns the same
submission instead of a second turn. Think looks up the key and returns the
existing row with `accepted: false` (Think 0.8.8 source,
`packages/think/src/think.ts:5788-5831`), which the runtime maps to
`deduplicated: true` (`apps/server/src/agents/thinkspace-agent.ts:100-107`).

The web UI rotates its auto-generated key only after success
(`apps/web/src/routes/thinkspaces.$thinkspaceId.tsx`), so use curl to force a
true retry:

- [ ] Submit twice with the same key:

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/thinkspaces/submitTurn" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-A>","instruction":"Reply with exactly: retry-ok","idempotencyKey":"smoke-retry-1"}'
      ```

      First response: `status: "accepted"`, `deduplicated: false`. Second
      response: **same** `submissionId`, `deduplicated: true`, same
      `acceptedAt`.

- [ ] Inspecting that `submissionId` shows exactly one turn's result (the
      instruction was not run twice; the runtime's message log gained one
      user/assistant exchange for it).

## 5. Unauthenticated access is rejected

Expectation: every runtime entry point fails closed without a session.

- [ ] `submitTurn` and `inspectTurn` without a cookie return 401
      `UNAUTHORIZED` (`packages/api/src/procedures.ts:9-19`):

      ```sh
      curl -si "$SERVER/api/openapi/thinkspaces/submitTurn" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-A>","instruction":"x","idempotencyKey":"x"}'
      ```

- [ ] No raw agent route exists: `GET $SERVER/agents/thinkspace-agent/<TS-A>/get-messages`
      and the `/api/agents/...` variant return the Worker's plain 404 — the
      Worker mounts no `routeAgentRequest` routes
      (`apps/server/src/index.ts`; guarded by
      `apps/server/src/worker-routes.test.ts:21-41`).
- [ ] WebSocket upgrade attempts against those paths fail the same way (no
      101 response).
- [ ] Optional deep check (recommended once per release): the DO itself
      refuses direct HTTP even if a request somehow reaches it. The
      `ThinkspaceAgent.fetch` override returns 404 before Project Think's
      protocol wrapper can serve `/get-messages`
      (`apps/server/src/agents/thinkspace-agent.ts:62-73`; Think wraps
      `onRequest`, not `fetch`: Think 0.8.8 source,
      `packages/think/src/think.ts:6635,6699-6714`; `fetch` is the DO
      HTTP/WS entry: Agents SDK 0.15.0 source,
      `packages/agents/src/index.ts:6119`). Use the temporary probe in the
      appendix and confirm `stub.fetch(".../get-messages")` returns 404 with
      "This Thinkspace Agent runtime is not directly accessible." and never a
      message list.

## 6. Non-owner access is rejected

Expectation: ownership is checked in D1 before any DO is touched; failures do
not reveal whether the Thinkspace exists.

- [ ] As the intruder (UI or `-b /tmp/ba-intruder.txt`), `submitTurn` against
      TS-A returns 404 `Thinkspace was not found.`
      (`packages/api/src/thinkspaces/turns.ts:154-158`,
      `packages/api/src/thinkspaces/router.ts:237-268`).
- [ ] Same for `inspectTurn` with the owner's real `submissionId`, and for
      `runtimeReadiness`/`modelReadiness`/`runtimePolicy`.
- [ ] Cross-Thinkspace probing stays dark: as the owner, inspect TS-A's real
      `submissionId` against **TS-B** (`thinkspaceId: <TS-B>`). Expect status
      `unknown` — TS-B's runtime either has no bound turn context or no
      matching submission, and both fail closed to `unknown`
      (`apps/server/src/agents/thinkspace-agent.ts:110-137`,
      `packages/api/src/thinkspaces/inspect.ts:206-223`). No snapshot data
      from TS-A leaks.
- [ ] Optional deep check, real DO storage: using the appendix probe, call
      `acceptTurnSubmission` on TS-A's stub with a mismatched `thinkspaceId`.
      Expect a rejected RPC whose error message carries the
      `thinkspace-turn-product-safe:` marker text "This Thinkspace Agent
      runtime cannot accept work for a different Thinkspace."
      (`packages/api/src/thinkspaces/turn-context.ts:22-34`) and arrives as a
      plain `Error` — workerd only tunnels standard error types across
      RPC, so subclass identity is stripped and the router's typed catches
      intentionally do not fire; the product surface would see a generic 500
      (`cloudflare/workerd@79c79c87c src/workerd/jsg/util.c++:195-211`).

## 7. Missing or disallowed model credentials fail closed

Expectation: a model the user cannot actually use blocks the turn with a
product-safe message and no provider/credential detail. No secret material is
needed: BYOK models require a granted Thinkspace Permission, and the grant UI
intentionally does not exist yet, so selecting one fails closed
(`packages/api/src/models/readiness.ts:201-249`).

There is no settings UI for `defaultModel` yet, so flip it in local D1 via the
Drizzle studio that `bun run dev` starts (or `bun run db:studio:local`):

- [ ] In `user_product_settings`, set the owner's `default_model` to
      `google:gemini-2.5-pro` (another catalog entry,
      `packages/api/src/models/catalog.ts`). Insert the row with the owner's
      user id if it does not exist.
- [ ] `/thinkspaces/<TS-A>` now shows model readiness **not ready** with the
      Permission message; the submit button is disabled.
- [ ] `submitTurn` via curl returns 400 with "This Thinkspace needs Permission
      before using a saved provider credential." — no provider error, no key
      material, no stack detail (`packages/api/src/thinkspaces/turns.ts:166-176`,
      `packages/api/src/thinkspaces/router.ts:258-260`).
- [ ] Set `default_model` to a nonsense id (`google:does-not-exist`): readiness
      reports the unsupported-catalog message; submit still 400s.
- [ ] Restore `default_model` to `NULL` (falls back to the default model) and
      confirm a turn completes again.
- [ ] Delete the owner's saved google credential row in
      `user_provider_credentials` and confirm readiness reports the
      missing-user-credential message rather than a provider error; re-save
      the credential through settings afterwards.

## 8. Baseline safety policy when no tools are potent

Expectation: for a Thinkspace with no potent tool grants, turns degrade to the
safe model-only baseline. Workspace Bash, workspace mutations, Connected
Account tools, external mutations, Memory writes, and Artifact publishing are
unavailable. MCP tools are available only through the Permission-backed path in
section 9; enablement alone must still be inert
(`packages/api/src/thinkspaces/runtime-policy.ts`,
`apps/server/src/agents/thinkspace-agent.ts`).

- [ ] The "Runtime safety policy" panel on `/thinkspaces/<TS-A>` shows mode
      `model-only` and all seven capabilities **disabled**.
- [ ] `POST $SERVER/api/openapi/thinkspaces/runtimePolicy` returns
      `policyId: "no_tools_v1"`, `maxSteps: 1`, `workspaceBash: false`, every
      capability `enabled: false`.
- [ ] Submit an adversarial instruction: "Run `ls` in your workspace bash,
      write a file called pwned.txt, then list your available tools." The
      completed turn is plain text only — the model reports having no tools;
      no tool-call activity appears in the result or in developer logs
      (`getTools()` returns `{}` and `beforeTurn` returns `activeTools: []`,
      so Think merges no tools into the turn).
- [ ] Submit "Use any MCP server or connected account you have to fetch
      https://example.com" and confirm the same: text-only refusal, no
      network/tool activity in developer logs.

## 9. Permission-backed MCP round-trip

Expectation: a read-only, auth-free built-in MCP server becomes potent only
when the active Agent Profile revision enables it **and** the Thinkspace owns a
matching Permission grant. The inspect/detail payload reports potency through
the same store-backed Permission policy seam used by turn preparation and
`beforeToolCall`; grants never add tools the Profile did not enable. Revocation
removes potency on the next read and next turn without changing the Agent
Profile revision.

Use a deployed or `alchemy dev` stage at the commit under test. Prefer a fresh
Thinkspace for each branch below so one smoke branch does not hide state from
another. Keep developer-log snippets product-safe: record whether a connection
or tool call happened, not cookies, secrets, raw credential rows, or provider
keys.

Model readiness in each branch needs a `model_provider_credential` Permission
row for the Thinkspace. The product grant flow for that Permission kind does
not exist yet (section 7), so on a local stage insert the row directly into
`thinkspace_permissions` (kind `model_provider_credential`, `provider_id`
matching the default model's provider, the Thinkspace id, and the owner's user
id) via Drizzle studio or sqlite3 against the miniflare D1 file, the same way
section 7 flips `user_product_settings`.

Tool-call evidence on a local stage: the worker request log does not show
DO-internal MCP traffic. Read the runtime's own storage instead — the
miniflare DO sqlite for the Thinkspace's `runtimeId` records the turn's
messages (`assistant_messages` parts include `tool-...` entries for real MCP
tool calls) and `cf_agents_mcp_servers` rows while a turn's server connection
is registered. Record only product-safe summaries of what you see there.

### 9.1 Enablement plus grant: a live tool call succeeds

- [ ] Create **TS-MCP-GRANTED** and confirm model readiness is ready, as in
      section 3.
- [ ] Enable the built-in `cloudflare-docs` server on the draft Agent Profile
      (UI: Tools → Cloudflare Docs → Select, or curl):

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/thinkspaces/updateToolSelections" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-MCP-GRANTED>","selections":[{"serverId":"cloudflare-docs","risk":"read_only"}]}'
      ```

- [ ] Activate the draft and grant the requested Permission (UI: Activate
      Thinkspace, or curl with the first requested Permission index):

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/thinkspaces/activateAgentProfile" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-MCP-GRANTED>","grantedPermissionIndexes":[0]}'
      ```

- [ ] `thinkspaces/get` for TS-MCP-GRANTED shows: - `grantedPermissions[]` contains an `mcp_tool_access` row for
      `providerId: "cloudflare-docs"`. - `enabledToolPotencies[]` contains exactly the enabled
      `cloudflare-docs` tool with `potency: "potent"`. - Any unrelated grant rows do **not** create extra enabled tools.
- [ ] Submit a turn that requires the source, for example:

      > Use the Cloudflare Docs external information source to answer: what is
      > one documented capability of Durable Objects? Mention that you used the
      > external source.

- [ ] Inspect progresses to `completed`; the result is visible in the Turn
      status panel and reflects information from Cloudflare docs.
- [ ] Developer observability for the turn shows a real MCP connection/tool
      call for the granted built-in source. Record only product-safe evidence
      (for example, "Cloudflare Docs MCP tool call observed"), not raw request
      headers or credentials.

### 9.2 Enablement without grant: the tool stays inert

- [ ] Create **TS-MCP-INERT** and enable `cloudflare-docs` on the draft as
      above.
- [ ] Activate while declining the request via curl:

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/thinkspaces/activateAgentProfile" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-MCP-INERT>","grantedPermissionIndexes":[]}'
      ```

- [ ] `thinkspaces/get` shows no `cloudflare-docs` grant and
      `enabledToolPotencies[]` reports `cloudflare-docs` as `potency:
"inert"`.
- [ ] Submit the same source-requiring turn. Inspect still reaches a terminal
      state, but developer observability shows **no** MCP connection/tool call
      for `cloudflare-docs`; the product result is model-only or explains that
      the external source is unavailable.

### 9.3 Revocation: the next read and turn are inert with no Profile change

- [ ] On TS-MCP-GRANTED, record the active Agent Profile revision id/version
      from `thinkspaces/get`.
- [ ] Revoke the `cloudflare-docs` Permission (UI: Permissions → Revoke, or
      curl using the grant id from `grantedPermissions[]`):

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/thinkspaces/revokePermission" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-MCP-GRANTED>","permissionId":"<grant-id>"}'
      ```

- [ ] The next `thinkspaces/get` shows the grant removed,
      `enabledToolPotencies[]` reports `cloudflare-docs` as `potency:
"inert"`, and the active Agent Profile revision id/version is unchanged.
- [ ] Submit the same source-requiring turn. Developer observability shows no
      MCP connection/tool call for `cloudflare-docs`; the result is model-only
      or explains the external source is unavailable.

### 9.4 Unreachable server: degraded model-only turn, product-safe surface

This branch is easiest on a local or disposable staging deployment because the
built-in catalog normally points at live public endpoints. Temporarily patch a
staging-only built-in server entry (do not commit the patch) to use an HTTPS
public hostname that will not answer, for example
`https://mcp-smoke-unreachable.invalid/mcp`, while keeping
`authType: "none"` and `riskLevel: "read_only"`. Do **not** use private or
loopback URLs; the URL policy should keep rejecting those.

- [ ] Deploy or run the temporary staging build and create
      **TS-MCP-UNREACHABLE**.
- [ ] Enable and grant the temporary unreachable built-in MCP server.
- [ ] `thinkspaces/get` reports the enabled server as `potency: "potent"`
      before turn preparation (Permission storage is valid even though the
      transport will fail).
- [ ] Submit a source-requiring turn. Inspect reaches `completed` rather than
      `failed`; the result is model-only and product-safe.
- [ ] Product surfaces and recorded findings do not expose raw transport
      details such as stack traces, request headers, or `ECONNREFUSED`; if the
      model mentions the limitation, it should use product-safe language like
      "external information source unavailable".
- [ ] Revert the temporary catalog patch and rerun `bun test
packages/api/src/mcp/url-policy.test.ts packages/api/src/thinkspaces/mcp-runtime-tools.test.ts`.

### 9.5 Result record

Add one row per smoke execution. The issue is not complete until all required
branches above have a passing row against the target deployment.

| Date       | Stage / URL                                   | Commit SHA                                 | Operator    | Granted call | No-grant inert | Revoked inert | Unreachable degradation | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------- | ------------------------------------------ | ----------- | ------------ | -------------- | ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-11 | Not executed in this agent session            | `6f993f80a3bfc658c57ba86ba2df57158dda144d` | pi agent    | Not run      | Not run        | Not run       | Not run                 | Documentation checklist added; live execution still requires a deployed/local stage plus owner BYOK model credential.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-06-11 | Local `alchemy dev` (workerd, localhost:3000) | `e802de7b2b98c981c81b7cf590acf883228187eb` | fable agent | PASS         | PASS           | PASS          | PASS                    | First run at `48b41a5` failed every turn before any model call: turn RPCs hit the Durable Object without PartyServer initialization, so Project Think's session was never created. Fixed in `e802de7` (runtime `setName()` before turn RPCs) and re-run. 9.1: turn completed citing Cloudflare Docs; DO message log shows a `tool-tool_cloudflaredocs_search_cloudflare_documentation` call. 9.2/9.3: turns completed model-only with zero MCP connections and no tool parts; revision id/version unchanged after revocation. The model sometimes _claims_ it used the external source while inert — policy held (no MCP activity), but the wording is a model-quality wrinkle. 9.4: `aws-knowledge` temporarily pointed at `https://mcp-smoke-unreachable.invalid/mcp`; potency read `potent`, turn completed model-only with product-safe "external information source is temporarily unavailable" wording, no transport detail leaked; patch reverted and `url-policy` + `mcp-runtime-tools` tests re-ran green. `model_provider_credential` rows were developer-inserted in local D1 (no product grant flow yet). |

## 10. Built-in reads round-trip: Sources, web, and inspection

Expectation: the built-in read tools (`web_search`, `web_fetch`, `source_read`)
become potent only when the active Agent Profile revision enables them **and**
the Thinkspace owns a grant of the governing Permission kind
(`built_in_web_read` for the web pair, `built_in_source_read` for Source
reading) — enablement alone confers nothing. A granted turn can read the
Thinkspace's uploaded Sources (sealed to the bound Thinkspace) and the public
web (credential-free, GET-only), the Source manifest is injected so the agent
discovers material unprompted, and the Turn status panel's tool activity lists
the reads in product language — Sources by name, searches by query, fetches by
URL — never raw runtime payloads. Revocation makes the next turn inert without
changing the Agent Profile revision.

Reuse the environment setup, model-readiness workaround
(`model_provider_credential` row developer-inserted into local D1, section 9),
and DO-storage observability notes from section 9. Built-in tool calls appear
in the runtime's message log as `tool-web_search`, `tool-web_fetch`, and
`tool-source_read` parts; record only product-safe summaries.

### 10.1 Upload, enable, grant: the tool loop reads a Source and the web

- [ ] Create **TS-READS-GRANTED** and confirm model readiness is ready, as in
      section 3.
- [ ] Upload a small text Source with distinctive content (UI: Sources →
      Upload, or curl):

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/sources/upload" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-READS-GRANTED>","name":"Q2 pricing notes","contentType":"text/markdown","content":"# Q2 pricing notes\nThe internal launch codename is BLUE-HERON."}'
      ```

- [ ] Enable all three built-in tools on the draft Agent Profile (UI: Tools →
      Built-in tools, or curl):

      ```sh
      curl -s -b /tmp/ba-owner.txt "$SERVER/api/openapi/thinkspaces/updateToolSelections" \
        -H 'content-type: application/json' \
        -d '{"thinkspaceId":"<TS-READS-GRANTED>","selections":[],"builtInToolIds":["web_search","web_fetch","source_read"]}'
      ```

- [ ] Activate the draft granting every requested Permission (UI: Activate
      Thinkspace, or curl with all requested indexes).
- [ ] `thinkspaces/get` shows: - `grantedPermissions[]` contains a `built_in_web_read` row
      (`providerId: "web"`) and a `built_in_source_read` row
      (`providerId: "sources"`). - `enabledToolPotencies[]` reports all three built-in tools as
      `potency: "potent"`.
- [ ] Submit a turn that needs both reads, for example:

      > Read my uploaded pricing notes Source and tell me the launch codename
      > it contains, then search the web for one public fact about Cloudflare
      > Durable Objects and cite the page you fetched.

- [ ] Inspect progresses to `completed`; the result reflects the Source
      content (the codename) and the web read.
- [ ] The Turn status panel's **Tool activity** lists the reads in product
      language — the Source by its name (`Read the Source "Q2 pricing
notes".`), the search by its query, the fetch by its URL — with no raw
      tool payloads, bucket names, or transport detail.
- [ ] DO-storage observability shows the corresponding `tool-source_read` /
      `tool-web_search` / `tool-web_fetch` message parts. Record only a
      product-safe summary.

### 10.2 Enablement without grant: the built-ins stay inert

- [ ] Create **TS-READS-INERT**, upload a Source, and enable the three
      built-in tools as above.
- [ ] Activate while declining the requested Permissions
      (`"grantedPermissionIndexes":[]`).
- [ ] `thinkspaces/get` shows no `built_in_web_read` or
      `built_in_source_read` grant and reports the built-in tools as
      `potency: "inert"`.
- [ ] Submit the same reads-requiring turn. Inspect reaches a terminal state;
      the result is model-only or explains the limitation, the Tool activity
      list shows no Source or web reads, and DO-storage observability shows
      no built-in tool parts.

### 10.3 Revocation: the next turn is inert with no Profile change

- [ ] On TS-READS-GRANTED, record the active Agent Profile revision
      id/version, then revoke the `built_in_source_read` grant (UI:
      Permissions → Revoke, or `thinkspaces/revokePermission` with the grant
      id).
- [ ] The next `thinkspaces/get` shows the grant removed, `source_read` as
      `potency: "inert"`, the web pair still `potent`, and the revision
      id/version unchanged.
- [ ] Submit a Source-requiring turn. The result does not contain the Source
      content, Tool activity shows no Source read (web reads may still
      appear), and DO-storage observability shows no `tool-source_read` part
      with Source content.
- [ ] Cross-Thinkspace seal: from TS-READS-INERT (or any other Thinkspace
      with `source_read` granted), submit a turn asking it to read the
      TS-READS-GRANTED Source by its id. The read resolves as not found
      inside the turn; no content crosses Thinkspaces.

### 10.4 Result record

Add one row per smoke execution. The issue is not complete until all required
branches above have a passing row against the target deployment.

| Date       | Stage / URL                        | Commit SHA         | Operator    | Granted reads + inspection | No-grant inert | Revoked inert | Cross-Thinkspace seal | Notes                                                                                                                                                     |
| ---------- | ---------------------------------- | ------------------ | ----------- | -------------------------- | -------------- | ------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-12 | Not executed in this agent session | (issue #89 branch) | fable agent | Not run                    | Not run        | Not run       | Not run               | Documentation checklist added with the inspection-rendering slice; live execution still requires a deployed/local stage plus owner BYOK model credential. |

## 11. Held external mutation round-trip: GitHub issues (issue #115)

Expectation: a Thinkspace Agent can propose a GitHub issue through the held
`create_github_issue` tool, the proposal is parked as a product Approval on both
decision surfaces, and only an owner approval runs the tool's `execute` — the
only place the owner's Connected Account credential is decrypted
(`packages/api/src/thinkspaces/github-issue-creator.ts`, ADR-0009). A rejection
never touches the token; a dead token fails honestly with a reconnect prompt and
never fabricates success (`packages/api/src/connected-accounts/github-issues.ts`,
`GitHubIssueCreationError.needsReconnect`). This is the external-mutation analog
of the safe-reads (§10) and MCP (§9) loops.

Secrets hygiene: the live round trip needs a **fine-grained GitHub PAT** with
`issues: write` on a throwaway repo. Treat it like any credential in the
"Secrets hygiene" section above — paste it only into the Connected Accounts
form, never commit it, and disconnect/rotate it after the run.

Live-round-trip precondition (all four must hold for `github:create_issue` to be
potent): the tool is **enabled** on the active Profile revision ∩ the
`connected_account_credential` Permission is **granted** at activation ∩ a
**GitHub account is connected** ∩ a **tool-call-capable model** is configured
(the default `google:gemini-2.5-flash-lite` may not reliably emit the held
tool). This mirrors the memory-holdpoint precondition (enable ∩ grant ∩ capable
model), plus the connected-account credential.

### 11.1 Connect + equip: enable ∩ grant ∩ connected ∩ capable

- [ ] `/settings/product` → Connected Accounts → paste the PAT → Connect
      (`connectedAccounts.connect`, `packages/api/src/connected-accounts/router.ts`).
      The row reads **"Connected as @&lt;login&gt;"** — the PAT was validated via
      the GitHub `GET /user` and the login stored as `externalAccountId`; an
      invalid token is rejected with no row and no fabricated success.
- [ ] `/thinkspaces/<TS-A>` → Tools → **Create GitHub issue** → Select. The draft
      gains a `source: "connected_account"` enablement for `github:create_issue`
      and a `connected_account_credential` Permission request; the Permissions
      section lists **"Connected Account credential: github"**.
- [ ] Activate the Profile so the request becomes a grant. The Tools row for
      `github:create_issue` then shows **Potent** (enable ∩ grant ∩
      credential-exists, `packages/api/src/thinkspaces/permission-policy.ts`).
      Disconnecting the account, or revoking the grant, returns it to **Inert**.

### 11.2 Inline-in-Sitting: propose → approve → real issue → resume

- [ ] In a Sitting on TS-A, instruct the agent to create an issue in the
      throwaway repo. A **GitHub issue proposal** card renders (repo prominent,
      title, body) badged "Awaiting your decision"; nothing is created yet (the
      `tool-create_github_issue` part is parked in `approval-requested`,
      `apps/web/src/components/sitting-section.tsx`).
- [ ] Approve inline. The card flips to "Approved", the parked turn resumes
      (`addToolApprovalResponse` → DO continuation), and the agent reports the
      created issue number + URL.
- [ ] On GitHub, the issue exists in the repo.

### 11.3 Review Queue: propose → leave → approve from queue → resume

- [ ] Prompt a second proposal and leave it pending. `/review-queue` lists it
      with the "GitHub issue" badge and the repo prominent (`approvals.list`
      carries `proposedContent`, parsed by `parseProposedGitHubIssue`).
- [ ] Approve from the queue (`approvals.decide` → DO `decideApproval`). The
      parked turn resumes in the runtime and the issue is created; the item
      leaves the queue.
- [ ] On GitHub, the second issue exists.

### 11.4 Reject: nothing created, credential never read

- [ ] Prompt a third proposal and reject it (inline or from the queue). On
      GitHub, no issue is created. Because the held tool's `execute` never runs
      on a rejection, the owner's PAT is never decrypted (the store-backed
      creator reads nothing until `create()`).

### 11.5 Dead token: honest failure + reconnect, no fabricated success

- [ ] Revoke the PAT on GitHub (or reconnect a revoked one), keeping the tool
      enabled and granted. Propose and approve an issue. The agent reports an
      honest failure with a reconnect prompt (`GitHubIssueCreationError` with
      `needsReconnect` on a 401/403, surfaced via `toExternalMutationToolFailure`)
      and never claims the issue was created. On GitHub, no issue exists.
- [ ] Reconnect a valid PAT and confirm §11.2 succeeds again.

### 11.6 Non-owner: the Connected Account and Approval surfaces are sealed

- [ ] As the intruder user, the owner's Connected Account, TS-A's equip surface,
      and the owner's pending Approvals are invisible: `approvals.list` returns
      `[]`, and `approvals.decide` / `connectedAccounts.disconnect` against the
      owner's resources return NOT_FOUND (owner-gated null → 404,
      `decideOwnedThinkspaceApproval`), never existence disclosure.

### 11.7 Result record

Add one row per smoke execution. The issue is not complete until every branch
above has a passing row against the target deployment.

| Date       | Stage / URL                                        | Commit SHA | Operator | Inline approve (11.2) | Queue approve (11.3) | Reject (11.4) | Dead token (11.5) | Non-owner seal (11.6) | Notes                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------- | ---------- | -------- | --------------------- | -------------------- | ------------- | ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-19 | Local `bun run dev` (workerd, localhost:3001/3000) | `5858998`  | owner    | PASS                  | PASS                 | PASS          | PASS              | PASS                  | Owner-run live verification on the #114 merge. Inline approve created a real issue and resumed the turn; queue approve resumed the parked turn and created the issue; reject created nothing and never read the credential; revoked token surfaced an honest failure + reconnect prompt with no fabricated success; non-owner saw none of the Connected Account / Approval surfaces. |

## 12. Curator-led creation round-trip (issue #129/#130)

Expectation: minting a Thinkspace is a live conversation with the `CuratorAgent`,
not a form. New Thinkspace starts a curation draft (`thinkspaces.startCuration`)
and routes to the creation surface
(`apps/web/src/routes/thinkspaces.create.$draftThinkspaceId.tsx`), which places
the streamed Curator chat beside the live agent card. The Curator's propose-only
tools (`set_goal` / `set_configuration_summary` / `set_instructions` /
`set_model` / `enable_tool`, `packages/api/src/thinkspaces/curator-runtime-tools.ts`)
mold the bound draft; after each tool the DO re-projects the card into Think
synced state (`apps/server/src/agents/curator-agent.ts` `afterToolCall` →
`projectCard` → `setState`, derived by the pure
`packages/api/src/thinkspaces/curator-card.ts` builder). The owner grants a
subset of the requested Permissions and activates in-surface
(`activateAgentProfile({ grantedPermissionIndexes })`), which flips DRAFT →
ACTIVE with exactly the granted Permissions. "Proposes, never grants" is
structural: the toolset has no activate and no grant tool. This is the creation
analog of the Sitting loop (§"Sittings") on the parallel Curator runtime
(ADR-0010).

Live-round-trip precondition: a **model provider credential is connected**
(`/settings/product`) so `models.getCuratorReadiness` is `ready` and the Curator
resolves its ungated product-credential model (#124); plus a **tool-call-capable
Curator model** (the default `google:gemini-2.5-flash-lite` may not reliably
emit the `set_*`/`enable_tool` calls — set a capable model via Settings →
Product → **Curator model** if the card never updates). The card-display gate
(`card.ready`) is non-empty Goal ∩ a `model_provider_credential` request on the
draft; whether that credential actually resolves is the separate activation-time
gate.

### 12.1 Happy path: describe → live shaping → push-back → grant subset → activate

- [x] Thinkspaces → **New Thinkspace** → `startCuration` mints an empty-Goal draft
      and routes to `/thinkspaces/create/<draftId>` (chat left, agent card right).
- [x] Describe an intent in the composer. The Curator **sharpens a bounded Goal**
      and proposes a tool-equipped Agent Profile; the **agent card updates per
      tool call** — display name, Goal, instructions, model (+ provenance),
      enabled tools (badged), and requested Permissions populate live as the DO
      re-projects synced state after each `set_*`/`enable_tool` write.
- [x] **Push back at least once** (narrow the Goal, change the model, drop a
      tool). The card changes in response on the next tool call — the live
      synced-state projection (#128) converges in the browser, not just the seed.
- [x] The card badge flips to **"Ready to activate"** once the Goal and the
      `model_provider_credential` request are present.
- [x] In the Activate step, **toggle OFF at least one** requested Permission, then
      **Activate Thinkspace**. The grant set is read from a fresh re-read of the
      draft (`thinkspaces.get` at click time) and mapped to
      `grantedPermissionIndexes` by stable Permission key, so the withheld
      Permission is the one actually dropped — no index drift from the lagging
      projection.
- [x] The surface routes to `/thinkspaces/<id>`; the Thinkspace is **ACTIVE** with
      its first Agent Profile revision and **exactly the granted Permissions**
      (the toggled-off Permission is absent from the granted list).

### 12.2 Connected-account display: connected vs not-connected, warn-not-block

- [x] Have the Curator `enable_tool` a connected-account tool
      (`github:create_issue`) **while GitHub is disconnected**. The card's
      Connected Accounts row reads **"Not connected — the tool stays inert…"** and
      the Activate step shows the **warning** (TriangleAlert + Connect link).
- [x] Activation is **not blocked** by the unconnected account: Activate succeeds,
      and on the active Thinkspace the connected-account tool is **Inert** (the
      potency rule — enable ∩ grant ∩ connected, `permission-policy.ts`).
- [x] (Optional) connect GitHub, re-open the draft → the row flips to **"Connected
      as @&lt;login&gt;"** (`buildCuratorCardProjection` reads the live
      `listConnectedAccounts` rows on the next projection).

### 12.3 No-credential gate: connect-first, no form

- [x] As a user with **no provider credential**, click **New Thinkspace** /
      **Create Thinkspace**. A **connect-first gate** ("Connect a model provider
      first") renders with the readiness message and a link to `/settings/product`
      — **no 3-field form**, and **no draft is created** (`startCuration` is not
      called until readiness is `ready`).
- [x] Dismiss works; after connecting a credential, New Thinkspace proceeds into
      the creation surface.

### 12.4 Abandoned draft: empty-Goal draft preserved + hidden + resumable

- [x] Start curation and leave before the Curator sets a Goal, then return to
      `/thinkspaces`. The empty-Goal draft is **hidden** from the list
      (`listThinkspaces` SQL exclusion `or(status != 'draft', goal != '')`).
- [x] Reloading `/thinkspaces/create/<draftId>` **resumes the same draft** (the DO
      and D1 row persist; the card re-seeds from `thinkspaces.get` and the DO's
      persisted projection) — no duplicate draft is minted.
- [x] If the Curator did set a Goal before you left, that draft **reappears** in
      the list as a Draft — expected, since the list hides only empty-Goal drafts.

### 12.5 Result record

Add one row per smoke execution. The issue is not complete until every branch
above has a passing row against the target deployment.

| Date       | Stage / URL                                        | Commit SHA | Operator | Happy path (12.1) | Connected-account (12.2) | No-credential gate (12.3) | Abandoned draft (12.4) | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------- | ---------- | -------- | ----------------- | ------------------------ | ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-22 | Local `bun run dev` (workerd, localhost:3001/3000) | `d5bc8c7`  | owner    | PASS              | PASS                     | PASS                      | PASS                   | Owner-run live verification on the #129 merge, closing curator_creation_v1. New Thinkspace opened the creation surface; the agent card converged per tool call as the Curator shaped the Goal/instructions/model/tools and re-converged after a push-back (the first real-browser eyeball of the #128 synced-state projection); granting a subset activated with exactly those Permissions; the unconnected GitHub tool warned but did not block and stayed inert; a credential-less user hit the connect-first gate with no form; an abandoned empty-Goal draft stayed hidden and resumed by id. |

## Appendix: temporary local DO probe (optional deep checks)

The two optional deep checks exercise the DO boundary directly, which no
product route allows (by design). Add this **temporary, local-only** route to
`apps/server/src/index.ts` above `app.onError(errorHandler)` while smoking,
then revert it:

```ts
// TEMPORARY smoke probe - do not commit (worker-routes.test.ts rejects it)
app.get("/smoke/do-probe/:thinkspaceId", async (c) => {
	const ns = (c.env as CloudflareEnv).THINKSPACE_AGENT;
	const stub = ns.get(ns.idFromName(c.req.param("thinkspaceId")));
	const direct = await stub.fetch("https://do/get-messages");
	let rpcMismatch = "not-attempted";
	const mismatchId = c.req.query("mismatchId");
	if (mismatchId) {
		try {
			await (
				stub as unknown as {
					acceptTurnSubmission: (r: object) => Promise<unknown>;
				}
			).acceptTurnSubmission({
				idempotencyKey: "smoke-probe",
				instruction: "probe",
				ownerUserId: "smoke-probe",
				thinkspaceId: mismatchId,
			});
			rpcMismatch = "UNEXPECTEDLY ACCEPTED";
		} catch (error) {
			rpcMismatch = `rejected: ${error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)}`;
		}
	}
	return c.json({
		directFetchBody: await direct.text(),
		directFetchStatus: direct.status,
		rpcMismatch,
	});
});
```

Usage (owner cookie not needed; this bypasses the product gate on purpose,
which is exactly why it must never ship):

```sh
# Check 5 deep: expect directFetchStatus 404, never a JSON message list
curl -s "$SERVER/smoke/do-probe/<TS-A>"
# Check 6 deep: expect rpcMismatch "rejected: Error: thinkspace-turn-product-safe:..."
curl -s "$SERVER/smoke/do-probe/<TS-A>?mismatchId=<TS-B>"
```

Safety net: `bun test apps/server/src/worker-routes.test.ts` fails while the
probe is present (`worker-routes.test.ts:28-41` pins the exact mounted route
list), so the suite blocks an accidental commit. Revert with
`git checkout -- apps/server/src/index.ts` when done.

## Sittings (issue #80)

A Sitting is the live owner↔Thinkspace Agent session. Browser traffic reaches a
runtime only through one authenticated worker route, `GET /api/sittings/:thinkspaceId`
(`apps/server/src/index.ts`), which verifies the Better Auth session and
Thinkspace ownership, strips any client-supplied forward header, stamps its own
`(owner, Thinkspace)` context, and forwards to the runtime by Thinkspace id. The
runtime's `fetch` override (`apps/server/src/agents/thinkspace-agent.ts`) admits a
request only when that stamped context matches the bound turn context, then hands
off to Project Think's WebSocket chat protocol. Governance is unchanged: every
Sitting turn runs the same `beforeTurn` assembly and `beforeToolCall` recheck as a
submitted turn. Node tests cover the route shape, forward-context contract, and
fail-closed default (`apps/server/src/worker-routes.test.ts`,
`packages/api/src/thinkspaces/sittings.test.ts`); only workerd + a browser can
prove streaming, resumption, recovery, and multi-tab broadcast.

Prereqs: an **active** Thinkspace (TS-A) owned by the owner cookie, with a ready
model credential (reuse the Thinkspace from the runtime checks above). Open the
web UI at `/thinkspaces/<TS-A>` and scroll to the **Sitting** section.

1. **Open and stream.** Send a message in the Sitting composer. Expect a
   token-by-token streamed reply (not a single block) and, when the model
   provides it, an italic reasoning block above the answer. The transcript opens
   onto any prior turns (including turns submitted while away).
2. **Stream resumption (client reconnect).** While a reply is streaming, refresh
   the page. Expect the in-flight reply to replay and continue to completion — no
   lost tokens, no frozen UI. (Driven by `resume: true` in `useAgentChat`.)
3. **Cancel.** Start a long reply, click **Stop** mid-stream. Expect the stream
   to halt promptly; the partial turn remains in the transcript on the next load.
4. **Close-tab durability.** Send a message, then close the tab before it
   completes. Reopen `/thinkspaces/<TS-A>`; expect the completed turn present in
   the transcript.
5. **Recovering indicator.** While a turn is in flight, redeploy/restart the API
   Worker (or trigger a DO eviction). Expect a "Recovering the agent's turn…"
   badge (the `isRecovering` / `CF_AGENT_CHAT_RECOVERING` path) rather than a
   silent freeze, then continuation.
6. **Multi-tab broadcast.** Open `/thinkspaces/<TS-A>` in two tabs. Send from one;
   expect the same live stream to appear in both.
7. **Governance parity.** In the same Sitting, exercise a tool the Thinkspace has
   enabled-and-granted (e.g. web reading) and confirm it works; revoke its
   Permission, then in a new Sitting turn confirm the tool is inert (blocked) —
   identical to the submitted-turn behavior verified in the Permission checks
   above. Tool activity should reflect only the enabled ∩ potent set.

Negative checks (ownership is the only signal — every failure is a 404):

```sh
# Unauthenticated upgrade attempt → 404 (no existence disclosure)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' \
  "$SERVER/api/sittings/<TS-A>"            # expect 404

# Authenticated NON-owner (intruder cookie) on the owner's Thinkspace → 404
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ba-intruder.txt \
  -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' \
  "$SERVER/api/sittings/<TS-A>"            # expect 404, same as a missing Thinkspace

# Guessed/unknown Thinkspace id with owner cookie → 404
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ba-owner.txt \
  "$SERVER/api/sittings/thinkspace_does_not_exist"   # expect 404
```

Expected: all three return `404`. The authenticated-owner upgrade (exercised via
the browser in checks 1–6) is the only path that reaches the runtime.

If checks 1–6 fail at the connection itself (handshake never completes), the
likely cause is the worker→DO forward not routing inside Project Think's chat
protocol. Verify the worker forwards the upgrade request unmodified except for
the stamped forward header, and that the runtime override calls
`super.fetch(request)` after the context match. The `agents` `getAgentByName`
helper is the SDK's documented path for `basePath` manual routing; the client
sets `basePath: api/sittings/<id>` so the connection URL matches the route.

## Recording results

Record pass/fail per section in the issue or PR that motivated the smoke run,
with the stage, date, and commit SHA. Quote product-safe messages freely;
never paste cookies, env values, or D1 rows containing credential material.

## Source references

- Repo: `apps/server/src/agents/thinkspace-agent.ts`,
  `packages/api/src/thinkspaces/{runtime,turns,inspect,turn-context,runtime-policy}.ts`,
  `packages/api/src/models/{readiness,catalog}.ts`,
  `packages/infra/alchemy.run.ts`, `apps/server/src/worker-routes.test.ts`.
- Project Think `@cloudflare/think@0.8.8` (clone
  `~/Developer/clones/github.com/cloudflare/agents`, tag
  `@cloudflare/think@0.8.8`): `packages/think/src/think.ts:5776-5870`
  (submitMessages + idempotency dedupe), `:5872-5921` (drain scheduling),
  `:5923-6028` (pending→running→terminal), `:6635,6699-6714` (`onRequest`
  wrapper serving `/get-messages`).
- Agents SDK `agents@0.15.0` (same clone, tag `agents@0.15.0`):
  `packages/agents/src/index.ts:6119` (DO `fetch` entry),
  `:11061-11071` (`routeAgentRequest` default `/agents` prefix).
- workerd (clone `~/Developer/clones/github.com/cloudflare/workerd`,
  `79c79c87c`): `src/workerd/jsg/util.c++:195-211` (only standard error types
  tunnel across RPC; custom subclasses arrive as plain `Error`).
