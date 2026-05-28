# Better Auth study for Better Chat → Better Agent auth salvage

## Dependency/version posture

- Latest Better Auth source inspected is **1.6.11** (`better-auth/better-auth` `packages/better-auth/package.json:1-3`, via replicant). Better Agent already pins catalog `better-auth: "1.6.11"` (`better-agent/package.json:9-19`); Better Chat server/web use `1.4.5` (`better-chat/apps/server/package.json:20-33`, `better-chat/apps/web/package.json:18-30`).
- Treat salvage as a **1.4.5 → 1.6.11 port**, not a file copy. The specific Better Chat APIs still exist in 1.6.11: `emailOTP` is exported from `better-auth/plugins` and `emailOTPClient` from `better-auth/client/plugins` (`dist/plugins/index.d.mts:19,65`; `dist/client/plugins/index.d.mts:40,56` in Better Agent's installed package). The client calls used by Better Chat map to current endpoints: `authClient.emailOtp.sendVerificationOtp` → `/email-otp/send-verification-otp`, and `authClient.signIn.emailOtp` → `/sign-in/email-otp` (`dist/plugins/email-otp/routes.mjs:60-73,365-378`).

## Current best-practice/API shape from Better Auth latest

- Server initializer: `betterAuth(options)` returns an `Auth` object with `handler(request)`, `api`, `options`, `$context`, `$Infer`, and `$ERROR_CODES` (`dist/types/auth.d.mts:8-26`; source equivalent `packages/better-auth/src/types/auth.ts:8-20`).
- Hono/Workers routing: mount only `GET`/`POST` and pass the raw Web `Request` to `auth.handler`. Better Auth's current Cloudflare smoke fixture creates auth from D1 + Drizzle, mounts `auth.handler` on `/api/auth/*`, and calls `auth.api.getSession({ headers })` server-side (`e2e/smoke/test/fixtures/cloudflare/src/index.ts:8-23,27-45`, via replicant). Better Agent already follows this pattern at `apps/server/src/index.ts:34` and `packages/api/src/context.ts:8-11`.
- Drizzle/D1 adapter: use `drizzleAdapter(db, { provider: "sqlite", schema })`. The Drizzle adapter config accepts `provider: "pg" | "mysql" | "sqlite"` and optional `schema` (`@better-auth/drizzle-adapter/dist/index.d.mts:8-17,45`). The Better Auth Cloudflare fixture uses `drizzle-orm/d1` with `drizzle(env.DB, { schema })` and `provider: "sqlite"` (`e2e/smoke/test/fixtures/cloudflare/src/db.ts:1-4`, `src/index.ts:13-15`, via replicant). Better Agent already has `createDb = () => drizzle(env.DB, { schema })` (`packages/db/src/index.ts:1-6`) and passes auth schema into `drizzleAdapter` (`packages/auth/src/index.ts:18-22`).
- Base URL/path: Better Auth handler defaults `basePath` to `/api/auth` if unset (`dist/auth/base.mjs:11-14`), but docs recommend explicit `baseURL`/`BETTER_AUTH_URL` for security/stability and allow explicit/dynamic `trustedOrigins` (`docs/content/docs/reference/options.mdx:19-144`, via replicant). Better Chat explicitly uses `basePath: "/api/auth"` server/client (`apps/server/src/lib/auth.ts:17-20`, `apps/web/src/lib/auth-client.ts:4-7`); Better Agent currently relies on the default client/server path (`packages/auth/src/index.ts:18`, `apps/web/src/lib/auth-client.ts:4-6`).
- Email OTP plugin: `EmailOTPOptions.sendVerificationOTP` is required and receives `{ email, otp, type }`; Better Auth recommends not awaiting sending in serverless paths when possible, using `waitUntil` or equivalent (`dist/plugins/email-otp/types.d.mts:4-15`). Defaults: OTP length 6, expiry 300 seconds, allowed attempts 3, resend strategy `rotate`, and plugin-specific rate limits exist (`dist/plugins/email-otp/types.d.mts:17-27,49-76,96-107`; `dist/plugins/email-otp/index.d.mts:505-541`).
- Client shape: React `createAuthClient` exposes plugin actions, `useSession`, `$Infer.Session`, and `$fetch` (`dist/client/react/index.d.mts:16-54`). Better Chat's web client correctly adds `emailOTPClient()` for the OTP methods (`apps/web/src/lib/auth-client.ts:1-7`); Better Agent's client currently does not (`apps/web/src/lib/auth-client.ts:1-6`).

## Recommended port shape inside Better Agent

1. **Keep Better Agent's auth package boundary.** Extend `@better-agent/auth` instead of moving Better Chat's singleton `auth` wholesale. Better Agent's `createAuth()` already centralizes DB/env imports (`packages/auth/src/index.ts:1-10`) and is used by the server route/context (`apps/server/src/index.ts:34`, `packages/api/src/context.ts:8-11`).
2. **Add only the product-selected sign-in methods.** If the PRD wants Better Chat's passwordless/social sign-in, add:
   - `plugins: [emailOTP({ sendVerificationOTP, ... })]` from Better Chat's `apps/server/src/lib/auth.ts:31-50`.
   - `socialProviders.google` and/or `socialProviders.github` from `apps/server/src/lib/auth.ts:21-29`.
   - Web `emailOTPClient()` and the Better Chat sign-in form flows (`apps/web/src/lib/auth-client.ts:1-7`, `apps/web/src/routes/auth/-components/sign-in-form.tsx:39-81`).
3. **Make path/base explicit.** Set `basePath: "/api/auth"` on server and client even though Better Auth defaults to it, so the route (`apps/server/src/index.ts:34`) and client are unambiguous.
4. **Prefer Better Agent's current 1.6 schema/migrations.** Do not copy Better Chat's older timestamp schema. Better Agent already uses `timestamp_ms`, defaults for `created_at`/`updated_at`, and core tables `user`, `session`, `account`, `verification` (`packages/db/src/schema/auth.ts:4-86`). Better Chat's schema uses `timestamp` mode and fewer defaults (`apps/server/src/db/d1/schema/auth.ts:3-73`). If enabling new Better Auth plugins beyond email OTP/social, regenerate/verify schema because plugin tables can be required; the Better Auth Cloudflare fixture adds plugin tables when `jwt()`/`sso()` are enabled (`e2e/smoke/test/fixtures/cloudflare/src/auth-schema.ts:4-113`, via replicant).
5. **Consider request-scoped reuse.** Better Agent currently calls `createAuth()` in both route handling and context creation (`apps/server/src/index.ts:34`, `packages/api/src/context.ts:8-11`). This is functionally aligned with Better Auth but can initialize twice on API requests. PRD can accept this initially or require a Hono middleware/variable pattern like the Better Auth Cloudflare fixture to create once per request.

## Env/binding requirements

Already present in Better Agent Alchemy common bindings:
- `DB`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN` (`packages/infra/alchemy.run.ts:23-28`). Runtime access is through `cloudflare:workers` in `@better-agent/env/server` (`packages/env/src/server.ts:1-7`).

Needed only if porting Better Chat features:
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Better Chat source: `apps/server/src/lib/auth.ts:21-25`).
- GitHub OAuth: `GH_CLIENT_ID`, `GH_CLIENT_SECRET` (`apps/server/src/lib/auth.ts:26-29`).
- Email OTP via Resend: add `resend` dependency to the Better Agent auth/server package as appropriate; bind `RESEND_API_KEY`; define sender constants/templates or replace with Better Agent mail abstraction (`apps/server/src/lib/auth.ts:6,39-47`).
- Dev/stage switch: if preserving Better Chat's dev OTP logging, bind/use `ALCHEMY_STAGE` or a Better Agent equivalent (`apps/server/src/lib/auth.ts:34-38`).
- Optional KV-backed cache/rate-limit: Better Chat requires `SESSION_KV` and configures `secondaryStorage`, cookie cache, and rate limit storage (`apps/server/src/lib/auth.ts:52-76`). Better Agent Alchemy currently has no KV binding in common bindings (`packages/infra/alchemy.run.ts:23-32`), so this is not copy-safe.
- Web callback/origin: Better Chat constructs social callback URLs using `VITE_WEB_URL` or `window.location.origin` (`apps/web/src/routes/auth/-components/sign-in-form.tsx:73-80`). Better Agent currently exposes only `VITE_SERVER_URL` to web (`packages/infra/alchemy.run.ts:34-38`, `packages/env/src/web.ts:8-14`), so social callback support needs a web-origin env or a deliberate `window.location.origin` policy.

## What NOT to port blindly

- **Do not downgrade versions** or carry Better Chat's `better-auth@1.4.5`; Better Agent is already on current 1.6.11.
- **Do not copy Better Chat's schema/migrations** over Better Agent's schema. Reconcile with Better Auth 1.6.11 and generate migrations from Better Agent's `packages/db/src/schema/auth.ts`.
- **Do not copy `secondaryStorage`/`rateLimit.storage = "secondary-storage"`** unless the PRD also adds a Cloudflare KV binding and acceptance tests for it; otherwise runtime auth will reference missing `env.SESSION_KV`.
- **Do not copy email delivery as a hard dependency** if the MVP only needs email/password. Better Agent already has email/password enabled (`packages/auth/src/index.ts:23-25`) and web email/password forms; Better Chat's OTP flow is an intentional product change.
- **Do not rely on implicit origins.** Cookies are set `sameSite: "none", secure: true, httpOnly: true` in both repos (`packages/auth/src/index.ts:11-17`, `apps/server/src/lib/auth.ts:77-83`); this only works cross-origin when CORS credentials, `trustedOrigins`, `BETTER_AUTH_URL`, and web/server URLs line up.

## Validation / acceptance criteria

- Package alignment: Better Agent remains on `better-auth@1.6.11`; server and web compile against the same catalog version.
- Route contract: `GET`/`POST /api/auth/*` continue to be handled by `auth.handler(c.req.raw)` and `auth.api.getSession({ headers })` works for RPC/API context.
- Schema/migrations: D1 migrations create the Better Auth core tables (`user`, `session`, `account`, `verification`) with Better Agent's current schema; any enabled plugin that adds tables is reflected in schema/migrations before deploy.
- Base/cookie/CORS: with configured `BETTER_AUTH_URL`, `CORS_ORIGIN`, and `VITE_SERVER_URL`, browser auth requests include credentials and create/read session cookies across the deployed web/server origins.
- If email OTP is in scope: web client includes `emailOTPClient()`, send-OTP and sign-in-OTP flows work (`authClient.emailOtp.sendVerificationOtp`, `authClient.signIn.emailOtp`), dev mode does not send real email if that policy is retained, production sends via configured provider, invalid/expired OTP errors surface, and rate-limit behavior is tested.
- If social OAuth is in scope: Google/GitHub secrets are bound, callback URLs match provider configuration, `authClient.signIn.social({ provider, callbackURL })` redirects and returns to the requested path, and accounts are persisted in the `account` table.
- Negative checks: missing required auth env fails deploy/start through Alchemy `requiredEnv` where applicable (`packages/infra/alchemy.run.ts:9-15,23-32`); no runtime references to unbound `SESSION_KV`, provider secrets, or `RESEND_API_KEY` remain when corresponding features are disabled.

## Source citations

- Better Auth latest source/docs inspected via replicant: `packages/better-auth/package.json:1-3`; `e2e/smoke/test/fixtures/cloudflare/src/index.ts:8-45`; `e2e/smoke/test/fixtures/cloudflare/src/db.ts:1-4`; `e2e/smoke/test/fixtures/cloudflare/wrangler.json:1-17`; `docs/content/docs/installation.mdx:20-124`; `docs/content/docs/adapters/drizzle.mdx:18-57`; `docs/content/docs/reference/options.mdx:19-144`; `packages/better-auth/src/types/auth.ts:8-20`; `packages/better-auth/src/auth/base.ts:14-78`.
- Better Auth 1.6.11 installed package evidence in Better Agent: `dist/types/auth.d.mts:8-26`; `dist/auth/base.mjs:11-30`; `@better-auth/drizzle-adapter/dist/index.d.mts:8-17,45`; `dist/plugins/email-otp/types.d.mts:4-107`; `dist/plugins/email-otp/routes.mjs:60-73,365-378`; `dist/client/react/index.d.mts:16-54`.
- Better Agent local seams: `packages/auth/src/index.ts:1-29`; `packages/db/src/schema/auth.ts:4-86`; `packages/db/src/index.ts:1-6`; `packages/env/src/server.ts:1-7`; `packages/infra/alchemy.run.ts:17-50`; `apps/server/src/index.ts:23-35`; `packages/api/src/context.ts:8-15`; `apps/web/src/lib/auth-client.ts:1-6`.
- Better Chat salvage sources: `apps/server/src/lib/auth.ts:12-84`; `apps/server/src/db/d1/schema/auth.ts:3-73`; `apps/server/src/index.ts:13-30`; `apps/web/src/lib/auth-client.ts:1-7`; `apps/web/src/routes/auth/-components/sign-in-form.tsx:39-81`.
