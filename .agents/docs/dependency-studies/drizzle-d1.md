# Drizzle ORM / D1 / SQLite dependency study for Better Agent salvage

Date: 2026-05-27

> **Status update (2026-06-18):** The local migration workflow has since been
> settled — **Alchemy owns local D1 and applies the `migrationsDir` migrations
> to the miniflare database** (`packages/infra/alchemy.run.ts`), and **Drizzle
> Studio is a read-only viewer** (`db:studio:local`, launched alongside
> `alchemy dev` via the turbo `dev` task). The local drizzle-kit writers
> (`db:migrate:local`, `db:push:local`, and the `db:push` alias) were removed;
> `packages/db` now exposes `db:generate` plus the remote writers
> `db:migrate:remote` / `db:push:remote` and `db:studio:local` /
> `db:studio:remote`. Passages below that present `db:push` or a local
> drizzle-kit migrate as the current state are superseded by this note.

## Executive summary

- Keep Drizzle, but treat **Better Agent `packages/db` as the new source of truth** and port only selected Better Chat D1 infrastructure. The current Better Agent package already has the right seam (`@better-agent/db`) and initializes D1 with schema metadata (`createDb = drizzle(env.DB, { schema })`) so relational queries can work later [better-agent/packages/db/src/index.ts:1-6](../../better-agent/packages/db/src/index.ts).
- Align versions before schema work: local repos use `drizzle-orm@^0.45.1` and `drizzle-kit@^0.31.8` [better-agent/packages/db/package.json:20-27](../../better-agent/packages/db/package.json), while npm latest is `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10` as of this study. This is probably a patch bump, but run migration generation before/after the bump and review SQL diff.
- Use **Drizzle Kit generated migrations**, not production `push`, for D1. At study time Better Agent exposed only `db:push` and `db:generate` [better-agent/packages/db/package.json:12-15](../../better-agent/packages/db/package.json); a deliberate migration workflow was needed before touching shared D1. This has since been adopted — local D1 is migrated by Alchemy and the local `push` scripts were removed (see the status update above).
- Better Agent's `drizzle.config.ts` is incomplete for current Kit `d1-http`: it sets `driver: "d1-http"` but no `dbCredentials` [better-agent/packages/db/drizzle.config.ts:8-13](../../better-agent/packages/db/drizzle.config.ts). Drizzle Kit source validates non-empty `accountId`, `databaseId`, and `token` for `d1-http` (`drizzle-kit/src/cli/validations/sqlite.ts:11-17,27-32`).
- Prefer one timestamp convention across D1 schemas: **`integer(..., { mode: "timestamp_ms" })` plus explicit SQL defaults in milliseconds**. Better Agent already mostly does this for auth [better-agent/packages/db/src/schema/auth.ts:4-16](../../better-agent/packages/db/src/schema/auth.ts), but several `updatedAt` columns are `notNull()` with only runtime `$onUpdate`, meaning generated SQL has no DB default.
- Do **not** port Better Chat's per-user conversation Durable Object schema. It is explicitly chat-shaped (`conversations`, `messages`) [apps/server/src/db/do/schema/chat.ts:3-29](../apps/server/src/db/do/schema/chat.ts) and the salvage map marks it as non-salvageable [docs/salvage-map-better-chat.md:93-101](../docs/salvage-map-better-chat.md). Future DO SQLite should be per-Thinkspace Agent, not per user.

## Drizzle source/docs findings

### D1 runtime API

- `drizzle-orm/d1` re-exports driver/session only; the D1 migrator is a separate import path, `drizzle-orm/d1/migrator` (`drizzle-orm/src/d1/index.ts:1-2`, `drizzle-orm/src/d1/migrator.ts:1-9`).
- `drizzle(client, config?)` accepts a Cloudflare/Miniflare D1 client, builds an async SQLite dialect/session, and extracts relational schema only when `config.schema` is passed (`drizzle-orm/src/d1/driver.ts:33-72`). Better Chat and Better Agent both pass `{ schema }` [apps/server/src/db/d1/index.ts:1-8](../apps/server/src/db/d1/index.ts), [better-agent/packages/db/src/index.ts:1-6](../../better-agent/packages/db/src/index.ts).
- D1 transactions in Drizzle are SQL `begin` / `commit` / `rollback`, with savepoints for nested transactions (`drizzle-orm/src/d1/session.ts:107-145`). Keep product lifecycle operations compact and avoid pretending this is a global distributed transaction boundary with DO/R2.

### Drizzle Kit D1 migrations

- Current Kit config type for D1 HTTP is `dialect: "sqlite"`, `driver: "d1-http"`, and `dbCredentials: { accountId, databaseId, token }` (`drizzle-kit/src/index.ts:198-207`). Runtime validation rejects missing credential fields (`drizzle-kit/src/cli/validations/sqlite.ts:11-17,27-32`).
- Kit's D1 HTTP connection uses Cloudflare's D1 REST API through the sqlite-proxy driver, posting to `/accounts/{accountId}/d1/database/{databaseId}/{raw|query}` with a bearer token (`drizzle-kit/src/cli/connections.ts:1009-1058`).
- Programmatic D1 migration exists and records to `__drizzle_migrations` (`drizzle-orm/src/d1/migrator.ts:10-47`), but the safer product workflow here is still: generate reviewed SQL, apply to dev/staging/prod deliberately.

### Durable Object SQLite

- `drizzle-orm/durable-sqlite` re-exports driver/session; migrator is separate (`drizzle-orm/src/durable-sqlite/index.ts:1-2`).
- The DO driver wraps `DurableObjectStorage`, uses sync SQLite APIs, and supports schema relations only when `{ schema }` is passed (`drizzle-orm/src/durable-sqlite/driver.ts:24-61`). Better Chat follows that pattern [apps/server/src/db/do/user-durable-object.ts:27](../apps/server/src/db/do/user-durable-object.ts).
- The durable-sqlite migrator expects a **bundled in-memory migration object** with `journal` and `migrations`, not filesystem reads (`drizzle-orm/src/durable-sqlite/migrator.ts:1-36`). It applies migrations inside a transaction and records them in `__drizzle_migrations` (`drizzle-orm/src/durable-sqlite/migrator.ts:38-78`).
- Drizzle Kit source explicitly rejects `migrate`, `studio`, `pull`, and `push` for `durable-sqlite`; use `generate` plus programmatic migration inside the Durable Object (`drizzle-kit/src/cli/validations/sqlite.ts:75-94`, `drizzle-kit/src/cli/commands/utils.ts:205-216`). Better Chat's `do:generate` script matches that model [apps/server/package.json:14-18](../apps/server/package.json).

### SQLite timestamps, defaults, indexes, relations

- SQLite `integer()` supports modes `number`, `timestamp`, `timestamp_ms`, and `boolean` (`drizzle-orm/src/sqlite-core/columns/integer.ts:199-236`).
- `timestamp` stores seconds: Drizzle maps from DB with `new Date(value * 1000)` and to DB with `Math.floor(ms / 1000)`. `timestamp_ms` stores milliseconds directly (`drizzle-orm/src/sqlite-core/columns/integer.ts:137-158`).
- SQLite timestamp `defaultNow()` is deprecated; source says use `.default()` with an explicit expression instead (`drizzle-orm/src/sqlite-core/columns/integer.ts:120-126`).
- `.default(value)` affects generated SQL; `$defaultFn` / `$onUpdateFn` are runtime-only and do **not** affect Drizzle Kit output (`drizzle-orm/src/column-builder.ts:240-285`). This is the key migration-salvage issue in Better Chat D1: generated SQL lacks defaults for columns that rely on `$defaultFn` [apps/server/src/db/d1/schema/settings.ts:18-24](../apps/server/src/db/d1/schema/settings.ts), [apps/server/src/db/d1/migrations/0000_faithful_morgan_stark.sql:70-83](../apps/server/src/db/d1/migrations/0000_faithful_morgan_stark.sql).
- Use array-returning table extra config for indexes; object-returning config is deprecated (`drizzle-orm/src/sqlite-core/table.ts:88-164`). Both local repos already use arrays for indexes [apps/server/src/db/d1/schema/auth.ts:53-56](../apps/server/src/db/d1/schema/auth.ts), [better-agent/packages/db/src/schema/auth.ts:66-67](../../better-agent/packages/db/src/schema/auth.ts).
- `index(name)` and `uniqueIndex(name)` are separate helpers; `.where(...)` supports partial indexes (`drizzle-orm/src/sqlite-core/indexes.ts:11-80`). Use `uniqueIndex` for business uniqueness, not a non-unique composite index.

## Local schema/migration salvage audit

### Better Agent current state

- `@better-agent/db` exports raw TS source and owns schema/migration generation [better-agent/packages/db/package.json:1-15](../../better-agent/packages/db/package.json).
- The D1 runtime seam is minimal and good: `createDb()` imports env and passes full schema to Drizzle [better-agent/packages/db/src/index.ts:1-6](../../better-agent/packages/db/src/index.ts).
- Auth schema is ahead of Better Chat for timestamp precision: it uses `timestamp_ms` plus SQL create defaults like `cast(unixepoch('subsecond') * 1000 as integer)` [better-agent/packages/db/src/schema/auth.ts:4-16](../../better-agent/packages/db/src/schema/auth.ts).
- Risk: `session.updatedAt` and `account.updatedAt` are `notNull()` with only `$onUpdate` and no SQL default [better-agent/packages/db/src/schema/auth.ts:29-31](../../better-agent/packages/db/src/schema/auth.ts), [better-agent/packages/db/src/schema/auth.ts:60-62](../../better-agent/packages/db/src/schema/auth.ts). Runtime Drizzle inserts may populate them, but generated D1 schema will not protect direct/adapter inserts. Prefer adding the same SQL default used by `createdAt`.
- Better Agent auth relations are already defined and exported [better-agent/packages/db/src/schema/auth.ts:88-105](../../better-agent/packages/db/src/schema/auth.ts), [better-agent/packages/db/src/schema/index.ts:1-9](../../better-agent/packages/db/src/schema/index.ts). Add Thinkspace relations the same way.

### Better Chat D1 salvage value

- Auth schema has useful Better Auth shape and indexes, including `idx_account_provider_account` [apps/server/src/db/d1/schema/auth.ts:30-56](../apps/server/src/db/d1/schema/auth.ts), but it uses seconds-mode timestamps [apps/server/src/db/d1/schema/auth.ts:9-20](../apps/server/src/db/d1/schema/auth.ts). Do not copy as-is over Better Agent's millisecond convention.
- Better Chat settings are useful as requirements inventory, not as a direct schema: product-level model/BYOK, MCP catalog metadata, web search, reasoning effort, and theme may survive [apps/server/src/db/d1/schema/settings.ts:4-24](../apps/server/src/db/d1/schema/settings.ts). `chatWidth` is explicitly chat-specific and should be dropped [docs/salvage-map-better-chat.md:102-104](../docs/salvage-map-better-chat.md).
- Better Chat settings have migration drift: schema default for `reasoningEffort` is `medium` [apps/server/src/db/d1/schema/settings.ts:15](../apps/server/src/db/d1/schema/settings.ts), but the checked-in migration says `low` [apps/server/src/db/d1/migrations/0000_faithful_morgan_stark.sql:70-83](../apps/server/src/db/d1/migrations/0000_faithful_morgan_stark.sql). Treat old migrations as evidence, not source of truth.
- Better Chat usage is quarantined by the salvage map [docs/salvage-map-better-chat.md:75-85](../docs/salvage-map-better-chat.md). Do not block Thinkspace schema on usage accounting.

## Recommended D1 schema practices for Better Agent

1. **Use `timestamp_ms` everywhere in new D1 schema.** It preserves ordering precision and matches Better Agent's existing auth schema. Use a shared SQL expression such as:
   - `sql\`(cast(unixepoch('subsecond') \* 1000 as integer))\`` if accepted by D1's SQLite version; or
   - Drizzle's deprecated `defaultNow()` expression as a compatibility reference: `cast((julianday('now') - 2440587.5)*86400000 as integer)` (`drizzle-orm/src/sqlite-core/columns/integer.ts:120-126`).
2. **Use SQL defaults for `createdAt` and `updatedAt`; use `$onUpdate` only as a runtime convenience.** `$onUpdate` is not migration DDL. A `notNull` timestamp with only `$onUpdate` is fragile for direct writes and external adapters.
3. **Use `text(...).notNull()` plus application/domain validation for enums.** SQLite/Drizzle does not give a first-class enum type for D1. Add `status` text with a default and enforce `active | archived` in the lifecycle module; optionally add a SQL check if the team wants stricter DDL.
4. **Use indexes that match first-slice queries.** For Thinkspaces, optimize `list my active/archived Thinkspaces ordered by updatedAt` and `get by id + ownership`.
5. **Use `uniqueIndex` for business uniqueness.** If provider account identity must be unique, use a unique composite index on `(provider_id, account_id)` instead of only `index(...)`.
6. **Define relations next to schema and pass full schema to `drizzle()`.** Drizzle D1/DO relation metadata is only extracted when `{ schema }` is passed to the driver.
7. **Do not put runtime-local state in D1.** ADR 0002 says D1 stores product-level indexes and authorization metadata; the Thinkspace Agent runtime remains owner of messages, memory changes, tool runs, approvals, and runtime-local state [docs/adr/0002-split-storage-ownership.md:1-5](../docs/adr/0002-split-storage-ownership.md).

## Package seam design

Recommended shape for `@better-agent/db`:

- `src/index.ts`
  - export `createDb(binding?: D1Database)`; default to `env.DB` for app runtime, but accept an explicit binding for tests and Workers entrypoints.
  - export `type Database = DrizzleD1Database<typeof schema>`.
- `src/schema/auth.ts`
  - keep reconciled Better Auth tables.
- `src/schema/thinkspaces.ts`
  - product index only.
- `src/schema/settings.ts`
  - product-level user preferences/catalog/credentials only.
- `src/schema/index.ts`
  - export all tables and relations.
- `src/migrations/`
  - generated SQL only; no hand edits unless documented.

Important seam rule: API/lifecycle modules should depend on `@better-agent/db` tables/types and receive a `Database` instance; routes should not inline Drizzle lifecycle rules. This follows the salvage map's direction that lifecycle invariants should live behind a small, directly testable interface [docs/salvage-map-better-chat.md:126-143](../docs/salvage-map-better-chat.md).

## Proposed Thinkspace product-index schema shape

D1 table: `thinkspaces`.

Minimum fields:

- `id text primary key not null` — stable Thinkspace ID, also usable as the future Durable Object name.
- `owner_user_id text not null references user(id) on delete cascade` — first-slice ownership.
- `goal text not null` — canonical Goal.
- `initial_instructions text` — user-provided setup instructions.
- `configuration_summary text` — deterministic review summary before real Coordinator behavior exists.
- `status text not null default 'active'` — domain-valid values: `active`, `archived`.
- `created_at integer(timestamp_ms) not null default <ms-now>`.
- `updated_at integer(timestamp_ms) not null default <ms-now> .$onUpdate(() => new Date())`.
- `archived_at integer(timestamp_ms)`.
- `selected_skill_ids text not null default '[]'` — placeholder product metadata only.
- `enabled_tool_ids text not null default '[]'` — placeholder; default must be empty.
- `requested_permissions text not null default '[]'` — requested Permission placeholders, not execution records.
- `approval_defaults text not null default '{}'` — policy defaults, not Approval decisions.
- `memory_governance text not null default '{}'` — configuration defaults, not Memory records.

Indexes:

- `idx_thinkspaces_owner_status_updated` on `(owner_user_id, status, updated_at)` for dashboard lists.
- `idx_thinkspaces_owner_created` on `(owner_user_id, created_at)` if creation-order lists are supported.
- Optional `idx_thinkspaces_owner_archived` on `(owner_user_id, archived_at)` if archive views are separate.

Relations:

- `thinkspaceRelations = relations(thinkspaces, ({ one }) => ({ owner: one(user, { fields: [thinkspaces.ownerUserId], references: [user.id] }) }))`.

Keep out of this table:

- messages/transcripts;
- tool runs;
- Memory changes;
- Approval execution records;
- Audit Trail entries;
- source/artifact blobs.

Those exclusions are required by ADR 0002 and the salvage criteria [docs/adr/0002-split-storage-ownership.md:3-5](../docs/adr/0002-split-storage-ownership.md), [docs/salvage-map-better-chat.md:44-55](../docs/salvage-map-better-chat.md).

## Settings schema redesign

Do not port Better Chat `user_settings` directly. Suggested replacement:

### `user_product_settings`

- `user_id text primary key references user(id) on delete cascade`.
- `default_model text` — nullable; a product-level preference, not a Thinkspace enablement grant.
- `reasoning_effort text not null default 'medium'` — if still exposed as a user preference.
- `web_search_enabled integer(boolean) not null default false` — product preference only; still require Thinkspace Permission before live external access.
- `theme text not null default 'system'` — UI preference if needed.
- timestamps with the same `timestamp_ms` convention.

Drop:

- `chat_width` because it preserves chat UI vocabulary [apps/server/src/db/d1/schema/settings.ts:16-17](../apps/server/src/db/d1/schema/settings.ts), [docs/salvage-map-better-chat.md:102-104](../docs/salvage-map-better-chat.md).
- global `enabled_mcp_servers` defaults such as `['context7']`; ADR/salvage guardrails require tools and Skills to be explicitly enabled per Thinkspace and never globally inherited [docs/salvage-map-better-chat.md:37-42](../docs/salvage-map-better-chat.md).

### `user_provider_credentials` or equivalent

- `id text primary key`.
- `user_id text not null references user(id) on delete cascade`.
- `provider_id text not null`.
- `encrypted_api_key text not null` or encrypted JSON payload.
- `label text`.
- `created_at`, `updated_at`.
- unique index on `(user_id, provider_id)` unless multiple keys per provider are intentionally supported.

### `user_mcp_servers` / MCP catalog

Better Chat's `user_mcp_servers` shape is a salvage candidate [apps/server/src/db/d1/schema/settings.ts:27-45](../apps/server/src/db/d1/schema/settings.ts), but redesign semantics:

- `enabled` should mean enabled in the user's catalog/settings UI, **not enabled for every Thinkspace**; consider naming it `catalog_visible` or omit it.
- headers should be encrypted if they can contain secrets.
- per-Thinkspace enablement belongs in Thinkspace configuration/Permission policy, default empty.

## Durable Object SQLite boundaries

- Current Better Chat DO is per-user (`UserDurableObject`) [apps/server/src/db/do/user-durable-object.ts:15-27](../apps/server/src/db/do/user-durable-object.ts) and stores chat conversations/messages [apps/server/src/db/do/schema/chat.ts:3-29](../apps/server/src/db/do/schema/chat.ts). Do not port it.
- Future Better Agent DO should be per Thinkspace Agent. Use `thinkspace.id` as the DO name/key so D1 index and DO identity can rendezvous without a separate mapping unless there is a Cloudflare constraint later.
- Use `drizzle-orm/durable-sqlite` with `{ schema }` and apply bundled migrations in `blockConcurrencyWhile`, like Better Chat already does [apps/server/src/db/do/user-durable-object.ts:27-39](../apps/server/src/db/do/user-durable-object.ts), but with Thinkspace runtime schema.
- Generate DO migrations with `driver: "durable-sqlite"` [apps/server/drizzle.do.config.ts:1-8](../apps/server/drizzle.do.config.ts). Do not plan CLI migrate/studio/push for DO because Drizzle Kit rejects those operations for durable-sqlite.
- DO owns runtime-local messages, memory changes, tool runs, approvals, and audit trail. D1 may duplicate minimal product index fields for navigation/search only when explicitly synchronized.

## Migration workflow recommendations

1. Fix `packages/db/drizzle.config.ts` before applying D1 migrations:
   - keep `dialect: "sqlite"`;
   - add `driver: "d1-http"` only for remote operations;
   - add required `dbCredentials` from env;
   - optionally port Better Chat's local file mode for Alchemy/Miniflare dev [apps/server/drizzle.db.config.ts:1-24](../apps/server/drizzle.db.config.ts).
2. Prefer `generate` + reviewed SQL + `migrate` for shared environments. Avoid `push` except disposable local databases.
3. Regenerate migrations after changing timestamp defaults because `$defaultFn` does not appear in SQL.
4. Review generated SQL for:
   - all `not null` timestamp columns having SQL defaults where desired;
   - expected unique indexes;
   - no chat/conversation tables;
   - no global tool enablement defaults;
   - D1 product tables only.
5. Maintain separate D1 and future DO migration streams. DO migrations must be bundled into the Worker and applied inside the DO runtime.

## Validation commands / acceptance checks

Run in the target Better Agent repo after implementing schema/config changes:

```sh
cd /Users/oscargabriel/Developer/projects/better-agent
bun install
bun run db:generate
bun run check-types
bun run build
```

When a `db:migrate` script/config is added for D1 HTTP:

```sh
cd /Users/oscargabriel/Developer/projects/better-agent/packages/db
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_DATABASE_ID=... CLOUDFLARE_API_TOKEN=... \
  bunx drizzle-kit migrate --config=./drizzle.config.ts
```

For a local Alchemy/Miniflare D1 path, port/verify a dev config equivalent to Better Chat's `DB_STAGE=dev` file URL mode [apps/server/drizzle.db.config.ts:4-15](../apps/server/drizzle.db.config.ts), then run the local migration against a disposable database before staging.

Acceptance criteria for the PRD/schema slice:

- `@better-agent/db` exports auth, settings, and Thinkspace schema from `src/schema/index.ts`.
- `createDb()` passes full schema to `drizzle()` and exposes a typed `Database` alias.
- Generated D1 SQL contains `thinkspaces` and redesigned product settings tables.
- Generated D1 SQL contains no Better Chat `conversations`/`messages` tables.
- Every new timestamp uses one convention (`timestamp_ms`) and generated SQL defaults match that convention.
- Dashboard query path has an owner/status/updated index.
- No global MCP/tool/Skill default enables a Thinkspace by inheritance.
- Direct schema review confirms D1 stores product indexes/authorization metadata only; runtime-local records remain reserved for future DO SQLite.
- `bun run db:generate`, `bun run check-types`, and `bun run build` pass.
- A D1 migration is applied successfully to a disposable dev/staging database before production.

## Source citations

Local project evidence:

- Better Agent DB package/version/scripts: `better-agent/packages/db/package.json:12-27`.
- Better Agent D1 runtime seam: `better-agent/packages/db/src/index.ts:1-6`.
- Better Agent auth timestamps/relations: `better-agent/packages/db/src/schema/auth.ts:4-16`, `:29-31`, `:60-62`, `:88-105`.
- Better Agent incomplete `d1-http` config: `better-agent/packages/db/drizzle.config.ts:8-13`.
- Better Chat D1 runtime/config/scripts: `apps/server/src/db/d1/index.ts:1-8`, `apps/server/drizzle.db.config.ts:1-24`, `apps/server/package.json:14-18`.
- Better Chat settings and migration drift: `apps/server/src/db/d1/schema/settings.ts:4-24`, `apps/server/src/db/d1/migrations/0000_faithful_morgan_stark.sql:70-83`.
- Better Chat DO chat schema/runtime: `apps/server/src/db/do/schema/chat.ts:3-29`, `apps/server/src/db/do/user-durable-object.ts:15-39`.
- ADR storage split: `docs/adr/0002-split-storage-ownership.md:1-5`.
- Salvage map guardrails: `docs/salvage-map-better-chat.md:37-55`, `:93-124`, `:126-163`.

Drizzle source/docs evidence from `drizzle-team/drizzle-orm` latest source:

- D1 exports/driver/session/migrator: `drizzle-orm/src/d1/index.ts:1-2`, `src/d1/driver.ts:33-72`, `src/d1/session.ts:107-145`, `src/d1/migrator.ts:1-47`.
- Drizzle Kit D1 HTTP config/validation/connection: `drizzle-kit/src/index.ts:198-207`, `src/cli/validations/sqlite.ts:11-17,27-32`, `src/cli/connections.ts:1009-1139`.
- Durable SQLite driver/migrator/Kit limits: `drizzle-orm/src/durable-sqlite/driver.ts:24-61`, `src/durable-sqlite/migrator.ts:1-78`, `drizzle-kit/src/cli/validations/sqlite.ts:75-94`, `src/cli/commands/utils.ts:205-216`.
- SQLite timestamp/default behavior: `drizzle-orm/src/sqlite-core/columns/integer.ts:120-158,199-236`, `src/column-builder.ts:240-285`, `src/sqlite-core/dialect.ts:103-128,535-566`.
- SQLite indexes/table config: `drizzle-orm/src/sqlite-core/indexes.ts:11-80`, `src/sqlite-core/table.ts:88-164`.
- Official Drizzle docs consulted: <https://orm.drizzle.team/docs/connect-cloudflare-d1>, <https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit>, <https://orm.drizzle.team/docs/connect-cloudflare-do>, <https://orm.drizzle.team/docs/column-types/sqlite>, <https://orm.drizzle.team/docs/drizzle-kit-migrate>.
