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

- Never paste values of `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
  `OPENAI_API_KEY`, `API_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, or
  `ALCHEMY_STATE_TOKEN` into issues, PRs, logs, or this file. Refer to them by
  name only.
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
2. `bun install`, then `bun run db:migrate:local` for a fresh local D1.
3. `bun run dev` — runs `alchemy dev` (local workerd via miniflare) plus local
   Drizzle studio. Note the printed `Web ->` and `Server ->` URLs; the API
   Worker serves on port 3000 (`packages/infra/alchemy.run.ts:103-105`).
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

- [ ] The model readiness panel for TS-A shows ready with the app-provided
      default `google:gemini-2.5-flash-lite`
      (`packages/api/src/models/catalog.ts:23`).
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
      `google:gemini-2.5-pro` (a `byok` catalog entry,
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
- [ ] Restore `default_model` to `NULL` (falls back to the app-provided
      default) and confirm a turn completes again.
- [ ] Deployed-stage variant (optional, destructive to the stage): unset the
      app `GOOGLE_GENERATIVE_AI_API_KEY` binding in a scratch stage and confirm
      readiness reports the app-credential message rather than a provider
      error. Never do this by editing committed env files.

## 8. No-tools safety policy

Expectation: the first slice is model-only. Workspace Bash, workspace
mutations, MCP tools, Connected Account tools, external mutations, Memory
writes, and Artifact publishing are all unavailable
(`packages/api/src/thinkspaces/runtime-policy.ts:68-93`; wired in
`apps/server/src/agents/thinkspace-agent.ts:54-60,147-149,151-166`).

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
